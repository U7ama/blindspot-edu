import pytest

from backend.app.adaptive.notifications import enabled


@pytest.mark.parametrize('environment,url,expected', [
    ('development', 'http://localhost:3000', True),
    ('development', 'http://127.0.0.1:3000', True),
    ('development', 'http://[::1]:3000', True),
    ('development', 'http://example.com', False),
    ('production', 'http://localhost:3000', False),
    ('production', 'http://blindspot-edu.online', False),
    ('production', 'https://blindspot-edu.online', True),
    ('development', 'http://name:password@localhost:3000', False),
    ('development', 'http://localhost:3000?token=value', False),
    ('development', 'http://localhost:3000#fragment', False),
])
def test_email_lesson_urls_are_local_only_in_development(monkeypatch, environment, url, expected):
    monkeypatch.setenv('APP_ENV', environment)
    monkeypatch.setenv('PUBLIC_APP_URL', url)
    monkeypatch.setenv('NOTIFICATION_EMAIL_PROVIDER', 'ses')
    monkeypatch.setenv('SES_FROM_EMAIL', 'notifications@example.com')
    assert bool(enabled()) is expected


def test_local_url_still_requires_explicit_email_configuration(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'development')
    monkeypatch.setenv('PUBLIC_APP_URL', 'http://localhost:3000')
    monkeypatch.setenv('NOTIFICATION_EMAIL_PROVIDER', 'disabled')
    monkeypatch.setenv('SES_FROM_EMAIL', 'notifications@example.com')
    assert not enabled()
    monkeypatch.setenv('NOTIFICATION_EMAIL_PROVIDER', 'ses')
    monkeypatch.delenv('SES_FROM_EMAIL')
    assert not enabled()
