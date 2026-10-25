import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Decision, User, Folder, DecisionOutcome
from app.schemas import (
    DecisionOutcomeCreate,
    DecisionOutcomeResponse,
    FolderOutcomesInsights,
)
from app.auth import get_current_user, verify_ownership

logger = logging.getLogger("decisionlens.api.outcomes")

router = APIRouter(tags=["Outcome & Follow-up"])


@router.post(
    "/decisions/{decision_id}/outcomes",
    response_model=DecisionOutcomeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a Post-Decision Outcome Review & Follow-up",
)
def create_decision_outcome(
    decision_id: int,
    payload: DecisionOutcomeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record an empirical post-decision outcome review (e.g. at 30, 60, or 90 days).
    Captures implementation status, real-world utility rating (1-5 stars),
    predicted vs actual metrics, and lessons learned.
    """
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with id {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id)

    # Determine default chosen option if omitted
    chosen = payload.chosen_option
    if not chosen and isinstance(decision.recommendation, dict):
        rec = decision.recommendation
        canonical = rec.get("canonical_result", {})
        if isinstance(canonical, dict) and canonical.get("winner_option_name"):
            chosen = canonical.get("winner_option_name")
        elif rec.get("headline"):
            chosen = rec.get("headline")
    if not chosen:
        chosen = "Recommended Path"

    outcome = DecisionOutcome(
        decision_id=decision.id,
        owner_id=current_user.id,
        implementation_status=payload.implementation_status,
        chosen_option=chosen,
        utility_rating=payload.utility_rating,
        predicted_vs_actual=payload.predicted_vs_actual or {},
        unexpected_challenges=payload.unexpected_challenges or [],
        what_worked_well=payload.what_worked_well or "",
        lessons_learned=payload.lessons_learned or "",
        would_recommend_tool=bool(payload.would_recommend_tool),
        days_since_decision=payload.days_since_decision or 30,
    )

    db.add(outcome)

    # Automatically mark decision status as decided if still draft/evaluating
    if decision.status in {"draft", "evaluating"}:
        decision.status = "decided"

    db.commit()
    db.refresh(outcome)
    logger.info("Recorded post-decision outcome for decision %d (rating: %d/5)", decision.id, outcome.utility_rating)
    return outcome


@router.get(
    "/decisions/{decision_id}/outcomes",
    response_model=List[DecisionOutcomeResponse],
    summary="List all Outcome Follow-ups for a Decision",
)
def list_decision_outcomes(
    decision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with id {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id)

    outcomes = (
        db.query(DecisionOutcome)
        .filter(DecisionOutcome.decision_id == decision.id)
        .order_by(DecisionOutcome.created_at.desc())
        .all()
    )
    return outcomes


@router.get(
    "/decisions/{decision_id}/outcomes/latest",
    response_model=Optional[DecisionOutcomeResponse],
    summary="Get Latest Outcome Review for a Decision",
)
def get_latest_decision_outcome(
    decision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with id {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id)

    outcome = (
        db.query(DecisionOutcome)
        .filter(DecisionOutcome.decision_id == decision.id)
        .order_by(DecisionOutcome.created_at.desc())
        .first()
    )
    return outcome


@router.delete(
    "/decisions/{decision_id}/outcomes/{outcome_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an Outcome Review",
)
def delete_decision_outcome(
    decision_id: int,
    outcome_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with id {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id)

    outcome = (
        db.query(DecisionOutcome)
        .filter(DecisionOutcome.id == outcome_id, DecisionOutcome.decision_id == decision.id)
        .first()
    )
    if not outcome:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outcome review with id {outcome_id} not found",
        )

    db.delete(outcome)
    db.commit()
    return None


@router.get(
    "/folders/{folder_id}/outcomes/insights",
    response_model=FolderOutcomesInsights,
    summary="Aggregate Real-World Outcome Insights Across Folder",
)
def get_folder_outcomes_insights(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found",
        )
    verify_ownership(folder.owner_id, current_user.id)

    decisions = db.query(Decision).filter(Decision.folder_id == folder_id).all()
    decision_ids = [d.id for d in decisions]

    if not decision_ids:
        return FolderOutcomesInsights(
            total_decisions=0,
            total_outcomes_recorded=0,
            average_utility_rating=0.0,
            implementation_rate_pct=0.0,
            common_lessons=[],
            unforeseen_pitfalls=[],
        )

    outcomes = (
        db.query(DecisionOutcome)
        .filter(DecisionOutcome.decision_id.in_(decision_ids))
        .all()
    )

    total_outcomes = len(outcomes)
    if total_outcomes == 0:
        return FolderOutcomesInsights(
            total_decisions=len(decisions),
            total_outcomes_recorded=0,
            average_utility_rating=0.0,
            implementation_rate_pct=0.0,
            common_lessons=[],
            unforeseen_pitfalls=[],
        )

    avg_rating = sum(o.utility_rating for o in outcomes) / total_outcomes
    implemented_count = sum(
        1 for o in outcomes if o.implementation_status == "implemented_as_recommended"
    )
    impl_rate = round((implemented_count / total_outcomes) * 100, 1)

    lessons = [o.lessons_learned.strip() for o in outcomes if o.lessons_learned and len(o.lessons_learned.strip()) > 3]
    challenges: List[str] = []
    for o in outcomes:
        if isinstance(o.unexpected_challenges, list):
            for c in o.unexpected_challenges:
                if c and isinstance(c, str) and len(c.strip()) > 3:
                    challenges.append(c.strip())

    return FolderOutcomesInsights(
        total_decisions=len(decisions),
        total_outcomes_recorded=total_outcomes,
        average_utility_rating=round(avg_rating, 2),
        implementation_rate_pct=impl_rate,
        common_lessons=lessons[:5],
        unforeseen_pitfalls=challenges[:5],
    )
