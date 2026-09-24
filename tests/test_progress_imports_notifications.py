import time
from types import SimpleNamespace
import pytest
from conftest import document
from backend.app.core.db import SessionLocal
from backend.app.adaptive.models import Recording, Job, ProcessingProgress, EmailNotice, Learner
from backend.app.adaptive import imports, notifications
from backend.app.adaptive.progress import update


@pytest.mark.parametrize('url', [
    'http://example.com/a.mp4', 'https://localhost/a.mp4',
    'https://127.0.0.1/a.mp4', 'https://169.254.169.254/a.mp4',
    'https://[::1]/a.mp4', 'https://user:pass@example.com/a.mp4',
    'https://example.com:8000/a.mp4', 'file:///tmp/a.mp4',
    'https://example.com/page', 'https://www.youtube.com/playlist?list=123',
    'https://youtu.be/short',
])
def test_invalid_source_urls_rejected(url):
    with pytest.raises(imports.ImportFailure):
        imports.classify_url(url)


def test_youtube_url_canonicalization():
    assert imports.classify_url('https://youtu.be/IwV6EVPyYY0?t=5') == (
        'youtube', 'https://www.youtube.com/watch?v=IwV6EVPyYY0')
    assert imports.classify_url('https://media.example.com/lesson.mp4?token=x')[0] == 'direct'


def test_dns_private_or_mixed_addresses_rejected(monkeypatch):
    monkeypatch.setattr(imports.socket, 'getaddrinfo', lambda *a, **k: [
        (0,0,0,'',('8.8.8.8',443)), (0,0,0,'',('10.0.0.1',443))])
    with pytest.raises(imports.ImportFailure):
        imports.public_ip('media.example.com')


def fake_connection(monkeypatch, responses, addresses=None):
    calls = []
    class Response:
        def __init__(self, status, headers, chunks):
            self.status=status;self.headers=headers;self.chunks=iter(chunks)
        def getheader(self, key, default=None): return self.headers.get(key, default)
        def read(self, size): return next(self.chunks, b'')
    class Connection:
        def __init__(self, host, address): calls.append((host,address))
        def request(self, *a, **k): pass
        def getresponse(self): return Response(*responses.pop(0))
        def close(self): pass
    monkeypatch.setattr(imports, 'PinnedHTTPS', Connection)
    monkeypatch.setattr(imports, 'public_ip', lambda host: '8.8.8.8')
    return calls


def test_redirect_to_metadata_blocked(monkeypatch, tmp_path):
    calls = fake_connection(monkeypatch, [(302,{'Location':'https://169.254.169.254/latest'},[])])
    with pytest.raises(imports.ImportFailure):
        imports.download('https://example.com/a.mp4', tmp_path/'out', 100)
    assert len(calls) == 1


def test_download_stream_limit_and_roundtrip(monkeypatch, tmp_path):
    fake_connection(monkeypatch, [(200,{},[b'abcd',b'efgh'])])
    with pytest.raises(imports.ImportFailure, match='size'):
        imports.download('https://example.com/a.mp4', tmp_path/'out', 6)
    fake_connection(monkeypatch, [(200,{'Content-Length':'4'},[b'abcd'])])
    imports.download('https://example.com/a.mp4', tmp_path/'out', 6)
    assert (tmp_path/'out').read_bytes() == b'abcd'


def test_progress_fences_stale_worker_and_is_private(client, lecture):
    with SessionLocal() as db:
        db.add(Job(id='job',recording_id=lecture,status='running',attempts=2,lease_until=time.time()+100))
        db.get(Recording,lecture).status='processing'
        db.commit()
    update(lecture,'job',1,'transcribing','stale update',1,5,'sections')
    with SessionLocal() as db: assert db.get(ProcessingProgress,lecture) is None
    update(lecture,'job',2,'concepts','Extracting concepts',1,5,'sections')
    data=client.get('/api/v1/recordings/lecture/progress').json()
    assert data['current']==1 and data['worker_active']
    client.cookies.clear()
    assert client.get('/api/v1/recordings/lecture/progress').status_code==404


@pytest.mark.parametrize('stage,current,total,unit', [
    ('downloading', 1024, 2048, 'bytes'),
    ('transcribing', 30, 60, 'seconds'),
    ('concepts', 4, 6, 'sections'),
    ('prerequisites', 2, 8, 'checks'),
    ('planning', None, None, None),
    ('verification', 1, 3, 'phases'),
    ('publishing', None, None, None),
])
def test_failed_progress_and_retry_preserve_last_step(client, lecture, stage, current, total, unit):
    with SessionLocal() as db:
        db.add(Job(id='job', recording_id=lecture, status='running', attempts=1))
        db.get(Recording, lecture).status = 'processing'
        db.commit()
    update(lecture, 'job', 1, stage, 'Last completed progress update', current, total, unit)
    with SessionLocal() as db:
        db.get(Job, 'job').status = 'failed'
        rec = db.get(Recording, lecture)
        rec.status, rec.error = 'failed', 'A processing step failed.'
        db.commit()
    before = client.get('/api/v1/recordings/lecture/progress').json()
    assert before['status'] == before['stage'] == 'failed'
    assert before['detail'] == 'A processing step failed.'
    assert before['current'] is None and not before['worker_active']
    assert before['last_progress'] == {
        'stage': stage, 'detail': 'Last completed progress update',
        'current': current, 'total': total, 'unit': unit,
    }
    assert client.post('/api/v1/recordings/lecture/retry').status_code == 200
    after = client.get('/api/v1/recordings/lecture/progress').json()
    assert after['stage'] == after['status'] == 'queued'
    assert after['last_progress'] == before['last_progress']
    assert after['history'] == before['history']
    with SessionLocal() as db:
        assert db.get(Job, 'job').attempts == 1
        assert db.get(Recording, lecture).document is not None


