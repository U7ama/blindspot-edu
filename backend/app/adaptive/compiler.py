"""Window coverage plus all-window gap verification. No embeddings or silent truncation."""
import json
import logging
import re
from pydantic import BaseModel, Field, ValidationError, model_validator
from .progress import report
from .contracts import Segment, Concept, Phase, Document, Remediation, Question
from backend.app.services.ai.llm import chat_completion

logger = logging.getLogger(__name__)

class InsufficientContent(ValueError):
    """Analysis completed, but no reliable lesson can be built from the speech."""


class GenerationValidationError(ValueError):
    def __init__(self, stage):
        self.stage = stage
        super().__init__(f'{stage} did not pass validation after one correction')


class CoverageItem(BaseModel):
    name: str
    explanation: str
    evidence_ids: list[str]
    possibly_missing: bool

class CoverageBatch(BaseModel):
    items: list[CoverageItem]
    teachable_evidence_ids: list[str] = Field(description='Exact segment IDs containing coherent explanations, worked examples or instructional steps. Empty for incidental mentions, task notes or sign-offs. Informal tutorials qualify.')

class CandidateList(BaseModel):
    concepts: list[Concept] = Field(max_length=8)

class WindowVerdict(BaseModel):
    explained: bool = False
    evidence_ids: list[str] = Field(default_factory=list)

    @model_validator(mode='before')
    @classmethod
    def normalize_evidence(cls, data):
        if isinstance(data, dict):
            if 'segment_ids' in data and not data.get('evidence_ids'):
                data['evidence_ids'] = data['segment_ids']
            if data.get('evidence_ids') is None:
                data['evidence_ids'] = []
            elif isinstance(data['evidence_ids'], str):
                data['evidence_ids'] = [data['evidence_ids']] if data['evidence_ids'] else []
            if 'explained' not in data:
                for k in ('is_explained', 'verdict', 'supported', 'is_explained_elsewhere'):
                    if k in data:
                        data['explained'] = data[k]
                        break
            if isinstance(data.get('explained'), str):
                val = data['explained'].lower().strip()
                data['explained'] = val in ('true', 'yes', '1', 'explained')
        return data

class Plan(BaseModel):
    phases: list[Phase] = Field(min_length=1, max_length=12)

class Verdict(BaseModel):
    supported: bool
    reason: str = ''

    @model_validator(mode='before')
    @classmethod
    def _coerce_fields(cls, data):
        if isinstance(data, dict):
            if 'supported' not in data:
                for k in ('is_supported', 'verdict', 'is_valid', 'valid', 'supported_by_excerpts'):
                    if k in data:
                        data['supported'] = data[k]
                        break
            if isinstance(data.get('supported'), str):
                val = data['supported'].lower().strip()
                data['supported'] = val in ('true', 'yes', '1', 'supported', 'correct')
            if 'reason' not in data:
                for k in ('explanation', 'feedback', 'details', 'justification'):
                    if k in data:
                        data['reason'] = data[k]
                        break
                if 'reason' not in data:
                    data['reason'] = ''
        return data


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


def call(prompt, data, shape, tokens=4096, validator=None):
    # Exactly two attempts total, including schema and relationship correction.
    request_data = data
    for attempt in range(2):
        result = None
        try:
            result = chat_completion(prompt + (' Repair the validation issues in the previous output. Return the full corrected JSON; do not invent new IDs.' if attempt else ''), json.dumps(request_data), response_model=shape, max_tokens=tokens)
            if validator:
                validator(result)
            return result
        except ValueError as exc:
            logger.warning('Validation error on %s attempt %d: %s', shape.__name__, attempt, exc)
            if attempt:
                raise GenerationValidationError(shape.__name__) from None
            if isinstance(exc, ValidationError):
                issues = [{'field': list(e['loc']), 'type': e['type']} for e in exc.errors(include_input=False, include_context=False, include_url=False)[:8]]
            else:
                # Validators below supply fixed instructions, never raw transcript values.
                issues = str(exc) if result is not None else 'Response must match the requested JSON schema and finish within its output limit.'
            request_data = {'original_input': data, 'previous_output': result.model_dump() if result else None, 'validation_issues': issues}


