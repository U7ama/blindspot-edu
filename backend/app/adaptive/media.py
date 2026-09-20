import json
import os
import subprocess
from functools import lru_cache
from .contracts import Segment

ALLOWED = {'.wav', '.mp3', '.m4a', '.mp4', '.flac', '.ogg', '.aac', '.webm'}

def probe(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,mov,flac,ogg,aac,matroska,webm', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', str(path)], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError('Invalid or unsupported recording')
    info = json.loads(result.stdout)
    duration = float(info.get('format', {}).get('duration', 0))
    if not 0 < duration <= int(os.getenv('MAX_DURATION_SECONDS', '3600')) or not any(s.get('codec_type') == 'audio' for s in info.get('streams', [])):
        raise ValueError('Recording must contain audio and be within the duration limit')
    return duration

@lru_cache(maxsize=1)
def whisper():
    from faster_whisper import WhisperModel
    return WhisperModel(os.getenv('WHISPER_MODEL', 'base'), device='cpu', compute_type='int8', cpu_threads=1, num_workers=1)

def transcribe(path, recording_id):
    segments, _ = whisper().transcribe(str(path), vad_filter=True)
    return [Segment(id=f'{recording_id}:s{i}', start=s.start, end=s.end, text=s.text.strip()) for i, s in enumerate(segments) if s.text.strip() and s.end > s.start]
