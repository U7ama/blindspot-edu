"""Window coverage plus all-window gap verification. No embeddings or silent truncation."""
import json
from pydantic import BaseModel, Field
from .contracts import Segment, Concept, Phase, Document, Remediation, Question
from backend.app.services.ai.llm import chat_completion

class CoverageItem(BaseModel):
    name: str
    explanation: str
    evidence_ids: list[str]
    possibly_missing: bool

class CoverageBatch(BaseModel):
    items: list[CoverageItem]

class CandidateList(BaseModel):
    concepts: list[Concept] = Field(max_length=8)

class WindowVerdict(BaseModel):
    explained: bool
    evidence_ids: list[str] = Field(default_factory=list)

class Plan(BaseModel):
    phases: list[Phase] = Field(min_length=1, max_length=12)

class Verdict(BaseModel):
    supported: bool
    reason: str


def windows(segments, limit=10000):
    chunk, length = [], 0
    for seg in segments:
        if len(seg.text) > limit:
            raise ValueError('Transcript segment exceeds the analysis window; split at transcription boundaries')
        size = len(seg.model_dump_json())
        if chunk and length + size > limit:
            yield chunk
            chunk, length = [], 0
        chunk.append(seg)
        length += size
    if chunk:
        yield chunk


def call(prompt, data, shape, tokens=4096):
    # One repair for invalid structured responses, bounded by the global budget.
    for attempt in range(2):
        try:
            return chat_completion(prompt + (' Correct your JSON schema and associations.' if attempt else ''), json.dumps(data), response_model=shape, max_tokens=tokens)
        except ValueError:
            if attempt:
                raise


def compile_document(segments: list[Segment]) -> Document:
    if not segments:
        raise ValueError('The recording contains no usable speech')
    chunks = list(windows(segments))
    coverage = []
    for chunk in chunks:
        result = call('Extract the concepts actually explained and prerequisites mentioned but not explained in this transcript window. Copy evidence segment IDs exactly. Keep explanations concise. Do not invent missing topics.', [s.model_dump() for s in chunk], CoverageBatch)
        allowed = {s.id for s in chunk}
        for item in result.items:
            if not item.evidence_ids or not set(item.evidence_ids) <= allowed:
                raise ValueError('Coverage references invalid evidence')
        coverage.extend(i.model_dump() for i in result.items)
    candidates = call('Reconcile this complete lecture coverage. Return up to 5 unique, meaningful prerequisite gaps. Use stable slug IDs, distinguish under_explained, inferred_prerequisite and uncertain. A concept explained somewhere is not missing. Copy evidence IDs. Leave remediation null. Do not expand recursively.', coverage, CandidateList).concepts
    all_ids = {s.id for s in segments}
    for c in candidates:
        if not set(c.evidence_ids) <= all_ids:
            raise ValueError('Candidate references invalid evidence')
        supporting = []
        # Every candidate is checked against every window, including the ending.
        for chunk in chunks:
            verdict = call('Does this window actually explain the named prerequisite, rather than just mention it? Return explained=true only with segment IDs that contain the explanation.', {'concept': c.name, 'segments': [s.model_dump() for s in chunk]}, WindowVerdict, 512)
            if not set(verdict.evidence_ids) <= {s.id for s in chunk}:
                raise ValueError('Gap verifier invented evidence')
            if verdict.explained:
                if not verdict.evidence_ids:
                    raise ValueError('Explained verdict lacks evidence')
                supporting.extend(verdict.evidence_ids)
        if supporting:
            c.coverage = 'explained_elsewhere'
            c.explanation_evidence_ids = list(dict.fromkeys(supporting))
            c.reason = 'This prerequisite is explained elsewhere in the recording.'
    plan = call('Reorganize this lecture pedagogically into 2-8 phases with stable slug IDs and exact evidence segment IDs. Put prerequisite checkpoints before dependent phases, referencing candidate IDs. Each prerequisite belongs to only one phase. Include a distinct phase quiz with explicit phase_id, concept_id, purpose=phase and stable ID. Do not attach explained_elsewhere or uncertain concepts as mandatory checkpoints. Teaching scripts must be supported by lecture evidence; supplementary remediation is generated separately.', {'coverage': coverage, 'concepts': [c.model_dump() for c in candidates]}, Plan)
    segmap = {s.id: s for s in segments}
    attached = set()
    for phase in plan.phases:
        if not phase.evidence_ids or not set(phase.evidence_ids) <= all_ids:
            raise ValueError('Phase references invalid evidence')
        cited = [segmap[i].model_dump() for i in phase.evidence_ids]
        verdict = call('Check whether the teaching script and quiz correct answer are supported by these exact lecture excerpts. Mere topic overlap is insufficient. Reject invented claims. Return supported false if uncertain.', {'phase': phase.model_dump(), 'excerpts': cited}, Verdict, 512)
        if not verdict.supported:
            raise ValueError('A teaching phase failed evidence verification')
        for cid in phase.prerequisite_ids:
            if cid in attached:
                raise ValueError('A prerequisite was assigned to multiple checkpoints')
            attached.add(cid)
            c = next((c for c in candidates if c.id == cid), None)
            if c is None:
                raise ValueError('Unknown prerequisite')
            if c.coverage not in ('under_explained', 'inferred_prerequisite'):
                continue
            c.remediation = call('Create supplementary prerequisite teaching: a short explanation, worked example, simpler explanation, optional visual step list, and THREE genuinely different questions: diagnostic, reassessment (application), retry (another application). Each question needs a unique ID, exact concept_id and phase_id, matching purpose, options, correct_index and feedback. Do not attribute this new explanation to the lecturer.', {'concept': c.model_dump(), 'phase_id': phase.id, 'excerpts': cited}, Remediation)
            checked = call('Review this supplementary mini-lesson for conceptual correctness, clear worked example, unambiguous correct answers and distinct questions. This is supplementary teaching, not a claim it appeared in the lecture.', c.remediation.model_dump(), Verdict, 512)
            if not checked.supported:
                raise ValueError('Supplementary teaching failed review')
    for c in candidates:
        if c.coverage in ('under_explained', 'inferred_prerequisite') and c.id not in attached:
            c.coverage = 'uncertain'
            c.reason += ' No validated teaching dependency was established.'
    return Document(segments=segments, concepts=candidates, phases=plan.phases)
