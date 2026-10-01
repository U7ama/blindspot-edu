import os
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = Path(os.getenv('DATA_DIR', str(BACKEND_DIR / 'private_data'))).resolve()
STORAGE_DIR = DATA_DIR / 'media'
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
