from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from apps.api.core.database import get_db
from apps.api.models.database import TranscriptItem, DecisionSession
from apps.api.models.schemas import TranscriptCreate, TranscriptResponse

router = APIRouter(prefix="/transcripts", tags=["Transcripts"])


@router.get("/session/{session_id}", response_model=List[TranscriptResponse])
def get_session_transcripts(session_id: str, db: Session = Depends(get_db)):
    """Retrieve all transcripts associated with a decision session."""
    return db.query(TranscriptItem).filter(TranscriptItem.session_id == session_id).all()


@router.post("", response_model=TranscriptResponse, status_code=status.HTTP_201_CREATED)
def create_transcript(transcript_in: TranscriptCreate, db: Session = Depends(get_db)):
    """Manually add or upload a transcript for a session."""
    session = db.query(DecisionSession).filter(DecisionSession.id == transcript_in.session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{transcript_in.session_id}' not found.",
        )

    segments_data = [s.model_dump() for s in transcript_in.segments] if transcript_in.segments else []
    word_count = transcript_in.word_count or len(transcript_in.raw_text.split())

    transcript = TranscriptItem(
        session_id=transcript_in.session_id,
        media_id=transcript_in.media_id,
        raw_text=transcript_in.raw_text,
        segments=segments_data,
        word_count=word_count,
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)
    return transcript


@router.get("/{transcript_id}", response_model=TranscriptResponse)
def get_transcript(transcript_id: str, db: Session = Depends(get_db)):
    """Get single transcript by ID."""
    transcript = db.query(TranscriptItem).filter(TranscriptItem.id == transcript_id).first()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transcript '{transcript_id}' not found.",
        )
    return transcript
