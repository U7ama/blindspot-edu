from backend.app.adaptive import compiler as c
from backend.app.adaptive.contracts import Concept, Segment, Phase, Question

def test_later_explanation_reconciled(monkeypatch):
    segments=[Segment(id='early',start=0,end=5,text='Use equivalent fractions.'),Segment(id='later',start=30,end=45,text='Equivalent fractions have equal values; multiply numerator and denominator by the same number.')]
    visited=[]
    def fake(prompt,data,shape,tokens=4096,**kwargs):
        if shape is c.CoverageBatch:
            return c.CoverageBatch(items=[c.CoverageItem(name='Fractions',explanation='Topic coverage',evidence_ids=[data[0]['id']],possibly_missing=True)],teachable_evidence_ids=[data[0]['id']])
        if shape is c.CandidateList:
            return c.CandidateList(concepts=[Concept(id='fractions',name='Fractions',coverage='under_explained',reason='Initially assumed',evidence_ids=['early'])])
        if shape is c.WindowVerdict:
            visited.append(data['segments'][0]['id'])
            later=data['segments'][0]['id']=='later'
            return c.WindowVerdict(explained=later,evidence_ids=['later'] if later else [])
        if shape is c.Plan:
            return c.Plan(phases=[Phase(id='p',title='Fractions',teaching_script='Equivalent fractions have equal values.',evidence_ids=['later'])])
        return c.Verdict(supported=True,reason='Exact evidence supports the explanation')
    monkeypatch.setattr(c,'windows',lambda segments:[[segments[0]],[segments[1]]])
    monkeypatch.setattr(c,'call',fake)
    result=c.compile_document(segments)
    assert visited==['early','later']
    assert result.concepts[0].coverage=='explained_elsewhere'
    assert result.concepts[0].explanation_evidence_ids==['later']

import json
import pytest


def test_unknown_prerequisite_corrected_once(monkeypatch):
    candidate=Concept(id='fractions',name='Fractions',coverage='under_explained',reason='Assumed',evidence_ids=['s'])
    segments=[Segment(id='s',start=0,end=5,text='Compare ratios using equivalent fractions.')]
    invalid=c.Plan(phases=[Phase(id='p',title='Ratios',teaching_script='Compare ratios using equivalent fractions.',evidence_ids=['s'],prerequisite_ids=['invented'])])
    corrected=invalid.model_copy(deep=True)
    corrected.phases[0].prerequisite_ids=['fractions']
    calls=[]
    def fake(system,data,**kwargs):
        calls.append(json.loads(data))
        return invalid if len(calls)==1 else corrected
    monkeypatch.setattr(c,'chat_completion',fake)
    result=c.generate_plan([], [candidate], segments)
    assert result.phases[0].prerequisite_ids==['fractions']
    assert len(calls)==2
    assert calls[0]['allowed_prerequisite_ids']==['fractions']
    assert calls[1]['previous_output']['phases'][0]['prerequisite_ids']==['invented']
    assert 'ONLY allowed_prerequisite_ids' in calls[1]['validation_issues']


def test_invalid_plan_stops_after_one_correction(monkeypatch):
    plan=c.Plan(phases=[Phase(id='p',title='Tutorial',teaching_script='This tutorial explains a concept.',evidence_ids=['s'],prerequisite_ids=['invented'])])
    calls=[]
    monkeypatch.setattr(c,'chat_completion',lambda *a,**k: (calls.append(True) or plan))
    with pytest.raises(c.GenerationValidationError):
        c.generate_plan([],[],[Segment(id='s',start=0,end=5,text='An explanation.')])
    assert len(calls)==2
    assert plan.phases[0].prerequisite_ids==['invented']  # No silent deletion/fabrication.


@pytest.mark.parametrize('kind',['explained','duplicate','evidence','quiz'])
def test_plan_reference_validation(kind):
    from backend.app.adaptive.contracts import Question
    plan=c.Plan(phases=[Phase(id='p',title='Tutorial',teaching_script='This tutorial explains a concept.',evidence_ids=['s'])])
    p=plan.phases[0]
    if kind=='explained':p.prerequisite_ids=['not-eligible']
    elif kind=='duplicate':p.prerequisite_ids=['allowed','allowed']
    elif kind=='evidence':p.evidence_ids=['invented']
    else:p.quiz=Question(id='q',phase_id='other',concept_id='topic',purpose='phase',question='Which option is correct?',options=['A','B'],correct_index=0,explanation='A is correct.')
    with pytest.raises(ValueError):c.validate_plan(plan,{'allowed'},{'s'})


