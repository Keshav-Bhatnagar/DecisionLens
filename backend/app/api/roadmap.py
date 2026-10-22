import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
import re
from datetime import datetime, timezone
from fastapi.responses import PlainTextResponse, JSONResponse
from app.models import Decision, User, AnalysisSnapshot, RoadmapRecord, Attachment
from app.config import settings
from app.schemas import (
    DecisionSynthesis,
    RoadmapData,
    RoadmapUpdateRequest,
    SnapshotDetail,
    SnapshotSummary,
    SynthesisRequest,
)
from app.services.recommendation import run_decision_synthesis
from app.services.report_generator import (
    generate_decision_markdown_report,
    generate_decision_json_report,
)
from app.auth import get_current_user, verify_ownership

logger = logging.getLogger("decisionlens.api.roadmap")

router = APIRouter(prefix="/decisions", tags=["Synthesis & Roadmap"])


@router.post(
    "/{decision_id}/synthesis",
    response_model=DecisionSynthesis,
    status_code=status.HTTP_200_OK,
    summary="Execute Final Decision Synthesis & Generate Roadmap",
)
def create_decision_synthesis(
    decision_id: int,
    payload: SynthesisRequest = SynthesisRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Synthesize all inputs, resolved gaps, web research citations, and framework outputs
    into a grounded recommendation or conditional next step, alternatives, evidence,
    assumptions, risks, counterarguments, confidence assessment, and an actionable roadmap.
    Preserves prior analysis versions by creating an immutable AnalysisSnapshot record.
    """
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    try:
        synthesis = run_decision_synthesis(
            decision=decision,
            db=db,
            user_priorities=payload.user_priorities,
            force_mock=payload.force_mock,
        )
        return synthesis
    except Exception as exc:
        logger.error("Synthesis error for decision %s: %s", decision_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis failed: {str(exc)}",
        )


@router.get(
    "/{decision_id}/synthesis",
    response_model=DecisionSynthesis,
    status_code=status.HTTP_200_OK,
    summary="Get Latest Decision Synthesis",
)
def get_decision_synthesis(
    decision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the latest decision synthesis for a decision."""
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    if not decision.recommendation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No recommendation synthesis has been generated for this decision yet.",
        )

    return DecisionSynthesis.model_validate(decision.recommendation)


@router.get(
    "/{decision_id}/synthesis/snapshots",
    response_model=List[SnapshotSummary],
    status_code=status.HTTP_200_OK,
    summary="List Immutable Analysis Snapshots",
)
def list_analysis_snapshots(
    decision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all historical immutable analysis snapshots for a decision, ordered newest first."""
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    snapshots = (
        db.query(AnalysisSnapshot)
        .filter(AnalysisSnapshot.decision_id == decision_id)
        .order_by(AnalysisSnapshot.version.desc())
        .all()
    )
    return snapshots


@router.get(
    "/{decision_id}/synthesis/snapshots/{snapshot_id}",
    response_model=SnapshotDetail,
    status_code=status.HTTP_200_OK,
    summary="Get Specific Analysis Snapshot Details",
)
def get_analysis_snapshot_detail(
    decision_id: int,
    snapshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve a specific historical immutable snapshot preserving exact prior analysis state."""
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    snapshot = (
        db.query(AnalysisSnapshot)
        .filter(
            AnalysisSnapshot.id == snapshot_id,
            AnalysisSnapshot.decision_id == decision_id,
        )
        .first()
    )
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis snapshot with ID {snapshot_id} not found for this decision",
        )

    return snapshot


