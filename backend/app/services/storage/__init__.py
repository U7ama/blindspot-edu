"""Explicit backend selection with durable keys and short-lived downloads."""
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
import os
import re
import shutil
import tempfile
import uuid

from backend.app.core.paths import STORAGE_DIR

class Storage:
    def __init__(self, backend):
        if backend not in ('local', 's3', 'r2'):
            raise ValueError('STORAGE_BACKEND must be local, s3, or r2')
        self.backend = backend
        self.bucket = os.getenv('S3_BUCKET_NAME' if backend == 's3' else 'R2_BUCKET_NAME', '')
        if backend != 'local' and not self.bucket:
            raise RuntimeError(f'{backend} bucket is not configured')

    @property
    def client(self):
        return cloud_client(self.backend)

    def path(self, key):
        if not re.fullmatch(r'[a-f0-9]{32}\.[a-z0-9]{1,8}', key):
            raise ValueError('Invalid storage key')
        path = (STORAGE_DIR / key).resolve()
        if not path.is_relative_to(STORAGE_DIR.resolve()):
            raise ValueError('Invalid storage path')
        return path

    def save(self, source, filename):
        ext = Path(filename).suffix.lower().lstrip('.')
        if not re.fullmatch(r'[a-z0-9]{1,8}', ext):
            raise ValueError('Invalid file extension')
        key = f'{uuid.uuid4().hex}.{ext}'
        if self.backend == 'local':
            shutil.copyfile(source, self.path(key))
        else:
            self.client.upload_file(str(source), self.bucket, key)
        return key

    @contextmanager
    def local_copy(self, key):
        self.path(key)  # validate keys for every backend
        if self.backend == 'local':
            yield self.path(key)
        else:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / key
                self.client.download_file(self.bucket, key, str(path))
                yield path

    def playback_url(self, key):
        self.path(key)
        if self.backend == 'local':
            return None  # API must authorize and serve the local file
        return self.client.generate_presigned_url('get_object', Params={'Bucket': self.bucket, 'Key': key}, ExpiresIn=300)

    def delete(self, key):
        path = self.path(key)
        if self.backend == 'local':
            path.unlink(missing_ok=True)
        else:
            self.client.delete_object(Bucket=self.bucket, Key=key)

@lru_cache(maxsize=2)
def cloud_client(backend):
    import boto3
    from botocore.config import Config
    params = {'region_name': os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION'), 'config': Config(signature_version='s3v4', connect_timeout=5, read_timeout=60, retries={'total_max_attempts': 2, 'mode': 'adaptive'})}
    if backend == 'r2':
        required = [os.getenv(k) for k in ('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_KEY')]
        if not all(required):
            raise RuntimeError('R2 credentials are not configured')
        params.update(endpoint_url=f'https://{required[0]}.r2.cloudflarestorage.com', aws_access_key_id=required[1], aws_secret_access_key=required[2], region_name='auto')
    return boto3.client('s3', **params)

def get_storage_adapter(backend=None):
    return Storage(backend or os.getenv('STORAGE_BACKEND', 'local'))