def test_unsuitable_recording_does_not_invent_course(monkeypatch):
    calls=[]
    def fake(prompt,data,shape,tokens=4096,**kwargs):
        calls.append(shape)
        assert shape is c.CoverageBatch
        return c.CoverageBatch(items=[],teachable_evidence_ids=[])
    monkeypatch.setattr(c,'call',fake)
    with pytest.raises(c.InsufficientContent):
        c.compile_document([Segment(id='s',start=0,end=5,text='Fix the menu, add a changelog entry. Thanks, bye.')])
    assert calls==[c.CoverageBatch]


def test_informal_tutorial_without_gaps_can_build_lesson(monkeypatch):
    def fake(prompt,data,shape,tokens=4096,**kwargs):
        if shape is c.CoverageBatch:
            return c.CoverageBatch(items=[c.CoverageItem(name='Recursion',explanation='A function calls itself, stopping at a base case.',evidence_ids=['s'],possibly_missing=False)],teachable_evidence_ids=['s'])
        if shape is c.CandidateList:return c.CandidateList(concepts=[])
        if shape is c.Plan:return c.Plan(phases=[Phase(id='p',title='Recursion',teaching_script='A recursive function calls itself and stops at a base case.',evidence_ids=['s'],prerequisite_ids=[])])
        return c.Verdict(supported=True,reason='The excerpt explains the concept.')
    monkeypatch.setattr(c,'call',fake)
    doc=c.compile_document([Segment(id='s',start=0,end=8,text="Here's recursion: a function calls itself. The base case stops those calls.")])
    assert len(doc.phases)==1 and doc.concepts==[]


def test_window_verdict_normalizes_segment_ids():
    verdict_a = c.WindowVerdict.model_validate({'explained': True, 'segment_ids': ['s1', 's2']})
    assert verdict_a.explained is True and verdict_a.evidence_ids == ['s1', 's2']
    verdict_b = c.WindowVerdict.model_validate({'explained': False, 'evidence_ids': None})
    assert verdict_b.evidence_ids == []
    verdict_c = c.WindowVerdict.model_validate({'explained': True, 'evidence_ids': 's3'})
    assert verdict_c.evidence_ids == ['s3']


RID = 'aedee1c672224a06b4b96b512fff506f'

def test_coverage_repairs_recording_prefix_only():
    valid = RID + ':s201'
    typo = 'aedee1c67224a06b4b96b512fff506f:s201'
    batch = c.CoverageBatch(items=[c.CoverageItem(name='Fragmentation', explanation='An explanation', evidence_ids=[typo], possibly_missing=False)], teachable_evidence_ids=[typo])
    c.validate_coverage(batch, {valid})
    assert batch.items[0].evidence_ids == [valid]
    assert batch.teachable_evidence_ids == [valid]

@pytest.mark.parametrize('reference', [RID + ':s202', 'b' * 32 + ':s201', RID[:-1] + '0:s201', 's201', 'invented:s201'])
def test_evidence_repair_rejects_unknown_or_other_recording(reference):
    with pytest.raises(ValueError):
        c.normalize_evidence_ids([reference], {RID + ':s201'})

def test_evidence_repair_rejects_ambiguity():
    with pytest.raises(ValueError):
        c.normalize_evidence_ids(['a' * 31 + ':s1'], {'a' * 32 + ':s1', 'a' * 31 + 'b:s1'})

def test_coverage_invalid_reference_enters_correction(monkeypatch):
    bad=c.CoverageBatch(items=[],teachable_evidence_ids=['invented'])
    good=c.CoverageBatch(items=[],teachable_evidence_ids=['s'])
    calls=[]
    def fake(*args,**kwargs):
        calls.append(args)
        return bad if len(calls)==1 else good
    monkeypatch.setattr(c,'chat_completion',fake)
    result=c.call('Coverage',{},c.CoverageBatch,validator=lambda b:c.validate_coverage(b,{'s'}))
    assert result is good and len(calls)==2

