"""
backend/app/integrations/whatsapp/router.py

FastAPI router for incoming WhatsApp webhooks via Zernio (STEPS 3, 4, 5).
Handles webhook challenge verification, duplicate filtering, payload normalization, and outbound dispatch.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, Request, Response, status

from .config import whatsapp_config
from .provider import zernio_provider
from .schemas import MessageType, NormalizedMessage, OutgoingMessage, WebhookResponse
from .security import duplicate_detector, verify_webhook_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.get("/webhook")
async def verify_webhook(
    request: Request,
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    """Webhook verification endpoint for provider setup."""
    logger.info("Received WhatsApp webhook verification handshake request")
    challenge = verify_webhook_token(
        request=request,
        hub_mode=hub_mode,
        hub_verify_token=hub_verify_token,
        hub_challenge=hub_challenge,
    )
    if challenge:
        return Response(content=str(challenge), media_type="text/plain")
    return {"status": "ok", "message": "WhatsApp webhook endpoint active"}


from .handlers import handle_text_message, handle_voice_message

async def _process_incoming_message(msg: NormalizedMessage) -> None:
    """Asynchronously processes a normalized WhatsApp message.
    
    Routes to appropriate handler based on MessageType (STEPS 6, 7, 8, 9, 10, 11, 12).
    """
    try:
        logger.info(
            "[WhatsApp Inbound] ID: %s | From: %s (%s) | Type: %s | Content: %s",
            msg.message_id,
            msg.user_identifier,
            msg.user_name or "Unknown",
            msg.message_type.value,
            msg.text_content or msg.media_url,
        )

        # Message Type Routing (Step 8)
        if msg.message_type == MessageType.TEXT:
            outgoing = await handle_text_message(msg)
        elif msg.message_type == MessageType.VOICE:
            outgoing = await handle_voice_message(msg)
        else:
            # Image / Document placeholder
            outgoing = OutgoingMessage(
                recipient=msg.user_identifier,
                message_type=MessageType.TEXT,
                text_content=f"👋 I received your {msg.message_type.value} attachment. Image/document understanding is coming up next!",
            )

        dispatch_result = await zernio_provider.send_message(
            outgoing=outgoing,
            conversation_id=msg.conversation_id,
            account_id=msg.account_id,
        )
        logger.info("[WhatsApp Outbound Result] %s", dispatch_result)

    except Exception as e:
        logger.error("[WhatsApp Pipeline Error] Failed to process message %s: %s", msg.message_id, e, exc_info=True)


@router.post("/webhook", response_model=WebhookResponse)
async def receive_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Receives and processes incoming WhatsApp webhook events from Zernio."""
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception as e:
        logger.error("Invalid JSON received at WhatsApp webhook: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    event_type = str(payload.get("event") or payload.get("type") or "message").lower()
    logger.info("Received WhatsApp webhook event: %s", event_type)

    if event_type in ("message.sent", "message.delivered", "message.read", "message.status", "message.failed"):
        return WebhookResponse(status="ignored", received=True, detail=f"Non-inbound event: {event_type}")

    # 1. Normalize provider payload into internal model
    normalized_messages = zernio_provider.normalize_payload(payload)

    if not normalized_messages:
        logger.info("Webhook event acknowledged (no dispatchable user messages in payload)")
        return WebhookResponse(status="acknowledged", received=True, detail="No actionable messages")

    processed_ids = []
    for msg in normalized_messages:
        # 2. Duplicate Detection (Step 4)
        if duplicate_detector.is_duplicate(msg.message_id):
            logger.info("Skipping duplicate message: %s", msg.message_id)
            continue

        processed_ids.append(msg.message_id)
        # 3. Schedule async processing so webhook returns HTTP 200 immediately
        background_tasks.add_task(_process_incoming_message, msg)

    return WebhookResponse(
        status="ok",
        received=True,
        message_id=",".join(processed_ids) if processed_ids else None,
        detail=f"Queued {len(processed_ids)} message(s) for processing",
    )
