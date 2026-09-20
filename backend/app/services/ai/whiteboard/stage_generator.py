"""
backend/ai/whiteboard/stage_generator.py

High-Definition Tier-2 Stage Synthesizer for Multi-Stage Whiteboard Lectures.
Generates spoken narrative, frame-synchronized vector draw commands, and spatial camera glide
for an individual stage in the course curriculum.
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from pathlib import Path
from typing import Any, List, Optional
from pydantic import BaseModel, Field, model_validator

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion
from backend.app.services.ai.whiteboard.tts_sync import synthesize_sync
from backend.app.services.ai.whiteboard.generator import LLMTimedCommand, _normalize_subtype

logger = logging.getLogger(__name__)


class LLMStageContentResponse(BaseModel):
    speech_script: str = Field(
        default="Welcome to this stage. Let us observe the concepts visually.",
        description="Conversational spoken explanation for this stage (45 to 85 words). No markdown symbols."
    )
    timed_commands: List[LLMTimedCommand] = Field(
        default_factory=list,
        description="3 to 6 synchronized visual draw commands for this stage."
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_stage_content(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        speech = (
            data.get("speech_script")
            or data.get("speechScript")
            or data.get("narrative")
            or data.get("script")
            or data.get("speech")
            or data.get("explanation")
            or "Let us explore the core concepts on the whiteboard."
        )

        raw_cmds = (
            data.get("timed_commands")
            or data.get("timedCommands")
            or data.get("commands")
            or data.get("draw_commands")
            or data.get("steps")
            or []
        )

        return {
            "speech_script": speech,
            "timed_commands": raw_cmds,
        }


STAGE_GENERATOR_SYSTEM_PROMPT = """\
You are an expert AI Visual Educator generating content for ONE STAGE in a structured multi-stage whiteboard course.

### CANVAS SPATIAL LAYOUT FOR THIS STAGE:
- Coordinate space: width = 700px, height = 500px (Origin relative to stage: X = 80 to 650, Y = 60 to 440).
- For `add_shape`: Use generous dimensions (width 130-170px, height 60-80px) so labels have plenty of internal whitespace and never touch borders.
- For `connect_arrow`: Always use anchor notation (`from_anchor: "node1.right"`, `to_anchor: "node2.left"`).
- For `add_text`: Use font_size 16 to 22.

### OUTPUT REQUIREMENTS:
1. `speech_script`: Natural spoken English (45-85 words, 3-5 sentences). No markdown asterisks.
2. `timed_commands`: 3 to 6 draw commands timed to exact trigger words in `speech_script`.

