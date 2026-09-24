"""Single-worker lease queue. Kill/restart safely; output publication is atomic."""
import logging
import threading
import time
from sqlalchemy import text
from backend.app.core.db import SessionLocal, init_db
from backend.app.services.storage import get_storage_adapter
from .models import Job, Recording
from .progress import reporter, report, update
from .contracts import Document
from .compiler import compile_document, InsufficientContent, GenerationValidationError
from .media import transcribe
from .transcripts import fingerprint, load_transcript, save_transcript
from .budget import actor, AllowanceExceeded
from botocore.exceptions import ClientError, NoCredentialsError, PartialCredentialsError

logger = logging.getLogger(__name__)

def failure_message(exc, stage):
    # Never persist raw provider/Pydantic messages: they may contain input text or secrets.
    from .imports import ImportFailure
    if isinstance(exc, ImportFailure):
        return str(exc)
    if isinstance(exc, InsufficientContent):
        return str(exc)
    if isinstance(exc, GenerationValidationError):
        return f'{exc.stage} could not be validated. No unverified lesson was published; your saved transcript is preserved for retry.'
    if isinstance(exc, ModuleNotFoundError):
        return f'{stage} could not start because a required Python package is missing. Install requirements.txt in the worker virtual environment, restart the worker, then retry.'
    if isinstance(exc, AllowanceExceeded):
        return 'Generation allowance reached. Ask the administrator to review the usage limits before retrying. Your recording is preserved.'
    if isinstance(exc, (NoCredentialsError, PartialCredentialsError)):
        return 'AWS credentials are unavailable to the worker. Configure its AWS access and restart it before retrying.'
    if isinstance(exc, ClientError):
        code = exc.response.get('Error', {}).get('Code', '')
        if code in ('AccessDenied', 'AccessDeniedException', 'UnauthorizedException', 'UnrecognizedClientException'):
            return f'{stage} was denied by AWS. Verify credentials, IAM permissions and model access before retrying.'
        if code == 'ValidationException':
            return f'{stage} was rejected by AWS. Verify the configured model, region, model authorization and request compatibility before retrying.'
        if code in ('ThrottlingException', 'TooManyRequestsException'):
            return f'{stage} was throttled by AWS. Wait briefly before retrying.'
        return f'{stage} failed at the AWS service. Ask the administrator to check service availability and configuration.'
    try:
        import openai
        if isinstance(exc, openai.AuthenticationError):
            return 'AI provider authentication failed. Check the configured LLM API key before retrying. Your recording and transcript are preserved.'
        if isinstance(exc, openai.PermissionDeniedError):
            return 'AI provider quota or access limit reached. Add provider credits or check model access before retrying. Your recording and transcript are preserved.'
        if isinstance(exc, openai.RateLimitError):
            return 'AI provider rate limit reached. Wait briefly before retrying. Your recording and transcript are preserved.'
    except ImportError:
        pass
    if isinstance(exc, FileNotFoundError):
        return f'{stage} could not find a required local file or executable. Check the recording, FFmpeg and worker installation before retrying.'
    if stage == 'Transcription':
        if isinstance(exc, ValueError):
            return str(exc)
        return 'Transcription failed. Check the local Whisper model, available memory and audio format before retrying. Your recording is preserved.'
    if stage == 'Lesson generation' and isinstance(exc, ValueError):
        return 'Lesson generation or evidence verification failed; no unverified lesson was published. Your recording is preserved for retry.'
    return f'{stage} failed. Your recording is preserved; ask the administrator to inspect the worker diagnostics before retrying.'


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
    progress_token = reporter.set(lambda *args: update(rid, jid, attempt, *args))
    stage = 'Recording retrieval'
    try:
        report('retrieving', 'Opening the saved recording.')
        if not key:
            from .imports import import_recording
            backend, key = import_recording(rid, jid, attempt)
        cache_key = fingerprint(backend, key)
        segments = load_transcript(rid, cache_key)
        if segments is None:
            with get_storage_adapter(backend).local_copy(key) as path:
                stage = 'Transcription'
                report('transcribing', 'Preparing speech recognition. The first run may need to download the model.')
                segments = transcribe(path, rid)
                if not segments:
                    raise ValueError('No clear spoken words were detected in this recording. Please make sure the audio contains audible speech or upload a lecture recording.')
            stage = 'Transcript checkpoint'
            if not save_transcript(rid, cache_key, segments, jid, attempt):
                return True
            logger.info('Recording %s: completed transcript saved', rid)
        else:
            report('transcript_saved', 'Reusing the saved transcript; no repeat transcription needed.')
            logger.info('Recording %s: reusing saved transcript', rid)
        stage = 'Lesson generation'
        report('concepts', 'Starting analysis of the saved transcript.')
        document = compile_document(segments)
        document = Document.model_validate(document)
        stage = 'Lesson publication'
        report('publishing', 'Saving your verified lesson and preparing the workspace.')
        with SessionLocal() as db:
            db.execute(text('BEGIN IMMEDIATE'))
            rec, job = db.get(Recording, rid), db.get(Job, jid)
            if job.status != 'running' or job.attempts != attempt:
                return True
            rec.document, rec.status, rec.error = document.model_dump(), 'ready', None
            job.status = 'done'
            db.commit()
    except Exception as exc:
        message = failure_message(exc, stage)
        logger.error('Recording %s failed at %s (%s): %s', rid, stage, type(exc).__name__, message)
        with SessionLocal() as db:
            db.execute(text('BEGIN IMMEDIATE'))
            rec, job = db.get(Recording, rid), db.get(Job, jid)
            if job.status != 'running' or job.attempts != attempt:
                return True
            if isinstance(exc, InsufficientContent):
                rec.status, rec.error, rec.document, job.status = 'insufficient_content', message, None, 'done'
            else:
                rec.status, rec.error, job.status = 'failed', message, 'failed'
            db.commit()
    finally:
        reporter.reset(progress_token)
        actor.reset(token)
        stop.set()
        thread.join(timeout=2)
    return True

def main():
    init_db()
    while True:
        from .notifications import deliver_one
        deliver_one()
        if not run_once():
            time.sleep(2)

if __name__ == '__main__':
    main()
