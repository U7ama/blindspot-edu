import pytest
from backend.app.adaptive import worker
from backend.app.adaptive.models import Job, Recording, TranscriptCache
from backend.app.adaptive.transcripts import fingerprint, load_transcript, save_transcript
from backend.app.core.db import SessionLocal
from backend.app.services.storage import get_storage_adapter
from conftest import document


def prepare(tmp_path):
    path = tmp_path / 'lecture.wav'
    path.write_bytes(b'test-media')
    key = get_storage_adapter().save(path, 'lecture.wav')
    with SessionLocal() as db:
        db.add(Recording(id='r', owner_id='learner', title='Test', storage_backend='local', object_key=key, duration=5))
        db.add(Job(id='j', recording_id='r'))
        db.commit()
    return key


def requeue():
    with SessionLocal() as db:
        db.get(Job, 'j').status = 'queued'
        db.get(Recording, 'r').status = 'queued'
        db.commit()


def test_failed_reasoning_retry_reuses_durable_transcript(tmp_path, monkeypatch):
    key = prepare(tmp_path)
    calls = []
    def transcribe(*args):
        calls.append(True)
        return document().segments
    def fail_after_checkpoint(segments):
        # The checkpoint must already be visible from an independent DB session.
        assert load_transcript('r', fingerprint('local', key)) == segments
        raise ValueError('reasoning failed')
    monkeypatch.setattr(worker, 'transcribe', transcribe)
    monkeypatch.setattr(worker, 'compile_document', fail_after_checkpoint)
    assert worker.run_once()
    with SessionLocal() as db:
        assert db.get(Recording, 'r').status == 'failed'
        assert db.get(TranscriptCache, 'r') is not None
    requeue()
    monkeypatch.setenv('LLM_MODEL', 'another-reasoning-model')
    monkeypatch.setattr(worker, 'get_storage_adapter', lambda *a: pytest.fail('Retry downloaded media again'))
    monkeypatch.setattr(worker, 'compile_document', lambda segments: document())
    assert worker.run_once()
    assert len(calls) == 1
    with SessionLocal() as db:
        assert db.get(Recording, 'r').status == 'ready'
        assert db.get(Job, 'j').attempts == 2


def test_whisper_change_invalidates_transcript(tmp_path, monkeypatch):
    prepare(tmp_path)
    calls = []
    monkeypatch.setattr(worker, 'transcribe', lambda *a: (calls.append(True) or document().segments))
    monkeypatch.setattr(worker, 'compile_document', lambda segments: document())
    monkeypatch.setenv('WHISPER_MODEL', 'base')
    assert worker.run_once()
    requeue()
    monkeypatch.setenv('WHISPER_MODEL', 'small')
    assert worker.run_once()
    assert len(calls) == 2


def test_failed_transcription_is_not_cached(tmp_path, monkeypatch):
    prepare(tmp_path)
    monkeypatch.setattr(worker, 'transcribe', lambda *a: [])
    monkeypatch.setattr(worker, 'compile_document', lambda *a: pytest.fail('Empty transcript reached reasoning'))
    assert worker.run_once()
    with SessionLocal() as db:
        assert db.get(TranscriptCache, 'r') is None
        assert db.get(Recording, 'r').status == 'failed'


def test_stale_worker_cannot_publish_transcript(tmp_path):
    key = prepare(tmp_path)
    with SessionLocal() as db:
        job = db.get(Job, 'j')
        job.status, job.attempts = 'running', 2
        db.commit()
    assert not save_transcript('r', fingerprint('local', key), document().segments, 'j', 1)
    assert load_transcript('r', fingerprint('local', key)) is None


def test_invalid_or_different_source_cache_is_not_used(tmp_path):
    key = prepare(tmp_path)
    original = fingerprint('local', key)
    with SessionLocal() as db:
        db.add(TranscriptCache(recording_id='r', fingerprint=original, segments=[{'invalid': 'payload'}]))
        db.commit()
    assert load_transcript('r', original) is None
    assert load_transcript('r', fingerprint('local', 'b'*32+'.wav')) is None


def test_insufficient_content_preserves_transcript_and_completes_job(tmp_path,monkeypatch):
    key=prepare(tmp_path)
    monkeypatch.setattr(worker,'transcribe',lambda *a:document().segments)
    def unsuitable(segments):
        raise worker.InsufficientContent('Not enough educational content identified.')
    monkeypatch.setattr(worker,'compile_document',unsuitable)
    assert worker.run_once()
    assert load_transcript('r',fingerprint('local',key)) is not None
    with SessionLocal() as db:
        rec=db.get(Recording,'r')
        assert rec.status=='insufficient_content'
        assert rec.document is None
        assert db.get(Job,'j').status=='done'
