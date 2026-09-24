"""Bounded public media import. HTTPS sockets are pinned to validated public IPs."""
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import ssl
import http.client
import subprocess
import sys
import signal
import shutil
import tempfile
import time
from urllib.parse import urlsplit, urlunsplit, parse_qs, urljoin, unquote
from sqlalchemy import text
from backend.app.core.db import SessionLocal
from backend.app.services.storage import get_storage_adapter
from .models import ImportSource, Recording, Job
from .media import ALLOWED, probe
from .progress import report


class ImportFailure(ValueError):
    pass


def validate_url(url):
    try:
        p = urlsplit(url)
        if (len(url) > 4096 or any(ord(c) < 33 for c in url) or p.scheme != 'https'
                or not p.hostname or p.username or p.password or p.port not in (None, 443)):
            raise ValueError()
        host = p.hostname.encode('idna').decode('ascii').lower()
        if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError()
        return p, host
    except (ValueError, UnicodeError):
        raise ImportFailure('Use a public HTTPS media URL without credentials or a custom port.') from None


def classify_url(url):
    p, host = validate_url(url)
    if host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'):
        if host == 'youtu.be':
            video_id = p.path.strip('/')
        elif p.path == '/watch':
            video_id = parse_qs(p.query).get('v', [''])[0]
        elif p.path.startswith(('/shorts/', '/embed/')):
            video_id = p.path.split('/')[2]
        else:
            video_id = ''
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
            raise ImportFailure('Use a single YouTube video link, not a channel or playlist.')
        return 'youtube', 'https://www.youtube.com/watch?v=' + video_id
    if Path(unquote(p.path)).suffix.lower() not in ALLOWED:
        raise ImportFailure('Use a direct MP4, WebM or audio file URL, or a YouTube video link.')
    return 'direct', urlunsplit((p.scheme, p.netloc, p.path, p.query, ''))


