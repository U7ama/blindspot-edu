import json
import subprocess
from pathlib import Path
from types import SimpleNamespace
import pytest
from pydantic import BaseModel
from backend.app.adaptive import imports, llm_cache, notifications, youtube_import
from backend.app.adaptive.models import LLMCache, LLMCacheOrigin, EmailNotice
from backend.app.core.db import SessionLocal


class Answer(BaseModel):
    answer: str


def seed_cache(model='kimi-k3', raw='{"answer":"saved"}', origin=False):
    key = llm_cache.key_for('modelstudio', model, 'system', 'prompt')
    with SessionLocal() as db:
        db.add(LLMCache(key=key, response=raw, created_at=1))
        if origin:
            db.add(LLMCacheOrigin(key=key, requested_model=model, source_model=model,
                                 source_provider='modelstudio', provenance='recorded'))
        db.commit()
    return key


def test_inherited_cache_preserves_real_origin(monkeypatch):
    monkeypatch.delenv('LLM_CACHE_INHERIT_MODELS', raising=False)
    source = seed_cache(origin=True)
    hit, answer = llm_cache.read('modelstudio', 'qwen3.7-plus', 'system', 'prompt', Answer)
    assert hit and answer.answer == 'saved'
    target = llm_cache.key_for('modelstudio', 'qwen3.7-plus', 'system', 'prompt')
    with SessionLocal() as db:
        origin = db.get(LLMCacheOrigin, target)
        assert origin.requested_model == 'qwen3.7-plus'
        assert origin.source_model == 'kimi-k3'
        assert origin.inherited_from == source


def test_untracked_legacy_cache_is_not_mislabelled(monkeypatch):
    monkeypatch.delenv('LLM_CACHE_INHERIT_MODELS', raising=False)
    seed_cache()
    hit, _ = llm_cache.read('modelstudio', 'qwen3.7-plus', 'system', 'prompt', Answer)
    assert hit
    with SessionLocal() as db:
        origin = db.get(LLMCacheOrigin, llm_cache.key_for('modelstudio', 'qwen3.7-plus', 'system', 'prompt'))
        assert origin.source_model is None and origin.provenance == 'legacy_unknown'


def test_invalid_inherited_response_not_copied(monkeypatch):
    monkeypatch.delenv('LLM_CACHE_INHERIT_MODELS', raising=False)
    seed_cache(raw='{"wrong":123}')
    assert not llm_cache.read('modelstudio', 'qwen3.7-plus', 'system', 'prompt', Answer)[0]
    with SessionLocal() as db:
        assert db.get(LLMCache, llm_cache.key_for('modelstudio', 'qwen3.7-plus', 'system', 'prompt')) is None


def test_unrequested_reverse_inheritance_disabled(monkeypatch):
    monkeypatch.delenv('LLM_CACHE_INHERIT_MODELS', raising=False)
    seed_cache(model='qwen3.7-plus')
    assert not llm_cache.read('modelstudio', 'kimi-k3', 'system', 'prompt', Answer)[0]


def test_new_cache_origin_recorded():
    llm_cache.save('modelstudio', 'qwen3.7-plus', 'system', 'prompt', '{"answer":"new"}')
    with SessionLocal() as db:
        origin=db.get(LLMCacheOrigin,llm_cache.key_for('modelstudio','qwen3.7-plus','system','prompt'))
        assert origin.source_model == 'qwen3.7-plus' and origin.provenance == 'recorded'


def downloader_factory(tmp_path, info, download_calls, sizes=(2,3)):
    class Downloader:
        def __init__(self, options): self.options=options
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def extract_info(self,url,download):
            assert download is False
            return info
        def process_info(self,data):
            download_calls.append(True)
            for index, size in enumerate(sizes):
                self.options['progress_hooks'][0]({'status':'downloading','filename':str(index),'downloaded_bytes':size})
            (tmp_path/'recording.mp4').write_bytes(b'x'*sum(sizes))
    return Downloader


@pytest.mark.parametrize('info, reason', [
    ({'duration':99999}, 'duration'),
    ({'duration':20,'is_live':True}, 'live'),
    ({'duration':20,'live_status':'is_upcoming'}, 'live'),
    ({'duration':20,'requested_formats':[{'filesize':6},{'filesize':6}]}, 'size'),
])
def test_youtube_rejects_before_downloading(tmp_path, info, reason):
    called=[]
    with pytest.raises(youtube_import.Rejected, match=reason):
        youtube_import.perform('url',tmp_path,10,downloader_factory(tmp_path,info,called))
    assert not called


def test_youtube_aggregate_stream_limit(tmp_path):
    with pytest.raises(youtube_import.Rejected,match='size'):
        youtube_import.perform('url',tmp_path,10,downloader_factory(tmp_path,{'duration':20},[],sizes=(6,6)))


def test_youtube_valid_combined_output(tmp_path):
    called=[]
    result=youtube_import.perform('url',tmp_path,10,downloader_factory(tmp_path,{'duration':20,'title':'Lecture'},called))
    assert called == [True] and result == {'filename':'Lecture.mp4','duration':20}
    assert (tmp_path/'recording.mp4').stat().st_size == 5


def test_youtube_deadline_kills_group_and_cleans_fragments(monkeypatch,tmp_path):
    roots=[];killed=[]
    class Process:
        pid=876543;returncode=None
        def __init__(self,args,**kwargs):
            root=Path(args[-2]);roots.append(root)
            (root/'recording.f123.mp4.part').write_bytes(b'partial')
        def wait(self,timeout):
            if not killed: raise subprocess.TimeoutExpired('fake',timeout)
            return 0
    monkeypatch.setattr(imports.subprocess,'Popen',Process)
    monkeypatch.setattr(imports.os,'killpg',lambda pid,sig:killed.append(pid))
    clock=iter([0,601])
    monkeypatch.setattr(imports.time,'monotonic',lambda:next(clock))
    monkeypatch.setenv('YOUTUBE_IMPORT_TIMEOUT_SECONDS','600')
    with pytest.raises(imports.ImportFailure,match='timed out'):
        imports.download_youtube('https://youtu.be/IwV6EVPyYY0',tmp_path/'target.mp4',100)
    assert killed == [876543]
    assert not roots[0].exists()


def test_email_exhausted_crash_is_recovered(client,lecture,monkeypatch):
    monkeypatch.setattr(notifications,'enabled',lambda:True)
    monkeypatch.setattr(notifications,'send',lambda *a:pytest.fail('Must not send exhausted notice'))
    with SessionLocal() as db:
        db.add(EmailNotice(recording_id=lecture,email='a@example.com',status='sending',attempts=3,next_attempt=0))
        db.commit()
    assert not notifications.deliver_one()
    with SessionLocal() as db:
        row=db.get(EmailNotice,lecture)
        assert row.status=='failed' and row.email==''
