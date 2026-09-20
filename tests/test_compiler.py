from backend.app.adaptive import compiler as c
from backend.app.adaptive.contracts import Concept, Segment, Phase

def test_later_explanation_reconciled(monkeypatch):
    segments=[Segment(id='early',start=0,end=5,text='Use equivalent fractions.'),Segment(id='later',start=30,end=45,text='Equivalent fractions have equal values; multiply numerator and denominator by the same number.')]
    visited=[]
    def fake(prompt,data,shape,tokens=4096):
        if shape is c.CoverageBatch:
            return c.CoverageBatch(items=[c.CoverageItem(name='Fractions',explanation='Topic coverage',evidence_ids=[data[0]['id']],possibly_missing=True)])
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
