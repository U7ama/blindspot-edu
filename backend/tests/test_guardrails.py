"""
backend/test_guardrails.py

Tests the guardrails layer in backend/ai/guardrails.py and its wiring into
the planning pipeline and the live-session orchestrator:

  1. Deterministic grounding checks (timestamps, quiz integrity, lexical
     overlap) fire on bad items and stay quiet on valid ones.
  2. The LLM grounding judge flags content that passes deterministic checks
     but isn't supported by the transcript, and ignores bogus verdicts.
  3. Retry-with-feedback: an ungrounded first attempt is rejected and the
     regeneration receives the feedback; max_attempts exhaustion filters
     the offending items instead of raising.
  4. Relevance gate: an off-topic question gets a redirect SPEAKING event
     without calling qa.py; an on-topic question flows through normally.
  5. Fail-open: when the relevance classifier itself errors, the question
     is still answered.

All LLM calls are mocked by monkeypatching the module-level
`chat_completion` references (same spirit as the set_tts_engine mock in
test_orchestrator.py) — no API key or network access needed.

Usage:
    python backend/tests/test_guardrails.py
"""

import sys
from pathlib import Path

# Ensure project root is on sys.path for direct runs and package imports.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.schemas.schemas import (
    GapConcept,
    LearningPlan,
    Phase,
    QuizItem,
    SessionCommand,
    SessionEventType,
    TimeRange,
    TranscriptSegment,
)
from backend.app.services.ai import guardrails
from backend.app.services.ai import planning
from backend.app.services.ai import qa
from backend.app.services.ai.guardrails import (
    check_question_relevance,
    validate_gaps,
    validate_plan,
    validate_quizzes,
    with_grounding_retry,
)
from backend.app.services.ai.orchestrator import TeachingSession, set_tts_engine
from backend.app.services.ai.planning import (
    _LLMPhase,
    _LLMPlanResponse,
    _LLMTimeRange,
    generate_plan,
)


# ---------------------------------------------------------------------------
# Sample data factories
# ---------------------------------------------------------------------------

def create_sample_transcript() -> list[TranscriptSegment]:
    return [
        TranscriptSegment(
            lecture_id=1, start=0.0, end=25.0,
            text="Hello everyone, welcome to the lecture on artificial neural networks.",
        ),
        TranscriptSegment(
            lecture_id=1, start=25.0, end=50.0,
            text="We begin with perceptual layers and weights.",
        ),
        TranscriptSegment(
            lecture_id=1, start=50.0, end=90.0,
            text="Non-linear activation functions like ReLU allow us to learn complex patterns.",
        ),
    ]


def create_valid_plan() -> LearningPlan:
    return LearningPlan(
        lecture_id=1,
        phases=[
            Phase(
                order=0,
                title="Introduction to Neural Networks",
                teaching_script="Welcome! Today we discuss artificial neural networks, perceptual layers and weights.",
                source_timestamps=[TimeRange(start=0.0, end=50.0)],
            ),
            Phase(
                order=1,
                title="Activation Functions",
                teaching_script="Non-linear activation functions like ReLU allow networks to learn complex patterns.",
                source_timestamps=[TimeRange(start=50.0, end=90.0)],
            ),
        ],
    )


def create_valid_quizzes() -> list[QuizItem]:
    return [
        QuizItem(
            lecture_id=1,
            question="Why are non-linear activation functions like ReLU essential in neural networks?",
            options=[
                "They allow networks to learn complex patterns",
                "They remove all weights from perceptual layers",
                "They speed up the lecture audio",
                "They are strictly optional for patterns",
            ],
            correct_answer="They allow networks to learn complex patterns",
            source_timestamp=TimeRange(start=50.0, end=90.0),
        )
    ]


def create_valid_gaps() -> list[GapConcept]:
    return [
        GapConcept(
            lecture_id=1,
            name="Weights initialization",
            why_its_a_gap="The lecture mentions weights in perceptual layers but never explains how they are initialized.",
            related_phase_order=0,
            source_timestamp=TimeRange(start=25.0, end=50.0),
        )
    ]


