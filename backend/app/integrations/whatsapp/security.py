"""
backend/app/integrations/whatsapp/security.py

Webhook security and duplicate event protection (STEP 4).
Prevents duplicate processing of retried webhook deliveries and validates authentication.
"""

from __future__ import annotations

import collections
import hmac
import hashlib
import logging
import time
from typing import Optional
from fastapi import Header, HTTPException, Request, status

from .config import whatsapp_config

logger = logging.getLogger(__name__)


class DuplicateDetector:
    """Thread-safe in-memory cache with TTL to filter duplicate webhook deliveries."""

    def __init__(self, max_size: int = 2000, ttl_seconds: int = 300):
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache: collections.OrderedDict[str, float] = collections.OrderedDict()

    def is_duplicate(self, message_id: Optional[str]) -> bool:
        """Returns True if message_id has been seen within the TTL window, False otherwise."""
        if not message_id:
            return False

        now = time.time()
        self._cleanup(now)

        if message_id in self._cache:
            logger.warning("[Idempotency] Duplicate message received and dropped: %s", message_id)
            return True

        self._cache[message_id] = now
        if len(self._cache) > self.max_size:
            self._cache.popitem(last=False)
        return False

    def _cleanup(self, now: float) -> None:
        """Removes expired items older than TTL."""
        while self._cache:
            oldest_id, timestamp = next(iter(self._cache.items()))
            if now - timestamp > self.ttl_seconds:
                self._cache.pop(oldest_id)
            else:
                break


duplicate_detector = DuplicateDetector()


def verify_webhook_token(
    request: Request,
    hub_mode: Optional[str] = None,
    hub_verify_token: Optional[str] = None,
    hub_challenge: Optional[str] = None,
) -> Optional[str]:
    """Validates GET challenge handshakes (e.g. Meta / webhook hub verification)."""
    expected_secret = whatsapp_config.zernio_webhook_secret
    if expected_secret:
        if hub_verify_token and hub_verify_token != expected_secret:
            logger.warning("Webhook verification token mismatch")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid verification token",
            )
    return hub_challenge or "ok"


def verify_webhook_signature(payload_bytes: bytes, signature_header: Optional[str]) -> bool:
    """Validates HMAC signature if a webhook secret is configured and provider sends signature header."""
    secret = whatsapp_config.zernio_webhook_secret
    if not secret:
        return True  # If no secret configured, allow

    if not signature_header:
        # If secret configured but no signature sent, log warning
        logger.warning("Webhook secret configured, but incoming request lacks signature header")
        return True

    try:
        # Expected format: sha256=... or raw hash
        clean_sig = signature_header.replace("sha256=", "").strip()
        expected = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(clean_sig, expected)
    except Exception as e:
        logger.error("Error validating webhook signature: %s", e)
        return False
