import hashlib
import os
from pathlib import Path
import secrets
import tempfile
import subprocess
import asyncio
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from starlette.requests import ClientDisconnect
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import or_, text
from backend.app.core.db import get_db
from backend.app.services.storage import get_storage_adapter
from backend.app.services.ai.llm import chat_completion
from .models import Learner, Recording, MediaIdentity, LearningState, Attempt, Job, Asset, ProcessingProgress, ImportSource, EmailNotice, TranscriptCache
from .contracts import Document
from .session import command, answer, snapshot, public_document, questions, TransitionError
from .saved_documents import load_saved_document
from .budget import actor, AllowanceExceeded
from .media import probe, ALLOWED

router = APIRouter()
COOKIE = 'blindspot_learner'
# Keep the two reviewed public demonstrations first; other recordings stay newest-first.
FEATURED_RECORDING_IDS = (
    '52987a05f44a40bcb370ae36195a1c1c',
    '08b20015c07942189fa0b6dc8debaf16',
)

def identity(request: Request, response: Response, db=Depends(get_db)):
    raw = request.cookies.get(COOKIE, '')
    if len(raw) > 100:
        raw = ''
    key = hashlib.sha256(raw.encode()).hexdigest() if raw else ''
    learner = db.get(Learner, key) if key else None
    if not learner:
        raw = secrets.token_urlsafe(32)
        key = hashlib.sha256(raw.encode()).hexdigest()
        learner = Learner(id=key, preferences={'voice': 'Browser', 'language': 'English'})
        db.add(learner)
        db.commit()
        response.set_cookie(COOKIE, raw, httponly=True, secure=os.getenv('APP_ENV') == 'production', samesite='strict', max_age=60*60*24*60)
    return learner

def recording(db, rid, learner):
    rec = db.get(Recording, rid)
    if not rec or not (rec.public or rec.owner_id == learner.id):
        raise HTTPException(404, 'Recording not found')
    return rec

def saved_lesson(rec):
    if rec.status != 'ready' or not rec.document:
        raise HTTPException(409, 'The lecture is not ready; processing may still be running or may have failed')
    try:
        return load_saved_document(rec.document)
    except ValidationError as exc:
        raise HTTPException(409, 'This saved lesson has invalid data and needs administrator repair. Your recording is preserved.') from exc

def ready(rec):
    return saved_lesson(rec)[0]

def state_for(db, learner, rec, doc):
    state = db.query(LearningState).filter_by(learner_id=learner.id, recording_id=rec.id).first()
    if not state:
        state = LearningState(id=uuid.uuid4().hex, learner_id=learner.id, recording_id=rec.id, phase_id=doc.phases[0].id, progress={}, revision=0, generation=0, ended=False)
        db.add(state)
        db.flush()
    elif state.active and state.active.get('question_id') and state.active['question_id'] not in questions(doc):
        # Preserve the learner's place and progress when an older quiz is unavailable.
        state.active = None
        state.revision += 1
    return state

def transaction(db):
    # Dependencies may have opened a read transaction. Reserve writes before reading state.
    db.commit()
    if db.bind.dialect.name == 'sqlite':
        db.execute(text('BEGIN IMMEDIATE'))

def summary(r):
    return {'id': r.id, 'title': r.title, 'filename': r.title, 'status': r.status, 'public': r.public, 'duration': r.duration, 'error': r.error, 'created_at': r.created_at, 'cached': r.status == 'ready'}

@router.get('/me')
def me(learner=Depends(identity)):
    from .notifications import enabled
    return {'email_notifications_enabled': bool(enabled()), 'invited': learner.invited, 'preferences': learner.preferences, 'limits': {'upload_bytes': int(os.getenv('MAX_UPLOAD_BYTES', '104857600')), 'duration_seconds': int(os.getenv('MAX_DURATION_SECONDS', '3600'))}}

class Invite(BaseModel):
    code: str = Field(min_length=1, max_length=100)

