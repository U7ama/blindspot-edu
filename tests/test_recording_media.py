import json
import subprocess
from pathlib import Path

import pytest

from backend.app.adaptive.media import probe
from backend.app.adaptive.models import Job
from backend.app.core.db import SessionLocal


def browser_webm(video=False, audio=True, duration=2):
    args = ['ffmpeg', '-v', 'error', '-nostdin']
    if video:
        args += ['-f', 'lavfi', '-i', 'color=size=640x480:rate=15:color=black']
    if audio:
        args += ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000']
    args += ['-t', str(duration)]
    if video:
        args += ['-c:v', 'libvpx', '-b:v', '450k', '-deadline', 'realtime']
    if audio:
        args += ['-c:a', 'libopus', '-b:a', '64k', '-ac', '1']
    return subprocess.run(args + ['-f', 'webm', '-live', '1', 'pipe:1'], capture_output=True, check=True, timeout=30).stdout


@pytest.mark.parametrize('video', [False, True])
def test_browser_webm_without_duration_uploads_through_existing_pipeline(client, tmp_path, video):
    media = browser_webm(video=video)
    file = tmp_path / 'browser.webm'
    file.write_bytes(media)
    info = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(file)], capture_output=True, text=True, check=True)
    assert 'duration' not in json.loads(info.stdout)['format']
    assert 1.8 < probe(file) < 2.2
    client.post('/api/v1/invite', json={'code': 'test-invitation'})
    result = client.post('/api/v1/recordings?filename=browser.webm', content=media)
    assert result.status_code == 202, result.text
    rid = result.json()['id']
    assert result.json()['status'] == 'queued'
    assert client.get(f'/api/v1/recordings/{rid}/media').content == media
    with SessionLocal() as db:
        assert db.query(Job).filter_by(recording_id=rid, status='queued').count() == 1
    client.cookies.clear()
    assert client.get(f'/api/v1/recordings/{rid}/media').status_code == 404


def test_browser_webm_duration_limit_still_enforced(client, monkeypatch):
    client.post('/api/v1/invite', json={'code': 'test-invitation'})
    monkeypatch.setenv('MAX_DURATION_SECONDS', '1')
    result = client.post('/api/v1/recordings?filename=long.webm', content=browser_webm(duration=3))
    assert result.status_code == 400
    with SessionLocal() as db:
        assert db.query(Job).count() == 0


def test_video_outlasting_audio_still_obeys_duration_limit(client, monkeypatch):
    encoded = subprocess.run([
        'ffmpeg', '-v', 'error', '-nostdin',
        '-f', 'lavfi', '-i', 'color=size=320x240:rate=15:duration=4',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.5',
        '-c:v', 'libvpx', '-deadline', 'realtime', '-c:a', 'libopus',
        '-f', 'webm', '-live', '1', 'pipe:1',
    ], capture_output=True, check=True, timeout=30).stdout
    client.post('/api/v1/invite', json={'code': 'test-invitation'})
    monkeypatch.setenv('MAX_DURATION_SECONDS', '1')
    result = client.post('/api/v1/recordings?filename=long-video.webm', content=encoded)
    assert result.status_code == 400


def test_silent_video_without_audio_track_is_rejected(client):
    client.post('/api/v1/invite', json={'code': 'test-invitation'})
    result = client.post('/api/v1/recordings?filename=silent.webm', content=browser_webm(video=True, audio=False))
    assert result.status_code == 400


def test_missing_duration_measurement_has_bounded_runtime(monkeypatch, tmp_path):
    from backend.app.adaptive import media
    calls = []
    def run(args, **kwargs):
        calls.append((args, kwargs))
        if args[0] == 'ffprobe':
            return subprocess.CompletedProcess(args, 0, json.dumps({'format': {}, 'streams': [{'codec_type': 'audio'}]}), '')
        raise subprocess.TimeoutExpired(args, kwargs['timeout'])
    monkeypatch.setattr(media.subprocess, 'run', run)
    monkeypatch.setenv('MAX_DURATION_SECONDS', '60')
    with pytest.raises(subprocess.TimeoutExpired):
        probe(tmp_path / 'bounded.webm')
    args, options = calls[-1]
    assert options['timeout'] == 30
    assert args[args.index('-t') + 1] == '61'
    assert args[args.index('-protocol_whitelist') + 1] == 'file,pipe'


@pytest.mark.parametrize('output', ['', 'out_time_us=N/A\n', 'out_time_us=0\n'])
def test_unmeasurable_browser_recording_rejected(monkeypatch, output):
    from backend.app.adaptive import media
    def run(args, **kwargs):
        payload = json.dumps({'format': {}, 'streams': [{'codec_type': 'audio'}]}) if args[0] == 'ffprobe' else output
        return subprocess.CompletedProcess(args, 0, payload, '')
    monkeypatch.setattr(media.subprocess, 'run', run)
    with pytest.raises(ValueError):
        probe(Path('invalid.webm'))
