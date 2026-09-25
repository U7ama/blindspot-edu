"""Pure learning transitions; persistence and authorization are handled by the API."""
from .contracts import Document

class TransitionError(ValueError):
    pass

def questions(doc):
    result = {}
    for p in doc.phases:
        if p.quiz:
            result[p.quiz.id] = p.quiz
    for c in doc.concepts:
        if c.remediation:
            for q in (c.remediation.diagnostic, c.remediation.reassessment, c.remediation.retry):
                result[q.id] = q
    return result

def public_document(doc):
    def redact(value):
        if isinstance(value, dict):
            return {k: redact(v) for k, v in value.items() if k != 'correct_index' and not (k == 'explanation' and 'correct_index' in value)}
        if isinstance(value, list):
            return [redact(v) for v in value]
        return value
    return redact(doc.model_dump())

def snapshot(state, doc):
    active = dict(state.active) if state.active else None
    if active and active.get('question_id'):
        q = questions(doc)[active['question_id']]
        active['question'] = q.model_dump(exclude={'correct_index', 'explanation'})
    return {'id': state.id, 'phase_id': state.phase_id, 'progress': state.progress, 'active': active, 'ended': state.ended, 'revision': state.revision}

def command(state, doc, action, target=None):
    phases = {p.id: p for p in doc.phases}
    progress = dict(state.progress)
    phase = phases[state.phase_id]
    if action == 'restart':
        state.phase_id, state.progress, state.active, state.ended = doc.phases[0].id, {}, None, False
        state.generation += 1
    elif action == 'go_to_phase':
        if target not in phases:
            raise TransitionError('Unknown phase')
        state.phase_id, state.active, state.ended = target, None, False
    elif action == 'next':
        index = next(i for i, p in enumerate(doc.phases) if p.id == state.phase_id)
        state.active = None
        if index + 1 == len(doc.phases):
            state.ended = True
        else:
            state.phase_id = doc.phases[index + 1].id
    elif action == 'quiz':
        if not phase.quiz:
            raise TransitionError('No verified question is available for this phase')
        state.active = {'mode': 'question', 'question_id': phase.quiz.id, 'return_phase_id': phase.id, 'concept_id': phase.quiz.concept_id if phase.quiz.concept_id in phase.prerequisite_ids else None}
    elif action in ('check', 'teach', 'reassess', 'skip'):
        if target not in phase.prerequisite_ids:
            parent = next((p for p in doc.phases if target in p.prerequisite_ids), None)
            if parent:
                state.phase_id = parent.id
                phase = parent
            else:
                raise TransitionError('Prerequisite does not belong to this phase')
        concept = next(c for c in doc.concepts if c.id == target)
        if not concept.remediation:
            raise TransitionError('No verified prerequisite lesson is available')
        if action == 'skip':
            progress[target] = 'needs_help' if progress.get(target) == 'needs_help' else 'skipped'
            state.active = None
        elif action == 'teach':
            prior = state.active or {}
            retry = prior.get('concept_id') == target and prior.get('failed_reassessment', False)
            progress[target] = 'needs_help'
            state.active = {'mode': 'lesson', 'concept_id': target, 'return_phase_id': phase.id, 'retry': retry}
        elif action == 'reassess':
            prior = state.active or {}
            if prior.get('mode') != 'lesson' or prior.get('concept_id') != target:
                q = concept.remediation.reassessment
                state.active = {'mode': 'question', 'question_id': q.id, 'concept_id': target, 'return_phase_id': phase.id}
            else:
                q = concept.remediation.retry if prior.get('retry') else concept.remediation.reassessment
                state.active = {'mode': 'question', 'question_id': q.id, 'concept_id': target, 'return_phase_id': phase.id}
        else:
            state.active = {'mode': 'question', 'question_id': concept.remediation.diagnostic.id, 'concept_id': target, 'return_phase_id': phase.id}
        state.progress = progress
    elif action == 'return':
        state.active = None
    else:
        raise TransitionError('Unsupported command')
    state.revision += 1
    return snapshot(state, doc)

def answer(state, doc, question_id, selected_index):
    active = state.active or {}
    if active.get('mode') != 'question' or active.get('question_id') != question_id:
        raise TransitionError('This question is not active')
    q = questions(doc)[question_id]
    if not 0 <= selected_index < len(q.options):
        raise TransitionError('Invalid option')
    correct = selected_index == q.correct_index
    progress = dict(state.progress)
    if active.get('concept_id'):
        progress[q.concept_id] = 'passed_check' if correct else 'needs_help'
    state.progress = progress
    state.active = {'mode': 'feedback', 'concept_id': active.get('concept_id'), 'return_phase_id': active['return_phase_id'], 'correct': correct, 'explanation': q.explanation, 'failed_reassessment': not correct and q.purpose in ('reassessment', 'retry')}
    state.revision += 1
    return {'correct': correct, 'correct_index': q.correct_index, 'explanation': q.explanation, 'next_action': 'return' if correct else ('teach' if active.get('concept_id') else 'review_phase'), 'state': snapshot(state, doc)}
