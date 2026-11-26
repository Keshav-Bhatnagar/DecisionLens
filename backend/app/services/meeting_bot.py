import logging
import re
import secrets
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Decision, GoogleMeetBotSession, MeetingPrivateInput
from app.schemas import (
    BotFinishAndAnalyzeResponse,
    GoogleMeetBotSessionResponse,
    PrivateChatMessageResponse,
    StructuredFindings,
)
from app.services.ai import get_llm_client_and_model
from app.services.meeting_filter import filter_meeting_distractions
from app.services.structuring import run_decision_structuring

logger = logging.getLogger("decisionlens.meeting_bot")


def validate_google_meet_url(url: str) -> Tuple[bool, str, str]:
    """
    Validate and normalize a Google Meet URL or meeting code.
    Accepts:
      - https://meet.google.com/abc-defg-hij
      - http://meet.google.com/abc-defg-hij
      - meet.google.com/abc-defg-hij
      - abc-defg-hij
    Returns (is_valid, normalized_url, meeting_code).
    """
    if not url or not isinstance(url, str):
        return False, "", ""

    clean_url = url.strip()

    # Pattern for Google Meet code: 3 letters - 4 letters - 3 letters (or alphanumeric)
    code_match = re.search(r"([a-z0-9]{3})-([a-z0-9]{4})-([a-z0-9]{3})", clean_url, re.IGNORECASE)
    if code_match:
        meeting_code = f"{code_match.group(1).lower()}-{code_match.group(2).lower()}-{code_match.group(3).lower()}"
        normalized = f"https://meet.google.com/{meeting_code}"
        return True, normalized, meeting_code

    # Fallback pattern for Google Workspace meeting codes without hyphens or custom links
    custom_match = re.search(r"meet\.google\.com/([a-zA-Z0-9_-]+)", clean_url)
    if custom_match:
        meeting_code = custom_match.group(1).lower()
        normalized = f"https://meet.google.com/{meeting_code}"
        return True, normalized, meeting_code

    return False, "", ""