@pytest.mark.parametrize('passes', [True, False])
def test_phase_rewrite_requires_fresh_positive_review(monkeypatch, passes):
    phase=Phase(id='p',title='Topic',teaching_script='Unsupported assertion.',evidence_ids=['s'])
    segment=Segment(id='s',start=0,end=5,text='The actual explanation.')
    calls=[]
    def fake(prompt,data,shape,*args,**kwargs):
        calls.append(shape)
        if shape is c.Verdict:
            return c.Verdict(supported=passes and len(calls)==3,reason='Unsupported assertion')
        fixed=phase.model_copy(update={'teaching_script':'The actual explanation.'})
        kwargs['validator'](fixed)
        return fixed
    monkeypatch.setattr(c,'call',fake)
    if passes:
        assert c.review_phase(phase,{'s':segment}).teaching_script=='The actual explanation.'
    else:
        with pytest.raises(c.GenerationValidationError):c.review_phase(phase,{'s':segment})
    assert calls==[c.Verdict,c.Phase,c.Verdict]


def test_phase_repair_cannot_replace_evidence(monkeypatch):
    phase=Phase(id='p',title='Topic',teaching_script='Unsupported assertion.',evidence_ids=['s'])
    def fake(prompt,data,shape,*args,**kwargs):
        if shape is c.Verdict:return c.Verdict(supported=False,reason='Unsupported')
        kwargs['validator'](phase.model_copy(update={'evidence_ids':['another']}))
    monkeypatch.setattr(c,'call',fake)
    with pytest.raises(ValueError,match='Preserve phase'):
        c.review_phase(phase,{'s':Segment(id='s',start=0,end=5,text='Explanation.')})


def test_phase_repair_allows_rewritten_quiz_concept_id(monkeypatch):
    quiz = Question(id='q1', concept_id='old-concept', phase_id='p', purpose='phase', question='Original question?', options=['A', 'B'], correct_index=0, explanation='Orig expl.')
    phase = Phase(id='p', title='Topic', teaching_script='Unsupported assertion.', evidence_ids=['s'], quiz=quiz)
    segment = Segment(id='s', start=0, end=5, text='The actual explanation.')
    calls = []
    def fake(prompt, data, shape, *args, **kwargs):
        calls.append(shape)
        if shape is c.Verdict:
            return c.Verdict(supported=len(calls) == 3, reason='Unsupported')
        repaired_quiz = Question(id='unexpected-new-id', concept_id='new-supported-concept', phase_id='p', purpose='phase', question='Supported question?', options=['A', 'B'], correct_index=1, explanation='New expl.')
        repaired = phase.model_copy(update={'teaching_script': 'The actual explanation.', 'quiz': repaired_quiz})
        kwargs['validator'](repaired)
        return repaired
    monkeypatch.setattr(c, 'call', fake)
    result = c.review_phase(phase, {'s': segment})
    assert result.quiz.id == 'q1'
    assert result.quiz.concept_id == 'new-supported-concept'
    assert result.quiz.phase_id == 'p'
    assert result.quiz.purpose == 'phase'



@pytest.mark.parametrize('failure_mode', ['rejected', 'invalid_output'])
def test_unverified_optional_remediation_does_not_fail_verified_lesson(monkeypatch, failure_mode):
    from backend.app.adaptive.contracts import Document, Remediation

    segment = Segment(id='s', start=0, end=8, text='A disk stores data in blocks that the operating system reads and writes.')
    concept = Concept(id='blocks', name='Block addressing', coverage='inferred_prerequisite', reason='Assumed by the lesson', evidence_ids=['s'])
    phase = Phase(id='p', title='Disk basics', teaching_script='The operating system reads and writes disk blocks.', evidence_ids=['s'], prerequisite_ids=['blocks'])

    def question(purpose):
        return Question(id=f'q-{purpose}', concept_id='blocks', phase_id='p', purpose=purpose,
                        question=f'Which choice explains {purpose} correctly?', options=['Correct', 'Incorrect'],
                        correct_index=0, explanation='The first choice follows the example.')

    remediation = Remediation(explanation='Blocks are addressable units on a disk.',
                              worked_example='Reading block 5 retrieves the fifth stored unit.',
                              simpler_explanation='Think of each block as a numbered box.',
                              diagnostic=question('diagnostic'), reassessment=question('reassessment'),
                              retry=question('retry'))

    def fake(prompt, data, shape, tokens=4096, **kwargs):
        if shape is c.CoverageBatch:
            return c.CoverageBatch(items=[c.CoverageItem(name='Disk blocks', explanation='The operating system reads blocks.', evidence_ids=['s'], possibly_missing=False)], teachable_evidence_ids=['s'])
        if shape is c.CandidateList:
            return c.CandidateList(concepts=[concept])
        if shape is c.WindowVerdict:
            return c.WindowVerdict(explained=False)
        if shape is c.Plan:
            return c.Plan(phases=[phase])
        if shape is c.Remediation:
            if failure_mode == 'invalid_output':
                raise c.GenerationValidationError('Remediation')
            return remediation
        if shape is c.Verdict:
            return c.Verdict(supported=not prompt.startswith('Review this supplementary'), reason='Independent review')
        raise AssertionError(shape)

    monkeypatch.setattr(c, 'call', fake)
    document = c.compile_document([segment])
    Document.model_validate(document)
    assert document.phases[0].prerequisite_ids == []
    assert document.concepts[0].coverage == 'uncertain'
    assert document.concepts[0].remediation is None


