import os
import tempfile
from pathlib import Path

_root = tempfile.TemporaryDirectory(prefix='blindspot-tests-')
os.environ['DATABASE_URL'] = f'sqlite:///{_root.name}/test.db'
os.environ['DATA_DIR'] = f'{_root.name}/data'
os.environ['APP_ORIGIN'] = 'http://testserver'
os.environ['PILOT_INVITE_CODE'] = 'test-invitation'
os.environ['APP_ENV'] = 'test'
os.environ['STORAGE_BACKEND'] = 'local'
os.environ['TTS_PROVIDER'] = 'disabled'
os.environ['AI_TOTAL_ALLOWANCE_USD'] = '6'

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.app.core.db import Base, engine, init_db, SessionLocal
from backend.app.adaptive.models import Recording
from backend.app.adaptive.contracts import Document


def document():
    def question(id, purpose, text):
        return dict(id=id, concept_id='fractions', phase_id='ratios', purpose=purpose, question=text, options=['One half', 'Two wholes'], correct_index=0, explanation='One of two equal pieces is one half.')
    return Document.model_validate(dict(segments=[dict(id='s1',start=0,end=5,text='To compare these ratios, use equivalent fractions.')], concepts=[dict(id='fractions',name='Equivalent fractions',coverage='under_explained',reason='Mentioned without explaining equivalence.',evidence_ids=['s1'],remediation=dict(explanation='Equal fractions represent the same share.',worked_example='One half is the same share as two quarters.',simpler_explanation='Cut each half in two: two of four pieces still make half.',steps=['Split a whole in two','Split each half again','Compare the same share'],diagnostic=question('d','diagnostic','What share does two quarters represent?'),reassessment=question('r','reassessment','What share is three pieces of six equal pieces?'),retry=question('t','retry','What share is four pieces of eight equal pieces?')))], phases=[dict(id='ratios',title='Comparing ratios',teaching_script='The lecturer uses equivalent fractions to compare ratios.',evidence_ids=['s1'],prerequisite_ids=['fractions'],quiz=question('p','phase','What share do the ratios compare?')),dict(id='application',title='Apply the ratio',teaching_script='Compare ratios with equivalent fractions.',evidence_ids=['s1'],prerequisite_ids=[])]))

@pytest.fixture(autouse=True)
def clean_database():
    init_db()
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())
    app.user_middleware  # no fixture seeding on boot
    yield

@pytest.fixture
def client():
    with TestClient(app) as c:
        c.get('/api/v2/me')
        yield c

@pytest.fixture
def lecture(client):
    import hashlib
    owner=hashlib.sha256(client.cookies['blindspot_learner'].encode()).hexdigest()
    with SessionLocal() as db:
        db.add(Recording(id='lecture',owner_id=owner,title='Fractions pilot',storage_backend='local',object_key='a'*32+'.wav',duration=5,status='ready',document=document().model_dump(),public=False))
        db.commit()
    return 'lecture'
