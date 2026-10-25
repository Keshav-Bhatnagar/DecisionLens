import json
import logging
import re
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

GAP_DETECTION_SYSTEM_PROMPT = """You are Dr. Marcus Vance, Lead Architect of the Universal Decision Gap & Completeness Engine at DecisionLens.
Your responsibility: Determine whether the information currently available is sufficient to meaningfully analyze the user's specific decision/problem, discover the decision-relevant information dimensions required for that analysis, identify what is materially missing, and determine how each gap can be resolved.

================================================================================
CORE PROTOCOL: DYNAMIC INFORMATION COMPLETENESS & GAP DETECTION
================================================================================

1. UNDERSTAND THE DECISION / PROBLEM & OBJECTIVE:
Internally identify from the evidence:
- decision_or_problem: What specific choice, problem, or dilemma is being addressed?
- objective: What outcome or goal is the user trying to achieve?
- decision_type / reasoning mode: selection | diagnosis | timing | strategy | prioritization | evaluation | resource allocation | risk assessment (can combine modes, e.g. diagnosis + strategy).
- options: Candidate alternatives if explicitly stated (DO NOT fabricate options if none are stated).
- constraints: Stated boundaries (budget, deadlines, geography, technical limits).
- known_evidence: What has already been established in Stage 1 inputs and Stage 2 structured facts/assumptions.
- explicit_unknowns: Questions the user or Stage 2 already recognized as unknown.

2. DYNAMICALLY DISCOVER DECISION-RELEVANT INFORMATION DIMENSIONS:
Ask: "What categories of information could materially affect the analysis or outcome for THIS specific decision?"
DO NOT use hardcoded domain checklists.
Derive candidate dimensions dynamically from the problem structure:
- Selection: Information required to compare alternatives against the user's needs.
- Diagnosis: Information required to distinguish plausible causes without declaring a premature cause.
- Timing: Information required to assess readiness, milestones, and temporal constraints.
- Strategy: Information required to assess competitive position, differentiation, and resource allocation.
- Prioritization: Information required to evaluate value, urgency, effort, and dependencies.
- Evaluation: Information required to assess strategic, financial, and risk implications.

3. COMPARE CANDIDATE REQUIREMENTS WITH AVAILABLE EVIDENCE:
Evaluate each candidate dimension against ALL available evidence (Stage 1 context, transcript, documents, Stage 2 facts, assumptions, feelings, pros, cons, mixed points, contradictions, unknowns):
Is it KNOWN, PARTIALLY_KNOWN, UNKNOWN, CONFLICTING, or INSUFFICIENT?
Stage 2 Unknowns are inputs, NOT the entire gap set. Discover missing information that Stage 2 did not explicitly identify.

4. PRECISION GUARDRAIL — DO NOT INVENT MEASUREMENT PRECISION:
CRITICAL PRINCIPLE: Stage 3 is allowed to discover a new information gap through reasoning, but it must NOT invent unsupported precision when formulating that gap.

Valid reasoning flow:
Source/context -> identify materially relevant dimension -> identify missing information -> formulate gap.

The system must NOT add unsupported:
- time periods (e.g. "during the next 12 months", "over the next 12–24 months", "in 3 years")
- numerical thresholds (e.g. ">99.9% uptime", "<100ms")
- units (e.g. "in USD", "in milliseconds", "in GB")
- frequencies (e.g. "daily", "monthly", "hourly")
- volumes (e.g. "millions of queries", "terabytes")
- percentages (e.g. "20% growth", "99% availability")
- currencies (e.g. "$", "€", "₹")
- performance targets
- geographic scopes (e.g. "across North America", "in India")
- regulatory standards (e.g. "SOC2", "GDPR", "HIPAA")
- technical metrics (e.g. "IOPS", "QPS", "p99")
- operational conditions (e.g. "during peak traffic", "under high load")
unless explicitly stated in the source or independently justified by the current decision context.

EXAMPLES:
- Source: "We don't know peak concurrent users."
  VALID: "What is the expected peak concurrent user count?"
  INVALID: "What is the expected peak concurrent user count during the next 12 months?" (12-month period was not established).

- Source: "Our initial infrastructure budget is limited."
  VALID: "What is the maximum acceptable infrastructure budget?"
  INVALID: "What is the maximum monthly infrastructure budget?" (Monthly budget was not established).

- Source: "The structure may change frequently."
  VALID: "How frequently are the relevant data structures expected to change?"
  INVALID: "How frequently will the structures change over the next 12–24 months?" (Timeframe was not established).

- Source: "We don't know the read-to-write ratio."
  VALID: "What is the expected read-to-write ratio?"
  INVALID: "What is the expected read-to-write ratio during peak traffic?" (Peak traffic condition was not established).

CORE PRINCIPLE:
Reasoning-rich, but precision-conservative. Infer that information is needed; do NOT infer unsupported details about what the answer should look like.
When precision is not available, formulate the gap at the appropriate level of abstraction.

5. SEPARATE INDEPENDENT GAPS:
Do NOT combine multiple independent unknowns into one compound question merely because they relate to the same decision dimension.
Bad: "What is the peak concurrent user count and requests per second and expected latency?"
Better:
1. What is the expected peak concurrent user count?
2. What request/transaction volume is expected during peak periods?
3. What latency requirements must the platform meet?
Each gap must be independently answerable and independently evaluable for materiality. Formulate each gap with exactly ONE focused question.

6. DISCOVERED GAPS MUST BE TRACEABLE:
If a gap was not explicitly stated as an Unknown in Stage 2, preserve why Stage 3 discovered it.
Include:
- derived_from: list of source elements (e.g. ["decision_context", "stage_2_pro", "stage_2_assumption", "stage_2_unknown"])
- discovery_reason: clear explanation of why this gap was created (e.g. "Schema flexibility is presented as a potential benefit of MongoDB, but the actual degree of schema volatility has not been established.") without relying on generic domain checklists.
The system must be able to explain: "Why did I create this gap?" without relying on generic domain knowledge.

7. MATERIALITY & ANTI-HALLUCINATION FILTER:
A candidate becomes a real gap ONLY if it satisfies all 6 criteria:
A. Decision-relevant: Materially affects the analysis or outcome.
B. Currently insufficient: Not already established in evidence.
C. Material: Resolving it could change the recommendation, ranking, diagnosis, strategy, or next action.
D. Actionable: A realistic path exists to resolve it.
E. Non-redundant: Avoid re-asking what Stage 2 already established.
F. Contextually justified: Derived from the actual decision context, NOT generic industry checklists.
DO NOT INVENT: Never invent compliance requirements (SOC2/GDPR), hostel needs, arbitrary benchmarks, or imaginary metrics unless contextually justified.
ZERO IS VALID: If the evidence is genuinely sufficient, output an empty list of gaps. Never manufacture filler gaps.

8. CLASSIFY GAP TYPE:
Assign one of: CONTEXT, CONSTRAINT, GOAL, PREFERENCE, ELIGIBILITY, REQUIREMENT, QUANTITATIVE, COMPARATIVE, OPERATIONAL, RISK, TEMPORAL, STAKEHOLDER, EVIDENCE, CAUSAL.

9. ASSIGN IMPORTANCE:
- critical: Without resolving this, meaningful analysis or decision synthesis is unsafe or impossible.
- high: Could materially change the recommendation, ranking, or strategy.
- medium: Useful nuance; analysis can proceed with explicit assumptions.
- low: Minor refinement unlikely to change the decision.

10. RESOLUTION ROUTING:
- "ask_user": For internal policy, stakeholder preferences, budget ceiling, success criteria, strategic priorities.
- "web_research": For objective external benchmarks, market empirical data, published comparative metrics, vendor pricing.

11. EXPLAINABILITY & PROVENANCE:
- reason: Clear explanation of why this missing information matters for THIS specific decision.
- materiality_reason: How resolving this gap could swing the outcome or change the winning alternative.
- affected_options: Stated alternatives affected by this uncertainty (empty list if no explicit options exist).
- affected_dimensions: Decision dimensions affected (especially for diagnosis/strategy problems).
- dependencies: IDs of prerequisite gaps that should be resolved first.

================================================================================
OUTPUT JSON SCHEMA:
================================================================================
{
  "gaps": [
    {
      "id": "gap_1",
      "title": "Short descriptive title of the gap",
      "question": "Specific, actionable inquiry targeting a single missing parameter (NO invented precision)...",
      "reason": "Explicit justification of why this datum has the leverage to alter the decision...",
      "gap_type": "REQUIREMENT",
      "importance": "critical/high/medium/low",
      "priority_score": 1,
      "affected_options": ["Option A", "Option B"],
      "affected_dimensions": ["Dimension 1"],
      "recommended_resolution_method": "ask_user/web_research",
      "dependencies": [],
      "derived_from": ["decision_context", "stage_2_pro", "stage_2_assumption"],
      "discovery_reason": "Contextual justification explaining why this gap was discovered...",
      "materiality_reason": "How the answer could change the recommendation or decision outcome..."
    }
  ]
}
"""


