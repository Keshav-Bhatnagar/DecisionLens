import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, verify_ownership
from app.database import get_db
from app.models import Decision, User
from app.schemas import (
    FrameworkAnalysisRequest,
    FrameworkAnalysisResponse,
    MatrixEvaluationRequest,
    MatrixEvaluationResponse,
)
from app.services.framework_engine import (
    build_canonical_decision_result,
    detect_decision_domain,
    run_framework_analysis,
    validate_and_calculate_matrix_scores,
)

logger = logging.getLogger("decisionlens.api.analysis")

router = APIRouter(prefix="/decisions/{decision_id}/analysis", tags=["Thinking Frameworks Analysis"])


@router.post(
    "",
    response_model=FrameworkAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute multi-framework decision analysis (Phase 9)",
)
def evaluate_frameworks(
    decision_id: int,
    request: FrameworkAnalysisRequest = FrameworkAnalysisRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate selected thinking frameworks for a decision:
    - Six Thinking Hats (Facts, Feelings, Risks, Benefits, Alternatives, Process)
    - SWOT Analysis (Strengths, Weaknesses, Opportunities, Threats)
    - Weighted Decision Matrix (Deterministic weighted scoring summing to 100)
    - Five Whys (Root Cause Analysis without inventing causes)
    - Decision Tree (Branching scenarios without inventing probabilities)

    Supports framework selection, inapplicability explanations, and pure deterministic calculations.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    try:
        response = run_framework_analysis(decision=decision, request=request, db=db)
        return response
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Framework analysis error on decision {decision_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis engine execution failed: {str(exc)}",
        )


@router.get(
    "",
    response_model=FrameworkAnalysisResponse,
    summary="Retrieve current framework analysis results for a decision",
)
def get_framework_analysis(
    decision_id: int,
    auto_run: bool = Query(False, description="If True and no analysis exists, run analysis automatically"),
    force_mock: bool = Query(False, description="Force mock mode if auto_run is triggered"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve existing framework analysis or optionally run initial analysis."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    if not decision.analysis or not isinstance(decision.analysis, dict) or not decision.analysis.get("selected_frameworks"):
        if auto_run:
            req = FrameworkAnalysisRequest(force_mock=force_mock)
            return run_framework_analysis(decision=decision, request=req, db=db)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No framework analysis has been executed yet for this decision. POST to /api/decisions/{id}/analysis to run.",
            )

    analysis_data = decision.analysis
    return FrameworkAnalysisResponse(
        decision_id=decision.id,
        evaluated_at=analysis_data.get("evaluated_at", ""),
        selected_frameworks=analysis_data.get("selected_frameworks", []),
        recommended_framework=analysis_data.get("recommended_framework"),
        recommended_techniques=analysis_data.get("recommended_techniques", []),
        methodology_rationale=analysis_data.get("methodology_rationale"),
        six_hats=analysis_data.get("six_hats"),
        swot=analysis_data.get("swot"),
        decision_matrix=analysis_data.get("decision_matrix"),
        five_whys=analysis_data.get("five_whys"),
        decision_tree=analysis_data.get("decision_tree"),
        summary_insights=analysis_data.get("summary_insights", []),
        message="Framework analysis retrieved successfully",
    )


@router.post(
    "/matrix/evaluate",
    response_model=MatrixEvaluationResponse,
    status_code=status.HTTP_200_OK,
    summary="Pure deterministic calculation for Weighted Decision Matrix",
)
def evaluate_matrix_scores(
    decision_id: int,
    request: MatrixEvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pure deterministic scoring endpoint for Weighted Decision Matrix:
    - Validates criteria weights sum to 100.
    - Validates all ratings within [scale_min, scale_max].
    - Calculates weighted score and normalized percentages.
    - Determines ranks and top alternative.
    - Strictly separates math calculation from AI suggestions.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    try:
        results, winner_id, winner_name = validate_and_calculate_matrix_scores(
            criteria=request.criteria,
            options=request.options,
            ratings=request.ratings,
            scale_min=request.scale_min,
            scale_max=request.scale_max,
        )
        total_weight = sum(c.weight for c in request.criteria)

        domain = getattr(decision, "domain", None) or detect_decision_domain(decision)
        canonical_result = build_canonical_decision_result(
            decision=decision,
            criteria=request.criteria,
            options=request.options,
            ratings=request.ratings,
            results=results,
            winner_id=winner_id,
            winner_name=winner_name,
            domain=domain,
        )

        if decision.analysis and isinstance(decision.analysis, dict):
            a_copy = dict(decision.analysis)
            a_copy["is_stale"] = False
            a_copy["canonical_result"] = canonical_result.model_dump()
            if "decision_matrix" in a_copy and isinstance(a_copy["decision_matrix"], dict):
                dm_copy = dict(a_copy["decision_matrix"])
                dm_copy["results"] = [r.model_dump() for r in results]
                dm_copy["winner_option_id"] = winner_id
                dm_copy["winner_option_name"] = winner_name
                dm_copy["canonical_result"] = canonical_result.model_dump()
                a_copy["decision_matrix"] = dm_copy
            decision.analysis = a_copy

        if decision.recommendation and isinstance(decision.recommendation, dict):
            r_copy = dict(decision.recommendation)
            r_copy["is_stale"] = True
            decision.recommendation = r_copy

        db.commit()
        db.refresh(decision)

        return MatrixEvaluationResponse(
            valid=True,
            scale_min=request.scale_min,
            scale_max=request.scale_max,
            total_weight=round(total_weight, 2),
            criteria=request.criteria,
            options=request.options,
            ratings=request.ratings,
            results=results,
            winner_option_id=winner_id,
            winner_option_name=winner_name,
            canonical_result=canonical_result,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
