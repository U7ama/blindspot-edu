"""
backend/ai/whiteboard/session_manager.py

Session State Persistence & Archival Manager for Live AI Whiteboard (Step 9 / Blueprint §8).
Persists board snapshots, interactive timelines, and event history to allow seamless session restoration
and full lesson replay across browser refreshes.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app.core.paths import SESSION_STORAGE_DIR

logger = logging.getLogger(__name__)



def _safe_path(session_id: str) -> Path:
    if not isinstance(session_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", session_id):
        raise ValueError("Invalid session ID")
    path = (SESSION_STORAGE_DIR / f"{session_id}.json").resolve()
    if not path.is_relative_to(SESSION_STORAGE_DIR.resolve()):
        raise ValueError("Session path escapes storage")
    return path


def save_session(session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Saves or updates a whiteboard session record on disk."""
    session_id = session_data.get("sessionId")
    if not session_id:
        session_id = f"session_{int(time.time() * 1000)}"
        session_data["sessionId"] = session_id

    now = int(time.time() * 1000)
    if "createdAt" not in session_data or not session_data["createdAt"]:
        session_data["createdAt"] = now
    session_data["updatedAt"] = now

    file_path = _safe_path(session_id)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(session_data, f, indent=2)

    return session_data


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a whiteboard session by ID."""
    file_path = _safe_path(session_id)
    if not file_path.exists():
        return None

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load session {session_id}: {e}")
        return None


def list_sessions() -> List[Dict[str, Any]]:
    """Lists all saved whiteboard sessions sorted by last updated timestamp."""
    sessions = []
    for file in SESSION_STORAGE_DIR.glob("*.json"):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
                sessions.append(
                    {
                        "sessionId": data.get("sessionId", file.stem),
                        "title": data.get("title", "Whiteboard Session"),
                        "createdAt": data.get("createdAt", 0),
                        "updatedAt": data.get("updatedAt", 0),
                        "objectsCount": len(data.get("activeObjects", [])),
                        "eventsCount": len(data.get("events", [])),
                    }
                )
        except Exception as e:
            logger.warning(f"Could not read session file {file}: {e}")

    # Sort newest first
    sessions.sort(key=lambda s: s.get("updatedAt", 0), reverse=True)
    return sessions


def delete_session(session_id: str) -> bool:
    """Deletes a session file."""
    file_path = _safe_path(session_id)
    if file_path.exists():
        file_path.unlink()
        return True
    return False