# ---------------------------------------------------------------------------
# Mock chat_completion helpers
# ---------------------------------------------------------------------------

def accepting_judge(system_prompt=None, user_prompt=None, response_model=None, **kwargs):
    """Grounding-judge mock that accepts every item (empty verdict list)."""
    return response_model(verdicts=[])


def bomb(*args, **kwargs):
    """Fails any test that unexpectedly reaches the LLM."""
    raise AssertionError("chat_completion should not have been called here")


# ---------------------------------------------------------------------------
# Test 1: deterministic grounding checks
# ---------------------------------------------------------------------------

def test_deterministic_checks():
    print("\n--- Step 1: Deterministic Grounding Checks ---")
    transcript = create_sample_transcript()
    guardrails.chat_completion = accepting_judge

    # 1a. Phase citing a timestamp outside the transcript
    bad_ts_plan = LearningPlan(
        lecture_id=1,
        phases=[
            Phase(
                order=0,
                title="Activation Functions",
                teaching_script="Non-linear activation functions like ReLU let networks learn complex patterns.",
                source_timestamps=[TimeRange(start=500.0, end=600.0)],
            ),
        ],
    )
    issues = validate_plan(bad_ts_plan, transcript)
    assert any(i.code == "timestamp_out_of_range" for i in issues), \
        f"Expected timestamp_out_of_range, got: {[i.code for i in issues]}"
    print("[OK] Out-of-range source timestamp flagged")

    # 1b. Quiz whose correct_answer is not one of the options
    bad_quiz = [
        QuizItem(
            lecture_id=1,
            question="Why are non-linear activation functions essential?",
            options=[
                "They allow networks to learn complex patterns",
                "They remove all weights",
                "They speed up audio",
                "None of the above",
            ],
            correct_answer="Because the lecture said so",
            source_timestamp=TimeRange(start=50.0, end=90.0),
        )
    ]
    issues = validate_quizzes(bad_quiz, transcript)
    assert any(i.code == "answer_not_in_options" for i in issues), \
        f"Expected answer_not_in_options, got: {[i.code for i in issues]}"
    print("[OK] correct_answer missing from options flagged")

    # 1c. Wholesale hallucinated phase (zero lexical overlap)
    hallucinated_plan = LearningPlan(
        lecture_id=1,
        phases=[
            Phase(
                order=0,
                title="Quantum Chromodynamics",
                teaching_script="Quarks and gluons interact through color confinement inside hadrons.",
                source_timestamps=[TimeRange(start=0.0, end=25.0)],
            ),
        ],
    )
    issues = validate_plan(hallucinated_plan, transcript)
    assert any(i.code == "ungrounded_content" for i in issues), \
        f"Expected ungrounded_content, got: {[i.code for i in issues]}"
    print("[OK] Hallucinated phase flagged by lexical overlap")

    # 1d. Hallucinated gap concept the lecture never mentions
    hallucinated_gap = [
        GapConcept(
            lecture_id=1,
            name="Photosynthesis",
            why_its_a_gap="Chlorophyll absorption spectra were never explained.",
            source_timestamp=TimeRange(start=0.0, end=25.0),
        )
    ]
    issues = validate_gaps(hallucinated_gap, transcript)
    assert any(i.code == "ungrounded_content" for i in issues), \
        f"Expected ungrounded_content, got: {[i.code for i in issues]}"
    print("[OK] Hallucinated gap concept flagged by lexical overlap")

    # 1e. Valid items produce no issues at all
    assert validate_plan(create_valid_plan(), transcript) == []
    assert validate_quizzes(create_valid_quizzes(), transcript) == []
    assert validate_gaps(create_valid_gaps(), transcript) == []
    print("[OK] Valid plan/quizzes/gaps produce zero issues")


# ---------------------------------------------------------------------------
# Test 2: LLM grounding judge behavior
# ---------------------------------------------------------------------------

