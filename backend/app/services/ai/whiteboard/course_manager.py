"""
backend/ai/whiteboard/course_manager.py

Pipelined Course Cache & Asynchronous Stage Pre-fetcher for Multi-Stage Whiteboard Lectures.
Generates Stage 1 synchronously for instant zero-latency return, while asynchronously pre-generating
subsequent stages in the background so the user can transition with 0ms delay.
"""

from __future__ import annotations

import asyncio
import logging
import sys
import threading
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Optional

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.whiteboard.syllabus_planner import plan_course_syllabus
from backend.app.services.ai.whiteboard.stage_generator import generate_course_stage

logger = logging.getLogger(__name__)

# In-memory course storage: courseId -> CourseData
_COURSE_CACHE: Dict[str, Dict[str, Any]] = {}
_STAGE_LOCKS: Dict[str, threading.Lock] = defaultdict(threading.Lock)


def _background_prefetch_stages(
    course_id: str,
    topic: str,
    course_title: str,
    stages_outline: list[dict[str, Any]],
    voice: Optional[str] = None,
):
    """Background worker that sequentially synthesizes stages 2, 3, etc."""
    logger.info(f"Starting background prefetch for course {course_id} ({len(stages_outline)} stages)")

    accumulated_summary = f"Stage 1 completed."

    for stage_outline in stages_outline:
        stage_idx = stage_outline.get("stageIndex", 1)
        if stage_idx == 1:
            continue  # Stage 1 is already generated

        course_data = _COURSE_CACHE.get(course_id)
        if not course_data:
            break

        if stage_idx in course_data["stages"]:
            continue

        lock_key = f"{course_id}_{stage_idx}"
        with _STAGE_LOCKS[lock_key]:
            if stage_idx in course_data["stages"]:
                continue

            try:
                logger.info(f"Background prefetching Stage {stage_idx} for course {course_id}...")
                stage_beat = generate_course_stage(
                    topic=topic,
                    course_title=course_title,
                    stage_outline=stage_outline,
                    previous_stages_summary=accumulated_summary,
                    voice=voice,
                )

                if course_id in _COURSE_CACHE:
                    _COURSE_CACHE[course_id]["stages"][stage_idx] = stage_beat

                accumulated_summary += f" Stage {stage_idx} ({stage_outline.get('title')}) completed."
                logger.info(f"Stage {stage_idx} successfully pre-generated for course {course_id}!")

            except Exception as e:
                logger.error(f"Failed to prefetch stage {stage_idx} for course {course_id}: {e}", exc_info=True)


def start_course(
    topic: str,
    voice: Optional[str] = None,
    context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Initiates a multi-stage course:
    1. Plans syllabus (3-4 stages).
    2. Synthesizes Stage 1 immediately.
    3. Launches background prefetch thread for remaining stages.
    4. Returns Stage 1 + Syllabus with sub-4s latency.
    """
    syllabus = plan_course_syllabus(topic=topic, context=context)
    course_id = syllabus["courseId"]
    stages = syllabus["stages"]

    # 1. Synthesize Stage 1 immediately
    stage_1_outline = stages[0] if stages else {"stageIndex": 1, "title": "Introduction", "conceptGoal": topic}
    stage_1_beat = generate_course_stage(
        topic=topic,
        course_title=syllabus["title"],
        stage_outline=stage_1_outline,
        previous_stages_summary="Initial start",
        voice=voice,
    )

    # 2. Store in cache
    _COURSE_CACHE[course_id] = {
        "syllabus": syllabus,
        "stages": {1: stage_1_beat},
        "topic": topic,
        "voice": voice,
    }

    # 3. Spawn background prefetch thread for stages 2, 3, etc.
    if len(stages) > 1:
        thread = threading.Thread(
            target=_background_prefetch_stages,
            args=(course_id, topic, syllabus["title"], stages, voice),
            daemon=True,
        )
        thread.start()

    return {
        "syllabus": syllabus,
        "stage1": stage_1_beat,
    }


def get_course_stage(course_id: str, stage_idx: int) -> Optional[Dict[str, Any]]:
    """Retrieves a stage from cache or generates it on-demand if not ready yet."""
    course_data = _COURSE_CACHE.get(course_id)
    if not course_data:
        return None

    # If already cached
    if stage_idx in course_data["stages"]:
        return course_data["stages"][stage_idx]

    lock_key = f"{course_id}_{stage_idx}"
    with _STAGE_LOCKS[lock_key]:
        if stage_idx in course_data["stages"]:
            return course_data["stages"][stage_idx]

        syllabus = course_data["syllabus"]
        stages_outline = syllabus.get("stages", [])
        matching_outline = next((s for s in stages_outline if s.get("stageIndex") == stage_idx), None)

        if not matching_outline:
            return None

        logger.info(f"On-demand synthesizing Stage {stage_idx} for course {course_id}...")
        stage_beat = generate_course_stage(
            topic=course_data["topic"],
            course_title=syllabus["title"],
            stage_outline=matching_outline,
            previous_stages_summary=f"Up to stage {stage_idx - 1}",
            voice=course_data.get("voice"),
        )

        course_data["stages"][stage_idx] = stage_beat
        return stage_beat


def get_course_status(course_id: str) -> Dict[str, Any]:
    """Returns available stages status for a course."""
    course_data = _COURSE_CACHE.get(course_id)
    if not course_data:
        return {"found": False}

    syllabus = course_data["syllabus"]
    ready_stages = list(course_data["stages"].keys())
    return {
        "found": True,
        "courseId": course_id,
        "title": syllabus["title"],
        "totalStages": syllabus["totalStages"],
        "readyStages": ready_stages,
        "isFullyReady": len(ready_stages) >= syllabus["totalStages"],
    }