def public_ip(host):
    try:
        addresses = list(dict.fromkeys(a[4][0] for a in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)))
    except socket.gaierror:
        raise ImportFailure('The media host could not be resolved.') from None
    if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
        raise ImportFailure('Private, local and reserved network addresses are not supported.')
    return addresses[0]


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=20, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # Never resolve again at connect time (DNS rebinding); preserve TLS hostname checks.
        raw = socket.create_connection((self.address, 443), timeout=self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def download(url, target, maximum):
    deadline = time.monotonic() + 600
    for _ in range(6):
        p, host = validate_url(url)
        conn = PinnedHTTPS(host, public_ip(host))
        try:
            conn.request('GET', urlunsplit(('', '', p.path or '/', p.query, '')),
                         headers={'User-Agent': 'BlindspotEdu/1.0', 'Accept-Encoding': 'identity'})
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location:
                    raise ImportFailure('The media server returned an invalid redirect.')
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise ImportFailure('The media server refused the download. Use a public link or upload the file.')
            if response.getheader('Content-Encoding', 'identity') != 'identity':
                raise ImportFailure('Compressed HTTP downloads are unsupported; use a direct media link.')
            try:
                declared = int(response.getheader('Content-Length', '0'))
            except ValueError:
                raise ImportFailure('The media server returned an invalid file size.') from None
            if declared > maximum:
                raise ImportFailure('Linked recording exceeds the upload size limit.')
            size, last = 0, 0.0
            with open(target, 'wb') as output:
                while True:
                    if time.monotonic() > deadline:
                        raise ImportFailure('Download timed out. Try uploading the recording instead.')
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > maximum:
                        raise ImportFailure('Linked recording exceeds the upload size limit.')
                    output.write(chunk)
                    if time.monotonic() - last >= 2:
                        report('downloading', 'Downloading your recording securely.', size, declared or None, 'bytes')
                        last = time.monotonic()
            if not size:
                raise ImportFailure('The linked recording is empty.')
            return
        except (OSError, http.client.HTTPException):
            raise ImportFailure('The media download was interrupted or its secure connection failed.') from None
        finally:
            conn.close()
    raise ImportFailure('The link redirected too many times.')


def download_youtube(url, target, maximum):
    """Supervise extraction, downloads and FFmpeg together with a hard deadline."""
    kind, url = classify_url(url)
    if kind != 'youtube':
        raise ImportFailure('Use a single YouTube video link.')
    timeout = max(30, min(int(os.getenv('YOUTUBE_IMPORT_TIMEOUT_SECONDS', '600')), 1800))
    report('downloading', 'Checking YouTube availability, duration and video formats.')
    with tempfile.TemporaryDirectory(prefix='blindspot-youtube-') as directory:
        root = Path(directory)
        process = subprocess.Popen(
            [sys.executable, '-m', 'backend.app.adaptive.youtube_import', url, directory, str(maximum)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
            cwd=Path(__file__).resolve().parents[3])
        deadline = time.monotonic() + timeout
        last_progress = None
        try:
            while True:
                if time.monotonic() >= deadline:
                    raise ImportFailure('YouTube import timed out. Try uploading the recording instead.')
                # During merging the source streams and final file coexist.
                scratch_size = 0
                for part in root.iterdir():
                    try:
                        if part.is_file():
                            scratch_size += part.stat().st_size
                    except FileNotFoundError:
                        pass  # yt-dlp can rename a completed fragment between these reads.
                if scratch_size > maximum * 2 + 2 * 1024 * 1024:
                    raise ImportFailure('YouTube download exceeds the temporary storage limit.')
                try:
                    progress = json.loads((root / 'progress.json').read_text())
                    if progress != last_progress:
                        report('downloading', 'Downloading and preparing the YouTube video.',
                               progress['current'], progress.get('total'), 'bytes')
                        last_progress = progress
                except (FileNotFoundError, json.JSONDecodeError):
                    pass
                try:
                    process.wait(timeout=0.25)
                    break
                except subprocess.TimeoutExpired:
                    continue
            try:
                result = json.loads((root / 'result.json').read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                raise ImportFailure('YouTube import failed. Check yt-dlp and FFmpeg installation or upload a file.') from None
            if process.returncode or result.get('error'):
                messages = {
                    'cookies_expired': 'YouTube rejected the configured account session. Upload the recording file or use a direct media link.',
                    'cookies_missing': 'YouTube account mode is enabled but its cookie file is missing. Upload a file or contact support.',
                    'bot_challenge': 'YouTube requires browser verification for this server. Automatic import is unavailable; upload the recording file or use a direct media link.',
                    'access_denied': 'YouTube denied media access from this server. Upload the recording file or use a direct media link.',
                    'login_required': 'This video requires YouTube account access. Upload a recording you have permission to use instead.',
                    'duration': 'YouTube recording exceeds the duration limit or has no known duration.',
                    'live': 'Use a completed recording rather than a live or upcoming stream.',
                    'size': 'Linked recording exceeds the upload size limit.',
                    'format': 'No supported MP4 video with audio is available. Upload a compatible file instead.',
                }
                raise ImportFailure(messages.get(result.get('error'),
                    'YouTube could not provide a downloadable recording. It may be private, restricted or temporarily blocked.'))
            output = root / 'recording.mp4'
            if not output.is_file() or not 0 < output.stat().st_size <= maximum:
                raise ImportFailure('The imported video is empty or exceeds the upload size limit.')
            shutil.copyfile(output, target)
            return result['filename'], result['duration']
        finally:
            # Kill our entire process group, including FFmpeg, on success or failure.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)


def import_recording(rid, jid, attempt):
    with SessionLocal() as db:
        source = db.get(ImportSource, rid)
        if not source:
            raise ImportFailure('No import source was saved.')
        kind, url = source.kind, source.url
    maximum = int(os.getenv('MAX_UPLOAD_BYTES', '104857600'))
    storage = get_storage_adapter()
    if kind == 'youtube':
        with tempfile.NamedTemporaryFile(suffix='.mp4') as temp:
            filename, duration = download_youtube(url, temp.name, maximum)
            report('validating', 'Checking the recording format, audio track and duration.')
            try:
                duration = probe(temp.name) or duration
            except (ValueError, subprocess.TimeoutExpired):
                raise ImportFailure('The download is not supported audio/video, or exceeds the duration limit.') from None
            key = storage.save(temp.name, filename)
    else:
        filename = Path(unquote(urlsplit(url).path)).name[:180]
        report('downloading', 'Downloading your recording securely.')
        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix) as temp:
            download(url, temp.name, maximum)
            report('validating', 'Checking the recording format, audio track and duration.')
            try:
                duration = probe(temp.name)
            except (ValueError, subprocess.TimeoutExpired):
                raise ImportFailure('The download is not supported audio/video, or exceeds the duration limit.') from None
            key = storage.save(temp.name, filename)
    try:
        with SessionLocal() as db:
            db.execute(text('BEGIN IMMEDIATE'))
            job, rec = db.get(Job, jid), db.get(Recording, rid)
            if job.status != 'running' or job.attempts != attempt:
                raise ImportFailure('Import interrupted; a newer worker owns this recording.')
            rec.object_key, rec.storage_backend = key, storage.backend
            rec.duration, rec.title = duration, filename
            db.get(ImportSource, rid).url = ''  # Remove potentially signed URLs after saving media.
            db.commit()
    except Exception:
        storage.delete(key)
        raise
    return storage.backend, key