@router.get(
    "/{decision_id}/roadmap",
    response_model=RoadmapData,
    status_code=status.HTTP_200_OK,
    summary="Get Active Execution Roadmap",
)
def get_active_roadmap(
    decision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the current active editable execution roadmap."""
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    active_record = (
        db.query(RoadmapRecord)
        .filter(
            RoadmapRecord.decision_id == decision_id,
            RoadmapRecord.is_active.is_(True),
        )
        .order_by(RoadmapRecord.version.desc())
        .first()
    )

    if active_record:
        return RoadmapData(
            title=active_record.title,
            phases=active_record.phases,
        )

    if decision.roadmap and "phases" in decision.roadmap:
        return RoadmapData.model_validate(decision.roadmap)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No roadmap has been generated for this decision yet.",
    )


@router.put(
    "/{decision_id}/roadmap",
    response_model=RoadmapData,
    status_code=status.HTTP_200_OK,
    summary="Update/Edit Execution Roadmap",
)
def update_active_roadmap(
    decision_id: int,
    payload: RoadmapUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Allow the user to edit roadmap tasks, phases, owners, and completion toggles.
    Preserves prior analysis snapshot versions without mutation.
    """
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    # Fetch active record or create one
    active_record = (
        db.query(RoadmapRecord)
        .filter(
            RoadmapRecord.decision_id == decision_id,
            RoadmapRecord.is_active.is_(True),
        )
        .order_by(RoadmapRecord.version.desc())
        .first()
    )

    updated_phases = [p.model_dump() for p in payload.phases]
    updated_title = payload.title or (active_record.title if active_record else "Implementation Roadmap")

    if active_record:
        active_record.phases = updated_phases
        active_record.title = updated_title
    else:
        active_record = RoadmapRecord(
            decision_id=decision.id,
            owner_id=decision.owner_id,
            version=1,
            title=updated_title,
            phases=updated_phases,
            is_active=True,
        )
        db.add(active_record)

    # Sync to decision model
    decision.roadmap = {
        "title": updated_title,
        "phases": updated_phases,
    }

    db.commit()
    db.refresh(active_record)

    return RoadmapData(
        title=active_record.title,
        phases=active_record.phases,
    )


# ==========================================
# Phase 11: Comprehensive Report Export
# ==========================================

@router.get(
    "/{decision_id}/export",
    summary="Export Comprehensive Decision Brief",
)
def export_decision_report(
    decision_id: int,
    format: str = "markdown",  # "markdown" or "json"
    download: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate an executive decision brief covering all intelligence stages.
    Supports markdown or json, with optional direct file download.
    """
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", decision.title)[:40] or f"decision_{decision.id}"

    if format.lower() == "json":
        json_data = generate_decision_json_report(decision)
        if download:
            return JSONResponse(
                content=json_data,
                headers={"Content-Disposition": f"attachment; filename=\"{slug}_decision_brief.json\""},
            )
        return json_data

    # Markdown format
    md_content = generate_decision_markdown_report(decision)
    if download:
        return PlainTextResponse(
            content=md_content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=\"{slug}_decision_brief.md\""},
        )

    return {
        "decision_id": decision.id,
        "title": decision.title,
        "format": "markdown",
        "content": md_content,
    }


@router.post(
    "/{decision_id}/export/save",
    summary="Save Exported Decision Brief to Attachments Library",
)
def save_decision_report_export(
    decision_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates the executive decision brief and saves it as an official attachment
    record in storage and database, making it permanently retrievable.
    """
    decision = db.query(Decision).filter(Decision.id == decision_id).first()
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision with ID {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, "decision")

    md_content = generate_decision_markdown_report(decision)
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", decision.title)[:40] or f"decision_{decision.id}"
    timestamp_suffix = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{slug}_Executive_Brief_{timestamp_suffix}.md"

    # Save to storage directory
    storage_file_path = settings.storage_path / f"export_{decision_id}_{timestamp_suffix}.md"
    with open(storage_file_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    file_size = len(md_content.encode("utf-8"))

    # Register as attachment
    attachment = Attachment(
        owner_id=current_user.id,
        decision_id=decision.id,
        original_name=filename,
        stored_path=str(storage_file_path),
        media_type="text/markdown",
        file_size=file_size,
        extracted_text=md_content,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return {
        "attachment_id": attachment.id,
        "filename": attachment.original_name,
        "file_size": attachment.file_size,
        "content": md_content,
        "created_at": attachment.created_at.isoformat(),
        "message": "Executive Decision Brief successfully saved to attachments library.",
    }
