from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from apps.api.core.database import get_db
from apps.api.models.database import ResponseItem, DecisionSession
from apps.api.models.schemas import ResponseCreate, ResponseResponse

router = APIRouter(prefix="/responses", tags=["Responses"])


@router.get("/session/{session_id}", response_model=List[ResponseResponse])
def get_session_responses(session_id: str, db: Session = Depends(get_db)):
    """Retrieve all guided prompt responses for a decision session."""
    return db.query(ResponseItem).filter(ResponseItem.session_id == session_id).order_by(ResponseItem.created_at.asc()).all()


@router.post("", response_model=ResponseResponse, status_code=status.HTTP_201_CREATED)
def create_response(response_in: ResponseCreate, db: Session = Depends(get_db)):
    """Add a stakeholder question/answer or prompt response to a session."""
    session = db.query(DecisionSession).filter(DecisionSession.id == response_in.session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision session '{response_in.session_id}' not found.",
        )

    response_item = ResponseItem(
        session_id=response_in.session_id,
        prompt_id=response_in.prompt_id,
        question=response_in.question,
        answer=response_in.answer,
        speaker=response_in.speaker,
        extra_metadata=response_in.extra_metadata,
    )
    db.add(response_item)
    db.commit()
    db.refresh(response_item)
    return response_item


@router.delete("/{response_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_response(response_id: str, db: Session = Depends(get_db)):
    """Delete a response item."""
    item = db.query(ResponseItem).filter(ResponseItem.id == response_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Response item '{response_id}' not found.",
        )
    db.delete(item)
    db.commit()
    return None
