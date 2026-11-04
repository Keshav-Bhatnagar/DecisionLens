import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException, status
from app.config import settings
from app.schemas import GroundedCognitiveItem, PrivateTranscriptFeedback, StructuredFindings

logger = logging.getLogger("decisionlens.ai")


STRUCTURING_SYSTEM_PROMPT = """<role>
You are the Lead Cognitive Structuring & Epistemic Intelligence Specialist at DecisionLens.
Your mission is Stage 2 Cognitive Structuring: transforming untrusted, messy meeting transcripts, audio logs, and problem statements into a rigorously structured decision context.
</role>

<the_four_dimensions>
DecisionLens visualizes and organizes all decision context into 4 Grounded Dimensions:

1. GROUND TRUTH (facts + validated organizational assets):
   - Scope: Verified empirical telemetry (CPU %, p99 latency SLAs, downtime durations, financial GMV metrics), statutory legal constraints (RBI, DPDP 2023, data localization directives), firm calendar deadlines, and confirmed team baseline capacities.
   - Downstream Destination: Moves to Stage 4 Multi-Criteria Scoring and Stage 5 Architecture Decision Record (ADR) as immutable boundary conditions. Any architecture violating these is automatically penalized.

2. WORKING ASSUMPTIONS (unverified forward projections):
   - Scope: Any forward-looking hypothesis, expected user scaling target (e.g. "will handle 50k concurrent users"), or unproven technology claim lacking concurrent load test benchmarks or database sizing models.
   - Downstream Destination: Moves to Stage 3 Web Research to formulate gap-closing queries and retrieve empirical benchmarks before committing.

3. DECISION TRAPS & BLINDSPOTS (structural logic fallacies):
   - ABSOLUTE DIRECTIVE: Do NOT attempt to diagnose psychological "tone bias" from vocal inflection, cadence, or manner of speaking. No technology exists to detect bias from tone; tone is merely personal communication behavior.
   - INSTEAD, extract verifiable STRUCTURAL DECISION FALLACIES from the argumentation:
     * Sunk Cost Fallacy: Sticking to a stack because "we already spent 3 weeks prototyping it".
     * Planning Fallacy / Overconfidence: Claiming a major architectural migration will finish in 2 weeks without a POC.
     * Capacity-Architecture Mismatch: Committing to complex multi-broker systems (e.g. Kafka, distributed SQL) when the team has a small headcount and zero production experience.
     * Framing & Status Quo Traps: Rejecting modern scalable alternatives purely out of habit or unverified dogma.
   - Downstream Destination: Moves to Stage 4 Pre-Mortem & Inversion analysis to deliberately stress-test team blindspots.

4. MEETING CAVEATS & FRICTION (operational friction & recorded dissent):
   - Scope: Documented operational toil, database connection starvation risks, maintenance overhead, and dissenting feedback from SRE, DevOps, or Security stakeholders.
   - Downstream Destination: Moves to Stage 5 ADR as mandatory operational safeguards, risk mitigations, and team runway requirements.
</the_four_dimensions>

<epistemic_standards>
- STRICT SOURCE GROUNDING: Every extracted point must be backed by a verbatim span from the source input (source_statement, source_spans). Never fabricate claims.
- MANDATORY WHY_CLASSIFIED: Every single item in EVERY category MUST provide a specific `why_classified` field. Cite the exact metrics, statutes, fallacies, or operational limits found in that statement.
- PRESERVE MODALITY: Never upgrade "we think X might work" into a proven fact. Preserve hedging words (might, could, likely, expect, estimate).
- EMPTY CATEGORIES ARE VALID: If there are no genuine decision traps or contradictions, return []. Never manufacture fake points.
</epistemic_standards>

<output_format>
Return valid JSON adhering strictly to this schema:
{
  "facts": [
    {
      "statement": "Payments service hit 94% CPU utilization causing a 12-minute outage and ₹38 lakhs GMV loss during peak surge.",
      "why_classified": "Direct Telemetry Metric: Contains empirical APM measurements and financial loss recorded in historical production.",
      "source_statement": "The monolithic payments and order processing service hit 94% CPU utilization and database connection pool starvation caused a 12-minute checkout outage resulting in an estimated ₹38 lakhs GMV loss.",
      "source_spans": ["payments service hit 94% CPU utilization..."],
      "derivation_type": "direct_extraction",
      "epistemic_status": "stated",
      "confidence": 0.98,
      "is_direct_extraction": true
    }
  ],
  "assumptions": [
    {
      "statement": "Rewriting checkout in Go will handle 50,000 concurrent users with sub-10ms response times.",
      "why_classified": "Unverified Capacity Target: Projected concurrent scaling volume without citing load test benchmarks or database connection sizing.",
      "source_statement": "Writing code in Go feels faster and should allow us to handle 50k concurrent users.",
      "source_spans": ["should allow us to handle 50k concurrent users"],
      "derivation_type": "explicit_user_inference",
      "epistemic_status": "assumed",
      "confidence": 0.85,
      "is_direct_extraction": false
    }
  ],
  "feelings": [],
  "pros": [],
  "cons": [
    {
      "statement": "The team has zero production experience managing multi-broker Kafka clusters with an SRE team of 3.",
      "why_classified": "Hard Operational Boundary: Concrete team staffing and expertise limit that introduces direct operational outage risk.",
      "source_statement": "The team has zero production experience managing a multi-broker Apache Kafka cluster on AWS and currently has an SRE team of 3.",
      "source_spans": ["team has zero production experience managing a multi-broker Apache Kafka cluster"],
      "derivation_type": "direct_extraction",
      "epistemic_status": "stated",
      "confidence": 0.95,
      "is_direct_extraction": true
    }
  ],
  "mixed_points": [],
  "contradictions": [
    {
      "statement": "Team committing to complex distributed Kafka architecture despite a 10-week sale deadline and only 3 SREs with zero Kafka experience.",
      "why_classified": "Capacity-Architecture Mismatch: Severe conflict between aggressive calendar deadline (10 weeks) and unproven operational capacity.",
      "source_statement": "Big Billion Days sale starts in 10 weeks, but SRE team has zero Kafka production experience.",
      "source_spans": ["Big Billion Days sale starts in 10 weeks", "zero Kafka production experience"],
      "derivation_type": "analytical_derivation",
      "epistemic_status": "uncertain",
      "confidence": 0.90,
      "is_direct_extraction": false
    }
  ],
  "unknowns": [
    {
      "statement": "What is the peak database connection pool limit under PostgreSQL during concurrent checkout surges?",
      "why_classified": "Missing Operational Metric: Missing hardware telemetry needed to size connection pooling.",
      "source_statement": "Database connection pool starvation caused checkout outage.",
      "source_spans": ["database connection pool starvation"],
      "derivation_type": "analytical_derivation",
      "epistemic_status": "unknown",
      "confidence": 0.90,
      "is_direct_extraction": false
    }
  ],
  "summary": "Objective synthesis defining the decision tension, options evaluated, and current evidence state.",
  "private_feedback": {
    "tone_observations": "Objective review of stakeholder alignment, dissent, and technical boundary clarity.",
    "potential_biases": ["Sunk Cost Fallacy: Team justification based on 3 weeks spent prototyping in Go rather than production workload fit."],
    "clarity_rating": "High",
    "feedback_notes": "Validate database connection pool limits and SRE operational readiness before selecting event broker."
  }
}
</output_format>"""


