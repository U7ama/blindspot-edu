"""
backend/storage.py (R2 — revised)


Cloudflare R2 storage adapter using boto3. This version:
- Uploads files to R2 and returns an object key (not a public URL)
- Let transcription.py read directly from R2 using boto3 credentials
- Avoids the public-URL auth hassle entirely

The save()/get_url() interface stays the same — nothing downstream changes.

pip install boto3 required
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[4] / ".env")

import boto3
from botocore.client import Config

ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "").strip()
ACCESS_KEY = os.getenv("R2_ACCESS_KEY_ID", "").strip()
SECRET_KEY = os.getenv("R2_SECRET_KEY", "").strip()
BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "blindspot-storage").strip()

if not ACCOUNT_ID or not ACCESS_KEY or not SECRET_KEY:
    raise RuntimeError(
        "R2 credentials not configured. Set R2_ACCOUNT_ID, "
        "R2_ACCESS_KEY_ID, R2_SECRET_KEY environment variables."
    )

ENDPOINT_URL = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"

s3_client = boto3.client(
    "s3",
    endpoint_url=ENDPOINT_URL,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)


def _ensure_bucket_exists():
    """Creates the bucket if it doesn't exist."""
    try:
        s3_client.head_bucket(Bucket=BUCKET_NAME)
    except s3_client.exceptions.NoSuchBucket:
        s3_client.create_bucket(Bucket=BUCKET_NAME)
    except Exception as e:
        raise RuntimeError(f"Failed to check/create R2 bucket: {e}")


def save(source_path: str, original_filename: str) -> str:
    """Uploads a file to R2 and returns an object key.

    Args:
        source_path: Local file path to upload.
        original_filename: Original filename — used to derive the object key.

    Returns:
        An R2 object key (not a URL). This is what transcription.py uses
        to read the file back. Format: "uuid.ext"
    """
    _ensure_bucket_exists()

    import uuid
    ext = Path(original_filename).suffix
    object_key = f"{uuid.uuid4().hex}{ext}"

    with open(source_path, "rb") as f:
        s3_client.upload_fileobj(
            f,
            BUCKET_NAME,
            object_key,
            ExtraArgs={"ContentType": "application/octet-stream"},
        )

    # Return just the object key, not a URL
    return object_key


def get_url(stored_ref: str) -> str:
    """Resolves an R2 object key back into a downloadable URL.
    """
    # This is what the public URL *would* be if bucket were public-readable
    # For actual downloads during transcription, transcription.py reads
    # directly from R2 using boto3 instead.
    return f"https://pub-{ACCOUNT_ID}.r2.dev/{stored_ref}"


def delete(stored_ref: str) -> None:
    """Deletes an object from R2 by its key."""
    _ensure_bucket_exists()
    try:
        s3_client.delete_object(Bucket=BUCKET_NAME, Key=stored_ref)
    except Exception as e:
        raise RuntimeError(f"Failed to delete R2 object: {e}")