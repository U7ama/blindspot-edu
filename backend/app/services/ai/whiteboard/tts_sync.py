"""
backend/ai/whiteboard/tts_sync.py

Speech synthesis with precise word-level timing marks for the Whiteboard subsystem.
Captures timing boundaries from edge-tts during synthesis to allow the Whiteboard
Orchestrator to fire draw commands in exact sync with speech words.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.app.core.paths import TTS_STORAGE_DIR

logger = logging.getLogger(__name__)


DEFAULT_VOICE = os.getenv("EDGE_TTS_VOICE", "en-US-ChristopherNeural")


def _get_cache_key(text: str, voice: str) -> str:
    return hashlib.sha256(f"{voice}:{text.strip()}".encode("utf-8")).hexdigest()[:16]


def _calculate_word_timing_marks(
    boundaries: List[Dict[str, Any]], full_text: str
) -> List[Dict[str, Any]]:
    """Calculates word-level timing marks from sentence boundaries."""
    marks: List[Dict[str, Any]] = []

    if not boundaries:
        # Fallback heuristic: 150 words per minute if no boundaries returned
        words = full_text.split()
        curr_offset = 0.0
        avg_word_ms = 400.0
        for w in words:
            clean_w = re.sub(r"[^\w\s]", "", w)
            marks.append(
                {
                    "word": clean_w or w,
                    "raw_word": w,
                    "offset_ms": round(curr_offset, 1),
                    "duration_ms": round(avg_word_ms, 1),
                }
            )
            curr_offset += avg_word_ms
        return marks

    for b in boundaries:
        text = b.get("text", "").strip()
        if not text:
            continue
        # offset and duration in edge-tts are 100-ns ticks (10,000 ticks = 1 ms)
        start_ms = b.get("offset", 0) / 10000.0
        dur_ms = b.get("duration", 0) / 10000.0
        words = text.split()
        total_chars = sum(len(w) for w in words) or 1
        curr_offset = start_ms

        for w in words:
            w_dur = (len(w) / total_chars) * dur_ms
            clean_word = re.sub(r"[^\w\s]", "", w)
            marks.append(
                {
                    "word": clean_word or w,
                    "raw_word": w,
                    "offset_ms": round(curr_offset, 1),
                    "duration_ms": round(w_dur, 1),
                }
            )
            curr_offset += w_dur

    return marks


async def synthesize_speech_with_timing(
    text: str, voice: Optional[str] = None
) -> Dict[str, Any]:
    """Synthesizes speech and returns the audio file URL, total duration, and word timing marks."""
    clean_text = text.strip()
    if not clean_text:
        return {"audio_url": "", "duration_ms": 0.0, "timing_marks": []}

    selected_voice = voice or DEFAULT_VOICE
    cache_key = _get_cache_key(clean_text, selected_voice)
    audio_filename = f"whiteboard_{cache_key}.mp3"
    audio_path = TTS_STORAGE_DIR / audio_filename
    audio_url = f"{os.getenv('BACKEND_PUBLIC_URL', 'http://localhost:8000')}/storage/tts/{audio_filename}"

    boundaries: List[Dict[str, Any]] = []
    audio_chunks: List[bytes] = []

    try:
        import edge_tts

        communicate = edge_tts.Communicate(clean_text, selected_voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                boundaries.append(chunk)

        # Write combined audio bytes
        with open(audio_path, "wb") as f:
            for b_chunk in audio_chunks:
                f.write(b_chunk)

    except Exception as e:
        logger.warning("edge-tts streaming failed, using fallback synthesizer: %s", e)
        # Fallback to backend.ai.tts if available
        try:
            from backend.app.services.ai.tts import async_speak

            await async_speak(clean_text, selected_voice, str(audio_path))
        except Exception as e2:
            logger.error("All TTS options failed: %s", e2)
            return {"audio_url": "", "duration_ms": 0.0, "timing_marks": []}

    timing_marks = _calculate_word_timing_marks(boundaries, clean_text)
    total_duration_ms = (
        timing_marks[-1]["offset_ms"] + timing_marks[-1]["duration_ms"]
        if timing_marks
        else 0.0
    )

    return {
        "audio_url": audio_url,
        "duration_ms": round(total_duration_ms, 1),
        "timing_marks": timing_marks,
    }


def synthesize_sync(text: str, voice: Optional[str] = None) -> Dict[str, Any]:
    """Synchronous wrapper for synthesize_speech_with_timing."""
    return asyncio.run(synthesize_speech_with_timing(text, voice))
