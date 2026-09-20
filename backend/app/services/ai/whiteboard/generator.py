"""
backend/ai/whiteboard/generator.py

Dedicated LLM Whiteboard Lesson Generator (Step 5).
Accepts educational prompts or transcripts and produces an interleaved teaching
lesson combining a natural spoken speech script, precise vector draw commands,
and synchronized timing marks.
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator

# Ensure project root is on sys.path
_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion
from backend.app.services.ai.whiteboard.tts_sync import synthesize_sync


# ---------------------------------------------------------------------------
# Pydantic Schemas for LLM Generation
# ---------------------------------------------------------------------------

def _normalize_subtype(raw: Optional[str]) -> str:
    if not raw:
        return "rectangle"
    s = raw.lower().strip()
    if s in ("circle", "ellipse", "oval", "round", "sphere"):
        return "circle"
    if s in ("diamond", "rhombus", "decision"):
        return "diamond"
    if s in ("cylinder", "database", "disk", "storage"):
        return "cylinder"
    return "rectangle"


class LLMDrawCommand(BaseModel):
    op: str = Field(default="add_shape", description="The vector whiteboard operation")
    id: Optional[str] = Field(default=None, description="Unique identifier for the element")
    subtype: Optional[str] = Field(
        default="rectangle", description="Shape geometry subtype (rectangle, circle, diamond, cylinder)"
    )
    x: Optional[float] = Field(default=None, description="X coordinate on canvas (0 to 800)")
    y: Optional[float] = Field(default=None, description="Y coordinate on canvas (0 to 500)")
    width: Optional[float] = Field(default=None, description="Width in pixels")
    height: Optional[float] = Field(default=None, description="Height in pixels")
    text: Optional[str] = Field(default=None, description="Text string for add_text")
    label: Optional[str] = Field(default=None, description="Center label on shape")
    from_anchor: Optional[str] = Field(
        default=None, description="Source anchor (e.g. 'battery.right', 'box_a.top')"
    )
    to_anchor: Optional[str] = Field(
        default=None, description="Target anchor (e.g. 'resistor.left', 'box_b.bottom')"
    )
    target_id: Optional[str] = Field(
        default=None, description="Target element ID for highlight or updates"
    )
    color: Optional[str] = Field(default=None, description="Highlight color (e.g. '#38BDF8')")
    stroke_color: Optional[str] = Field(default="#818CF8", description="Border/stroke hex color")
    fill_color: Optional[str] = Field(default=None, description="Shape fill color with opacity")
    stroke_width: Optional[float] = Field(default=3.0, description="Stroke width in pixels")
    font_size: Optional[float] = Field(default=16.0, description="Font size in pixels")
    duration_ms: Optional[float] = Field(default=1500.0, description="Highlight duration in ms")
    scale: Optional[float] = Field(default=1.0, description="Zoom scale")

    @model_validator(mode="before")
    @classmethod
    def normalize_draw_cmd(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "subtype" in data:
                data["subtype"] = _normalize_subtype(data.get("subtype"))
            if "op" in data and not data["op"]:
                data["op"] = "add_shape"
        return data


class LLMTimedCommand(BaseModel):
    trigger_word: str = Field(
        description="The exact spoken word in speech_script that triggers this draw command"
    )
    command: LLMDrawCommand

    @model_validator(mode="before")
    @classmethod
    def normalize_command(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        trigger_word = data.get("trigger_word") or data.get("word") or "next"
        
        # If command is already structured
        if "command" in data and isinstance(data["command"], dict):
            if "subtype" in data["command"]:
                data["command"]["subtype"] = _normalize_subtype(data["command"]["subtype"])
            return data

        # If LLM used action/shape/arrow/etc.
        action = data.get("action") or data.get("op") or "add_shape"
        cmd_dict: dict[str, Any] = {}

        if action in ("add_shape", "shape"):
            cmd_dict["op"] = "add_shape"
            shape_info = data.get("shape", {}) if isinstance(data.get("shape"), dict) else data
            cmd_dict["id"] = shape_info.get("id") or data.get("id") or f"elem_{uuid.uuid4().hex[:6]}"
            cmd_dict["subtype"] = shape_info.get("subtype") or shape_info.get("type") or "rectangle"
            cmd_dict["x"] = float(shape_info.get("x", 200.0))
            cmd_dict["y"] = float(shape_info.get("y", 180.0))
            
            lbl = shape_info.get("label") or data.get("label") or ""
            base_w = float(shape_info.get("width", 140.0))
            min_w = max(base_w, len(lbl) * 8.5 + 40.0) if lbl else base_w
            cmd_dict["width"] = min_w
            cmd_dict["height"] = max(float(shape_info.get("height", 65.0)), 50.0)
            cmd_dict["label"] = lbl if lbl else None
            cmd_dict["stroke_color"] = shape_info.get("stroke_color") or "#818CF8"
            cmd_dict["fill_color"] = shape_info.get("fill_color") or "rgba(129, 140, 248, 0.18)"
        elif action in ("add_arrow", "connect_arrow", "arrow"):
            cmd_dict["op"] = "connect_arrow"
            arrow_info = data.get("arrow", {}) if isinstance(data.get("arrow"), dict) else data
            cmd_dict["id"] = arrow_info.get("id") or f"arrow_{uuid.uuid4().hex[:6]}"
            
            from_val = arrow_info.get("from") or data.get("from_anchor")
            if isinstance(from_val, dict):
                from_val = f"pos_{from_val.get('x', 100)}_{from_val.get('y', 100)}"
            to_val = arrow_info.get("to") or data.get("to_anchor")
            if isinstance(to_val, dict):
                to_val = f"pos_{to_val.get('x', 300)}_{to_val.get('y', 100)}"

            cmd_dict["from_anchor"] = str(from_val or "start.right")
            cmd_dict["to_anchor"] = str(to_val or "end.left")
            cmd_dict["stroke_color"] = arrow_info.get("stroke_color") or "#38BDF8"
        elif action in ("add_text", "text", "add_label"):
            cmd_dict["op"] = "add_text"
            cmd_dict["id"] = data.get("id") or f"text_{uuid.uuid4().hex[:6]}"
            cmd_dict["x"] = data.get("x", 200.0)
            cmd_dict["y"] = data.get("y", 60.0)
            cmd_dict["text"] = data.get("text") or data.get("label") or "Note"
            cmd_dict["stroke_color"] = data.get("stroke_color") or "#F8FAFC"
        elif action == "highlight":
            cmd_dict["op"] = "highlight"
            cmd_dict["target_id"] = data.get("target_id") or data.get("targetId") or ""
            cmd_dict["color"] = data.get("color") or "#38BDF8"
        else:
            cmd_dict["op"] = "add_shape"
            cmd_dict["id"] = data.get("id") or f"elem_{uuid.uuid4().hex[:6]}"
            cmd_dict["x"] = 250.0
            cmd_dict["y"] = 200.0

        return {
            "trigger_word": trigger_word,
            "command": cmd_dict,
        }


class LLMWhiteboardLessonResponse(BaseModel):
    title: str = Field(default="Visual Whiteboard Lesson", description="Short engaging title")
    description: str = Field(default="Live visual teaching session", description="Summary")
    speech_script: str = Field(
        description="Spoken teaching narrative. Conversational English. No markdown asterisks."
    )
    timed_commands: list[LLMTimedCommand] = Field(
        default_factory=list,
        description="Interleaved sequence of draw commands timed to words in speech_script"
    )


# ---------------------------------------------------------------------------
# System Prompt with Strict Schema Example
# ---------------------------------------------------------------------------

WHITEBOARD_GENERATOR_SYSTEM_PROMPT = """\
You are an expert AI Visual Educator and Whiteboard Animator.
Your goal is to explain educational concepts visually on a dynamic digital vector whiteboard while narrating clearly like a world-class teacher.

