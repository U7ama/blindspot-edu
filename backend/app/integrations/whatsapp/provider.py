"""
backend/app/integrations/whatsapp/provider.py

Zernio WhatsApp Provider Adapter (STEP 2).
Isolates Zernio-specific communication and maps payloads to/from NormalizedMessage.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

from .config import whatsapp_config
from .schemas import MessageType, NormalizedMessage, OutgoingMessage

logger = logging.getLogger(__name__)


class ZernioProvider:
    """Client adapter for communicating with Zernio WhatsApp Business API."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or whatsapp_config.zernio_api_key
        self.base_url = (base_url or whatsapp_config.zernio_base_url).rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._last_sent: Dict[str, float] = {}

    def normalize_payload(self, data: Dict[str, Any]) -> List[NormalizedMessage]:
        """Converts external provider webhook payloads into Blindspot NormalizedMessage instances.
        
        Supports:
        1. Zernio Native message.received payload (message, conversation, sender, account)
        2. Zernio Unified event envelope (data.sender, data.text, data.conversationId)
        3. Meta Cloud API webhook structures passed through Zernio (entry -> changes -> messages)
        4. Flat/test mock payloads
        """
        normalized_messages: List[NormalizedMessage] = []

        # -------------------------------------------------------------------
        # 0. Filter Outgoing Echoes and Non-Inbound Events (Prevent Echo Loop)
        # -------------------------------------------------------------------
        event_name = str(data.get("event") or data.get("type") or "").lower()
        if event_name in ("message.sent", "message.delivered", "message.read", "message.status", "message.failed"):
            logger.info("Ignoring non-inbound event: %s", event_name)
            return normalized_messages

        msg_dict = data.get("message") if isinstance(data.get("message"), dict) else {}
        direction = str(
            msg_dict.get("direction")
            or data.get("direction")
            or (data.get("data", {}).get("direction") if isinstance(data.get("data"), dict) else "")
        ).lower()

        if direction == "outgoing":
            logger.info("Ignoring outgoing message echo to prevent reply loop")
            return normalized_messages
        conv_dict = data.get("conversation") if isinstance(data.get("conversation"), dict) else {}
        sender_dict = msg_dict.get("sender") if isinstance(msg_dict.get("sender"), dict) else {}
        data_dict = data.get("data") if isinstance(data.get("data"), dict) else {}

        # 2a. Extract Account ID
        account_dict = data.get("account") if isinstance(data.get("account"), dict) else {}
        account_id = str(
            account_dict.get("id")
            or account_dict.get("accountId")
            or data.get("accountId")
            or (data_dict.get("accountId") if isinstance(data_dict, dict) else None)
            or whatsapp_config.whatsapp_phone_number_id
        ).strip()

        # 2b. Extract Sender Phone / Username
        sender = None
        if isinstance(sender_dict, dict) and sender_dict.get("phoneNumber"):
            sender = str(sender_dict.get("phoneNumber")).strip()
        elif isinstance(conv_dict, dict) and conv_dict.get("participantUsername"):
            sender = str(conv_dict.get("participantUsername")).strip()
        elif isinstance(sender_dict, dict) and sender_dict.get("id"):
            sender = str(sender_dict.get("id")).strip()
        elif isinstance(conv_dict, dict) and conv_dict.get("participantId"):
            sender = str(conv_dict.get("participantId")).strip()
        elif isinstance(data_dict, dict) and isinstance(data_dict.get("sender"), dict) and data_dict["sender"].get("phoneNumber"):
            sender = str(data_dict["sender"]["phoneNumber"]).strip()
        elif isinstance(data_dict, dict) and isinstance(data_dict.get("sender"), dict) and data_dict["sender"].get("username"):
            sender = str(data_dict["sender"]["username"]).strip()
        elif data.get("from") or msg_dict.get("from") or data.get("sender"):
            sender = str(data.get("from") or msg_dict.get("from") or data.get("sender")).strip()

        # 2c. Extract Message ID
        msg_id = str(
            msg_dict.get("id")
            or msg_dict.get("platformMessageId")
            or data.get("id")
            or (data_dict.get("id") if isinstance(data_dict, dict) else None)
            or f"wa_{os.urandom(6).hex()}"
        ).strip()

        # 2d. Extract Conversation ID
        conversation_id = None
        if msg_dict.get("conversationId"):
            conversation_id = str(msg_dict.get("conversationId")).strip()
        elif conv_dict.get("id"):
            conversation_id = str(conv_dict.get("id")).strip()
        elif isinstance(data_dict, dict) and data_dict.get("conversationId"):
            conversation_id = str(data_dict.get("conversationId")).strip()
        elif data.get("conversationId"):
            conversation_id = str(data.get("conversationId")).strip()

        # 2e. Extract Text Content
        text_val = (
            msg_dict.get("text")
            or msg_dict.get("body")
            or (data_dict.get("text") if isinstance(data_dict, dict) else None)
            or (data_dict.get("body") if isinstance(data_dict, dict) else None)
            or data.get("text")
        )
        if isinstance(text_val, dict):
            text_val = text_val.get("body") or text_val.get("text") or text_val.get("content")

        # 2f. Extract Message Type & Attachments
        msg_type = MessageType.TEXT
        media_url = None
        media_id = None
        mime_type = None

        type_str = str(
            msg_dict.get("type")
            or (data_dict.get("type") if isinstance(data_dict, dict) else None)
            or data.get("type")
            or "text"
        ).lower()

        if type_str in ("audio", "voice"):
            msg_type = MessageType.VOICE
        elif type_str in ("image", "photo"):
            msg_type = MessageType.IMAGE

        # Attachments array
        attachments = msg_dict.get("attachments") or (data_dict.get("attachments") if isinstance(data_dict, dict) else []) or []
        if isinstance(attachments, list) and attachments:
            first_att = attachments[0]
            if isinstance(first_att, dict):
                att_type = str(first_att.get("type", "")).lower()
                media_url = first_att.get("url") or first_att.get("link")
                media_id = first_att.get("id")
                mime_type = first_att.get("mimeType") or first_att.get("mime_type")
                if "audio" in att_type or "voice" in att_type or (mime_type and "audio" in mime_type):
                    msg_type = MessageType.VOICE
                elif "image" in att_type or (mime_type and "image" in mime_type):
                    msg_type = MessageType.IMAGE

        # Nested media objects fallback
        if not media_url:
            for media_key in ("audio", "voice", "image"):
                media_obj = msg_dict.get(media_key) or (data_dict.get(media_key) if isinstance(data_dict, dict) else None)
                if isinstance(media_obj, dict):
                    media_url = media_obj.get("url") or media_obj.get("link")
                    media_id = media_obj.get("id")
                    mime_type = media_obj.get("mime_type") or media_obj.get("mimeType")
                    if media_key in ("audio", "voice"):
                        msg_type = MessageType.VOICE
                    elif media_key == "image":
                        msg_type = MessageType.IMAGE
                elif isinstance(media_obj, str):
                    media_url = media_obj
                    if media_key in ("audio", "voice"):
                        msg_type = MessageType.VOICE

        sender_name = (
            sender_dict.get("name")
            or conv_dict.get("participantName")
            or (data_dict.get("sender", {}).get("name") if isinstance(data_dict, dict) and isinstance(data_dict.get("sender"), dict) else None)
        ) or data.get("name")

        biz_num = "".join(c for c in whatsapp_config.whatsapp_business_number if c.isdigit())
        clean_sender = "".join(c for c in str(sender) if c.isdigit()) if sender else ""
        if biz_num and clean_sender and biz_num == clean_sender:
            logger.info("Ignoring message from own WhatsApp business number: %s", sender)
            return normalized_messages

        if sender:
            normalized_messages.append(
                NormalizedMessage(
                    message_id=msg_id,
                    account_id=account_id if account_id else None,
                    conversation_id=conversation_id,
                    user_identifier=str(sender),
                    user_name=sender_name,
                    message_type=msg_type,
                    text_content=str(text_val) if text_val else None,
                    media_url=media_url,
                    media_id=media_id,
                    mime_type=mime_type,
                    raw_payload=data,
                )
            )

        return normalized_messages

    def _parse_cloud_api_message(
        self,
        msg: Dict[str, Any],
        contacts: Dict[str, Optional[str]],
        root: Dict[str, Any],
    ) -> Optional[NormalizedMessage]:
        """Parses single Cloud API message dictionary."""
        msg_id = str(msg.get("id", "")).strip()
        sender = str(msg.get("from", "")).strip()
        msg_type_str = str(msg.get("type", "text")).lower()

        if not msg_id or not sender:
            return None

        msg_type = MessageType.TEXT
        text_content = None
        media_url = None
        media_id = None
        mime_type = None

        if msg_type_str == "text":
            msg_type = MessageType.TEXT
            text_content = msg.get("text", {}).get("body")
        elif msg_type_str in ("audio", "voice"):
            msg_type = MessageType.VOICE
            audio = msg.get("audio") or msg.get("voice") or {}
            media_id = audio.get("id")
            media_url = audio.get("link") or audio.get("url")
            mime_type = audio.get("mime_type")
        elif msg_type_str == "image":
            msg_type = MessageType.IMAGE
            image = msg.get("image", {})
            media_id = image.get("id")
            media_url = image.get("link") or image.get("url")
            mime_type = image.get("mime_type")
            text_content = image.get("caption")
        else:
            msg_type = MessageType.UNKNOWN

        return NormalizedMessage(
            message_id=msg_id,
            account_id=whatsapp_config.whatsapp_phone_number_id,
            user_identifier=sender,
            user_name=contacts.get(sender),
            message_type=msg_type,
            text_content=text_content,
            media_url=media_url,
            media_id=media_id,
            mime_type=mime_type,
            reply_to_message_id=msg.get("context", {}).get("id"),
            raw_payload=root,
        )

    async def send_message(
        self,
        outgoing: OutgoingMessage,
        conversation_id: Optional[str] = None,
        account_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dispatches an outgoing message to the WhatsApp recipient via Zernio."""
        if not self.api_key:
            logger.warning(
                "[Zernio Mock Mode] ZERNIO_API_KEY not configured. Simulating dispatch to %s: %s",
                outgoing.recipient,
                outgoing.text_content or outgoing.media_url,
            )
            return {
                "status": "mock_delivered",
                "recipient": outgoing.recipient,
                "type": outgoing.message_type.value,
                "content": outgoing.text_content,
                "media_url": outgoing.media_url,
            }

        # Rate Limit / Cooldown per recipient (minimum 2.5s between messages)
        recipient = outgoing.recipient
        now = time.time()
        last_time = self._last_sent.get(recipient, 0)
        cooldown_needed = 2.5 - (now - last_time)
        if cooldown_needed > 0:
            logger.info("Throttling outbound message to %s for %.1fs to protect Meta rate limits", recipient, cooldown_needed)
            await asyncio.sleep(cooldown_needed)
        self._last_sent[recipient] = time.time()

        target_account_id = (account_id or whatsapp_config.whatsapp_phone_number_id).strip()
        text_body = outgoing.text_content or (f"🎙️ Audio: {outgoing.media_url}" if outgoing.media_url else "")

        # 1. If conversation_id is known, send directly into active thread
        if conversation_id:
            url = f"{self.base_url}/inbox/conversations/{conversation_id}/messages"
            payload = {
                "accountId": target_account_id,
                "message": text_body,
            }
        else:
            # 2. Otherwise initiate or send to contact
            url = f"{self.base_url}/inbox/conversations"
            payload = {
                "accountId": target_account_id,
                "participantUsername": outgoing.recipient,
                "message": text_body,
            }

        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                logger.info("Zernio POST to: %s with accountId: %s", url, target_account_id)
                response = await client.post(url, json=payload, headers=self.headers)
                logger.info("Zernio response status: %s", response.status_code)

                if response.status_code == 404 and conversation_id:
                    # Fallback to initiating conversation
                    fallback_url = f"{self.base_url}/inbox/conversations"
                    fallback_payload = {
                        "accountId": target_account_id,
                        "participantUsername": outgoing.recipient,
                        "message": text_body,
                    }
                    logger.info("Zernio fallback POST to: %s", fallback_url)
                    response = await client.post(fallback_url, json=fallback_payload, headers=self.headers)
                    logger.info("Zernio fallback response status: %s", response.status_code)

                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as http_err:
                logger.error("Zernio HTTP error %s: %s", http_err.response.status_code, http_err.response.text)
                return {
                    "status": "provider_error",
                    "code": http_err.response.status_code,
                    "detail": http_err.response.text,
                }
            except Exception as e:
                logger.error("Failed to send WhatsApp message via Zernio: %s", e)
                return {
                    "status": "provider_error",
                    "detail": str(e),
                }

    async def download_media(self, media_url: Optional[str], media_id: Optional[str] = None) -> str:
        """Downloads audio or media from direct URL or Zernio media fetch endpoint to a local temp file.
        
        Returns the absolute local path to the temporary file.
        """
        target_url = media_url
        headers = {}

        if not target_url and media_id:
            target_url = f"{self.base_url}/media/{media_id}"
            headers = self.headers

        if not target_url:
            raise ValueError("Cannot download media: neither media_url nor media_id was provided.")

        # If already a local file path, return it directly
        if Path(target_url).exists():
            return str(Path(target_url).resolve())

        ext = ".ogg" if ("audio" in target_url or "voice" in target_url) else ".bin"
        temp_file = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
        temp_path = temp_file.name
        temp_file.close()

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(target_url, headers=headers)
                response.raise_for_status()
                with open(temp_path, "wb") as f:
                    f.write(response.content)
                return temp_path
            except Exception as e:
                Path(temp_path).unlink(missing_ok=True)
                logger.error("Failed to download media from %s: %s", target_url, e)
                raise RuntimeError(f"Media download failed: {e}") from e


# Singleton instance
zernio_provider = ZernioProvider()
