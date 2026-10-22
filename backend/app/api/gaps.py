import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, verify_ownership
from app.database import get_db
from app.models import Decision, User
from app.schemas import (
    DecisionResearchResponse,
    GapAnswerRequest,
    GapItem,
    GapResearchRequest,
    GapsResponse,
    ResearchExecuteResponse,
    ResearchFindingItem,
)
from app.services.gaps import detect_decision_gaps
from app.services.search import (
    SearchProviderNotConfiguredError,
    analyze_evidence_and_synthesize,
    execute_web_search,
    generate_narrow_search_query,
)

logger = logging.getLogger("decisionlens.api.gaps")

VALID_RESEARCH_METHODS = {"web_research"}

router = APIRouter(prefix="/decisions/{decision_id}", tags=["Gap Detection & Web Research"])


def _recalculate_gap_counts(gaps_data: dict) -> dict:
    """Helper to sync counts across pending, answered, skipped, research_queued, and researched."""
    gaps_list = gaps_data.get("gaps", [])
    gaps_data["total_gaps"] = len(gaps_list)
    gaps_data["pending_count"] = sum(1 for g in gaps_list if g.get("status") == "pending")
    gaps_data["answered_count"] = sum(1 for g in gaps_list if g.get("status") == "answered")
    gaps_data["skipped_count"] = sum(1 for g in gaps_list if g.get("status") == "skipped")
    gaps_data["research_queued_count"] = sum(1 for g in gaps_list if g.get("status") == "research_queued")
    gaps_data["researched_count"] = sum(
        1 for g in gaps_list if g.get("status") in ["researched", "research_completed"]
    )
    return gaps_data


