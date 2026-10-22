from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import User, Folder, Decision
from app.schemas import DecisionCreate, DecisionUpdate, DecisionResponse
from app.auth import get_current_user, verify_ownership

router = APIRouter(prefix="/decisions", tags=["Decisions"])


@router.post(
    "",
    response_model=DecisionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new decision or meeting record",
)
def create_decision(
    body: DecisionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new decision or meeting record inside a user-owned folder."""
    # Verify target folder exists and belongs to current user
    folder = db.get(Folder, body.folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Target folder not found")

    verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")

    clean_title = body.title.strip()
    if not clean_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title cannot be empty")

    decision = Decision(
        owner_id=current_user.id,
        folder_id=body.folder_id,
        title=clean_title,
        description=body.description.strip() if body.description else "",
        problem_statement=body.problem_statement.strip() if body.problem_statement else "",
        record_type=body.record_type or "decision",
        status=body.status or "draft",
        language=body.language or "en",
        raw_input="",
        transcript="",
        transcript_reviewed=False,
        points={},
        gaps={},
        research={},
        analysis={},
        recommendation={},
        roadmap={},
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)

    return DecisionResponse.model_validate(decision)


@router.get(
    "",
    response_model=List[DecisionResponse],
    summary="List decisions and meeting records",
)
def list_decisions(
    folder_id: Optional[int] = Query(None, description="Filter decisions by folder ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List decisions for the authenticated user, optionally filtered by folder."""
    stmt = select(Decision).where(Decision.owner_id == current_user.id)

    if folder_id is not None:
        # Verify folder ownership to prevent probing
        folder = db.get(Folder, folder_id)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")
        stmt = stmt.where(Decision.folder_id == folder_id)

    stmt = stmt.order_by(Decision.created_at.desc())
    decisions = db.scalars(stmt).all()
    return [DecisionResponse.model_validate(d) for d in decisions]


@router.get(
    "/{decision_id}",
    response_model=DecisionResponse,
    summary="Get decision by ID",
)
def get_decision(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details for a single decision, enforcing strict owner isolation."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    return DecisionResponse.model_validate(decision)


@router.patch(
    "/{decision_id}",
    response_model=DecisionResponse,
    summary="Update decision details or problem statement",
)
def update_decision(
    decision_id: int,
    body: DecisionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update decision title, description, problem statement, status, or target folder."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    if body.folder_id is not None and body.folder_id != decision.folder_id:
        target_folder = db.get(Folder, body.folder_id)
        if not target_folder:
            raise HTTPException(status_code=404, detail="Target folder not found")
        verify_ownership(target_folder.owner_id, current_user.id, resource_name="Folder")
        decision.folder_id = body.folder_id

    if body.title is not None:
        decision.title = body.title.strip()
    if body.description is not None:
        decision.description = body.description.strip()
    if body.problem_statement is not None:
        decision.problem_statement = body.problem_statement.strip()
    if body.record_type is not None:
        decision.record_type = body.record_type
    if body.status is not None:
        decision.status = body.status
    if body.language is not None:
        decision.language = body.language
    if body.raw_input is not None:
        decision.raw_input = body.raw_input

    db.commit()
    db.refresh(decision)

    return DecisionResponse.model_validate(decision)


@router.delete(
    "/{decision_id}",
    summary="Delete decision",
)
def delete_decision(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a decision or meeting record."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    db.delete(decision)
    db.commit()

    return {"status": "deleted", "id": decision_id}