def normalize_evidence_ids(ids, allowed):
    """Repair only a malformed UUID prefix, never guess a segment or another UUID."""
    fixed = []
    for ref in ids:
        if ref in allowed:
            fixed.append(ref)
            continue
        match = re.fullmatch(r'([a-f0-9]{31}|[a-f0-9]{33}):s([0-9]+)', ref)
        choices = []
        if match:
            prefix, suffix = match.groups()
            for valid in allowed:
                target = re.fullmatch(r'([a-f0-9]{32}):s' + re.escape(suffix), valid)
                if not target:
                    continue
                shorter, longer = sorted((prefix, target.group(1)), key=len)
                if any(longer[:i] + longer[i+1:] == shorter for i in range(len(longer))):
                    choices.append(valid)
        if len(choices) != 1:
            raise ValueError('Evidence IDs must exactly reference the supplied transcript window. Never invent a segment ID.')
        fixed.append(choices[0])
    return fixed


def validate_coverage(batch, allowed):
    # Validate all fields before mutating, so correction sees the original bad output.
    teachable = normalize_evidence_ids(batch.teachable_evidence_ids, allowed)
    items = []
    for item in batch.items:
        if not item.evidence_ids:
            raise ValueError('Each coverage item must cite at least one supplied transcript segment.')
        items.append(normalize_evidence_ids(item.evidence_ids, allowed))
    batch.teachable_evidence_ids = teachable
    for item, ids in zip(batch.items, items):
        item.evidence_ids = ids


def validate_plan(plan, eligible_ids, segment_ids):
    phase_ids, checkpoints, question_ids = set(), set(), set()
    for phase in plan.phases:
        if not phase.id or phase.id in phase_ids:
            raise ValueError('Every phase needs a unique nonempty id.')
        phase_ids.add(phase.id)
        if not set(phase.evidence_ids) <= segment_ids:
            raise ValueError('Evidence IDs must come from the provided transcript segments.')
        for cid in phase.prerequisite_ids:
            if cid not in eligible_ids:
                raise ValueError('prerequisite_ids must use ONLY allowed_prerequisite_ids. Use [] when none apply. Never invent, rename, or attach explained/uncertain concepts.')
            if cid in checkpoints:
                raise ValueError('Each prerequisite may appear in only one checkpoint, with no duplicates.')
            checkpoints.add(cid)
        if phase.quiz:
            q = phase.quiz
            if not q.id or q.id in question_ids or q.phase_id != phase.id or q.purpose != 'phase' or not q.concept_id:
                raise ValueError('Each phase quiz needs a unique id, its exact enclosing phase_id, a concept_id, and purpose=phase.')
            question_ids.add(q.id)


def generate_plan(coverage, candidates, segments):
    eligible_ids = {c.id for c in candidates if c.coverage in ('under_explained', 'inferred_prerequisite')}
    eligible_concepts = [c.model_dump() for c in candidates if c.id in eligible_ids]
    payload = {'coverage': coverage, 'concepts': eligible_concepts, 'allowed_prerequisite_ids': sorted(eligible_ids), 'segments': [s.model_dump() for s in segments]}
    prompt = (
        'Reorganize the educational content into 3-4 coherent phases (at most 5); do not force an oversized syllabus. '
        'Keep each phase teaching script focused and concise (1-2 clear paragraphs, strictly under 150 words per phase). '
        'Use exact transcript evidence IDs (cite all relevant consecutive segment IDs that support the phase explanation, typically 5-20 segment IDs per phase). '
        'prerequisite_ids must be a subset of allowed_prerequisite_ids; use [] if no checkpoint applies. '
        'Never invent or rename prerequisite IDs, and attach each at most once. '
        'A lecture can be useful without any missing prerequisites. '
        'Include relevant phase quizzes with explicit phase_id, concept_id and purpose=phase. '
        'Teaching scripts and correct answers must be supported by the supplied excerpts. '
        'Supplementary prerequisite teaching is generated separately.'
    )
    return call(prompt, payload, Plan, tokens=8192, validator=lambda plan: validate_plan(plan, eligible_ids, {s.id for s in segments}))


