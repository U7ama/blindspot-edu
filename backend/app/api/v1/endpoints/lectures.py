"""
backend/api/lectures.py

Lecture management endpoints:
- POST /lectures — upload audio/video, start background transcription & planning
- GET /lectures — list all lectures
- GET /lectures/{id} — get one lecture with transcript status
- GET /lectures/{id}/transcripts — get the transcript segments
- GET /lectures/{id}/plan — get the generated learning plan with phases
- GET /lectures/{id}/quiz — get the generated quiz bank
- GET /lectures/{id}/gaps — get the detected gap concepts
- GET /lectures/{id}/graph — get the knowledge graph (nodes + edges)

Background task handling: transcription and AI planning run async so the upload
endpoint returns immediately (status=PROCESSING) and flips to READY once done.
"""

from fastapi import APIRouter, BackgroundTasks, File, UploadFile, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from backend.app.core.db import get_db, SessionLocal
from backend.app.model.models import (
    Lecture,
    LectureStatus,
    TranscriptChunk,
    LearningPlan as LearningPlanModel,
    Phase as PhaseModel,
    GapConcept as GapConceptModel,
    QuizItem as QuizItemModel,
    GraphNode as GraphNodeModel,
    GraphEdge as GraphEdgeModel,
)
from backend.app.schemas.schemas import (
    Lecture as LectureSchema,
    TranscriptSegment,
    LearningPlan as LearningPlanSchema,
    Phase as PhaseSchema,
    GapConcept as GapConceptSchema,
    QuizItem as QuizItemSchema,
    GraphNode as GraphNodeSchema,
    GraphEdge as GraphEdgeSchema,
    TimeRange,
)
from backend.app.services.storage.r2 import save
from backend.app.services.ai.transcription import transcribe

router = APIRouter()


def _transcribe_and_plan_background(
    lecture_id: int,
    stored_ref: str,
):
    """Background task: transcribes the lecture, stores segments in DB,
    and runs the AI planning pipeline (learning plan, gaps, quiz bank, graph).
    """
    db = SessionLocal()
    try:
        # 1. Transcribe audio/video
        segments = transcribe(stored_ref, lecture_id=lecture_id)

        # 2. Store each transcript segment in DB
        for seg in segments:
            db.add(TranscriptChunk(
                lecture_id=lecture_id,
                start=seg.start,
                end=seg.end,
                text=seg.text,
                speaker=seg.speaker,
            ))
        db.commit()

        # 3. Handoff to AI Planning pipeline
        try:
            from backend.app.services.ai.planning import run_full_pipeline
            pipeline_result = run_full_pipeline(segments, lecture_id=lecture_id)

            # Store LearningPlan + Phases
            plan_record = LearningPlanModel(lecture_id=lecture_id)
            db.add(plan_record)
            db.flush()

            for ph in pipeline_result.plan.phases:
                db.add(PhaseModel(
                    plan_id=plan_record.id,
                    order=ph.order,
                    title=ph.title,
                    teaching_script=ph.teaching_script,
                    source_timestamps=[t.model_dump() for t in ph.source_timestamps],
                    prerequisite_note=ph.prerequisite_note,
                    difficulty=ph.difficulty,
                ))

            # Store GapConcepts
            for gap in pipeline_result.gaps:
                db.add(GapConceptModel(
                    lecture_id=lecture_id,
                    name=gap.name,
                    why_its_a_gap=gap.why_its_a_gap,
                    related_phase_order=gap.related_phase_order,
                    source_timestamp=gap.source_timestamp.model_dump() if gap.source_timestamp else None,
                ))

            # Store QuizItems
            for q in pipeline_result.quizzes:
                db.add(QuizItemModel(
                    lecture_id=lecture_id,
                    question=q.question,
                    options=q.options,
                    correct_answer=q.correct_answer,
                    source_timestamp=q.source_timestamp.model_dump() if q.source_timestamp else None,
                ))

            # Store GraphNodes
            for node in pipeline_result.graph_nodes:
                db.add(GraphNodeModel(
                    id=node.id,
                    lecture_id=lecture_id,
                    label=node.label,
                    is_gap=node.is_gap,
                    source_timestamp=node.source_timestamp.model_dump() if node.source_timestamp else None,
                ))

            # Store GraphEdges
            for edge in pipeline_result.graph_edges:
                db.add(GraphEdgeModel(
                    lecture_id=lecture_id,
                    source=edge.source,
                    target=edge.target,
                    relation=edge.relation,
                ))

            db.commit()
            print(f"[pipeline] Successfully stored planning data for lecture {lecture_id}")

        except Exception as plan_err:
            # A failed commit leaves the session in pending-rollback state —
            # roll back first so the status update below can actually run.
            db.rollback()
            print(f"[warning] Planning pipeline failed for lecture {lecture_id}: {plan_err}")
            lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
            if lecture:
                lecture.status = LectureStatus.FAILED
                db.commit()
            return

        # 4. Mark lecture ready
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        if lecture:
            lecture.status = LectureStatus.READY
            db.commit()

    except Exception as e:
        db.rollback()
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        if lecture:
            lecture.status = LectureStatus.FAILED
            db.commit()
        print(f"Transcription/Planning pipeline failed for lecture {lecture_id}: {e}")
    finally:
        db.close()


