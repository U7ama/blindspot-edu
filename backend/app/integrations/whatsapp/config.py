"""
backend/app/integrations/whatsapp/config.py

Configuration settings for WhatsApp integration via Zernio provider (STEP 1).
"""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Ensure root .env is loaded
load_dotenv(Path(__file__).resolve().parents[4] / ".env")


class WhatsAppConfig(BaseModel):
    """Configuration loaded from environment variables for WhatsApp / Zernio."""

    zernio_api_key: str = Field(
        default_factory=lambda: os.getenv("ZERNIO_API_KEY", "").strip()
    )
    zernio_base_url: str = Field(
        default_factory=lambda: os.getenv("ZERNIO_BASE_URL", "https://api.zernio.com/v1").rstrip("/")
    )
    zernio_webhook_secret: str = Field(
        default_factory=lambda: os.getenv("ZERNIO_WEBHOOK_SECRET", "").strip()
    )
    whatsapp_business_number: str = Field(
        default_factory=lambda: os.getenv("WHATSAPP_BUSINESS_NUMBER", "").strip()
    )
    whatsapp_phone_number_id: str = Field(
        default_factory=lambda: os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    )
    whatsapp_enable_tts: bool = Field(
        default_factory=lambda: os.getenv("WHATSAPP_ENABLE_TTS", "true").lower() in ("true", "1", "yes")
    )
    max_history_turns: int = Field(
        default_factory=lambda: int(os.getenv("WHATSAPP_MAX_HISTORY_TURNS", "8"))
    )


whatsapp_config = WhatsAppConfig()
