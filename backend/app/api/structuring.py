import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, verify_ownership
from app.database import get_db
from app.models import Decision, User
from app.schemas import (
    PrivateTranscriptFeedback,
    StructuredFindings,
    StructuringResponse,
    StructuringUpdate,
)
from app.services.structuring import (
    assemble_decision_input_context,
    run_decision_structuring,
)

logger = logging.getLogger("decisionlens.api.structuring")

router = APIRouter(prefix="/decisions/{decision_id}/structuring", tags=["Input Structuring"])


@router.post(
    "/analyze",
    response_model=StructuringResponse,
    status_code=status.HTTP_200_OK,
    summary="Run AI structuring across decision inputs into 8 cognitive categories",
)
def analyze_inputs(
    decision_id: int,
    force_mock: bool = Query(False, description="Force deterministic mock AI structuring"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Execute the input-structuring engine on the decision's aggregated inputs
    (problem statement, context, voice transcript, and documents).
    Categorizes content into: facts, assumptions, feelings, pros, cons,
    mixed points, contradictions, and unknowns, plus private transcript feedback.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    findings, source_summary = run_decision_structuring(
        decision=decision,
        db=db,
        force_mock=force_mock,
    )

    return StructuringResponse(
        decision_id=decision.id,
        findings=findings,
        points_reviewed=decision.points_reviewed,
        source_summary=source_summary,
        message="Decision inputs structured successfully into 8 cognitive categories",
    )


@router.get(
    "",
    response_model=StructuringResponse,
    summary="Get current structured findings and review status for a decision",
)
def get_structured_findings(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the stored structured findings (decision.points) and review status."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    _, source_summary = assemble_decision_input_context(decision)

    points_data = decision.points or {}
    if points_data:
        try:
            findings = StructuredFindings.model_validate(points_data)
        except Exception:
            findings = StructuredFindings()
    else:
        findings = StructuredFindings()

    return StructuringResponse(
        decision_id=decision.id,
        findings=findings,
        points_reviewed=decision.points_reviewed,
        source_summary=source_summary,
    )


@router.patch(
    "",
    response_model=StructuringResponse,
    summary="Update findings and explicitly mark as reviewed/approved by user",
)
def update_structured_findings(
    decision_id: int,
    payload: StructuringUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update cognitive category findings with user edits, deletions, or additions,
    and explicitly set review approval (points_reviewed=True).
    Requires user review before deeper framework analysis.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    current_points = dict(decision.points) if decision.points else {}

    # Update categories provided in payload
    if payload.facts is not None:
        current_points["facts"] = payload.facts
    if payload.assumptions is not None:
        current_points["assumptions"] = payload.assumptions
    if payload.feelings is not None:
        current_points["feelings"] = payload.feelings
    if payload.pros is not None:
        current_points["pros"] = payload.pros
    if payload.cons is not None:
        current_points["cons"] = payload.cons
    if payload.mixed_points is not None:
        current_points["mixed_points"] = payload.mixed_points
    if payload.contradictions is not None:
        current_points["contradictions"] = payload.contradictions
    if payload.unknowns is not None:
        current_points["unknowns"] = payload.unknowns
    if payload.summary is not None:
        current_points["summary"] = payload.summary
    if payload.private_feedback is not None:
        current_points["private_feedback"] = payload.private_feedback.model_dump(mode="json")

    # Set review flag
    current_points["reviewed"] = payload.mark_reviewed
    if payload.mark_reviewed:
        current_points["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    else:
        current_points["reviewed_at"] = None

    decision.points = current_points
    decision.points_reviewed = payload.mark_reviewed

    db.commit()
    db.refresh(decision)

    findings = StructuredFindings.model_validate(decision.points)
    _, source_summary = assemble_decision_input_context(decision)

    return StructuringResponse(
        decision_id=decision.id,
        findings=findings,
        points_reviewed=decision.points_reviewed,
        source_summary=source_summary,
        message="Structured findings updated and reviewed successfully",
    )