@router.post('/invite')
def invite(body: Invite, learner=Depends(identity), db=Depends(get_db)):
    expected = os.getenv('PILOT_INVITE_CODE', '')
    if not expected or not secrets.compare_digest(body.code, expected):
        raise HTTPException(403, 'Invalid or unavailable pilot invitation')
    learner.invited = True
    db.commit()
    return {'invited': True}

class Preferences(BaseModel):
    voice: str = 'Browser'
    language: str = 'English'

@router.post('/preferences')
def preferences(body: Preferences, learner=Depends(identity), db=Depends(get_db)):
    if body.voice not in ('Joanna', 'Matthew', 'Browser') or body.language != 'English':
        raise HTTPException(400, 'This release supports English with Joanna, Matthew, or Browser voice')
    learner.preferences = body.model_dump()
    db.commit()
    return learner.preferences

@router.get('/recordings')
def recordings(learner=Depends(identity), db=Depends(get_db)):
    accessible = db.query(Recording).filter(or_(Recording.public.is_(True), Recording.owner_id == learner.id)).order_by(Recording.created_at.desc(), Recording.id.desc()).all()
    featured = {rid: index for index, rid in enumerate(FEATURED_RECORDING_IDS)}
    accessible.sort(key=lambda rec: featured.get(rec.id, len(featured))
                    if rec.public and rec.status == 'ready' else len(featured))
    identities = {row.recording_id: row.sha256 for row in db.query(MediaIdentity).filter(MediaIdentity.recording_id.in_([r.id for r in accessible])).all()}
    seen = set()
    visible = []
    for rec in accessible:
        digest = identities.get(rec.id)
        if digest and digest in seen:
            continue
        if digest:
            seen.add(digest)
        visible.append(summary(rec))
    return visible

@router.post('/recordings', status_code=202)
async def upload(request: Request, filename: str, learner=Depends(identity), db=Depends(get_db)):
    if not learner.invited:
        raise HTTPException(403, 'Uploads are limited to invited pilot participants')
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED or len(filename) > 200:
        raise HTTPException(400, 'Unsupported recording type')
    if db.query(Recording).filter(Recording.owner_id == learner.id).count() >= int(os.getenv('MAX_RECORDINGS_PER_LEARNER', '50')):
        raise HTTPException(429, 'Pilot upload allowance reached')
    maximum = int(os.getenv('MAX_UPLOAD_BYTES', '104857600'))
    size = 0
    digest = hashlib.sha256()
    with tempfile.NamedTemporaryFile(suffix=suffix) as file:
        try:
            async for chunk in request.stream():
                size += len(chunk)
                if size > maximum:
                    raise HTTPException(413, 'Recording exceeds the upload size limit')
                digest.update(chunk)
                file.write(chunk)
        except ClientDisconnect as exc:
            raise HTTPException(400, 'Upload interrupted before completion. Please retry the recording.') from exc
        file.flush()
        try:
            duration = await asyncio.to_thread(probe, file.name)
        except (ValueError, TimeoutError, subprocess.TimeoutExpired) as exc:
            raise HTTPException(400, 'Recording must contain valid audio within the duration limit') from exc
        storage = get_storage_adapter()
        key = await asyncio.to_thread(storage.save, file.name, filename)
    transaction(db)
    if db.query(Recording).filter(Recording.owner_id == learner.id).count() >= int(os.getenv('MAX_RECORDINGS_PER_LEARNER', '50')):
        db.rollback()
        await asyncio.to_thread(storage.delete, key)
        raise HTTPException(429, 'Pilot upload allowance reached')
    rec = Recording(id=uuid.uuid4().hex, owner_id=learner.id, title=Path(filename).name, storage_backend=storage.backend, object_key=key, duration=duration)
    db.add(rec)
    db.add(MediaIdentity(recording_id=rec.id, sha256=digest.hexdigest()))
    db.add(Job(id=uuid.uuid4().hex, recording_id=rec.id))
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(key)
        raise
    return summary(rec)


class LinkImport(BaseModel):
    url: str = Field(min_length=8, max_length=4096)
    permission_confirmed: bool