def review_phase(phase, segmap):
    """One targeted rewrite, then independent review; never publish rejected claims."""
    prompt = 'Check whether the teaching script and quiz correct answer are supported by these exact lecture excerpts. Mere topic overlap is insufficient. Reject invented claims. Return supported false if uncertain.'
    for attempt in range(2):
        if not phase.evidence_ids or not set(phase.evidence_ids) <= set(segmap):
            raise ValueError('Phase references invalid evidence')
        cited = [segmap[i].model_dump() for i in phase.evidence_ids]
        verdict = call(prompt, {'phase': phase.model_dump(), 'excerpts': cited}, Verdict, 2048)
        if verdict.supported:
            return phase
        if attempt:
            raise GenerationValidationError('Lecture evidence review')
        original = phase
        def validate_repair(repaired):
            if repaired.id.replace('_', '-') == original.id.replace('_', '-'):
                repaired.id = original.id
            if sorted(repaired.prerequisite_ids) == sorted(original.prerequisite_ids):
                repaired.prerequisite_ids = original.prerequisite_ids
            if sorted(repaired.evidence_ids) == sorted(original.evidence_ids):
                repaired.evidence_ids = original.evidence_ids

            if repaired.id != original.id or repaired.prerequisite_ids != original.prerequisite_ids or repaired.evidence_ids != original.evidence_ids:
                raise ValueError(f'Preserve phase id, prerequisite_ids and evidence_ids exactly. Required: id="{original.id}", prerequisite_ids={json.dumps(original.prerequisite_ids)}, evidence_ids={json.dumps(original.evidence_ids)}. Only rewrite teaching and quiz content.')
            if (repaired.quiz is None) != (original.quiz is None):
                raise ValueError('Preserve whether the phase contains a quiz.')
            if repaired.quiz:
                repaired.quiz.phase_id = original.id
                repaired.quiz.purpose = 'phase'
                if not repaired.quiz.id:
                    repaired.quiz.id = original.quiz.id if original.quiz else f'q-{original.id}'
                if not repaired.quiz.concept_id:
                    repaired.quiz.concept_id = original.quiz.concept_id if original.quiz else original.id
            validate_plan(Plan(phases=[repaired]), set(original.prerequisite_ids), set(segmap))
        prompt_repair = (
            'Correct this phase using only the cited excerpts and the review feedback. '
            f'You MUST keep id="{original.id}", prerequisite_ids={json.dumps(original.prerequisite_ids)}, and evidence_ids={json.dumps(original.evidence_ids)} exactly unchanged. '
            'Remove unsupported claims or narrow them to what the excerpts actually explain. '
            'Rewrite the quiz if needed so its correct answer is supported by the excerpts. '
            'Do not add new evidence IDs, do not change the evidence list, and do not change any IDs or prerequisite associations.'
        )
        phase = call(prompt_repair, {'phase': original.model_dump(), 'excerpts': cited, 'review_feedback': verdict.reason}, Phase, 4096, validator=validate_repair)