Respond ONLY with a JSON object in this exact schema:
{
  "speech_script": "Let's explore our core data structure. First, we place our linear array blocks on the left. Next, we connect them with pointer arrows to form a linked list. Finally, we highlight how elements are accessed step by step.",
  "timed_commands": [
    {
      "trigger_word": "linear",
      "command": {
        "op": "add_shape",
        "id": "array_block",
        "subtype": "rectangle",
        "x": 120,
        "y": 180,
        "width": 150,
        "height": 70,
        "label": "Array Block",
        "stroke_color": "#818CF8",
        "fill_color": "rgba(129, 140, 248, 0.18)"
      }
    },
    {
      "trigger_word": "pointer",
      "command": {
        "op": "add_shape",
        "id": "node_2",
        "subtype": "rectangle",
        "x": 380,
        "y": 180,
        "width": 150,
        "height": 70,
        "label": "Next Node",
        "stroke_color": "#34D399",
        "fill_color": "rgba(52, 211, 153, 0.18)"
      }
    },
    {
      "trigger_word": "arrows",
      "command": {
        "op": "connect_arrow",
        "id": "link_arrow",
        "from_anchor": "array_block.right",
        "to_anchor": "node_2.left",
        "stroke_color": "#38BDF8"
      }
    },
    {
      "trigger_word": "highlight",
      "command": {
        "op": "highlight",
        "target_id": "link_arrow",
        "color": "#FBBF24",
        "duration_ms": 1500
      }
    }
  ]
}
"""


def generate_course_stage(
    topic: str,
    course_title: str,
    stage_outline: dict[str, Any],
    previous_stages_summary: Optional[str] = None,
    voice: Optional[str] = None,
) -> dict[str, Any]:
    """Synthesizes speech, timing marks, and draw commands for a specific course stage."""
    stage_idx = stage_outline.get("stageIndex", 1)
    stage_title = stage_outline.get("title", f"Stage {stage_idx}")
    concept_goal = stage_outline.get("conceptGoal", "")
    spatial_offset_x = (stage_idx - 1) * 750.0

    user_prompt = (
        f"COURSE TITLE: {course_title}\n"
        f"OVERALL TOPIC: {topic}\n"
        f"CURRENT STAGE ({stage_idx}): {stage_title}\n"
        f"STAGE LEARNING GOAL: {concept_goal}\n"
        f"PREVIOUS STAGES CONTEXT: {previous_stages_summary or 'Starting Stage'}\n\n"
        f"Generate the spoken speech script and 3-6 synchronized draw commands for this stage."
    )

    llm_response: LLMStageContentResponse = chat_completion(
        system_prompt=STAGE_GENERATOR_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
        response_model=LLMStageContentResponse,
    )  # type: ignore

    # Clean text for TTS
    clean_speech = (
        llm_response.speech_script
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

    first_word = clean_speech.split()[0].strip(",.?!") if clean_speech else "Now"

    # Transform commands and apply spatial offset X
    transformed_commands = []

    # 1. First command: Smooth Camera Pan/Zoom Glide to this stage's territory
    transformed_commands.append(
        {
            "triggerWord": first_word,
            "command": {
                "op": "pan_zoom",
                "x": -spatial_offset_x,
                "y": 0.0,
                "scale": 1.0,
            },
        }
    )

    # 2. Stage Title Header Text
    transformed_commands.append(
        {
            "triggerWord": first_word,
            "command": {
                "op": "add_text",
                "id": f"stage_hdr_{stage_idx}",
                "x": spatial_offset_x + 120.0,
                "y": 40.0,
                "text": f"Stage {stage_idx}: {stage_title}",
                "style": {
                    "strokeColor": "#38BDF8",
                    "fontSize": 20.0,
                },
            },
        }
    )

    # 3. Process LLM generated commands with spatial offset
    for tc in llm_response.timed_commands:
        cmd = tc.command
        cmd_dict: dict[str, Any] = {"op": cmd.op}

        if cmd.id:
            cmd_dict["id"] = f"s{stage_idx}_{cmd.id}"

        if cmd.op == "add_shape":
            cmd_dict["subtype"] = _normalize_subtype(cmd.subtype)
            base_x = cmd.x if cmd.x is not None else 200.0
            cmd_dict["x"] = spatial_offset_x + base_x
            cmd_dict["y"] = cmd.y if cmd.y is not None else 180.0
            
            lbl = cmd.label or ""
            base_w = cmd.width if cmd.width is not None else 140.0
            min_w = max(base_w, len(lbl) * 8.5 + 40.0) if lbl else base_w
            cmd_dict["width"] = min_w
            cmd_dict["height"] = max(cmd.height if cmd.height is not None else 65.0, 50.0)
            if cmd.label:
                cmd_dict["label"] = cmd.label
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#818CF8",
                "fillColor": cmd.fill_color or "rgba(129, 140, 248, 0.18)",
                "strokeWidth": cmd.stroke_width or 3.0,
            }

        elif cmd.op == "connect_arrow":
            from_a = cmd.from_anchor or ""
            to_a = cmd.to_anchor or ""
            if from_a and "." in from_a:
                node, anc = from_a.split(".", 1)
                from_a = f"s{stage_idx}_{node}.{anc}"
            if to_a and "." in to_a:
                node, anc = to_a.split(".", 1)
                to_a = f"s{stage_idx}_{node}.{anc}"
            cmd_dict["from"] = from_a
            cmd_dict["to"] = to_a
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#38BDF8",
                "strokeWidth": cmd.stroke_width or 2.5,
            }

        elif cmd.op == "add_text":
            base_x = cmd.x if cmd.x is not None else 200.0
            cmd_dict["x"] = spatial_offset_x + base_x
            cmd_dict["y"] = cmd.y if cmd.y is not None else 360.0
            cmd_dict["text"] = cmd.text or "Key Concept"
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#F8FAFC",
                "fontSize": cmd.font_size or 18.0,
            }

        elif cmd.op == "highlight":
            target = cmd.target_id or cmd.id or ""
            cmd_dict["targetId"] = f"s{stage_idx}_{target}" if target and not target.startswith(f"s{stage_idx}_") else target
            cmd_dict["color"] = cmd.color or "#FBBF24"
            cmd_dict["durationMs"] = cmd.duration_ms or 1800.0

        transformed_commands.append(
            {
                "triggerWord": tc.trigger_word,
                "command": cmd_dict,
            }
        )

    return {
        "stageIndex": stage_idx,
        "title": stage_title,
        "conceptGoal": concept_goal,
        "speechScript": clean_speech,
        "audioUrl": tts_result["audio_url"],
        "durationMs": tts_result["duration_ms"],
        "timingMarks": tts_result["timing_marks"],
        "timedCommands": transformed_commands,
        "cameraFocus": {
            "x": -spatial_offset_x,
            "y": 0.0,
            "scale": 1.0,
        },
    }
