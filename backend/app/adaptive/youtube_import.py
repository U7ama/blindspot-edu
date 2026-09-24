"""Isolated yt-dlp/FFmpeg job, supervised by imports.download_youtube."""
import json
import os
from pathlib import Path
import re
import sys
import time


class Rejected(Exception):
    pass


def classify_error(message):
    # Return fixed categories only; never persist URLs, cookies or provider payloads.
    text = str(message).lower()
    if 'cookies' in text and any(word in text for word in ('expired', 'rotated', 'invalid')):
        return 'cookies_expired'
    if 'not a bot' in text or 'confirm you' in text:
        return 'bot_challenge'
    if 'po token' in text or 'http error 403' in text:
        return 'access_denied'
    if any(word in text for word in ('private video', 'sign in', 'age-restricted', 'members-only')):
        return 'login_required'
    if 'requested format' in text:
        return 'format'
    return 'unavailable'


class QuietLog:
    # Retain only a fixed diagnostic category, never the original message.
    def __init__(self): self.category = 'unavailable'
    def debug(self, message): pass
    def info(self, message): pass
    def warning(self, message):
        category = classify_error(message)
        if category != 'unavailable': self.category = category
    def error(self, message): self.warning(message)


def write_json(path, data):
    temp = path.with_suffix('.writing')
    temp.write_text(json.dumps(data))
    temp.replace(path)


def validate_metadata(info, maximum):
    if not info or info.get('_type', 'video') != 'video':
        raise Rejected('format')
    if info.get('is_live') or info.get('live_status') in ('is_live', 'is_upcoming', 'post_live'):
        raise Rejected('live')
    duration = float(info.get('duration') or 0)
    if not 0 < duration <= int(os.getenv('MAX_DURATION_SECONDS', '3600')):
        raise Rejected('duration')
    formats = info.get('requested_formats') or [info]
    if sum(f.get('filesize') or 0 for f in formats) > maximum:
        raise Rejected('size')
    return duration


def perform(url, directory, maximum, factory=None):
    if factory is None:
        from yt_dlp import YoutubeDL
        factory = YoutubeDL
    root = Path(directory)
    downloaded = {}
    last = 0.0

    def hook(event):
        nonlocal last
        if event.get('status') not in ('downloading', 'finished'):
            return
        name = event.get('filename') or event.get('tmpfilename') or 'stream'
        downloaded[name] = max(downloaded.get(name, 0), event.get('downloaded_bytes') or 0)
        count = sum(downloaded.values())
        if count > maximum:
            raise Rejected('size')
        now = time.monotonic()
        if now - last >= 1.5:
            write_json(root / 'progress.json', {'current': count, 'total': None})
            last = now

    options = {
        # H.264/AAC MP4 avoids labelling arbitrary AV1/Opus combinations universally playable.
        'format': 'bestvideo[height<=480][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a][acodec^=mp4a]/best[height<=480][ext=mp4][vcodec^=avc1][acodec^=mp4a]',
        'outtmpl': str(root / 'recording.%(ext)s'),
        'merge_output_format': 'mp4', 'noplaylist': True,
        'allowed_extractors': ['youtube'], 'proxy': '',
        'socket_timeout': 15, 'retries': 1, 'fragment_retries': 1, 'extractor_retries': 1,
        'max_filesize': maximum, 'concurrent_fragment_downloads': 1,
        'quiet': True, 'no_warnings': True, 'logger': QuietLog(),
        'progress_hooks': [hook],
    }
    cookie_path = os.getenv('YOUTUBE_COOKIES_FILE', '/var/lib/blindspot/youtube_cookies.txt')
    # Public imports do not depend on an administrator's Google session.
    if os.getenv('YOUTUBE_USE_ACCOUNT_COOKIES', 'false').lower() == 'true':
        if not os.path.isfile(cookie_path):
            raise Rejected('cookies_missing')
        options['cookiefile'] = cookie_path
    import shutil
    node_path = shutil.which('node') or '/usr/bin/node'
    if os.path.isfile(node_path):
        options['js_runtimes'] = {'node': {'path': node_path}}
    try:
        with factory(options) as downloader:
            # Metadata is checked BEFORE downloading either stream.
            info = downloader.extract_info(url, download=False)
            duration = validate_metadata(info, maximum)
            downloader.process_info(info)
    except Rejected:
        raise
    except Exception as exc:
        category = classify_error(exc)
        if options['logger'].category == 'cookies_expired' or category == 'unavailable':
            category = options['logger'].category
        raise Rejected(category) from None
    output = root / 'recording.mp4'
    if not output.is_file() or not 0 < output.stat().st_size <= maximum:
        raise Rejected('size')
    title = re.sub(r'[^\w .()-]', '', info.get('title') or 'YouTube lecture')[:150]
    return {'filename': (title or 'YouTube lecture') + '.mp4', 'duration': duration}


def main():
    url, directory, limit = sys.argv[1:]
    code = 0
    try:
        result = perform(url, directory, int(limit))
    except Rejected as exc:
        result, code = {'error': str(exc)}, 1
    except Exception:
        result, code = {'error': 'unavailable'}, 1
    write_json(Path(directory) / 'result.json', result)
    return code


if __name__ == '__main__':
    sys.exit(main())
