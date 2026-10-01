from copy import deepcopy

import pytest
from pydantic import ValidationError

from conftest import document
from backend.app.adaptive.saved_documents import load_saved_document
from backend.app.adaptive.models import Recording, LearningState
from backend.app.core.db import SessionLocal


@pytest.mark.parametrize('missing', [('correct_index',), ('explanation',), ('correct_index', 'explanation')])
def test_missing_quiz_grading_preserves_lesson_without_inventing_answers(missing):
    payload = document().model_dump()
    for field in missing:
        payload['phases'][0]['quiz'].pop(field)
    original = deepcopy(payload)
    doc, warnings = load_saved_document(payload)
    assert doc.phases[0].quiz is None
    assert doc.phases[0].prerequisite_ids == ['fractions']
    assert doc.concepts[0].remediation is not None
    assert warnings
    assert payload == original


def test_valid_saved_document_keeps_all_checks():
    doc, warnings = load_saved_document(document().model_dump())
    assert doc.phases[0].quiz.correct_index == 0
    assert warnings == []


@pytest.mark.parametrize('invalid', ['evidence', 'answer', 'options', 'remediation'])
def test_compatibility_does_not_hide_other_validation_failures(invalid):
    payload = document().model_dump()
    if invalid == 'evidence':
        payload['phases'][0]['evidence_ids'] = ['made-up']
        payload['phases'][0]['quiz'].pop('correct_index')
    elif invalid == 'answer':
        payload['phases'][0]['quiz']['correct_index'] = 99
    elif invalid == 'options':
        payload['phases'][0]['quiz']['options'] = []
        payload['phases'][0]['quiz'].pop('correct_index')
    else:
        payload['concepts'][0]['remediation']['diagnostic'].pop('correct_index')
    with pytest.raises(ValidationError):
        load_saved_document(payload)


def test_saved_lesson_api_and_stale_quiz_resume(client, lecture):
    state = client.post(f'/api/v1/recordings/{lecture}/session', json={}).json()
    active = client.post(f'/api/v1/recordings/{lecture}/command', json={
        'action': 'quiz', 'revision': state['revision'],
    }).json()
    with SessionLocal() as db:
        rec = db.get(Recording, lecture)
        payload = deepcopy(rec.document)
        payload['phases'][0]['quiz'].pop('correct_index')
        payload['phases'][0]['quiz'].pop('explanation')
        rec.document = payload
        saved = db.get(LearningState, state['id'])
        saved.progress = {'fractions': 'needs_help'}
        db.commit()
    response = client.get(f'/api/v1/recordings/{lecture}')
    assert response.status_code == 200
    assert response.json()['content_warnings']
    assert response.json()['document']['phases'][0]['quiz'] is None
    assert 'correct_index' not in response.text
    restored = client.post(f'/api/v1/recordings/{lecture}/session', json={}).json()
    assert restored['active'] is None
    assert restored['phase_id'] == active['phase_id']
    assert restored['revision'] == active['revision'] + 1
    assert restored['progress'] == {'fractions': 'needs_help'}
    assert client.post(f'/api/v1/recordings/{lecture}/session', json={}).json() == restored
    unavailable = client.post(f'/api/v1/recordings/{lecture}/command', json={
        'action': 'quiz', 'revision': restored['revision'],
    })
    assert unavailable.status_code == 400


def test_invalid_saved_lesson_reports_repair_instead_of_generation_error(client, lecture):
    with SessionLocal() as db:
        rec = db.get(Recording, lecture)
        payload = deepcopy(rec.document)
        payload['phases'][0]['evidence_ids'] = ['made-up']
        rec.document = payload
        db.commit()
    response = client.get(f'/api/v1/recordings/{lecture}')
    assert response.status_code == 409
    assert 'administrator repair' in response.json()['detail']
