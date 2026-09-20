"""
backend/api/session.py


Live interactive teaching session API endpoints and WebSocket handler:
- POST /lectures/{id}/session — starts/initializes a live teaching session from the database
- POST /lectures/{id}/session/{session_id}/command — sends a command (next, explain_again, show_me, quiz_me, answer, question)
- GET /lectures/{id}/session/{session_id} — gets session state / event history
- WS /lectures/{id}/session — WebSocket for real-time bidirectional teaching & voice delivery

Derived strictly from backend/schemas.py (SessionEvent, SessionCommand, SessionEventType).
"""

import asyncio
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.schemas.schemas import SessionCommand, SessionEvent
from backend.app.services.ai.orchestrator import load_session_from_db, session_store
from pydantic import BaseModel

from backend.app.services.ai.llm import get_active_model, set_active_model

logger = logging.getLogger(__name__)
router = APIRouter()


class PreferencesSchema(BaseModel):
    voice: Optional[str] = None
    text_language: Optional[str] = None
    model: Optional[str] = None


DEFAULT_PREFERENCES = {
    "voice": "en-US-ChristopherNeural",
    "text_language": "English",
    "model": get_active_model(),
}


@router.get("/session/preferences")
def get_session_preferences():
    """Returns the user's active session voice, text language, and AI model preferences."""
    DEFAULT_PREFERENCES["model"] = get_active_model()
    return DEFAULT_PREFERENCES


@router.post("/session/preferences")
def set_session_preferences(prefs: PreferencesSchema):
    """Updates user session preferences and propagates them to active sessions and LLM runtime."""
    if prefs.voice:
        DEFAULT_PREFERENCES["voice"] = prefs.voice
    if prefs.text_language:
        DEFAULT_PREFERENCES["text_language"] = prefs.text_language
    if prefs.model:
        DEFAULT_PREFERENCES["model"] = prefs.model
        set_active_model(prefs.model)

    # Propagate voice and language to all active sessions in memory
    for sess_id in session_store.list_sessions():
        sess = session_store.get_session(sess_id)
        if sess:
            if prefs.voice:
                sess.set_voice(prefs.voice)
            if prefs.text_language:
                sess.set_text_language(prefs.text_language)

    return DEFAULT_PREFERENCES


@router.get("/session/voices")
def list_available_voices():
    """Returns the list of available TTS neural voices and languages."""
    from backend.app.services.ai.tts import get_available_voices
    return get_available_voices()


@router.post("/lectures/{lecture_id}/session", response_model=List[SessionEvent])
def start_teaching_session(
    lecture_id: int,
    session_id: Optional[str] = None,
    voice: Optional[str] = None,
    text_language: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Initializes a live teaching session from the database and returns the initial
    teaching events (phase_started, speaking, awaiting_command).
    """
    actual_voice = voice or DEFAULT_PREFERENCES["voice"]
    actual_text_lang = text_language or DEFAULT_PREFERENCES["text_language"]
    try:
        session = load_session_from_db(
            lecture_id=lecture_id,
            session_id=session_id,
            db=db,
            voice=actual_voice,
            text_language=actual_text_lang,
        )
        initial_events = session.start()
        return initial_events
    except Exception as e:
        logger.error("Failed to start session for lecture %s: %s", lecture_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to start session: {str(e)}")


@router.post("/lectures/{lecture_id}/session/{session_id}/command", response_model=List[SessionEvent])
def send_session_command(
    lecture_id: int,
    session_id: str,
    command: SessionCommand,
    db: Session = Depends(get_db),
):
    """Dispatches a student command ('next', 'explain_again', 'show_me', 'quiz_me', 'answer')
    to the active teaching session state machine and returns emitted events.
    """
    session = session_store.get_session(session_id)
    if not session or session.lecture_id != lecture_id:
        # Load / restore session from DB if not in memory
        session = load_session_from_db(lecture_id=lecture_id, session_id=session_id, db=db)

    try:
        events = session.handle_command(command)
        return events
    except Exception as e:
        logger.error("Error executing command on session %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail=f"Command execution error: {str(e)}")


@router.get("/lectures/{lecture_id}/session/{session_id}/history")
def get_session_history(lecture_id: int, session_id: str):
    """Returns the recorded event and command history for a session."""
    session = session_store.get_session(session_id)
    if not session or session.lecture_id != lecture_id:
        raise HTTPException(status_code=404, detail="Active session not found")

    return {
        "session_id": session.session_id,
        "lecture_id": session.lecture_id,
        "current_phase_index": session.current_phase_index,
        "is_ended": session.is_ended,
        "history": session.history,
    }


@router.websocket("/lectures/{lecture_id}/session/ws")
async def websocket_teaching_session(
    websocket: WebSocket,
    lecture_id: int,
    session_id: Optional[str] = None,
):
    """Real-time bidirectional WebSocket handler for the live teaching session.
    
    1. Connects and initializes/loads TeachingSession from DB.
    2. Sends initial session start events (phase_started, speaking, awaiting_command).
    3. Listens for incoming SessionCommand JSON messages, executes handlers, and broadcasts events.
    """
    await websocket.accept()

    # Session loading and command handling are blocking (DB + LLM calls) —
    # run them in a worker thread so the event loop stays responsive.
    session = await asyncio.to_thread(load_session_from_db, lecture_id=lecture_id, session_id=session_id)
    start_events = await asyncio.to_thread(session.start)

    # Stream start events to client
    for event in start_events:
        await websocket.send_text(event.model_dump_json())

    try:
        while not session.is_ended:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                cmd = SessionCommand(
                    session_id=session.session_id,
                    command=msg.get("command", ""),
                    argument=msg.get("argument"),
                )
                events = await asyncio.to_thread(session.handle_command, cmd)

                for event in events:
                    await websocket.send_text(event.model_dump_json())

            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps({"error": "Invalid JSON format for SessionCommand"})
                )
            except Exception as cmd_err:
                logger.error("WebSocket command error: %s", cmd_err)
                await websocket.send_text(
                    json.dumps({"error": f"Error executing command: {str(cmd_err)}"})
                )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session.session_id)
