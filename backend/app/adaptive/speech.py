import hashlib
import os
import tempfile
from functools import lru_cache
from sqlalchemy.exc import IntegrityError
from .models import Asset
from .budget import reserve
from backend.app.services.storage import get_storage_adapter

@lru_cache(maxsize=1)
def client():
    import boto3
    from botocore.config import Config
    return boto3.client('polly', region_name=os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION'), config=Config(connect_timeout=5, read_timeout=30, retries={'total_max_attempts': 2, 'mode': 'adaptive'}))

def narrate(db, rec, learner, text):
    voice = learner.preferences.get('voice', 'Joanna')
    if voice not in ('Joanna', 'Matthew'):
        raise ValueError('Unsupported Polly voice')
    key = hashlib.sha256(f'{rec.id}:polly:neural:{voice}:{text}'.encode()).hexdigest()
    existing = db.get(Asset, key)
    if existing:
        return existing
    if os.getenv('TTS_PROVIDER', 'disabled') != 'polly':
        raise RuntimeError('Cloud narration is not configured. The complete lesson remains available as text.')
    if len(text) > 2800:
        raise ValueError('Narration exceeds the per-call character limit; read this lesson as text')
    db.commit()
    reserve('polly', len(text) * 2)  # reserve for bounded SDK retry as well
    result = client().synthesize_speech(Text=text, VoiceId=voice, Engine='neural', OutputFormat='mp3')
    storage = get_storage_adapter(rec.storage_backend)
    with tempfile.NamedTemporaryFile(suffix='.mp3') as file:
        with result['AudioStream'] as stream:
            while chunk := stream.read(65536):
                file.write(chunk)
        file.flush()
        object_key = storage.save(file.name, 'narration.mp3')
    item = Asset(id=key, owner_id=learner.id, recording_id=rec.id, storage_backend=storage.backend, object_key=object_key)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        storage.delete(object_key)
        return db.get(Asset, key)
    return item
