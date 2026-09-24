"""Import only the reviewed public sample export; no learner history is migrated."""
import json
from pathlib import Path
from dotenv import load_dotenv
load_dotenv('/etc/blindspot.env')
from backend.app.core.db import init_db, SessionLocal
from backend.app.adaptive.models import Learner, Recording
from backend.app.adaptive.contracts import Document
init_db()
rows=json.loads(Path('/var/lib/blindspot/samples.json').read_text())
with SessionLocal() as db:
    if not db.get(Learner,'administrator'):
        db.add(Learner(id='administrator',invited=True,preferences={'voice':'Joanna','language':'English'}))
    for row in rows:
        Document.model_validate(row['document'])
        if not row['public'] or row['status']!='ready':
            raise ValueError('Only reviewed ready public samples are accepted')
        if not db.get(Recording,row['id']):
            db.add(Recording(**row))
    db.commit()
print('Imported public samples:',len(rows))