@router.post(
    "/gaps/detect",
    response_model=GapsResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect prioritized information gaps for a decision",
)
def detect_gaps(
    decision_id: int,
    force_mock: bool = Query(False, description="Force deterministic mock gap detection"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analyze decision context and structured points to extract prioritized,
    actionable questions with reasons, importance, affected options, and resolution methods.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    return detect_decision_gaps(decision, db, force_mock=force_mock)


@router.get(
    "/gaps",
    response_model=GapsResponse,
    summary="Get all detected information gaps and their resolution statuses",
)
def get_gaps(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all detected information gaps for a decision."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    gaps_data = decision.gaps or {}
    raw_list = gaps_data.get("gaps", [])
    gap_items = [GapItem.model_validate(g) for g in raw_list]

    return GapsResponse(
        decision_id=decision.id,
        gaps=gap_items,
        detected_at=gaps_data.get("detected_at"),
        total_gaps=len(gap_items),
        pending_count=sum(1 for g in gap_items if g.status == "pending"),
        answered_count=sum(1 for g in gap_items if g.status == "answered"),
        skipped_count=sum(1 for g in gap_items if g.status == "skipped"),
        research_queued_count=sum(1 for g in gap_items if g.status == "research_queued"),
        researched_count=sum(1 for g in gap_items if g.status in ["researched", "research_completed"]),
    )


@router.post(
    "/gaps/{gap_id}/answer",
    response_model=GapItem,
    summary="Answer a gap (Ask Me) or skip it (keeping it explicitly unknown)",
)
def answer_gap(
    decision_id: int,
    gap_id: str,
    payload: GapAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ask Me action:
    - If answer provided: stores answer, sets status='answered', and incorporates fact into decision context.
    - If skipped: sets status='skipped' and keeps the gap marked as explicitly unknown.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    gaps_data = dict(decision.gaps) if decision.gaps else {"gaps": []}
    gaps_list = gaps_data.get("gaps", [])

    target_gap = None
    for g in gaps_list:
        if g.get("id") == gap_id:
            target_gap = g
            break

    if not target_gap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Information gap with ID '{gap_id}' not found for this decision.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    target_gap["updated_at"] = now_iso

    # Process Skip vs Answer
    if payload.skip or (not payload.answer or not payload.answer.strip()):
        # Skipped gaps remain explicitly marked as unknown
        target_gap["status"] = "skipped"
        target_gap["answer"] = None

        # Ensure points['unknowns'] retains this item
        if decision.points and isinstance(decision.points, dict):
            pts = dict(decision.points)
            unknowns = list(pts.get("unknowns", []))
            unresolved_note = f"Unresolved Gap: {target_gap['question']}"
            if unresolved_note not in unknowns:
                unknowns.append(unresolved_note)
            pts["unknowns"] = unknowns
            decision.points = pts
    else:
        # User provided an answer
        clean_answer = payload.answer.strip()
        target_gap["status"] = "answered"
        target_gap["answer"] = clean_answer

        # Incorporate user answer into decision points as a verified fact
        if decision.points and isinstance(decision.points, dict):
            pts = dict(decision.points)
            facts = list(pts.get("facts", []))
            new_fact = f"User Verified ({target_gap['question']}): {clean_answer}"
            if new_fact not in facts:
                facts.append(new_fact)
            pts["facts"] = facts
            decision.points = pts

    # Recalculate summary stats
    gaps_data["gaps"] = gaps_list
    decision.gaps = _recalculate_gap_counts(gaps_data)

    db.commit()
    db.refresh(decision)

    return GapItem.model_validate(target_gap)


@router.post(
    "/gaps/{gap_id}/research",
    response_model=GapItem,
    summary="Complete Research This gap action via narrowly scoped web search",
)
def research_gap(
    decision_id: int,
    gap_id: str,
    payload: GapResearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Research This action (Phase 8):
    - Validates resolution_method is 'web_research'.
    - Verifies gap exists (returns 404 if missing).
    - Generates a narrowly scoped query targeting specific metrics/options.
    - If execute=True (default): executes search against configured provider, extracts sources
      (title, url, timestamp, claims, reliability), analyzes consensus (single-source vs conflicting),
      enforces verification rules (never marks unsupported verified), and stores results.
    - If provider is unconfigured, returns clean HTTP 503 error state.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    # Validate resolution method strictly
    method = payload.resolution_method.strip().lower()
    if method not in VALID_RESEARCH_METHODS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid resolution method '{payload.resolution_method}'. Allowed methods: {', '.join(sorted(VALID_RESEARCH_METHODS))}",
        )

    gaps_data = dict(decision.gaps) if decision.gaps else {"gaps": []}
    gaps_list = gaps_data.get("gaps", [])

    target_gap = None
    for g in gaps_list:
        if g.get("id") == gap_id:
            target_gap = g
            break

    if not target_gap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Information gap with ID '{gap_id}' not found for this decision.",
        )

    # Generate narrowly scoped search query
    narrow_query = generate_narrow_search_query(
        question=target_gap["question"],
        reason=target_gap.get("reason", ""),
        affected_options=target_gap.get("affected_options", []),
        custom_query=payload.custom_query,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    target_gap["updated_at"] = now_iso
    target_gap["research_query"] = narrow_query

    research_dict = dict(decision.research) if decision.research else {"requests": [], "findings": []}
    requests_list = list(research_dict.get("requests", []))
    findings_list = list(research_dict.get("findings", []))

    if not payload.execute:
        # Just queue the request (Phase 7 compatibility)
        target_gap["status"] = "research_queued"
        existing_req = next((r for r in requests_list if r.get("gap_id") == gap_id), None)
        if existing_req:
            existing_req["query"] = narrow_query
            existing_req["status"] = "queued"
            existing_req["queued_at"] = now_iso
        else:
            requests_list.append({
                "gap_id": gap_id,
                "query": narrow_query,
                "status": "queued",
                "queued_at": now_iso,
                "results": [],
            })
    else:
        # Execute research against configured provider
        try:
            raw_sources = execute_web_search(narrow_query, force_mock=payload.force_mock)
        except SearchProviderNotConfiguredError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=exc.message,
            )

        finding = analyze_evidence_and_synthesize(
            gap_id=gap_id,
            question=target_gap["question"],
            narrow_query=narrow_query,
            raw_results=raw_sources,
        )

        # Store finding
        existing_finding_idx = next((i for i, f in enumerate(findings_list) if f.get("gap_id") == gap_id), None)
        if existing_finding_idx is not None:
            findings_list[existing_finding_idx] = finding.model_dump()
        else:
            findings_list.append(finding.model_dump())

        # Update request entry to completed
        existing_req = next((r for r in requests_list if r.get("gap_id") == gap_id), None)
        if existing_req:
            existing_req["query"] = narrow_query
            existing_req["status"] = "completed"
            existing_req["executed_at"] = now_iso
            existing_req["finding_id"] = finding.id
        else:
            requests_list.append({
                "gap_id": gap_id,
                "query": narrow_query,
                "status": "completed",
                "queued_at": now_iso,
                "executed_at": now_iso,
                "finding_id": finding.id,
            })

        # Update gap status and answer
        target_gap["status"] = "researched"
        target_gap["answer"] = finding.synthesis

        # Integrate verified claims into decision context
        if decision.points and isinstance(decision.points, dict):
            pts = dict(decision.points)
            if finding.is_verified:
                facts = list(pts.get("facts", []))
                res_fact = f"Web Researched ({target_gap['question']}): {finding.synthesis}"
                if res_fact not in facts:
                    facts.append(res_fact)
                pts["facts"] = facts
            elif finding.consensus == "conflicting_evidence":
                contradictions = list(pts.get("contradictions", []))
                conflict_note = f"Conflicting Research Evidence ({target_gap['question']}): {finding.synthesis}"
                if conflict_note not in contradictions:
                    contradictions.append(conflict_note)
                pts["contradictions"] = contradictions
            elif finding.consensus == "unsupported":
                unknowns = list(pts.get("unknowns", []))
                unsupp_note = f"Unsupported by Research ({target_gap['question']}): No credible evidence found"
                if unsupp_note not in unknowns:
                    unknowns.append(unsupp_note)
                pts["unknowns"] = unknowns
            decision.points = pts

    research_dict["requests"] = requests_list
    research_dict["findings"] = findings_list
    decision.research = research_dict

    # Recalculate summary stats
    gaps_data["gaps"] = gaps_list
    decision.gaps = _recalculate_gap_counts(gaps_data)

    db.commit()
    db.refresh(decision)

    return GapItem.model_validate(target_gap)


@router.get(
    "/research",
    response_model=DecisionResearchResponse,
    summary="Get all research inquiries, sources, and synthesized findings for a decision",
)
def get_decision_research(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve full research evidence logs, sources, and consensus findings for a decision."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    res_data = decision.research or {}
    raw_findings = res_data.get("findings", [])
    findings_items = [ResearchFindingItem.model_validate(f) for f in raw_findings]

    return DecisionResearchResponse(
        decision_id=decision.id,
        requests=res_data.get("requests", []),
        findings=findings_items,
        total_findings=len(findings_items),
    )


@router.post(
    "/gaps/{gap_id}/research/execute",
    response_model=ResearchExecuteResponse,
    summary="Directly execute web research for an information gap using narrowly scoped queries",
)
def execute_gap_research_endpoint(
    decision_id: int,
    gap_id: str,
    custom_query: Optional[str] = Query(None, description="Optional custom search query"),
    force_mock: bool = Query(False, description="Force deterministic mock search provider"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Directly execute web research for a gap:
    - Generates narrowly scoped query
    - Queries configured search provider (or mock)
    - Synthesizes findings with provenance, reliability, and claim consensus
    - Returns full ResearchExecuteResponse
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    gaps_data = dict(decision.gaps) if decision.gaps else {"gaps": []}
    gaps_list = gaps_data.get("gaps", [])

    target_gap = None
    for g in gaps_list:
        if g.get("id") == gap_id:
            target_gap = g
            break

    if not target_gap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Information gap with ID '{gap_id}' not found for this decision.",
        )

    narrow_query = generate_narrow_search_query(
        question=target_gap["question"],
        reason=target_gap.get("reason", ""),
        affected_options=target_gap.get("affected_options", []),
        custom_query=custom_query,
    )

    try:
        raw_sources = execute_web_search(narrow_query, force_mock=force_mock)
    except SearchProviderNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )

    finding = analyze_evidence_and_synthesize(
        gap_id=gap_id,
        question=target_gap["question"],
        narrow_query=narrow_query,
        raw_results=raw_sources,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    target_gap["status"] = "researched"
    target_gap["research_query"] = narrow_query
    target_gap["answer"] = finding.synthesis
    target_gap["updated_at"] = now_iso

    research_dict = dict(decision.research) if decision.research else {"requests": [], "findings": []}
    requests_list = list(research_dict.get("requests", []))
    findings_list = list(research_dict.get("findings", []))

    # Store or update finding
    existing_finding_idx = next((i for i, f in enumerate(findings_list) if f.get("gap_id") == gap_id), None)
    if existing_finding_idx is not None:
        findings_list[existing_finding_idx] = finding.model_dump()
    else:
        findings_list.append(finding.model_dump())

    # Update or add request
    existing_req = next((r for r in requests_list if r.get("gap_id") == gap_id), None)
    if existing_req:
        existing_req["query"] = narrow_query
        existing_req["status"] = "completed"
        existing_req["executed_at"] = now_iso
        existing_req["finding_id"] = finding.id
    else:
        requests_list.append({
            "gap_id": gap_id,
            "query": narrow_query,
            "status": "completed",
            "queued_at": now_iso,
            "executed_at": now_iso,
            "finding_id": finding.id,
        })

    # Integrate into decision context
    if decision.points and isinstance(decision.points, dict):
        pts = dict(decision.points)
        if finding.is_verified:
            facts = list(pts.get("facts", []))
            res_fact = f"Web Researched ({target_gap['question']}): {finding.synthesis}"
            if res_fact not in facts:
                facts.append(res_fact)
            pts["facts"] = facts
        elif finding.consensus == "conflicting_evidence":
            contradictions = list(pts.get("contradictions", []))
            conflict_note = f"Conflicting Research Evidence ({target_gap['question']}): {finding.synthesis}"
            if conflict_note not in contradictions:
                contradictions.append(conflict_note)
            pts["contradictions"] = contradictions
        elif finding.consensus == "unsupported":
            unknowns = list(pts.get("unknowns", []))
            unsupp_note = f"Unsupported by Research ({target_gap['question']}): No credible evidence found"
            if unsupp_note not in unknowns:
                unknowns.append(unsupp_note)
            pts["unknowns"] = unknowns
        decision.points = pts

    research_dict["requests"] = requests_list
    research_dict["findings"] = findings_list
    decision.research = research_dict

    gaps_data["gaps"] = gaps_list
    decision.gaps = _recalculate_gap_counts(gaps_data)

    db.commit()
    db.refresh(decision)

    return ResearchExecuteResponse(
        decision_id=decision.id,
        gap_id=gap_id,
        finding=finding,
        updated_gap=GapItem.model_validate(target_gap),
        message="Web research executed and synthesized successfully",
    )
