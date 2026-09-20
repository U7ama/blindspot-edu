"""
backend/ai/orchestrator.py


The live interactive teaching session orchestrator for Blindspot Edu.
This module implements the runtime dialogue state machine that manages live
student sessions over WebSocket, driving:

    1. Session lifecycle: initialize session, load LearningPlan, track current phase.
    2. Teaching delivery: emit phase_started, trigger TTS speak, emit speaking & awaiting_command.
    3. Command dispatching:
       - "next"           -> advance phase or trigger session_ended
       - "explain_again"  -> re-teach current phase
       - "show_me"        -> retrieve source timestamp receipts & emit jumped_to_timestamp
       - "quiz_me"        -> emit quiz_started, handle answers, grade
       - Free questions   -> answer student questions using current phase context
    4. Swappable TTS hook: seamlessly calls backend/ai/tts.py when available,
       with graceful fallback.

Conforms strictly to backend/schemas.py event shapes (SessionEvent, SessionCommand,
SessionEventType, LearningPlan, Phase, TimeRange).
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional

# Ensure project root is on sys.path for direct runs and package imports
_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.schemas.schemas import (
    LearningPlan,
    Phase,
    QuizItem,
    QuizResult,
    SessionCommand,
    SessionEvent,
    SessionEventType,
    TimeRange,
    TranscriptSegment,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TTS Hook (Swappable Adapter)
# ---------------------------------------------------------------------------
# tts.py will be developed in a subsequent step. When tts.py is created,
# speak(text) will produce audio (e.g. an audio URL or path).
# Until then, or as a fallback, we provide a default mock/passthrough.

TTSCallable = Callable[..., Optional[str]]


def _default_tts_speak(text: str, voice: Optional[str] = None) -> Optional[str]:
    """Default fallback TTS function if backend/ai/tts.py is not yet ready."""
    try:
        from backend.app.services.ai.tts import speak as external_speak
        return external_speak(text, voice=voice)
    except ImportError:
        logger.debug("backend.ai.tts not found; running in text-only mode.")
        return None
    except Exception as e:
        logger.warning("Error invoking TTS speak: %s", e)
        return None


_current_tts_engine: TTSCallable = _default_tts_speak


def set_tts_engine(engine: TTSCallable) -> None:
    """Allows setting or mocking the TTS engine for testing or custom voice models."""
    global _current_tts_engine
    _current_tts_engine = engine


# ---------------------------------------------------------------------------
# Student Q&A Hook (Delegates to backend/ai/qa.py)
# ---------------------------------------------------------------------------

def _answer_free_question(
    question: str,
    current_phase: Optional[Phase],
    transcript_segments: Optional[List[TranscriptSegment]] = None,
) -> str:
    """Answers a student's question in the context of the current phase.
    Delegates to backend.ai.qa for a comprehensive, pedagogical response.
    """
    from backend.app.services.ai.qa import answer_phase_question
    return answer_phase_question(
        question=question,
        current_phase=current_phase,
        transcript_segments=transcript_segments,
    )


# ---------------------------------------------------------------------------
# TeachingSession State Machine
# ---------------------------------------------------------------------------

class TeachingSession:
    """Manages the dialogue state machine for a single live teaching session."""

    def __init__(
        self,
        session_id: str,
        lecture_id: int,
        plan: LearningPlan,
        quizzes: Optional[List[QuizItem]] = None,
        transcript_segments: Optional[List[TranscriptSegment]] = None,
        voice: Optional[str] = None,
        text_language: Optional[str] = None,
    ) -> None:
        self.session_id = session_id
        self.lecture_id = lecture_id
        self.plan = plan
        self.quizzes: List[QuizItem] = quizzes or []
        self.transcript_segments: List[TranscriptSegment] = transcript_segments or []
        self.voice: Optional[str] = voice

        from backend.app.services.ai.tts import get_language_for_voice
        self.voice_language: str = get_language_for_voice(voice)
        self.text_language: str = text_language or "English"

        self.current_phase_index: int = 0
        self.is_ended: bool = False
        self.active_quiz_item: Optional[QuizItem] = None
        self.next_quiz_index: int = 0
        self.history: List[dict] = []

    @property
    def language(self) -> str:
        """Alias for voice_language for backward compatibility."""
        return self.voice_language

    @property
    def current_phase(self) -> Optional[Phase]:
        if 0 <= self.current_phase_index < len(self.plan.phases):
            return self.plan.phases[self.current_phase_index]
        return None

    def _emit(self, event_type: SessionEventType, payload: Optional[dict] = None) -> SessionEvent:
        """Helper to create and record a SessionEvent."""
        phase_order = self.current_phase.order if self.current_phase else None
        event = SessionEvent(
            type=event_type,
            lecture_id=self.lecture_id,
            session_id=self.session_id,
            phase_order=phase_order,
            payload=payload,
        )
        self.history.append({"type": "event", "event": event.model_dump()})
        return event

    def set_voice(self, voice_id: str) -> List[SessionEvent]:
        """Silently changes the active voice model & spoken voice language for this session."""
        clean_voice = (voice_id or "").strip()
        if clean_voice:
            self.voice = clean_voice
            from backend.app.services.ai.tts import get_language_for_voice
            self.voice_language = get_language_for_voice(clean_voice)

        return [
            self._emit(
                SessionEventType.AWAITING_COMMAND,
                {
                    "voice": self.voice,
                    "voice_language": self.voice_language,
                    "text_language": self.text_language,
                    "status": "voice_updated",
                },
            )
        ]

    def set_text_language(self, language: str) -> List[SessionEvent]:
        """Silently changes the on-screen text language for this session."""
        clean_lang = (language or "").strip()
        if clean_lang:
            self.text_language = clean_lang

        return [
            self._emit(
                SessionEventType.AWAITING_COMMAND,
                {
                    "voice": self.voice,
                    "voice_language": self.voice_language,
                    "text_language": self.text_language,
                    "status": "text_language_updated",
                },
            )
        ]

    def _prepare_speech(self, text: str) -> tuple[str, Optional[str]]:
        """Prepares on-screen dialogue text in self.text_language and
        synthesizes voice audio in self.voice_language with self.voice.
        Returns (dialogue_text, audio_url).
        """
        from backend.app.services.ai.translation import translate_text

        # 1. Translate for on-screen reading
        dialogue_text = (
            translate_text(text, self.text_language)
            if self.text_language and "english" not in self.text_language.lower()
            else text
        )

        # 2. Translate for spoken voice audio
        audio_text = (
            translate_text(text, self.voice_language)
            if self.voice_language and "english" not in self.voice_language.lower()
            else text
        )

        audio_url = _current_tts_engine(audio_text, voice=self.voice)
        return dialogue_text, audio_url

    def start(self) -> List[SessionEvent]:
        """Starts the session by teaching the first phase."""
        if not self.plan.phases:
            self.is_ended = True
            return [self._emit(SessionEventType.SESSION_ENDED, {"reason": "Plan has no phases"})]

        # Only reset for fresh/exhausted sessions — a reused in-memory session
        # resumes at its current phase instead of restarting from the top.
        if self.current_phase_index >= len(self.plan.phases):
            self.current_phase_index = 0
        self.is_ended = False
        return self._teach_current_phase()

    def _teach_current_phase(self) -> List[SessionEvent]:
        """Emits phase_started, translates & synthesizes speech, and awaits command."""
        phase = self.current_phase
        if not phase:
            self.is_ended = True
            return [self._emit(SessionEventType.SESSION_ENDED)]

        events: List[SessionEvent] = []

        # 1. Emit phase_started
        phase_payload = {
            "title": phase.title,
            "order": phase.order,
            "prerequisite_note": phase.prerequisite_note,
            "source_timestamps": [t.model_dump() for t in phase.source_timestamps],
        }
        events.append(self._emit(SessionEventType.PHASE_STARTED, phase_payload))

        # 2. TTS synthesis & emit speaking (with native translations)
        spoken_text, audio_url = self._prepare_speech(phase.teaching_script)
        speaking_payload = {
            "text": spoken_text,
            "audio_url": audio_url,
            "text_language": self.text_language,
            "voice_language": self.voice_language,
        }
        events.append(self._emit(SessionEventType.SPEAKING, speaking_payload))

        # 3. Emit awaiting_command
        events.append(self._emit(SessionEventType.AWAITING_COMMAND))

        return events

    def handle_command(self, cmd: SessionCommand) -> List[SessionEvent]:
        """Processes an incoming command from the student."""
        self.history.append({"type": "command", "command": cmd.model_dump()})

        if self.is_ended:
            return [self._emit(SessionEventType.SESSION_ENDED, {"message": "Session has already ended."})]

        raw_cmd = (cmd.command or "").strip().lower()

        # Handle answer submission if currently in an active quiz
        if self.active_quiz_item and raw_cmd in ("answer", "submit_answer"):
            selected = cmd.argument or ""
            return self.handle_quiz_answer(selected)

        # Standard command dispatch
        if raw_cmd == "next":
            return self.handle_next()
        elif raw_cmd in ("explain_again", "repeat", "explain again"):
            return self.handle_explain_again()
        elif raw_cmd in ("show_me", "show me", "receipt", "source", "show me where you learned that"):
            return self.handle_show_me(cmd.argument)
        elif raw_cmd in ("quiz_me", "quiz", "quiz me"):
            return self.handle_quiz_me()
        elif raw_cmd in ("set_voice", "change_voice", "voice"):
            return self.set_voice(cmd.argument or "")
        elif raw_cmd in ("set_text_language", "set_language", "text_language", "language"):
            return self.set_text_language(cmd.argument or "English")
        else:
            # Free question or unrecognized command
            return self.handle_question(cmd.command)

    def handle_next(self) -> List[SessionEvent]:
        """Advances to the next teaching phase, or ends the session if done."""
        self.active_quiz_item = None
        next_index = self.current_phase_index + 1

        if next_index < len(self.plan.phases):
            self.current_phase_index = next_index
            return self._teach_current_phase()
        else:
            self.is_ended = True
            return [self._emit(SessionEventType.SESSION_ENDED, {"message": "All phases completed."})]

    def handle_explain_again(self) -> List[SessionEvent]:
        """Re-teaches the current phase's script."""
        self.active_quiz_item = None
        phase = self.current_phase
        if not phase:
            return [self._emit(SessionEventType.SESSION_ENDED)]

        events: List[SessionEvent] = []
        spoken_text, audio_url = self._prepare_speech(phase.teaching_script)
        speaking_payload = {
            "text": spoken_text,
            "audio_url": audio_url,
            "is_reexplanation": True,
            "text_language": self.text_language,
            "voice_language": self.voice_language,
        }
        events.append(self._emit(SessionEventType.SPEAKING, speaking_payload))
        events.append(self._emit(SessionEventType.AWAITING_COMMAND))
        return events

    def handle_show_me(self, topic: Optional[str] = None) -> List[SessionEvent]:
        """Finds the source timestamp in the original audio and emits jumped_to_timestamp."""
        phase = self.current_phase
        target_timestamp: Optional[TimeRange] = None

        # 1. If topic is provided and transcript segments exist, look for best match
        if topic and self.transcript_segments:
            topic_lower = topic.lower()
            for seg in self.transcript_segments:
                if topic_lower in seg.text.lower():
                    target_timestamp = TimeRange(start=seg.start, end=seg.end)
                    break

        # 2. Otherwise default to the current phase's source timestamps
        if not target_timestamp and phase and phase.source_timestamps:
            target_timestamp = phase.source_timestamps[0]

        # 3. Fallback timestamp if none found
        if not target_timestamp:
            return [self._emit(SessionEventType.SOURCE_UNAVAILABLE, {"message": "No supporting excerpt found."})]

        events: List[SessionEvent] = []
        events.append(
            self._emit(
                SessionEventType.JUMPED_TO_TIMESTAMP,
                {
                    "timestamp": target_timestamp.model_dump(),
                    "topic": topic or (phase.title if phase else None),
                },
            )
        )
        events.append(self._emit(SessionEventType.AWAITING_COMMAND))
        return events

    def handle_quiz_me(self) -> List[SessionEvent]:
        """Triggers a quiz item for the student."""
        quiz: Optional[QuizItem] = None

        if self.quizzes:
            quiz = self.quizzes[self.next_quiz_index % len(self.quizzes)]
            self.next_quiz_index += 1

        if not quiz:
            phase_title = self.current_phase.title if self.current_phase else "the lecture"
            quiz = QuizItem(
                id=1,
                lecture_id=self.lecture_id,
                question=f"What is the primary concept covered in {phase_title}?",
                options=[
                    f"Core principles of {phase_title}",
                    "Unrelated background history",
                    "A completely different topic",
                    "None of the above",
                ],
                correct_answer=f"Core principles of {phase_title}",
                source_timestamp=(
                    self.current_phase.source_timestamps[0]
                    if self.current_phase and self.current_phase.source_timestamps
                    else None
                ),
            )

        self.active_quiz_item = quiz

        events: List[SessionEvent] = []
        events.append(
            self._emit(
                SessionEventType.QUIZ_STARTED,
                {
                    "quiz_item_id": quiz.id,
                    "question": quiz.question,
                    "options": quiz.options,
                    "source_timestamp": quiz.source_timestamp.model_dump() if quiz.source_timestamp else None,
                },
            )
        )
        events.append(self._emit(SessionEventType.AWAITING_COMMAND, {"awaiting": "quiz_answer"}))
        return events

    def handle_quiz_answer(self, selected_answer: str) -> List[SessionEvent]:
        """Grades the student's quiz answer and resumes normal flow."""
        quiz = self.active_quiz_item
        if not quiz:
            return [self._emit(SessionEventType.AWAITING_COMMAND)]

        is_correct = selected_answer.strip().lower() == quiz.correct_answer.strip().lower()
        self.active_quiz_item = None

        result = QuizResult(
            quiz_item_id=quiz.id or 0,
            session_id=self.session_id,
            selected_answer=selected_answer,
            correct=is_correct,
        )

        feedback_text = (
            "That's correct! Great job."
            if is_correct
            else f"Not quite. The correct answer was: {quiz.correct_answer}."
        )

        spoken_text, audio_url = self._prepare_speech(feedback_text)

        events: List[SessionEvent] = []
        events.append(
            self._emit(
                SessionEventType.SPEAKING,
                {
                    "text": spoken_text,
                    "audio_url": audio_url,
                    "quiz_result": result.model_dump(),
                    "text_language": self.text_language,
                    "voice_language": self.voice_language,
                },
            )
        )
        events.append(self._emit(SessionEventType.AWAITING_COMMAND))
        return events

    def handle_question(self, question: str) -> List[SessionEvent]:
        """Answers a free-form student question using the current phase context.

        The question first passes through the guardrails relevance check:
        off-topic questions get a warm redirect back to the lecture instead
        of a full qa.py answer, so unrelated chatter is never treated as
        lecture content.
        """
        from backend.app.services.ai.guardrails import check_question_relevance
        verdict = check_question_relevance(
            question=question,
            current_phase=self.current_phase,
            transcript_segments=self.transcript_segments,
        )

        if not verdict.is_relevant:
            redirect_text = verdict.redirect_message or (
                "That's a bit outside what this lecture covers. Let's get back to "
                + (self.current_phase.title if self.current_phase else "the lesson")
                + "."
            )
            spoken_text, audio_url = self._prepare_speech(redirect_text)

            events: List[SessionEvent] = []
            events.append(
                self._emit(
                    SessionEventType.SPEAKING,
                    {
                        "text": spoken_text,
                        "audio_url": audio_url,
                        "in_response_to": question,
                        "off_topic": True,
                        "text_language": self.text_language,
                        "voice_language": self.voice_language,
                    },
                )
            )
            events.append(self._emit(SessionEventType.AWAITING_COMMAND))
            return events

        qa_result = _answer_free_question(
            question=question,
            current_phase=self.current_phase,
            transcript_segments=self.transcript_segments,
        )

        if hasattr(qa_result, "explanation"):
            explanation_text = qa_result.explanation
            key_takeaway = getattr(qa_result, "key_takeaway", None)
            analogy = getattr(qa_result, "analogy", None)
            flow_steps = [s.model_dump() for s in qa_result.flow_steps] if getattr(qa_result, "flow_steps", None) else None
        else:
            explanation_text = str(qa_result)
            key_takeaway = None
            analogy = None
            flow_steps = None

        spoken_text, audio_url = self._prepare_speech(explanation_text)

        events: List[SessionEvent] = []
        events.append(
            self._emit(
                SessionEventType.SPEAKING,
                {
                    "text": spoken_text,
                    "audio_url": audio_url,
                    "in_response_to": question,
                    "key_takeaway": key_takeaway,
                    "analogy": analogy,
                    "flow_steps": flow_steps,
                    "text_language": self.text_language,
                    "voice_language": self.voice_language,
                },
            )
        )
        events.append(self._emit(SessionEventType.AWAITING_COMMAND))
        return events


