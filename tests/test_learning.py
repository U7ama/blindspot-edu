import uuid
from fastapi.testclient import TestClient
from backend.main import app


def resume(c):
    response=c.post('/api/v1/recordings/lecture/session',json={})
    assert response.status_code==200,response.text
    return response.json()

def cmd(c,s,action,target=None):
    response=c.post('/api/v1/recordings/lecture/command',json={'action':action,'target':target,'revision':s['revision']})
    assert response.status_code==200,response.text
    return response.json()

def submit(c,s,index,request_id=None):
    return c.post('/api/v1/recordings/lecture/answer',json={'question_id':s['active']['question_id'],'selected_index':index,'revision':s['revision'],'request_id':request_id or str(uuid.uuid4())})

def test_full_remediation_and_resume(client,lecture):
    s=resume(client)
    assert s==resume(client)
    s=cmd(client,s,'check','fractions')
    assert 'correct_index' not in s['active']['question']
    wrong=submit(client,s,1).json()
    assert wrong['correct'] is False
    s=wrong['state']
    assert s['progress']['fractions']=='needs_help'
    s=cmd(client,s,'teach','fractions')
    assert s['active']['mode']=='lesson'
    assert resume(client)==s
    s=cmd(client,s,'reassess','fractions')
    assert s['active']['question_id']=='r'
    s=submit(client,s,0).json()['state']
    assert s['progress']['fractions']=='passed_check'
    s=cmd(client,s,'return')
    assert s['phase_id']=='ratios'
    s=cmd(client,s,'next')
    assert s['phase_id']=='application'
    s=cmd(client,s,'go_to_phase','ratios')
    assert s['phase_id']=='ratios' and s['progress']['fractions']=='passed_check'
    s=cmd(client,s,'go_to_phase','application')
    s=cmd(client,s,'next')
    assert s['ended'] and s['phase_id']=='application'
    s=cmd(client,s,'restart')
    assert not s['ended'] and s['progress']=={} and s['phase_id']=='ratios'

def test_idempotency_and_no_answer_leak(client,lecture):
    data=client.get('/api/v1/recordings/lecture').json()
    assert 'correct_index' not in str(data)
    assert 'correct_answer' not in str(data)
    s=cmd(client,resume(client),'check','fractions')
    key=str(uuid.uuid4())
    first=submit(client,s,0,key)
    assert first.status_code==200
    second=submit(client,s,0,key)
    assert second.status_code==200 and first.json()==second.json()
    assert submit(client,s,1,key).status_code==409
    assert resume(client)['revision']==first.json()['state']['revision']

def test_failed_reassessment_retry_and_skip(client,lecture):
    s=cmd(client,resume(client),'teach','fractions')
    s=cmd(client,s,'reassess','fractions')
    s=submit(client,s,1).json()['state']
    s=cmd(client,s,'teach','fractions')
    assert s['active']['retry']
    s=cmd(client,s,'reassess','fractions')
    assert s['active']['question_id']=='t'
    s=cmd(client,s,'skip','fractions')
    assert s['progress']['fractions']=='needs_help'

def test_isolation_and_preferences(client,lecture):
    with TestClient(app) as other:
        other.get('/api/v1/me')
        assert other.get('/api/v1/recordings/lecture').status_code==404
        assert other.post('/api/v1/recordings/lecture/session',json={}).status_code==404
        assert other.get('/api/v1/recordings/lecture/media').status_code==404
        client.post('/api/v1/preferences',json={'voice':'Matthew','language':'English'})
        assert other.get('/api/v1/me').json()['preferences']['voice']=='Browser'
        res = client.post('/api/v1/preferences',json={'voice':'Browser','language':'English'})
        assert res.status_code == 200
        assert client.get('/api/v1/me').json()['preferences']['voice']=='Browser'

def test_source_no_fallback_and_disabled_routes(client,lecture):
    assert client.post('/api/v1/recordings/lecture/source',json={'evidence_ids':['invented']}).json()['type']=='source_unavailable'
    assert client.post('/api/v1/recordings/lecture/source',json={'evidence_ids':['s1']}).json()['segments'][0]['start']==0
    for path in ['/api/whiteboard/sessions','/api/session/preferences','/storage/sessions/test.json','/api/lectures']:
        assert client.get(path).status_code==404

def test_stale_command_and_cross_origin(client,lecture):
    s=resume(client)
    cmd(client,s,'next')
    assert client.post('/api/v1/recordings/lecture/command',json={'action':'next','revision':s['revision']}).status_code==409
    assert client.post('/api/v1/invite',json={'code':'test-invitation'},headers={'origin':'https://evil.example'}).status_code==403

def test_five_concurrent_public_learners(client,lecture):
    from concurrent.futures import ThreadPoolExecutor
    from backend.app.core.db import SessionLocal
    from backend.app.adaptive.models import Recording
    with SessionLocal() as db:
        db.get(Recording,lecture).public=True
        db.commit()
    def journey(index):
        with TestClient(app,client=(f'learner-{index}',1234)) as c:
            c.get('/api/v1/me')
            s=cmd(c,resume(c),'check','fractions')
            s=submit(c,s,1).json()['state']
            s=cmd(c,s,'teach','fractions')
            s=cmd(c,s,'reassess','fractions')
            s=submit(c,s,0).json()['state']
            assert s['progress']['fractions']=='passed_check'
            return s['id']
    with ThreadPoolExecutor(max_workers=5) as pool:
        ids=list(pool.map(journey,range(5)))
    assert len(set(ids))==5