@router.post('/recordings/import', status_code=202)
def import_link(body: LinkImport, learner=Depends(identity), db=Depends(get_db)):
    from .imports import classify_url, ImportFailure
    if not learner.invited:
        raise HTTPException(403, 'Link imports are limited to invited pilot participants')
    if not body.permission_confirmed:
        raise HTTPException(400, 'Confirm you have permission to process this recording')
    try:
        kind, url = classify_url(body.url.strip())
    except ImportFailure as exc:
        raise HTTPException(400, str(exc)) from None
    transaction(db)
    if db.query(Recording).filter(Recording.owner_id == learner.id).count() >= int(os.getenv('MAX_RECORDINGS_PER_LEARNER', '50')):
        raise HTTPException(429, 'Pilot upload allowance reached')
    rid = uuid.uuid4().hex
    rec = Recording(id=rid, owner_id=learner.id, title='YouTube recording' if kind == 'youtube' else 'Linked recording',
                    storage_backend=get_storage_adapter().backend, object_key='', duration=0, status='queued')
    db.add(rec)
    db.add(Job(id=uuid.uuid4().hex, recording_id=rid))
    db.add(ImportSource(recording_id=rid, url=url, kind=kind))
    db.commit()
    return summary(rec)


@router.get('/recordings/{rid}/progress')
def processing_progress(rid: str, learner=Depends(identity), db=Depends(get_db)):
    rec = recording(db, rid, learner)
    progress = db.get(ProcessingProgress, rid)
    job = db.query(Job).filter_by(recording_id=rid).first()
    notice = db.get(EmailNotice, rid) if rec.owner_id == learner.id else None
    terminal = rec.status in ('ready', 'failed', 'insufficient_content')
    return {
        'status': rec.status,
        'stage': rec.status if terminal or rec.status == 'queued' else (progress.stage if progress else 'processing'),
        'detail': rec.error if terminal and rec.error else ('Your lesson is ready.' if rec.status == 'ready'
            else 'Waiting for the processing worker.' if rec.status == 'queued'
            else progress.detail if progress else 'Processing this recording.'),
        'current': progress.current if progress and not terminal else None,
        'total': progress.total if progress and not terminal else None,
        'unit': progress.unit if progress and not terminal else None,
        'updated_at': progress.updated_at if progress else rec.created_at,
        'created_at': rec.created_at,
        'worker_active': bool(job and job.status == 'running' and job.lease_until > time.time()),
        'history': progress.history if progress else [],
        'last_progress': {
            'stage': progress.stage, 'detail': progress.detail,
            'current': progress.current, 'total': progress.total, 'unit': progress.unit,
        } if progress else None,
        'email_status': notice.status if notice else None
    }


