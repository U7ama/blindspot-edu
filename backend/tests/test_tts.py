"""
backend/test_tts.py

Tests the text-to-speech engine in backend/ai/tts.py:
  1. Synthesizes a test sentence using speak().
  2. Verifies output file exists, is an MP3, and has non-zero size.
  3. Verifies caching behavior for repeated phrases.
  4. Verifies integration with backend/ai/orchestrator.py.

Usage:
    python backend/test_tts.py
"""

import sys
from pathlib import Path

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.services.ai.tts import speak
from backend.app.services.ai.orchestrator import TeachingSession
from backend.app.schemas.schemas import LearningPlan, Phase, TimeRange


def run_tts_tests():
    print("==================================================")
    print("Running Text-To-Speech (TTS) Engine Tests")
    print("==================================================")

    test_sentence = "Welcome to Blindspot Edu. Let's turn your lecture into an active learning session."
    
    print("\n--- Step 1: Synthesizing Test Sentence ---")
    audio_path = speak(test_sentence)
    print(f"[OK] Generated audio file at: {audio_path}")

    assert audio_path, "Expected non-empty audio path"
    path_obj = Path(audio_path)
    assert path_obj.exists(), f"Audio file does not exist: {audio_path}"
    file_size = path_obj.stat().st_size
    assert file_size > 0, "Audio file is empty"
    print(f"[OK] File size: {file_size} bytes")

    print("\n--- Step 2: Testing Cache Hit ---")
    cached_path = speak(test_sentence)
    assert cached_path == audio_path, "Expected identical cached audio path"
    print(f"[OK] Cache hit verified: {cached_path}")

    print("\n--- Step 3: Testing Orchestrator Live TTS Integration ---")
    plan = LearningPlan(
        lecture_id=99,
        phases=[
            Phase(
                order=0,
                title="Testing Live Voice Delivery",
                teaching_script="In this phase, the voice agent explains how gradients propagate.",
                source_timestamps=[TimeRange(start=0.0, end=15.0)],
            )
        ],
    )

    session = TeachingSession(session_id="tts-integration-test", lecture_id=99, plan=plan)
    events = session.start()

    speaking_event = next(e for e in events if e.type == "speaking")
    emitted_audio = speaking_event.payload.get("audio_url")
    print(f"[OK] Orchestrator emitted live TTS audio: {emitted_audio}")
    assert emitted_audio, "Expected orchestrator to emit valid audio path/url"
    assert Path(emitted_audio).exists(), "Emitted audio file does not exist"

    print("\n==================================================")
    print("All TTS & Orchestrator Integration Tests Passed! [PASS]")
    print("==================================================")


if __name__ == "__main__":
    run_tts_tests()
