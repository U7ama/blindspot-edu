"""
backend/storage_local.py

Fallback local-disk storage adapter for testing or development.
Use this if you want to test the pipeline without R2 credentials.

this has the same interface as storage_r2.py —
it can be swapped between them by just changing which one n be import
in transcription.py or test_pipeline.py. No other code changes needed.

To use instead of R2:
    from backend.storage_local import save, get_url
    
instead of:
    from backend.storage import save, get_url
"""

import shutil
import uuid
from pathlib import Path

from backend.app.core.paths import STORAGE_DIR



def save(source_path: str, original_filename: str) -> str:
    """Copies a file into local storage and returns a stable reference to it.

    Args:
        source_path: Where the uploaded file currently lives.
        original_filename: The original filename — kept to preserve the extension.

    Returns:
        A local file path string (for dev), which doubles as a reference that
        get_url() can turn into something usable.
    """
    ext = Path(original_filename).suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = STORAGE_DIR / stored_name

    shutil.copy(source_path, dest_path)

    return str(dest_path)


def get_url(stored_ref: str) -> str:
    """Resolves a stored reference back into something accessible.

    For local disk, save() already returns a usable path, so this is a no-op.
    """
    return stored_ref


def delete(stored_ref: str) -> None:
    """Deletes a file from local storage.

    Optional utility for cleanup; not required by the core pipeline.
    """
    try:
        Path(stored_ref).unlink(missing_ok=True)
    except Exception as e:
        raise RuntimeError(f"Failed to delete local file: {e}")