"""
backend/ai/whiteboard/interruption_handler.py

Turn-Based Student Interruption & Contextual Whiteboard Q&A Handler (Step 6).
Handles mid-lesson questions from students, analyzes the current board state,
and generates a spoken clarification paired with visual whiteboard highlights/drawings.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, List, Optional

from pydantic import BaseModel, Field

# Ensure project root is on sys.path
_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion
from backend.app.services.ai.whiteboard.tts_sync import synthesize_sync
from backend.app.services.ai.whiteboard.generator import LLMTimedCommand, _normalize_subtype


# ---------------------------------------------------------------------------
# Pydantic Response Schema
# ---------------------------------------------------------------------------

class LLMInterruptionResponse(BaseModel):
    answer_text: str = Field(
        description="Clear, friendly spoken explanation answering the student's question (2 to 4 conversational sentences, no markdown)."
    )
    visual_actions: List[LLMTimedCommand] = Field(
        default_factory=list,
        description="1 to 4 visual draw or highlight commands timed to words in answer_text to visually clarify the answer."
    )


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

INTERRUPTION_SYSTEM_PROMPT = """\
You are an expert, encouraging AI Tutor answering a student who raised their hand mid-lesson.
The student paused the whiteboard lesson at a specific moment to ask a question.

### INPUT PROVIDED TO YOU:
1. `student_question`: What the student asked.
2. `current_board_objects`: The exact list of shapes, text, and arrows currently visible on the board.
3. `lesson_context`: The lesson title and what was just being explained.

### YOUR GOAL:
1. `answer_text`:
   - Speak directly to the student in friendly, crystal-clear conversational English (2 to 4 sentences, ~30-60 words).
   - Answer their specific question directly.
   - Do NOT use markdown symbols, asterisks, or bold text (this will be synthesized by TTS).

2. `visual_actions`:
   - Point to or highlight the exact object on the board that clarifies their question!
   - For example, if they ask about the resistor or mass block, emit a `highlight` command targeting that object's `id`.
   - If a new calculation or label is needed, emit an `add_text` or `update_shape` command.
   - Set `trigger_word` to the exact word in `answer_text` when the visual highlight should fire.

Respond with a JSON object in this exact shape:
{
  "answer_text": "Great question! The 100-ohm resistor limits how much current can pass from our nine-volt battery. By Ohm's law, nine volts divided by one hundred ohms yields ninety milliamps.",
  "visual_actions": [
    {
      "trigger_word": "resistor",
      "command": {
        "op": "highlight",
        "target_id": "resistor",
        "color": "#FBBF24",
        "duration_ms": 1800
      }
    },
    {
      "trigger_word": "Ohm's",
      "command": {
        "op": "add_text",
        "id": "qa_note",
        "x": 240,
        "y": 380,
        "text": "R = 100 Ω controls current (I = V / R)",
        "stroke_color": "#34D399",
        "font_size": 16
      }
    }
  ]
}
"""


# ---------------------------------------------------------------------------
# Core Q&A Handler
# ---------------------------------------------------------------------------

def handle_student_interruption(
    student_query: str,
    current_board_objects: List[dict[str, Any]],
    active_lesson_context: dict[str, Any],
    focused_objects: Optional[List[dict[str, Any]]] = None,
    voice: Optional[str] = None,
) -> dict[str, Any]:
    """Answers a student's mid-lesson question with voice + whiteboard actions.

    Args:
        student_query: The question transcribed from student STT.
        current_board_objects: Active elements on the board at the time of pause.
        active_lesson_context: Info about current lesson beat.
        focused_objects: Elements the student is currently clicking/selecting.
        voice: Optional neural voice ID.

    Returns:
        Dictionary formatted as InterruptionResponse.
    """
    # Create compact summary of objects on board
    board_summary = []
    for obj in current_board_objects:
        summary_item = {
            "id": obj.get("id"),
            "type": obj.get("type"),
            "label": obj.get("label"),
            "text": obj.get("geometry", {}).get("text") if obj.get("type") == "text" else None,
        }
        board_summary.append(summary_item)

    user_prompt = f"STUDENT QUESTION:\n{student_query}\n\n"

    if focused_objects and len(focused_objects) > 0:
        user_prompt += (
            f"STUDENT IS DIRECTLY POINTING AT THIS ELEMENT ON THE BOARD:\n"
            f"{json.dumps(focused_objects, indent=2)}\n"
            f"(Please answer the question specifically explaining this focused element, and emit a highlight command on its ID)\n\n"
        )

    user_prompt += (
        f"ACTIVE LESSON CONTEXT:\n"
        f"- Title: {active_lesson_context.get('lessonTitle', 'Lesson')}\n"
        f"- What was being said: {active_lesson_context.get('speechScript', '')}\n\n"
        f"CURRENT VISIBLE BOARD OBJECTS:\n{json.dumps(board_summary, indent=2)}"
    )

    llm_response: LLMInterruptionResponse = chat_completion(
        system_prompt=INTERRUPTION_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
        response_model=LLMInterruptionResponse,
    )  # type: ignore

    # Sanitize punctuation for TTS
    clean_answer = (
        llm_response.answer_text
        .replace('\u2011', '-')
        .replace('\u2012', '-')
        .replace('\u2013', '-')
        .replace('\u2014', '-')
        .replace('\u2018', "'")
        .replace('\u2019', "'")
        .replace('\u201c', '"')
        .replace('\u201d', '"')
    )

    # Synthesize explanation speech & timing marks
    tts_result = synthesize_sync(clean_answer, voice=voice)

    # Normalize clarification commands
    clarification_commands = []
    for va in llm_response.visual_actions:
        cmd = va.command
        cmd_dict: dict[str, Any] = {"op": cmd.op}

        if cmd.id:
            cmd_dict["id"] = cmd.id
        if cmd.op == "highlight":
            cmd_dict["targetId"] = cmd.target_id or cmd.id or ""
            cmd_dict["color"] = cmd.color or "#FBBF24"
            cmd_dict["durationMs"] = cmd.duration_ms or 1800.0
        elif cmd.op == "add_text":
            cmd_dict["x"] = cmd.x if cmd.x is not None else 200.0
            cmd_dict["y"] = cmd.y if cmd.y is not None else 380.0
            cmd_dict["text"] = cmd.text or ""
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#34D399",
                "fontSize": cmd.font_size or 16.0,
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
                "strokeColor": cmd.stroke_color or "#FBBF24",
                "fillColor": cmd.fill_color or "rgba(251, 191, 36, 0.18)",
                "strokeWidth": cmd.stroke_width or 3.0,
            }
        elif cmd.op == "connect_arrow":
            cmd_dict["from"] = cmd.from_anchor or ""
            cmd_dict["to"] = cmd.to_anchor or ""
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#38BDF8",
                "strokeWidth": cmd.stroke_width or 2.5,
            }

        clarification_commands.append(
            {
                "triggerWord": va.trigger_word,
                "command": cmd_dict,
            }
        )

    return {
        "answerText": clean_answer,
        "audioUrl": tts_result["audio_url"],
        "durationMs": tts_result["duration_ms"],
        "timingMarks": tts_result["timing_marks"],
        "clarificationCommands": clarification_commands,
    }
