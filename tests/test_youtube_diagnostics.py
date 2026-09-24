import pytest
from backend.app.adaptive.youtube_import import perform, Rejected, QuietLog, classify_error

@pytest.mark.parametrize('message,expected',[("cookies have expired or been rotated",'cookies_expired'),("Sign in to confirm you're not a bot",'bot_challenge'),('HTTP Error 403','access_denied'),('Private video','login_required'),('Requested format is not available','format'),('secret signed URL','unavailable')])
def test_classification_has_no_provider_payload(message,expected):
    assert classify_error(message)==expected

def test_public_mode_ignores_existing_cookie_file(tmp_path,monkeypatch):
    cookie=tmp_path/'cookies';cookie.write_text('secret')
    monkeypatch.setenv('YOUTUBE_COOKIES_FILE',str(cookie))
    monkeypatch.delenv('YOUTUBE_USE_ACCOUNT_COOKIES',raising=False)
    def factory(options):
        assert 'cookiefile' not in options
        raise RuntimeError("Sign in to confirm you're not a bot")
    with pytest.raises(Rejected,match='bot_challenge'):perform('url',tmp_path,100,factory)

def test_explicit_cookie_mode_requires_file(tmp_path,monkeypatch):
    monkeypatch.setenv('YOUTUBE_USE_ACCOUNT_COOKIES','true')
    monkeypatch.setenv('YOUTUBE_COOKIES_FILE',str(tmp_path/'missing'))
    with pytest.raises(Rejected,match='cookies_missing'):perform('url',tmp_path,100,lambda _:None)
