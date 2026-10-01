"""An uploaded duplicate may reuse only an accessible, byte-identical verified lesson."""

from backend.app.adaptive import worker
from backend.app.adaptive.models import Job, MediaIdentity, ProcessingProgress, Recording, TranscriptCache
from backend.app.core.db import SessionLocal
from backend.app.services.storage import get_storage_adapter
from conftest import document
import hashlib
import pytest


def recording(tmp_path, rid, owner, content, *, ready=False, public=False, title='Lecture 19'):
    path = tmp_path / (rid + '.wav')
    path.write_bytes(content)
    key = get_storage_adapter().save(path, path.name)
    with SessionLocal() as db:
        db.add(Recording(id=rid, owner_id=owner, title=title, storage_backend='local',
                         object_key=key, duration=5, status='ready' if ready else 'queued',
                         public=public, document=document().model_dump() if ready else None))
        if not ready:
            db.add(Job(id='job', recording_id=rid))
        db.commit()
    return key


def test_exact_public_duplicate_reuses_verified_lesson(tmp_path, monkeypatch):
    recording(tmp_path, 'source', 'other', b'exact recording bytes', ready=True, public=True)
    recording(tmp_path, 'target', 'student', b'exact recording bytes')
    monkeypatch.setattr(worker, 'transcribe', lambda *_: (_ for _ in ()).throw(AssertionError('Whisper ran')))
    monkeypatch.setattr(worker, 'compile_document', lambda *_: (_ for _ in ()).throw(AssertionError('LLM ran')))

    assert worker.run_once()
    with SessionLocal() as db:
        target = db.get(Recording, 'target')
        assert target.status == 'ready'
        assert target.document['validation'] == 'verified'
        assert target.document['segments'][0]['id'] == 'target:s0'
        assert target.document['phases'][0]['evidence_ids'] == ['target:s0']
        assert db.get(TranscriptCache, 'target').segments[0]['id'] == 'target:s0'
        assert db.get(MediaIdentity, 'target').sha256 == db.get(MediaIdentity, 'source').sha256
        history = db.get(ProcessingProgress, 'target').history
        assert any(event['stage'] == 'reuse_verified' for event in history)
        assert not any(event['stage'] in ('transcribing', 'concepts') for event in history)


def test_same_title_and_duration_with_different_bytes_runs_pipeline(tmp_path, monkeypatch):
    recording(tmp_path, 'source', 'other', b'one lecture', ready=True, public=True)
    recording(tmp_path, 'target', 'student', b'a different lecture')
    calls = []
    monkeypatch.setattr(worker, 'transcribe', lambda *_: (calls.append('transcribed') or document().segments))
    monkeypatch.setattr(worker, 'compile_document', lambda *_: document())

    assert worker.run_once()
    assert calls == ['transcribed']
    with SessionLocal() as db:
        assert db.get(Recording, 'target').status == 'ready'
        assert not any(event['stage'] == 'reuse_verified' for event in db.get(ProcessingProgress, 'target').history)


def test_private_recording_from_another_learner_is_not_a_cache_source(tmp_path, monkeypatch):
    recording(tmp_path, 'source', 'other', b'exact recording bytes', ready=True, public=False)
    recording(tmp_path, 'target', 'student', b'exact recording bytes')
    calls = []
    monkeypatch.setattr(worker, 'transcribe', lambda *_: (calls.append('transcribed') or document().segments))
    monkeypatch.setattr(worker, 'compile_document', lambda *_: document())

    assert worker.run_once()
    assert calls == ['transcribed']


def test_known_media_hashes_reuse_without_downloading_again(tmp_path, monkeypatch):
    recording(tmp_path, 'source', 'other', b'bytes', ready=True, public=True)
    key = recording(tmp_path, 'target', 'student', b'bytes')
    digest = hashlib.sha256(b'bytes').hexdigest()
    with SessionLocal() as db:
        db.add_all([MediaIdentity(recording_id=rid, sha256=digest) for rid in ('source', 'target')])
        db.commit()
    monkeypatch.setattr(worker, 'media_digest', lambda *_: (_ for _ in ()).throw(AssertionError('Media downloaded again')))
    result = worker.identical_verified_lesson('target', 'student', 'local', key, 5)
    assert result[0] == 'source'
    assert result[1].segments[0].id == 'target:s0'


def test_legacy_media_hash_is_saved_after_one_comparison(tmp_path, monkeypatch):
    key = recording(tmp_path, 'target', 'student', b'bytes')
    calls = []
    monkeypatch.setattr(worker, 'media_digest', lambda *_: (calls.append(True) or hashlib.sha256(b'bytes').digest()))
    first = worker.stored_media_digest('target', 'local', key)
    assert worker.stored_media_digest('target', 'local', key) == first
    assert len(calls) == 1
    with pytest.raises(ValueError, match='object changed'):
        worker.stored_media_digest('target', 'local', 'a' * 32 + '.mp4')
