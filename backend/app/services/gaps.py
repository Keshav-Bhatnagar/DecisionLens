import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Decision
from app.schemas import GapItem, GapsResponse
from app.services.ai import ai_service
from app.services.structuring import assemble_decision_input_context

logger = logging.getLogger("decisionlens.gaps")

GAP_DETECTION_SYSTEM_PROMPT = """You are DecisionLens Information Gap Analysis Engine.
Analyze the provided decision context (problem statement, structured findings, unknowns, assumptions, contradictions, and notes) and identify prioritized, targeted information gaps that MUST be clarified to make a sound decision.

CRITICAL RULES:
1. Identify 3 to 6 high-leverage questions that resolve ambiguity or unverified assumptions.
2. For each gap:
   - "id": A unique identifier like "gap_1", "gap_2", etc.
   - "question": Specific, actionable question to resolve the uncertainty.
   - "reason": Why this information is necessary to make the decision.
   - "importance": "critical", "high", "medium", or "low".
   - "priority_score": Integer from 1 (most critical) to 5.
   - "affected_options": List of 2-3 candidate alternatives or paths impacted by this gap.
   - "recommended_resolution_method":
       * "ask_user" if it requires internal team consensus, budget limits, user priorities, or organizational constraints.
       * "web_research" if it requires external industry benchmarks, vendor pricing, technical documentation, or regulatory standards.
3. NEVER INVENT FAKE DATA: Frame uncertainties as questions to be verified.
4. Output JSON ONLY matching the response schema:
{
  "gaps": [
    {
      "id": "gap_1",
      "question": "...",
      "reason": "...",
      "importance": "critical/high/medium/low",
      "priority_score": 1,
      "affected_options": ["Option A", "Option B"],
      "recommended_resolution_method": "ask_user/web_research"
    }
  ]
}
"""


def generate_mock_gaps(decision: Decision) -> List[GapItem]:
    """
    Generate high-fidelity, prioritized information gaps deterministically
    reflecting the decision's context and structured unknowns.
    """
    text_content = (
        (decision.problem_statement or "") + " " +
        (decision.title or "") + " " +
        (decision.description or "")
    ).lower()

    gaps = []
    now_str = datetime.now(timezone.utc).isoformat()

    # Gap 1: Budget / Cost Constraint (Ask User)
    gaps.append(
        GapItem(
            id="gap_1",
            question="What is the maximum acceptable monthly infrastructure and licensing budget for this solution?",
            reason="Establishes a firm financial boundary to eliminate options that exceed organizational spending limits.",
            importance="critical",
            priority_score=1,
            affected_options=["Managed Cloud Services", "Self-Hosted Deployment", "Hybrid Setup"],
            recommended_resolution_method="ask_user",
            status="pending",
            created_at=now_str,
            updated_at=now_str,
        )
    )

    # Gap 2: Performance / SLA Requirements (Web Research or Benchmarks)
    if "cloud" in text_content or "database" in text_content or "architecture" in text_content or "sql" in text_content:
        gaps.append(
            GapItem(
                id="gap_2",
                question="What are the latest published multi-region write latency benchmarks between CockroachDB, Google Cloud Spanner, and AWS Aurora PostgreSQL?",
                reason="Provides verifiable external performance metrics to validate latency SLA feasibility before architecture commitment.",
                importance="high",
                priority_score=2,
                affected_options=["CockroachDB Dedicated", "Google Cloud Spanner", "Aurora PostgreSQL Multi-AZ"],
                recommended_resolution_method="web_research",
                status="pending",
                created_at=now_str,
                updated_at=now_str,
            )
        )
    else:
        gaps.append(
            GapItem(
                id="gap_2",
                question="What are the industry benchmark failure rates and recovery timelines for the leading alternatives under consideration?",
                reason="Provides external validation of reliability and maintenance risk rather than relying on vendor claims.",
                importance="high",
                priority_score=2,
                affected_options=["Primary Alternative", "Secondary Alternative"],
                recommended_resolution_method="web_research",
                status="pending",
                created_at=now_str,
                updated_at=now_str,
            )
        )

    # Gap 3: Team Expertise & Bandwidth (Ask User)
    gaps.append(
        GapItem(
            id="gap_3",
            question="Does the internal engineering team possess existing operational expertise with this technology, or will external training/consulting be required?",
            reason="Determines time-to-delivery and on-call operational risk during initial rollout.",
            importance="high",
            priority_score=3,
            affected_options=["In-House Custom Implementation", "Fully-Managed Vendor SaaS"],
            recommended_resolution_method="ask_user",
            status="pending",
            created_at=now_str,
            updated_at=now_str,
        )
    )

    # Gap 4: Compliance & Data Residency (Web Research)
    gaps.append(
        GapItem(
            id="gap_4",
            question="What specific data residency and SOC2/ISO27001 compliance certifications are guaranteed by the evaluated providers for regional storage?",
            reason="Mandatory for legal compliance and avoiding audit penalties.",
            importance="medium",
            priority_score=4,
            affected_options=["US-Only Region", "EU-Multi-Region Data Sovereign Setup"],
            recommended_resolution_method="web_research",
            status="pending",
            created_at=now_str,
            updated_at=now_str,
        )
    )

    return gaps


