"""Validated cache reuse with retained origin; old untracked aliases remain unknown."""
import hashlib
import logging
import os
import time
from sqlalchemy.exc import SQLAlchemyError
from backend.app.core.db import SessionLocal
from .models import LLMCache, LLMCacheOrigin

logger = logging.getLogger(__name__)


def key_for(provider, model, system, prompt):
    # Preserve existing keys so completed recordings do not need regenerated steps.
    return hashlib.sha256(f'{provider}:{model}:{system}:{prompt}'.encode()).hexdigest()


def inherited_models(provider, model):
    # Preserve the specifically requested Kimi -> Qwen continuation; no blanket reverse reuse.
    default = 'kimi-k3' if provider in ('qwen', 'modelstudio') and model == 'qwen3.7-plus' else ''
    return [m.strip() for m in os.getenv('LLM_CACHE_INHERIT_MODELS', default).split(',') if m.strip() and m.strip() != model]


def read(provider, model, system, prompt, shape):
    key = key_for(provider, model, system, prompt)
    candidates = [key] + [key_for(provider, previous, system, prompt) for previous in inherited_models(provider, model)]
    try:
        with SessionLocal() as db:
            for source_key in candidates:
                saved = db.get(LLMCache, source_key)
                if not saved:
                    continue
                try:
                    parsed = shape.model_validate_json(saved.response.strip()) if shape else saved.response
                except ValueError:
                    continue  # Never promote a schema-invalid legacy response.
                origin = db.get(LLMCacheOrigin, source_key)
                if source_key != key:
                    db.merge(LLMCache(key=key, response=saved.response, created_at=saved.created_at))
                    db.merge(LLMCacheOrigin(
                        key=key, requested_model=model,
                        source_model=origin.source_model if origin else None,
                        source_provider=origin.source_provider if origin else None,
                        inherited_from=source_key,
                        provenance=origin.provenance if origin else 'legacy_unknown'))
                    db.commit()
                elif origin is None:
                    # Previous code copied model aliases without origin metadata. Do not guess.
                    db.add(LLMCacheOrigin(key=key, requested_model=model, provenance='legacy_unknown'))
                    db.commit()
                return True, parsed
    except SQLAlchemyError:
        logger.warning('Inference cache unavailable; continuing with configured provider')
    return False, None


def save(provider, model, system, prompt, raw):
    key = key_for(provider, model, system, prompt)
    try:
        with SessionLocal() as db:
            db.merge(LLMCache(key=key, response=raw.strip(), created_at=time.time()))
            db.merge(LLMCacheOrigin(key=key, requested_model=model, source_model=model,
                                   source_provider=provider, inherited_from=None, provenance='recorded'))
            db.commit()
    except SQLAlchemyError:
        logger.warning('Inference response was not cached; a retry may repeat this step')