class EmailSubscription(BaseModel):
    email: str | None = Field(default=None, max_length=254, pattern=r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$")


@router.post('/recordings/{rid}/notification')
def subscribe(rid: str, body: EmailSubscription, learner=Depends(identity), db=Depends(get_db)):
    from .notifications import enabled
    transaction(db)
    rec = recording(db, rid, learner)
    if not learner.invited or rec.owner_id != learner.id or rec.public:
        raise HTTPException(403, 'Email alerts are only available for your own recordings')
    notice = db.get(EmailNotice, rid)
    if notice and notice.attempts:
        raise HTTPException(409, 'This notification has already been sent or is being delivered')
    if body.email is None:
        if notice:
            db.delete(notice)
        db.commit()
        return {'status': 'cancelled'}
    if not enabled():
        raise HTTPException(503, 'Email delivery has not been configured. Browser and voice alerts remain available.')
    if rec.status in ('failed', 'insufficient_content'):
        raise HTTPException(409, 'Retry processing successfully before enabling an email alert')
    if notice:
        notice.email = body.email
    else:
        db.add(EmailNotice(recording_id=rid, email=body.email))
    db.commit()
    return {'status': 'pending'}

@router.get('/recordings/{rid}')
def get_recording(rid: str, learner=Depends(identity), db=Depends(get_db)):
    rec = recording(db, rid, learner)
    warnings = []
    doc = None
    if rec.status == 'ready':
        saved, warnings = saved_lesson(rec)
        doc = public_document(saved)
    segments = []
    if doc:
        segments = doc.get('segments', []) if isinstance(doc, dict) else getattr(doc, 'segments', [])
    else:
        cached = db.get(TranscriptCache, rid)
        if cached and cached.segments:
            segments = cached.segments
    return {**summary(rec), 'document': doc, 'segments': segments, 'content_warnings': warnings}

@router.post('/recordings/{rid}/retry')
def retry(rid: str, learner=Depends(identity), db=Depends(get_db)):
    transaction(db)
    rec = recording(db, rid, learner)
    if rec.public or rec.owner_id != learner.id or rec.status != 'failed':
        raise HTTPException(409, 'Only your failed private recordings can be retried')
    job = db.query(Job).filter_by(recording_id=rid).one()
    if job.attempts >= 3:
        raise HTTPException(429, 'Retry limit reached; ask the pilot administrator to inspect the failure')
    job.status, rec.status, rec.error = 'queued', 'queued', None
    db.commit()
    return summary(rec)

@router.get('/recordings/{rid}/media')
def media(rid: str, learner=Depends(identity), db=Depends(get_db)):
    rec = recording(db, rid, learner)
    if not rec.object_key:
        raise HTTPException(409, 'The linked recording is still being downloaded')
    storage = get_storage_adapter(rec.storage_backend)
    url = storage.playback_url(rec.object_key)
    if url:
        return RedirectResponse(url, headers={'Cache-Control': 'private, no-store'})
    path = storage.path(rec.object_key)
    if not path.exists():
        raise HTTPException(404, 'Recording file is unavailable')
    return FileResponse(path, headers={'Cache-Control': 'private, no-store'})

@router.post('/recordings/{rid}/session')
def resume(rid: str, learner=Depends(identity), db=Depends(get_db)):
    transaction(db)
    rec = recording(db, rid, learner)
    doc = ready(rec)
    state = state_for(db, learner, rec, doc)
    db.commit()
    return snapshot(state, doc)

class Command(BaseModel):
    action: str = Field(max_length=40)
    target: str | None = Field(default=None, max_length=200)
    revision: int = Field(ge=0)

@router.post('/recordings/{rid}/command')
def dispatch(rid: str, body: Command, learner=Depends(identity), db=Depends(get_db)):
    transaction(db)
    rec = recording(db, rid, learner)
    doc = ready(rec)
    state = state_for(db, learner, rec, doc)
    if state.revision != body.revision:
        raise HTTPException(409, 'Session changed; refresh to resume the latest state')
    try:
        result = command(state, doc, body.action, body.target)
    except TransitionError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    return result

class Answer(BaseModel):
    request_id: uuid.UUID
    question_id: str = Field(max_length=200)
    selected_index: int = Field(ge=0, le=5)
    revision: int = Field(ge=0)

@router.post('/recordings/{rid}/answer')
def submit(rid: str, body: Answer, learner=Depends(identity), db=Depends(get_db)):
    transaction(db)
    rec = recording(db, rid, learner)
    doc = ready(rec)
    state = state_for(db, learner, rec, doc)
    attempt_id = hashlib.sha256(f'{state.id}:{state.generation}:{body.request_id}'.encode()).hexdigest()
    previous = db.get(Attempt, attempt_id)
    if previous:
        if previous.question_id != body.question_id or previous.selected_index != body.selected_index:
            raise HTTPException(409, 'Submission ID was already used with different data')
        # Preserve feedback while returning the latest state, never a stale revision.
        return {**previous.response, 'state': snapshot(state, doc)}
    if state.revision != body.revision:
        raise HTTPException(409, 'Session changed; resume before answering')
    try:
        result = answer(state, doc, body.question_id, body.selected_index)
    except TransitionError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.add(Attempt(id=attempt_id, state_id=state.id, question_id=body.question_id, selected_index=body.selected_index, response=result))
    db.commit()
    return result

class SourceQuery(BaseModel):
    evidence_ids: list[str] = Field(default_factory=list, max_length=200)

@router.post('/recordings/{rid}/source')
def source(rid: str, body: SourceQuery, learner=Depends(identity), db=Depends(get_db)):
    doc = ready(recording(db, rid, learner))
    by_id = {s.id: s for s in doc.segments}
    if not body.evidence_ids or not set(body.evidence_ids) <= by_id.keys():
        return {'type': 'source_unavailable', 'message': 'No supporting excerpt found.'}
    return {'type': 'jumped_to_timestamp', 'segments': [by_id[i].model_dump() for i in body.evidence_ids]}

class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=1500)

