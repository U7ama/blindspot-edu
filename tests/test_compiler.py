from backend.app.adaptive import compiler as c
from backend.app.adaptive.contracts import Concept, Segment, Phase

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
