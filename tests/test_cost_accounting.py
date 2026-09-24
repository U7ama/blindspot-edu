from types import SimpleNamespace
import httpx
import pytest
from openai import APITimeoutError
from backend.app.adaptive.budget import reserve, reconcile, AllowanceExceeded
from backend.app.adaptive.models import Usage
from backend.app.core.db import SessionLocal
from backend.app.services.ai import llm


def rows():
    with SessionLocal() as db:
        return db.query(Usage).all()


def setup_client(monkeypatch, create):
    monkeypatch.setenv('LLM_INPUT_USD_PER_MILLION', '3')
    monkeypatch.setenv('LLM_OUTPUT_USD_PER_MILLION', '15')
    monkeypatch.setenv('LLM_MAX_RETRIES', '3')
    monkeypatch.setenv('AI_LEARNER_ALLOWANCE_USD', '1')
    monkeypatch.setattr(llm.time, 'sleep', lambda _: None)
    monkeypatch.setattr(llm, '_get_client', lambda: SimpleNamespace(chat=SimpleNamespace(
        completions=SimpleNamespace(create=create))))


def test_success_releases_unused_reservation(monkeypatch):
    setup_client(monkeypatch, lambda **_: SimpleNamespace(
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20)))
    llm._compatible_completion(1000, max_tokens=100)
    assert len(rows()) == 1
    assert rows()[0].reserved_usd == pytest.approx(.00033)


def test_all_four_timeout_attempts_reserved(monkeypatch):
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        raise APITimeoutError(request=httpx.Request('POST', 'https://example.invalid'))
    setup_client(monkeypatch, create)
    with pytest.raises(APITimeoutError):
        llm._compatible_completion(1000, max_tokens=100)
    assert len(calls) == len(rows()) == 4
    assert sum(r.reserved_usd for r in rows()) == pytest.approx(.018)


def test_allowance_blocks_retry_before_network(monkeypatch):
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        raise APITimeoutError(request=httpx.Request('POST', 'https://example.invalid'))
    setup_client(monkeypatch, create)
    monkeypatch.setenv('AI_LEARNER_ALLOWANCE_USD', '.005')
    with pytest.raises(AllowanceExceeded):
        llm._compatible_completion(1000, max_tokens=100)
    assert len(calls) == 1


def test_missing_usage_keeps_estimate(monkeypatch):
    setup_client(monkeypatch, lambda **_: SimpleNamespace())
    llm._compatible_completion(1000, max_tokens=100)
    assert rows()[0].reserved_usd == pytest.approx(.0045)


def test_reconciliation_is_idempotent(monkeypatch):
    setup_client(monkeypatch, None)
    key = reserve('llm', 1000, 100, attempts=1)
    reconcile(key, 10, 20)
    reconcile(key, 10, 20)
    assert rows()[0].reserved_usd == pytest.approx(.00033)