class TeachingResponse(BaseModel):
    explanation: str
    steps: list[str] = Field(default_factory=list, max_length=6)

@router.post('/recordings/{rid}/question')
def ask(rid: str, body: Ask, learner=Depends(identity), db=Depends(get_db)):
    transaction(db)
    rec = recording(db, rid, learner)
    doc = ready(rec)
    state = state_for(db, learner, rec, doc)
    db.commit()
    phase = next(p for p in doc.phases if p.id == state.phase_id)
    context = [s.model_dump() for s in doc.segments if s.id in phase.evidence_ids]
    token = actor.set(learner.id)
    try:
        result = chat_completion('Answer the question in the context of this lesson. This is supplementary teaching, not a verified quote. If not relevant, redirect to the lesson. Say when unsure. Return explanation and a short visual step list.', __import__('json').dumps({'phase': phase.title, 'evidence': context, 'prerequisites': [{'id': c.id, 'name': c.name, 'coverage': c.coverage, 'explanation': c.remediation.explanation if c.remediation else None, 'worked_example': c.remediation.worked_example if c.remediation else None} for c in doc.concepts if c.id in phase.prerequisite_ids], 'remediation_context': {'concept_id': (state.active or {}).get('concept_id'), 'mode': (state.active or {}).get('mode')}, 'question': body.question}), response_model=TeachingResponse, max_tokens=1200)
    finally:
        actor.reset(token)
    return {**result.model_dump(), 'provenance': 'Supplementary teaching', 'related_evidence_ids': phase.evidence_ids, 'verification': 'not_verified_against_lecture'}

class Narration(BaseModel):
    kind: str = Field(pattern='^(phase|remediation)$')
    target: str = Field(max_length=200)

@router.post('/recordings/{rid}/narration')
def narration(rid: str, body: Narration, learner=Depends(identity), db=Depends(get_db)):
    from .speech import narrate
    rec = recording(db, rid, learner)
    doc = ready(rec)
    if body.kind == 'phase':
        item = next((p for p in doc.phases if p.id == body.target), None)
        text_content = item.teaching_script if item else None
    else:
        item = next((c for c in doc.concepts if c.id == body.target), None)
        text_content = f'{item.remediation.explanation} {item.remediation.worked_example}' if item and item.remediation else None
    if not text_content:
        raise HTTPException(404, 'Narration material not found')
    token = actor.set(learner.id)
    try:
        asset = narrate(db, rec, learner, text_content)
    finally:
        actor.reset(token)
    return {'audio_url': f'/api/v1/assets/{asset.id}', 'cached': True, 'provider': 'polly'}

@router.get('/assets/{aid}')
def asset(aid: str, learner=Depends(identity), db=Depends(get_db)):
    item = db.get(Asset, aid)
    if not item:
        raise HTTPException(404, 'Audio not found')
    rec = recording(db, item.recording_id, learner)
    if not rec.public and item.owner_id != learner.id:
        raise HTTPException(404, 'Audio not found')
    storage = get_storage_adapter(item.storage_backend)
    url = storage.playback_url(item.object_key)
    return RedirectResponse(url) if url else FileResponse(storage.path(item.object_key), media_type='audio/mpeg')