def create_or_join_bot_session(
    db: Session,
    decision: Decision,
    meet_url: str,
    bot_name: str = "DecisionLens Bot",
    language: str = "en",
    recording_enabled: bool = True,
    distraction_filtering: bool = True,
) -> GoogleMeetBotSession:
    """
    Initialize or retrieve an active bot session for Google Meet.
    Generates a secure token for participant private chat.
    """
    is_valid, normalized_url, _ = validate_google_meet_url(meet_url)
    if not is_valid:
        raise ValueError(
            f"Invalid Google Meet URL '{meet_url}'. Expected format: https://meet.google.com/abc-defg-hij"
        )

    # Check for existing active session for this decision and URL
    stmt = (
        select(GoogleMeetBotSession)
        .where(
            GoogleMeetBotSession.decision_id == decision.id,
            GoogleMeetBotSession.status.in_(["connecting", "active", "transcribing"]),
        )
        .order_by(GoogleMeetBotSession.created_at.desc())
    )
    existing = db.scalars(stmt).first()
    if existing:
        existing.meet_url = normalized_url
        existing.bot_name = bot_name or existing.bot_name
        existing.language = language or existing.language
        db.commit()
        db.refresh(existing)
        return existing

    # Create new bot session
    token = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)

    session = GoogleMeetBotSession(
        decision_id=decision.id,
        meet_url=normalized_url,
        bot_name=bot_name or "DecisionLens Bot",
        status="active",
        language=language,
        recording_enabled=recording_enabled,
        distraction_filtering_enabled=distraction_filtering,
        started_at=now,
        raw_transcript="",
        cleaned_transcript="",
        participant_count=1,
        private_chat_token=token,
        metadata_json={
            "initial_domain": decision.domain,
            "decision_title": decision.title,
            "bot_role": "AI Notetaker, Scribe & Confidential Listener",
        },
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info("Created Google Meet bot session id=%s for decision=%s", session.id, decision.id)
    return session


def ingest_speech_chunk(
    db: Session,
    session: GoogleMeetBotSession,
    text: str,
    speaker: str = "Speaker",
    timestamp: Optional[str] = None,
) -> GoogleMeetBotSession:
    """
    Append speech segment to the session transcript.
    """
    clean_text = text.strip()
    if not clean_text:
        return session

    time_tag = timestamp or datetime.now(timezone.utc).strftime("%H:%M:%S")
    line = f"[{time_tag}] {speaker}: {clean_text}\n"

    if session.raw_transcript:
        session.raw_transcript += line
    else:
        session.raw_transcript = line

    session.status = "active"
    db.commit()
    db.refresh(session)
    return session


def generate_bot_private_chat_reply(
    message: str,
    category: str,
    author_role: str,
    decision_title: str,
    force_mock: bool = False,
) -> str:
    """
    Generate an intelligent, empathetic, and confirming response from the DecisionLens Bot
    to a meeting participant who reached out confidentially.
    """
    if force_mock:
        return (
            f"Understood. As the DecisionLens Bot, I've confidentially recorded this {category} "
            f"regarding '{decision_title}'. It has been added to our private input triage and will be "
            f"incorporated into the decision's risk and fault-line analysis without exposing your identity."
        )

    client, model, _ = get_llm_client_and_model(task="structuring")
    if not client:
        return (
            f"Received. I have confidentially captured this {category} as a {author_role}. "
            f"It will be weighted in the final DecisionLens analysis alongside the meeting transcript."
        )

    system_prompt = (
        "You are the DecisionLens Bot — an AI scribe and confidential meeting advisor. "
        "A meeting participant is messaging you privately during a Google Meet call to share "
        "facts, concerns, reasons, or opinions they were not comfortable voicing out loud in front of the group. "
        "Acknowledge their input with high psychological safety, validate their perspective constructively, "
        "and assure them that their confidential point will be factored into the decision analysis, "
        "trade-offs, and fault lines without compromising their anonymity. "
        "Keep your reply concise, professional, and reassuring (under 3 sentences)."
    )

    user_prompt = (
        f"Decision Topic: {decision_title}\n"
        f"Participant Role: {author_role}\n"
        f"Category: {category}\n"
        f"Private Message: {message}\n"
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=150,
        )
        reply = resp.choices[0].message.content
        return reply.strip() if reply else "Thank you. Your input has been recorded confidentially."
    except Exception as exc:
        logger.warning("Could not generate LLM private reply (%s). Using fallback.", exc)
        return (
            f"Thank you for sharing this {category} confidentially. I have logged it securely, "
            f"and it will be factored into the decision analysis without revealing your identity."
        )


def add_private_chat_message(
    db: Session,
    decision: Decision,
    message: str,
    session: Optional[GoogleMeetBotSession] = None,
    author_name: str = "Anonymous",
    author_role: str = "Participant",
    is_anonymous: bool = True,
    category: str = "concern",
    impact_level: str = "high",
    force_mock: bool = False,
) -> MeetingPrivateInput:
    """
    Record a participant's private message to the bot and generate an AI response.
    """
    clean_msg = message.strip()
    if not clean_msg:
        raise ValueError("Private message cannot be empty")

    valid_categories = {"concern", "fact", "opinion", "alternative", "constraint"}
    norm_cat = category.lower().strip() if category else "concern"
    if norm_cat not in valid_categories:
        norm_cat = "concern"

    bot_reply = generate_bot_private_chat_reply(
        message=clean_msg,
        category=norm_cat,
        author_role=author_role,
        decision_title=decision.title or "Architecture Decision",
        force_mock=force_mock,
    )

    now = datetime.now(timezone.utc)
    private_input = MeetingPrivateInput(
        decision_id=decision.id,
        session_id=session.id if session else None,
        author_name=author_name or "Anonymous",
        author_role=author_role or "Participant",
        is_anonymous=is_anonymous,
        category=norm_cat,
        message=clean_msg,
        bot_response=bot_reply,
        impact_level=impact_level or "high",
        status="active",
        created_at=now,
    )
    db.add(private_input)
    db.commit()
    db.refresh(private_input)
    logger.info("Saved private input id=%s for decision=%s (cat=%s)", private_input.id, decision.id, norm_cat)
    return private_input


def finish_bot_session_and_analyze(
    db: Session,
    decision: Decision,
    session: GoogleMeetBotSession,
    force_mock: bool = False,
) -> BotFinishAndAnalyzeResponse:
    """
    Complete the Google Meet bot session:
    1. Filter out meeting chit-chat / tangents from transcript.
    2. Store cleaned transcript in decision.
    3. Aggregate all confidential private chat inputs.
    4. Run Stage 2 Cognitive Structuring across meeting transcript + private inputs.
    5. Return full analysis response.
    """
    now = datetime.now(timezone.utc)
    session.status = "completed"
    session.ended_at = now
    db.commit()

    raw_text = session.raw_transcript.strip()

    # 1. Distraction filtering (skip LLM call if transcript is empty)
    if raw_text:
        filter_res = filter_meeting_distractions(
            transcript=raw_text,
            decision_title=decision.title or "",
            decision_context=decision.problem_statement or decision.description or "",
            force_heuristics=force_mock,
        )
        session.cleaned_transcript = filter_res.cleaned_transcript
        final_transcript = filter_res.cleaned_transcript or raw_text
        tangents_count = len(filter_res.removed_tangents)
        signal_ratio = filter_res.signal_ratio
    else:
        session.cleaned_transcript = ""
        final_transcript = ""
        tangents_count = 0
        signal_ratio = 1.0

    # 2. Update decision transcript
    decision.transcript = final_transcript
    decision.transcript_reviewed = True

    # 3. Fetch all active private inputs for this decision
    stmt = (
        select(MeetingPrivateInput)
        .where(
            MeetingPrivateInput.decision_id == decision.id,
            MeetingPrivateInput.status == "active",
        )
        .order_by(MeetingPrivateInput.created_at.asc())
    )
    private_inputs = db.scalars(stmt).all()

    # Update decision description with clear private findings summary if not already appended
    if private_inputs:
        summary_lines = []
        for p in private_inputs:
            author_tag = "Anonymous" if p.is_anonymous else f"{p.author_name} ({p.author_role})"
            summary_lines.append(f"- [{p.category.upper()} | {p.author_role}]: {p.message} (From: {author_tag})")

        private_block = "\n\n### Confidential Meeting Inputs (Private Bot Chat):\n" + "\n".join(summary_lines)
        if "### Confidential Meeting Inputs (Private Bot Chat):" not in (decision.description or ""):
            decision.description = (decision.description or "").strip() + private_block

    db.commit()
    db.refresh(session)
    db.refresh(decision)

    # 4. Trigger AI Structuring across transcript + private inputs (only when content exists)
    structured_findings = None
    if final_transcript or private_inputs:
        try:
            findings, _ = run_decision_structuring(decision=decision, db=db, force_mock=force_mock)
            structured_findings = findings
        except Exception as exc:
            logger.warning("Auto-structuring after meeting failed (%s). Continuing.", exc)

    meta = session.metadata_json or {}
    session_response = GoogleMeetBotSessionResponse(
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
        private_message_count=len(private_inputs),
        runner_note=meta.get("runner_note"),
        audio_chunks_received=int(meta.get("audio_chunks_received") or 0),
        created_at=session.created_at,
        updated_at=session.updated_at,
    )

    return BotFinishAndAnalyzeResponse(
        session=session_response,
        transcript=final_transcript,
        tangents_filtered_count=tangents_count,
        signal_ratio=signal_ratio,
        private_inputs_count=len(private_inputs),
        structured_findings=structured_findings,
        message="Google Meet session completed and DecisionLens cognitive analysis executed successfully.",
    )