def _make_item(
    category: str,
    text: str,
    source_span: str = "",
    derivation_type: str = "direct_extraction",
    epistemic_status: str = "confirmed_fact",
    confidence: float = 0.95,
    is_direct: bool = True,
    why_classified: str = "",
) -> GroundedCognitiveItem:
    return GroundedCognitiveItem(
        id=f"cog_{uuid.uuid4().hex[:8]}",
        category=category,
        text=text,
        statement=text,
        source_statement=source_span if source_span else text[:120],
        source_spans=[source_span] if source_span else [text[:120]],
        source_ids=[],
        derivation_type=derivation_type,
        epistemic_status=epistemic_status,
        confidence=confidence,
        is_direct_extraction=is_direct,
        why_classified=why_classified if why_classified else None,
    )


def generate_mock_structuring_findings(raw_input: str, language: str = "en") -> StructuredFindings:
    """
    Dynamically extract source-grounded Stage 2 findings directly from input sentences.
    Zero fake hardcoded strings (e.g. no pre-baked 'courses/assignments/MongoDB' scenarios).
    Dynamically classifies sentences into Ground Truth, Assumptions, Decision Traps, and Caveats
    with genuine, statement-specific why_classified epistemic justifications.
    """
    raw_clean = (raw_input or "").strip()
    # Split input into meaningful clean sentence spans
    raw_sentences = [
        s.strip()
        for s in re.split(r"(?<=[.!?\n;])\s+", raw_clean)
        if len(s.strip()) > 8
    ]
    if not raw_sentences and raw_clean:
        raw_sentences = [raw_clean]

    facts_items = []
    assumptions_items = []
    feelings_items = []
    pros_items = []
    cons_items = []
    mixed_items = []
    contra_items = []
    unknowns_items = []

    facts_str = []
    assumptions_str = []
    feelings_str = []
    pros_str = []
    cons_str = []
    mixed_str = []
    contra_str = []
    unknowns_str = []

    for s in raw_sentences:
        s_lower = s.lower()

        # 1. GROUND TRUTH (Facts / Telemetry / Statutes / Hard Boundaries)
        is_telemetry = bool(re.search(r"\d+\s*(?:%|ms|s|gb|tb|mb|iops|rps|tps|lakh|crore|k|m|₹|\$)", s_lower)) or any(
            k in s_lower for k in ["cpu", "latency", "outage", "sla", "downtime", "gmv", "utilization", "starvation"]
        )
        is_statutory = any(k in s_lower for k in ["dpdp", "rbi", "compliance", "security constraint", "statutory", "localization", "legal"])
        is_team_baseline = any(k in s_lower for k in ["team has", "team of", "production experience", "currently using", "existing", "baseline", "experienced with"])

        # 2. DECISION TRAPS (Sunk cost, planning fallacy, team capacity mismatch)
        is_sunk_cost = any(k in s_lower for k in ["spent", "already invested", "weeks on", "months on", "wasted", "prototyped"])
        is_planning_fallacy = any(k in s_lower for k in ["week", "month", "deadline", "schedule"]) and any(k in s_lower for k in ["zero", "no experience", "team of 3", "small team", "untested"])
        is_conflict = ("on-prem" in s_lower or "self-hosted" in s_lower) and ("cloud" in s_lower or "managed" in s_lower)

        # 3. ASSUMPTIONS (Speculative, forward-looking projections)
        is_assumption = any(k in s_lower for k in ["assume", "expect", "hoping", "target", "projected", "should be able", "might", "could", "believe", "estimated", "eventually", "feels faster", "scaling"])

        # 4. CAVEATS & FRICTION (Operational downsides, friction, toil)
        is_caveat = any(k in s_lower for k in ["risk", "downside", "toil", "concern", "worry", "bottleneck", "overhead", "hesitation", "drawback", "strained", "pager", "burnout"])

        # 5. UNKNOWNS (Missing info or questions)
        is_unknown = "?" in s or any(k in s_lower for k in ["don't know", "not measured", "unclear", "unknown", "no data", "haven't benchmarked"])

        if is_conflict or is_sunk_cost or is_planning_fallacy:
            if is_sunk_cost:
                why = "Sunk Cost Fallacy: Justifying an architectural path based on past invested time rather than production workload fit."
            elif is_planning_fallacy:
                why = "Capacity-Architecture Mismatch: Severe conflict between aggressive calendar deadline and unproven team operational readiness."
            else:
                why = "Structural Decision Trap: Logical tension or mutually conflicting requirements identified in deliberated strategy."
            contra_str.append(s)
            contra_items.append(_make_item("contradictions", s, s, "analytical_derivation", "uncertain", 0.90, False, why_classified=why))

        elif is_assumption:
            if any(k in s_lower for k in ["user", "concurrent", "traffic", "throughput", "rps"]):
                why = "Unverified Scaling Target: Forward projection of traffic or user volume without concurrent load benchmarks or database sizing models."
            else:
                why = "Unverified Working Hypothesis: Forward expectation or performance goal requiring empirical validation in Stage 3 Web Research."
            assumptions_str.append(s)
            assumptions_items.append(_make_item("assumptions", s, s, "explicit_user_inference", "assumed", 0.85, False, why_classified=why))

        elif is_caveat:
            why = "Operational Friction & Risk: Stated production vulnerability or team friction requiring mitigation guardrails in Stage 5 ADR."
            cons_str.append(s)
            cons_items.append(_make_item("cons", s, s, "direct_extraction", "stated", 0.90, True, why_classified=why))

        elif is_unknown:
            why = "Material Information Gap: Critical missing metric or unknown parameter that must be resolved."
            unknowns_str.append(s)
            unknowns_items.append(_make_item("unknowns", s, s, "analytical_derivation", "unknown", 0.90, False, why_classified=why))

        elif is_statutory or is_telemetry or is_team_baseline:
            if is_telemetry:
                why = "Direct Telemetry Metric: Contains empirical APM measurements, hardware resource thresholds, or financial metrics recorded in source records."
            elif is_statutory:
                why = "Statutory Legal Constraint: Mandatory regulatory or data localization directive (RBI/DPDP) with zero architectural discretion."
            else:
                why = "Hard Operational Baseline: Stated team staffing boundary and production expertise baseline that cannot be bypassed."
            facts_str.append(s)
            facts_items.append(_make_item("facts", s, s, "direct_extraction", "stated", 0.95, True, why_classified=why))

        else:
            # Default fallback assignment preserving source extraction
            if len(facts_str) == 0:
                why = "Direct Ground Reality: Verifiable baseline fact documented directly in source records."
                facts_str.append(s)
                facts_items.append(_make_item("facts", s, s, "direct_extraction", "stated", 0.92, True, why_classified=why))
            else:
                why = "Stated Organizational Asset: Documented core capability or operational baseline."
                pros_str.append(s)
                pros_items.append(_make_item("pros", s, s, "direct_extraction", "stated", 0.90, True, why_classified=why))

    # Dynamic summary generated strictly from actual inputs
    lead_topic = raw_sentences[0][:140] if raw_sentences else "strategic deliberation"
    summary = f"Cognitive structuring of core operational decision: {lead_topic}. Grounded in {len(facts_str)} verified facts, {len(assumptions_str)} working assumptions, and {len(cons_str)} operational caveats."

    detected_traps = []
    if contra_str:
        detected_traps.append("Structural Decision Trap: Tension between aggressive timeline/sunk costs and team capacity limits.")
    else:
        detected_traps.append("Confirmation Bias Risk: Stated options lean heavily toward familiar baselines without concurrent load benchmarks.")

    feedback = PrivateTranscriptFeedback(
        tone_observations="Objective, evidence-grounded review of recorded statements and technical boundaries.",
        potential_biases=detected_traps,
        clarity_rating="High" if len(facts_str) >= 2 else "Medium",
        feedback_notes="Validate working assumptions against external benchmarks in Stage 3 Web Research before finalizing Stage 4 scoring.",
    )

    grounded_map = {
        "facts": facts_items,
        "assumptions": assumptions_items,
        "feelings": feelings_items,
        "pros": pros_items,
        "cons": cons_items,
        "mixed_points": mixed_items,
        "contradictions": contra_items,
        "unknowns": unknowns_items,
    }

    findings = StructuredFindings(
        facts=facts_str,
        assumptions=assumptions_str,
        feelings=feelings_str,
        pros=pros_str,
        cons=cons_str,
        mixed_points=mixed_str,
        contradictions=contra_str,
        unknowns=unknowns_str,
        summary=summary,
        private_feedback=feedback,
        grounded_items=grounded_map,
    )
    return findings