def compile_document(segments: list[Segment]) -> Document:
    if not segments:
        raise InsufficientContent('No usable speech was identified in this recording.')
    chunks = list(windows(segments))
    coverage = []
    teachable_ids = set()
    for index, chunk in enumerate(chunks):
        report('concepts', 'Identifying concepts and explanations in the transcript.', index, len(chunks), 'sections')
        allowed = {s.id for s in chunk}
        result = call('Extract concepts actually explained and prerequisites mentioned but not explained (return at most 5-6 concepts per section, with 1-2 sentence explanations). Copy segment IDs exactly. Keep explanations concise. Do not invent missing topics. Mark teachable_evidence_ids only for coherent explanations, examples or instructional steps. Informal technical tutorials count; isolated developer task notes, incidental terms, status updates and sign-offs do not. Return empty items and teachable_evidence_ids if there is no educational content.', [s.model_dump() for s in chunk], CoverageBatch, validator=lambda batch: validate_coverage(batch, allowed))
        allowed = {s.id for s in chunk}
        if not set(result.teachable_evidence_ids) <= allowed:
            raise GenerationValidationError('Content evidence')
        teachable_ids.update(result.teachable_evidence_ids)
        for item in result.items:
            if not item.evidence_ids or not set(item.evidence_ids) <= allowed:
                raise ValueError('Coverage references invalid evidence')
        coverage.extend(i.model_dump() for i in result.items)
    if not teachable_ids:
        raise InsufficientContent('We could not identify enough educational content to build a reliable lesson. Try a lecture or tutorial that explains a concept or demonstrates a worked example.')
    report('concepts', 'Checking whether the recording supports a useful lesson.', len(chunks), len(chunks), 'sections')
    suitability = call('Do these excerpts contain enough coherent explanation, a worked example, or instructional steps to support at least one useful short lesson? Formal lecture style is NOT required. Incidental technical terms, task lists, status notes and sign-offs alone are insufficient. Judge the content, not recording length or presentation style.', {'segments': [s.model_dump() for s in segments if s.id in teachable_ids]}, Verdict, 2048)
    if not suitability.supported:
        raise InsufficientContent('We could not identify enough educational content to build a reliable lesson. Try a lecture or tutorial with a coherent explanation or worked example.')
    report('prerequisites', 'Identifying possible missing prerequisites across the whole lecture.')
    candidates = call('Reconcile this complete lecture coverage. Return up to 5 unique, meaningful prerequisite gaps. Use stable slug IDs, distinguish under_explained, inferred_prerequisite and uncertain. A concept explained somewhere is not missing. Copy evidence IDs. Leave remediation null. Do not expand recursively.', coverage, CandidateList).concepts
    all_ids = {s.id for s in segments}
    for candidate_index, c in enumerate(candidates):
        if not set(c.evidence_ids) <= all_ids:
            raise ValueError('Candidate references invalid evidence')
        supporting = []
        # Every candidate is checked against every window, including the ending.
        for chunk_index, chunk in enumerate(chunks):
            report('prerequisites', 'Checking whether prerequisites are explained elsewhere.', candidate_index * len(chunks) + chunk_index, len(candidates) * len(chunks), 'checks')
            allowed = {s.id for s in chunk}
            verdict = call('Does this window actually explain the named prerequisite, rather than just mention it? Return explained=true only with evidence_ids containing the exact segment IDs that explain it.', {'concept': c.name, 'segments': [s.model_dump() for s in chunk]}, WindowVerdict, 2048)
            valid = [i for i in verdict.evidence_ids if i in allowed]
            if verdict.explained and valid:
                supporting.extend(valid)
        if supporting:
            c.coverage = 'explained_elsewhere'
            c.explanation_evidence_ids = list(dict.fromkeys(supporting))
            c.reason = 'This prerequisite is explained elsewhere in the recording.'
    report('planning', 'Organizing the lecture into a learning sequence and creating questions.')
    plan = generate_plan(coverage, candidates, segments)
    segmap = {s.id: s for s in segments}
    attached = set()
    for phase_index, phase in enumerate(plan.phases):
        report('verification', 'Checking lesson claims against their original excerpts.', phase_index, len(plan.phases), 'phases')
        phase = review_phase(phase, segmap)
        plan.phases[phase_index] = phase
        cited = [segmap[i].model_dump() for i in phase.evidence_ids]
        for cid in phase.prerequisite_ids:
            if cid in attached:
                raise ValueError('A prerequisite was assigned to multiple checkpoints')
            attached.add(cid)
            c = next((c for c in candidates if c.id == cid), None)
            if c is None:
                raise ValueError('Unknown prerequisite')
            if c.coverage not in ('under_explained', 'inferred_prerequisite'):
                continue
            report('verification', 'Building and reviewing prerequisite explanations and reassessment questions.', phase_index, len(plan.phases), 'phases')
            remediation_prompt = 'Create supplementary prerequisite teaching: a short explanation, worked example, simpler explanation, optional visual step list, and THREE genuinely different questions: diagnostic, reassessment (application), retry (another application). Each question needs a unique ID, exact concept_id and phase_id, matching purpose, options, correct_index and feedback. Do not attribute this new explanation to the lecturer.'
            c.remediation = call(remediation_prompt, {'concept': c.model_dump(), 'phase_id': phase.id, 'excerpts': cited}, Remediation)
            checked = call('Review this supplementary mini-lesson for conceptual correctness, clear worked example, unambiguous correct answers and distinct questions. This is supplementary teaching, not a claim it appeared in the lecture.', c.remediation.model_dump(), Verdict, 2048)
            if not checked.supported:
                repair_prompt = 'Correct this supplementary prerequisite teaching based on the review feedback. Ensure clear conceptual explanation, accurate worked example, and 3 distinct, unambiguous questions with valid correct answers.'
                c.remediation = call(repair_prompt, {'concept': c.model_dump(), 'remediation': c.remediation.model_dump(), 'feedback': checked.reason}, Remediation)
                checked = call('Review this supplementary mini-lesson for conceptual correctness, clear worked example, unambiguous correct answers and distinct questions. This is supplementary teaching, not a claim it appeared in the lecture.', c.remediation.model_dump(), Verdict, 2048)
                if not checked.supported:
                    c.remediation = None
                    c.coverage = 'uncertain'
                    c.reason += ' Supplementary remediation could not be independently validated.'
    for c in candidates:
        if c.coverage in ('under_explained', 'inferred_prerequisite') and c.id not in attached:
            c.coverage = 'uncertain'
            c.reason += ' No validated teaching dependency was established.'
    return Document(segments=segments, concepts=candidates, phases=plan.phases)
