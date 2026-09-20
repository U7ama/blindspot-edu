"""
backend/ai/qa.py


Handles interactive student Q&A during a live teaching session.
Provides pedagogical, warm, and intuitive explanations grounded in the lecture context,
accompanied by structured visual step-flow cards, analogies, and key takeaways.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field

# Ensure project root is on sys.path
_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion
from backend.app.schemas.schemas import Phase, TranscriptSegment

logger = logging.getLogger(__name__)


class FlowStep(BaseModel):
    """An individual step in a conceptual or algorithmic workflow."""
    step_number: int = Field(description="Step number (1, 2, 3...)")
    title: str = Field(description="Short step title (e.g. '1. Initialize Window')")
    detail: str = Field(description="Clear, 1-sentence breakdown of what occurs at this step")


class QAResult(BaseModel):
    """Pedagogical structured response containing verbal explanation and visual learning aids."""
    explanation: str = Field(
        description="Warm, clear, and engaging verbal response spoken aloud by the voice tutor (2-4 sentences). Do NOT include markdown code blocks or bullet lists."
    )
    key_takeaway: Optional[str] = Field(
        default=None,
        description="A punchy 1-sentence core principle or rule of thumb."
    )
    analogy: Optional[str] = Field(
        default=None,
        description="A memorable real-world analogy if it clarifies the concept (e.g., 'Like opening a dictionary at the midpoint')."
    )
    flow_steps: Optional[List[FlowStep]] = Field(
        default=None,
        description="Optional sequence of 2 to 4 clear logical steps when answering a process, algorithm, or workflow question."
    )
    visual_intent: Optional[bool] = Field(
        default=False,
        description="True if the student explicitly asks to be taught visually/on the whiteboard, or if drawing visual diagrams provides superior pedagogical intuition."
    )
    whiteboard_topic: Optional[str] = Field(
        default=None,
        description="Short conceptual title for the visual diagram illustrated on the whiteboard."
    )


_QA_SYSTEM_PROMPT = """\
You are Blindspot Edu, an empathetic, highly knowledgeable, and engaging voice teaching tutor.
A student is learning from a lecture and has asked you a question.

Your goal is to provide:
1. A warm, comprehensive, and friendly verbal explanation (2-4 sentences) that will be read aloud.
2. A memorable real-world analogy if applicable.
3. A punchy 1-sentence key takeaway.
4. If the question is about an algorithm, workflow, mechanism, or process: provide a structured sequence of 2-4 visual flow steps.
5. If the student asks to be taught visually (e.g., "teach me visually", "draw this", "show on whiteboard") or if the concept is highly visual (curves, diagrams, flows), set "visual_intent": true and provide "whiteboard_topic".

Output Format:
You MUST respond with valid JSON matching this schema:
{
  "explanation": "Natural, spoken explanation directly answering the question (2-4 sentences).",
  "key_takeaway": "The essential 1-sentence takeaway.",
  "analogy": "Memorable intuitive real-world analogy.",
  "flow_steps": [
    { "step_number": 1, "title": "Initialize State", "detail": "Set up initial boundaries or starting conditions." },
    { "step_number": 2, "title": "Evaluate & Branch", "detail": "Test condition and decide next action." },
    { "step_number": 3, "title": "Terminate or Loop", "detail": "Return final result or repeat for next interval." }
  ],
  "visual_intent": false,
  "whiteboard_topic": "Market Clearing Mechanism"
}
"""


def answer_phase_question(
    question: str,
    current_phase: Optional[Phase] = None,
    transcript_segments: Optional[List[TranscriptSegment]] = None,
) -> QAResult:
    """Generates a pedagogical answer with visual flow steps and key takeaways."""
    clean_question = (question or "").strip()
    if not clean_question:
        return QAResult(
            explanation="Feel free to ask any question about this phase of the lecture!",
            key_takeaway="Active inquiry is the fastest way to master complex topics.",
        )

    # Build context from current phase and relevant transcript slices
    context_sections: List[str] = []

    if current_phase:
        context_sections.append(f"Current Lesson Phase: {current_phase.title}")
        context_sections.append(f"Teaching Content:\n{current_phase.teaching_script}")
        if current_phase.prerequisite_note:
            context_sections.append(f"Prerequisites: {current_phase.prerequisite_note}")

    if transcript_segments and current_phase and current_phase.source_timestamps:
        relevant_chunks: List[str] = []
        for ts_range in current_phase.source_timestamps:
            for seg in transcript_segments:
                if seg.start >= (ts_range.start - 10) and seg.end <= (ts_range.end + 10):
                    relevant_chunks.append(seg.text)
        if relevant_chunks:
            context_sections.append(f"Relevant Lecture Excerpt:\n{' '.join(relevant_chunks[:6])}")

    context_str = "\n\n".join(context_sections)

    user_prompt = f"""\
Context from the Lecture:
{context_str}

Student Question:
"{clean_question}"

Please provide a clear, comprehensive explanation answering the student's question, including a key takeaway, an analogy if applicable, and step-by-step flow steps if it involves a process or algorithm.
"""

    try:
        response = chat_completion(
            system_prompt=_QA_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=1024,
            response_model=QAResult,
        )
        if isinstance(response, QAResult):
            return response
    except Exception as e:
        logger.warning("LLM call in qa.py encountered an issue: %s", e)

    # Fallback explanation if LLM fails or is offline
    if current_phase:
        fallback_text = (
            f"In this part of the lecture on {current_phase.title}, the key idea is that "
            f"{current_phase.teaching_script.rstrip('.')}. When thinking about your question, "
            f"remember that this principle connects directly to the core mechanisms we are studying."
        )
    else:
        fallback_text = "Let's explore that topic! In this lecture, we focus on understanding how these concepts connect together step by step."

    return QAResult(
        explanation=fallback_text,
        key_takeaway=f"Focus on the underlying principle of {current_phase.title if current_phase else 'this concept'}.",
    )
