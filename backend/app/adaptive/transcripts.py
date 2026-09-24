"""Private, durable speech-to-text checkpoints for immutable recording objects."""
import hashlib
import json
import os
import time
from pydantic import TypeAdapter
from sqlalchemy import text
from backend.app.core.db import SessionLocal
from .contracts import Segment
from .models import Job, TranscriptCache

segments_adapter = TypeAdapter(list[Segment])

def fingerprint(backend, key):
    # Object keys are immutable UUIDs. Reasoning model changes do not invalidate speech.
    settings = [backend, key, os.getenv('WHISPER_MODEL', 'base'), 'cpu-int8-vad-v1']
    return hashlib.sha256(json.dumps(settings).encode()).hexdigest()

def validated_segments(value):
    segments = segments_adapter.validate_python(value)
    if not segments or len({s.id for s in segments}) != len(segments):
        raise ValueError('Transcription must have nonempty segments with unique IDs')
    return segments

def load_transcript(recording_id, expected_fingerprint):
    with SessionLocal() as db:
        saved = db.get(TranscriptCache, recording_id)
        if not saved or saved.fingerprint != expected_fingerprint:
            return None
        try:
            return validated_segments(saved.segments)
        except ValueError:
            # A corrupt checkpoint is never passed to lesson generation.
            return None

def save_transcript(recording_id, expected_fingerprint, segments, job_id, attempt):
    payload = [s.model_dump() for s in validated_segments(segments)]
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        job = db.get(Job, job_id)
        if not job or job.status != 'running' or job.attempts != attempt:
            return False
        saved = db.get(TranscriptCache, recording_id)
        if not saved:
            saved = TranscriptCache(recording_id=recording_id)
            db.add(saved)
        saved.fingerprint, saved.segments, saved.created_at = expected_fingerprint, payload, time.time()
        db.commit()  # Durable BEFORE any reasoning-provider request.
        return True
