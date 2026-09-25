import time
from sqlalchemy import Column, String, Integer, Float, Boolean, JSON, Text, UniqueConstraint
from backend.app.core.db import Base

class Learner(Base):
    __tablename__ = 'adaptive_learners'
    id = Column(String, primary_key=True)
    invited = Column(Boolean, default=False, nullable=False)
    preferences = Column(JSON, default=dict, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)

class Recording(Base):
    __tablename__ = 'adaptive_recordings'
    id = Column(String, primary_key=True)
    owner_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    storage_backend = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    status = Column(String, default='queued', nullable=False)
    public = Column(Boolean, default=False, nullable=False)
    permission_note = Column(Text, nullable=True)
    duration = Column(Float, nullable=False)
    error = Column(String, nullable=True)
    document = Column(JSON, nullable=True)
    created_at = Column(Float, default=time.time, nullable=False)

class MediaIdentity(Base):
    """Trusted digest of stored media; used only to collapse exact library duplicates."""
    __tablename__ = 'adaptive_media_identities'
    recording_id = Column(String, primary_key=True)
    sha256 = Column(String(64), nullable=False, index=True)

class Job(Base):
    __tablename__ = 'adaptive_jobs'
    id = Column(String, primary_key=True)
    recording_id = Column(String, unique=True, nullable=False)
    status = Column(String, default='queued', nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    lease_until = Column(Float, default=0, nullable=False)

class LearningState(Base):
    __tablename__ = 'adaptive_states'
    __table_args__ = (UniqueConstraint('learner_id', 'recording_id'),)
    id = Column(String, primary_key=True)
    learner_id = Column(String, nullable=False, index=True)
    recording_id = Column(String, nullable=False)
    phase_id = Column(String, nullable=False)
    progress = Column(JSON, default=dict, nullable=False)
    active = Column(JSON, nullable=True)
    ended = Column(Boolean, default=False, nullable=False)
    revision = Column(Integer, default=0, nullable=False)
    generation = Column(Integer, default=0, nullable=False)

class Attempt(Base):
    __tablename__ = 'adaptive_attempts'
    id = Column(String, primary_key=True)
    state_id = Column(String, nullable=False, index=True)
    question_id = Column(String, nullable=False)
    selected_index = Column(Integer, nullable=False)
    response = Column(JSON, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)

class Usage(Base):
    __tablename__ = 'adaptive_usage'
    id = Column(String, primary_key=True)
    actor = Column(String, nullable=False, index=True)
    service = Column(String, nullable=False)
    reserved_usd = Column(Float, nullable=False)
    input_units = Column(Integer, default=0, nullable=False)
    output_units = Column(Integer, default=0, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)

class Asset(Base):
    __tablename__ = 'adaptive_assets'
    id = Column(String, primary_key=True)
    owner_id = Column(String, nullable=False)
    recording_id = Column(String, nullable=False)
    storage_backend = Column(String, nullable=False)
    object_key = Column(String, nullable=False)


class TranscriptCache(Base):
    """Completed transcription checkpoint, independent of lesson generation."""
    __tablename__ = 'adaptive_transcript_cache'
    recording_id = Column(String, primary_key=True)
    fingerprint = Column(String, nullable=False)
    segments = Column(JSON, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)


class LLMCache(Base):
    """Cached structured LLM responses to prevent redundant generation."""
    __tablename__ = 'adaptive_llm_cache'
    key = Column(String, primary_key=True)
    response = Column(Text, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)


class ProcessingProgress(Base):
    __tablename__ = 'adaptive_processing_progress'
    recording_id = Column(String, primary_key=True)
    stage = Column(String, nullable=False)
    detail = Column(String, nullable=False)
    current = Column(Float, nullable=True)
    total = Column(Float, nullable=True)
    unit = Column(String, nullable=True)
    history = Column(JSON, default=list, nullable=False)
    updated_at = Column(Float, default=time.time, nullable=False)


class ImportSource(Base):
    __tablename__ = 'adaptive_import_sources'
    recording_id = Column(String, primary_key=True)
    url = Column(Text, nullable=False)
    kind = Column(String, nullable=False)


class EmailNotice(Base):
    __tablename__ = 'adaptive_email_notices'
    recording_id = Column(String, primary_key=True)
    email = Column(String, nullable=False)
    status = Column(String, default='pending', nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    next_attempt = Column(Float, default=0, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)


class LLMCacheOrigin(Base):
    """Separate additive metadata; legacy cache keys cannot prove their generating model."""
    __tablename__ = 'adaptive_llm_cache_origins'
    key = Column(String, primary_key=True)
    requested_model = Column(String, nullable=False)
    source_model = Column(String, nullable=True)
    source_provider = Column(String, nullable=True)
    inherited_from = Column(String, nullable=True)
    provenance = Column(String, nullable=False)
