import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user, verify_ownership
from app.database import get_db
from app.models import Decision, GoogleMeetBotSession, MeetingPrivateInput, User
from app.schemas import (
    BotFinishAndAnalyzeResponse,
    GoogleMeetBotSessionResponse,
    GoogleMeetJoinRequest,
    GoogleMeetSpeechStreamRequest,
    PrivateChatMessageCreate,
    PrivateChatMessageResponse,
    PublicBotInviteInfo,
)
from app.services.meeting_bot import (
    add_private_chat_message,
    create_or_join_bot_session,
    finish_bot_session_and_analyze,
    ingest_speech_chunk,
    validate_google_meet_url,
)

logger = logging.getLogger("decisionlens.api.meeting_bot")

router = APIRouter(tags=["Google Meet Bot & Private Chat"])


def _to_session_response(session: GoogleMeetBotSession, db: Session) -> GoogleMeetBotSessionResponse:
    # Count private messages
    msg_count = db.scalar(
        select(func.count(MeetingPrivateInput.id))
        .where(MeetingPrivateInput.decision_id == session.decision_id)
    ) or 0

    return GoogleMeetBotSessionResponse(
        id=session.id,
        decision_id=session.decision_id,
        meet_url=session.meet_url,
        bot_name=session.bot_name,
        status=session.status,
        language=session.language,
        recording_enabled=session.recording_enabled,
        distraction_filtering_enabled=session.distraction_filtering_enabled,
        started_at=session.started_at,
        ended_at=session.ended_at,
        raw_transcript=session.raw_transcript,
        cleaned_transcript=session.cleaned_transcript,
        participant_count=session.participant_count,
        private_chat_token=session.private_chat_token,
        private_chat_url=f"/meet-chat/{session.private_chat_token}",
        private_message_count=msg_count,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


# =========================================================================
# Decision-Scoped Bot Endpoints (Authenticated)
# =========================================================================

@router.post(
    "/decisions/{decision_id}/bot/join-meet",
    response_model=GoogleMeetBotSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Dispatch DecisionLens Bot to join a Google Meet call",
)
def join_google_meet(
    decision_id: int,
    req: GoogleMeetJoinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    is_valid, _, _ = validate_google_meet_url(req.meet_url)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Google Meet URL. Format should be: https://meet.google.com/abc-defg-hij or meet.google.com/abc-defg-hij",
        )

    try:
        session = create_or_join_bot_session(
            db=db,
            decision=decision,
            meet_url=req.meet_url,
            bot_name=req.bot_name or "DecisionLens Bot",
            language=req.language or "en",
            recording_enabled=req.recording_enabled if req.recording_enabled is not None else True,
            distraction_filtering=req.distraction_filtering if req.distraction_filtering is not None else True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return _to_session_response(session, db)


@router.get(
    "/decisions/{decision_id}/bot/sessions",
    response_model=List[GoogleMeetBotSessionResponse],
    summary="List all Google Meet bot sessions for a decision",
)
def list_bot_sessions(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    stmt = (
        select(GoogleMeetBotSession)
        .where(GoogleMeetBotSession.decision_id == decision_id)
        .order_by(GoogleMeetBotSession.created_at.desc())
    )
    sessions = db.scalars(stmt).all()
    return [_to_session_response(s, db) for s in sessions]


@router.get(
    "/decisions/{decision_id}/bot/sessions/{session_id}",
    response_model=GoogleMeetBotSessionResponse,
    summary="Get details and status of a Google Meet bot session",
)
def get_bot_session(
    decision_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    session = db.get(GoogleMeetBotSession, session_id)
    if not session or session.decision_id != decision_id:
        raise HTTPException(status_code=404, detail="Bot session not found")

    return _to_session_response(session, db)


@router.post(
    "/decisions/{decision_id}/bot/sessions/{session_id}/speech-stream",
    response_model=GoogleMeetBotSessionResponse,
    summary="Stream live transcribed speech from Google Meet into the bot session",
)
def stream_speech(
    decision_id: int,
    session_id: int,
    req: GoogleMeetSpeechStreamRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    session = db.get(GoogleMeetBotSession, session_id)
    if not session or session.decision_id != decision_id:
        raise HTTPException(status_code=404, detail="Bot session not found")

    updated_session = ingest_speech_chunk(
        db=db,
        session=session,
        text=req.text,
        speaker=req.speaker or "Speaker",
        timestamp=req.timestamp,
    )
    return _to_session_response(updated_session, db)


@router.post(
    "/decisions/{decision_id}/bot/sessions/{session_id}/private-chat",
    response_model=PrivateChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a private confidential message to the bot (facts, concerns, reasons, opinions)",
)
def post_private_chat_message(
    decision_id: int,
    session_id: int,
    req: PrivateChatMessageCreate,
    force_mock: bool = Query(False, description="Use deterministic bot response"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    session = db.get(GoogleMeetBotSession, session_id)
    if not session or session.decision_id != decision_id:
        raise HTTPException(status_code=404, detail="Bot session not found")

    author_name = current_user.display_name or current_user.email or "Participant"
    if req.is_anonymous:
        author_name = "Anonymous"

    msg = add_private_chat_message(
        db=db,
        decision=decision,
        session=session,
        message=req.message,
        author_name=author_name,
        author_role=req.author_role or "Participant",
        is_anonymous=req.is_anonymous if req.is_anonymous is not None else True,
        category=req.category or "concern",
        impact_level=req.impact_level or "high",
        force_mock=force_mock,
    )

    return PrivateChatMessageResponse(
        id=msg.id,
        decision_id=msg.decision_id,
        session_id=msg.session_id,
        author_name=msg.author_name,
        author_role=msg.author_role,
        is_anonymous=msg.is_anonymous,
        category=msg.category,
        message=msg.message,
        bot_response=msg.bot_response,
        impact_level=msg.impact_level,
        status=msg.status,
        created_at=msg.created_at,
    )


@router.get(
    "/decisions/{decision_id}/bot/sessions/{session_id}/private-chat",
    response_model=List[PrivateChatMessageResponse],
    summary="Get all private chat messages exchanged with the bot",
)
def get_private_chat_messages(
    decision_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    stmt = (
        select(MeetingPrivateInput)
        .where(
            MeetingPrivateInput.decision_id == decision_id,
            MeetingPrivateInput.status == "active",
        )
        .order_by(MeetingPrivateInput.created_at.asc())
    )
    msgs = db.scalars(stmt).all()

    return [
        PrivateChatMessageResponse(
            id=m.id,
            decision_id=m.decision_id,
            session_id=m.session_id,
            author_name=m.author_name,
            author_role=m.author_role,
            is_anonymous=m.is_anonymous,
            category=m.category,
            message=m.message,
            bot_response=m.bot_response,
            impact_level=m.impact_level,
            status=m.status,
            created_at=m.created_at,
        )
        for m in msgs
    ]


@router.post(
    "/decisions/{decision_id}/bot/sessions/{session_id}/finish-and-analyze",
    response_model=BotFinishAndAnalyzeResponse,
    summary="Finish Google Meet bot session, scrub tangents, and execute DecisionLens cognitive analysis",
)
def finish_meeting_and_analyze(
    decision_id: int,
    session_id: int,
    force_mock: bool = Query(False, description="Use deterministic AI structuring"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    session = db.get(GoogleMeetBotSession, session_id)
    if not session or session.decision_id != decision_id:
        raise HTTPException(status_code=404, detail="Bot session not found")

    result = finish_bot_session_and_analyze(
        db=db,
        decision=decision,
        session=session,
        force_mock=force_mock,
    )
    return result


# =========================================================================
# Public Participant Private Chat Endpoints (Token-based, No Auth Required)
# =========================================================================

@router.get(
    "/bot/invite/{token}",
    response_model=PublicBotInviteInfo,
    summary="Lookup meeting context for a confidential participant invite link",
)
def get_public_bot_invite_info(
    token: str,
    db: Session = Depends(get_db),
):
    stmt = select(GoogleMeetBotSession).where(GoogleMeetBotSession.private_chat_token == token)
    session = db.scalars(stmt).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid or expired meeting invite token")

    decision = db.get(Decision, session.decision_id)
    decision_title = decision.title if decision else "Architecture Decision"

    return PublicBotInviteInfo(
        session_id=session.id,
        decision_id=session.decision_id,
        decision_title=decision_title,
        meet_url=session.meet_url,
        bot_name=session.bot_name,
        status=session.status,
        token=token,
    )


@router.post(
    "/bot/invite/{token}/chat",
    response_model=PrivateChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a private confidential message to the bot using an invite token",
)
def public_participant_private_chat(
    token: str,
    req: PrivateChatMessageCreate,
    force_mock: bool = Query(False, description="Use deterministic bot response"),
    db: Session = Depends(get_db),
):
    stmt = select(GoogleMeetBotSession).where(GoogleMeetBotSession.private_chat_token == token)
    session = db.scalars(stmt).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid or expired meeting invite token")

    decision = db.get(Decision, session.decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Associated decision no longer exists")

    msg = add_private_chat_message(
        db=db,
        decision=decision,
        session=session,
        message=req.message,
        author_name=req.author_name or "Anonymous",
        author_role=req.author_role or "Participant",
        is_anonymous=req.is_anonymous if req.is_anonymous is not None else True,
        category=req.category or "concern",
        impact_level=req.impact_level or "high",
        force_mock=force_mock,
    )

    return PrivateChatMessageResponse(
        id=msg.id,
        decision_id=msg.decision_id,
        session_id=msg.session_id,
        author_name=msg.author_name,
        author_role=msg.author_role,
        is_anonymous=msg.is_anonymous,
        category=msg.category,
        message=msg.message,
        bot_response=msg.bot_response,
        impact_level=msg.impact_level,
        status=msg.status,
        created_at=msg.created_at,
    )


@router.get(
    "/bot/invite/{token}/history",
    response_model=List[PrivateChatMessageResponse],
    summary="Get recent chat history for this participant session token",
)
def public_participant_chat_history(
    token: str,
    db: Session = Depends(get_db),
):
    stmt = select(GoogleMeetBotSession).where(GoogleMeetBotSession.private_chat_token == token)
    session = db.scalars(stmt).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid or expired meeting invite token")

    msg_stmt = (
        select(MeetingPrivateInput)
        .where(
            MeetingPrivateInput.decision_id == session.decision_id,
            MeetingPrivateInput.session_id == session.id,
            MeetingPrivateInput.status == "active",
        )
        .order_by(MeetingPrivateInput.created_at.asc())
    )
    msgs = db.scalars(msg_stmt).all()

    return [
        PrivateChatMessageResponse(
            id=m.id,
            decision_id=m.decision_id,
            session_id=m.session_id,
            author_name=m.author_name,
            author_role=m.author_role,
            is_anonymous=m.is_anonymous,
            category=m.category,
            message=m.message,
            bot_response=m.bot_response,
            impact_level=m.impact_level,
            status=m.status,
            created_at=m.created_at,
        )
        for m in msgs
    ]
