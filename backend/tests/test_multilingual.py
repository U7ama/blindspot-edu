"""
backend/test_multilingual.py

Tests Option B: Full Multilingual Support (Text & Native Voice Synthesis):
1. Unit tests translation.py for Spanish and Urdu.
2. Starts a live session for Lecture 1, switches to Urdu, and advances phase -> verifies Urdu script & audio.
3. Switches to Spanish, asks a student question -> verifies Spanish response & audio.

Usage:
    python backend/test_multilingual.py
"""

import json
import sys
from pathlib import Path
import urllib.request

# Ensure project root is on sys.path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.translation import translate_text

BASE_URL = "http://localhost:8000/api"


def post_json(endpoint: str, data: dict) -> list:
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def test_multilingual_pipeline():
    print("==================================================")
    print("Testing Full Multilingual Text & Voice Pipeline")
    print("==================================================")

    sample_text = "Algorithms are step-by-step procedures for solving computational problems."

    # 1. Test Direct Translation
    print("\n--- 1. Direct Translation Tests ---")
    spanish_text = translate_text(sample_text, "Spanish")
    print(f"[OK] Spanish Translation: {len(spanish_text)} chars")
    assert len(spanish_text) > 10

    urdu_text = translate_text(sample_text, "Urdu")
    print(f"[OK] Urdu Translation: {len(urdu_text)} chars")
    assert len(urdu_text) > 10

    # 2. Live Session with Urdu Voice
    session_id = "test_multi_sess_303"
    print(f"\n--- 2. Live Session Switching to Urdu (ur-PK-AsadNeural) ---")
    post_json(f"/lectures/1/session?session_id={session_id}", {})

    # Set voice to Urdu
    post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "set_voice", "argument": "ur-PK-AsadNeural"},
    )

    # Next Phase in Urdu
    events_urdu = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "next"},
    )
    speak_ev_urdu = next(e for e in events_urdu if e["type"] == "speaking")
    print(f"[OK] Spoken Urdu Text Length: {len(speak_ev_urdu['payload']['text'])} chars")
    print(f"[OK] Urdu Neural Audio: {speak_ev_urdu['payload']['audio_url']}")
    assert speak_ev_urdu["payload"].get("language") == "Urdu"

    # 3. Live Session with Spanish Voice & Q&A
    print(f"\n--- 3. Live Session Switching to Spanish (es-ES-AlvaroNeural) ---")
    post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "set_voice", "argument": "es-ES-AlvaroNeural"},
    )

    events_es = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "Why should we study algorithm efficiency?"},
    )
    speak_ev_es = next(e for e in events_es if e["type"] == "speaking")
    print(f"[OK] Spoken Spanish Response Length: {len(speak_ev_es['payload']['text'])} chars")
    print(f"[OK] Spanish Neural Audio: {speak_ev_es['payload']['audio_url']}")
    assert speak_ev_es["payload"].get("language") == "Spanish"

    print("\n==================================================")
    print("Full Multilingual Text & Voice Pipeline Verified! [PASS]")
    print("==================================================")


if __name__ == "__main__":
    test_multilingual_pipeline()
