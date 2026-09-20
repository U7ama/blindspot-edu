"""
backend/ai/whiteboard/student_review.py

Student-Drawn Input Evaluator & AI Whiteboard Reviewer (Step 8 / Blueprint §2.4 & §3.2).
Evaluates student-drawn whiteboard work, generates encouraging spoken feedback,
and emits live visual annotations/corrections onto the canvas.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion
from backend.app.services.ai.whiteboard.tts_sync import synthesize_sync
from backend.app.services.ai.whiteboard.generator import LLMTimedCommand, _normalize_subtype


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class LLMStudentReviewResponse(BaseModel):
    status: Literal["correct", "partially_correct", "needs_improvement"] = Field(
        description="Evaluation outcome of the student's work"
    )
    score_percent: int = Field(
        default=85, description="Estimated score percentage between 0 and 100"
    )
    feedback_speech: str = Field(
        description="Warm, supportive spoken explanation praising what they got right and explaining any fix needed (2 to 4 sentences, no markdown)."
    )
    visual_actions: List[LLMTimedCommand] = Field(
        default_factory=list,
        description="1 to 4 visual draw/highlight commands on the board reinforcing the feedback (e.g. green highlight or checkmark)."
    )


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

STUDENT_REVIEW_SYSTEM_PROMPT = """\
You are an inspiring, expert AI Tutor grading and reviewing a student's whiteboard solution mid-lesson.
The student drew/wrote their solution directly on the vector whiteboard canvas.

### INPUT PROVIDED TO YOU:
1. `lesson_context`: The topic or task currently being studied.
2. `student_work_summary`: Structured description of newly added shapes, formulas, text, and arrows drawn by the student.
3. `all_board_objects`: Complete list of all objects currently on the board.

### YOUR GOAL:
1. `status`: Choose "correct", "partially_correct", or "needs_improvement".
2. `score_percent`: Assign a fair score (0 to 100).
3. `feedback_speech`:
   - Speak directly to the student in friendly, encouraging natural English (2 to 4 spoken sentences, ~35-65 words).
   - Celebrate their effort, clearly acknowledge what they drew, and gently guide any improvement.
   - Do NOT use markdown symbols, asterisks, or bold text (this will be synthesized by TTS).
4. `visual_actions`:
   - If their work is correct, emit a `highlight` with emerald color `#34D399` on their shape or text ID, or add a congratulatory label.
   - If something is missing or needs fixing, emit a visual correction (e.g. `connect_arrow` or `add_text` with the corrected value).
   - Set `trigger_word` to the exact word in `feedback_speech` when the action occurs.

Respond with a JSON object in this exact shape:
{
  "status": "correct",
  "score_percent": 95,
  "feedback_speech": "Fantastic job! You calculated the current correctly as ninety milliamps and properly placed the ground reference. Your circuit logic is completely sound.",
  "visual_actions": [
    {
      "trigger_word": "Fantastic",
      "command": {
        "op": "highlight",
        "target_id": "elem_calc",
        "color": "#34D399",
        "duration_ms": 2000
      }
    },
    {
      "trigger_word": "ground",
      "command": {
        "op": "add_text",
        "id": "review_badge",
        "x": 260,
        "y": 420,
        "text": "✓ Solution Verified (I = 90mA)",
        "stroke_color": "#34D399",
        "font_size": 18
      }
    }
  ]
}
"""


# ---------------------------------------------------------------------------
# Core Review Function
# ---------------------------------------------------------------------------

def evaluate_student_work(
    student_work_summary: str,
    all_board_objects: List[dict[str, Any]],
    lesson_context: dict[str, Any],
    voice: Optional[str] = None,
) -> dict[str, Any]:
    """Evaluates student-drawn whiteboard work and generates vocal feedback + visual actions."""
    user_prompt = (
        f"LESSON / PROBLEM CONTEXT:\n"
        f"- Title: {lesson_context.get('lessonTitle', 'Active Problem')}\n"
        f"- Background Script: {lesson_context.get('speechScript', '')}\n\n"
        f"STUDENT-DRAWN INPUTS:\n{student_work_summary}\n\n"
        f"ALL OBJECTS CURRENTLY ON BOARD:\n{json.dumps(all_board_objects, indent=2)}"
    )

    llm_response: LLMStudentReviewResponse = chat_completion(
        system_prompt=STUDENT_REVIEW_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
        response_model=LLMStudentReviewResponse,
    )  # type: ignore

    # Clean text for TTS
    clean_speech = (
        llm_response.feedback_speech
        .replace('\u2011', '-')
        .replace('\u2012', '-')
        .replace('\u2013', '-')
        .replace('\u2014', '-')
        .replace('\u2018', "'")
        .replace('\u2019', "'")
        .replace('\u201c', '"')
        .replace('\u201d', '"')
    )

    # Synthesize audio with timing marks
    tts_result = synthesize_sync(clean_speech, voice=voice)

    # Normalize correction commands
    correction_commands = []
    for va in llm_response.visual_actions:
        cmd = va.command
        cmd_dict: dict[str, Any] = {"op": cmd.op}

        if cmd.id:
            cmd_dict["id"] = cmd.id
        if cmd.op == "highlight":
            cmd_dict["targetId"] = cmd.target_id or cmd.id or ""
            cmd_dict["color"] = cmd.color or "#34D399"
            cmd_dict["durationMs"] = cmd.duration_ms or 2000.0
        elif cmd.op == "add_text":
            cmd_dict["x"] = cmd.x if cmd.x is not None else 260.0
            cmd_dict["y"] = cmd.y if cmd.y is not None else 400.0
            cmd_dict["text"] = cmd.text or "✓ Great Work"
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#34D399",
                "fontSize": cmd.font_size or 18.0,
            }
        elif cmd.op == "add_shape":
            cmd_dict["subtype"] = _normalize_subtype(cmd.subtype)
            cmd_dict["x"] = cmd.x if cmd.x is not None else 200.0
            cmd_dict["y"] = cmd.y if cmd.y is not None else 200.0
            cmd_dict["width"] = cmd.width if cmd.width is not None else 100.0
            cmd_dict["height"] = cmd.height if cmd.height is not None else 60.0
            if cmd.label:
                cmd_dict["label"] = cmd.label
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#34D399",
                "fillColor": cmd.fill_color or "rgba(52, 211, 153, 0.18)",
                "strokeWidth": cmd.stroke_width or 3.0,
            }
        elif cmd.op == "connect_arrow":
            cmd_dict["from"] = cmd.from_anchor or ""
            cmd_dict["to"] = cmd.to_anchor or ""
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#FBBF24",
                "strokeWidth": cmd.stroke_width or 2.5,
            }

        correction_commands.append(
            {
                "triggerWord": va.trigger_word,
                "command": cmd_dict,
            }
        )

    return {
        "status": llm_response.status,
        "scorePercent": llm_response.score_percent,
        "feedbackSpeech": clean_speech,
        "audioUrl": tts_result["audio_url"],
        "durationMs": tts_result["duration_ms"],
        "timingMarks": tts_result["timing_marks"],
        "correctionCommands": correction_commands,
    }
