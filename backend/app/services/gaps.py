import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Decision
from app.schemas import GapItem, GapsResponse
from app.services.ai import ai_service, get_llm_client_and_model, call_gemini_direct_rest
from app.services.structuring import assemble_decision_input_context

logger = logging.getLogger("decisionlens.gaps")

GAP_DETECTION_SYSTEM_PROMPT = """You are Marcus Vance, Principal Due Diligence & Pre-Mortem Investigator at DecisionLens.
With 14 years of experience conducting forensic due diligence, enterprise risk discovery, and capital investment pre-mortems, your mission is to uncover the hidden information gaps and unverified assumptions that could cause catastrophic decision failure if left unexamined.

================================================================================
THE CLEAR FRAMEWORK SPECIFICATION:
================================================================================

1. CONTEXT:
You operate at Stage 2 (Information Gap Analysis) of the DecisionLens pipeline.
You receive structured cognitive findings (facts, assumptions, feelings, pros, cons, mixed points, contradictions, and unknowns).
Your responsibility is to interrogate this baseline and extract the high-leverage missing information that MUST be clarified before any irreversible commitment of capital, time, or technical resources is made.

2. LANGUAGE & TONE:
- Precise, surgical, and professionally inquisitive.
- Frame questions with actionable clarity so they can be either directly answered by stakeholders or researched on public databases.
- Avoid generic inquiries like "What are your thoughts?"; ask for specific numbers, regulatory statutes, contract terms, or verifiable metrics.

3. EXPERTISE & CORE SPECIALIZATION:
- Pre-Mortem Vulnerability Discovery: Anticipating failure modes and tracing them back to missing prerequisite information.
- Decision Sensitivity Analysis: Knowing which missing parameters have the mathematical leverage to flip the winning alternative.
- Resolution Routing: Distinguishing internal governance questions from external empirical research questions.

4. ACTIONS & MULTI-STEP PROCESS:
Follow this 5-phase due diligence protocol:
Phase 1 - Vulnerability Interrogation: Cross-examine all structured assumptions, contradictions, and unknowns against the decision's core objectives.
Phase 2 - High-Leverage Gap Selection: Identify exactly 3 to 6 high-impact information gaps. Exclude trivial questions.
Phase 3 - Criticality & Priority Ranking:
  * Assign "importance": "critical" (deal-breaker/prerequisite), "high" (substantially alters ROI/risk), "medium" (operational nuance), or "low" (minor detail).
  * Assign "priority_score": Integer from 1 (most urgent/critical) to 5.
Phase 4 - Resolution Channel Assignment:
  * "ask_user": If resolving the gap requires internal stakeholder consensus, proprietary budget limits, executive risk tolerance, or organizational policy.
  * "web_research": If resolving the gap requires external public documentation, statutory laws, municipal zoning rules, market benchmarks, competitor data, or vendor pricing.
Phase 5 - Option Impact Association:
  * In "affected_options", specify 2 to 3 candidate alternatives whose viability or score will swing based on the answer.

5. RESTRICTIONS & GUARDRAILS (INTEGRITY OF CIVIL & AI TECH RULES):
- INTEGRITY OF CIVIL & AI TECH RULES: Comply fully with ethical due diligence standards, privacy safeguards, and lawful research norms. Never request illegal intelligence gathering or privileged non-public data.
- ZERO FABRICATION: Never invent hypothetical numbers or fabricate answers. Frame genuine uncertainties as empirical questions.
- AVOID BANALITY: Never produce generic filler questions (e.g., "What is the team's motivation?"). Focus on structural deal determinants.
- STRICT SCHEMA OUTPUT: Emit a single valid JSON object strictly matching the schema below with no conversational filler.

================================================================================
CONDITIONAL LOGIC & DOMAIN AWARENESS:
================================================================================
- IF the decision is REAL_ESTATE: Focus gaps on title encumbrance history, zoning/FSI clearances, physical access/feeder road width, conversion charges, and environmental/demarcation surveys.
- IF the decision is FINANCE / INVESTMENT: Focus gaps on cost of capital, debt service coverage, collateral covenants, liquidity timing, and counterparty credit risks.
- IF the decision is SOFTWARE / TECH: Focus gaps on throughput/latency SLAs, security/compliance standards (SOC2, GDPR), migration downtime limits, and maintenance costs.
- IF the decision is CAREER / EDUCATION: Focus gaps on accredited credential outcomes, compensation opportunity costs, and market demand longevity.

================================================================================
OUTPUT JSON SCHEMA:
================================================================================
{
  "gaps": [
    {
      "id": "gap_1",
      "question": "Specific, actionable inquiry targeting a missing parameter...",
      "reason": "Explicit justification of why this datum has the leverage to alter the decision...",
      "importance": "critical/high/medium/low",
      "priority_score": 1,
      "affected_options": ["Option A", "Option B"],
      "recommended_resolution_method": "ask_user/web_research"
    }
  ]
}
"""


