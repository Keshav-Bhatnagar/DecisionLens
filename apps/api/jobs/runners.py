import logging
from typing import Optional
from sqlalchemy.orm import Session
from apps.api.core.database import SessionLocal
from apps.api.models.database import (
    MediaItem,
    TranscriptItem,
    DecisionSession,
    AnalysisResult,
)
from apps.api.services.audio import audio_service
from apps.api.services.stt import stt_service
from apps.api.services.llm import llm_service

logger = logging.getLogger(__name__)


def process_media_job(media_id: str):
    """Background task: probe audio with ffprobe, convert to WAV, transcribe, and save transcript."""
    logger.info(f"Starting background job for media_id: {media_id}")
    db: Session = SessionLocal()
    try:
        media = db.query(MediaItem).filter(MediaItem.id == media_id).first()
        if not media:
            logger.error(f"Media item {media_id} not found")
            return

        media.status = "processing"
        db.commit()

        # Step 1: Probe audio with ffprobe
        probe_info = audio_service.probe_audio(media.file_path)
        media.duration_seconds = probe_info.get("duration_seconds", 0.0)

        # Step 2: Transcribe audio
        transcription = stt_service.transcribe(media.file_path)

        # Step 3: Save transcript item
        transcript = TranscriptItem(
            session_id=media.session_id,
            media_id=media.id,
            raw_text=transcription.get("raw_text", ""),
            segments=transcription.get("segments", []),
            word_count=transcription.get("word_count", 0),
        )
        db.add(transcript)

        media.status = "processed"
        db.commit()
        logger.info(f"Successfully processed media_id {media_id} and created transcript {transcript.id}")

    except Exception as e:
        logger.error(f"Error in process_media_job for {media_id}: {e}", exc_info=True)
        if media:
            media.status = "failed"
            db.commit()
    finally:
        db.close()


def generate_session_analysis_job(session_id: str, framework_type: Optional[str] = None):
    """Background task: synthesize session transcripts and user responses into structured analysis."""
    logger.info(f"Starting analysis job for session_id: {session_id}")
    db: Session = SessionLocal()
    try:
        session = db.query(DecisionSession).filter(DecisionSession.id == session_id).first()
        if not session:
            logger.error(f"Session {session_id} not found")
            return

        framework_to_use = framework_type or session.framework_type or "mcda"

        # Fetch transcript text if any
        transcripts = db.query(TranscriptItem).filter(TranscriptItem.session_id == session_id).all()
        combined_text = " ".join([t.raw_text for t in transcripts]) if transcripts else ""

        # Fetch responses
        responses = [
            {"question": r.question, "answer": r.answer, "speaker": r.speaker}
            for r in session.responses
        ]

        # Run LLM / framework synthesis
        result = llm_service.analyze_session(
            objective=session.objective,
            framework_type=framework_to_use,
            context_data=session.context_data,
            transcript_text=combined_text,
            responses=responses,
        )

        analysis = AnalysisResult(
            session_id=session.id,
            framework=result.get("framework", framework_to_use),
            summary=result.get("summary", ""),
            key_findings=result.get("key_findings", []),
            matrix=result.get("matrix", {}),
            recommendations=result.get("recommendations", []),
            confidence_score=float(result.get("confidence_score", 0.85)),
        )
        db.add(analysis)
        session.status = "completed"
        db.commit()
        logger.info(f"Successfully generated analysis {analysis.id} for session {session_id}")

    except Exception as e:
        logger.error(f"Error in generate_session_analysis_job for {session_id}: {e}", exc_info=True)
    finally:
        db.close()
