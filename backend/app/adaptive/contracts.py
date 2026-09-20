from typing import Literal
from pydantic import BaseModel, Field, model_validator

Coverage = Literal['under_explained', 'explained_elsewhere', 'inferred_prerequisite', 'uncertain']

class Segment(BaseModel):
    id: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(min_length=1)

    @model_validator(mode='after')
    def interval(self):
        if self.end <= self.start:
            raise ValueError('Segment end must follow start')
        return self

class Question(BaseModel):
    id: str
    concept_id: str
    phase_id: str
    purpose: Literal['diagnostic', 'reassessment', 'retry', 'phase']
    question: str = Field(min_length=8)
    options: list[str] = Field(min_length=2, max_length=6)
    correct_index: int = Field(ge=0)
    explanation: str = Field(min_length=5)

    @model_validator(mode='after')
    def answer(self):
        if self.correct_index >= len(self.options) or len(set(self.options)) != len(self.options):
            raise ValueError('Invalid answer or duplicate options')
        return self

class Remediation(BaseModel):
    explanation: str = Field(min_length=10)
    worked_example: str = Field(min_length=10)
    simpler_explanation: str = Field(min_length=10)
    steps: list[str] = Field(default_factory=list, max_length=6)
    diagnostic: Question
    reassessment: Question
    retry: Question

class Concept(BaseModel):
    id: str
    name: str
    coverage: Coverage
    reason: str
    evidence_ids: list[str] = Field(default_factory=list)
    explanation_evidence_ids: list[str] = Field(default_factory=list)
    remediation: Remediation | None = None

class Phase(BaseModel):
    id: str
    title: str = Field(min_length=1)
    teaching_script: str = Field(min_length=10)
    evidence_ids: list[str] = Field(min_length=1)
    prerequisite_ids: list[str] = Field(default_factory=list)
    quiz: Question | None = None

class Document(BaseModel):
    version: int = 2
    segments: list[Segment] = Field(min_length=1)
    concepts: list[Concept] = Field(default_factory=list)
    phases: list[Phase] = Field(min_length=1)
    validation: Literal['verified'] = 'verified'

    @model_validator(mode='after')
    def links(self):
        segs = {s.id for s in self.segments}
        concepts = {c.id: c for c in self.concepts}
        phases = {p.id for p in self.phases}
        if len(segs) != len(self.segments) or len(concepts) != len(self.concepts) or len(phases) != len(self.phases):
            raise ValueError('Duplicate identifiers')
        qids = set()
        for c in self.concepts:
            if not set(c.evidence_ids + c.explanation_evidence_ids) <= segs:
                raise ValueError('Unknown concept evidence')
            if c.coverage == 'explained_elsewhere' and not c.explanation_evidence_ids:
                raise ValueError('Explained concepts need explanation evidence')
            if c.coverage == 'under_explained' and not c.evidence_ids:
                raise ValueError('Mentioned concepts need mention evidence')
            if c.remediation:
                if c.coverage not in ('under_explained', 'inferred_prerequisite'):
                    raise ValueError('Only retained prerequisite gaps may have remediation')
                qs = [c.remediation.diagnostic, c.remediation.reassessment, c.remediation.retry]
                if len({q.question.strip().lower() for q in qs}) != 3:
                    raise ValueError('Assessment questions must differ')
                for q, purpose in zip(qs, ['diagnostic', 'reassessment', 'retry']):
                    if q.concept_id != c.id or q.phase_id not in phases or q.purpose != purpose:
                        raise ValueError('Invalid assessment association')
                    if q.id in qids:
                        raise ValueError('Duplicate assessment identifier')
                    qids.add(q.id)
        for p in self.phases:
            if not set(p.evidence_ids) <= segs or not set(p.prerequisite_ids) <= concepts.keys():
                raise ValueError('Unknown phase link')
            for cid in p.prerequisite_ids:
                c = concepts[cid]
                if c.coverage not in ('under_explained', 'inferred_prerequisite'):
                    raise ValueError('Explained or uncertain concepts cannot be checkpoints')
                if c.coverage in ('under_explained', 'inferred_prerequisite'):
                    if not c.remediation or any(q.phase_id != p.id for q in (c.remediation.diagnostic, c.remediation.reassessment, c.remediation.retry)):
                        raise ValueError('Checkpoint requires a complete associated lesson')
            if p.quiz:
                if p.quiz.phase_id != p.id or p.quiz.purpose != 'phase' or p.quiz.id in qids or not p.quiz.concept_id:
                    raise ValueError('Invalid phase quiz')
                qids.add(p.quiz.id)
        return self