@router.post("/lectures", response_model=LectureSchema)
async def upload_lecture(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
):
    """Upload an audio or video file to be transcribed and planned.

    Returns immediately with status=PROCESSING. The actual transcription
    and AI planning pipeline run in the background and mark the lecture READY.
    """
    try:
        import tempfile
        from pathlib import Path
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name

        try:
            stored_ref = save(tmp_path, file.filename)
        finally:
            # The temp file is only needed for the upload — always remove it.
            Path(tmp_path).unlink(missing_ok=True)
        audio_url = stored_ref

        # Create lecture row with PROCESSING status
        lecture = Lecture(
            filename=file.filename,
            audio_url=audio_url,
            status=LectureStatus.PROCESSING,
        )
        db.add(lecture)
        db.commit()
        db.refresh(lecture)

        # Queue background transcription + planning
        background_tasks.add_task(
            _transcribe_and_plan_background,
            lecture_id=lecture.id,
            stored_ref=stored_ref,
        )

        return LectureSchema(
            id=lecture.id,
            filename=lecture.filename,
            audio_url=lecture.audio_url,
            status=lecture.status,
            uploaded_at=lecture.uploaded_at,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/lectures", response_model=list[LectureSchema])
def list_lectures(db: Session = Depends(get_db)):
    """List all lectures with their status."""
    lectures = db.query(Lecture).all()
    return [
        LectureSchema(
            id=l.id,
            filename=l.filename,
            audio_url=l.audio_url,
            status=l.status,
            uploaded_at=l.uploaded_at,
        )
        for l in lectures
    ]


@router.get("/lectures/{lecture_id}", response_model=LectureSchema)
def get_lecture(lecture_id: int, db: Session = Depends(get_db)):
    """Get a single lecture by ID."""
    lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    return LectureSchema(
        id=lecture.id,
        filename=lecture.filename,
        audio_url=lecture.audio_url,
        status=lecture.status,
        uploaded_at=lecture.uploaded_at,
    )


@router.get("/lectures/{lecture_id}/transcripts", response_model=list[TranscriptSegment])
def get_transcripts(lecture_id: int, db: Session = Depends(get_db)):
    """Get transcript segments for a lecture."""
    lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    
    segments = db.query(TranscriptChunk).filter(
        TranscriptChunk.lecture_id == lecture_id
    ).order_by(TranscriptChunk.start).all()
    
    return [
        TranscriptSegment(
            id=seg.id,
            lecture_id=seg.lecture_id,
            start=seg.start,
            end=seg.end,
            text=seg.text,
            speaker=seg.speaker,
        )
        for seg in segments
    ]


@router.get("/lectures/{lecture_id}/plan", response_model=Optional[LearningPlanSchema])
def get_learning_plan(lecture_id: int, db: Session = Depends(get_db)):
    """Get the AI-generated learning plan for a lecture."""
    plan_record = db.query(LearningPlanModel).filter(
        LearningPlanModel.lecture_id == lecture_id
    ).first()
    if not plan_record:
        return None

    phases = [
        PhaseSchema(
            order=p.order,
            title=p.title,
            teaching_script=p.teaching_script,
            source_timestamps=[
                TimeRange(start=t["start"], end=t["end"]) for t in (p.source_timestamps or [])
            ],
            prerequisite_note=p.prerequisite_note,
            difficulty=p.difficulty,
        )
        for p in plan_record.phases
    ]

    return LearningPlanSchema(
        id=plan_record.id,
        lecture_id=plan_record.lecture_id,
        phases=phases,
    )


@router.get("/lectures/{lecture_id}/quiz", response_model=list[QuizItemSchema])
def get_quizzes(lecture_id: int, db: Session = Depends(get_db)):
    """Get the quiz questions for a lecture."""
    quizzes = db.query(QuizItemModel).filter(
        QuizItemModel.lecture_id == lecture_id
    ).all()

    return [
        QuizItemSchema(
            id=q.id,
            lecture_id=q.lecture_id,
            question=q.question,
            options=q.options or [],
            correct_answer=q.correct_answer,
            source_timestamp=(
                TimeRange(start=q.source_timestamp["start"], end=q.source_timestamp["end"])
                if q.source_timestamp else None
            ),
        )
        for q in quizzes
    ]


@router.get("/lectures/{lecture_id}/gaps", response_model=list[GapConceptSchema])
def get_gaps(lecture_id: int, db: Session = Depends(get_db)):
    """Get under-explained gap concepts for a lecture."""
    gaps = db.query(GapConceptModel).filter(
        GapConceptModel.lecture_id == lecture_id
    ).all()

    return [
        GapConceptSchema(
            id=g.id,
            lecture_id=g.lecture_id,
            name=g.name,
            why_its_a_gap=g.why_its_a_gap,
            related_phase_order=g.related_phase_order,
            source_timestamp=(
                TimeRange(start=g.source_timestamp["start"], end=g.source_timestamp["end"])
                if g.source_timestamp else None
            ),
        )
        for g in gaps
    ]


@router.get("/lectures/{lecture_id}/graph")
def get_knowledge_graph(lecture_id: int, db: Session = Depends(get_db)):
    """Get knowledge graph nodes and edges for visualization."""
    nodes = db.query(GraphNodeModel).filter(GraphNodeModel.lecture_id == lecture_id).all()
    edges = db.query(GraphEdgeModel).filter(GraphEdgeModel.lecture_id == lecture_id).all()

    return {
        "nodes": [
            GraphNodeSchema(
                id=n.id,
                lecture_id=n.lecture_id,
                label=n.label,
                is_gap=n.is_gap,
                source_timestamp=(
                    TimeRange(start=n.source_timestamp["start"], end=n.source_timestamp["end"])
                    if n.source_timestamp else None
                ),
            ).model_dump()
            for n in nodes
        ],
        "edges": [
            GraphEdgeSchema(
                lecture_id=e.lecture_id,
                source=e.source,
                target=e.target,
                relation=e.relation,
            ).model_dump()
            for e in edges
        ],
    }


@router.get("/lectures/{lecture_id}/audio-url")
def get_lecture_audio_url(lecture_id: int, db: Session = Depends(get_db)):
    """Returns a secure presigned stream URL for the original lecture recording."""
    lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
    if not lecture or not lecture.audio_url:
        raise HTTPException(status_code=404, detail="Lecture audio recording not found")

    if lecture.audio_url.startswith("http://") or lecture.audio_url.startswith("https://"):
        return {"url": lecture.audio_url, "filename": lecture.filename}

    try:
        from backend.app.services.storage.r2 import s3_client, BUCKET_NAME
        if s3_client:
            presigned = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": BUCKET_NAME, "Key": lecture.audio_url},
                ExpiresIn=3600 * 6,
            )
            return {"url": presigned, "filename": lecture.filename}
    except Exception as e:
        print(f"S3 presigned URL generation failed: {e}")

    rel_path = lecture.audio_url.replace("\\", "/").lstrip("/")
    if "storage_data/" in rel_path:
        rel_path = rel_path.split("storage_data/", 1)[1]
    return {"url": f"/storage/{rel_path}", "filename": lecture.filename}


