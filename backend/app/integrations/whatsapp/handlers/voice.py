"""
backend/app/integrations/whatsapp/handlers/voice.py

Voice note and audio message interaction handler (STEPS 9, 10, 11, 12).
Downloads WhatsApp audio, transcribes with faster-whisper, generates educational explanation,
and synthesizes spoken audio response with Edge-TTS when enabled.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

from backend.app.services.ai.transcription import transcribe_audio_snippet
from backend.app.services.ai.tts import async_speak
from ..config import whatsapp_config
from ..provider import zernio_provider
from ..schemas import MessageType, NormalizedMessage, OutgoingMessage
from .text import handle_text_message

logger = logging.getLogger(__name__)


def _clean_for_tts(text: str) -> str:
    """Strips markdown bold/italics and emojis so TTS speaks naturally."""
    # Remove markdown formatting like *bold*, _italic_, # headers
    clean = re.sub(r"[*_#`~]", "", text)
    # Remove bullet markers
    clean = re.sub(r"^[•\-*]\s*", "", clean, flags=re.MULTILINE)
    # Remove non-ascii / emojis
    clean = clean.encode("ascii", "ignore").decode("ascii")
    # Collapse multiple whitespace
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


async def handle_voice_message(msg: NormalizedMessage) -> OutgoingMessage:
    """Processes an incoming voice note / audio message.
    
    Pipeline:
    Voice Input -> Download Audio -> STT Transcription -> Blindspot Edu Context & Reasoning -> Edge-TTS Audio Reply
    """
    user_id = msg.user_identifier
    temp_audio_path: Optional[str] = None

    try:
        # 1. Download voice note from Zernio / provider
        logger.info("[WhatsApp Voice] Downloading voice note for %s (url: %s, id: %s)", user_id, msg.media_url, msg.media_id)
        temp_audio_path = await zernio_provider.download_media(
            media_url=msg.media_url,
            media_id=msg.media_id,
        )

        # 2. Transcribe using faster-whisper (Step 10)
        logger.info("[WhatsApp Voice] Transcribing audio snippet: %s", temp_audio_path)
        transcribed_text = transcribe_audio_snippet(temp_audio_path)

        if not transcribed_text:
            logger.warning("[WhatsApp Voice] Transcription was empty or silent for user %s", user_id)
            return OutgoingMessage(
                recipient=user_id,
                message_type=MessageType.TEXT,
                text_content="🎙️ *Blindspot Edu Voice Tutor*\n\nI couldn't clearly hear your voice note. Could you please record it again or send your question as text?",
            )

        logger.info("[WhatsApp Voice Transcribed] '%s' from %s", transcribed_text, user_id)

        # 3. Create a normalized text message containing the transcript and route to AI (Step 11)
        text_normalized_msg = NormalizedMessage(
            message_id=msg.message_id,
            account_id=msg.account_id,
            conversation_id=msg.conversation_id,
            user_identifier=msg.user_identifier,
            user_name=msg.user_name,
            message_type=MessageType.TEXT,
            text_content=transcribed_text,
            raw_payload=msg.raw_payload,
        )

        ai_response = await handle_text_message(text_normalized_msg)
        explanation_text = ai_response.text_content or ""

        # Format header showing what was heard + the explanation
        annotated_reply = (
            f"🎙️ _Heard: \"{transcribed_text}\"_\n\n"
            f"{explanation_text}"
        )

        # 4. Optional TTS Voice Synthesis (Step 12)
        audio_file_path: Optional[str] = None
        if whatsapp_config.whatsapp_enable_tts and explanation_text:
            try:
                tts_text = _clean_for_tts(explanation_text)
                if tts_text:
                    logger.info("[WhatsApp Voice] Synthesizing TTS audio for explanation...")
                    audio_file_path = await async_speak(tts_text)
                    logger.info("[WhatsApp Voice] Synthesized TTS audio: %s", audio_file_path)
            except Exception as tts_err:
                logger.warning("[WhatsApp Voice] TTS synthesis failed (falling back to text): %s", tts_err)

        return OutgoingMessage(
            recipient=user_id,
            message_type=MessageType.VOICE if audio_file_path else MessageType.TEXT,
            text_content=annotated_reply,
            media_path=audio_file_path,
        )

    except Exception as e:
        logger.error("[WhatsApp Voice Error] Failed to process voice note for %s: %s", user_id, e, exc_info=True)
        return OutgoingMessage(
            recipient=user_id,
            message_type=MessageType.TEXT,
            text_content="⚠️ *Blindspot Edu Voice Tutor*\n\nI encountered an issue processing your voice note. Please try again or type your question!",
        )

    finally:
        # Clean up temporary download file
        if temp_audio_path:
            try:
                Path(temp_audio_path).unlink(missing_ok=True)
            except Exception:
                pass