def test_supplementary_questions_require_exact_associations_and_distinct_ids():
    from backend.app.adaptive.contracts import Remediation

    def question(purpose, *, phase_id='p', question_id=None):
        return Question(id=question_id or purpose, concept_id='blocks', phase_id=phase_id,
                        purpose=purpose, question=f'What does {purpose} mean here?',
                        options=['Correct', 'Incorrect'], correct_index=0,
                        explanation='The first option follows the worked example.')

    lesson = Remediation(explanation='A disk block is an addressable unit.',
                         worked_example='Reading block five retrieves one unit.',
                         simpler_explanation='A block is like a numbered box.',
                         diagnostic=question('diagnostic'),
                         reassessment=question('reassessment'), retry=question('retry'))
    c.validate_remediation(lesson, 'blocks', 'p')
    lesson.reassessment.phase_id = 'wrong-phase'
    with pytest.raises(ValueError, match='supplied concept_id'):
        c.validate_remediation(lesson, 'blocks', 'p')
    lesson.reassessment.phase_id = 'p'
    lesson.retry.id = lesson.diagnostic.id
    with pytest.raises(ValueError, match='distinct IDs'):
        c.validate_remediation(lesson, 'blocks', 'p')


def test_failed_optional_checkpoint_does_not_skip_next_checkpoint(monkeypatch):
    from backend.app.adaptive.contracts import Document, Remediation

    segment = Segment(id='s', start=0, end=8, text='The operating system reads disk blocks and stores backup copies.')
    concepts = [Concept(id=cid, name=cid, coverage='inferred_prerequisite', reason='Assumed', evidence_ids=['s'])
                for cid in ('blocks', 'backups')]
    phase = Phase(id='p', title='Storage', teaching_script='The operating system reads disk blocks and stores backups.',
                  evidence_ids=['s'], prerequisite_ids=['blocks', 'backups'])
    def question(purpose):
        return Question(id=f'backups-{purpose}', concept_id='backups', phase_id='p', purpose=purpose,
                        question=f'Which answer describes {purpose} for backups?', options=['Correct', 'Incorrect'],
                        correct_index=0, explanation='The first option follows the example.')
    valid = Remediation(explanation='A backup is a separate copy of data.',
                        worked_example='A copied file can be restored after deletion.',
                        simpler_explanation='Keep a spare copy.', diagnostic=question('diagnostic'),
                        reassessment=question('reassessment'), retry=question('retry'))
    seen = []
    def fake(prompt, data, shape, tokens=4096, **kwargs):
        if shape is c.CoverageBatch:
            return c.CoverageBatch(items=[], teachable_evidence_ids=['s'])
        if shape is c.CandidateList:
            return c.CandidateList(concepts=concepts)
        if shape is c.WindowVerdict:
            return c.WindowVerdict(explained=False)
        if shape is c.Plan:
            return c.Plan(phases=[phase])
        if shape is c.Remediation:
            cid = data['concept']['id']
            seen.append(cid)
            if cid == 'blocks':
                raise c.GenerationValidationError('Remediation')
            kwargs['validator'](valid)
            return valid
        if shape is c.Verdict:
            return c.Verdict(supported=True)
        raise AssertionError(shape)
    monkeypatch.setattr(c, 'call', fake)
    document = c.compile_document([segment])
    Document.model_validate(document)
    assert seen == ['blocks', 'backups']
    assert document.phases[0].prerequisite_ids == ['backups']
    assert document.concepts[1].remediation is not None


