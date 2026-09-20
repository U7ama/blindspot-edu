"""
backend/test_api_session.py

Tests the API and Orchestrator session connection live against FastAPI:
  1. POST /api/lectures/1/session -> Starts session from DB.
  2. POST /api/lectures/1/session/{session_id}/command (show_me) -> Jumped to timestamp.
  3. POST /api/lectures/1/session/{session_id}/command (explain_again) -> Speaking.
  4. POST /api/lectures/1/session/{session_id}/command (quiz_me) -> Quiz started.
  5. POST /api/lectures/1/session/{session_id}/command (next) -> Advances phase.

Usage:
    python backend/test_api_session.py
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


def test_live_session():
    print("==================================================")
    print("Testing Orchestrator API & DB Connection")
    print("==================================================")

    # 1. Start Session
    session_id = "test_live_session_101"
    print("\n--- 1. Starting Session for Lecture 1 from DB ---")
    start_events = post_json(f"/lectures/1/session?session_id={session_id}", {})
    assert len(start_events) == 3, f"Expected 3 start events, got {len(start_events)}"
    print(f"[OK] Event 0: {start_events[0]['type']} -> Phase: '{start_events[0]['payload']['title']}'")
    print(f"[OK] Event 1: {start_events[1]['type']} -> Audio: {start_events[1]['payload'].get('audio_url')}")
    print(f"[OK] Event 2: {start_events[2]['type']}")

    # 2. Command: show_me
    print("\n--- 2. Command 'show_me' ---")
    show_events = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "show_me"},
    )
    assert show_events[0]["type"] == "jumped_to_timestamp"
    ts = show_events[0]["payload"]["timestamp"]
    print(f"[OK] Jumped to source timestamp receipt: {ts['start']}s - {ts['end']}s")

    # 3. Command: explain_again
    print("\n--- 3. Command 'explain_again' ---")
    explain_events = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "explain_again"},
    )
    assert explain_events[0]["type"] == "speaking"
    print(f"[OK] Re-explanation speaking triggered successfully")

    # 4. Command: quiz_me
    print("\n--- 4. Command 'quiz_me' ---")
    quiz_events = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "quiz_me"},
    )
    assert quiz_events[0]["type"] == "quiz_started"
    print(f"[OK] Quiz loaded from DB: {quiz_events[0]['payload']['question']}")

    # 5. Command: next
    print("\n--- 5. Command 'next' ---")
    next_events = post_json(
        f"/lectures/1/session/{session_id}/command",
        {"session_id": session_id, "command": "next"},
    )
    assert next_events[0]["type"] == "phase_started"
    print(f"[OK] Advanced to Phase 1 from DB: '{next_events[0]['payload']['title']}'")

    print("\n==================================================")
    print("Orchestrator DB Connection & API Tests Passed! [PASS]")
    print("==================================================")


if __name__ == "__main__":
    test_live_session()
