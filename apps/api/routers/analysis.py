from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from apps.api.core.database import get_db
from apps.api.models.database import AnalysisResult, DecisionSession, TranscriptItem
from apps.api.models.schemas import AnalysisCreate, AnalysisResponse
from apps.api.services.llm import llm_service

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.post("/generate/{session_id}", response_model=AnalysisResponse, status_code=status.HTTP_201_CREATED)
def generate_analysis(
    session_id: str,
    framework: Optional[str] = Query(None, description="Decision framework (mcda, swot, first_principles)"),
    db: Session = Depends(get_db),
):
    """
    Synthesize session transcripts, guided responses, and context into structured decision analysis.
    Executes synchronous synthesis and writes AnalysisResult to the database.
    """
    session = db.query(DecisionSession).filter(DecisionSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision session '{session_id}' not found.",
        )

    framework_name = framework or session.framework_type or "mcda"

    # Gather transcripts
    transcripts = db.query(TranscriptItem).filter(TranscriptItem.session_id == session_id).all()
    transcript_text = " ".join([t.raw_text for t in transcripts]) if transcripts else None

    # Gather responses
    responses = [
        {"question": r.question, "answer": r.answer, "speaker": r.speaker}
        for r in session.responses
    ]

    # Synthesize analysis
    analysis_data = llm_service.analyze_session(
        objective=session.objective,
        framework_type=framework_name,
        context_data=session.context_data,
        transcript_text=transcript_text,
        responses=responses,
    )

    analysis = AnalysisResult(
        session_id=session.id,
        framework=analysis_data.get("framework", framework_name),
        summary=analysis_data.get("summary", ""),
        key_findings=analysis_data.get("key_findings", []),
        matrix=analysis_data.get("matrix", {}),
        recommendations=analysis_data.get("recommendations", []),
        confidence_score=float(analysis_data.get("confidence_score", 0.85)),
    )
    db.add(analysis)
    session.status = "completed"
    db.commit()
    db.refresh(analysis)
    return analysis


@router.get("/session/{session_id}", response_model=List[AnalysisResponse])
def get_session_analyses(session_id: str, db: Session = Depends(get_db)):
    """Retrieve all analysis iterations for a decision session."""
    return db.query(AnalysisResult).filter(AnalysisResult.session_id == session_id).order_by(AnalysisResult.created_at.desc()).all()


@router.get("/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    """Get single analysis by ID."""
    analysis = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_id).first()
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis '{analysis_id}' not found.",
        )
    return analysis


@router.post("", response_model=AnalysisResponse, status_code=status.HTTP_201_CREATED)
def create_custom_analysis(analysis_in: AnalysisCreate, db: Session = Depends(get_db)):
    """Manually persist a customized decision analysis."""
    session = db.query(DecisionSession).filter(DecisionSession.id == analysis_in.session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{analysis_in.session_id}' not found.",
        )

    analysis = AnalysisResult(
        session_id=analysis_in.session_id,
        framework=analysis_in.framework,
        summary=analysis_in.summary,
        key_findings=analysis_in.key_findings,
        matrix=analysis_in.matrix,
        recommendations=analysis_in.recommendations,
        confidence_score=analysis_in.confidence_score or 0.85,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis
