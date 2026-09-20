"""
backend/test_pipeline.py

Runs Task 1 end to end: save audio, transcribe it, store the timestamped
segments in the DB. This is the thing to run to prove "audio + timestamps
stored" actually works.

"""

import sys
from pathlib import Path

# Allow running the script directly from the repo root while still using the
# package-qualified imports below.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.core.db import SessionLocal, init_db
from backend.app.model.models import Lecture, LectureStatus, TranscriptChunk
from backend.app.services.storage.r2 import get_url, save
from backend.app.services.ai.transcription import transcribe

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python backend/test_pipeline.py <path_to_audio_or_video>")
        sys.exit(1)

    source_path = sys.argv[1]

    init_db()
    db = SessionLocal()

    try:
        # 1. Save the raw file into storage
        stored_ref = save(source_path, source_path)
        audio_url = get_url(stored_ref)
        print(f"Saved audio to: {audio_url}")

        # 2. Create the Lecture row
        filename = source_path.replace("\\", "/").split("/")[-1]
        lecture = Lecture(filename=filename, audio_url=audio_url, status=LectureStatus.PROCESSING)
        db.add(lecture)
        db.commit()
        db.refresh(lecture)
        print(f"Created lecture row: id={lecture.id}")

        # 3. Transcribe
        print("Transcribing... (this can take a minute or two)")
        segments = transcribe(stored_ref, lecture_id=lecture.id)
        print(f"Got {len(segments)} segments")

        # 4. Store each segment as a transcript_chunks row
        for seg in segments:
            db.add(TranscriptChunk(
                lecture_id=lecture.id,
                start=seg.start,
                end=seg.end,
                text=seg.text,
                speaker=seg.speaker,
            ))

        # 5. Mark the lecture ready
        lecture.status = LectureStatus.READY
        db.commit()

        print(f"\nDone. Lecture {lecture.id} is READY with {len(segments)} transcript chunks stored.")
        print(f"DB file (if SQLite): blindspot.db in your repo root")
        print(f"Audio file saved at: {audio_url}")

    finally:
        db.close()
