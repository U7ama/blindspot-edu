"""
backend/app/integrations/whatsapp/lecture_search.py

Connects WhatsApp student queries to Blindspot processed lectures and timestamped transcripts (STEPS 13 & 14).
Provides timestamped source references and lecture grounding.
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session

from backend.app.core.db import SessionLocal
from backend.app.model.models import Lecture, TranscriptChunk

logger = logging.getLogger(__name__)


def format_timestamp(seconds: float) -> str:
    """Converts seconds to mm:ss format."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"


def find_relevant_lecture_context(query: str, limit: int = 4) -> Tuple[Optional[str], List[dict]]:
    """Searches SQLite database for processed lecture transcript chunks matching query terms.
    
    Returns:
        Tuple of (formatted_context_string, list_of_source_citations)
    """
    clean_query = query.lower().strip()
    keywords = [w for w in clean_query.split() if len(w) > 3]

    if not keywords:
        return None, []

    citations = []
    context_chunks = []
    db = SessionLocal()

    try:
        # Query recent processed lectures
        lectures = db.query(Lecture).filter(Lecture.status == "ready").order_by(Lecture.id.desc()).limit(5).all()
        if not lectures:
            return None, []

        for lecture in lectures:
            # Search transcript chunks
            chunks = (
                db.query(TranscriptChunk)
                .filter(TranscriptChunk.lecture_id == lecture.id)
                .order_by(TranscriptChunk.start)
                .all()
            )

            for chunk in chunks:
                chunk_lower = (chunk.text or "").lower()
                if any(kw in chunk_lower for kw in keywords):
                    ts_str = f"{format_timestamp(chunk.start)} - {format_timestamp(chunk.end)}"
                    title = lecture.filename or f"Lecture #{lecture.id}"
                    citation = {
                        "lecture_id": lecture.id,
                        "lecture_title": title,
                        "timestamp": ts_str,
                        "text": chunk.text,
                    }
                    citations.append(citation)
                    context_chunks.append(f"[{title} @ {ts_str}]: {chunk.text}")
                    if len(citations) >= limit:
                        break
            if len(citations) >= limit:
                break

    except Exception as e:
        logger.warning("Error searching lecture database context: %s", e)
        return None, []
    finally:
        db.close()

    if not context_chunks:
        return None, []

    formatted_context = "\n".join(context_chunks)
    return formatted_context, citations
