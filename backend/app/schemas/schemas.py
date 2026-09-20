"""
backend/schemas.py

The canonical data shapes for Blindspot Edu. Every AI capability in
backend/ai/ (transcription, planning, graph, orchestrator, tts) must
normalize whatever its underlying provider returns into these shapes
before handing it back to the rest of the app — the API routes, the
database layer, and the frontend should never need to know or care
which specific tool (faster-whisper vs. Amazon Transcribe, open-source
TTS vs. Amazon Polly, etc.) produced the data.

See MVP_Blueprint_AI_Lecture_Companion.md §7.3 (Migration Strategy)
and §9.6 (Interface Contract) for why this file is structured this way.

Requires: pydantic >= 2
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------

class TimeRange(BaseModel):
    """A span of time in the original lecture audio, in seconds.

    This is the one shape almost everything else points back to — it's
    what "show me where you learned that" ultimately resolves to.
    """
    start: float = Field(..., ge=0, description="Start time in seconds")
    end: float = Field(..., ge=0, description="End time in seconds")


class LectureStatus(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# Lecture — the top-level object everything else hangs off of
# ---------------------------------------------------------------------------

class Lecture(BaseModel):
    id: Optional[int] = None
    filename: str
    audio_url: Optional[str] = Field(
        default=None,
        description="Wherever storage.py put the raw file — local/MinIO "
                    "now, Amazon S3 in production. Callers should treat this as "
                    "an opaque URL, never assume which backend served it.",
    )
    status: LectureStatus = LectureStatus.PROCESSING
    uploaded_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Transcription output — produced by backend/ai/transcription.py
# ---------------------------------------------------------------------------

class TranscriptSegment(BaseModel):
    """One slice of the transcript, timestamped against the source audio.

    Every transcription provider must normalize its raw output into this
    shape. The `embedding` field is populated in a second pass (not at
    transcription time) and is what powers search / "show me".
    """
    id: Optional[int] = None
    lecture_id: int
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    text: str
    speaker: Optional[str] = None
    embedding: Optional[list[float]] = Field(
        default=None,
        description="Vector embedding of `text`, added after transcription",
    )


# ---------------------------------------------------------------------------
# Learning plan output — produced by backend/ai/planning.py
# ---------------------------------------------------------------------------

class Phase(BaseModel):
    """One ordered step of the taught lesson."""
    order: int = Field(..., ge=0, description="0-indexed position in the plan")
    title: str
    teaching_script: str = Field(
        ..., description="What the voice agent actually says for this phase"
    )
    source_timestamps: list[TimeRange] = Field(
        default_factory=list,
        description="Where in the original audio this phase's content came "
                    "from — what 'show me where you learned that' jumps to",
    )
    prerequisite_note: Optional[str] = Field(
        default=None,
        description="Anything the student should already know before this "
                    "phase makes sense",
    )
    difficulty: Optional[str] = Field(
        default=None,
        description="Estimated difficulty level (e.g. 'beginner', "
                    "'intermediate', 'advanced')",
    )


class LearningPlan(BaseModel):
    id: Optional[int] = None
    lecture_id: int
    phases: list[Phase] = Field(default_factory=list)


class GapConcept(BaseModel):
    """A concept the lecture mentioned but never fully explained.

    These are the actual "blind spots" the product is named after, and
    they seed the knowledge graph in backend/ai/graph.py.
    """
    id: Optional[int] = None
    lecture_id: int
    name: str
    why_its_a_gap: str = Field(
        ..., description="One line on what's missing or under-explained"
    )
    related_phase_order: Optional[int] = Field(
        default=None, description="Which Phase.order this surfaced from, if any"
    )
    source_timestamp: Optional[TimeRange] = None


# ---------------------------------------------------------------------------
# Quiz — produced by backend/ai/planning.py
# ---------------------------------------------------------------------------

class QuizItem(BaseModel):
    id: Optional[int] = None
    lecture_id: int
    question: str
    options: list[str] = Field(..., min_length=2)
    correct_answer: str
    source_timestamp: Optional[TimeRange] = None


class QuizSubmission(BaseModel):
    """What the frontend POSTs when a student answers a question."""
    quiz_item_id: int
    session_id: str
    selected_answer: str


class QuizResult(BaseModel):
    """What the backend returns after grading a QuizSubmission."""
    quiz_item_id: int
    session_id: str
    selected_answer: str
    correct: bool


# ---------------------------------------------------------------------------
# Knowledge graph — produced by backend/ai/graph.py
# ---------------------------------------------------------------------------

class GraphNode(BaseModel):
    id: str = Field(
        ..., description="Stable and unique within a lecture, e.g. a "
                          "slugified concept name"
    )
    lecture_id: int
    label: str
    is_gap: bool = Field(
        default=False,
        description="True if this concept came from a GapConcept (under-"
                    "explained) rather than something the lecture fully covered",
    )
    source_timestamp: Optional[TimeRange] = None


class GraphEdge(BaseModel):
    lecture_id: int
    source: str = Field(..., description="A GraphNode.id")
    target: str = Field(..., description="A GraphNode.id")
    relation: str = Field(
        ..., description="e.g. 'prerequisite_of', 'related_to', 'example_of'"
    )


# ---------------------------------------------------------------------------
# Live session events — backend/ai/orchestrator.py <-> WebSocket <-> frontend
# ---------------------------------------------------------------------------

class SessionEventType(str, Enum):
    PHASE_STARTED = "phase_started"
    SPEAKING = "speaking"
    AWAITING_COMMAND = "awaiting_command"
    JUMPED_TO_TIMESTAMP = "jumped_to_timestamp"
    SOURCE_UNAVAILABLE = "source_unavailable"
    QUIZ_STARTED = "quiz_started"
    SESSION_ENDED = "session_ended"


class SessionEvent(BaseModel):
    """One message sent over the WebSocket from the orchestrator to the
    frontend. This is the literal implementation of the event format
    agreed on in task.md Phase 0 — every event the orchestrator emits
    should be one of these, nothing ad hoc.
    """
    type: SessionEventType
    lecture_id: int
    session_id: str
    phase_order: Optional[int] = None
    payload: Optional[dict] = Field(
        default=None,
        description="Type-specific extra data — e.g. {'timestamp': "
                    "{'start': .., 'end': ..}} for JUMPED_TO_TIMESTAMP, "
                    "or {'audio_url': ...} for SPEAKING",
    )
    emitted_at: datetime = Field(default_factory=_utcnow)


class SessionCommand(BaseModel):
    """One message sent the other direction: frontend -> orchestrator,
    over the same WebSocket connection.
    """
    session_id: str
    command: str = Field(
        ..., description="One of: 'next', 'explain_again', 'show_me', "
                          "'quiz_me', or free-form text for a question"
    )
    argument: Optional[str] = Field(
        default=None,
        description="e.g. the topic being asked about, for a 'show_me' command",
    )


# ---------------------------------------------------------------------------
# Pipeline result — produced by backend/ai/planning.py run_full_pipeline()
# ---------------------------------------------------------------------------

class PipelineResult(BaseModel):
    """The complete output of the AI/Planning offline pipeline for one lecture.

    This is what the background job produces after a lecture upload: a
    learning plan, detected gaps, quiz bank, knowledge graph data, and
    the transcript with embeddings attached. The AI Orchestrator reads
    this at runtime to drive the live teaching session.
    """
    lecture_id: int
    plan: LearningPlan
    gaps: list[GapConcept] = Field(default_factory=list)
    quizzes: list[QuizItem] = Field(default_factory=list)
    graph_nodes: list[GraphNode] = Field(default_factory=list)
    graph_edges: list[GraphEdge] = Field(default_factory=list)
    transcript_with_embeddings: list[TranscriptSegment] = Field(
        default_factory=list,
        description="The original transcript segments with embedding "
                    "vectors populated",
    )
    validation_report: Optional[dict] = Field(
        default=None,
        description="Per-step grounding-validation summary produced by the "
                    "guardrails layer (attempts, items removed, remaining "
                    "issues) — observability only, never affects output",
    )