### CORE OUTPUT INSTRUCTIONS:
1. `speech_script`:
   - Write a natural, conversational script spoken by a teacher (3 to 6 sentences, ~35-70 words).
   - Do NOT include any markdown, asterisks, bolding, bullet points, or stage directions. It is synthesized directly by text-to-speech.
   - Mention key nouns and visual milestones clearly (e.g., "First, we place a battery on the left... Next, we connect a resistor...").

2. `timed_commands`:
   - Produce 4 to 8 draw commands that visually build the diagram as you speak.
   - Set `trigger_word` to the EXACT single word in your `speech_script` during which this drawing command should fire.

3. SPATIAL POSITIONING & LAYOUT:
   - Canvas coordinate space: width = 800px, height = 500px.
   - Left side: X = 100 to 220, Center: X = 320 to 460, Right side: X = 540 to 680.
   - Top: Y = 50 to 140, Middle: Y = 180 to 280, Bottom: Y = 340 to 440.
   - Give each shape generous space — do NOT overlap shapes.
   - Give every shape a memorable unique ID (e.g., "mass_block", "force_arrow", "root_node").

4. ANCHOR CONNECTIONS (`connect_arrow`):
   - Always use anchor notation: `from_anchor: "<source_id>.<anchor>"` and `to_anchor: "<target_id>.<anchor>"`.
   - Valid anchors: `top`, `bottom`, `left`, `right`.
   - Example: `from_anchor: "battery.right"`, `to_anchor: "resistor.left"`.

