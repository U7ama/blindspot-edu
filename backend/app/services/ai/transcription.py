"""
backend/app/services/ai/transcription.py

Turns a raw uploaded file (audio OR video) into a list of TranscriptSegment objects:

    1. If the upload is video, extracts the audio track using FFmpeg.
    2. Runs faster-whisper on the audio to generate timestamped segments.
    3. Normalizes the output into TranscriptSegment (schemas) so downstream layers
       don't need to depend directly on the underlying ASR model engine.

Requires: faster-whisper, ffmpeg-python, boto3
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile

import boto3
from faster_whisper import WhisperModel

# Clean application schema imports from the new structure
from backend.app.schemas.schemas import TranscriptSegment

# Extensions treated as "audio-only" — everything else is processed via FFmpeg
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"}

# Loaded once per process to avoid heavy reload overhead per API request
_MODEL_SIZE = "base"
_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    """Lazy loads and caches the WhisperModel instance."""
    global _model
    if _model is None:
        # compute_type="int8" keeps CPU execution efficient on dev environments.
        # Switch to device="cuda" + compute_type="float16" for GPU production instances.
        _model = WhisperModel(_MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


def _is_video(file_path: str) -> bool:
    """Checks if the given file extension represents a video file."""
    return Path(file_path).suffix.lower() not in AUDIO_EXTENSIONS


def _is_local_path(ref: str) -> bool:
    """Checks if the reference string is a local file system path vs an R2 object key."""
    return bool(re.match(r"^[A-Za-z]:[\\/]", ref)) or ref.startswith(("/", "\\")) or Path(ref).exists()


def _download_from_r2(object_key: str) -> str:
    """Downloads an object key from Cloudflare R2 to a temporary local file.

    Returns the path to the temp file (caller must handle deletion).
    """
    account_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    access_key = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("R2_SECRET_KEY", "").strip()
    bucket_name = os.getenv("R2_BUCKET_NAME", "blindspot-storage").strip()

    if not account_id or not access_key or not secret_key:
        raise RuntimeError(
            "R2 credentials not configured. Please set R2_ACCOUNT_ID, "
            "R2_ACCESS_KEY_ID, and R2_SECRET_KEY in your environment."
        )

    s3_client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    ext = Path(object_key).suffix or ".bin"
    temp_file = NamedTemporaryFile(suffix=ext, delete=False)
    temp_path = temp_file.name
    temp_file.close()

    try:
        s3_client.download_file(bucket_name, object_key, temp_path)
    except Exception as e:
        raise RuntimeError(f"Failed to download audio object from R2: {e}")

    return temp_path


def _extract_audio(video_path: str) -> str:
    """Extracts the audio stream from a video file into a 16kHz mono WAV file."""
    out_file = NamedTemporaryFile(suffix=".wav", delete=False)
    out_path = out_file.name
    out_file.close()

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        out_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr}")

    return out_path


def transcribe(audio_ref: str, lecture_id: int) -> list[TranscriptSegment]:
    """Transcribes a lecture recording into timestamped segments.

    Args:
        audio_ref: Either a local file path or a Cloudflare R2 object key.
        lecture_id: ID of the lecture being processed.

    Returns:
        List of structured TranscriptSegment instances sorted chronologically.
    """
    local_path = audio_ref
    downloaded_path: str | None = None
    extracted_path: str | None = None

    try:
        # Download from R2 if reference is not a local filesystem path
        if not _is_local_path(audio_ref):
            downloaded_path = _download_from_r2(audio_ref)
            local_path = downloaded_path

        # Convert video tracks to wav audio
        if _is_video(local_path):
            extracted_path = _extract_audio(local_path)
            local_path = extracted_path

        # Run model inference
        model = _get_model()
        segments, _info = model.transcribe(
            local_path,
            word_timestamps=False,
            vad_filter=True,
        )

        return [
            TranscriptSegment(
                lecture_id=lecture_id,
                start=seg.start,
                end=seg.end,
                text=seg.text.strip(),
                speaker=None,
            )
            for seg in segments
        ]

    finally:
        # Clean up transient temporary files
        if downloaded_path is not None:
            Path(downloaded_path).unlink(missing_ok=True)
        if extracted_path is not None:
            Path(extracted_path).unlink(missing_ok=True)


def transcribe_audio_snippet(audio_path: str) -> str:
    """Transcribes a short audio file (e.g. WhatsApp voice note) to clean text.
    
    Args:
        audio_path: Local filesystem path to the audio file.
        
    Returns:
        Transcribed speech text string.
    """
    model = _get_model()
    segments, _info = model.transcribe(
        audio_path,
        word_timestamps=False,
        vad_filter=True,
    )
    texts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
    return " ".join(texts).strip()