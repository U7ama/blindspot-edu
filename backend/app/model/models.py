"""
backend/models.py

SQLAlchemy ORM models — the actual DB tables. These mirror the Pydantic
shapes in schemas.py (Lecture, TranscriptSegment) but are the persistence
layer, not the API/interchange layer. Per blueprint §8, more tables
(learning_plans, phases, quiz_items, graph_nodes/edges) get added here
as those features come online — this file starts with just what Task 1
needs: lectures + transcript_chunks.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from backend.app.core.db import Base


class LectureStatus(str, enum.Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    audio_url = Column(String, nullable=True)  # set once storage.save() runs
    status = Column(SqlEnum(LectureStatus), default=LectureStatus.PROCESSING, nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    transcript_chunks = relationship(
        "TranscriptChunk", back_populates="lecture", cascade="all, delete-orphan"
    )
    # Relationships configured for pipeline output tables
    learning_plan = relationship(
        "LearningPlan", back_populates="lecture", uselist=False, cascade="all, delete-orphan"
    )
    gap_concepts = relationship(
        "GapConcept", back_populates="lecture", cascade="all, delete-orphan"
    )
    quiz_items = relationship(
        "QuizItem", back_populates="lecture", cascade="all, delete-orphan"
    )
    graph_nodes = relationship(
        "GraphNode", back_populates="lecture", cascade="all, delete-orphan"
    )
    graph_edges = relationship(
        "GraphEdge", back_populates="lecture", cascade="all, delete-orphan"
    )


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=False)
    start = Column(Float, nullable=False)
    end = Column(Float, nullable=False)
    text = Column(String, nullable=False)
    speaker = Column(String, nullable=True)
    # embedding column intentionally omitted for now — that's populated in
    # a separate pass once pgvector is set up (blueprint §6.1 / Phase 2),
    # and pgvector specifically needs real Postgres, not SQLite.

    lecture = relationship("Lecture", back_populates="transcript_chunks")


# ---------------------------------------------------------------------------
# Tables below were configured to persist the output of
# the planning pipeline: learning plans, phases, gap concepts, quiz items,
# quiz results, and the knowledge graph (nodes + edges).
# ---------------------------------------------------------------------------


class LearningPlan(Base):
    """A generated learning plan for a lecture. One plan per lecture."""
    __tablename__ = "learning_plans"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=False, unique=True)

    lecture = relationship("Lecture", back_populates="learning_plan")
    phases = relationship(
        "Phase", back_populates="plan", cascade="all, delete-orphan",
        order_by="Phase.order",
    )


class Phase(Base):
    """One ordered step of a Learning Plan — a teachable unit."""
    __tablename__ = "phases"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("learning_plans.id"), nullable=False)
    order = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    teaching_script = Column(Text, nullable=False)
    # Stored as JSON list of {"start": float, "end": float} dicts.
    source_timestamps = Column(JSON, nullable=False, default=list)
    prerequisite_note = Column(Text, nullable=True)
    difficulty = Column(String, nullable=True)

    plan = relationship("LearningPlan", back_populates="phases")


class GapConcept(Base):
    """A concept the lecture mentioned but never fully explained."""
    __tablename__ = "gap_concepts"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=False)
    name = Column(String, nullable=False)
    why_its_a_gap = Column(Text, nullable=False)
    related_phase_order = Column(Integer, nullable=True)
    # Stored as JSON {"start": float, "end": float} or null.
    source_timestamp = Column(JSON, nullable=True)

    lecture = relationship("Lecture", back_populates="gap_concepts")


class QuizItem(Base):
    """One MCQ question derived from the lecture."""
    __tablename__ = "quiz_items"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=False)
    question = Column(Text, nullable=False)
    # Stored as JSON list of option strings.
    options = Column(JSON, nullable=False)
    correct_answer = Column(String, nullable=False)
    # Stored as JSON {"start": float, "end": float} or null.
    source_timestamp = Column(JSON, nullable=True)

    lecture = relationship("Lecture", back_populates="quiz_items")


class QuizResult(Base):
    """A student's answer to a quiz question during a teaching session."""
    __tablename__ = "quiz_results"

    id = Column(Integer, primary_key=True, index=True)
    quiz_item_id = Column(Integer, ForeignKey("quiz_items.id"), nullable=False)
    session_id = Column(String, nullable=False)
    selected_answer = Column(String, nullable=False)
    correct = Column(Boolean, nullable=False)

    quiz_item = relationship("QuizItem")


class GraphNode(Base):
    """A concept node in the lecture's knowledge graph."""
    __tablename__ = "graph_nodes"

    # String PK — slugified concept name, stable within a lecture.
    id = Column(String, primary_key=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=False)
    label = Column(String, nullable=False)
    is_gap = Column(Boolean, default=False, nullable=False)
    source_timestamp = Column(JSON, nullable=True)

    lecture = relationship("Lecture", back_populates="graph_nodes")


class GraphEdge(Base):
    """A directed relationship between two GraphNodes."""
    __tablename__ = "graph_edges"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=False)
    source = Column(String, ForeignKey("graph_nodes.id"), nullable=False)
    target = Column(String, ForeignKey("graph_nodes.id"), nullable=False)
    relation = Column(String, nullable=False)

    lecture = relationship("Lecture", back_populates="graph_edges")
