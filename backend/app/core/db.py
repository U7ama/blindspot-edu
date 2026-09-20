"""Additive schema initialization; configured database failures never fall back."""
import os
import sqlite3
import time
from pathlib import Path
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./blindspot.db').replace('postgres://', 'postgresql://', 1)
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False, 'timeout': 30} if DATABASE_URL.startswith('sqlite') else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
Base = declarative_base()

if DATABASE_URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def sqlite_settings(connection, _):
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=30000')

def get_db():
    with SessionLocal() as db:
        yield db

def init_db():
    from backend.app.model import models
    from backend.app.adaptive import models as adaptive_models
    # New tables only. Back up pre-existing SQLite databases before this migration.
    missing = set(Base.metadata.tables) - set(inspect(engine).get_table_names())
    path = engine.url.database
    if missing and engine.dialect.name == 'sqlite' and path and path != ':memory:' and Path(path).exists() and Path(path).stat().st_size:
        backup = Path(path).with_suffix(f'.pre-v2-{int(time.time())}.db')
        with sqlite3.connect(path) as src, sqlite3.connect(backup) as dst:
            src.backup(dst)
    if missing and engine.dialect.name != 'sqlite' and os.getenv('MIGRATION_BACKUP_CONFIRMED') != 'true':
        raise RuntimeError('Back up the configured database and set MIGRATION_BACKUP_CONFIRMED=true before additive migration')
    Base.metadata.create_all(engine)
