"""
backend/ai/translation.py


Provides fast, natural, and conversational translation for Blindspot Edu.
Translates lecture teaching scripts and Q&A explanations into authentic
target languages (Spanish, Urdu, French, German, Arabic, Chinese, Hindi, etc.)
suited for spoken delivery by neural TTS voices.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Dict, Tuple

# Ensure project root is on sys.path
_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion

logger = logging.getLogger(__name__)

# In-memory translation cache: (text_hash, target_lang) -> translated_text
_TRANSLATION_CACHE: Dict[Tuple[str, str], str] = {}

_TRANSLATE_SYSTEM_PROMPT = """\
You are an expert pedagogical translator for an AI voice teaching assistant.
Your task is to translate an educational teaching explanation into the specified target language.

Translation Guidelines:
1. Translate accurately, naturally, and conversationally for a student listening to a spoken voice.
2. Maintain all core concepts, technical clarity, and pedagogical explanations.
3. Output ONLY the translated text in the target language. Do not add explanations, notes, quotes, or markdown formatting.
"""


def translate_text(text: str, target_language: str) -> str:
    """Translates an instructional explanation into the requested target language.

    If target_language is English or empty, returns the original text immediately.
    Caches translations in memory to ensure fast subsequent delivery.
    """
    clean_text = (text or "").strip()
    clean_lang = (target_language or "").strip()

    if not clean_text or not clean_lang:
        return clean_text

    # Skip translation if already in English
    lower_lang = clean_lang.lower()
    if lower_lang in ("en", "english", "english (us)", "english (uk)", "us", "uk"):
        return clean_text

    # Check cache
    cache_key = (clean_text, lower_lang)
    if cache_key in _TRANSLATION_CACHE:
        return _TRANSLATION_CACHE[cache_key]

    user_prompt = f"""\
Target Language: {clean_lang}

Original English Text:
"{clean_text}"

Translated Text:"""

    try:
        translated = chat_completion(
            system_prompt=_TRANSLATE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=2048,
        )
        if isinstance(translated, str) and translated.strip():
            result = translated.strip().strip('"').strip("'")
            _TRANSLATION_CACHE[cache_key] = result
            return result
    except Exception as e:
        logger.warning("Translation to %s failed: %s. Falling back to original text.", clean_lang, e)

    return clean_text
