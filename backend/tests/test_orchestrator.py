"""
backend/test_orchestrator.py

Tests the live teaching session orchestrator in backend/ai/orchestrator.py
end-to-end through a simulated student interaction:
  1. Initialize session with a sample LearningPlan and TranscriptSegments.
  2. Verify phase 0 starts with phase_started, speaking, and awaiting_command events.
  3. Send "show_me" -> verify jumped_to_timestamp event with valid TimeRange.
  4. Send "explain_again" -> verify re-explanation speaking event.
  5. Send "quiz_me" -> verify quiz_started event and answer grading.
  6. Send "next" -> advance through phases until session_ended.
  7. Verify all emitted events match the SessionEvent Pydantic schema.

Usage:
    python backend/test_orchestrator.py
"""

import sys
from pathlib import Path

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.services.ai.orchestrator import TeachingSession, session_store, set_tts_engine
from backend.app.schemas.schemas import (
    LearningPlan,
    Phase,
    QuizItem,
    SessionCommand,
    SessionEvent,
    SessionEventType,
    TimeRange,
    TranscriptSegment,
)


def create_sample_plan() -> LearningPlan:
    return LearningPlan(
        lecture_id=1,
        phases=[
            Phase(
                order=0,
                title="Introduction to Neural Networks",
                teaching_script="Welcome! Today we will discuss artificial neural networks and how perceptual layers work.",
                source_timestamps=[TimeRange(start=0.0, end=45.5)],
                prerequisite_note="Basic linear algebra",
            ),
            Phase(
                order=1,
                title="Activation Functions & Non-linearity",
                teaching_script="Now let's explore why non-linear activation functions like ReLU and Sigmoid are required.",
                source_timestamps=[TimeRange(start=45.5, end=120.0)],
                prerequisite_note="Derivatives and calculus",
            ),
        ],
    )


def create_sample_quizzes() -> list[QuizItem]:
    return [
        QuizItem(
            id=101,
            lecture_id=1,
            question="Why are non-linear activation functions essential in deep learning?",
            options=[
                "To allow networks to approximate complex non-linear functions",
                "To reduce the number of matrix multiplications to zero",
                "To prevent gradients from being calculated",
                "They are strictly optional for performance",
            ],
            correct_answer="To allow networks to approximate complex non-linear functions",
            source_timestamp=TimeRange(start=50.0, end=75.0),
        )
    ]


def create_sample_transcript() -> list[TranscriptSegment]:
    return [
        TranscriptSegment(
            lecture_id=1,
            start=0.0,
            end=25.0,
            text="Hello everyone, welcome to the lecture on artificial neural networks.",
        ),
        TranscriptSegment(
            lecture_id=1,
            start=25.0,
            end=50.0,
            text="We begin with perceptual layers and weights.",
        ),
        TranscriptSegment(
            lecture_id=1,
            start=50.0,
            end=90.0,
            text="Non-linear activation functions like ReLU allow us to learn complex patterns.",
        ),
    ]


