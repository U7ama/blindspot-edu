"""
backend/ai/whiteboard/syllabus_planner.py

Fast Tier-1 Course Syllabus Planner for Multi-Stage Whiteboard Lectures.
Outlines a 3 to 4 stage progressive curriculum (Intuition -> Mechanism -> Deep Dive/Math -> Summary/Practice)
and sets up spatial coordinate zones on the infinite canvas.
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path
from typing import Any, List, Optional
from pydantic import BaseModel, Field, model_validator

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion


class LLMStagePlan(BaseModel):
    stage_index: int = Field(default=1, description="1-based stage sequence number (1, 2, 3, etc.)")
    title: str = Field(default="Key Stage", description="Engaging stage title")
    concept_goal: str = Field(default="Visual explanation", description="Core pedagogical takeaway and visual goal")

    @model_validator(mode="before")
    @classmethod
    def normalize_stage(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        stage_idx = (
            data.get("stage_index")
            or data.get("stage")
            or data.get("index")
            or data.get("id")
            or 1
        )
        try:
            stage_idx = int(stage_idx)
        except Exception:
            stage_idx = 1

        title = data.get("title") or data.get("name") or f"Stage {stage_idx}"
        
        goal = (
            data.get("concept_goal")
            or data.get("goal")
            or data.get("visual")
            or data.get("description")
            or ""
        )
        if not goal and "keyPoints" in data:
            kp = data["keyPoints"]
            goal = "; ".join(kp) if isinstance(kp, list) else str(kp)
        if not goal:
            goal = f"Visual step-by-step breakdown of {title}"

        return {
            "stage_index": stage_idx,
            "title": title,
            "concept_goal": goal,
        }


class LLMCoursePlanResponse(BaseModel):
    title: str = Field(default="Interactive Masterclass", description="Overall Course / Masterclass Title")
    overview: str = Field(default="Comprehensive multi-stage whiteboard course.", description="Short overview")
    stages: List[LLMStagePlan] = Field(
        default_factory=list,
        description="List of 3 to 4 sequential pedagogical stages building on each other"
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_course(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        title = (
            data.get("title")
            or data.get("topic")
            or data.get("course_title")
            or data.get("name")
            or "Interactive Masterclass"
        )

        overview = (
            data.get("overview")
            or data.get("description")
            or data.get("summary")
            or f"Deep-dive multi-stage visual exploration of {title}."
        )

        raw_stages = (
            data.get("stages")
            or data.get("course_stages")
            or data.get("sections")
            or data.get("steps")
            or []
        )

        return {
            "title": title,
            "overview": overview,
            "stages": raw_stages,
        }


SYLLABUS_PLANNER_SYSTEM_PROMPT = """\
You are an elite Educational Curriculum Architect.
Given a topic, design a structured, engaging 3 to 4 stage visual whiteboard curriculum.

### PEDAGOGICAL STRUCTURE (3-4 Stages):
1. **Stage 1 (Intuition & Visual Baseline)**: The simplest high-level mental model and core visual layout.
2. **Stage 2 (Step-by-Step Mechanism / Deep Dive)**: Exploring the internal mechanics, arrows, and interactions.
3. **Stage 3 (Mathematical Formula, Calculation or Code/Logic)**: Concrete problem solving or algorithmic walk-through.
4. **Stage 4 (Edge Cases, Summary & Practice Challenge)**: Consolidating takeaways and testing understanding.

Respond ONLY with a JSON object in this exact schema:
{
  "title": "Data Structures & Algorithms: The Masterclass",
  "overview": "From intuition to pointer manipulation and Big-O efficiency.",
  "stages": [
    {
      "stage_index": 1,
      "title": "Intuition & Visual Memory Model",
      "concept_goal": "Contrasting contiguous array blocks vs connected node pointers"
    },
    {
      "stage_index": 2,
      "title": "Pointer Mechanics & Traversal",
      "concept_goal": "Step-by-step pointer reassignment during node insertion"
    },
    {
      "stage_index": 3,
      "title": "Time Complexity & Big-O Scaling",
      "concept_goal": "Comparing O(1) vs O(N) runtime scaling with visual graphs"
    }
  ]
}
"""


def plan_course_syllabus(
    topic: str,
    context: Optional[str] = None,
    desired_stages: int = 3,
) -> dict[str, Any]:
    """Generates a multi-stage course syllabus outline."""
    user_prompt = (
        f"TOPIC: {topic}\n"
        f"DESIRED NUMBER OF STAGES: {desired_stages}\n"
        f"ADDITIONAL CONTEXT: {context or 'None'}\n\n"
        f"Create a 3 to 4 stage progressive visual whiteboard curriculum."
    )

    llm_response: LLMCoursePlanResponse = chat_completion(
        system_prompt=SYLLABUS_PLANNER_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
        response_model=LLMCoursePlanResponse,
    )  # type: ignore

    course_id = f"course-{uuid.uuid4().hex[:8]}"

    stages_output = []
    for idx, stage in enumerate(llm_response.stages):
        stage_num = idx + 1
        # Calculate spatial coordinate offset on infinite canvas (each stage gets ~750px horizontal territory)
        spatial_x = (stage_num - 1) * 750.0

        stages_output.append(
            {
                "stageIndex": stage_num,
                "title": stage.title,
                "conceptGoal": stage.concept_goal,
                "spatialZone": {
                    "x": -spatial_x,
                    "y": 0.0,
                    "scale": 1.0,
                },
            }
        )

    return {
        "courseId": course_id,
        "topic": topic,
        "title": llm_response.title,
        "overview": llm_response.overview,
        "totalStages": len(stages_output),
        "stages": stages_output,
    }
