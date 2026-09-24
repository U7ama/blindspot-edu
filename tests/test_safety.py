import io
import wave
from pathlib import Path
import pytest
from backend.app.services.storage import get_storage_adapter
from backend.app.services.ai.whiteboard.session_manager import _safe_path
from backend.app.adaptive.budget import reserve, AllowanceExceeded
from backend.app.core.db import SessionLocal, init_db
from backend.app.adaptive.models import Recording, Job
from backend.app.adaptive import worker
from conftest import document

def test_storage_roundtrip_and_explicit_config(tmp_path,monkeypatch):
    src=tmp_path/'source.wav';src.write_bytes(b'recording')
    storage=get_storage_adapter('local')
    key=storage.save(src,'source.wav')
    with storage.local_copy(key) as path:
        assert path.read_bytes()==b'recording'
    assert storage.playback_url(key) is None
    storage.delete(key)
    assert not storage.path(key).exists()
    monkeypatch.delenv('S3_BUCKET_NAME',raising=False)
    with pytest.raises(RuntimeError):get_storage_adapter('s3')
    with pytest.raises(ValueError):storage.path('../../private.json')

@pytest.mark.parametrize('value',['../../evil','/tmp/evil','a/b','a\\b','', 'a'*101])
def test_bad_session_ids(value):
    with pytest.raises(ValueError):_safe_path(value)

def test_upload_stream_limit_and_invite(client,monkeypatch):
    assert client.post('/api/v1/recordings?filename=a.wav',content=b'data').status_code==403
    assert client.post('/api/v1/invite',json={'code':'test-invitation'}).status_code==200
    monkeypatch.setenv('MAX_UPLOAD_BYTES','10')
    assert client.post('/api/v1/recordings?filename=a.wav',content=b'x'*11).status_code==413
    assert client.post('/api/v1/recordings?filename=a.wav',content=b'bad').status_code==400

def test_limit_before_generation(monkeypatch):
    monkeypatch.setenv('AI_TOTAL_ALLOWANCE_USD','0.000001')
    with pytest.raises(AllowanceExceeded):reserve('llm',1000,1000)

def test_boot_never_seeds():
    init_db()
    with SessionLocal() as db:
        assert db.query(Recording).count()==0

def test_worker_recovery_atomic_document(monkeypatch,tmp_path):
    storage=get_storage_adapter('local')
    src=tmp_path/'x.wav';src.write_bytes(b'x')
    key=storage.save(src,'x.wav')
    with SessionLocal() as db:
        db.add(Recording(id='r',owner_id='test',title='Test',storage_backend='local',object_key=key,duration=5))
        db.add(Job(id='j',recording_id='r',status='running',attempts=1,lease_until=0))
        db.commit()
    monkeypatch.setattr(worker,'transcribe',lambda *args:document().segments)
    monkeypatch.setattr(worker,'compile_document',lambda segments:document())
    assert worker.run_once()
    assert not worker.run_once()
    with SessionLocal() as db:
        assert db.get(Recording,'r').status=='ready'
        assert db.get(Job,'j').attempts==2

def test_worker_failure_does_not_mark_ready(monkeypatch,tmp_path):
    src=tmp_path/'x.wav';src.write_bytes(b'x')
    key=get_storage_adapter().save(src,'x.wav')
    with SessionLocal() as db:
        db.add(Recording(id='r',owner_id='test',title='Test',storage_backend='local',object_key=key,duration=5))
        db.add(Job(id='j',recording_id='r'))
        db.commit()
    monkeypatch.setattr(worker,'transcribe',lambda *args: (_ for _ in ()).throw(ValueError('no speech')))
    assert worker.run_once()
    with SessionLocal() as db:
        assert db.get(Recording,'r').status=='failed'
        assert db.get(Recording,'r').document is None

def test_real_media_upload_queue_and_authorization(client,monkeypatch):
    assert client.post('/api/v1/invite',json={'code':'test-invitation'}).status_code==200
    wav=io.BytesIO()
    with wave.open(wav,'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b'\0\0'*8000)
    result=client.post('/api/v1/recordings?filename=valid.wav',content=wav.getvalue())
    assert result.status_code==202,result.text
    rid=result.json()['id']
    assert client.get(f'/api/v1/recordings/{rid}/media').content==wav.getvalue()
    assert result.json()['status']=='queued'
    with SessionLocal() as db:
        assert db.query(Job).filter_by(recording_id=rid,status='queued').count()==1
    monkeypatch.setenv('MAX_DURATION_SECONDS','0')
    assert client.post('/api/v1/recordings?filename=long.wav',content=wav.getvalue()).status_code==400

def test_chunked_body_limit(client,monkeypatch):
    client.post('/api/v1/invite',json={'code':'test-invitation'})
    monkeypatch.setenv('MAX_UPLOAD_BYTES','10')
    assert client.post('/api/v1/recordings?filename=a.wav',content=iter([b'x'*6,b'y'*6])).status_code==413


def test_disconnected_upload_is_not_queued(client, monkeypatch):
    from starlette.requests import Request, ClientDisconnect
    client.post('/api/v1/invite', json={'code': 'test-invitation'})
    async def interrupted(self):
        yield b'partial recording'
        raise ClientDisconnect()
    monkeypatch.setattr(Request, 'stream', interrupted)
    response = client.post('/api/v1/recordings?filename=interrupted.mp4', content=b'x')
    assert response.status_code == 400
    assert 'Upload interrupted' in response.json()['detail']
    with SessionLocal() as db:
        assert db.query(Recording).count() == 0
        assert db.query(Job).count() == 0


def test_worker_errors_are_actionable_without_leaking_input():
    from botocore.exceptions import ClientError
    assert 'Python package is missing' in worker.failure_message(ModuleNotFoundError('secret'), 'Transcription')
    denied = ClientError({'Error': {'Code': 'ValidationException', 'Message': 'sensitive lecture text'}}, 'Converse')
    message = worker.failure_message(denied, 'Lesson generation')
    assert 'model authorization' in message
    assert 'sensitive lecture text' not in message
    assert 'allowance' in worker.failure_message(AllowanceExceeded('hidden'), 'Lesson generation')
    assert 'hidden' not in worker.failure_message(AllowanceExceeded('hidden'), 'Lesson generation')
    import openai
    import httpx
    fake_resp = httpx.Response(403, request=httpx.Request('POST', 'http://test'))
    quota_err = openai.PermissionDeniedError('Free quota exhausted', response=fake_resp, body=None)
    msg = worker.failure_message(quota_err, 'Lesson generation')
    assert 'quota or access limit' in msg
    assert 'transcript are preserved' in msg
    assert 'Free quota exhausted' not in msg
