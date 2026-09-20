"""
backend/ai/graph.py


Knowledge graph construction for Blindspot Edu. Takes the learning plan's
phases (fully-covered concepts) and gap concepts, builds a NetworkX directed
graph, uses the LLM to extract meaningful relationships between concepts,
and outputs the result as lists of GraphNode and GraphEdge objects per
backend/schemas.py.

The graph serves two purposes:
    1. Visualization — the frontend renders it with react-force-graph so
       students can see how concepts connect and where the gaps are.
    2. Exploration — gap nodes (is_gap=True) highlight "blind spots" the
       student should investigate further.

Uses NetworkX internally for graph manipulation, but the public API only
exposes schemas.py shapes — nothing outside this file touches NetworkX
directly.

Requires: networkx, pydantic >= 2
    pip install networkx pydantic
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Optional

import networkx as nx
from pydantic import BaseModel, Field

# Ensure project root is on sys.path for direct-run and package imports.
_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.llm import chat_completion
from backend.app.schemas.schemas import (
    GapConcept,
    GraphEdge,
    GraphNode,
    LearningPlan,
    TimeRange,
    TranscriptSegment,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(text: str) -> str:
    """Converts a concept name into a stable, URL-safe node ID.

    Examples:
        "Binary Search Trees" -> "binary-search-trees"
        "Big-O Notation"     -> "big-o-notation"
        "recursion (advanced)" -> "recursion-advanced"
    """
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)  # remove punctuation
    text = re.sub(r"[\s_]+", "-", text)   # spaces/underscores -> hyphens
    text = re.sub(r"-+", "-", text)       # collapse multiple hyphens
    text = text.strip("-")
    return text


# ---------------------------------------------------------------------------
# Internal LLM response model for relation extraction
# ---------------------------------------------------------------------------

class _LLMRelation(BaseModel):
    source: str = Field(..., description="Source concept name")
    target: str = Field(..., description="Target concept name")
    relation: str = Field(
        ...,
        description="One of: prerequisite_of, related_to, example_of, "
                    "depends_on, part_of",
    )


class _LLMRelationResponse(BaseModel):
    relations: list[_LLMRelation]


# ---------------------------------------------------------------------------
# Relation extraction via LLM
# ---------------------------------------------------------------------------

_RELATION_SYSTEM_PROMPT = """\
You are a knowledge graph expert. Given a list of concepts from a lecture
(including both well-explained topics and under-explained gaps), identify
the meaningful relationships between them.

Relationship types (use exactly one of these):
- prerequisite_of  — concept A must be understood before concept B
- related_to       — concepts are connected but neither is a prerequisite
- example_of       — concept A is a specific instance or example of concept B
- depends_on       — concept A builds on or requires concept B
- part_of          — concept A is a component or sub-topic of concept B

Rules:
- Only include relationships that are genuinely meaningful, not trivial.
- A concept can have multiple relationships.
- Include relationships between gap concepts and covered concepts — this
  is especially valuable for the student.
- Use the exact concept names as provided.

Respond with a JSON object:
{
  "relations": [
    {
      "source": "concept A name",
      "target": "concept B name",
      "relation": "prerequisite_of"
    }
  ]
}