@router.get("/lectures/{lecture_id}/stream")
def stream_lecture(lecture_id: int, db: Session = Depends(get_db)):
    """Redirects directly to the audio/video stream for HTML5 media players."""
    from fastapi.responses import RedirectResponse
    res = get_lecture_audio_url(lecture_id, db)
    return RedirectResponse(url=res["url"])


class QARequest(BaseModel):
    question: str
    phase_order: Optional[int] = None
    voice: Optional[str] = None
    text_language: Optional[str] = None


@router.post("/lectures/{lecture_id}/qa")
def ask_lecture_question(
    lecture_id: int,
    req: QARequest,
    db: Session = Depends(get_db),
):
    """Answers a question about a lecture or specific phase using backend/app/services/ai/qa.py.
    Provides structured explanations, analogies, key takeaways, and visual flow steps.
    """
    from backend.app.services.ai.qa import answer_phase_question
    from backend.app.services.ai.tts import speak

    # 1. Fetch Phase if phase_order specified or default to first phase
    current_phase_schema = None
    plan = db.query(LearningPlanModel).filter(LearningPlanModel.lecture_id == lecture_id).first()
    if plan:
        target_phase = None
        if req.phase_order is not None:
            target_phase = db.query(PhaseModel).filter(
                PhaseModel.plan_id == plan.id,
                PhaseModel.order == req.phase_order
            ).first()
        if not target_phase:
            target_phase = db.query(PhaseModel).filter(PhaseModel.plan_id == plan.id).order_by(PhaseModel.order.asc()).first()

        if target_phase:
            current_phase_schema = PhaseSchema(
                order=target_phase.order,
                title=target_phase.title,
                teaching_script=target_phase.teaching_script,
                source_timestamps=[
                    TimeRange(start=t["start"], end=t["end"])
                    for t in (target_phase.source_timestamps or [])
                ],
                prerequisite_note=target_phase.prerequisite_note,
                difficulty=target_phase.difficulty,
            )

    # 2. Fetch transcript segments for context grounding
    db_chunks = db.query(TranscriptChunk).filter(TranscriptChunk.lecture_id == lecture_id).all()
    transcript_segments = [
        TranscriptSegment(
            id=c.id,
            lecture_id=c.lecture_id,
            start=c.start,
            end=c.end,
            text=c.text,
            speaker=c.speaker,
        )
        for c in db_chunks
    ]

    # 3. Call qa.py engine
    qa_result = answer_phase_question(
        question=req.question,
        current_phase=current_phase_schema,
        transcript_segments=transcript_segments,
    )

    # 4. Optional TTS audio synthesis
    audio_url = None
    if qa_result.explanation:
        try:
            audio_url = speak(qa_result.explanation, voice=req.voice or "en-US-ChristopherNeural")
        except Exception as tts_err:
            print(f"TTS synthesis notice: {tts_err}")

    return {
        "question": req.question,
        "phase_order": req.phase_order,
        "explanation": qa_result.explanation,
        "key_takeaway": qa_result.key_takeaway,
        "analogy": qa_result.analogy,
        "flow_steps": [s.model_dump() for s in qa_result.flow_steps] if qa_result.flow_steps else None,
        "audio_url": audio_url,
    }