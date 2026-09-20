import io
import pytest
from backend.app.services.storage import Storage
from backend.app.services.ai import llm
from backend.app.adaptive.compiler import Verdict

class FakeS3:
    def __init__(self):self.calls=[]
    def upload_file(self,*args):self.calls.append(('upload',args))
    def download_file(self,bucket,key,path):
        from pathlib import Path
        Path(path).write_bytes(b'cloud-recording')
    def generate_presigned_url(self,operation,Params,ExpiresIn):
        self.calls.append(('signed',operation,Params,ExpiresIn));return 'https://example.invalid/signed'
    def delete_object(self,**kwargs):self.calls.append(('delete',kwargs))

def test_s3_explicit_roundtrip(monkeypatch,tmp_path):
    from backend.app.services import storage
    monkeypatch.setenv('S3_BUCKET_NAME','private-test')
    fake=FakeS3();monkeypatch.setattr(storage,'cloud_client',lambda backend:fake)
    adapter=Storage('s3');src=tmp_path/'recording.wav';src.write_bytes(b'data')
    key=adapter.save(src,'recording.wav')
    assert not key.startswith('https:')
    with adapter.local_copy(key) as local:assert local.read_bytes()==b'cloud-recording'
    assert not local.exists()
    assert adapter.playback_url(key)=='https://example.invalid/signed'
    assert fake.calls[-1][-1]==300
    adapter.delete(key)

def test_bedrock_structured_and_bounded(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER','bedrock');monkeypatch.setenv('BEDROCK_MODEL_ID','test-profile')
    calls=[]
    class Client:
        def converse(self,**kwargs):
            calls.append(kwargs)
            return {'stopReason':'end_turn','output':{'message':{'content':[{'text':'{"supported":true,"reason":"Exact evidence"}'}]}}}
    monkeypatch.setattr(llm,'_bedrock',lambda:Client())
    result=llm.chat_completion('Verify evidence','Some source',response_model=Verdict,max_tokens=100)
    assert result.supported
    assert calls[0]['inferenceConfig']['maxTokens']==100
    assert 'untrusted' in calls[0]['system'][0]['text']

def test_invalid_bedrock_result_not_accepted(monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER','bedrock');monkeypatch.setenv('BEDROCK_MODEL_ID','test-profile')
    class Client:
        def converse(self,**kwargs):return {'stopReason':'max_tokens','output':{'message':{'content':[{'text':'{}'}]}}}
    monkeypatch.setattr(llm,'_bedrock',lambda:Client())
    with pytest.raises(ValueError):llm.chat_completion('Verify','Source',response_model=Verdict,max_tokens=10)

def test_backup_restore(tmp_path):
    import sqlite3
    from scripts.backup import backup
    src=tmp_path/'source.db';dst=tmp_path/'backup.db'
    with sqlite3.connect(src) as db:
        db.execute('CREATE TABLE evidence (id TEXT)');db.execute("INSERT INTO evidence VALUES ('s1')")
    backup(src,dst)
    with sqlite3.connect(dst) as db:assert db.execute('SELECT id FROM evidence').fetchall()==[('s1',)]

def test_provider_failure_preserves_saved_lesson(client,lecture,monkeypatch):
    from botocore.exceptions import ClientError
    from backend.app.adaptive import api
    def denied(*args,**kwargs):
        raise ClientError({'Error':{'Code':'AccessDeniedException','Message':'private provider detail'}},'Converse')
    monkeypatch.setattr(api,'chat_completion',denied)
    result=client.post('/api/v2/recordings/lecture/question',json={'question':'Explain this step'})
    assert result.status_code==503
    assert 'private provider detail' not in result.text
    assert client.get('/api/v2/recordings/lecture').status_code==200
