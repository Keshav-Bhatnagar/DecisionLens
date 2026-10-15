from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from apps.api.core.database import get_db
from apps.api.models.database import DecisionSession, Folder
from apps.api.models.schemas import SessionCreate, SessionUpdate, SessionResponse

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.get("", response_model=List[SessionResponse])
def list_sessions(
    folder_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List decision sessions, optionally filtered by folder_id or status."""
    query = db.query(DecisionSession)
    if folder_id is not None:
        query = query.filter(DecisionSession.folder_id == folder_id)
    if status_filter is not None:
        query = query.filter(DecisionSession.status == status_filter)
    return query.order_by(DecisionSession.updated_at.desc()).all()


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(session_in: SessionCreate, db: Session = Depends(get_db)):
    """Create a new decision session."""
    if session_in.folder_id:
        folder = db.query(Folder).filter(Folder.id == session_in.folder_id).first()
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Folder '{session_in.folder_id}' not found.",
            )

    session = DecisionSession(
        title=session_in.title,
        objective=session_in.objective,
        folder_id=session_in.folder_id,
        framework_type=session_in.framework_type,
        context_data=session_in.context_data,
        status="in_progress",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get single session details by ID."""
    session = db.query(DecisionSession).filter(DecisionSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )
    return session


@router.put("/{session_id}", response_model=SessionResponse)
def update_session(session_id: str, session_in: SessionUpdate, db: Session = Depends(get_db)):
    """Update decision session details."""
    session = db.query(DecisionSession).filter(DecisionSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )

    if session_in.title is not None:
        session.title = session_in.title
    if session_in.objective is not None:
        session.objective = session_in.objective
    if session_in.folder_id is not None:
        session.folder_id = session_in.folder_id
    if session_in.status is not None:
        session.status = session_in.status
    if session_in.framework_type is not None:
        session.framework_type = session_in.framework_type
    if session_in.context_data is not None:
        session.context_data = session_in.context_data

    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a decision session and cascade delete all associated media and transcripts."""
    session = db.query(DecisionSession).filter(DecisionSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )
    db.delete(session)
    db.commit()
    return None