5. MODERN DARK-THEME COLOR PALETTE:
   - Headers/Text: `stroke_color: "#F8FAFC"`, `font_size: 20`
   - Primary elements: `stroke_color: "#818CF8"`, `fill_color: "rgba(129, 140, 248, 0.18)"` (Indigo)
   - Accent/Energy: `stroke_color: "#FBBF24"`, `fill_color: "rgba(251, 191, 36, 0.18)"` (Amber)
   - Success/Left branches: `stroke_color: "#34D399"`, `fill_color: "rgba(52, 211, 153, 0.18)"` (Emerald)
   - Connectors/Highlights: `stroke_color: "#38BDF8"`, `fill_color: "rgba(56, 189, 248, 0.18)"` (Sky Blue)

Respond with a JSON object in this exact shape:
{
  "title": "Newton's Second Law: F = m × a",
  "description": "Visual derivation of applied force, mass, and acceleration.",
  "speech_script": "Let's explore Newton's Second Law. First, we place a mass block of five kilograms on our surface. Next, we apply a horizontal force arrow pulling to the right. Finally, we observe how acceleration equals force divided by mass.",
  "timed_commands": [
    {
      "trigger_word": "Newton",
      "command": {
        "op": "add_text",
        "id": "title_text",
        "x": 240,
        "y": 40,
        "text": "Newton's Second Law: F = m · a",
        "stroke_color": "#F8FAFC",
        "font_size": 22
      }
    },
    {
      "trigger_word": "block",
      "command": {
        "op": "add_shape",
        "id": "mass_block",
        "subtype": "rectangle",
        "x": 160,
        "y": 200,
        "width": 120,
        "height": 70,
        "label": "Mass (5 kg)",
        "stroke_color": "#818CF8",
        "fill_color": "rgba(129, 140, 248, 0.18)"
      }
    },
    {
      "trigger_word": "force",
      "command": {
        "op": "connect_arrow",
        "id": "force_vector",
        "from_anchor": "mass_block.right",
        "to_anchor": "pos_540_235",
        "stroke_color": "#FBBF24"
      }
    },
    {
      "trigger_word": "right",
      "command": {
        "op": "highlight",
        "target_id": "force_vector",
        "color": "#FBBF24",
        "duration_ms": 1500
      }
    },
    {
      "trigger_word": "acceleration",
      "command": {
        "op": "add_text",
        "id": "calc_text",
        "x": 260,
        "y": 380,
        "text": "a = F / m = 20 N / 5 kg = 4 m/s²",
        "stroke_color": "#34D399",
        "font_size": 18
      }
    }
  ]
}
"""


# ---------------------------------------------------------------------------
# Generation Logic
# ---------------------------------------------------------------------------

def generate_whiteboard_lesson(
    prompt: str,
    voice: Optional[str] = None,
    context: Optional[str] = None,
) -> dict[str, Any]:
    """Generates an interleaved whiteboard lesson with synthesized TTS and timing marks.

    Args:
        prompt: Educational topic or concept to teach.
        voice: Optional neural TTS voice ID.
        context: Optional lecture context or prerequisites.

    Returns:
        A dictionary formatted as a WhiteboardLessonBeat ready for the frontend.
    """
    user_prompt = f"Topic to teach visually on the whiteboard:\n{prompt}"
    if context:
        user_prompt += f"\n\nContext / Background:\n{context}"

    # Step 1: Call LLM with structured output model
    llm_response: LLMWhiteboardLessonResponse = chat_completion(
        system_prompt=WHITEBOARD_GENERATOR_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
        response_model=LLMWhiteboardLessonResponse,
    )  # type: ignore

    # Sanitize unicode punctuation for flawless TTS & JSON streaming
    clean_speech_script = (
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

    # Step 2: Synthesize speech and extract word-level timing marks
    tts_result = synthesize_sync(clean_speech_script, voice=voice)

    # Step 3: Transform LLM draw commands to canonical frontend schema
    transformed_commands = []
    for tc in llm_response.timed_commands:
        cmd = tc.command
        cmd_dict: dict[str, Any] = {"op": cmd.op}

        if cmd.id:
            cmd_dict["id"] = cmd.id
        if cmd.op == "add_shape":
            cmd_dict["subtype"] = _normalize_subtype(cmd.subtype)
            cmd_dict["x"] = cmd.x if cmd.x is not None else 180.0
            cmd_dict["y"] = cmd.y if cmd.y is not None else 180.0
            cmd_dict["width"] = cmd.width if cmd.width is not None else 110.0
            cmd_dict["height"] = cmd.height if cmd.height is not None else 65.0
            if cmd.label:
                cmd_dict["label"] = cmd.label
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#818CF8",
                "fillColor": cmd.fill_color or "rgba(129, 140, 248, 0.18)",
                "strokeWidth": cmd.stroke_width or 3.0,
            }
        elif cmd.op == "add_text":
            cmd_dict["x"] = cmd.x if cmd.x is not None else 100.0
            cmd_dict["y"] = cmd.y if cmd.y is not None else 50.0
            cmd_dict["text"] = cmd.text or ""
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#F8FAFC",
                "fontSize": cmd.font_size or 18.0,
            }
        elif cmd.op == "connect_arrow":
            cmd_dict["from"] = cmd.from_anchor or ""
            cmd_dict["to"] = cmd.to_anchor or ""
            cmd_dict["style"] = {
                "strokeColor": cmd.stroke_color or "#38BDF8",
                "strokeWidth": cmd.stroke_width or 2.5,
            }
        elif cmd.op == "update_shape":
            cmd_dict["targetId"] = cmd.target_id or cmd.id or ""
            if cmd.label:
                cmd_dict["label"] = cmd.label
            if cmd.stroke_color or cmd.fill_color:
                cmd_dict["style"] = {}
                if cmd.stroke_color:
                    cmd_dict["style"]["strokeColor"] = cmd.stroke_color
                if cmd.fill_color:
                    cmd_dict["style"]["fillColor"] = cmd.fill_color
        elif cmd.op == "delete_shape":
            cmd_dict["targetId"] = cmd.target_id or cmd.id or ""
        elif cmd.op == "highlight":
            cmd_dict["targetId"] = cmd.target_id or cmd.id or ""
            cmd_dict["color"] = cmd.color or "#38BDF8"
            cmd_dict["durationMs"] = cmd.duration_ms or 1500.0
        elif cmd.op == "pan_zoom":
            cmd_dict["x"] = cmd.x or 0.0
            cmd_dict["y"] = cmd.y or 0.0
            cmd_dict["scale"] = cmd.scale or 1.0

        transformed_commands.append(
            {
                "triggerWord": tc.trigger_word,
                "command": cmd_dict,
            }
        )

    lesson_id = f"lesson-ai-{uuid.uuid4().hex[:8]}"

    return {
        "id": lesson_id,
        "title": llm_response.title,
        "description": llm_response.description,
        "speechScript": llm_response.speech_script,
        "audioUrl": tts_result["audio_url"],
        "durationMs": tts_result["duration_ms"],
        "timingMarks": tts_result["timing_marks"],
        "timedCommands": transformed_commands,
        "initialViewport": {"x": 50, "y": 40, "scale": 1.0},
    }
