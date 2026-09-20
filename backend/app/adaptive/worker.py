"""Single-worker lease queue. Kill/restart safely; output publication is atomic."""
import logging
import threading
import time
from sqlalchemy import text
from backend.app.core.db import SessionLocal, init_db
from backend.app.services.storage import get_storage_adapter
from .models import Job, Recording
from .contracts import Document
from .compiler import compile_document
from .media import transcribe
from .budget import actor

logger = logging.getLogger(__name__)

def claim():
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        if db.query(Job).filter(Job.status == 'running', Job.lease_until >= time.time()).first():
            return None
        job = db.query(Job).filter((Job.status == 'queued') | ((Job.status == 'running') & (Job.lease_until < time.time()))).first()
        if not job:
            return None
        if job.attempts >= 3:
            job.status = 'failed'
            rec = db.get(Recording, job.recording_id)
            rec.status, rec.error = 'failed', 'Processing interrupted repeatedly. Retry after checking worker health.'
            db.commit()
            return None
        job.status, job.lease_until = 'running', time.time() + 120
        job.attempts += 1
        rec = db.get(Recording, job.recording_id)
        rec.status = 'processing'
        db.commit()
        return job.id, rec.id, rec.owner_id, rec.storage_backend, rec.object_key, job.attempts

def run_once():
    item = claim()
    if not item:
        return False
    jid, rid, owner, backend, key, attempt = item
    stop = threading.Event()
    def heartbeat():
        while not stop.wait(20):
            with SessionLocal() as db:
                db.query(Job).filter(Job.id == jid, Job.status == 'running', Job.attempts == attempt).update({'lease_until': time.time() + 120})
                db.commit()
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    token = actor.set(owner)
    try:
        with get_storage_adapter(backend).local_copy(key) as path:
            document = compile_document(transcribe(path, rid))
        document = Document.model_validate(document)
        with SessionLocal() as db:
            db.execute(text('BEGIN IMMEDIATE'))
            rec, job = db.get(Recording, rid), db.get(Job, jid)
            if job.status != 'running' or job.attempts != attempt:
                return True
            rec.document, rec.status, rec.error = document.model_dump(), 'ready', None
            job.status = 'done'
            db.commit()
    except Exception as exc:
        logger.error('Processing failed: %s', type(exc).__name__)
        with SessionLocal() as db:
            db.execute(text('BEGIN IMMEDIATE'))
            rec, job = db.get(Recording, rid), db.get(Job, jid)
            if job.status != 'running' or job.attempts != attempt:
                return True
            rec.status, rec.error, job.status = 'failed', 'Processing or verification failed. Your recording is preserved; retry after checking configuration and allowance.', 'failed'
            db.commit()
    finally:
        actor.reset(token)
        stop.set()
        thread.join(timeout=2)
    return True

def main():
    init_db()
    while True:
        if not run_once():
            time.sleep(2)

if __name__ == '__main__':
    main()