def test_llm_judge():
    print("\n--- Step 2: LLM Grounding Judge ---")
    transcript = create_sample_transcript()
    plan = create_valid_plan()

    # 2a. Judge rejects an item that passed the deterministic checks
    def rejecting_judge(system_prompt=None, user_prompt=None, response_model=None, **kwargs):
        return response_model(verdicts=[
            {"item_index": 0, "grounded": False, "reason": "cited excerpt does not support the claim"},
            {"item_index": 1, "grounded": True, "reason": "supported"},
        ])

    guardrails.chat_completion = rejecting_judge
    issues = validate_plan(plan, transcript)
    assert len(issues) == 1 and issues[0].item_index == 0 \
        and issues[0].code == "ungrounded_content", f"Unexpected issues: {issues}"
    print("[OK] Judge verdict flags the rejected phase only")

    # 2b. Bogus verdict indices are ignored; items without verdicts pass
    def confused_judge(system_prompt=None, user_prompt=None, response_model=None, **kwargs):
        return response_model(verdicts=[
            {"item_index": 99, "grounded": False, "reason": "index does not exist"},
        ])

    guardrails.chat_completion = confused_judge
    assert validate_plan(plan, transcript) == []
    print("[OK] Verdicts with unknown indices are ignored (fail-open)")

    guardrails.chat_completion = accepting_judge


# ---------------------------------------------------------------------------
# Test 3: retry-with-feedback loop
# ---------------------------------------------------------------------------

HALLUCINATED_LLM_PHASE = _LLMPhase(
    order=0,
    title="Quantum Chromodynamics",
    teaching_script="Quarks and gluons interact through color confinement.",
    source_timestamps=[_LLMTimeRange(start=0.0, end=25.0)],
)
GROUNDED_LLM_PHASE = _LLMPhase(
    order=0,
    title="Neural Network Basics",
    teaching_script="Artificial neural networks use perceptual layers and weights to learn.",
    source_timestamps=[_LLMTimeRange(start=0.0, end=50.0)],
)


def test_retry_loop():
    print("\n--- Step 3: Retry-With-Feedback Loop ---")
    transcript = create_sample_transcript()
    generation_prompts: list[str] = []

    def scripted_llm(system_prompt=None, user_prompt=None, response_model=None, **kwargs):
        if response_model is _LLMPlanResponse:
            generation_prompts.append(user_prompt)
            if len(generation_prompts) == 1:
                return _LLMPlanResponse(phases=[HALLUCINATED_LLM_PHASE])
            return _LLMPlanResponse(phases=[GROUNDED_LLM_PHASE])
        # Grounding judge: accept whatever survives the deterministic checks
        return response_model(verdicts=[])

    planning.chat_completion = scripted_llm
    guardrails.chat_completion = scripted_llm

    plan, report = with_grounding_retry(
        generate_fn=lambda fb: generate_plan(transcript, lecture_id=1, feedback=fb),
        validate_fn=lambda p: validate_plan(p, transcript),
        step_name="plan",
    )

    assert len(generation_prompts) == 2, f"Expected 2 attempts, got {len(generation_prompts)}"
    assert report["attempts"] == 2 and report["removed"] == 0, f"Bad report: {report}"
    assert "failed grounding validation" not in generation_prompts[0]
    assert "failed grounding validation" in generation_prompts[1], \
        "Retry prompt must carry the validation feedback"
    assert plan.phases[0].title == "Neural Network Basics"
    print("[OK] Ungrounded first attempt rejected; retry received feedback and succeeded")


def test_retry_exhaustion_filters():
    print("\n--- Step 4: Retry Exhaustion Filters Ungrounded Items ---")
    transcript = create_sample_transcript()

    def always_bad(system_prompt=None, user_prompt=None, response_model=None, **kwargs):
        if response_model is _LLMPlanResponse:
            return _LLMPlanResponse(phases=[HALLUCINATED_LLM_PHASE])
        return response_model(verdicts=[])

    planning.chat_completion = always_bad
    guardrails.chat_completion = always_bad

    plan, report = with_grounding_retry(
        generate_fn=lambda fb: generate_plan(transcript, lecture_id=1, feedback=fb),
        validate_fn=lambda p: validate_plan(p, transcript),
        step_name="plan",
    )

    assert report["removed"] == 1, f"Expected 1 removed item, got: {report}"
    assert len(plan.phases) == 0, "Ungrounded phase should have been filtered out"
    assert report["issues"], "Report should retain the final issue list"
    print("[OK] Persistent hallucination filtered out without raising")


