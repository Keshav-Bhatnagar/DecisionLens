import logging
from typing import Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Decision
from app.schemas import StructuredFindings
from app.services.ai import ai_service

logger = logging.getLogger("decisionlens.structuring")


def assemble_decision_input_context(decision: Decision) -> Tuple[str, str]:
    """
    Assemble all available raw inputs from a decision into a unified,
    fenced context string for the AI structuring engine.
    Returns (aggregated_text, source_summary).
    """
    sections = []
    sources = []

    if decision.title:
        sections.append(f"### DECISION TITLE\n{decision.title.strip()}")

    if decision.problem_statement:
        sections.append(f"### PROBLEM STATEMENT\n{decision.problem_statement.strip()}")
        sources.append("Problem Statement")

    if decision.description:
        sections.append(f"### BACKGROUND CONTEXT & NOTES\n{decision.description.strip()}")
        sources.append("Background Notes")

    if decision.transcript:
        rev_tag = "Reviewed" if decision.transcript_reviewed else "Raw"
        sections.append(f"### {rev_tag.upper()} VOICE TRANSCRIPT\n{decision.transcript.strip()}")
        sources.append(f"{rev_tag} Voice Transcript")

    if decision.attachments:
        doc_sections = []
        for att in decision.attachments:
            if att.extracted_text and att.extracted_text.strip():
                doc_sections.append(f"[Document: {att.original_name}]\n{att.extracted_text.strip()}")
        if doc_sections:
            sections.append("### EXTRACTED DOCUMENTS\n" + "\n\n".join(doc_sections))
            sources.append(f"{len(doc_sections)} Attached Document(s)")

    # Fallback to decision.raw_input if other fields are empty
    if not sections and decision.raw_input:
        sections.append(f"### RAW INPUT CONTEXT\n{decision.raw_input.strip()}")
        sources.append("Raw Input")

    aggregated_text = "\n\n".join(sections).strip()
    source_summary = ", ".join(sources) if sources else "None"
    return aggregated_text, source_summary


def run_decision_structuring(
    decision: Decision,
    db: Session,
    force_mock: bool = False,
) -> Tuple[StructuredFindings, str]:
    """
    Assemble decision inputs, run AI structuring into 8 cognitive categories,
    and persist results in decision.points with points_reviewed=False.
    """
    raw_context, source_summary = assemble_decision_input_context(decision)

    if not source_summary or source_summary == "None" or not raw_context or len(raw_context.strip()) < 15:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot structure decision without substantive content. Please provide a problem statement, notes, transcript, or upload a document.",
        )

    # Call AI structuring service
    findings = ai_service.structure_untrusted_input(
        raw_text=raw_context,
        language=decision.language or "en",
        force_mock=force_mock,
    )

    # Persist in decision
    findings.reviewed = False
    decision.points = findings.model_dump(mode="json")
    decision.points_reviewed = False

    db.commit()
    db.refresh(decision)

    return findings, source_summary
