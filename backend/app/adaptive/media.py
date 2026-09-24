import json
import os
import subprocess
import time
from .progress import report
from functools import lru_cache
from .contracts import Segment

ALLOWED = {'.wav', '.mp3', '.m4a', '.mp4', '.flac', '.ogg', '.aac', '.webm'}

def probe(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,mov,mp4,flac,ogg,aac,matroska,webm', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', str(path)], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError('Invalid or unsupported recording')
    info = json.loads(result.stdout)
    maximum = int(os.getenv('MAX_DURATION_SECONDS', '3600'))
    if not any(s.get('codec_type') == 'audio' for s in info.get('streams', [])):
        raise ValueError('Recording must contain audio and be within the duration limit')
    reported_duration = info.get('format', {}).get('duration')
    if reported_duration is None:
        # MediaRecorder WebM often has no duration header; measure bounded media timestamps.
        duration = 0
        for kind, selector in [('audio', '0:a'), ('video', '0:v')]:
            if not any(s.get('codec_type') == kind for s in info.get('streams', [])):
                continue
            measured = subprocess.run([
                'ffmpeg', '-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe',
                '-format_whitelist', 'wav,mp3,mov,mp4,flac,ogg,aac,matroska,webm',
                '-i', str(path), '-map', selector, '-t', str(maximum + 1),
                '-c', 'copy', '-f', 'null', '-', '-progress', 'pipe:1', '-nostats',
            ], capture_output=True, text=True, timeout=30)
            if measured.returncode:
                raise ValueError('Could not validate recording duration')
            duration = max(duration, max((int(line.split('=', 1)[1]) / 1_000_000
                           for line in measured.stdout.splitlines()
                           if line.startswith('out_time_us=') and line.split('=', 1)[1].lstrip('-').isdigit()), default=0))
    else:
        duration = float(reported_duration)
    if not 0 < duration <= maximum:
        raise ValueError('Recording must contain audio and be within the duration limit')
    return duration

@lru_cache(maxsize=1)
def whisper():
    from faster_whisper import WhisperModel
    threads = int(os.getenv('WHISPER_CPU_THREADS', str(min(4, os.cpu_count() or 1))))
    return WhisperModel(os.getenv('WHISPER_MODEL', 'base'), device='cpu', compute_type='int8', cpu_threads=threads, num_workers=1)

def transcribe(path, recording_id):
    report('transcribing', 'Loading the speech model and identifying spoken audio.')
    segments, info = whisper().transcribe(str(path), vad_filter=True)
    result, last = [], 0.0
    for i, segment in enumerate(segments):
        if segment.text.strip() and segment.end > segment.start:
            result.append(Segment(id=f'{recording_id}:s{i}', start=segment.start, end=segment.end, text=segment.text.strip()))
        if time.monotonic() - last >= 2:
            report('transcribing', 'Converting speech to timestamped transcript segments.', segment.end, info.duration, 'seconds')
            last = time.monotonic()
    return result