import re


def generate_mock_gaps(
    decision: Decision,
    origin_reason: Optional[str] = None,
    db: Optional[Session] = None,
) -> List[GapItem]:
    """
    Generate high-fidelity, prioritized information gaps deterministically
    reflecting the decision's context, transcript, attachments, and structured unknowns.
    Includes provenance tracking via source_origin.
    """
    raw_context, _ = assemble_decision_input_context(decision, db=db)
    title = (decision.title or "").strip()
    problem = (decision.problem_statement or "").strip()
    description = (decision.description or "").strip()
    transcript = (decision.transcript or "").strip()

    full_text = f"{title}\n{problem}\n{description}\n{transcript}\n{raw_context}".strip()
    full_text_lower = full_text.lower()
    now_str = datetime.now(timezone.utc).isoformat()
    gaps: List[GapItem] = []

    def _get_origin(preset_name: str) -> str:
        if origin_reason:
            return f"{origin_reason} ({preset_name})"
        return f"Fallback Heuristic: {preset_name}"

    # 1. Dynamically extract candidate options from text
    extracted_options: List[str] = []

    # Match patterns like: "considering three main options...", "options are: X, Y, Z"
    m = re.search(
        r'(?:considering|options (?:are|include))\s*(?:three|two|several|the following)?[:\s]+([^.]+)',
        full_text,
        re.IGNORECASE,
    )
    if m:
        for p in re.split(r',|\band\b|;|\bor\b', m.group(1)):
            cleaned = re.sub(
                r'^(?:are\s+|the\s+(?:first|second|third|fourth)\s+is\s+|a\s+|an\s+|the\s+)+',
                '',
                p.strip(),
                flags=re.IGNORECASE,
            )
            cleaned = cleaned.strip(" .:")
            if cleaned and 2 < len(cleaned) < 55 and cleaned not in extracted_options:
                extracted_options.append(cleaned)

    # Match patterns like: "first is X. The second is Y. The third is Z."
    for fs in re.findall(
        r'(?:first|second|third|fourth)\s+(?:option\s+)?is\s+(?:a\s+|an\s+|the\s+)?([^.]+)',
        full_text,
        re.IGNORECASE,
    ):
        c = fs.strip(" .:")
        if c and 2 < len(c) < 55 and c not in extracted_options:
            extracted_options.append(c)

    # Match "X vs Y" or "X versus Y"
    if not extracted_options:
        vs_m = re.search(
            r'([A-Za-z0-9\s\-]{3,35})\s+(?:versus|vs\.?)\s+([A-Za-z0-9\s\-]{3,35})',
            full_text,
            re.IGNORECASE,
        )
        if vs_m:
            extracted_options = [vs_m.group(1).strip(), vs_m.group(2).strip()]

    # Fallback to domain options if none explicitly parsed
    if not extracted_options:
        if any(w in full_text_lower for w in ["laptop", "macbook", "pc", "computer"]):
            extracted_options = ["MacBook Air", "Windows RTX Laptop", "Lightweight Business Laptop"]
        elif any(w in full_text_lower for w in ["cloud", "database", "spanner", "aurora", "postgres"]):
            extracted_options = ["AWS Aurora PostgreSQL", "Google Cloud Spanner", "Managed PostgreSQL"]
        else:
            extracted_options = ["Primary Alternative", "Secondary Alternative", "Status Quo"]

    # 2. Extract stated uncertainties from sentences
    sentences = re.split(r'[\.\?\!\n]+', full_text)
    uncertainty_sentences = []
    for s in sentences:
        s_clean = s.strip()
        if len(s_clean) < 15:
            continue
        s_low = s_clean.lower()
        if any(kw in s_low for kw in [
            "not sure", "haven't decided", "have not decided", "haven't determined",
            "don't know", "how much", "unclear", "concerned that", "trade-off",
            "budget is limited", "overhead", "benchmark", "unknown"
        ]):
            if s_clean not in uncertainty_sentences:
                uncertainty_sentences.append(s_clean)

    # 3. Domain-Specific Generation
    # Case A: Hardware / Laptop / Tech Device Decision
    if any(w in full_text_lower for w in ["laptop", "macbook", "gpu", "computer", "battery", "ram", "rtx"]):
        origin_tag = _get_origin("Hardware / Laptop Preset")
        opt_names = extracted_options[:3] if len(extracted_options) >= 2 else ["MacBook Air", "Windows RTX Laptop", "Lightweight Laptop"]
        gaps.append(
            GapItem(
                id="gap_1",
                question="What is the firm maximum total purchase budget for this laptop?",
                reason="Your notes indicate a limited budget without an exact ceiling; defining this financial limit immediately filters out overpriced configurations.",
                importance="critical",
                priority_score=1,
                affected_options=opt_names,
                recommended_resolution_method="ask_user",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_2",
                question="What specific machine learning workloads and GPU compute requirements will be run locally versus in cloud environments (e.g., Colab / remote servers)?",
                reason="Directly addresses uncertainty regarding required GPU performance to prevent overpaying for a heavy dedicated GPU or purchasing an underpowered machine.",
                importance="high",
                priority_score=2,
                affected_options=opt_names,
                recommended_resolution_method="ask_user",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_3",
                question=f"What are the verified real-world battery life benchmarks and carrying weights for {' vs '.join(opt_names[:2])}?",
                reason="Provides objective battery drain and portability metrics under active programming and compilation workloads for regular commuting.",
                importance="high",
                priority_score=3,
                affected_options=opt_names,
                recommended_resolution_method="web_research",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_4",
                question="What are the proven developer compatibility trade-offs for Docker, Linux virtualization (WSL2 vs macOS), and machine learning libraries across these platforms?",
                reason="Validates that coursework tools and container workflows run smoothly without architecture or emulation roadblocks over a 3-4 year horizon.",
                importance="medium",
                priority_score=4,
                affected_options=opt_names,
                recommended_resolution_method="web_research",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )

    # Case B: Cloud / Database / Infrastructure Decision
    elif any(w in full_text_lower for w in ["cloud", "database", "spanner", "aurora", "postgres", "cluster", "sla", "replica"]):
        origin_tag = _get_origin("Cloud / Database Preset")
        opt_names = extracted_options[:3] if len(extracted_options) >= 2 else ["AWS Aurora PostgreSQL", "Google Cloud Spanner", "Managed PostgreSQL"]
        gaps.append(
            GapItem(
                id="gap_1",
                question="What is the maximum acceptable monthly infrastructure and licensing budget for this solution?",
                reason="Establishes a firm financial boundary to eliminate options that exceed organizational spending limits.",
                importance="critical",
                priority_score=1,
                affected_options=opt_names,
                recommended_resolution_method="ask_user",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_2",
                question=f"What are the latest published multi-region write latency benchmarks between {' and '.join(opt_names[:2])}?",
                reason="Provides verifiable external performance metrics to validate latency SLA feasibility before architecture commitment.",
                importance="high",
                priority_score=2,
                affected_options=opt_names,
                recommended_resolution_method="web_research",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_3",
                question="Does the internal engineering team possess existing operational expertise with this technology, or will external training/consulting be required?",
                reason="Determines time-to-delivery and on-call operational risk during initial rollout.",
                importance="high",
                priority_score=3,
                affected_options=opt_names,
                recommended_resolution_method="ask_user",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_4",
                question="What specific data residency and SOC2/ISO27001 compliance certifications are guaranteed by the evaluated providers for regional storage?",
                reason="Mandatory for legal compliance and avoiding audit penalties.",
                importance="medium",
                priority_score=4,
                affected_options=opt_names,
                recommended_resolution_method="web_research",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )

    # Case C: General / Dynamic Domain Heuristic
    else:
        origin_tag = _get_origin("General Decision Preset")
        opt_names = extracted_options[:3]
        gaps.append(
            GapItem(
                id="gap_1",
                question=f"What is the maximum financial budget or resource allocation committed to '{title or 'this decision'}'?",
                reason="Establishes a practical boundary to eliminate candidates that exceed feasible investment limits.",
                importance="critical",
                priority_score=1,
                affected_options=opt_names,
                recommended_resolution_method="ask_user",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )

        q2 = "What are the industry benchmark success rates and failure modes for the alternatives under consideration?"
        r2 = "Provides objective third-party validation rather than relying on unverified claims or assumptions."
        if uncertainty_sentences:
            first_unc = uncertainty_sentences[0]
            q2 = f"How should the uncertainty regarding '{first_unc[:80]}...' be resolved?"
            r2 = "Explicitly addresses an unresolved question highlighted in your transcript and notes."

        gaps.append(
            GapItem(
                id="gap_2",
                question=q2,
                reason=r2,
                importance="high",
                priority_score=2,
                affected_options=opt_names,
                recommended_resolution_method="web_research" if "benchmark" in q2.lower() else "ask_user",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_3",
                question="What is the required completion timeline, and what internal constraints or dependencies could delay execution?",
                reason="Ensures the chosen direction is realistically deliverable within the available time horizon.",
                importance="high",
                priority_score=3,
                affected_options=opt_names,
                recommended_resolution_method="ask_user",
                status="pending",
                source_origin=origin_tag,
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gaps.append(
            GapItem(
                id="gap_4",
                question=f"What are the documented real-world performance comparisons and user reviews between {' and '.join(opt_names[:2])}?",
                reason="Gathers independent comparative evidence to validate long-term satisfaction and reliability.",
                importance="medium",
                priority_score=4,
                affected_options=opt_names,
                recommended_resolution_method="web_research",
                status="pending",
                source_origin=origin_tag,
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
    Tags each gap with source_origin to trace where it was fetched from.
    """
    raw_context, _ = assemble_decision_input_context(decision, db=db)
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
    client, model, provider = get_llm_client_and_model()

    if force_mock:
        logger.info("Using mock gap detection engine (force_mock=True)")
        detected_gaps = generate_mock_gaps(decision, origin_reason="Mock Mode Forced", db=db)
    elif client is None:
        logger.info("No AI client configured (has_key=%s). Using deterministic gap engine.", settings.has_ai_key)
        detected_gaps = generate_mock_gaps(decision, origin_reason="Fallback Heuristic: No AI Key Configured", db=db)
    else:
        try:
            logger.info("Calling hosted %s model (%s) for gap detection", provider.upper(), model)

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
            user_prompt = f"Identify prioritized information gaps for the following decision:\n\n{fenced_input}"

            content = None
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": GAP_DETECTION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                content = response.choices[0].message.content
            except Exception as proxy_exc:
                if provider == "gemini":
                    gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
                    logger.info("OpenAI proxy failed for gaps (%s), falling back to native Gemini REST endpoint", proxy_exc)
                    content = call_gemini_direct_rest(
                        model=model,
                        system_prompt=GAP_DETECTION_SYSTEM_PROMPT,
                        user_prompt=user_prompt,
                        api_key=gemini_key,
                    )
                else:
                    raise proxy_exc

            parsed = json.loads(content)
            now_str = datetime.now(timezone.utc).isoformat()
            ai_origin = f"AI Engine: {provider.upper()} ({model})"

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
                        source_origin=ai_origin,
                        created_at=now_str,
                        updated_at=now_str,
                    )
                )

            # Fallback if AI produced 0 items
            if not detected_gaps:
                detected_gaps = generate_mock_gaps(decision, origin_reason=f"Fallback: AI ({model}) Produced 0 Gaps", db=db)

        except Exception as exc:
            logger.warning(f"Hosted AI gap detection failed ({exc}). Falling back to deterministic gap engine.")
            err_msg = f"{exc.__class__.__name__}: {str(exc)[:45]}"
            detected_gaps = generate_mock_gaps(decision, origin_reason=f"Fallback: AI Error ({err_msg})", db=db)

    # Merge in previously answered/skipped/queued states if gap IDs match
    for gap in detected_gaps:
        if gap.id in existing_gaps_map:
            prev = existing_gaps_map[gap.id]
            gap.status = prev.get("status", gap.status)
            gap.answer = prev.get("answer")
            gap.research_query = prev.get("research_query")
            if prev.get("source_origin") and not gap.source_origin:
                gap.source_origin = prev.get("source_origin")
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