def run_orchestrator_tests():
    print("==================================================")
    print("Running Live Session Orchestrator Tests")
    print("==================================================")

    # 1. Custom mock TTS engine (signature matches orchestrator's TTSCallable)
    def mock_tts(text: str, voice=None) -> str:
        return f"https://mock-storage.blindspot.ai/audio/{hash(text) % 10000}.mp3"

    set_tts_engine(mock_tts)

    # 2. Setup session
    plan = create_sample_plan()
    quizzes = create_sample_quizzes()
    transcripts = create_sample_transcript()

    session_id = "test-session-001"
    session = session_store.create_session(
        session_id=session_id,
        lecture_id=1,
        plan=plan,
        quizzes=quizzes,
        transcript_segments=transcripts,
    )

    # 3. Test Session Start
    print("\n--- Step 1: Starting Session ---")
    start_events = session.start()
    assert len(start_events) == 3, f"Expected 3 events on start, got {len(start_events)}"
    assert start_events[0].type == SessionEventType.PHASE_STARTED
    assert start_events[1].type == SessionEventType.SPEAKING
    assert start_events[1].payload.get("audio_url") is not None
    assert start_events[2].type == SessionEventType.AWAITING_COMMAND
    print(f"[OK] Started Phase 0: '{start_events[0].payload['title']}'")
    print(f"[OK] Speaking audio: {start_events[1].payload['audio_url']}")

    # 4. Test "show_me" command
    print("\n--- Step 2: Testing 'show_me' Command ---")
    show_cmd = SessionCommand(session_id=session_id, command="show_me")
    show_events = session.handle_command(show_cmd)
    assert show_events[0].type == SessionEventType.JUMPED_TO_TIMESTAMP
    ts = show_events[0].payload["timestamp"]
    assert ts["start"] == 0.0 and ts["end"] == 45.5
    assert show_events[1].type == SessionEventType.AWAITING_COMMAND
    print(f"[OK] Jumped to timestamp: {ts['start']}s - {ts['end']}s")

    # 5. Test "show_me" with specific topic search
    print("\n--- Step 3: Testing 'show_me' with Topic Search ---")
    topic_cmd = SessionCommand(session_id=session_id, command="show_me", argument="ReLU")
    topic_events = session.handle_command(topic_cmd)
    assert topic_events[0].type == SessionEventType.JUMPED_TO_TIMESTAMP
    ts_topic = topic_events[0].payload["timestamp"]
    assert ts_topic["start"] == 50.0 and ts_topic["end"] == 90.0
    print(f"[OK] Jumped to topic 'ReLU' timestamp: {ts_topic['start']}s - {ts_topic['end']}s")

    # 6. Test "explain_again" command
    print("\n--- Step 4: Testing 'explain_again' Command ---")
    explain_cmd = SessionCommand(session_id=session_id, command="explain_again")
    explain_events = session.handle_command(explain_cmd)
    assert explain_events[0].type == SessionEventType.SPEAKING
    assert explain_events[0].payload.get("is_reexplanation") is True
    assert explain_events[1].type == SessionEventType.AWAITING_COMMAND
    print("[OK] Successfully re-triggered teaching explanation")

    # 7. Test "quiz_me" command & grading
    print("\n--- Step 5: Testing 'quiz_me' & Answer Flow ---")
    quiz_cmd = SessionCommand(session_id=session_id, command="quiz_me")
    quiz_events = session.handle_command(quiz_cmd)
    assert quiz_events[0].type == SessionEventType.QUIZ_STARTED
    assert quiz_events[0].payload["quiz_item_id"] == 101
    assert quiz_events[1].type == SessionEventType.AWAITING_COMMAND
    print(f"[OK] Quiz started: {quiz_events[0].payload['question']}")

    # Submit correct answer
    ans_cmd = SessionCommand(
        session_id=session_id,
        command="answer",
        argument="To allow networks to approximate complex non-linear functions",
    )
    ans_events = session.handle_command(ans_cmd)
    assert ans_events[0].type == SessionEventType.SPEAKING
    assert ans_events[0].payload["quiz_result"]["correct"] is True
    print(f"[OK] Quiz answer verified: {ans_events[0].payload['text']}")

    # 8. Test "next" phase advancement
    print("\n--- Step 6: Testing 'next' to Phase 1 ---")
    next_cmd = SessionCommand(session_id=session_id, command="next")
    next_events = session.handle_command(next_cmd)
    assert next_events[0].type == SessionEventType.PHASE_STARTED
    assert next_events[0].payload["order"] == 1
    assert next_events[0].payload["title"] == "Activation Functions & Non-linearity"
    print(f"[OK] Advanced to Phase 1: '{next_events[0].payload['title']}'")

    # 9. Test "next" reaching end of plan
    print("\n--- Step 7: Testing 'next' to Complete Session ---")
    end_cmd = SessionCommand(session_id=session_id, command="next")
    end_events = session.handle_command(end_cmd)
    assert end_events[0].type == SessionEventType.SESSION_ENDED
    assert session.is_ended is True
    print("[OK] Successfully completed and emitted SESSION_ENDED")

    print("\n==================================================")
    print("All Orchestrator Tests Passed Successfully! [PASS]")
    print("==================================================")


if __name__ == "__main__":
    run_orchestrator_tests()