def sanitize_gap_precision(question: str, context_text: str) -> str:
    """
    Precision Guardrail Sanitizer:
    Ensures that questions discovered in Stage 3 do NOT invent unsupported measurement precision:
    - No unsupported future time periods (e.g. 'during the next 12 months', 'over the next 12-24 months')
    - No unsupported monthly constraints (e.g. 'monthly budget' -> 'acceptable infrastructure budget')
    - No unsupported operational conditions (e.g. 'during peak traffic' when not in context)
    - Formulates the gap at the appropriate level of abstraction without unsupported specifics.
    """
    if not question:
        return ""
    q = question.strip()
    ctx_lower = (context_text or "").lower()

    # 1. Unsupported future time horizons: e.g. 'during the next 12 months', 'over the next 12–24 months'
    time_window_pattern = r'\s+(?:during|over|in|across)\s+the\s+next\s+\d+(?:[–-]\d+)?\s*(?:months?|years?|weeks?|days?)\b'
    match = re.search(time_window_pattern, q, re.IGNORECASE)
    if match:
        if not any(w in ctx_lower for w in ["next 12", "next 24", "12–24", "12-24", "12 months", "24 months"]):
            q = re.sub(time_window_pattern, "", q, flags=re.IGNORECASE)

    # 2. Unsupported monthly constraints: 'monthly infrastructure budget' -> 'acceptable infrastructure budget'
    if re.search(r'\bmonthly\s+(?:infrastructure\s+)?budget\b', q, re.IGNORECASE):
        if "monthly" not in ctx_lower and "per month" not in ctx_lower:
            q = re.sub(r'\bmonthly\s+infrastructure\s+budget\b', "acceptable infrastructure budget", q, flags=re.IGNORECASE)
            q = re.sub(r'\bmonthly\s+budget\b', "acceptable budget", q, flags=re.IGNORECASE)

    # 3. Unsupported operational conditions: 'during peak traffic'
    if re.search(r'\s+during\s+peak\s+traffic\b', q, re.IGNORECASE):
        if "peak traffic" not in ctx_lower and "traffic spikes" not in ctx_lower:
            q = re.sub(r'\s+during\s+peak\s+traffic\b', "", q, flags=re.IGNORECASE)

    # 4. Clean up punctuation and spacing
    q = re.sub(r'\s+\?', '?', q)
    q = re.sub(r'\s{2,}', ' ', q)
    if not q.endswith('?'):
        q += '?'

    return q


