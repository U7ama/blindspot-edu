"""
backend/test_voice_switching.py

Tests the voice/language switching capabilities:
1. GET /api/session/voices -> Catalog of supported languages & voices.
2. POST /api/lectures/1/session/test_voice_sess/command (set_voice) -> Voice updated & speaking event with new audio.

Usage:
    python backend/test_voice_switching.py
"""

import json
import urllib.request

BASE_URL = "http://localhost:8000/api"


def get_json(endpoint: str) -> list | dict:
    url = f"{BASE_URL}{endpoint}"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))


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


def test_voice_switching():
    print("==================================================")
    print("Testing Voice & Language Switching Live")
    print("==================================================")

    # 1. Fetch available voices
    voices = get_json("/session/voices")
    print(f"\n1. Available Voices ({len(voices)}):")
    for v in voices:
        print(f"   - {v['language']}: {v['name']} ({v['id']})")
    assert len(voices) >= 5, "Expected at least 5 voices"

    # 2. Start session
    session_id = "test_voice_sess_202"
    print(f"\n2. Starting Session for Lecture 1 ({session_id})...")
    post_json(f"/lectures/1/session?session_id={session_id}", {})

    # 3. Switch voice to UK English Ryan (en-GB-RyanNeural)
    print("\n3. Switching voice to UK English (en-GB-RyanNeural)...")
    res1 = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "set_voice", "argument": "en-GB-RyanNeural"},
    )
    print("   Event:", res1[0]["type"], "-> Audio:", res1[0]["payload"]["audio_url"])
    assert res1[0]["payload"]["voice"] == "en-GB-RyanNeural"

    # 4. Switch voice to Spanish Alvaro (es-ES-AlvaroNeural)
    print("\n4. Switching voice to Spanish (es-ES-AlvaroNeural)...")
    res2 = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "set_voice", "argument": "es-ES-AlvaroNeural"},
    )
    print("   Event:", res2[0]["type"], "-> Audio:", res2[0]["payload"]["audio_url"])
    assert res2[0]["payload"]["voice"] == "es-ES-AlvaroNeural"

    print("\n==================================================")
    print("Voice & Language Switching Verified! [PASS]")
    print("==================================================")


if __name__ == "__main__":
    test_voice_switching()