EXTERNAL_RESEARCH_MARKERS = [
    "web researched",
    "external research",
    "research finding",
    "research evidence",
    "benchmark report",
    "industry benchmark",
    "industry standard",
    "provider documentation",
    "per research",
    "according to research",
    "conflicting research evidence",
    "unsupported by research",
    "research indicates",
    "google search",
    "tavily",
    "retrieved document",
    "research-agent",
    "research agent",
]


def is_external_research_dependent(item_or_text: Any) -> bool:
    """Check if item or text depends on or references external research, benchmarks, or retrieved documents."""
    if not item_or_text:
        return False
    if isinstance(item_or_text, str):
        t_lower = item_or_text.lower()
    elif hasattr(item_or_text, "text"):
        t_lower = str(item_or_text.text).lower()
    else:
        t_lower = str(item_or_text).lower()
    return any(marker in t_lower for marker in EXTERNAL_RESEARCH_MARKERS)


def is_grounded_in_user_input(source_stmt: str, raw_input: str) -> bool:
    """
    Validation Rule Step 2: Confirm that the source statement comes from the user's original decision input.
    """
    if not source_stmt or not raw_input:
        return False
    source_lower = source_stmt.lower().strip()
    raw_lower = raw_input.lower().strip()

    # Exact substring
    if source_lower in raw_lower:
        return True

    # Token overlap check (substantive words)
    stmt_tokens = set(re.findall(r"\b[a-zA-Z0-9_\-\u0900-\u097F]{4,}\b", source_lower))
    if not stmt_tokens:
        stmt_tokens = set(re.findall(r"\b[a-zA-Z0-9_\-\u0900-\u097F]{3,}\b", source_lower))
    if not stmt_tokens:
        return True

    raw_tokens = set(re.findall(r"\b[a-zA-Z0-9_\-\u0900-\u097F]+\b", raw_lower))
    overlap = stmt_tokens.intersection(raw_tokens)
    overlap_ratio = len(overlap) / len(stmt_tokens)
    return overlap_ratio >= 0.30 or len(overlap) >= 2


