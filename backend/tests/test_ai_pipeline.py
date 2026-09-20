"""
backend/ai/test_ai_pipeline.py


End-to-end test for the complete AI/Planning offline pipeline. Runs the
full chain: transcribe → plan → gaps → quizzes → embeddings → graph,
all in memory with no database required.

This is the script to run to prove "the pipeline actually works" before
wiring anything into the API layer or background jobs.

Usage (from repo root):
    python -m backend.ai.test_ai_pipeline <path_to_audio_or_video>

    # Or directly:
    python backend/ai/test_ai_pipeline.py <path_to_audio_or_video>

Environment variables:
    LLM_API_KEY   — Required. API key for the LLM provider (Groq, etc.)
    LLM_BASE_URL  — Optional. Defaults to Groq's endpoint.
    LLM_MODEL     — Optional. Defaults to llama-3.3-70b-versatile.

Requires: faster-whisper, ffmpeg, openai, sentence-transformers, networkx
    pip install faster-whisper openai sentence-transformers networkx
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Ensure the project root is on sys.path for both invocation styles.
_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.app.services.ai.transcription import transcribe
from backend.app.services.ai.planning import run_full_pipeline


def _print_divider(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def _print_phase_summary(result) -> None:
    """Prints a readable summary of the first 3 phases."""
    plan = result.plan
    show_count = min(3, len(plan.phases))

    print(f"\n  Total phases: {len(plan.phases)}")
    print(f"  Showing first {show_count}:\n")

    for phase in plan.phases[:show_count]:
        print(f"  Phase {phase.order}: {phase.title}")
        print(f"    Difficulty: {phase.difficulty or 'N/A'}")
        print(f"    Prerequisites: {phase.prerequisite_note or 'None'}")
        timestamps = ", ".join(
            f"{t.start:.1f}s-{t.end:.1f}s" for t in phase.source_timestamps
        )
        print(f"    Source timestamps: {timestamps or 'None'}")
        # Truncate teaching script for readability
        script_preview = phase.teaching_script[:150]
        if len(phase.teaching_script) > 150:
            script_preview += "..."
        print(f"    Teaching script: {script_preview}")
        print()


def _print_gaps_summary(result) -> None:
    """Prints detected gap concepts."""
    print(f"\n  Total gaps detected: {len(result.gaps)}\n")

    for gap in result.gaps[:5]:
        print(f"  - {gap.name}")
        print(f"    Why it's a gap: {gap.why_its_a_gap}")
        if gap.related_phase_order is not None:
            print(f"    Related to phase: {gap.related_phase_order}")
        if gap.source_timestamp:
            print(
                f"    First mentioned at: "
                f"{gap.source_timestamp.start:.1f}s-{gap.source_timestamp.end:.1f}s"
            )
        print()

    if len(result.gaps) > 5:
        print(f"  ... and {len(result.gaps) - 5} more gaps\n")


def _print_quiz_summary(result) -> None:
    """Prints sample quiz questions."""
    print(f"\n  Total quiz questions: {len(result.quizzes)}\n")

    for q in result.quizzes[:3]:
        print(f"  Q: {q.question}")
        for i, option in enumerate(q.options, 1):
            marker = " *" if option == q.correct_answer else ""
            print(f"    {i}. {option}{marker}")
        if q.source_timestamp:
            print(
                f"    Verifiable at: "
                f"{q.source_timestamp.start:.1f}s-{q.source_timestamp.end:.1f}s"
            )
        print()

    if len(result.quizzes) > 3:
        print(f"  ... and {len(result.quizzes) - 3} more questions\n")


def _print_graph_summary(result) -> None:
    """Prints knowledge graph statistics."""
    gap_nodes = sum(1 for n in result.graph_nodes if n.is_gap)
    covered_nodes = len(result.graph_nodes) - gap_nodes

    print(f"\n  Total nodes: {len(result.graph_nodes)}")
    print(f"    Covered concepts: {covered_nodes}")
    print(f"    Gap concepts:    {gap_nodes}")
    print(f"  Total edges: {len(result.graph_edges)}")

    # Show a few edge examples
    for edge in result.graph_edges[:5]:
        print(f"    {edge.source} --[{edge.relation}]--> {edge.target}")

    if len(result.graph_edges) > 5:
        print(f"    ... and {len(result.graph_edges) - 5} more edges")
    print()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m backend.ai.test_ai_pipeline <path_to_audio_or_video>")
        sys.exit(1)

    file_path = sys.argv[1]
    source = Path(file_path)

    if not source.exists():
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)
    if not source.is_file():
        print(f"Error: Not a file: {file_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Input file: {file_path}")
    print(f"File size: {source.stat().st_size / (1024*1024):.1f} MB")

    # ------------------------------------------------------------------
    # Step 1: Transcription (uses the faster-whisper pipeline)
    # ------------------------------------------------------------------
    _print_divider("STEP 1: Transcription")
    print("  Transcribing audio... (this can take a minute or two)")
    t0 = time.time()

    segments = transcribe(str(source.resolve()), lecture_id=1)

    elapsed = time.time() - t0
    print(f"  Done in {elapsed:.1f}s — {len(segments)} segments extracted")
    print(f"\n  First 5 segments:")
    for seg in segments[:5]:
        print(f"    [{seg.start:6.1f}s -> {seg.end:6.1f}s]  {seg.text[:80]}")

    # ------------------------------------------------------------------
    # Step 2-6: Full AI/Planning pipeline
    # ------------------------------------------------------------------
    _print_divider("STEPS 2-6: AI Planning Pipeline")
    t1 = time.time()

    result = run_full_pipeline(segments, lecture_id=1)

    pipeline_elapsed = time.time() - t1
    total_elapsed = time.time() - t0

    # ------------------------------------------------------------------
    # Summary report
    # ------------------------------------------------------------------
    _print_divider("LEARNING PLAN")
    _print_phase_summary(result)

    _print_divider("GAP CONCEPTS (Blind Spots)")
    _print_gaps_summary(result)

    _print_divider("QUIZ BANK")
    _print_quiz_summary(result)

    _print_divider("KNOWLEDGE GRAPH")
    _print_graph_summary(result)

    # ------------------------------------------------------------------
    # Embedding stats
    # ------------------------------------------------------------------
    _print_divider("EMBEDDINGS")
    embedded_count = sum(
        1 for s in result.transcript_with_embeddings if s.embedding is not None
    )
    dims = (
        len(result.transcript_with_embeddings[0].embedding)
        if result.transcript_with_embeddings and result.transcript_with_embeddings[0].embedding
        else 0
    )
    print(f"  Segments with embeddings: {embedded_count}/{len(result.transcript_with_embeddings)}")
    print(f"  Embedding dimensions: {dims}")

    # ------------------------------------------------------------------
    # Final timing
    # ------------------------------------------------------------------
    _print_divider("TIMING")
    print(f"  Transcription:  {elapsed:.1f}s")
    print(f"  AI pipeline:    {pipeline_elapsed:.1f}s")
    print(f"  Total:          {total_elapsed:.1f}s")

    print(f"\n{'='*60}")
    print(f"  Pipeline complete. All output is in-memory (no DB writes).")
    print(f"{'='*60}\n")
