"""Observable work checkpoints, never model reasoning or guessed completion percentages."""
import time
from contextvars import ContextVar
from sqlalchemy import text
from backend.app.core.db import SessionLocal
from .models import ProcessingProgress, Job

reporter = ContextVar('processing_reporter', default=None)


def report(stage, detail, current=None, total=None, unit=None):
    callback = reporter.get()
    if callback:
        callback(stage, detail, current, total, unit)


def update(rid, jid, attempt, stage, detail, current=None, total=None, unit=None):
    with SessionLocal() as db:
        db.execute(text('BEGIN IMMEDIATE'))
        job = db.get(Job, jid)
        if not job or job.status != 'running' or job.attempts != attempt:
            return
        row = db.get(ProcessingProgress, rid)
        now = time.time()
        if row is None:
            row = ProcessingProgress(recording_id=rid, history=[])
            db.add(row)
        history = list(row.history or [])
        if not history or history[-1]['stage'] != stage:
            history.append({'stage': stage, 'detail': detail, 'at': now})
        row.stage, row.detail = stage, detail
        row.current, row.total, row.unit = current, total, unit
        row.history, row.updated_at = history[-30:], now
        db.commit()