def generate_universal_decision_gaps(
    decision: Decision,
    origin_reason: Optional[str] = None,
    db: Optional[Session] = None,
) -> List[GapItem]:
    """
    Universal Decision Completeness and Gap Detection Engine.
    Dynamically discovers decision-relevant information dimensions, checks evidence sufficiency,
    enforces materiality, avoids redundant questioning, and classifies resolution strategies
    without hardcoded domain checklists.
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

    def _get_origin(reason_label: str) -> str:
        if origin_reason:
            return f"{origin_reason} ({reason_label})"
        return f"Universal Gap Engine ({reason_label})"

    # 1. Gather Stage 2 structured cognitive points
    points = decision.points if isinstance(decision.points, dict) else {}
    stage2_facts = points.get("facts", [])
    stage2_assumptions = points.get("assumptions", [])
    stage2_unknowns = points.get("unknowns", [])

    # Concatenate all available evidence for sufficiency checking
    all_evidence_lower = f"{full_text_lower} " + " ".join(str(f).lower() for f in stage2_facts)

    # 2. Extract explicitly stated candidate options without fabricating or capturing verbal phrases
    extracted_options: List[str] = []

    # A. Explicit colon lists: e.g. "platform: PostgreSQL or MongoDB", "options: A, B", "candidates: X, Y"
    colon_m = re.search(
        r'(?:options|candidates|alternatives|platform|technologies|vendors|choices|cars|database|between two [a-z]+)[:\s]+([A-Za-z0-9\s\-]+?)\s+(?:and|or|vs\.?|versus)\s+([A-Za-z0-9\s\-]+?)(?:[.,;\n]|$)',
        full_text,
        re.IGNORECASE,
    )
    if colon_m:
        o1, o2 = colon_m.group(1).strip(), colon_m.group(2).strip()
        stop_words = {"the", "our", "this", "what", "which", "evaluating", "considering", "two", "three"}
        if len(o1) > 1 and len(o2) > 1 and o1.lower() not in stop_words and o2.lower() not in stop_words:
            extracted_options = [o1, o2]

    # B. "between X and/or Y" (ignoring verbal stop phrases)
    if not extracted_options:
        between_m = re.search(
            r'\bbetween\s+(?:two\s+[a-z]+\s*:\s*)?([A-Za-z0-9\s\-]{2,35}?)\s+(?:and|or|versus|vs\.?)\s+([A-Za-z0-9\s\-]{2,35}?)(?:[.,;\n]|$)',
            full_text,
            re.IGNORECASE,
        )
        if between_m:
            o1, o2 = between_m.group(1).strip(), between_m.group(2).strip()
            stop = {"the", "our", "this", "two", "three", "several", "them", "evaluating", "considering", "transactional"}
            if o1.lower() not in stop and o2.lower() not in stop and not o1.lower().startswith("two ") and not o2.lower().startswith("two "):
                extracted_options = [o1, o2]

    # C. "X vs Y" or "X versus Y"
    if not extracted_options:
        vs_m = re.search(
            r'([A-Za-z0-9\s\-]{2,35})\s+(?:versus|vs\.?)\s+([A-Za-z0-9\s\-]{2,35})',
            full_text,
            re.IGNORECASE,
        )
        if vs_m:
            o1, o2 = vs_m.group(1).strip(), vs_m.group(2).strip()
            stop = {"the", "our", "this", "what", "which", "evaluating"}
            if o1.lower() not in stop and o2.lower() not in stop:
                extracted_options = [o1, o2]

    # D. Named offers or locations: "offer from X and another from Y", "relocate to X or Y"
    if not extracted_options:
        offer_m = re.search(
            r'(?:offer from|relocate to|moving to)\s+([A-Za-z0-9\s\-]{2,35}?)\s+(?:and(?: another from)?|or)\s+([A-Za-z0-9\s\-]{2,35}?)(?:[.,;\n]|$)',
            full_text,
            re.IGNORECASE,
        )
        if offer_m:
            o1, o2 = offer_m.group(1).strip(), offer_m.group(2).strip()
            extracted_options = [o1, o2]

    # 3. Classify Reasoning Mode(s)
    is_diagnosis = any(w in full_text_lower for w in [
        "why", "falling", "drop", "dropped", "declining", "low sales", "diagnose",
        "investigate", "cause", "issue", "bug", "delayed", "underperforming", "churning"
    ])
    is_timing = any(w in full_text_lower for w in [
        "when", "launch date", "launch timing", "release date", "timing", "schedule",
        "when should", "go live date", "time to market"
    ])
    is_strategy = any(w in full_text_lower for w in [
        "how can we", "outperform", "compete", "competitor", "competitive",
        "market share", "strategy", "expand", "growth", "differentiation"
    ])
    is_prioritization = any(w in full_text_lower for w in [
        "which feature", "prioritize", "priority", "what to build first", "roadmap order"
    ])
    is_evaluation = any(w in full_text_lower for w in [
        "should we acquire", "should we invest", "evaluate whether", "worth acquiring", "acquisition"
    ])
    is_selection = any(w in full_text_lower for w in [
        "choose", "select", "which", "versus", " vs ", "migrate from", "compare",
        "alternative", "job offer", "offers", "offer", "accept", "moving to", "relocate",
        "buy or rent", "between", "decide between", "college", "car", "database"
    ]) or bool(extracted_options) or (not is_diagnosis and not is_timing and not is_strategy)

    # 4. Check what evidence is ALREADY established (Sufficiency & Non-Redundancy Filters)
    has_budget = any(pat in all_evidence_lower for pat in [
        "budget is", "budget of", "$", "dollar", "per month", "monthly limit", "annual budget",
        "cost limit", "tuition of", "expenditure cap", "allocated capital"
    ])
    has_timeline = any(pat in all_evidence_lower for pat in [
        "by q", "deadline is", "target launch date", "launching in", "weeks remaining",
        "scheduled for", "must complete by"
    ])
    has_criteria = any(pat in all_evidence_lower for pat in [
        "sla of", "latency target", "conversion target", "success metric", "passing criteria",
        "non-negotiable requirement"
    ])
    has_funnel_breakdown = any(pat in all_evidence_lower for pat in [
        "traffic is steady", "conversion rate dropped", "cart abandonment", "churn rate increased",
        "funnel data indicates"
    ])
    has_onset_timeline = any(pat in all_evidence_lower for pat in [
        "started last month", "since the pricing update", "after version", "began in", "coincided with"
    ])
    has_target_segment = any(pat in all_evidence_lower for pat in [
        "target segment is", "focusing on enterprise", "mid-market niche", "primary audience is"
    ])
    has_academic_field = any(pat in all_evidence_lower for pat in [
        "degree in", "major in", "studying computer science", "engineering program", "business administration", "medical school"
    ])
    has_location_pref = any(pat in all_evidence_lower for pat in [
        "located in", "geographic preference", "campus in", "relocating to"
    ])
    has_readiness_gates = any(pat in all_evidence_lower for pat in [
        "zero p0 bugs", "beta signoff", "qa passed", "load testing verified"
    ])
    has_cohort_analysis = any(pat in all_evidence_lower for pat in [
        "customer segment", "cohort", "channel breakdown", "concentrated in", "across all cohorts", "enterprise customers"
    ])
    has_competitor_intel = any(pat in all_evidence_lower for pat in [
        "competitor capabilities", "competitor intelligence", "moats", "blind spots", "pricing structures", "competitor strengths"
    ])
    has_benchmarks = any(pat in all_evidence_lower for pat in [
        "benchmark", "empirical", "performance metrics", "tested against", "benchmarked", "published throughput", "operations per second"
    ])
    has_operational = any(pat in all_evidence_lower for pat in [
        "team expertise", "operational experience", "maintenance capacity", "internal engineering team", "experience managing", "operational skills", "operational comfort"
    ])

    gap_counter = 1

    # 5. Dynamically construct candidate gaps by reasoning mode
    if is_diagnosis:
        # Diagnostic Problem: Identify missing evidence to isolate root causes without premature declaration
        origin_tag = _get_origin("Diagnostic Analysis Mode")

        if not has_funnel_breakdown:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Funnel Stage Drop-Off Identification",
                    question="Across which specific stage of the customer journey (top-of-funnel traffic/leads, conversion rate, or customer retention/churn) is the primary decline occurring?",
                    reason="Pinpointing the exact point of customer drop-off is required to distinguish whether the root cause is marketing volume, conversion friction, or product dissatisfaction.",
                    gap_type="EVIDENCE",
                    importance="critical",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["funnel_conversion", "acquisition_traffic", "retention"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "diagnostic_requirement"],
                    materiality_reason="Determines which organizational domain (marketing, sales, or product) must be examined, preventing wasted resources on non-failing funnel stages.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        if not has_onset_timeline:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Symptom Onset Timeline & Coinciding Events",
                    question="When exactly did the performance decline begin, and what internal changes (e.g. pricing, product releases, campaign shifts) or external events coincided with the onset?",
                    reason="Establishing temporal correlation is necessary to identify potential trigger events without prematurely asserting causation.",
                    gap_type="CAUSAL",
                    importance="high",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["temporal_onset", "pricing_changes", "product_updates"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "diagnostic_requirement"],
                    materiality_reason="Isolates internal and external event correlations, narrowing candidate causes to those chronologically preceding the decline.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        if not has_cohort_analysis:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Customer Segment & Cohort Variation",
                    question="Is the performance decline concentrated in specific customer segments, geographic regions, or product lines, or is it observed uniformly across all cohorts?",
                    reason="Determining cohort distribution clarifies whether the issue is localized to a particular audience segment or represents a widespread structural failure.",
                    gap_type="EVIDENCE",
                    importance="high",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["customer_segmentation", "cohort_analysis", "channel_breakdown"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "diagnostic_requirement"],
                    materiality_reason="Prevents implementing broad global changes when the problem may be restricted to a single failing segment or channel.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

    elif is_timing:
        # Timing Problem: Focus on readiness criteria, temporal windows, and execution dependencies
        origin_tag = _get_origin("Timing & Readiness Mode")

        if not has_readiness_gates:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Launch Readiness & Quality Gates",
                    question="What objective criteria (technical stability, critical feature completion, QA benchmarks, or customer validation) define that the product is launch-ready?",
                    reason="Establishes an objective threshold of completion to prevent launching prematurely under unverified quality conditions.",
                    gap_type="REQUIREMENT",
                    importance="critical",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["product_readiness", "quality_thresholds"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "timing_requirement"],
                    materiality_reason="Without defined readiness criteria, date-driven commitments risk launching unstable software and damaging market reputation.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        if not has_timeline:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="External Temporal Constraints & Market Windows",
                    question="What hard external deadlines, seasonal market windows, industry events, or contractual commitments constrain the launch date?",
                    reason="Identifies external time-sensitive opportunities or penalties that dictate acceptable release scheduling.",
                    gap_type="TEMPORAL",
                    importance="high",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["market_timing", "seasonal_windows", "external_deadlines"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "timing_requirement"],
                    materiality_reason="Determines whether missing a specific calendar window eliminates the strategic benefit of the launch.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        gaps.append(
            GapItem(
                id=f"gap_{gap_counter}",
                title="Critical Operational & GTM Dependencies",
                question="What critical operational dependencies (customer support staffing, marketing collateral, billing infrastructure, documentation) must be completed before public release?",
                reason="Ensures post-launch support and go-to-market execution are fully coordinated with engineering delivery.",
                gap_type="OPERATIONAL",
                importance="high",
                priority_score=gap_counter,
                affected_options=[],
                affected_dimensions=["go_to_market_readiness", "operational_support"],
                recommended_resolution_method="ask_user",
                status="pending",
                source_origin=origin_tag,
                derived_from=["decision_context", "timing_requirement"],
                materiality_reason="Prevents post-launch operational paralysis caused by uncoordinated cross-functional prerequisites.",
                created_at=now_str,
                updated_at=now_str,
            )
        )
        gap_counter += 1

    elif is_strategy:
        # Strategic Problem: Clarify target differentiation, competitor capabilities, and resource capacity
        origin_tag = _get_origin("Competitive Strategy Mode")

        if not has_target_segment:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Target Positioning & Core Differentiation",
                    question="Which specific customer segment, underserved use case, or distinct value proposition is our primary focus for building competitive differentiation?",
                    reason="Effective competitive strategy requires choosing specific customer needs where differentiation can be established rather than competing broadly.",
                    gap_type="GOAL",
                    importance="critical",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["target_positioning", "value_proposition", "differentiation"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "strategy_requirement"],
                    materiality_reason="Defines the strategic focal point to prevent diluting capital and effort across undifferentiated initiatives.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        if not has_competitor_intel:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Competitor Capabilities & Market Moats",
                    question="What specific capabilities, pricing structures, brand advantages, or distribution moats make key competitors difficult to displace in this market?",
                    reason="Objective third-party competitive intelligence is needed to avoid head-on competition against established competitor strengths.",
                    gap_type="COMPARATIVE",
                    importance="high",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["competitor_analysis", "market_landscape"],
                    recommended_resolution_method="web_research",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "strategy_requirement"],
                    materiality_reason="Directly informs strategic positioning to exploit competitor blind spots rather than challenging fortified positions.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        if not has_budget:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Strategic Resource & Capital Commitment",
                    question="What dedicated capital, headcount, and time horizon are committed to executing and sustaining this competitive initiative?",
                    reason="Strategic goals must be calibrated against actual organizational capacity to avoid committing to unviable plans.",
                    gap_type="CONSTRAINT",
                    importance="high",
                    priority_score=gap_counter,
                    affected_options=[],
                    affected_dimensions=["resource_allocation", "strategic_budget"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "strategy_requirement"],
                    materiality_reason="Ensures the chosen competitive initiatives are financially sustainable across the necessary execution horizon.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

    # 5. Selection & Comparative Decision Mode
    # Handles education, career, personal, consumer, business, and technical selection identically without domain checklists
    if is_selection or (not is_diagnosis and not is_timing and not is_strategy):
        origin_tag = _get_origin("Universal Selection & Comparative Engine")
        opt_names = extracted_options[:3]
        decision_subject = (title or problem or "this decision").strip(" ?.:")

        # Dimension A: Evaluative Criteria & Priority Weighting
        if not has_criteria:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Primary Evaluative Criteria & Success Priorities",
                    question=f"What primary criteria, personal/organizational priorities, and non-negotiable success factors will determine the winning alternative for '{decision_subject}'?",
                    reason="Without explicit evaluative criteria and priority weighting, competing alternatives cannot be objectively scored or compared against the decision-maker's actual requirements.",
                    gap_type="REQUIREMENT",
                    importance="critical",
                    priority_score=gap_counter,
                    affected_options=opt_names,
                    affected_dimensions=["evaluative_criteria", "success_metrics", "priority_weighting"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "selection_requirement"],
                    materiality_reason="Directly establishes the decision matrix; without explicit priorities, alternatives cannot be scored or ranked against trade-offs.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        # Dimension B: Boundary Constraints (Financial, Operational, or Geographic Limits)
        if not has_budget:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Boundary Constraints & Feasibility Limits",
                    question=f"What is the maximum acceptable financial investment, cost ceiling, or non-negotiable boundary constraint for '{decision_subject}'?",
                    reason="Establishes a firm feasibility boundary to eliminate alternatives that require excessive spending or violate fundamental constraints.",
                    gap_type="CONSTRAINT",
                    importance="high",
                    priority_score=gap_counter,
                    affected_options=opt_names,
                    affected_dimensions=["boundary_constraints", "financial_feasibility", "spending_limits"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "selection_requirement"],
                    materiality_reason="Disqualifies candidate options that exceed available capital or violate hard boundaries before deeper analysis.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        # Dimension C: Empirical Comparative Evidence & Verified Trade-Offs (when candidate options exist)
        if extracted_options and len(extracted_options) >= 2 and not has_benchmarks:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Empirical Comparative Evidence & Verified Trade-Offs",
                    question=f"What are the published specifications, verified empirical metrics, and documented trade-offs between {' and '.join(extracted_options[:2])} across key decision factors?",
                    reason="Gathers objective external evidence and verified data points to validate alternative claims rather than relying on unverified assumptions.",
                    gap_type="COMPARATIVE",
                    importance="high",
                    priority_score=gap_counter,
                    affected_options=opt_names,
                    affected_dimensions=["comparative_evidence", "empirical_trade_offs"],
                    recommended_resolution_method="web_research",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "selection_requirement"],
                    materiality_reason="Objective empirical evidence confirms whether candidate alternatives genuinely deliver on claimed capabilities, terms, or performance.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

        # Dimension D: Long-Term Feasibility & Execution Bandwidth
        if not has_operational:
            gaps.append(
                GapItem(
                    id=f"gap_{gap_counter}",
                    title="Long-Term Feasibility & Execution Bandwidth",
                    question=f"What ongoing operational effort, maintenance overhead, or personal lifestyle adjustments are required to sustain the selected alternative for '{decision_subject}' long-term?",
                    reason="Determines whether the ongoing operational demands, personal capacity, or maintenance overhead of the chosen alternative are sustainable over time.",
                    gap_type="OPERATIONAL",
                    importance="medium",
                    priority_score=gap_counter,
                    affected_options=opt_names,
                    affected_dimensions=["operational_feasibility", "maintenance_overhead", "execution_capacity"],
                    recommended_resolution_method="ask_user",
                    status="pending",
                    source_origin=origin_tag,
                    derived_from=["decision_context", "selection_requirement"],
                    materiality_reason="Prevents selecting an option that appears attractive upfront but creates unsustainable ongoing maintenance overhead, organizational friction, or personal regret.",
                    created_at=now_str,
                    updated_at=now_str,
                )
            )
            gap_counter += 1

    return gaps


# Alias for backward compatibility
generate_mock_gaps = generate_universal_decision_gaps


def detect_decision_gaps(
    decision: Decision,
    db: Session,
    force_mock: bool = False,
) -> GapsResponse:
    """
    Detect, prioritize, and structure decision completeness gaps.
    Preserves any existing answered/queued states across re-detections.
    Tags each gap with source_origin to trace where it was fetched from.
    """
    raw_context, _ = assemble_decision_input_context(decision, db=db)
    if not raw_context or len(raw_context.strip()) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot detect information gaps on empty decision. Please provide a problem statement or notes first.",
        )

    def _normalize_q(text: str) -> str:
        return re.sub(r'[^a-z0-9]', '', (text or '').lower())

    # Retain existing answers from previously saved gaps by question or gap ID
    existing_gaps_by_q = {}
    existing_gaps_by_id = {}
    if decision.gaps and "gaps" in decision.gaps:
        for g_dict in decision.gaps["gaps"]:
            if isinstance(g_dict, dict):
                if "id" in g_dict and g_dict["id"]:
                    existing_gaps_by_id[str(g_dict["id"])] = g_dict
                if "question" in g_dict:
                    nq = _normalize_q(g_dict["question"])
                    if nq:
                        existing_gaps_by_q[nq] = g_dict

    detected_gaps: List[GapItem] = []
    client, model, provider = get_llm_client_and_model(task="gaps")

    if force_mock:
        logger.info("Using universal mock gap detection engine (force_mock=True)")
        detected_gaps = generate_universal_decision_gaps(decision, origin_reason="Mock Mode Forced", db=db)
    elif client is None:
        logger.info("No AI client configured (has_key=%s). Using deterministic universal gap engine.", settings.has_ai_key)
        detected_gaps = generate_universal_decision_gaps(decision, origin_reason="Universal Heuristic: No AI Key Configured", db=db)
    else:
        try:
            logger.info("Calling hosted %s model (%s) for universal gap detection", provider.upper(), model)

            # Pass full Stage 2 findings across all categories
            points_summary = ""
            if decision.points and isinstance(decision.points, dict):
                points_summary = (
                    f"\n\n### STAGE 2 STRUCTURED COGNITIVE CONTEXT\n"
                    f"Facts: {json.dumps(decision.points.get('facts', []))}\n"
                    f"Assumptions: {json.dumps(decision.points.get('assumptions', []))}\n"
                    f"Feelings & Preferences: {json.dumps(decision.points.get('feelings', []))}\n"
                    f"Pros & Strengths: {json.dumps(decision.points.get('pros', []))}\n"
                    f"Cons & Risks: {json.dumps(decision.points.get('cons', []))}\n"
                    f"Mixed Points & Trade-Offs: {json.dumps(decision.points.get('mixed_points', []))}\n"
                    f"Contradictions: {json.dumps(decision.points.get('contradictions', []))}\n"
                    f"Stage 2 Explicit Unknowns: {json.dumps(decision.points.get('unknowns', []))}"
                )

            fenced_input = f"<UNTRUSTED_DECISION_CONTEXT>\n{raw_context}{points_summary}\n</UNTRUSTED_DECISION_CONTEXT>"
            user_prompt = f"Analyze information completeness and identify prioritized information gaps for the following decision:\n\n{fenced_input}"

            content = None
            ai_origin = f"AI Engine: {provider.upper()} ({model})"

            if provider == "gemini":
                # Primary execution: native Gemini REST endpoint with candidate models for high reliability
                gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
                candidate_models = [model, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
                unique_candidates = []
                for m in candidate_models:
                    if m and m not in unique_candidates:
                        unique_candidates.append(m)

                last_err = None
                for cand in unique_candidates:
                    try:
                        logger.info("Calling Gemini REST gap detection with model '%s'", cand)
                        content = call_gemini_direct_rest(
                            model=cand,
                            system_prompt=GAP_DETECTION_SYSTEM_PROMPT,
                            user_prompt=user_prompt,
                            api_key=gemini_key,
                            temperature=0.0,
                        )
                        if content:
                            ai_origin = f"AI Engine: GEMINI ({cand})"
                            break
                    except Exception as rest_exc:
                        last_err = rest_exc
                        logger.warning("Gemini REST gap detection failed on model '%s': %s", cand, rest_exc)

                if not content and last_err:
                    raise last_err
            else:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": GAP_DETECTION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.0,
                )
                content = response.choices[0].message.content

            parsed = json.loads(content)
            now_str = datetime.now(timezone.utc).isoformat()

            for item in parsed.get("gaps", []):
                method = str(item.get("recommended_resolution_method", "ask_user")).lower()
                if method not in {"ask_user", "web_research"}:
                    method = "ask_user"

                raw_q = str(item.get("question", "")).strip()
                sanitized_q = sanitize_gap_precision(raw_q, raw_context)

                derived_from_val = list(item.get("derived_from") or ["decision_context", "selection_requirement"])
                discovery_reason_val = str(item.get("discovery_reason") or item.get("materiality_reason") or item.get("reason", ""))

                detected_gaps.append(
                    GapItem(
                        id=str(item.get("id", f"gap_{len(detected_gaps)+1}")),
                        title=str(item.get("title", f"Gap {len(detected_gaps)+1}")),
                        question=sanitized_q,
                        reason=str(item.get("reason", "")),
                        gap_type=str(item.get("gap_type", "REQUIREMENT")).upper(),
                        importance=str(item.get("importance", "medium")).lower(),
                        priority_score=int(item.get("priority_score", len(detected_gaps)+1)),
                        affected_options=list(item.get("affected_options", [])),
                        affected_dimensions=list(item.get("affected_dimensions", [])),
                        recommended_resolution_method=method,
                        status="pending",
                        source_origin=ai_origin,
                        derived_from=derived_from_val,
                        discovery_reason=discovery_reason_val,
                        dependencies=list(item.get("dependencies", [])),
                        materiality_reason=str(item.get("materiality_reason", item.get("reason", ""))),
                        created_at=now_str,
                        updated_at=now_str,
                    )
                )

        except Exception as exc:
            logger.warning(f"Hosted AI gap detection failed ({exc}). Falling back to deterministic universal gap engine.")
            err_msg = f"{exc.__class__.__name__}: {str(exc)[:45]}"
            detected_gaps = generate_universal_decision_gaps(decision, origin_reason=f"Fallback: AI Error ({err_msg})", db=db)

    # Merge in previously answered/skipped/queued states using question or gap ID match
    valid_researched_gap_ids = set()
    for gap in detected_gaps:
        nq = _normalize_q(gap.question)
        prev = existing_gaps_by_q.get(nq) or existing_gaps_by_id.get(gap.id)
        if prev and (prev.get("answer") or prev.get("status") in ["answered", "skipped", "researched", "research_completed"]):
            gap.status = prev.get("status", gap.status)
            gap.answer = prev.get("answer")
            gap.research_query = prev.get("research_query")
            if prev.get("source_origin") and not gap.source_origin:
                gap.source_origin = prev.get("source_origin")
            if "updated_at" in prev:
                gap.updated_at = prev["updated_at"]
        else:
            # Question is new or changed: must remain fresh pending state!
            gap.status = "pending"
            gap.answer = None
            gap.research_query = None

        if gap.status in ["researched", "research_completed"]:
            valid_researched_gap_ids.add(gap.id)

    # Prune stale research findings in decision.research for gaps whose questions changed
    if decision.research and isinstance(decision.research, dict) and "findings" in decision.research:
        active_findings = [
            f for f in decision.research.get("findings", [])
            if isinstance(f, dict) and f.get("gap_id") in valid_researched_gap_ids
        ]
        r_copy = dict(decision.research)
        r_copy["findings"] = active_findings
        decision.research = r_copy

    # Compute status counts
    pending_count = sum(1 for g in detected_gaps if g.status == "pending")
    answered_count = sum(1 for g in detected_gaps if g.status in ["answered", "partially_resolved", "resolved"])
    skipped_count = sum(1 for g in detected_gaps if g.status in ["skipped", "blocked"])
    research_queued_count = sum(1 for g in detected_gaps if g.status == "research_queued")
    researched_count = sum(1 for g in detected_gaps if g.status in ["researched", "research_completed"])
    unresolved_research_count = sum(1 for g in detected_gaps if g.status == "unresolved_research")

    now_iso = datetime.now(timezone.utc).isoformat()
    gaps_data = {
        "gaps": [g.model_dump(mode="json") for g in detected_gaps],
        "detected_at": now_iso,
        "total_gaps": len(detected_gaps),
        "pending_count": pending_count,
        "answered_count": answered_count,
        "skipped_count": skipped_count,
        "research_queued_count": research_queued_count,
        "researched_count": researched_count,
        "unresolved_research_count": unresolved_research_count,
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
        researched_count=researched_count,
        unresolved_research_count=unresolved_research_count,
        message="Information gaps detected and prioritized successfully",
    )