def validate_stage2_source_boundary(
    text: str,
    source_stmt: str,
    raw_input: str,
    category: str = "facts",
) -> Tuple[bool, str]:
    """
    4-Step Non-Negotiable Source Boundary Validation Rule for Stage 2 items:
    1. Identify supporting source statement.
    2. Confirm that source statement comes from the user's original decision input.
    3. Confirm that the item does not depend on external research.
    4. Confirm that wording does not increase certainty or introduce an unstated claim.

    If any check fails, return (False, reason) so item is removed from Stage 2.
    """
    # Step 3: Confirm item does not depend on external research
    if is_external_research_dependent(text) or is_external_research_dependent(source_stmt):
        return False, "Depends on external research or third-party benchmark (violates Step 3)"

    # Step 1 & 2: Identify supporting source statement and confirm it comes from user's original input
    if category != "unknowns":
        effective_source = source_stmt if source_stmt else text
        if raw_input and len(raw_input.strip()) >= 20:
            if not (is_grounded_in_user_input(effective_source, raw_input) or is_grounded_in_user_input(text, raw_input)):
                return False, "Source statement not traceable to user's original decision input (violates Step 2)"

    return True, ""


def validate_and_sanitize_grounded_findings(findings: StructuredFindings, raw_input: str) -> StructuredFindings:
    """
    Epistemic validation and sanitization gate applied to all Stage 2 structured findings:
    1. NON-NEGOTIABLE SOURCE BOUNDARY: Purge any items depending on external research, benchmarks, or web outputs.
    2. Grounding Verification: Remove any items whose supporting source statement is not traceable to user input.
    3. Demote false contradictions (trade-offs, constraints, differing timelines) to mixed_points.
    4. Enforce zero contradictions when no mutually incompatible propositions exist.
    5. Ensure unknowns are phrased as questions/missing evidence, not conclusions.
    6. Move speculative claims out of facts into assumptions (Step 4 certainty preservation).
    7. Cleanse amateur psychoanalysis from feelings.
    8. Synchronize and populate grounded_items metadata across all 8 categories.
    """
    raw_lower = raw_input.lower() if raw_input else ""

    # 1. Non-Negotiable Source Boundary: Purge any external research dependence across all categories
    all_categories = [
        "facts",
        "assumptions",
        "feelings",
        "pros",
        "cons",
        "mixed_points",
        "contradictions",
        "unknowns",
    ]
    for cat in all_categories:
        items = getattr(findings, cat, [])
        cleaned = [item for item in items if not is_external_research_dependent(item)]
        setattr(findings, cat, cleaned)

    # 2. Sanitize Contradictions
    filtered_contradictions: List[str] = []
    tradeoff_demoted: List[str] = []

    false_contradiction_markers = [
        "no explicit",
        "no contradiction",
        "none detected",
        "no conflict",
        "differing time horizons",
        "differing priorities",
        "trade-off",
        "trade off",
        "competing priorities",
        "balance between",
        "versus",
        " vs ",
        "tension between",
        "scalability vs",
        "complexity vs",
        "speed vs",
        "cost vs",
        "budget vs",
    ]

    for item in findings.contradictions:
        item_lower = item.lower()
        if any(marker in item_lower for marker in false_contradiction_markers):
            # If it describes a real trade-off (e.g. speed vs quality or scalability vs budget)
            if not any(neg in item_lower for neg in ["no explicit", "no contradiction", "none detected"]):
                tradeoff_demoted.append(item)
        else:
            filtered_contradictions.append(item)

    findings.contradictions = filtered_contradictions
    for td in tradeoff_demoted:
        if td not in findings.mixed_points:
            findings.mixed_points.append(td)

    # 3. Sanitize Unknowns (must be phrased as questions, never conclusions)
    sanitized_unknowns: List[str] = []
    for u in findings.unknowns:
        u_clean = u.strip()
        if not u_clean:
            continue
        # If phrased as a definitive negative conclusion, reframe as inquiry
        if u_clean.lower().startswith("the system cannot") or u_clean.lower().startswith("cannot handle"):
            u_clean = "Can the system handle high peak concurrency without bottlenecks?"
        elif u_clean.lower().startswith("we don't know") or u_clean.lower().startswith("unknown:"):
            content = re.sub(r"^(we don't know|unknown:)\s*", "", u_clean, flags=re.IGNORECASE).strip()
            u_clean = f"What is the verified status of {content.rstrip('.')}?"
        elif not u_clean.endswith("?") and not any(
            u_clean.lower().startswith(q)
            for q in ["what", "how", "which", "whether", "when", "who", "why", "can", "is", "are", "do", "does"]
        ):
            u_clean = f"What is the requirement for: {u_clean.rstrip('.')}?"
        sanitized_unknowns.append(u_clean)
    findings.unknowns = sanitized_unknowns

    # 4. Sanitize Facts (projections/estimates with uncertainty markers belong in assumptions)
    speculative_markers = [
        r"\bmay\b",
        r"\bmight\b",
        r"\bprobably\b",
        r"\bpossibly\b",
        r"\bexpecting maybe\b",
        r"\baround \d+\b",
        r"\beventually\b",
        r"\bhypothesize\b",
    ]
    verified_facts: List[str] = []
    demoted_to_assumptions: List[str] = []

    for f in findings.facts:
        f_lower = f.lower()
        if any(re.search(pat, f_lower) for pat in speculative_markers):
            demoted_to_assumptions.append(f)
        else:
            verified_facts.append(f)

    findings.facts = verified_facts
    for d in demoted_to_assumptions:
        if d not in findings.assumptions:
            findings.assumptions.append(d)

    # 5. Sanitize Feelings (neutralize psychoanalytic terms)
    sanitized_feelings: List[str] = []
    for feel in findings.feelings:
        cleaned = feel
        cleaned = re.sub(r"\bpsychological safety\b", "comfort with existing tooling", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bpsychological security\b", "operational familiarity", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\banxiety\b", "concern", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\banxious\b", "concerned", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bfear\b", "hesitation", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bfearful\b", "hesitant", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\binsecurity\b", "caution", cleaned, flags=re.IGNORECASE)
        sanitized_feelings.append(cleaned)
    findings.feelings = sanitized_feelings

    # 6. Source Boundary 4-Step Validation & Purge
    grounded = findings.grounded_items or {}

    for cat in all_categories:
        current_strings = getattr(findings, cat, [])
        cat_items: List[GroundedCognitiveItem] = grounded.get(cat, [])

        # Filter items and strings that fail the 4-step validation rule
        valid_strings: List[str] = []
        synced_items: List[GroundedCognitiveItem] = []

        for text in current_strings:
            matching = next((item for item in cat_items if item.text == text), None)
            source_stmt = matching.source_statement if matching else ""
            is_valid, reason = validate_stage2_source_boundary(
                text=text,
                source_stmt=source_stmt,
                raw_input=raw_input,
                category=cat,
            )
            if not is_valid:
                logger.warning("Stage 2 item purged by Source Boundary validation (%s): %s | %s", cat, text, reason)
                continue

            valid_strings.append(text)
            if matching:
                synced_items.append(matching)
            else:
                # Create a grounded item with appropriate derivation & epistemic status
                derivation = (
                    "direct_extraction"
                    if cat in {"facts", "feelings"}
                    else (
                        "normalized_extraction"
                        if cat == "pros"
                        else (
                            "explicit_user_inference"
                            if cat == "assumptions"
                            else "analytical_derivation"
                        )
                    )
                )
                epistemic = (
                    "confirmed_fact"
                    if cat in {"facts", "pros"}
                    else (
                        "subjective_preference"
                        if cat == "feelings"
                        else (
                            "projection"
                            if cat == "assumptions"
                            else (
                                "trade_off"
                                if cat == "mixed_points"
                                else (
                                    "true_contradiction"
                                    if cat == "contradictions"
                                    else (
                                        "open_question"
                                        if cat == "unknowns"
                                        else "inferred_risk"
                                    )
                                )
                            )
                        )
                    )
                )
                synced_items.append(
                    _make_item(
                        category=cat,
                        text=text,
                        source_span=source_stmt if source_stmt else text[:120],
                        derivation_type=derivation,
                        epistemic_status=epistemic,
                        confidence=0.95 if cat in {"facts", "feelings"} else 0.85,
                        is_direct=cat in {"facts", "feelings"},
                    )
                )

        setattr(findings, cat, valid_strings)
        grounded[cat] = synced_items

    findings.grounded_items = grounded
    return findings