@pytest.mark.parametrize('explained_later', [False, True])
def test_window_verdict_failure_does_not_establish_a_gap(monkeypatch, explained_later):
    segments = [
        Segment(id='s1', start=0, end=5, text='First concept introduction.'),
        Segment(id='s2', start=10, end=20, text='Second concept detail.'),
    ]
    def fake(prompt, data, shape, tokens=4096, **kwargs):
        if shape is c.CoverageBatch:
            return c.CoverageBatch(
                items=[c.CoverageItem(name='Topic', explanation='Coherent topic', evidence_ids=[data[0]['id']], possibly_missing=True)],
                teachable_evidence_ids=[data[0]['id']]
            )
        if shape is c.CandidateList:
            return c.CandidateList(concepts=[Concept(id='topic', name='Topic', coverage='under_explained', reason='Assumed', evidence_ids=['s1'])])
        if shape is c.WindowVerdict:
            if explained_later and data['segments'][0]['id'] == 's2':
                return c.WindowVerdict(explained=True, evidence_ids=['s2'])
            raise c.GenerationValidationError('WindowVerdict')
        if shape is c.Plan:
            assert data['allowed_prerequisite_ids'] == []
            return c.Plan(phases=[Phase(id='p', title='Topic', teaching_script='Coherent topic explained.', evidence_ids=['s1'])])
        return c.Verdict(supported=True, reason='Supported')
    monkeypatch.setattr(c, 'windows', lambda s: [[s[0]], [s[1]]])
    monkeypatch.setattr(c, 'call', fake)
    doc = c.compile_document(segments)
    assert len(doc.phases) == 1
    assert doc.concepts[0].coverage == ('explained_elsewhere' if explained_later else 'uncertain')
    assert doc.concepts[0].remediation is None


@pytest.mark.parametrize('payload', [{}, {'explained': 'maybe'}])
def test_window_verdict_requires_an_explicit_boolean(payload):
    with pytest.raises(ValueError):
        c.WindowVerdict.model_validate(payload)


@pytest.mark.parametrize('ids', [[], ['invented']])
def test_explained_window_requires_valid_support(ids):
    with pytest.raises(ValueError):
        c.validate_window_verdict(c.WindowVerdict(explained=True, evidence_ids=ids), {'s1'})


def test_window_verdict_invalid_evidence_gets_one_correction(monkeypatch):
    responses = iter([c.WindowVerdict(explained=True, evidence_ids=['invented']), c.WindowVerdict(explained=True, evidence_ids=['s1'])])
    calls = []
    def fake(*args, **kwargs):
        calls.append(args)
        return next(responses)
    monkeypatch.setattr(c, 'chat_completion', fake)
    verdict = c.call('Check', {}, c.WindowVerdict, validator=lambda v: c.validate_window_verdict(v, {'s1'}))
    assert verdict.evidence_ids == ['s1'] and len(calls) == 2


def test_validation_logging_does_not_expose_rejected_input(monkeypatch, caplog):
    marker = 'PRIVATE_TRANSCRIPT_MARKER'
    def invalid(*args, **kwargs):
        return c.WindowVerdict.model_validate({'explained': [marker]})
    monkeypatch.setattr(c, 'chat_completion', invalid)
    with pytest.raises(c.GenerationValidationError):
        c.call('Check', {}, c.WindowVerdict)
    assert marker not in caplog.text
    assert 'ValidationError' in caplog.text
def test_adapter_schema_errors_reach_bounded_correction(monkeypatch):
    import json
    from pydantic import ValidationError
    from backend.app.services.ai.llm import StructuredOutputError
    from backend.app.adaptive import compiler as c
    try:
        c.CoverageBatch.model_validate({'items': []})
    except ValidationError as exc:
        failure = StructuredOutputError(c.CoverageBatch, exc)
    requests = []
    def generate(prompt, data, **kwargs):
        requests.append(json.loads(data))
        if len(requests) == 1:
            raise failure
        return c.CoverageBatch(items=[], teachable_evidence_ids=[])
    monkeypatch.setattr(c, 'chat_completion', generate)
    c.call('Extract coverage', {'source': 'original evidence'}, c.CoverageBatch)
    assert len(requests) == 2
    assert requests[1]['validation_issues'] == [{'field': ['teachable_evidence_ids'], 'type': 'missing'}]
    assert requests[1]['original_input'] == requests[0]
    assert requests[1]['previous_output'] is None
