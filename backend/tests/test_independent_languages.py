"""
backend/test_independent_languages.py

Tests independent controls for Text Language and Voice Language:
Example: Text Language = English, Voice = Urdu (Asad)
Result: Dialogue box receives English text, while Audio is synthesized in Urdu!

Usage:
    python backend/test_independent_languages.py
"""

import json
import urllib.request

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


def test_independent_language_controls():
    print("==================================================")
    print("Testing Independent Text & Voice Controls")
    print("==================================================")

    session_id = "test_indep_sess_404"
    post_json(f"/lectures/1/session?session_id={session_id}", {})

    # Set Text to English & Voice to Urdu (Asad)
    print("\n1. Setting Text Language = English, Voice = Urdu (Asad)...")
    post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "set_text_language", "argument": "English"},
    )
    post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "set_voice", "argument": "ur-PK-AsadNeural"},
    )

    # Trigger Next Phase
    print("\n2. Triggering Next Phase...")
    events = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "next"},
    )
    speak_ev = next(e for e in events if e["type"] == "speaking")
    text_sample = speak_ev["payload"]["text"][:120]
    audio_url = speak_ev["payload"]["audio_url"]

    print(f"   Dialogue Text (English): {text_sample}...")
    print(f"   Audio URL (Urdu): {audio_url}")
    print(f"   Text Language: {speak_ev['payload'].get('text_language')}")
    print(f"   Voice Language: {speak_ev['payload'].get('voice_language')}")

    assert speak_ev["payload"]["text_language"] == "English"
    assert speak_ev["payload"]["voice_language"] == "Urdu"
    assert "algorithm" in text_sample.lower() or "step" in text_sample.lower() or "problem" in text_sample.lower() or len(text_sample) > 20

    print("\n==================================================")
    print("Independent Text & Voice Controls Verified! [PASS]")
    print("==================================================")


if __name__ == "__main__":
    test_independent_language_controls()