# ---------------------------------------------------------------------------
# Test 4 + 5: relevance gate in the live session
# ---------------------------------------------------------------------------

def test_relevance_gate():
    print("\n--- Step 5: Live-Session Relevance Gate ---")
    transcript = create_sample_transcript()

    def mock_tts(text: str, voice=None) -> str:
        return f"https://mock-storage.blindspot.ai/audio/{abs(hash(text)) % 10000}.mp3"

    set_tts_engine(mock_tts)

    qa_calls = {"n": 0}

    def qa_mock(system_prompt=None, user_prompt=None, response_model=None, **kwargs):
        qa_calls["n"] += 1
        return response_model(
            explanation="ReLU introduces non-linearity so networks can learn complex patterns.",
            key_takeaway="ReLU enables non-linear learning.",
        )

    qa.chat_completion = qa_mock

    session = TeachingSession(
        session_id="guardrails-test-001",
        lecture_id=1,
        plan=create_valid_plan(),
        transcript_segments=transcript,
    )

    # 4a. Off-topic question -> redirect SPEAKING, qa.py never called
    def off_topic_classifier(system_prompt=None, user_prompt=None, response_model=None, **kwargs):
        return response_model(
            is_relevant=False,
            reason="Pizza is unrelated to neural networks.",
            redirect_message="That's a fun question, but let's stay with neural networks for now!",
        )

    guardrails.chat_completion = off_topic_classifier
    events = session.handle_command(SessionCommand(
        session_id="guardrails-test-001",
        command="What's the best pizza in Naples?",
    ))
    assert events[0].type == SessionEventType.SPEAKING
    assert events[0].payload.get("off_topic") is True
    assert "neural networks" in events[0].payload["text"].lower()
    assert events[0].payload.get("in_response_to") == "What's the best pizza in Naples?"
    assert events[1].type == SessionEventType.AWAITING_COMMAND
    assert qa_calls["n"] == 0, "qa.py must not answer off-topic questions"
    print("[OK] Off-topic question deflected with redirect, qa.py untouched")

    # 4b. Clearly on-topic question -> heuristic fast path (no LLM call at all)
    guardrails.chat_completion = bomb
    events = session.handle_command(SessionCommand(
        session_id="guardrails-test-001",
        command="What does ReLU do in activation functions?",
    ))
    assert events[0].type == SessionEventType.SPEAKING
    assert events[0].payload.get("off_topic") is not True
    assert qa_calls["n"] == 1, "On-topic question should reach qa.py exactly once"
    print("[OK] On-topic question answered normally via heuristic fast path")

    # 4c. Relevance classifier errors -> fail open, question still answered
    def broken_classifier(*args, **kwargs):
        raise RuntimeError("LLM provider down")

    guardrails.chat_completion = broken_classifier
    verdict = check_question_relevance(
        "How do magnets work?", session.current_phase, transcript
    )
    assert verdict.is_relevant is True, "Classifier failure must fail open"

    events = session.handle_command(SessionCommand(
        session_id="guardrails-test-001",
        command="How do magnets work?",
    ))
    assert events[0].type == SessionEventType.SPEAKING
    assert events[0].payload.get("off_topic") is not True
    assert qa_calls["n"] == 2, "Fail-open should still answer the question"
    print("[OK] Broken relevance classifier fails open; question still answered")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_guardrails_tests():
    print("==================================================")
    print("Running Guardrails Layer Tests")
    print("==================================================")

    test_deterministic_checks()
    test_llm_judge()
    test_retry_loop()
    test_retry_exhaustion_filters()
    test_relevance_gate()

    print("\n==================================================")
    print("All Guardrails Tests Passed Successfully! [PASS]")
    print("==================================================")


if __name__ == "__main__":
    run_guardrails_tests()
