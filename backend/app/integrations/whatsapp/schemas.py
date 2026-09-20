"""
backend/app/integrations/whatsapp/schemas.py

Pydantic schemas for WhatsApp provider-agnostic internal models (STEP 2).
Decouples external payload formats from Blindspot Edu core logic.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class MessageType(str, enum.Enum):
    TEXT = "text"
    AUDIO = "audio"
    VOICE = "voice"
    IMAGE = "image"
    DOCUMENT = "document"
    UNKNOWN = "unknown"


class NormalizedMessage(BaseModel):
    """Normalized, provider-agnostic message representation within Blindspot Edu."""

    message_id: str = Field(
        ...,
        description="Unique external message identifier used for deduplication/idempotency",
    )
    account_id: Optional[str] = Field(
        default=None,
        description="Zernio account ID / phone number ID associated with this message",
    )
    conversation_id: Optional[str] = Field(
        default=None,
        description="Zernio/WhatsApp conversation thread identifier for in-thread replies",
    )
    user_identifier: str = Field(
        ...,
        description="Standardized student phone number / sender ID (e.g. '+923106340860')",
    )
    user_name: Optional[str] = Field(
        default=None,
        description="Sender display name if provided by WhatsApp profile",
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Message received or sent timestamp",
    )
    message_type: MessageType = Field(
        default=MessageType.TEXT,
        description="Normalized message category (TEXT, VOICE, IMAGE, etc.)",
    )
    text_content: Optional[str] = Field(
        default=None,
        description="Extracted or transcribed message text",
    )
    media_url: Optional[str] = Field(
        default=None,
        description="Direct download URL for audio/voice/image attachments",
    )
    media_id: Optional[str] = Field(
        default=None,
        description="Provider-hosted media ID if download requires authenticated fetch",
    )
    mime_type: Optional[str] = Field(
        default=None,
        description="MIME type of attached media (e.g. 'audio/ogg', 'image/jpeg')",
    )
    reply_to_message_id: Optional[str] = Field(
        default=None,
        description="Message ID this incoming message is replying to",
    )
    raw_payload: Dict[str, Any] = Field(
        default_factory=dict,
        description="Original provider payload for audit and debugging",
    )


class OutgoingMessage(BaseModel):
    """Structured response payload to be sent back to WhatsApp user via Zernio."""

    recipient: str = Field(
        ...,
        description="Target student phone number (e.g. '+923106340860')",
    )
    message_type: MessageType = Field(
        default=MessageType.TEXT,
        description="Type of message being dispatched (TEXT, VOICE, etc.)",
    )
    text_content: Optional[str] = Field(
        default=None,
        description="Text body for text replies or media captions",
    )
    media_url: Optional[str] = Field(
        default=None,
        description="Publicly accessible URL to media or TTS audio file",
    )
    media_path: Optional[str] = Field(
        default=None,
        description="Local filesystem path to synthesized media file before dispatch",
    )
    caption: Optional[str] = Field(
        default=None,
        description="Optional caption for media items",
    )


class WebhookResponse(BaseModel):
    """Standard HTTP response returned to webhook provider."""

    status: str = "ok"
    received: bool = True
    message_id: Optional[str] = None
    detail: Optional[str] = None
