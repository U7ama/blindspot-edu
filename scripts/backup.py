"""Consistent SQLite backup with an integrity-checked restore rehearsal."""
import argparse
import os
import sqlite3
import tempfile
from pathlib import Path

def backup(source, destination):
    if not source.exists():
        raise ValueError('Source database does not exist')
    with sqlite3.connect(f'file:{source}?mode=ro', uri=True) as src, sqlite3.connect(destination) as dst:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed')
    with tempfile.TemporaryDirectory() as directory:
        restored = Path(directory)/'restored.db'
        with sqlite3.connect(destination) as src, sqlite3.connect(restored) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Restore rehearsal failed')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path);parser.add_argument('destination',type=Path)
    parser.add_argument('--s3-bucket');parser.add_argument('--s3-key')
    args=parser.parse_args()
    backup(args.source,args.destination)
    if args.s3_bucket:
        if not args.s3_key:raise ValueError('--s3-key is required')
        import boto3
        boto3.client('s3', region_name=os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION')).upload_file(str(args.destination),args.s3_bucket,args.s3_key)
    print('Backup and temporary restore integrity verified')

if __name__=='__main__':main()
