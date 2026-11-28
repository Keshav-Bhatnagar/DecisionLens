from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.database import get_db
from app.models import User, Folder, Decision
from app.schemas import (
    DecisionCreate,
    DecisionUpdate,
    DecisionResponse,
    DecisionDomain,
    MemberResponse,
    MeetingTakeawaysRequest,
    MeetingTakeawaysResponse,
    DecisionAskRequest,
    DecisionAskResponse,
)
from app.auth import (
    get_current_user,
    verify_ownership,
    get_accessible_folder_ids,
    verify_folder_access,
    verify_decision_access,
)
from sqlalchemy.orm.attributes import flag_modified

router = APIRouter(prefix="/decisions", tags=["Decisions"])


def attach_folder_seq(decision: Decision, db: Session) -> DecisionResponse:
    """Attach 1-based chronological sequence index within the decision's folder."""
    resp = DecisionResponse.model_validate(decision)
    if decision.folder_id:
        seq = db.scalar(
            select(func.count(Decision.id)).where(
                Decision.folder_id == decision.folder_id,
                Decision.created_at <= decision.created_at,
            )
        ) or 1
        resp.folder_seq = seq
    return resp


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

    problem_stmt = (
        body.problem_statement.strip()
        if body.problem_statement is not None
        else clean_title
    )

    # Domain selection & precedence architecture:
    # 1. An explicitly selected decision domain must take top precedence over folder domain.
    # 2. If decision domain is AUTO, None, or empty: classify the decision using title & problem statement.
    # 3. If text classification is inconclusive/empty, inherit the folder's domain (if not AUTO) as suggestion.
    user_domain = (body.domain or "").strip().upper()
    valid_domains = [d.value for d in DecisionDomain]

    if user_domain and user_domain != "AUTO" and user_domain in valid_domains:
        initial_domain = user_domain
        domain_source = "manual"
        domain_confidence = 1.0
    else:
        from app.services.framework_engine import classify_text_domain
        detected_domain, detected_conf = classify_text_domain(
            title=clean_title,
            problem_statement=problem_stmt,
            context_text=body.description or "",
        )
        if detected_domain in valid_domains and detected_conf >= 0.5:
            initial_domain = detected_domain
            domain_source = "ai_detected"
            domain_confidence = detected_conf
        elif folder.domain and folder.domain not in ("AUTO", "") and folder.domain in valid_domains:
            initial_domain = folder.domain
            domain_source = "inherited"
            domain_confidence = 0.75
        else:
            initial_domain = detected_domain if detected_domain in valid_domains else "BUSINESS"
            domain_source = "ai_detected"
            domain_confidence = detected_conf or 0.5

    decision = Decision(
        owner_id=current_user.id,
        folder_id=body.folder_id,
        title=clean_title,
        description=body.description.strip() if body.description else "",
        problem_statement=problem_stmt,
        record_type=body.record_type or "decision",
        status=body.status or "draft",
        domain=initial_domain,
        domain_source=domain_source,
        domain_confidence=domain_confidence,
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

    return attach_folder_seq(decision, db)


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
    """List decisions for the authenticated user (including shared workspaces), optionally filtered by folder."""
    accessible_folder_ids = get_accessible_folder_ids(db, current_user)
    from sqlalchemy import or_

    if accessible_folder_ids:
        stmt = select(Decision).where(
            or_(
                Decision.owner_id == current_user.id,
                Decision.folder_id.in_(accessible_folder_ids),
            )
        )
    else:
        stmt = select(Decision).where(Decision.owner_id == current_user.id)

    if folder_id is not None:
        folder = db.get(Folder, folder_id)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        verify_folder_access(db, folder, current_user)
        stmt = stmt.where(Decision.folder_id == folder_id)

    stmt = stmt.order_by(Decision.created_at.desc())
    decisions = db.scalars(stmt).all()
    if folder_id is not None:
        chronological_ids = [d.id for d in sorted(decisions, key=lambda x: x.created_at)]
        id_to_seq = {did: idx + 1 for idx, did in enumerate(chronological_ids)}
        results = []
        for d in decisions:
            r = DecisionResponse.model_validate(d)
            r.folder_seq = id_to_seq.get(d.id, 1)
            results.append(r)
        return results
    return [attach_folder_seq(d, db) for d in decisions]


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

    verify_decision_access(db, decision, current_user)

    return attach_folder_seq(decision, db)


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

    verify_decision_access(db, decision, current_user)

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
        if body.status == "decided" and not body.fault_lines and (not decision.fault_lines or not any(decision.fault_lines.values())):
            decision.fault_lines = {
                "Assumptions": 2,
                "Evidence": 2,
                "Blind spots": 2,
                "Bias": 2,
                "Trade-offs": 2,
                "Alternatives": 2,
            }
    if body.domain is not None:
        clean_dom = body.domain.strip().upper()
        valid_domains = [d.value for d in DecisionDomain]
        if clean_dom == "AUTO":
            from app.services.framework_engine import classify_text_domain
            detected_domain, detected_conf = classify_text_domain(
                title=decision.title or "",
                problem_statement=decision.problem_statement or "",
                context_text=f"{decision.description or ''} {decision.raw_input or ''}",
            )
            decision.domain = detected_domain
            decision.domain_source = "ai_detected"
            decision.domain_confidence = detected_conf
        elif clean_dom in valid_domains:
            decision.domain = clean_dom
            decision.domain_source = body.domain_source or "manual"
            decision.domain_confidence = body.domain_confidence or 1.0

        if hasattr(decision, "_detected_domain_cache"):
            delattr(decision, "_detected_domain_cache")
        if isinstance(decision.analysis, dict):
            decision.analysis["domain_metadata"] = {
                "domain": decision.domain,
                "source": decision.domain_source,
                "confidence": decision.domain_confidence,
            }
            flag_modified(decision, "analysis")

    if body.language is not None:
        decision.language = body.language
    if body.raw_input is not None:
        decision.raw_input = body.raw_input
    if body.fault_lines is not None:
        decision.fault_lines = body.fault_lines

    db.commit()
    db.refresh(decision)

    return attach_folder_seq(decision, db)


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

    verify_decision_access(db, decision, current_user)

    db.delete(decision)
    db.commit()

    return {"status": "deleted", "id": decision_id}


@router.get(
    "/{decision_id}/members",
    response_model=List[MemberResponse],
    summary="List all allowed collaborators for this decision workspace",
)
def list_decision_members(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all allowed collaborators for this decision's workspace."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_decision_access(db, decision, current_user)

    from app.api.folders import list_folder_members
    return list_folder_members(folder_id=decision.folder_id, db=db, current_user=current_user)


@router.post(
    "/{decision_id}/takeaways",
    response_model=MeetingTakeawaysResponse,
    summary="Generate executive meeting takeaways, action matrix, and company memos",
)
def get_meeting_takeaways(
    decision_id: int,
    body: Optional[MeetingTakeawaysRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Synthesize enterprise meeting takeaways, silent stakeholder caveats,
    and action items into executive-ready outputs (Slack & Email formats).
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_decision_access(db, decision, current_user)

    from app.services.meeting_takeaways import generate_meeting_takeaways

    notes = body.notes if body else None
    transcript = body.transcript if body else None
    agenda = body.agenda if body else None
    force_mock = body.force_mock if body else False

    return generate_meeting_takeaways(
        decision=decision,
        notes=notes,
        transcript=transcript,
        agenda=agenda,
        force_mock=force_mock,
        db=db,
    )


@router.post(
    "/{decision_id}/ask",
    response_model=DecisionAskResponse,
    summary="Ask a follow-up question grounded in the full decision record",
)
def ask_decision_followup(
    decision_id: int,
    req: DecisionAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Answer any follow-up or 'what-if' question about this decision, grounded in
    its problem statement, notes, transcript, gaps, MAUT scores, synthesis memo,
    roadmap, and attached RAG documents.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_decision_access(db, decision, current_user)

    from app.services.decision_qa import answer_decision_question

    return answer_decision_question(
        decision=decision,
        question=req.question,
        history=req.history,
        force_mock=req.force_mock,
    )