def detect_decision_gaps(
    decision: Decision,
    db: Session,
    force_mock: bool = False,
) -> GapsResponse:
    """
    Detect, prioritize, and structure information gaps for a decision.
    Preserves any existing answered/queued states across re-detections.
    """
    raw_context, _ = assemble_decision_input_context(decision)
    if not raw_context or len(raw_context.strip()) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot detect information gaps on empty decision. Please provide a problem statement or notes first.",
        )

    # Retain existing answers from previously saved gaps
    existing_gaps_map = {}
    if decision.gaps and "gaps" in decision.gaps:
        for g_dict in decision.gaps["gaps"]:
            if isinstance(g_dict, dict) and "id" in g_dict:
                existing_gaps_map[g_dict["id"]] = g_dict

    detected_gaps: List[GapItem] = []

    if force_mock or not ai_service.is_configured():
        logger.info("Using mock gap detection engine (force_mock=%s)", force_mock)
        detected_gaps = generate_mock_gaps(decision)
    else:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.openai_api_key)

            # Include structured points if available
            points_summary = ""
            if decision.points:
                unknowns = decision.points.get("unknowns", [])
                assumptions = decision.points.get("assumptions", [])
                contradictions = decision.points.get("contradictions", [])
                points_summary = (
                    f"\n\n### KNOWN UNCERTAINTIES\nUnknowns: {json.dumps(unknowns)}\n"
                    f"Assumptions: {json.dumps(assumptions)}\n"
                    f"Contradictions: {json.dumps(contradictions)}"
                )

            fenced_input = f"<UNTRUSTED_DECISION_CONTEXT>\n{raw_context}{points_summary}\n</UNTRUSTED_DECISION_CONTEXT>"

            response = client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": GAP_DETECTION_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Identify prioritized information gaps for the following decision:\n\n{fenced_input}",
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )

            content = response.choices[0].message.content
            parsed = json.loads(content)
            now_str = datetime.now(timezone.utc).isoformat()

            for item in parsed.get("gaps", []):
                method = item.get("recommended_resolution_method", "ask_user").lower()
                if method not in {"ask_user", "web_research"}:
                    method = "ask_user"

                detected_gaps.append(
                    GapItem(
                        id=str(item.get("id", f"gap_{len(detected_gaps)+1}")),
                        question=str(item.get("question", "")),
                        reason=str(item.get("reason", "")),
                        importance=str(item.get("importance", "medium")).lower(),
                        priority_score=int(item.get("priority_score", len(detected_gaps)+1)),
                        affected_options=list(item.get("affected_options", [])),
                        recommended_resolution_method=method,
                        status="pending",
                        created_at=now_str,
                        updated_at=now_str,
                    )
                )

            # Fallback if AI produced 0 items
            if not detected_gaps:
                detected_gaps = generate_mock_gaps(decision)

        except Exception as exc:
            logger.warning(f"Hosted AI gap detection failed ({exc}). Falling back to deterministic gap engine.")
            detected_gaps = generate_mock_gaps(decision)

    # Merge in previously answered/skipped/queued states if gap IDs match
    for gap in detected_gaps:
        if gap.id in existing_gaps_map:
            prev = existing_gaps_map[gap.id]
            gap.status = prev.get("status", gap.status)
            gap.answer = prev.get("answer")
            gap.research_query = prev.get("research_query")
            if "updated_at" in prev:
                gap.updated_at = prev["updated_at"]

    # Compute status counts
    pending_count = sum(1 for g in detected_gaps if g.status == "pending")
    answered_count = sum(1 for g in detected_gaps if g.status == "answered")
    skipped_count = sum(1 for g in detected_gaps if g.status == "skipped")
    research_queued_count = sum(1 for g in detected_gaps if g.status == "research_queued")

    now_iso = datetime.now(timezone.utc).isoformat()
    gaps_data = {
        "gaps": [g.model_dump(mode="json") for g in detected_gaps],
        "detected_at": now_iso,
        "total_gaps": len(detected_gaps),
        "pending_count": pending_count,
        "answered_count": answered_count,
        "skipped_count": skipped_count,
        "research_queued_count": research_queued_count,
    }

    decision.gaps = gaps_data
    db.commit()
    db.refresh(decision)

    return GapsResponse(
        decision_id=decision.id,
        gaps=detected_gaps,
        detected_at=now_iso,
        total_gaps=len(detected_gaps),
        pending_count=pending_count,
        answered_count=answered_count,
        skipped_count=skipped_count,
        research_queued_count=research_queued_count,
        message="Information gaps detected and prioritized successfully",
    )
