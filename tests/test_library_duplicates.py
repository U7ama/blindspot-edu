"""Only byte-identical ready recordings are collapsed in a learner library."""

import hashlib
from backend.app.adaptive.models import MediaIdentity, Recording
from backend.app.core.db import SessionLocal
from conftest import document


def test_library_keeps_latest_exact_copy_but_not_same_named_other_media(client):
    owner = hashlib.sha256(client.cookies['blindspot_learner'].encode()).hexdigest()
    with SessionLocal() as db:
        for rid, rec_owner, created, digest, public in (
            ('old', 'other', 1, 'a' * 64, True),
            ('new', owner, 3, 'a' * 64, False),
            ('different', owner, 2, 'b' * 64, False),
        ):
            db.add(Recording(id=rid, owner_id=rec_owner, title='Same filename.mp4',
                             storage_backend='local', object_key=rid+'.mp4', status='ready',
                             public=public, duration=10, created_at=created,
                             document=document().model_dump()))
            db.add(MediaIdentity(recording_id=rid, sha256=digest))
        db.commit()
    result = client.get('/api/v1/recordings')
    assert result.status_code == 200
    ids = [row['id'] for row in result.json()]
    assert ids == ['new', 'different']


def test_new_upload_replaces_older_ready_copy_immediately(client):
    owner = hashlib.sha256(client.cookies['blindspot_learner'].encode()).hexdigest()
    with SessionLocal() as db:
        for rid, status, created in (('old', 'ready', 1), ('new', 'queued', 2)):
            db.add(Recording(id=rid, owner_id=owner, title='Lecture.mp4',
                             storage_backend='local', object_key=rid+'.mp4', status=status,
                             public=False, duration=10, created_at=created,
                             document=document().model_dump() if status == 'ready' else None))
            db.add(MediaIdentity(recording_id=rid, sha256='a' * 64))
        db.commit()
    ids = [row['id'] for row in client.get('/api/v1/recordings').json()]
    assert ids == ['new']
