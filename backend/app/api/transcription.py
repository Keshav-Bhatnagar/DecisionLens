import logging
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user, verify_ownership
from app.database import get_db
from app.models import AudioRecording, Decision, User
from app.schemas import (
    AudioRecordingResponse,
    TranscriptUpdate,
    TranscriptionResponse,
)
from app.services.audio import (
    SUPPORTED_LANGUAGES,
    process_and_store_audio,
    transcribe_audio_file,
)

logger = logging.getLogger("decisionlens.api.transcription")

router = APIRouter(prefix="/decisions/{decision_id}/transcription", tags=["Audio & Transcription"])


@router.post(
    "",
    response_model=TranscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload audio recording, normalize with FFmpeg, and transcribe",
)
async def upload_and_transcribe_audio(
    decision_id: int,
    file: UploadFile = File(...),
    language: str = Form("en"),
    apply_enhancement: bool = Form(True),
    force_mock: bool = Form(False),
    client_transcript: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload an audio recording (.wav, .mp3, .m4a, .webm, .ogg), validate duration/size,
    normalize audio volume & filter noise via FFmpeg, and transcribe via hosted speech-to-text.
    Strictly limited to English ('en') and Hindi ('hi').
    Saves original audio securely to support retrying with original unenhanced audio.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    # Validate language parameter
    norm_lang = language.strip().lower()
    if norm_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language '{language}'. DecisionLens strictly supports English ('en') and Hindi ('hi').",
        )

    # Read audio bytes
    content = await file.read()
    original_filename = file.filename or "recording.wav"

    # Store original audio and run FFmpeg enhancement (normalization + noise filtering)
    original_path, enhanced_path, duration, used_enhanced = process_and_store_audio(
        content=content,
        original_filename=original_filename,
        mime_type=file.content_type,
        language=norm_lang,
        apply_enhancement=apply_enhancement,
    )

    # Target path for initial transcription attempt
    target_path = enhanced_path if (used_enhanced and enhanced_path) else original_path

    # Transcribe audio with automatic retry on original if enhancement causes an issue
    transcript_text = ""
    try:
        transcript_text = transcribe_audio_file(
            audio_path=target_path,
            language=norm_lang,
            force_mock=force_mock,
            client_transcript=client_transcript,
        )
    except Exception as exc:
        if used_enhanced and enhanced_path:
            logger.warning(f"Transcription on enhanced audio failed ({exc}). Retrying with unenhanced original audio.")
            transcript_text = transcribe_audio_file(
                audio_path=original_path,
                language=norm_lang,
                force_mock=force_mock,
                client_transcript=client_transcript,
            )
            used_enhanced = False
        else:
            raise exc

    if not transcript_text or not transcript_text.strip():
        if client_transcript and client_transcript.strip():
            transcript_text = client_transcript.strip()
        else:
            transcript_text = (
                "इस रिकॉर्डिंग में कोई स्पष्ट आवाज़ नहीं मिली। कृपया माइक्रोफ़ोन चेक करें और साफ़ बोलें।"
                if norm_lang == "hi"
                else "No clear speech was detected in this recording. Please verify your microphone and speak clearly."
            )

    # Record audio recording metadata in database
    audio_rec = AudioRecording(
        owner_id=current_user.id,
        decision_id=decision.id,
        original_filename=original_filename,
        original_path=str(original_path),
        enhanced_path=str(enhanced_path) if enhanced_path else None,
        media_type=file.content_type or "audio/wav",
        duration_seconds=duration,
        file_size=len(content),
        language=norm_lang,
        used_enhanced=used_enhanced,
    )
    db.add(audio_rec)

    # Update decision transcript fields
    decision.transcript = transcript_text
    decision.language = norm_lang
    decision.transcript_reviewed = False

    # Incorporate into decision raw_input for downstream modules
    transcript_header = f"\n\n[Voice Recording Transcript ({norm_lang.upper()})]\n{transcript_text}"
    if decision.raw_input:
        decision.raw_input += transcript_header
    else:
        decision.raw_input = transcript_header.strip()

    db.commit()
    db.refresh(audio_rec)
    db.refresh(decision)

    return TranscriptionResponse(
        transcript=decision.transcript,
        language=decision.language,
        transcript_reviewed=decision.transcript_reviewed,
        used_enhanced=audio_rec.used_enhanced,
        audio_id=audio_rec.id,
        audio_recording=AudioRecordingResponse.model_validate(audio_rec),
        message="Audio transcribed successfully",
    )