If there are no meaningful relationships, return {"relations": []}.
"""


def _extract_relations(
    concept_names: list[str],
    transcript_context: str,
) -> list[_LLMRelation]:
    """Uses the LLM to identify relationships between concepts.

    Args:
        concept_names: All concept names (covered + gaps).
        transcript_context: Abbreviated transcript for context.

    Returns:
        List of relations parsed from the LLM response.
    """
    if len(concept_names) < 2:
        return []

    concepts_list = "\n".join(f"- {name}" for name in concept_names)

    user_prompt = (
        f"Below are the concepts from a lecture and a brief context about "
        f"the lecture content. Identify the meaningful relationships between "
        f"these concepts.\n\n"
        f"CONCEPTS:\n{concepts_list}\n\n"
        f"LECTURE CONTEXT (abbreviated):\n{transcript_context[:3000]}"
    )

    try:
        response = chat_completion(
            system_prompt=_RELATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=2048,
            response_model=_LLMRelationResponse,
        )
        return response.relations
    except ValueError:
        # If the LLM response can't be parsed, return empty — graph still
        # works without edges, just less connected.
        return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_graph(
    gaps: list[GapConcept],
    plan: LearningPlan,
    transcript: list[TranscriptSegment],
    lecture_id: int = 0,
) -> tuple[list[GraphNode], list[GraphEdge]]:
    """Builds a knowledge graph from the learning plan and detected gaps.

    The graph contains:
    - One node per phase concept (is_gap=False) — topics the lecture covers.
    - One node per gap concept (is_gap=True) — topics the lecture mentions
      but doesn't adequately explain.
    - Directed edges representing relationships between concepts
      (prerequisite_of, related_to, example_of, depends_on, part_of).

    Args:
        gaps: Gap concepts detected by planning.detect_gaps().
        plan: The learning plan from planning.generate_plan().
        transcript: The original transcript (used as LLM context for
            relation extraction).
        lecture_id: The lecture this graph belongs to.

    Returns:
        A tuple of (nodes, edges), both in schemas.py shapes.
    """
    graph = nx.DiGraph()

    # -----------------------------------------------------------------------
    # Add nodes for covered concepts (one per phase)
    # -----------------------------------------------------------------------
    covered_concepts: dict[str, TimeRange | None] = {}
    for phase in plan.phases:
        node_id = _slugify(phase.title)
        covered_concepts[node_id] = (
            phase.source_timestamps[0] if phase.source_timestamps else None
        )
        graph.add_node(
            node_id,
            label=phase.title,
            is_gap=False,
            source_timestamp=covered_concepts[node_id],
        )

    # -----------------------------------------------------------------------
    # Add nodes for gap concepts
    # -----------------------------------------------------------------------
    gap_concepts: dict[str, TimeRange | None] = {}
    for gap in gaps:
        node_id = _slugify(gap.name)
        # Avoid collisions with covered concepts (unlikely but possible)
        if node_id in graph.nodes:
            node_id = f"{node_id}-gap"
        gap_concepts[node_id] = gap.source_timestamp
        graph.add_node(
            node_id,
            label=gap.name,
            is_gap=True,
            source_timestamp=gap.source_timestamp,
        )

    # -----------------------------------------------------------------------
    # Extract relations via LLM and add edges
    # -----------------------------------------------------------------------
    all_names = list(covered_concepts.keys()) + list(gap_concepts.keys())

    # Build abbreviated transcript context (first ~50 segments to stay
    # within LLM token limits while giving enough context)
    transcript_context = "\n".join(
        f"[{s.start:.1f}s] {s.text}" for s in transcript[:50]
    )

    relations = _extract_relations(all_names, transcript_context)

    # Build a name -> node_id lookup (LLM returns concept names, we use slugs)
    name_to_id: dict[str, str] = {}
    for nid in graph.nodes:
        label = graph.nodes[nid].get("label", "")
        name_to_id[label.lower()] = nid
        name_to_id[nid] = nid

    for rel in relations:
        source_id = name_to_id.get(rel.source.lower()) or name_to_id.get(_slugify(rel.source))
        target_id = name_to_id.get(rel.target.lower()) or name_to_id.get(_slugify(rel.target))

        if source_id and target_id and source_id in graph.nodes and target_id in graph.nodes:
            graph.add_edge(source_id, target_id, relation=rel.relation)

    # -----------------------------------------------------------------------
    # Add implicit prerequisite edges from the plan's phase ordering
    # (consecutive phases often have a prerequisite relationship that the
    # LLM might miss)
    # -----------------------------------------------------------------------
    phase_ids = [_slugify(p.title) for p in plan.phases]
    for i in range(len(phase_ids) - 1):
        src, tgt = phase_ids[i], phase_ids[i + 1]
        if src in graph.nodes and tgt in graph.nodes:
            if not graph.has_edge(src, tgt):
                graph.add_edge(src, tgt, relation="prerequisite_of")

    # -----------------------------------------------------------------------
    # Convert NetworkX graph to schemas.py shapes
    # -----------------------------------------------------------------------
    # Node IDs are namespaced with the lecture_id at output time so the
    # string PK in graph_nodes stays globally unique across lectures.
    nodes: list[GraphNode] = []
    for node_id, attrs in graph.nodes(data=True):
        ts = attrs.get("source_timestamp")
        nodes.append(
            GraphNode(
                id=f"{lecture_id}:{node_id}",
                lecture_id=lecture_id,
                label=attrs.get("label", node_id),
                is_gap=attrs.get("is_gap", False),
                source_timestamp=ts if isinstance(ts, TimeRange) else None,
            )
        )

    edges: list[GraphEdge] = []
    for src, tgt, attrs in graph.edges(data=True):
        edges.append(
            GraphEdge(
                lecture_id=lecture_id,
                source=f"{lecture_id}:{src}",
                target=f"{lecture_id}:{tgt}",
                relation=attrs.get("relation", "related_to"),
            )
        )

    return nodes, edges
