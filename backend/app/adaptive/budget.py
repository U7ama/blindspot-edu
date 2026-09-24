"""Conservative pre-call reservations across API and worker processes."""
import os
import time
import uuid
from contextvars import ContextVar
from sqlalchemy import func, text
from backend.app.core.db import SessionLocal
from .models import Usage

actor = ContextVar('usage_actor', default='worker')

class AllowanceExceeded(RuntimeError):
    pass

def reserve(service, input_units, output_units=0, *, attempts=2):
    if service == 'polly':
        amount = input_units * float(os.getenv('POLLY_USD_PER_MILLION_CHARS', '16')) / 1_000_000
    else:
        # Callers with explicit retries reserve each attempt immediately before sending.
        amount = attempts * (input_units * float(os.getenv('LLM_INPUT_USD_PER_MILLION', '1')) + output_units * float(os.getenv('LLM_OUTPUT_USD_PER_MILLION', '8'))) / 1_000_000
    with SessionLocal() as db:
        if db.bind.dialect.name == 'sqlite':
            db.execute(text('BEGIN IMMEDIATE'))
        used = db.query(func.coalesce(func.sum(Usage.reserved_usd), 0)).scalar()
        own = db.query(func.coalesce(func.sum(Usage.reserved_usd), 0)).filter(Usage.actor == actor.get()).scalar()
        count = db.query(Usage).filter(Usage.actor == actor.get(), Usage.created_at > time.time() - 86400).count()
        if used + amount > float(os.getenv('AI_TOTAL_ALLOWANCE_USD', '100')) or own + amount > float(os.getenv('AI_LEARNER_ALLOWANCE_USD', '25')) or count >= int(os.getenv('AI_DAILY_CALL_LIMIT', '1000')):
            raise AllowanceExceeded('Dynamic generation allowance reached. Saved lessons and source playback remain available.')
        entry = Usage(id=uuid.uuid4().hex, actor=actor.get(), service=service, reserved_usd=amount, input_units=input_units, output_units=output_units)
        db.add(entry)
        db.commit()
        return entry.id


def reconcile(reservation_id, input_tokens, output_tokens):
    """Replace one attempt's estimate with reported token cost; missing usage stays reserved."""
    if any(type(n) is not int or n < 0 for n in (input_tokens, output_tokens)):
        return
    amount = (input_tokens * float(os.getenv('LLM_INPUT_USD_PER_MILLION', '1'))
              + output_tokens * float(os.getenv('LLM_OUTPUT_USD_PER_MILLION', '8'))) / 1_000_000
    with SessionLocal() as db:
        if db.bind.dialect.name == 'sqlite':
            db.execute(text('BEGIN IMMEDIATE'))
        entry = db.get(Usage, reservation_id)
        if entry and entry.service == 'llm':
            entry.reserved_usd = amount
            entry.input_units = input_tokens
            entry.output_units = output_tokens
            db.commit()