@router.post(
    "/retry-original",
    response_model=TranscriptionResponse,
    summary="Retry transcription using the unenhanced original audio",
)
def retry_with_original_audio(
    decision_id: int,
    force_mock: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rerun transcription using the unenhanced original audio recording
    in case FFmpeg enhancement altered voice characteristics or speech-to-text failed.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    # Fetch latest audio recording for this decision
    stmt = (
        select(AudioRecording)
        .where(AudioRecording.decision_id == decision_id, AudioRecording.owner_id == current_user.id)
        .order_by(AudioRecording.created_at.desc())
    )
    audio_rec = db.scalars(stmt).first()
    if not audio_rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No audio recording found for this decision to retry.",
        )

    original_file = Path(audio_rec.original_path)
    if not original_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original stored audio file could not be found on disk.",
        )

    # Transcribe using original audio
    transcript_text = transcribe_audio_file(
        audio_path=original_file,
        language=audio_rec.language,
        force_mock=force_mock,
    )

    if not transcript_text or not transcript_text.strip():
        transcript_text = (
            "इस रिकॉर्डिंग में कोई स्पष्ट आवाज़ नहीं मिली। कृपया माइक्रोफ़ोन चेक करें और साफ़ बोलें।"
            if audio_rec.language == "hi"
            else "No clear speech was detected in this recording. Please verify your microphone and speak clearly."
        )

    audio_rec.used_enhanced = False
    decision.transcript = transcript_text
    decision.transcript_reviewed = False

    db.commit()
    db.refresh(audio_rec)
    db.refresh(decision)

    return TranscriptionResponse(
        transcript=decision.transcript,
        language=decision.language,
        transcript_reviewed=decision.transcript_reviewed,
        used_enhanced=False,
        audio_id=audio_rec.id,
        audio_recording=AudioRecordingResponse.model_validate(audio_rec),
        message="Successfully re-transcribed using unenhanced original audio",
    )


@router.patch(
    "/transcript",
    response_model=TranscriptionResponse,
    summary="Edit and explicitly review/save decision transcript",
)
def update_transcript(
    decision_id: int,
    payload: TranscriptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update decision transcript with user edits and explicitly mark as reviewed.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    decision.transcript = payload.transcript.strip()
    decision.transcript_reviewed = payload.mark_reviewed

    # Update raw_input to reflect the reviewed transcript
    if decision.transcript:
        lang_tag = decision.language.upper() if decision.language else "EN"
        updated_block = f"\n\n[Reviewed Voice Transcript ({lang_tag})]\n{decision.transcript}"
        # If there was an old voice transcript block, append updated one
        if decision.raw_input:
            decision.raw_input += updated_block
        else:
            decision.raw_input = updated_block.strip()

    db.commit()
    db.refresh(decision)

    return TranscriptionResponse(
        transcript=decision.transcript,
        language=decision.language,
        transcript_reviewed=decision.transcript_reviewed,
        used_enhanced=False,
        message="Transcript updated and reviewed successfully",
    )


@router.get(
    "",
    response_model=TranscriptionResponse,
    summary="Get current transcript and latest audio details for a decision",
)
def get_transcription_details(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve decision transcript, review status, and latest audio recording."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    stmt = (
        select(AudioRecording)
        .where(AudioRecording.decision_id == decision_id, AudioRecording.owner_id == current_user.id)
        .order_by(AudioRecording.created_at.desc())
    )
    audio_rec = db.scalars(stmt).first()

    return TranscriptionResponse(
        transcript=decision.transcript or "",
        language=decision.language or "en",
        transcript_reviewed=decision.transcript_reviewed,
        used_enhanced=audio_rec.used_enhanced if audio_rec else False,
        audio_id=audio_rec.id if audio_rec else None,
        audio_recording=AudioRecordingResponse.model_validate(audio_rec) if audio_rec else None,
    )


@router.get(
    "/recordings",
    response_model=List[AudioRecordingResponse],
    summary="List all audio recordings for a decision",
)
def list_audio_recordings(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all audio recordings linked to this decision."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    stmt = (
        select(AudioRecording)
        .where(AudioRecording.decision_id == decision_id, AudioRecording.owner_id == current_user.id)
        .order_by(AudioRecording.created_at.desc())
    )
    recordings = db.scalars(stmt).all()
    return [AudioRecordingResponse.model_validate(r) for r in recordings]


@router.get(
    "/audio/{audio_id}",
    summary="Stream stored audio file (original or enhanced)",
)
def stream_audio_file(
    decision_id: int,
    audio_id: int,
    use_original: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream audio recording with ownership verification."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    audio_rec = db.get(AudioRecording, audio_id)
    if not audio_rec or audio_rec.decision_id != decision_id:
        raise HTTPException(status_code=404, detail="Audio recording not found")

    verify_ownership(audio_rec.owner_id, current_user.id, resource_name="AudioRecording")

    target_path = Path(audio_rec.original_path) if use_original or not audio_rec.enhanced_path else Path(audio_rec.enhanced_path)
    if not target_path.exists():
        # Fall back to original if enhanced not found
        target_path = Path(audio_rec.original_path)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on server")

    media_type = "audio/wav" if target_path.suffix == ".wav" else audio_rec.media_type
    return FileResponse(path=str(target_path), media_type=media_type, filename=target_path.name)
