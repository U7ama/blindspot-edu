"""
backend/ai/tts.py


The swappable Text-to-Speech (TTS) engine for Blindspot Edu.
Synthesizes spoken audio from teaching scripts, explanations, and feedback.

Architecture & Adapter Strategy (per MVP Blueprint §7.2 & §7.3):
    1. Primary Open-Source Engine: `edge-tts` (high-quality Microsoft Edge
       neural voices like 'en-US-ChristopherNeural' or 'en-US-GuyNeural').
       - Free, studio-grade quality, zero GPU load.
    2. AWS Cloud Native Hook: Seamlessly routes to Amazon Polly Neural TTS
       when USE_AWS_POLLY is enabled or AWS credentials are provided.
    3. Fallback Providers: `gTTS` or offline audio generation if network
       or primary dependencies are unavailable.
    4. Caching: Caches synthesized audio files by text+voice hash to prevent
       redundant synthesis across repeated commands ("explain again").

Public Interface:
    speak(text: str, voice: Optional[str] = None, output_path: Optional[str] = None) -> str
    async_speak(text: str, voice: Optional[str] = None, output_path: Optional[str] = None) -> str
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
from pathlib import Path
from typing import Optional

from backend.app.core.paths import TTS_STORAGE_DIR as TTS_CACHE_DIR

logger = logging.getLogger(__name__)


# Default voices
DEFAULT_EDGE_VOICE = os.getenv("EDGE_TTS_VOICE", "en-US-ChristopherNeural")
DEFAULT_AWS_POLLY_VOICE = os.getenv("AWS_POLLY_VOICE", "Matthew")

# Curated Voice Catalog across languages
VOICE_CATALOG = [
    {
        "id": "en-US-ChristopherNeural",
        "name": "Christopher",
        "language": "English (US)",
        "gender": "Male",
        "flag": "🇺🇸",
    },
    {
        "id": "en-US-AriaNeural",
        "name": "Aria",
        "language": "English (US)",
        "gender": "Female",
        "flag": "🇺🇸",
    },
    {
        "id": "en-GB-RyanNeural",
        "name": "Ryan",
        "language": "English (UK)",
        "gender": "Male",
        "flag": "🇬🇧",
    },
    {
        "id": "en-GB-SoniaNeural",
        "name": "Sonia",
        "language": "English (UK)",
        "gender": "Female",
        "flag": "🇬🇧",
    },
    {
        "id": "es-ES-AlvaroNeural",
        "name": "Alvaro",
        "language": "Spanish",
        "gender": "Male",
        "flag": "🇪🇸",
    },
    {
        "id": "fr-FR-HenriNeural",
        "name": "Henri",
        "language": "French",
        "gender": "Male",
        "flag": "🇫🇷",
    },
    {
        "id": "de-DE-KillianNeural",
        "name": "Killian",
        "language": "German",
        "gender": "Male",
        "flag": "🇩🇪",
    },
    {
        "id": "ar-SA-HamedNeural",
        "name": "Hamed",
        "language": "Arabic",
        "gender": "Male",
        "flag": "🇸🇦",
    },
    {
        "id": "zh-CN-YunxiNeural",
        "name": "Yunxi",
        "language": "Chinese",
        "gender": "Male",
        "flag": "🇨🇳",
    },
    {
        "id": "hi-IN-MadhurNeural",
        "name": "Madhur",
        "language": "Hindi",
        "gender": "Male",
        "flag": "🇮🇳",
    },
    {
        "id": "ur-PK-AsadNeural",
        "name": "Asad",
        "language": "Urdu",
        "gender": "Male",
        "flag": "🇵🇰",
    },
]


def get_available_voices() -> list[dict]:
    """Returns the list of supported voice models and languages."""
    return VOICE_CATALOG


def get_language_for_voice(voice_id: Optional[str]) -> str:
    """Finds the target language name for a given voice ID."""
    if not voice_id:
        return "English"
    for v in VOICE_CATALOG:
        if v["id"].lower() == voice_id.lower():
            return v["language"]
    return "English"


def set_default_voice(voice_id: str) -> None:
    """Sets the global default voice for TTS synthesis."""
    global DEFAULT_EDGE_VOICE
    DEFAULT_EDGE_VOICE = voice_id


# ---------------------------------------------------------------------------
# Cache Helper
# ---------------------------------------------------------------------------

def _get_cache_path(text: str, voice: str, ext: str = "mp3") -> Path:
    """Computes a deterministic hash filename for a given text + voice combination."""
    content_hash = hashlib.sha256(f"{voice}:{text.strip()}".encode("utf-8")).hexdigest()[:16]
    return TTS_CACHE_DIR / f"tts_{content_hash}.{ext}"


# ---------------------------------------------------------------------------
# Provider: Edge TTS (Primary Open Source)
# ---------------------------------------------------------------------------

async def _speak_edge_tts(text: str, voice: Optional[str], output_path: Path) -> str:
    """Generates audio using edge-tts."""
    import edge_tts

    selected_voice = voice or DEFAULT_EDGE_VOICE
    communicate = edge_tts.Communicate(text, selected_voice)
    await communicate.save(str(output_path))
    return str(output_path)


# ---------------------------------------------------------------------------
# Provider: Amazon Polly (AWS Cloud Native Neural TTS)
# ---------------------------------------------------------------------------

def _speak_polly(text: str, voice: Optional[str], output_path: Path) -> str:
    """Generates audio using Amazon Polly API."""
    import boto3

    polly = boto3.client("polly")
    selected_voice = voice or DEFAULT_AWS_POLLY_VOICE
    response = polly.synthesize_speech(
        Text=text,
        OutputFormat="mp3",
        VoiceId=selected_voice,
        Engine="neural",
    )

    with open(output_path, "wb") as f:
        f.write(response["AudioStream"].read())

    return str(output_path)


# ---------------------------------------------------------------------------
# Provider: gTTS (Secondary Fallback)
# ---------------------------------------------------------------------------

def _speak_gtts(text: str, output_path: Path) -> str:
    """Generates audio using gTTS."""
    from gtts import gTTS

    tts = gTTS(text=text, lang="en", slow=False)
    tts.save(str(output_path))
    return str(output_path)


# ---------------------------------------------------------------------------
# Main Synthesis Dispatcher
# ---------------------------------------------------------------------------

async def async_speak(
    text: str,
    voice: Optional[str] = None,
    output_path: Optional[str] = None,
) -> str:
    """Asynchronously synthesizes speech from text and returns the audio file path.
    
    Checks cache first, then attempts synthesis in order:
    1. Amazon Polly (if configured or enabled)
    2. Edge-TTS (primary open-source neural engine)
    3. gTTS (lightweight fallback)
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return ""

    selected_voice = voice or DEFAULT_EDGE_VOICE
    target_path = Path(output_path) if output_path else _get_cache_path(clean_text, selected_voice)

    # 1. Return cached audio if already generated and non-empty
    if target_path.exists() and target_path.stat().st_size > 0:
        logger.debug("TTS Cache hit for: %s", target_path)
        return str(target_path)

    # Ensure parent directory exists
    target_path.parent.mkdir(parents=True, exist_ok=True)

    # 2. Check for Amazon Polly configuration
    if os.getenv("USE_AWS_POLLY", "false").lower() in ("true", "1") or os.getenv("AWS_POLLY_VOICE"):
        try:
            return _speak_polly(clean_text, voice, target_path)
        except Exception as e:
            logger.warning("Amazon Polly TTS synthesis failed, falling back to Edge-TTS: %s", e)

    # 3. Edge-TTS (Primary Open Source)
    try:
        return await _speak_edge_tts(clean_text, selected_voice, target_path)
    except ImportError:
        logger.debug("edge-tts not installed, attempting fallback.")
    except Exception as e:
        logger.warning("Edge-TTS synthesis error: %s. Attempting fallback.", e)

    # 4. gTTS Fallback
    try:
        return _speak_gtts(clean_text, target_path)
    except ImportError:
        logger.debug("gTTS not installed.")
    except Exception as e:
        logger.warning("gTTS fallback failed: %s", e)

    # 5. Last-resort placeholder audio file so callers always get a valid file path
    logger.error("No TTS engines succeeded. Writing empty placeholder audio.")
    with open(target_path, "wb") as f:
        # Minimal silent MP3 frame header / placeholder
        f.write(b"\xff\xfb\x90\x00\x00\x00\x00\x00\x00\x00\x00\x00")

    return str(target_path)


def speak(
    text: str,
    voice: Optional[str] = None,
    output_path: Optional[str] = None,
) -> str:
    """Synchronous entrypoint for TTS synthesis.
    
    Compatible with synchronous callers (e.g. orchestrator.py, test scripts).
    Handles both running event loops and standard execution threads.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return ""

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # If already inside an async loop, execute in thread pool to avoid blocking
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, async_speak(clean_text, voice, output_path))
            return future.result()
    else:
        return asyncio.run(async_speak(clean_text, voice, output_path))


# Compatibility alias
synthesize_speech = speak