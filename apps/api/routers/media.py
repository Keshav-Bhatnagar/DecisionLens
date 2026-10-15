import os
import shutil
import uuid
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.orm import Session
from apps.api.core.config import settings
from apps.api.core.database import get_db
from apps.api.models.database import MediaItem, DecisionSession
from apps.api.models.schemas import MediaResponse
from apps.api.services.validators import validate_audio_file
from apps.api.services.audio import audio_service
from apps.api.jobs.runners import process_media_job

router = APIRouter(prefix="/media", tags=["Media"])

UPLOAD_DIR = Path("./data/audio_uploads")


@router.post("/upload", response_model=MediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload an audio/video recording for a decision session and trigger processing."""
    session = db.query(DecisionSession).filter(DecisionSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision session '{session_id}' not found.",
        )

    # Read content to check size and validate
    content = await file.read()
    file_size = len(content)
    validate_audio_file(
        file_name=file.filename,
        file_size_bytes=file_size,
        mime_type=file.content_type,
        max_size_mb=settings.MAX_UPLOAD_SIZE_MB,
    )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    saved_filename = f"{uuid.uuid4()}{ext}"
    saved_path = UPLOAD_DIR / saved_filename

    with open(saved_path, "wb") as f:
        f.write(content)

    media = MediaItem(
        session_id=session_id,
        file_name=file.filename,
        file_path=str(saved_path),
        file_size_bytes=file_size,
        mime_type=file.content_type or "audio/wav",
        status="uploaded",
    )
    db.add(media)
    db.commit()
    db.refresh(media)

    # Trigger background audio inspection & STT processing
    background_tasks.add_task(process_media_job, media.id)

    return media


@router.post("/generate-sample/{session_id}", response_model=MediaResponse, status_code=status.HTTP_201_CREATED)
def generate_sample_media(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate a sample audio file with ffmpeg for quick zero-upload testing."""
    session = db.query(DecisionSession).filter(DecisionSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    sample_path = UPLOAD_DIR / f"sample_{uuid.uuid4().hex[:8]}.wav"
    audio_service.generate_synthetic_audio(str(sample_path), duration_sec=6)

    media = MediaItem(
        session_id=session_id,
        file_name="sample_decision_meeting.wav",
        file_path=str(sample_path),
        file_size_bytes=os.path.getsize(sample_path),
        mime_type="audio/wav",
        duration_seconds=6.0,
        status="uploaded",
    )
    db.add(media)
    db.commit()
    db.refresh(media)

    # Process immediately
    process_media_job(media.id)
    db.refresh(media)
    return media


@router.get("/{media_id}", response_model=MediaResponse)
def get_media(media_id: str, db: Session = Depends(get_db)):
    """Get media item details by ID."""
    media = db.query(MediaItem).filter(MediaItem.id == media_id).first()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Media item '{media_id}' not found.",
        )
    return media


@router.get("/session/{session_id}", response_model=List[MediaResponse])
def list_session_media(session_id: str, db: Session = Depends(get_db)):
    """List all media recordings attached to a session."""
    return db.query(MediaItem).filter(MediaItem.session_id == session_id).all()
