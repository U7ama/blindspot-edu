"""Local operator commands. Never exposed as HTTP endpoints."""
import argparse
import csv
import json
import os
import uuid
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1]/'.env')
from backend.app.core.db import init_db, SessionLocal
from backend.app.adaptive.models import Recording, Job, Learner, Attempt, LearningState
from backend.app.adaptive.contracts import Document
from backend.app.adaptive.media import probe
from backend.app.services.storage import get_storage_adapter

def main():
    parser=argparse.ArgumentParser()
    commands=parser.add_subparsers(dest='command',required=True)
    imp=commands.add_parser('import-recording')
    imp.add_argument('path',type=Path);imp.add_argument('--title',required=True);imp.add_argument('--permission-note',required=True)
    pub=commands.add_parser('publish-sample')
    pub.add_argument('id');pub.add_argument('--permission-note',required=True);pub.add_argument('--reviewed',action='store_true',required=True)
    review=commands.add_parser('review');review.add_argument('id')
    export=commands.add_parser('pilot-export');export.add_argument('destination',type=Path)
    legacy=commands.add_parser('export-legacy');legacy.add_argument('destination',type=Path)
    args=parser.parse_args();init_db()
    with SessionLocal() as db:
        if args.command=='import-recording':
            if not args.path.is_file():raise ValueError('Recording does not exist')
            if args.path.stat().st_size>int(os.getenv('MAX_UPLOAD_BYTES','104857600')):raise ValueError('Recording exceeds upload limit')
            duration=probe(args.path)
            owner='administrator'
            if not db.get(Learner,owner):db.add(Learner(id=owner,invited=True,preferences={'voice':'Joanna','language':'English'}))
            storage=get_storage_adapter();key=storage.save(args.path,args.path.name)
            rec=Recording(id=uuid.uuid4().hex,owner_id=owner,title=args.title,storage_backend=storage.backend,object_key=key,duration=duration,permission_note=args.permission_note)
            db.add(rec);db.add(Job(id=uuid.uuid4().hex,recording_id=rec.id));db.commit()
            print(json.dumps({'id':rec.id,'status':'queued','public':False}))
        elif args.command=='publish-sample':
            rec=db.get(Recording,args.id)
            if not rec or rec.status!='ready':raise ValueError('Only a completed, reviewed recording can be published')
            Document.model_validate(rec.document)
            if not args.permission_note.strip():raise ValueError('Document public recording permission')
            rec.public=True;rec.permission_note=args.permission_note;db.commit()
            print('Published reviewed sample:',rec.id)
        elif args.command=='review':
            rec=db.get(Recording,args.id)
            if not rec:raise ValueError('Unknown recording')
            print(json.dumps({'id':rec.id,'status':rec.status,'permission_note':rec.permission_note,'document':rec.document},indent=2))
        elif args.command=='pilot-export':
            with args.destination.open('w',newline='') as f:
                writer=csv.writer(f);writer.writerow(['participant','recording','question_id','correct','timestamp'])
                participants={}
                for a in db.query(Attempt).order_by(Attempt.created_at):
                    state=db.get(LearningState,a.state_id)
                    participant=participants.setdefault(state.learner_id,f'P{len(participants)+1:02}')
                    writer.writerow([participant,state.recording_id,a.question_id,a.response['correct'],a.created_at])
            print('Exported pseudonymous check results; obtain consent before sharing. Repeated attempts are not independent learning gains.')
        else:
            from backend.app.model.models import Lecture
            rows=[]
            for rec in db.query(Lecture):
                rows.append({'id':rec.id,'filename':rec.filename,'legacy':True,'provenance':'unverified','phases':[{'title':p.title,'text':p.teaching_script} for p in (rec.learning_plan.phases if rec.learning_plan else [])]})
            args.destination.write_text(json.dumps(rows,indent=2))
            print('Exported legacy content without inventing evidence. Re-import original media for adaptive processing.')

if __name__=='__main__':main()