def test_failed_progress_without_checkpoint_does_not_invent_one(client, lecture):
    with SessionLocal() as db:
        db.get(Recording, lecture).status = 'failed'
        db.commit()
    data = client.get('/api/v1/recordings/lecture/progress').json()
    assert data['stage'] == 'failed'
    assert data['last_progress'] is None and data['history'] == []


def test_link_import_requires_invite_and_permission(client, monkeypatch):
    body={'url':'https://example.com/lecture.mp4','permission_confirmed':True}
    assert client.post('/api/v1/recordings/import',json=body).status_code==403
    client.post('/api/v1/invite',json={'code':'test-invitation'})
    assert client.post('/api/v1/recordings/import',json={**body,'permission_confirmed':False}).status_code==400
    result=client.post('/api/v1/recordings/import',json=body)
    assert result.status_code==202
    rid=result.json()['id']
    assert client.get(f'/api/v1/recordings/{rid}/media').status_code==409
    assert client.get(f'/api/v1/recordings/{rid}/progress').json()['stage']=='queued'


def test_worker_import_checkpoints_media(client,monkeypatch):
    from backend.app.adaptive import worker
    from backend.app.services.storage import get_storage_adapter
    client.post('/api/v1/invite',json={'code':'test-invitation'})
    rid=client.post('/api/v1/recordings/import',json={'url':'https://example.com/lecture.mp4','permission_confirmed':True}).json()['id']
    def download(url,target,maximum):
        from pathlib import Path
        Path(target).write_bytes(b'fake-media')
    monkeypatch.setattr(imports,'download',download)
    monkeypatch.setattr(imports,'probe',lambda _:5)
    monkeypatch.setattr(worker,'transcribe',lambda *a: document().segments)
    monkeypatch.setattr(worker,'compile_document',lambda *a: document())
    assert worker.run_once()
    with SessionLocal() as db:
        rec=db.get(Recording,rid)
        assert rec.status=='ready' and rec.object_key
        assert get_storage_adapter(rec.storage_backend).path(rec.object_key).read_bytes()==b'fake-media'


def configure_email(monkeypatch):
    monkeypatch.setenv('NOTIFICATION_EMAIL_PROVIDER','ses')
    monkeypatch.setenv('SES_FROM_EMAIL','sender@example.com')
    monkeypatch.setenv('PUBLIC_APP_URL','https://learn.example.com')


def test_email_opt_in_disabled_and_private(client,lecture,monkeypatch):
    client.post('/api/v1/invite',json={'code':'test-invitation'})
    monkeypatch.setenv('NOTIFICATION_EMAIL_PROVIDER','disabled')
    assert client.post('/api/v1/recordings/lecture/notification',json={'email':'a@example.com'}).status_code==503
    configure_email(monkeypatch)
    assert client.post('/api/v1/recordings/lecture/notification',json={'email':'a@example.com\nBcc:evil'}).status_code==422
    assert client.post('/api/v1/recordings/lecture/notification',json={'email':'a@example.com'}).status_code==200
    assert 'a@example.com' not in client.get('/api/v1/recordings/lecture/progress').text
    assert client.post('/api/v1/recordings/lecture/notification',json={'email':None}).json()['status']=='cancelled'
    client.cookies.clear()
    assert client.post('/api/v1/recordings/lecture/notification',json={'email':'b@example.com'}).status_code==404


def test_email_send_only_ready_no_duplicate_and_no_lecture_content(client,lecture,monkeypatch):
    configure_email(monkeypatch)
    monkeypatch.setenv('SES_REPLY_TO_EMAIL', 'support@blindspot-edu.online')
    calls=[]
    monkeypatch.setattr(notifications,'client',lambda: SimpleNamespace(send_email=lambda **kw: calls.append(kw)))
    with SessionLocal() as db:
        db.get(Recording,lecture).status='processing'
        db.add(EmailNotice(recording_id=lecture,email='a@example.com'))
        db.commit()
    assert not notifications.deliver_one()
    with SessionLocal() as db:
        db.get(Recording,lecture).status='ready';db.commit()
    assert notifications.deliver_one()
    assert not notifications.deliver_one()
    assert len(calls)==1
    assert 'https://learn.example.com/workspace/lecture' in str(calls)
    assert calls[0].get('ReplyToAddresses') == ['support@blindspot-edu.online']
    assert 'fractions' not in str(calls)
    with SessionLocal() as db:
        notice=db.get(EmailNotice,lecture)
        assert notice.status=='sent' and notice.email==''


def test_email_failure_keeps_lesson_ready_and_retries(client,lecture,monkeypatch):
    configure_email(monkeypatch)
    monkeypatch.setattr(notifications,'send',lambda *a: (_ for _ in ()).throw(RuntimeError('secret')))
    with SessionLocal() as db:
        db.add(EmailNotice(recording_id=lecture,email='a@example.com'));db.commit()
    for i in range(3):
        with SessionLocal() as db:
            db.get(EmailNotice,lecture).next_attempt=0;db.commit()
        assert notifications.deliver_one()
    with SessionLocal() as db:
        assert db.get(Recording,lecture).status=='ready'
        assert db.get(EmailNotice,lecture).status=='failed'
    assert not notifications.deliver_one()


def test_email_omits_unconfigured_reply_to(monkeypatch):
    configure_email(monkeypatch)
    monkeypatch.delenv('SES_REPLY_TO_EMAIL', raising=False)
    calls=[]
    monkeypatch.setattr(notifications,'client',lambda: SimpleNamespace(send_email=lambda **kw: calls.append(kw)))
    notifications.send('student@example.com','lecture')
    assert 'ReplyToAddresses' not in calls[0]