# ---------------------------------------------------------------------------
# In-Memory Session Store
# ---------------------------------------------------------------------------

class SessionStore:
    """Thread-safe in-memory session manager for live teaching sessions."""

    def __init__(self) -> None:
        self._sessions: Dict[str, TeachingSession] = {}

    def create_session(
        self,
        session_id: str,
        lecture_id: int,
        plan: LearningPlan,
        quizzes: Optional[List[QuizItem]] = None,
        transcript_segments: Optional[List[TranscriptSegment]] = None,
        voice: Optional[str] = None,
        text_language: Optional[str] = None,
    ) -> TeachingSession:
        session = TeachingSession(
            session_id=session_id,
            lecture_id=lecture_id,
            plan=plan,
            quizzes=quizzes,
            transcript_segments=transcript_segments,
            voice=voice,
            text_language=text_language,
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[TeachingSession]:
        return self._sessions.get(session_id)

    def remove_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def list_sessions(self) -> List[str]:
        return list(self._sessions.keys())


# Global singleton store instance
session_store = SessionStore()


# ---------------------------------------------------------------------------
# Database Loader Helper
# ---------------------------------------------------------------------------

def load_session_from_db(
    lecture_id: int,
    session_id: Optional[str] = None,
    db: Optional[any] = None,
    voice: Optional[str] = None,
    text_language: Optional[str] = None,
) -> TeachingSession:
    """Loads a lecture's LearningPlan, QuizItems, and TranscriptChunks from the database
    and creates/registers an active TeachingSession.
    """
    import uuid
    from backend.app.core.db import SessionLocal
    from backend.app.model.models import (
        LearningPlan as LearningPlanModel,
        QuizItem as QuizItemModel,
        TranscriptChunk as TranscriptChunkModel,
    )

    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        actual_session_id = session_id or f"sess_{uuid.uuid4().hex[:12]}"

        # Reuse session if already active in store
        existing_session = session_store.get_session(actual_session_id)
        if existing_session and existing_session.lecture_id == lecture_id:
            return existing_session

        # 1. Load Learning Plan + Phases from DB
        plan_model = (
            db.query(LearningPlanModel)
            .filter(LearningPlanModel.lecture_id == lecture_id)
            .first()
        )
        phases: List[Phase] = []
        if plan_model:
            for p in plan_model.phases:
                phases.append(
                    Phase(
                        order=p.order,
                        title=p.title,
                        teaching_script=p.teaching_script,
                        source_timestamps=[
                            TimeRange(start=t["start"], end=t["end"])
                            for t in (p.source_timestamps or [])
                        ],
                        prerequisite_note=p.prerequisite_note,
                        difficulty=p.difficulty,
                    )
                )

        plan = LearningPlan(
            id=plan_model.id if plan_model else None,
            lecture_id=lecture_id,
            phases=phases,
        )

        # 2. Load Quizzes from DB
        quiz_models = (
            db.query(QuizItemModel)
            .filter(QuizItemModel.lecture_id == lecture_id)
            .all()
        )
        quizzes = [
            QuizItem(
                id=q.id,
                lecture_id=q.lecture_id,
                question=q.question,
                options=q.options or [],
                correct_answer=q.correct_answer,
                source_timestamp=(
                    TimeRange(
                        start=q.source_timestamp["start"],
                        end=q.source_timestamp["end"],
                    )
                    if q.source_timestamp
                    else None
                ),
            )
            for q in quiz_models
        ]

        # 3. Load Transcript Segments from DB
        chunk_models = (
            db.query(TranscriptChunkModel)
            .filter(TranscriptChunkModel.lecture_id == lecture_id)
            .order_by(TranscriptChunkModel.start)
            .all()
        )
        transcripts = [
            TranscriptSegment(
                id=c.id,
                lecture_id=c.lecture_id,
                start=c.start,
                end=c.end,
                text=c.text,
                speaker=c.speaker,
            )
            for c in chunk_models
        ]

        # 4. Create and store TeachingSession
        session = session_store.create_session(
            session_id=actual_session_id,
            lecture_id=lecture_id,
            plan=plan,
            quizzes=quizzes,
            transcript_segments=transcripts,
            voice=voice,
            text_language=text_language,
        )
        return session

    finally:
        if should_close:
            db.close()