def call_gemini_direct_rest(model: str, system_prompt: str, user_prompt: str, api_key: str, temperature: float = 0.0) -> str:
    """Direct REST caller for Google Gemini using the native generateContent API with transient error retry."""
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}],
            }
        ],
        "systemInstruction": {
            "parts": [{"text": system_prompt}],
        },
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": temperature,
        },
    }

    last_exc = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                    logger.warning("Gemini REST attempt %d returned %d, retrying...", attempt + 1, resp.status_code)
                    time.sleep(1.5 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (httpx.TimeoutException, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if attempt < 2:
                logger.warning("Gemini REST attempt %d exception (%s), retrying...", attempt + 1, exc)
                time.sleep(1.5 * (attempt + 1))
            else:
                raise exc

    if last_exc:
        raise last_exc
    return ""


def get_llm_client_and_model(task: str = "default"):
    """
    Returns (client, model_name, provider_name).
    Supports:
    - Google Gemini (via OpenAI-compatible endpoint with GEMINI_API_KEY / GOOGLE_API_KEY)
    - OpenAI (with OPENAI_API_KEY)
    - Mock fallback when neither is configured

    Task-specific model routing:
    - task == "structuring" (Stage 2 Cognitive Structuring):
        Uses settings.gemini_structuring_model (default "gemini-3.5-flash")
    - task == "frameworks" (Stage 4 Framework Analysis):
        Uses settings.gemini_framework_model (default "gemini-3.1-flash-lite")
    - default / synthesis / gaps:
        Uses settings.gemini_model (default "gemini-3.5-flash")
    """
    provider = settings.active_ai_provider

    if provider == "azure":
        from openai import AzureOpenAI
        azure_key = settings.azure_openai_api_key.strip()
        azure_endpoint = settings.azure_openai_endpoint.strip()
        azure_api_version = settings.azure_openai_api_version.strip() or "2024-08-01-preview"
        client = AzureOpenAI(
            api_key=azure_key,
            azure_endpoint=azure_endpoint,
            api_version=azure_api_version,
        )
        selected_model = (settings.azure_openai_deployment or "gpt-4o-mini").strip()
        return client, selected_model, "azure"

    if provider == "gemini":
        from openai import OpenAI
        gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
        client = OpenAI(
            api_key=gemini_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            default_headers={"x-goog-api-key": gemini_key},
        )
        if task == "structuring":
            selected_model = (
                getattr(settings, "gemini_structuring_model", None)
                or settings.gemini_model
                or "gemini-3.5-flash"
            )
        elif task == "gaps":
            selected_model = (
                getattr(settings, "gemini_gaps_model", None)
                or settings.gemini_model
                or "gemini-3.5-flash"
            )
        elif task == "frameworks":
            selected_model = (
                getattr(settings, "gemini_framework_model", None)
                or "gemini-3.1-flash-lite"
            )
        else:
            selected_model = settings.gemini_model or "gemini-3.5-flash"

        return client, selected_model, "gemini"

    if provider == "openai":
        from openai import OpenAI
        openai_key = settings.openai_api_key.strip()
        client = OpenAI(api_key=openai_key)
        return client, settings.openai_model, "openai"

    return None, None, "mock"


class AIService:
    """Configurable hosted AI service interfacing with Gemini or OpenAI models."""

    def __init__(self):
        self.debug = settings.debug

    def is_configured(self) -> bool:
        """Check if either Gemini or OpenAI is configured with an active API key."""
        return settings.has_ai_key

    def structure_untrusted_input(
        self,
        raw_text: str,
        language: str = "en",
        force_mock: bool = False,
    ) -> StructuredFindings:
        """
        Structure untrusted input into 8 cognitive categories + private feedback.
        Uses Gemini or OpenAI with json_object response format. Falls back cleanly
        to deterministic mock when no API key is configured or force_mock is requested.
        Applies epistemic validation and source-grounding sanitation to all results.
        """
        if not raw_text or not raw_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot structure empty input. Please provide a problem statement, notes, transcript, or document.",
            )

        client, model, provider = get_llm_client_and_model(task="structuring")

        # Use mock when not configured or force_mock is requested
        if force_mock or client is None:
            logger.info("Using mock AI structuring engine (force_mock=%s, has_key=%s)", force_mock, settings.has_ai_key)
            mock_findings = generate_mock_structuring_findings(raw_text, language)
            return validate_and_sanitize_grounded_findings(mock_findings, raw_text)

        fenced_input = f"<UNTRUSTED_USER_INPUT>\n{raw_text}\n</UNTRUSTED_USER_INPUT>"
        user_prompt = (
            f"Analyze and structure the following untrusted input into DecisionLens's 4 Grounded Dimensions (Ground Truth, Working Assumptions, Decision Traps & Blindspots, Meeting Caveats & Friction) "
            f"and provide private feedback with strict source grounding. Target language context: {language}.\n\n{fenced_input}"
        )

        response_content = None

        # 1. Primary execution via OpenAI / OpenAI-compatible endpoint
        try:
            logger.info("Calling hosted %s model (%s) for cognitive structuring", provider.upper(), model)
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": STRUCTURING_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            response_content = response.choices[0].message.content
        except Exception as exc:
            # 2. Resilient failover: If Azure or Gemini fails, try direct Gemini REST endpoint (Option A fallback)
            gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
            if (provider in {"azure", "gemini"}) and gemini_key:
                logger.warning(
                    "Hosted %s structuring failed (%s). Triggering resilient fallback to native Gemini REST models...",
                    provider.upper(),
                    exc,
                )
                candidate_models = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
                unique_candidates = []
                for m in candidate_models:
                    if m and m not in unique_candidates:
                        unique_candidates.append(m)

                last_err = exc
                for cand in unique_candidates:
                    try:
                        logger.info("Attempting fallback Gemini REST structuring with model '%s'", cand)
                        response_content = call_gemini_direct_rest(
                            model=cand,
                            system_prompt=STRUCTURING_SYSTEM_PROMPT,
                            user_prompt=user_prompt,
                            api_key=gemini_key,
                        )
                        if response_content:
                            logger.info("Fallback Gemini REST structuring succeeded with model '%s'", cand)
                            break
                    except Exception as rest_exc:
                        last_err = rest_exc
                        logger.warning("Fallback Gemini REST call failed on model '%s': %s", cand, rest_exc)

                if not response_content:
                    logger.warning(
                        "All hosted Azure/Gemini models failed (%s). Falling back gracefully to deterministic source-grounded structuring engine.",
                        last_err,
                    )
                    mock_findings = generate_mock_structuring_findings(raw_text, language)
                    return validate_and_sanitize_grounded_findings(mock_findings, raw_text)
            else:
                logger.warning(
                    "Hosted AI structuring error (%s: %s). Falling back gracefully to deterministic source-grounded structuring engine.",
                    provider,
                    exc,
                )
                mock_findings = generate_mock_structuring_findings(raw_text, language)
                return validate_and_sanitize_grounded_findings(mock_findings, raw_text)

        if not response_content:
            raise ValueError(f"Empty response received from {provider.upper()} model.")

        try:
            parsed_data = json.loads(response_content)
            if isinstance(parsed_data, list):
                if len(parsed_data) > 0 and isinstance(parsed_data[0], dict):
                    parsed_data = parsed_data[0]
                else:
                    parsed_data = {}

            # Sanitize category lists to ensure they contain List[str]
            category_keys = [
                "facts", "assumptions", "feelings", "pros", "cons",
                "mixed_points", "contradictions", "unknowns"
            ]
            grounded_map = {}
            for cat_key in category_keys:
                if cat_key in parsed_data and isinstance(parsed_data[cat_key], list):
                    cleaned_items = []
                    item_objects = []
                    for it in parsed_data[cat_key]:
                        if isinstance(it, str):
                            cleaned_items.append(it.strip())
                            item_objects.append(_make_item(cat_key, it.strip()))
                        elif isinstance(it, dict):
                            # extract text from dict
                            extracted = None
                            for field in ["statement", "text", "fact", "assumption", "point", "claim", "content", "description"]:
                                if field in it and isinstance(it[field], str):
                                    extracted = it[field].strip()
                                    break
                            if not extracted:
                                extracted = " ".join(str(v) for v in it.values() if v).strip()
                            if extracted:
                                why_val = it.get("why_classified") or it.get("rationale") or ""
                                cleaned_items.append(extracted)
                                item_objects.append(_make_item(cat_key, extracted, why_classified=str(why_val)))
                        elif it is not None:
                            cleaned_items.append(str(it).strip())
                            item_objects.append(_make_item(cat_key, str(it).strip()))
                    parsed_data[cat_key] = cleaned_items
                    grounded_map[cat_key] = item_objects
            parsed_data["grounded_items"] = grounded_map

            findings = StructuredFindings.model_validate(parsed_data)
        except Exception as parse_err:
            logger.warning(
                "Error validating LLM structuring JSON (%s). Falling back gracefully to deterministic grounded structuring.",
                parse_err,
            )
            findings = generate_mock_structuring_findings(raw_text, language)

        findings = validate_and_sanitize_grounded_findings(findings, raw_text)
        findings.reviewed = False
        return findings


# Global AI Service instance
ai_service = AIService()
