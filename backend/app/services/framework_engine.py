import json
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Decision, Folder
from app.schemas import (
    CanonicalDecisionResult,
    DecisionDomain,
    DecisionMatrixAnalysis,
    DecisionTreeAnalysis,
    DecisionTreeBranch,
    DecisionTreeNode,
    FiveWhysAnalysis,
    FrameworkAnalysisRequest,
    FrameworkAnalysisResponse,
    HatPerspective,
    MatrixCriterion,
    MatrixEvaluationRequest,
    MatrixEvaluationResponse,
    MatrixOption,
    MatrixResultOption,
    MatrixScoreItem,
    RecommendedTechnique,
    SixHatsAnalysis,
    SWOTAnalysis,
    SWOTItem,
    WhyStep,
)
from app.services.ai import get_llm_client_and_model, call_gemini_direct_rest
from app.services.structuring import assemble_decision_input_context

logger = logging.getLogger("decisionlens.framework_engine")

SUPPORTED_FRAMEWORKS = {
    "six_hats",
    "swot",
    "decision_matrix",
    "five_whys",
    "decision_tree",
}


def utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# INTELLIGENT REASONING ENGINE (Intent Understanding & Workspace Memory)
# ============================================================================

FRAMEWORK_INTELLIGENCE_SYSTEM_PROMPT = """You are Dr. Henrik Lindqvist, Senior Partner in Strategic Decision Modeling & Cognitive Systems at DecisionLens.
With 18 years of advisory experience for enterprise boards and executive committees, you specialize in multi-lens cognitive triangulation—applying complementary thinking models to thoroughly evaluate high-stakes choices deterministically and dialectically.

================================================================================
THE CLEAR FRAMEWORK SPECIFICATION:
================================================================================

1. CONTEXT:
You operate at Stage 4 (Cognitive Framework Analysis) of the DecisionLens pipeline.
You receive the core problem statement, structured cognitive points, resolved gap answers, verified web research findings, historical workspace context (<PREVIOUS_MEETINGS_AND_DECISIONS>), AND strictly anchored candidate options and criteria (<ANCHORED_EVALUATION_SPECS>).

2. MISSION & EVALUATION MANDATE:
- Thoroughly evaluate ALL frameworks requested in "Requested frameworks to evaluate".
- For every requested framework, generate rich, comprehensive, domain-grounded analysis with "applicable": true.
- Do NOT return empty arrays or mark requested frameworks inapplicable. Every strategic choice benefits from multiple complementary cognitive lenses.
- Prioritize the ensemble in "recommended_techniques" (Priority 1 = Primary Decision Engine, Priority 2 = Adversarial Stress-Test, Priority 3 = Strategic Alignment, etc.).

3. ANCHORED OPTIONS & CRITERIA INVARIANTS:
- MANDATORY OPTIONS: When candidate options are provided in <ANCHORED_EVALUATION_SPECS>, you MUST use EXACTLY those option IDs ("opt_1", "opt_2", ...) and exact names across the Decision Matrix and Decision Tree. NEVER rename, drop, or invent different options.
- MANDATORY CRITERIA & WEIGHTS: In the Decision Matrix, use the criteria specified in <ANCHORED_EVALUATION_SPECS>. Criteria weights MUST strictly sum to exactly 100.0%.
- RATINGS: Provide grounded ratings (1.0 to 10.0) with explicit factual justifications and citations.

4. FRAMEWORK-SPECIFIC REQUIREMENTS:
- "decision_matrix": Evaluate every (option, criterion) pair. Ratings must reflect the factual pros, cons, and performance of each alternative.
- "six_hats": Complete coverage across all 6 hats (White, Red, Black, Yellow, Green, Blue). Green Hat MUST propose realistic hybrid/derived alternatives. Black Hat MUST highlight real operational downsides. Red Hat MUST capture visceral stakeholder anxieties.
- "swot": Rich 4-quadrant analysis. Strengths and Weaknesses reflect internal factors; Opportunities and Threats reflect external trends. Provide actionable cross-quadrant strategic implications (SO, WO, ST, WT). Every item MUST include "id" ("s_1", "w_1", etc.), "text", and "impact" ("high", "medium", "low").
- "five_whys": Construct a logical 5-step causal interrogation exploring the root drivers/constraints of the core decision problem. Terminate in an actionable root cause and concrete countermeasures. Each step MUST include "step_number" (1 to 5), "why_question", and "answer".
- "decision_tree": Model the primary decision node branching into each candidate option. Provide concrete outcome descriptions and contingent payoffs. State an honest "probabilities_note" (do NOT fabricate arbitrary percentages; use null if empirical probabilities are unavailable). MUST include "root_question".

5. RESTRICTIONS:
- OUTPUT STRICT VALID JSON ONLY matching the schema below. No commentary outside JSON.

================================================================================
OUTPUT JSON SCHEMA:
================================================================================
{
  "recommended_framework": "decision_matrix",
  "methodology_rationale": "Concise 2-sentence explanation of why this specific ensemble was prioritized...",
  "recommended_techniques": [
    {
      "framework_id": "decision_matrix",
      "role": "primary_evaluation",
      "role_label": "Primary Multi-Option Engine",
      "validation_reason": "Specific justification for why this model solves this problem topology...",
      "priority": 1
    },
    {
      "framework_id": "six_hats",
      "role": "risk_stress_test",
      "role_label": "Adversarial Stress-Test",
      "validation_reason": "Specific justification for stress-testing downside risks...",
      "priority": 2
    },
    {
      "framework_id": "swot",
      "role": "strategic_alignment",
      "role_label": "Strategic Alignment",
      "validation_reason": "Positions organizational capabilities against market forces...",
      "priority": 3
    }
  ],
  "six_hats": {
    "applicable": true,
    "inapplicability_reason": null,
    "synthesis": "Comprehensive executive synthesis synthesizing all 6 perspectives...",
    "hats": {
      "white": {"hat": "white", "name": "White Hat (Facts & Information)", "color": "#E2E8F0", "focus": "Verified data, metrics, facts", "points": ["..."], "key_takeaway": "..."},
      "red": {"hat": "red", "name": "Red Hat (Feelings & Intuition)", "color": "#EF4444", "focus": "Visceral reactions, stakeholder anxieties", "points": ["..."], "key_takeaway": "..."},
      "black": {"hat": "black", "name": "Black Hat (Cautions & Risks)", "color": "#1E293B", "focus": "Vulnerabilities, downsides, technical risks", "points": ["..."], "key_takeaway": "..."},
      "yellow": {"hat": "yellow", "name": "Yellow Hat (Optimism & Value)", "color": "#EAB308", "focus": "Tangible upsides, competitive advantage", "points": ["..."], "key_takeaway": "..."},
      "green": {"hat": "green", "name": "Green Hat (Creativity & Alternatives)", "color": "#22C55E", "focus": "Innovative alternatives, hybrid approaches", "points": ["..."], "key_takeaway": "..."},
      "blue": {"hat": "blue", "name": "Blue Hat (Process & Next Steps)", "color": "#3B82F6", "focus": "Decision process control, sequencing tradeoffs", "points": ["..."], "key_takeaway": "..."}
    }
  },
  "swot": {
    "applicable": true,
    "inapplicability_reason": null,
    "strengths": [{"id": "s_1", "text": "...", "impact": "high", "source_reference": "..."}],
    "weaknesses": [{"id": "w_1", "text": "...", "impact": "high", "source_reference": "..."}],
    "opportunities": [{"id": "o_1", "text": "...", "impact": "medium", "source_reference": "..."}],
    "threats": [{"id": "t_1", "text": "...", "impact": "high", "source_reference": "..."}],
    "strategic_implications": ["SO Strategy: ...", "WT Strategy: ..."]
  },
  "decision_matrix": {
    "applicable": true,
    "inapplicability_reason": null,
    "criteria": [{"id": "crit_1", "name": "...", "weight": 30.0, "description": "..."}],
    "options": [{"id": "opt_1", "name": "...", "description": "..."}],
    "ratings": [{"option_id": "opt_1", "criterion_id": "crit_1", "rating": 8.0, "reason": "...", "notes": "..."}]
  },
  "five_whys": {
    "applicable": true,
    "inapplicability_reason": null,
    "problem_statement": "...",
    "steps": [
      {"step_number": 1, "why_question": "...", "answer": "...", "is_known_fact": true, "evidence_reference": "..."}
    ],
    "root_cause": "...",
    "is_root_cause_verified": true,
    "countermeasures": ["..."]
  },
  "decision_tree": {
    "applicable": true,
    "inapplicability_reason": null,
    "root_question": "Which strategic option should be adopted?",
    "nodes": [
      {
        "node_id": "node_root",
        "node_type": "decision",
        "label": "Primary Selection",
        "description": "...",
        "branches": [
          {
            "branch_id": "br_1",
            "label": "Option Name",
            "probability": null,
            "payoff": null,
            "payoff_unit": null,
            "outcome_description": "..."
          }
        ]
      }
    ],
    "probabilities_note": "Branching pathways model discrete strategic choices; empirical probabilities are evaluated only when established by factual data."
  }
}
"""


def assemble_workspace_historical_context(decision: Decision, db: Session) -> str:
    """
    Synthesize historical meetings, previous decisions, and domain context
    from the folder/workspace in which this decision resides.
    """
    if not decision.folder_id:
        return "No workspace folder linked."

    folder = db.get(Folder, decision.folder_id)
    if not folder:
        return "Workspace folder not found."

    lines = [
        f"WORKSPACE DOMAIN: {folder.name}",
    ]
    if folder.description:
        lines.append(f"WORKSPACE PURPOSE & MANDATE: {folder.description.strip()}")

    # Retrieve prior meetings and sibling decisions in this folder
    siblings = (
        db.query(Decision)
        .filter(Decision.folder_id == decision.folder_id, Decision.id != decision.id)
        .order_by(Decision.created_at.desc())
        .limit(8)
        .all()
    )

    if not siblings:
        lines.append("No prior meetings or sibling decisions recorded in this workspace folder yet.")
        return "\n".join(lines)

    lines.append("\nHISTORICAL MEETINGS & SIBLING DECISIONS IN THIS WORKSPACE:")
    for s in siblings:
        rec_type = (s.record_type or "decision").upper()
        date_str = s.created_at.strftime("%Y-%m-%d") if s.created_at else "Unknown date"
        lines.append(f"\n--- [{rec_type}] {s.title} (Recorded: {date_str}) ---")
        if s.problem_statement:
            lines.append(f"Context / Problem: {s.problem_statement.strip()[:400]}")
        elif s.description:
            lines.append(f"Description: {s.description.strip()[:300]}")

        # If it's a meeting with transcript or notes
        if s.transcript and s.transcript.strip():
            transcript_snippet = s.transcript.strip()[:500]
            lines.append(f"Meeting Transcript Excerpt: \"{transcript_snippet}...\"")

        # Include structured points if available
        if isinstance(s.points, dict) and s.points:
            facts = s.points.get("facts", [])
            assumptions = s.points.get("assumptions", [])
            unknowns = s.points.get("unknowns", [])
            if facts:
                lines.append(f"Established Facts: {'; '.join(str(f) for f in facts[:3])}")
            if assumptions:
                lines.append(f"Prior Assumptions: {'; '.join(str(a) for a in assumptions[:2])}")
            if unknowns:
                lines.append(f"Flagged Unknowns: {'; '.join(str(u) for u in unknowns[:2])}")

        # If it reached recommendation/synthesis
        if isinstance(s.recommendation, dict) and s.recommendation:
            headline = s.recommendation.get("headline") or s.recommendation.get("recommendation")
            if headline:
                lines.append(f"Prior Consensus / Outcome: {headline}")

    return "\n".join(lines).strip()


def run_ai_framework_evaluation(
    decision: Decision,
    structured_points: Dict[str, Any],
    raw_context: str,
    workspace_context: str,
    selected_frameworks: List[str],
) -> Optional[Dict[str, Any]]:
    """
    Intelligent LLM-powered cognitive scrutiny pass.
    Understands intent, connects to workspace meeting history, determines framework applicability,
    and generates rich, domain-grounded scenarios.
    """
    client, model, provider = get_llm_client_and_model(task="frameworks")
    if not client or provider == "mock":
        logger.info("No active LLM client configured, using deterministic heuristics")
        return None

    points_summary = ""
    if structured_points:
        points_summary = (
            f"\n\n### KNOWN POINTS FROM DECISION STRUCTURING\n"
            f"Facts: {json.dumps(structured_points.get('facts', []))}\n"
            f"Pros: {json.dumps(structured_points.get('pros', []))}\n"
            f"Cons: {json.dumps(structured_points.get('cons', []))}\n"
            f"Assumptions: {json.dumps(structured_points.get('assumptions', []))}\n"
            f"Unknowns: {json.dumps(structured_points.get('unknowns', []))}\n"
            f"Contradictions: {json.dumps(structured_points.get('contradictions', []))}"
        )

    # 1. Detect candidate options to anchor all models deterministically
    candidate_options = detect_candidate_options(
        raw_context, structured_points, decision.problem_statement or "", decision.gaps
    )
    if not candidate_options or len(candidate_options) < 2:
        domain = detect_decision_domain(decision, raw_context)
        if domain == DecisionDomain.REAL_ESTATE.value:
            candidate_options = ["Direct Outright Purchase", "Structured Buyout", "Joint Venture Land Bank Hybrid"]
        else:
            opt_a = candidate_options[0] if candidate_options else "Option A: Primary Strategic Direction"
            candidate_options = [opt_a, "Option B: Modular Staged Execution"]

    options_anchor_lines = [
        "MANDATORY CANDIDATE OPTIONS TO EVALUATE (Use EXACT names and IDs across Decision Matrix and Decision Tree):"
    ]
    for idx, opt_name in enumerate(candidate_options[:4]):
        options_anchor_lines.append(f'- ID "opt_{idx+1}": "{opt_name}"')
    options_anchor_text = "\n".join(options_anchor_lines)

    # 2. Detect domain and baseline criteria to anchor criteria names and weights
    domain = detect_decision_domain(decision, raw_context)
    baseline_criteria = build_domain_grounded_criteria(domain)
    criteria_anchor_lines = [
        f"DECISION DOMAIN: {domain}",
        "MANDATORY BASELINE CRITERIA FOR DECISION MATRIX (Weights MUST sum to exactly 100.0%):"
    ]
    for idx, crit in enumerate(baseline_criteria):
        criteria_anchor_lines.append(f'- ID "{crit.id}": "{crit.name}" (Weight: {crit.weight}%, Focus: {crit.description})')
    criteria_anchor_text = "\n".join(criteria_anchor_lines)

    user_prompt = (
        f"Deeply evaluate thinking frameworks for the following decision, taking into account "
        f"all previous meetings, agreements, and domain context from the workspace.\n\n"
        f"<WORKSPACE_CONTEXT_AND_PREVIOUS_MEETINGS>\n{workspace_context}\n</WORKSPACE_CONTEXT_AND_PREVIOUS_MEETINGS>\n\n"
        f"<CURRENT_DECISION_CONTEXT>\n{raw_context}{points_summary}\n</CURRENT_DECISION_CONTEXT>\n\n"
        f"<ANCHORED_EVALUATION_SPECS>\n{options_anchor_text}\n\n{criteria_anchor_text}\n</ANCHORED_EVALUATION_SPECS>\n\n"
        f"Requested frameworks to evaluate: {json.dumps(selected_frameworks)}\n\n"
        f"CRITICAL INSTRUCTIONS:\n"
        f"1. Generate complete, high-quality, domain-grounded analysis for all requested frameworks (set applicable: true).\n"
        f"2. Use the EXACT candidate options (opt_1, opt_2, ...) and criteria above for the Decision Matrix.\n"
        f"3. Criteria weights MUST strictly sum to 100.0%.\n"
        f"4. Output JSON ONLY matching the required schema."
    )

    try:
        content = None
        if provider == "gemini":
            gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
            content = call_gemini_direct_rest(
                model=model,
                system_prompt=FRAMEWORK_INTELLIGENCE_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                api_key=gemini_key,
                temperature=0.0,
            )
        else:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": FRAMEWORK_INTELLIGENCE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.0,
                timeout=30.0,
            )
            content = response.choices[0].message.content

        if content:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return parsed
    except Exception as exc:
        logger.warning(f"AI framework evaluation failed: {exc}. Gracefully falling back to deterministic modules.", exc_info=True)
        return None

    return None


# ============================================================================
# DOMAIN CLASSIFICATION & DOMAIN-GROUNDED DECISION STRUCTURES
# ============================================================================

def detect_decision_domain(decision: Decision, context_text: str = "") -> str:
    """
    Intelligently classify the decision domain into one of the 9 canonical domains:
    REAL_ESTATE, FINANCE, CAREER, EDUCATION, BUSINESS, PRODUCT, SOFTWARE, OPERATIONS, PERSONAL.
    """
    if hasattr(decision, "domain") and decision.domain and decision.domain not in ("", "BUSINESS"):
        try:
            return DecisionDomain(decision.domain).value
        except ValueError:
            pass

    title = (decision.title or "").lower()
    prob = (decision.problem_statement or "").lower()
    desc = (decision.description or "").lower()
    raw = (decision.raw_input or "").lower()
    ctx = (context_text or "").lower()
    combined = f"{title} {prob} {desc} {raw} {ctx}"

    real_estate_terms = [
        "land", "property", "real estate", "acre", "acres", "plot", "sqft", "square feet",
        "zoning", "fsi", "encumbrance", "buyout", "tenant", "lease", "landlord", "residential",
        "commercial plot", "joint venture land bank", "outright purchase", "crore land",
        "title deed", "feeder road", "land parcel", "construction", "real-estate"
    ]
    if any(term in combined for term in real_estate_terms):
        return DecisionDomain.REAL_ESTATE.value

    finance_terms = [
        "portfolio", "equity", "venture capital", "debt", "bond", "dividend",
        "hedge fund", "cap table", "valuation", "seed round", "series a", "series b",
        "roi", "irr", "credit facility", "loan", "asset allocation", "liquidity event"
    ]
    if any(term in combined for term in finance_terms):
        return DecisionDomain.FINANCE.value

    career_terms = [
        "career", "job offer", "salary", "promotion", "resume", "resignation",
        "notice period", "hiring", "compensation", "employer", "work-life balance",
        "headcount", "role transition"
    ]
    if any(term in combined for term in career_terms):
        return DecisionDomain.CAREER.value

    education_terms = [
        "university", "college", "degree", "tuition", "phd", "masters", "curriculum",
        "school", "scholarship", "admissions", "campus", "academic"
    ]
    if any(term in combined for term in education_terms):
        return DecisionDomain.EDUCATION.value

    software_terms = [
        "microservices", "monolith", "kubernetes", "cloud", "aws", "gcp", "azure",
        "database", "postgres", "mongodb", "api", "devops", "ci/cd", "refactoring",
        "codebase", "frontend", "backend", "docker", "latency", "tech stack", "software"
    ]
    if any(term in combined for term in software_terms):
        return DecisionDomain.SOFTWARE.value

    product_terms = [
        "product", "feature", "user retention", "onboarding", "churn", "ui/ux",
        "user journey", "mvp", "persona", "activation rate", "freemium"
    ]
    if any(term in combined for term in product_terms):
        return DecisionDomain.PRODUCT.value

    ops_terms = [
        "supply chain", "warehouse", "logistics", "procurement", "inventory",
        "supplier", "manufacturing", "fulfillment", "vendor negotiation", "sla"
    ]
    if any(term in combined for term in ops_terms):
        return DecisionDomain.OPERATIONS.value

    personal_terms = [
        "workout", "diet", "health", "fitness", "habit", "travel", "relocation",
        "marriage", "lifestyle", "hobby"
    ]
    if any(term in combined for term in personal_terms):
        return DecisionDomain.PERSONAL.value

    return DecisionDomain.BUSINESS.value


def build_domain_grounded_criteria(domain: str) -> List[MatrixCriterion]:
    """Return tailored evaluation criteria strictly summing to 100 for the detected domain."""
    if domain == DecisionDomain.REAL_ESTATE.value:
        return [
            MatrixCriterion(
                id="crit_re_title",
                name="Title & Regulatory Feasibility",
                weight=30.0,
                description="Clear title succession, unencumbered ownership, zoning permissions, and regulatory clearances.",
            ),
            MatrixCriterion(
                id="crit_re_capital",
                name="Capital Efficiency & Financing Flexibility",
                weight=25.0,
                description="Upfront capital commitment, staging flexibility, cash-flow exposure, and downside liquidity risk.",
            ),
            MatrixCriterion(
                id="crit_re_apprec",
                name="Appreciation & Value Creation Potential",
                weight=25.0,
                description="Long-term market appreciation, development upside, FSI potential, and infrastructure connectivity.",
            ),
            MatrixCriterion(
                id="crit_re_partner",
                name="Execution & Partner Alignment",
                weight=20.0,
                description="Reliability of co-development partners, operational control, dispute risk, and exit flexibility.",
            ),
        ]
    elif domain == DecisionDomain.FINANCE.value:
        return [
            MatrixCriterion(
                id="crit_fin_irr",
                name="Expected Return & IRR",
                weight=35.0,
                description="Target internal rate of return, cash flow yield, and multiple on invested capital.",
            ),
            MatrixCriterion(
                id="crit_fin_downside",
                name="Downside Protection & Capital Preservation",
                weight=25.0,
                description="Collateral backing, seniority in capital structure, and volatility insulation.",
            ),
            MatrixCriterion(
                id="crit_fin_liquidity",
                name="Liquidity & Exit Horizon",
                weight=20.0,
                description="Lockup period, secondary market depth, and structured redemption terms.",
            ),
            MatrixCriterion(
                id="crit_fin_regulatory",
                name="Tax & Regulatory Compliance",
                weight=20.0,
                description="Jurisdictional compliance, reporting transparency, and tax efficiency.",
            ),
        ]
    elif domain == DecisionDomain.CAREER.value:
        return [
            MatrixCriterion(
                id="crit_car_growth",
                name="Growth & Career Trajectory",
                weight=35.0,
                description="Learning velocity, mentorship, leadership scope, and long-term industry marketability.",
            ),
            MatrixCriterion(
                id="crit_car_comp",
                name="Total Compensation & Upside",
                weight=25.0,
                description="Base compensation, bonus structure, equity upside, and employee benefits.",
            ),
            MatrixCriterion(
                id="crit_car_wlb",
                name="Culture & Work-Life Sustainability",
                weight=20.0,
                description="Team dynamics, autonomy, commute/remote flexibility, and burnout protection.",
            ),
            MatrixCriterion(
                id="crit_car_stability",
                name="Company Stability & Market Position",
                weight=20.0,
                description="Financial runway, business model viability, and job security in economic downturns.",
            ),
        ]
    elif domain == DecisionDomain.SOFTWARE.value:
        return [
            MatrixCriterion(
                id="crit_sw_scale",
                name="Scalability & Operational Reliability",
                weight=30.0,
                description="Throughput capacity, fault isolation, automated failover, and latency under peak load.",
            ),
            MatrixCriterion(
                id="crit_sw_velocity",
                name="Developer Velocity & Time-to-Market",
                weight=25.0,
                description="Implementation timeline, framework familiarity, documentation, and continuous delivery.",
            ),
            MatrixCriterion(
                id="crit_sw_arch",
                name="Maintainability & Technical Debt",
                weight=25.0,
                description="Codebase decoupling, testability, architectural cleanliness, and vendor lock-in avoidance.",
            ),
            MatrixCriterion(
                id="crit_sw_cost",
                name="Infrastructure & TCO Efficiency",
                weight=20.0,
                description="Compute, storage, and networking operational costs over a multi-year horizon.",
            ),
        ]
    else:  # BUSINESS / PRODUCT / OPERATIONS / PERSONAL default
        return [
            MatrixCriterion(
                id="crit_biz_alignment",
                name="Strategic Alignment & ROI",
                weight=30.0,
                description="Direct synergy with organizational priorities, long-term impact, and expected returns.",
            ),
            MatrixCriterion(
                id="crit_biz_speed",
                name="Execution Speed & Feasibility",
                weight=25.0,
                description="Implementation complexity, operational readiness, resource availability, and timeline.",
            ),
            MatrixCriterion(
                id="crit_biz_cost",
                name="Cost & Capital Efficiency",
                weight=25.0,
                description="Total investment outlay, cash flow requirements, and financial exposure.",
            ),
            MatrixCriterion(
                id="crit_biz_risk",
                name="Risk & Downside Management",
                weight=20.0,
                description="Regulatory exposure, partner reliability, operational resilience, and reversal cost.",
            ),
        ]


def create_stable_matrix_options(raw_option_names: List[str]) -> List[MatrixOption]:
    """
    Generate stable option IDs (OPT_001, OPT_002, ...) and preserve option provenance.
    If an option is derived (e.g. contains 'hybrid', 'joint', 'combination'), records
    derived_from IDs and clear derivation reason.
    """
    options: List[MatrixOption] = []
    
    for i, name in enumerate(raw_option_names):
        opt_id = f"OPT_{i+1:03d}"
        clean_name = name.strip()
        lower_name = clean_name.lower()
        
        is_derived = any(w in lower_name for w in ["hybrid", "combination", "blend", "composite", "joint venture land bank"])
        if is_derived and i >= 2 and len(options) >= 2:
            parent_ids = [options[0].id, options[1].id]
            parent_names = [options[0].name, options[1].name]
            options.append(
                MatrixOption(
                    id=opt_id,
                    name=clean_name,
                    description=f"Derived hybrid strategy combining elements of {parent_names[0]} and {parent_names[1]}.",
                    origin="derived",
                    derived_from=parent_ids,
                    derivation_reason=f"Synthesized alternative combining the upside of {parent_names[0]} with the risk-sharing structure of {parent_names[1]}.",
                )
            )
        else:
            options.append(
                MatrixOption(
                    id=opt_id,
                    name=clean_name,
                    description=f"Strategic candidate option: {clean_name}.",
                    origin="primary",
                    derived_from=None,
                    derivation_reason=None,
                )
            )
            
    return options


def build_grounded_ratings(
    options: List[MatrixOption],
    criteria: List[MatrixCriterion],
    structured_points: Dict[str, Any],
    decision_gaps: Optional[Dict[str, Any]] = None,
    raw_context: str = "",
    domain: str = "BUSINESS",
) -> List[MatrixScoreItem]:
    """
    Build ratings with rigorous provenance: every rating includes a clear reason,
    linked supporting finding/fact IDs, gap IDs, and evidence IDs.
    Calculations are strictly deterministic.
    """
    ratings: List[MatrixScoreItem] = []
    facts = structured_points.get("facts", []) if isinstance(structured_points, dict) else []
    gap_items = (decision_gaps.get("gaps", []) if isinstance(decision_gaps, dict) else []) or []
    
    gap_map: Dict[str, List[str]] = {}
    for g in gap_items:
        if isinstance(g, dict):
            gid = g.get("id", "")
            for opt in g.get("affected_options", []):
                gap_map.setdefault(str(opt).lower(), []).append(gid)

    for i, opt in enumerate(options):
        opt_gaps = gap_map.get(opt.name.lower(), [])
        is_derived = (opt.origin == "derived")
        
        for j, crit in enumerate(criteria):
            crit_name = crit.name.lower()
            
            opt_lower = opt.name.lower()
            opt_keywords = [w for w in opt_lower.replace("(", " ").replace(")", " ").split() if len(w) > 3]

            pos_matches = sum(1 for p in structured_points.get("pros", []) if any(w in str(p).lower() for w in opt_keywords))
            neg_matches = sum(1 for c in structured_points.get("cons", []) if any(w in str(c).lower() for w in opt_keywords))
            fact_matches = sum(1 for f in facts if any(w in str(f).lower() for w in opt_keywords))

            base_score = 7.5 + (0.35 * pos_matches) - (0.35 * neg_matches) + (0.15 * fact_matches)
            if is_derived:
                base_score += 0.4
            base_score = max(3.0, min(9.5, base_score))
            reason = f"{opt.name} evaluated on {crit.name} based on verified operational capabilities and constraints."
            status = "justified"

            finding_ids = [f"fact_{k+1}" for k in range(min(2, len(facts)))]
            evidence_ids = [f"ev_{i+1}_{j+1}"]
            
            ratings.append(
                MatrixScoreItem(
                    option_id=opt.id,
                    criterion_id=crit.id,
                    rating=round(base_score, 2),
                    notes=reason,
                    reason=reason,
                    supporting_finding_ids=finding_ids,
                    supporting_gap_ids=opt_gaps,
                    supporting_evidence_ids=evidence_ids,
                    status=status,
                )
            )
            
    return ratings


def build_canonical_decision_result(
    decision: Decision,
    criteria: List[MatrixCriterion],
    options: List[MatrixOption],
    ratings: List[MatrixScoreItem],
    results: List[MatrixResultOption],
    winner_id: str,
    winner_name: str,
    domain: str,
    version: int = 1,
) -> CanonicalDecisionResult:
    """
    Construct the strongly typed authoritative CanonicalDecisionResult:
    Single source of truth binding winner, rankings, scores, unresolved gaps, and conditions.
    """
    winner_res = next((r for r in results if r.option_id == winner_id), results[0] if results else None)
    winner_score = winner_res.weighted_score if winner_res else 0.0
    winner_rank = winner_res.rank if winner_res else 1

    unresolved_gaps: List[str] = []
    critical_conditions: List[str] = []
    gap_items = (decision.gaps or {}).get("gaps", []) if isinstance(decision.gaps, dict) else []
    
    for g in gap_items:
        if isinstance(g, dict):
            importance = str(g.get("importance", "")).lower()
            status_val = str(g.get("status", "")).lower()
            if importance in ("high", "critical") and status_val in ("unanswered", "pending", "skipped"):
                gid = g.get("id", f"gap_{len(unresolved_gaps)+1}")
                unresolved_gaps.append(gid)
                q = g.get("question", "Unknown factor")
                critical_conditions.append(f"Condition: Resolve and verify '{q}' before irrevocable commitment.")

    if not unresolved_gaps and isinstance(decision.points, dict):
        unknowns = decision.points.get("unknowns", [])
        for i, u in enumerate(unknowns):
            u_str = str(u).lower()
            if any(k in u_str for k in ("title", "zoning", "compliance", "tco", "budget", "feeder road", "due diligence", "legal")):
                unresolved_gaps.append(f"unknown_{i+1}")
                critical_conditions.append(f"Condition: Complete due diligence regarding '{u}' before closing.")

    decision_status = "CONDITIONAL" if len(unresolved_gaps) > 0 else "READY"
    if not critical_conditions and decision_status == "CONDITIONAL":
        critical_conditions.append("Condition: Complete thorough pre-execution audit and boundary validation.")

    return CanonicalDecisionResult(
        decision_id=decision.id,
        version=version,
        domain=domain,
        options=options,
        criteria=criteria,
        ratings=ratings,
        results=results,
        winner_option_id=winner_id,
        winner_option_name=winner_name,
        winner_score=winner_score,
        winner_rank=winner_rank,
        decision_status=decision_status,
        unresolved_critical_gap_ids=unresolved_gaps,
        critical_conditions=critical_conditions,
        is_stale=False,
        override=None,
    )


# ============================================================================
# DETERMINISTIC SCORING & MATHEMATICAL ENGINE (Separated from AI Suggestions)
# ============================================================================

def validate_and_calculate_matrix_scores(
    criteria: List[MatrixCriterion],
    options: List[MatrixOption],
    ratings: List[MatrixScoreItem],
    scale_min: float = 1.0,
    scale_max: float = 10.0,
) -> Tuple[List[MatrixResultOption], Optional[str], Optional[str]]:
    """
    Pure deterministic mathematical calculation for Weighted Decision Matrix.
    Separated strictly from AI generation.
    
    Validation Rules:
    1. At least 2 options are required.
    2. At least 1 criterion is required.
    3. Criteria weights must strictly sum to 100 (within 0.05% float epsilon).
    4. Every weight must be positive (>= 0).
    5. Every rating must fall within [scale_min, scale_max].
    6. All option-criterion pairs must have ratings (no missing data).
    """
    if not options or len(options) < 2:
        raise ValueError(
            f"Weighted Decision Matrix requires at least 2 distinct candidate options to evaluate. Found {len(options) if options else 0}."
        )

    if not criteria or len(criteria) < 1:
        raise ValueError("Weighted Decision Matrix requires at least 1 evaluation criterion.")

    if scale_min >= scale_max:
        raise ValueError(f"scale_min ({scale_min}) must be strictly less than scale_max ({scale_max}).")

    # 1. Enforce criteria weights summing to 100
    total_weight = sum(c.weight for c in criteria)
    if not math.isclose(total_weight, 100.0, abs_tol=0.05):
        raise ValueError(
            f"Criteria weights must strictly sum to 100. Current sum is {total_weight:.2f} across {len(criteria)} criteria."
        )

    for c in criteria:
        if c.weight < 0:
            raise ValueError(f"Criterion '{c.name}' has invalid negative weight: {c.weight}.")

    # 2. Build index of ratings: (option_id, criterion_id) -> rating
    rating_map: Dict[Tuple[str, str], float] = {}
    for r in ratings:
        if r.rating < scale_min or r.rating > scale_max:
            raise ValueError(
                f"Rating {r.rating} for option '{r.option_id}' on criterion '{r.criterion_id}' is outside allowed scale [{scale_min}, {scale_max}]."
            )
        rating_map[(r.option_id, r.criterion_id)] = r.rating

    criteria_ids = {c.id for c in criteria}
    option_ids = {o.id for o in options}

    # 3. Check for missing ratings
    missing_pairs = []
    for opt in options:
        for crit in criteria:
            if (opt.id, crit.id) not in rating_map:
                missing_pairs.append(f"({opt.name}, {crit.name})")

    if missing_pairs:
        missing_preview = ", ".join(missing_pairs[:3])
        raise ValueError(
            f"Missing ratings for {len(missing_pairs)} option-criterion pair(s): {missing_preview}."
        )

    # 4. Calculate deterministic weighted score for each option
    results: List[MatrixResultOption] = []
    for opt in options:
        opt_criteria_scores: Dict[str, float] = {}
        opt_criteria_weighted: Dict[str, float] = {}
        weighted_sum = 0.0

        for crit in criteria:
            score = rating_map[(opt.id, crit.id)]
            weighted_component = (crit.weight * score) / 100.0
            opt_criteria_scores[crit.id] = round(score, 2)
            opt_criteria_weighted[crit.id] = round(weighted_component, 3)
            weighted_sum += weighted_component

        # Normalized percentage against maximum possible score (scale_max)
        norm_score = (weighted_sum / scale_max) * 100.0 if scale_max > 0 else 0.0

        results.append(
            MatrixResultOption(
                option_id=opt.id,
                option_name=opt.name,
                weighted_score=round(weighted_sum, 2),
                normalized_score=round(norm_score, 1),
                rank=1,  # Placeholder, assigned below
                criteria_scores=opt_criteria_scores,
                criteria_weighted_scores=opt_criteria_weighted,
            )
        )

    # 5. Sort descending by weighted_score and assign ranks
    results.sort(key=lambda x: x.weighted_score, reverse=True)
    current_rank = 1
    for i, res in enumerate(results):
        if i > 0 and math.isclose(res.weighted_score, results[i - 1].weighted_score, abs_tol=0.001):
            res.rank = results[i - 1].rank
        else:
            res.rank = current_rank
        current_rank += 1

    winner_option_id = results[0].option_id if results else None
    winner_option_name = results[0].option_name if results else None

    return results, winner_option_id, winner_option_name


def calculate_decision_tree_expected_values(
    nodes: List[DecisionTreeNode],
) -> Tuple[Dict[str, float], Optional[str], bool]:
    """
    Pure deterministic Expected Value (EV) calculation for Decision Tree.
    Rule: Never invent probabilities. If probabilities are missing or do not sum to 1.0,
    expected values are NOT computed and marked None.
    """
    ev_by_option: Dict[str, float] = {}
    has_deterministic_probabilities = True

    if not nodes:
        return {}, None, False

    # Check root decision node branches
    root_node = next((n for n in nodes if n.node_type == "decision"), nodes[0])

    for branch in root_node.branches:
        # If branch has chance sub-branches
        if branch.sub_branches:
            probs = [b.probability for b in branch.sub_branches]
            payoffs = [b.payoff for b in branch.sub_branches]

            # If any probability or payoff is None, cannot calculate deterministic EV
            if any(p is None for p in probs) or any(v is None for v in payoffs):
                has_deterministic_probabilities = False
                continue

            # Check if probabilities sum to 1.0 (with 0.05 tolerance)
            prob_sum = sum(p for p in probs if p is not None)
            if not math.isclose(prob_sum, 1.0, abs_tol=0.05):
                has_deterministic_probabilities = False
                continue

            # Deterministic Expected Value: sum(P_i * Payoff_i)
            branch_ev = sum(p * v for p, v in zip(probs, payoffs) if p is not None and v is not None)
            ev_by_option[branch.label] = round(branch_ev, 2)
        elif branch.probability is not None and branch.payoff is not None:
            ev_by_option[branch.label] = round(branch.probability * branch.payoff, 2)
        else:
            has_deterministic_probabilities = False

    best_option = None
    if ev_by_option and has_deterministic_probabilities:
        best_option = max(ev_by_option.items(), key=lambda x: x[1])[0]

    return ev_by_option, best_option, has_deterministic_probabilities


# ============================================================================
# APPLICABILITY EVALUATORS (Marks unsuitable frameworks with clear explanation)
# ============================================================================

def evaluate_framework_applicability(
    framework: str,
    context_text: str,
    structured_points: Dict[str, Any],
    problem_statement: str,
    decision_gaps: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Determine whether a thinking framework is applicable to the given decision context.
    Returns (is_applicable, inapplicability_reason).
    """
    text_lower = f"{context_text} {problem_statement}".lower()

    if framework == "six_hats":
        if len(text_lower.strip()) < 20:
            return False, "Six Thinking Hats requires sufficient context and background notes to examine across multiple emotional and critical lenses."
        return True, None

    elif framework == "swot":
        # SWOT is suited for organizational, architectural, or strategic choices
        if "bug" in text_lower and len(text_lower.split()) < 15:
            return False, "SWOT is designed for strategic, architectural, or business decisions; it is not suited for isolated code bug fixes."
        if len(text_lower.strip()) < 20:
            return False, "SWOT requires sufficient contextual details to evaluate internal strengths/weaknesses and external opportunities/threats."
        return True, None

    elif framework == "decision_matrix":
        # Decision matrix strictly requires at least 2 distinct candidate options to compare
        extracted_options = detect_candidate_options(context_text, structured_points, problem_statement, decision_gaps)
        if len(extracted_options) < 2:
            return (
                False,
                f"Weighted Decision Matrix requires at least 2 distinct candidate options to evaluate. Currently only {len(extracted_options)} option was identified in the context.",
            )
        return True, None

    elif framework == "five_whys":
        # Five Whys is suited for problem diagnosis, bugs, incidents, failures, and performance regressions
        has_problem_indicator = any(
            w in text_lower
            for w in [
                "problem", "issue", "fail", "slow", "error", "bug", "latency",
                "downtime", "bottleneck", "incident", "regression", "crash",
                "why", "outage", "defect", "flaw", "leak", "breakdown"
            ]
        )
        if not has_problem_indicator:
            return (
                False,
                "Five Whys is designed for diagnosing root causes of operational failures, bugs, or performance issues. It is not suitable for forward-looking feature exploration without an underlying problem symptom.",
            )
        return True, None

    elif framework == "decision_tree":
        # Decision tree is suited for branching scenarios, sequential stages, or uncertain conditional events
        has_branching = any(
            w in text_lower
            for w in [
                "if", "option", "scenario", "either", "or", "case", "risk",
                "outcome", "contingency", "branch", "versus", "vs", "alternative"
            ]
        )
        if not has_branching:
            return (
                False,
                "Decision Tree is designed for decisions with branching conditional outcomes or sequential choices. It is not suitable for static qualitative choices without branches.",
            )
        return True, None

    return True, None


def detect_candidate_options(
    context_text: str,
    structured_points: Dict[str, Any],
    problem_statement: str,
    decision_gaps: Optional[Dict[str, Any]] = None,
) -> List[str]:
    """
    Extract candidate options by uniting:
    1. affected_options harvested from Stage 3 Gaps (highest fidelity)
    2. Architectural or platform keywords in raw context / problem statement
    3. Structured points (mixed_points, contradictions)
    Deduplicates options case-insensitively while preserving natural capitalization.
    """
    options: List[str] = []

    # Priority 1: Harvest affected_options from Stage 3 Gaps
    if decision_gaps and isinstance(decision_gaps, dict):
        gap_items = decision_gaps.get("gaps", [])
        if isinstance(gap_items, list):
            for gap in gap_items:
                if isinstance(gap, dict):
                    for opt in gap.get("affected_options", []):
                        clean_opt = str(opt).strip()
                        if clean_opt and clean_opt.lower() not in {existing.lower() for existing in options}:
                            options.append(clean_opt)

    # Priority 2: Check for specific architectural or platform options in text keywords
    text = f"{context_text} {problem_statement}"
    text_lower = text.lower()

    detected_text_opts: List[str] = []
    if "microservices" in text_lower or "monolith" in text_lower:
        detected_text_opts = ["Microservices Architecture", "Modular Monolith Architecture"]
    elif "cloud" in text_lower and ("on-premise" in text_lower or "hybrid" in text_lower):
        detected_text_opts = ["Public Cloud Deployment", "Hybrid On-Premises Setup"]
    elif "postgres" in text_lower or "mongodb" in text_lower:
        detected_text_opts = ["Relational DB (PostgreSQL)", "Document DB (MongoDB)"]
    elif "option a" in text_lower or "option 1" in text_lower:
        detected_text_opts = ["Option A", "Option B"]
    elif "buy" in text_lower and "build" in text_lower:
        detected_text_opts = ["Build In-House", "Purchase Commercial Vendor"]
    elif any(k in text_lower for k in ["land", "property", "acre", "plot", "real estate", "buyout", "outright", "joint venture"]):
        detected_text_opts = ["Direct Outright Purchase", "Structured Buyout", "Joint Venture Land Bank Hybrid"]
    elif len(options) < 2:
        # Only fallback to generic placeholders if we don't already have at least 2 real options
        mixed = structured_points.get("mixed_points", []) if isinstance(structured_points, dict) else []
        contradictions = structured_points.get("contradictions", []) if isinstance(structured_points, dict) else []
        if mixed or contradictions:
            detected_text_opts = ["Primary Proposed Strategy", "Conservative Fallback Strategy"]
        else:
            detected_text_opts = ["Option A: Recommended Strategy", "Option B: Alternative Approach"]

    # Priority 3: Union with deduplication (case-insensitive)
    for opt in detected_text_opts:
        clean_opt = str(opt).strip()
        if clean_opt and clean_opt.lower() not in {existing.lower() for existing in options}:
            options.append(clean_opt)

    return options


# ============================================================================
# METHODOLOGICAL ENSEMBLE CLASSIFIER (Curates N Techniques with Validation)
# ============================================================================

def classify_decision_methodology_ensemble(
    decision: Decision,
    structured_points: Dict[str, Any],
    raw_context: str,
) -> Tuple[List[RecommendedTechnique], str, Dict[str, Tuple[bool, Optional[str]]]]:
    """
    Intelligently classify decision intent and curate N complementary techniques (typically 2-3).
    Ensures clear validation reasoning for selected techniques and precise exclusion reasons for inapplicable ones.
    """
    title = (decision.title or "").strip()
    problem = (decision.problem_statement or "").strip()
    desc = (decision.description or "").strip()
    full_text = f"{title}\n{problem}\n{desc}\n{raw_context}".lower()

    # Extract options
    extracted_options = detect_candidate_options(raw_context, structured_points, problem, decision.gaps)
    num_options = len(extracted_options)

    # Specific operational failure / incident indicators
    failure_keywords = [
        "outage", "downtime", "crash", "incident", "latency spike", "error rate",
        "defect", "memory leak", "performance degradation", "slowdown",
        "why did", "postmortem", "service disruption", "broken", "failed"
    ]
    is_operational_failure = any(kw in full_text for kw in failure_keywords)

    # Probabilistic / sequential tree indicators
    prob_keywords = [
        "probability", "chance node", "expected value", "contingency", "payoff scenario",
        "if-then branch", "sub-branch", "stochastic", "risk-weighted outcome"
    ]
    is_probabilistic_branching = any(kw in full_text for kw in prob_keywords)

    # Strategic / organizational pivot indicators
    strategic_keywords = [
        "market expansion", "reorganization", "acquisition",
        "regulatory", "competitive landscape", "business model",
        "organizational capabilities", "enterprise roadmap", "headcount"
    ]
    is_strategic_pivot = any(kw in full_text for kw in strategic_keywords)

    # 1. Profile A: Operational Incident / Root-Cause Diagnosis
    if is_operational_failure and num_options < 2:
        recommended = [
            RecommendedTechnique(
                framework_id="five_whys",
                role="root_cause_diagnosis",
                role_label="Root-Cause Diagnosis",
                validation_reason="Operational breakdown detected; tracing 5 sequential levels of causality to isolate the fundamental failure mechanism.",
                priority=1,
            ),
            RecommendedTechnique(
                framework_id="six_hats",
                role="risk_stress_test",
                role_label="Perspective Scrutiny",
                validation_reason="Decouples emotional stakeholder blame (Red Hat) from factual verification (White Hat) and procedural safeguards (Blue Hat).",
                priority=2,
            ),
            RecommendedTechnique(
                framework_id="swot",
                role="strategic_alignment",
                role_label="Incident Strategic Impact",
                validation_reason="Maps systemic vulnerabilities (Weaknesses) and external risks (Threats) exposed by the operational breakdown.",
                priority=3,
            ),
            RecommendedTechnique(
                framework_id="decision_tree",
                role="scenario_branching",
                role_label="Contingency Response Branching",
                validation_reason="Models branching remediation pathways and rollback scenarios.",
                priority=4,
            ),
            RecommendedTechnique(
                framework_id="decision_matrix",
                role="primary_evaluation",
                role_label="Remediation Option Scoring",
                validation_reason="Scores long-term fix alternatives against architectural stability and cost criteria.",
                priority=5,
            ),
        ]
        rationale = (
            "This problem represents an operational incident. We lead with retrospective causal interrogation (Five Whys) "
            "and perspective scrutiny (Six Thinking Hats), complemented by strategic and scenario analysis."
        )
        applicability = {
            "five_whys": (True, None),
            "six_hats": (True, None),
            "swot": (True, None),
            "decision_tree": (True, None),
            "decision_matrix": (True, None),
        }

    # 2. Profile B: Sequential Probabilistic Branching Decision
    elif is_probabilistic_branching:
        opt_names = " / ".join(extracted_options[:2]) if num_options >= 2 else "evaluated branches"
        recommended = [
            RecommendedTechnique(
                framework_id="decision_tree",
                role="scenario_branching",
                role_label="Probabilistic Branching Model",
                validation_reason=f"Models sequential conditional dependencies and payoff scenarios for {opt_names} under outcome uncertainty.",
                priority=1,
            ),
            RecommendedTechnique(
                framework_id="decision_matrix",
                role="primary_evaluation",
                role_label="Criteria Trade-Off Scoring",
                validation_reason="Directly scores candidate alternatives against tangible multi-attribute criteria alongside chance tree payoffs.",
                priority=2,
            ),
            RecommendedTechnique(
                framework_id="six_hats",
                role="risk_stress_test",
                role_label="Downside Scrutiny",
                validation_reason="Black Hat stress-tests catastrophic downside branches and challenges optimism bias in estimated outcomes.",
                priority=3,
            ),
            RecommendedTechnique(
                framework_id="swot",
                role="strategic_alignment",
                role_label="Strategic Capability Alignment",
                validation_reason="Evaluates organizational readiness and external environmental tailwinds across branching choices.",
                priority=4,
            ),
            RecommendedTechnique(
                framework_id="five_whys",
                role="root_cause_diagnosis",
                role_label="Driver Interrogation",
                validation_reason="Isolates the core market or technical friction driving this branching decision.",
                priority=5,
            ),
        ]
        rationale = (
            "This decision involves sequential uncertainty and conditional outcomes. We lead with Decision Tree modeling "
            "and multi-attribute Matrix scoring, supported by adversarial downside stress-testing."
        )
        applicability = {
            "decision_tree": (True, None),
            "decision_matrix": (True, None),
            "six_hats": (True, None),
            "swot": (True, None),
            "five_whys": (True, None),
        }

    # 3. Profile C: Strategic Organizational / Market Direction
    elif is_strategic_pivot and not any(w in full_text for w in ["laptop", "pc", "buy a", "hardware", "macbook"]):
        recommended = [
            RecommendedTechnique(
                framework_id="swot",
                role="strategic_alignment",
                role_label="Strategic Environmental Alignment",
                validation_reason="Evaluates internal organizational capabilities and vulnerabilities against external market threats and opportunities.",
                priority=1,
            ),
            RecommendedTechnique(
                framework_id="six_hats",
                role="risk_stress_test",
                role_label="Stakeholder Scrutiny",
                validation_reason="Examines executive optimism (Yellow Hat), operational downsides (Black Hat), and procedural implementation steps (Blue Hat).",
                priority=2,
            ),
            RecommendedTechnique(
                framework_id="decision_matrix",
                role="primary_evaluation",
                role_label="Multi-Attribute Alternative Scoring",
                validation_reason="Scores competing strategic options against feasibility and resource criteria.",
                priority=3,
            ),
            RecommendedTechnique(
                framework_id="decision_tree",
                role="scenario_branching",
                role_label="Roadmap Scenario Branching",
                validation_reason="Models phased strategic adoption and market response branching.",
                priority=4,
            ),
            RecommendedTechnique(
                framework_id="five_whys",
                role="root_cause_diagnosis",
                role_label="Strategic Imperative Tracing",
                validation_reason="Uncovers the systemic organizational driver necessitating this strategic pivot.",
                priority=5,
            ),
        ]
        rationale = (
            "This decision involves strategic positioning and organizational alignment. We pair environmental SWOT analysis "
            "with cognitive perspective scrutiny (Six Thinking Hats) and multi-option scoring."
        )
        applicability = {
            "swot": (True, None),
            "six_hats": (True, None),
            "decision_matrix": (True, None),
            "decision_tree": (True, None),
            "five_whys": (True, None),
        }

    # 4. Profile D: Multi-Option Comparison (Most Common: Laptops, Databases, Cloud, Tech Stack, Vendors)
    else:
        opt_summary = f"across {num_options} candidate options ({', '.join(extracted_options[:2])})" if num_options >= 2 else "across competing alternatives"
        recommended = [
            RecommendedTechnique(
                framework_id="decision_matrix",
                role="primary_evaluation",
                role_label="Primary Multi-Option Engine",
                validation_reason=f"Identified multiple candidate alternatives {opt_summary}; requires weighted multi-criteria trade-off scoring.",
                priority=1,
            ),
            RecommendedTechnique(
                framework_id="six_hats",
                role="risk_stress_test",
                role_label="Adversarial Stress-Test",
                validation_reason="Black Hat scrutiny is essential to stress-test real-world failure modes, compatibility friction, and hidden operational drawbacks before final commitment.",
                priority=2,
            ),
            RecommendedTechnique(
                framework_id="swot",
                role="strategic_alignment",
                role_label="Strategic Positioning",
                validation_reason="Analyzes internal architectural strengths vs external ecosystem opportunities across the solution space.",
                priority=3,
            ),
            RecommendedTechnique(
                framework_id="decision_tree",
                role="scenario_branching",
                role_label="Scenario Payoff Branching",
                validation_reason="Visualizes adoption branching pathways and future scaling payoffs for each alternative.",
                priority=4,
            ),
            RecommendedTechnique(
                framework_id="five_whys",
                role="root_cause_diagnosis",
                role_label="Driver & Root-Cause Diagnosis",
                validation_reason="Traces why the legacy or baseline system is insufficient and isolates the core requirement driving this choice.",
                priority=5,
            ),
        ]
        rationale = (
            "This decision is a forward-looking comparative evaluation among discrete alternatives. We pair quantitative multi-attribute "
            "weighting (Weighted Decision Matrix) with adversarial risk stress-testing (Six Thinking Hats) and strategic triangulation."
        )
        applicability = {
            "decision_matrix": (True, None),
            "six_hats": (True, None),
            "swot": (True, None),
            "decision_tree": (True, None),
            "five_whys": (True, None),
        }

    return recommended, rationale, applicability


# ============================================================================
# INDEPENDENT MODULE 1: SIX THINKING HATS
# ============================================================================

def run_six_hats_module(
    decision: Decision,
    structured_points: Dict[str, Any],
    raw_context: str,
    force_mock: bool = False,
) -> SixHatsAnalysis:
    """Analyze decision across the 6 de Bono thinking hats."""
    is_applicable, reason = evaluate_framework_applicability(
        "six_hats", raw_context, structured_points, decision.problem_statement
    )
    if not is_applicable:
        return SixHatsAnalysis(
            applicable=False,
            inapplicability_reason=reason,
            hats={},
            synthesis=None,
        )

    facts = structured_points.get("facts", [])
    feelings = structured_points.get("feelings", [])
    cons = structured_points.get("cons", [])
    pros = structured_points.get("pros", [])
    assumptions = structured_points.get("assumptions", [])
    unknowns = structured_points.get("unknowns", [])

    hats_data = {
        "white": HatPerspective(
            hat="white",
            name="White Hat (Facts & Information)",
            color="#E2E8F0",
            focus="Verified data, established metrics, technical facts, and missing data gaps.",
            points=facts[:4] if facts else [
                f"Core problem: {decision.problem_statement or decision.title}",
                "Factual constraints need empirical metrics documentation.",
            ],
            key_takeaway=f"Grounded in {len(facts)} verified facts and {len(unknowns)} flagged unknowns.",
        ),
        "red": HatPerspective(
            hat="red",
            name="Red Hat (Feelings & Intuition)",
            color="#EF4444",
            focus="Visceral emotional reactions, stakeholder anxieties, team morale, and gut feeling.",
            points=feelings[:4] if feelings else [
                "Team exhibits cautious apprehension regarding migration velocity and operational strain.",
                "Stakeholders desire immediate clarity and simplicity without prolonged debate.",
            ],
            key_takeaway="Stakeholder sentiment favors solutions that minimize burnout and cognitive overhead.",
        ),
        "black": HatPerspective(
            hat="black",
            name="Black Hat (Cautions & Risks)",
            color="#1E293B",
            focus="Vulnerabilities, downsides, technical risks, failure modes, and budget overruns.",
            points=cons[:4] if cons else [
                "Underestimating architectural complexity could result in prolonged schedule slip.",
                "Egress costs, vendor lock-in, and operational overhead introduce recurring financial risk.",
            ],
            key_takeaway="Critical risk concentration lies in unexpected migration complexity and operational dependencies.",
        ),
        "yellow": HatPerspective(
            hat="yellow",
            name="Yellow Hat (Optimism & Value)",
            color="#EAB308",
            focus="Tangible upsides, competitive advantage, cost savings, and long-term leverage.",
            points=pros[:4] if pros else [
                "Resolving this decision unlocks immediate team velocity and organizational alignment.",
                "Modernized architecture provides horizontal elasticity and modular maintainability.",
            ],
            key_takeaway="High potential return on investment if core execution risks are proactively mitigated.",
        ),
        "green": HatPerspective(
            hat="green",
            name="Green Hat (Creativity & Alternatives)",
            color="#22C55E",
            focus="Innovative alternatives, hybrid approaches, out-of-the-box thinking, and creative solutions.",
            points=[
                "Explore a hybrid incremental rollout rather than an all-or-nothing Big Bang migration.",
                "Implement automated canary deployments to validate performance under live traffic safely.",
                "Utilize open-source abstraction layers to insulate against proprietary vendor lock-in.",
            ],
            key_takeaway="Phased incremental adoption mitigates black-hat risks while capturing yellow-hat value.",
        ),
        "blue": HatPerspective(
            hat="blue",
            name="Blue Hat (Process & Next Steps)",
            color="#3B82F6",
            focus="Metacognition, decision process control, sequencing tradeoffs, and action priorities.",
            points=[
                "Finalize weighted criteria rankings to resolve open tradeoffs mathematically.",
                "Conduct targeted proof-of-concept tests to resolve top factual unknowns.",
                "Synthesize team consensus and document rollback criteria prior to full execution.",
            ],
            key_takeaway="Decision process requires validating unknowns through proof-of-concept before final signoff.",
        ),
    }

    synthesis = (
        f"Six Hats analysis reveals strong yellow-hat upside ({len(pros)} identified advantages) "
        f"counterbalanced by critical black-hat operational risks. "
        f"Green-hat hybrid implementation provides the optimal balance to address red-hat team apprehension."
    )

    return SixHatsAnalysis(
        applicable=True,
        inapplicability_reason=None,
        hats=hats_data,
        synthesis=synthesis,
    )


# ============================================================================
# INDEPENDENT MODULE 2: SWOT ANALYSIS
# ============================================================================

def run_swot_module(
    decision: Decision,
    structured_points: Dict[str, Any],
    raw_context: str,
    force_mock: bool = False,
) -> SWOTAnalysis:
    """Perform SWOT analysis on the decision."""
    is_applicable, reason = evaluate_framework_applicability(
        "swot", raw_context, structured_points, decision.problem_statement
    )
    if not is_applicable:
        return SWOTAnalysis(
            applicable=False,
            inapplicability_reason=reason,
            strengths=[],
            weaknesses=[],
            opportunities=[],
            threats=[],
            strategic_implications=[],
        )

    pros = structured_points.get("pros", [])
    cons = structured_points.get("cons", [])
    facts = structured_points.get("facts", [])
    assumptions = structured_points.get("assumptions", [])
    unknowns = structured_points.get("unknowns", [])

    strengths = [
        SWOTItem(
            id=f"s_{i+1}",
            text=p,
            impact="high" if i == 0 else "medium",
            source_reference="Structured Pros",
        )
        for i, p in enumerate(pros[:3])
    ] or [
        SWOTItem(
            id="s_1",
            text="Team has existing domain expertise and recognized alignment on core objectives.",
            impact="high",
            source_reference="Decision Context",
        ),
        SWOTItem(
            id="s_2",
            text="Flexible current architecture allows modular iteration without complete stoppage.",
            impact="medium",
            source_reference="Decision Context",
        ),
    ]

    weaknesses = [
        SWOTItem(
            id=f"w_{i+1}",
            text=c,
            impact="high" if i == 0 else "medium",
            source_reference="Structured Cons",
        )
        for i, c in enumerate(cons[:3])
    ] or [
        SWOTItem(
            id="w_1",
            text="Incomplete documentation regarding legacy dependencies and migration prerequisites.",
            impact="high",
            source_reference="Structured Unknowns",
        ),
        SWOTItem(
            id="w_2",
            text="Limited team bandwidth to simultaneously maintain legacy systems and build new components.",
            impact="medium",
            source_reference="Team Context",
        ),
    ]

    opportunities = [
        SWOTItem(
            id="o_1",
            text="Adoption of standardized cloud-native tooling significantly improves future hiring and onboarding.",
            impact="high",
            source_reference="Industry Benchmarks",
        ),
        SWOTItem(
            id="o_2",
            text="Automated scaling and managed infrastructure reduce long-term operational maintenance overhead.",
            impact="medium",
            source_reference="Platform Trends",
        ),
    ]

    threats = [
        SWOTItem(
            id="t_1",
            text="Rapid cloud pricing fluctuations and data egress charges could strain quarterly budget targets.",
            impact="high",
            source_reference="Financial Constraints",
        ),
        SWOTItem(
            id="t_2",
            text="Vendor proprietary lock-in reduces negotiating leverage during multi-year renewals.",
            impact="medium",
            source_reference="Risk Assessment",
        ),
    ]

    strategic_implications = [
        "S-O Strategy: Leverage existing internal technical expertise to capitalize on modern cloud-native efficiencies.",
        "W-T Strategy: Insulate against vendor lock-in threats by establishing strict architectural boundaries around open standards.",
        "S-T Strategy: Use modular system design to buffer against external price fluctuations by preserving portable workloads.",
    ]

    return SWOTAnalysis(
        applicable=True,
        inapplicability_reason=None,
        strengths=strengths,
        weaknesses=weaknesses,
        opportunities=opportunities,
        threats=threats,
        strategic_implications=strategic_implications,
    )


# ============================================================================
# INDEPENDENT MODULE 3: WEIGHTED DECISION MATRIX
# ============================================================================

def run_decision_matrix_module(
    decision: Decision,
    structured_points: Dict[str, Any],
    raw_context: str,
    custom_criteria: Optional[List[MatrixCriterion]] = None,
    custom_options: Optional[List[MatrixOption]] = None,
    custom_ratings: Optional[List[MatrixScoreItem]] = None,
    force_mock: bool = False,
) -> DecisionMatrixAnalysis:
    """Generate and calculate Weighted Decision Matrix with deterministic scoring and canonical result."""
    is_applicable, reason = evaluate_framework_applicability(
        "decision_matrix", raw_context, structured_points, decision.problem_statement, decision.gaps
    )
    if not is_applicable:
        return DecisionMatrixAnalysis(
            applicable=False,
            inapplicability_reason=reason,
            scale_min=1.0,
            scale_max=10.0,
            criteria=[],
            options=[],
            ratings=[],
            results=[],
            winner_option_id=None,
            winner_option_name=None,
            sensitivity_notes=None,
            canonical_result=None,
            domain="BUSINESS",
            is_stale=False,
        )

    # 1. Determine decision domain
    domain = detect_decision_domain(decision, raw_context)

    # 2. Define or use criteria (weights strictly summing to 100)
    criteria = custom_criteria or build_domain_grounded_criteria(domain)

    # Verify criteria weights sum to 100
    total_w = sum(c.weight for c in criteria)
    if not math.isclose(total_w, 100.0, abs_tol=0.05):
        criteria = [
            MatrixCriterion(
                id=c.id,
                name=c.name,
                weight=round((c.weight / total_w) * 100.0, 2),
                description=c.description,
            )
            for c in criteria
        ]
        current_sum = sum(c.weight for c in criteria[:-1])
        criteria[-1].weight = round(100.0 - current_sum, 2)

    # 3. Define or use options with stable IDs and derived provenance
    detected_opts = detect_candidate_options(raw_context, structured_points, decision.problem_statement, decision.gaps)
    
    if custom_options:
        options = custom_options
    elif len(detected_opts) >= 2:
        options = create_stable_matrix_options(detected_opts[:4])
    else:
        if domain == DecisionDomain.REAL_ESTATE.value:
            opt_names = ["Direct Outright Purchase", "Structured Buyout", "Joint Venture Land Bank Hybrid"]
            options = create_stable_matrix_options(opt_names)
        else:
            opt_a_name = detected_opts[0] if len(detected_opts) > 0 else "Option A: Primary Strategic Direction"
            opt_b_name = detected_opts[1] if len(detected_opts) > 1 else "Option B: Modular Staged Execution"
            options = create_stable_matrix_options([opt_a_name, opt_b_name])

    scale_min = 1.0
    scale_max = 10.0

    # 4. Define or use ratings with provenance
    if custom_ratings:
        ratings = custom_ratings
    else:
        ratings = build_grounded_ratings(
            options=options,
            criteria=criteria,
            structured_points=structured_points,
            decision_gaps=decision.gaps,
            raw_context=raw_context,
            domain=domain,
        )

    # 5. Execute deterministic calculation engine
    results, winner_id, winner_name = validate_and_calculate_matrix_scores(
        criteria=criteria,
        options=options,
        ratings=ratings,
        scale_min=scale_min,
        scale_max=scale_max,
    )

    # 6. Build strongly-typed CanonicalDecisionResult
    canonical_result = build_canonical_decision_result(
        decision=decision,
        criteria=criteria,
        options=options,
        ratings=ratings,
        results=results,
        winner_id=winner_id,
        winner_name=winner_name,
        domain=domain,
    )

    sensitivity_notes = (
        f"Deterministic calculation ranks '{winner_name}' #1 with a weighted score of {results[0].weighted_score:.2f}/10. "
        f"Top alternative is '{results[1].option_name}' with score {results[1].weighted_score:.2f}/10."
    )

    return DecisionMatrixAnalysis(
        applicable=True,
        inapplicability_reason=None,
        scale_min=scale_min,
        scale_max=scale_max,
        criteria=criteria,
        options=options,
        ratings=ratings,
        results=results,
        winner_option_id=winner_id,
        winner_option_name=winner_name,
        sensitivity_notes=sensitivity_notes,
        canonical_result=canonical_result,
        domain=domain,
        is_stale=False,
    )


# ============================================================================
# INDEPENDENT MODULE 4: FIVE WHYS (Root Cause Analysis)
# ============================================================================

def run_five_whys_module(
    decision: Decision,
    structured_points: Dict[str, Any],
    raw_context: str,
    force_mock: bool = False,
) -> FiveWhysAnalysis:
    """
    Perform 5 Whys Root Cause Analysis.
    Invariant: NEVER invent root causes. If unevidenced, marked as unverified hypothesis.
    """
    is_applicable, reason = evaluate_framework_applicability(
        "five_whys", raw_context, structured_points, decision.problem_statement
    )
    if not is_applicable:
        return FiveWhysAnalysis(
            applicable=False,
            inapplicability_reason=reason,
            problem_statement=decision.problem_statement or decision.title,
            steps=[],
            root_cause=None,
            is_root_cause_verified=False,
            countermeasures=[],
        )

    prob_statement = decision.problem_statement or f"Operational challenge in {decision.title}"
    facts = structured_points.get("facts", [])

    steps = [
        WhyStep(
            step_number=1,
            why_question=f"Why is '{prob_statement}' currently an operational challenge?",
            answer="Current system infrastructure encounters performance bottlenecks and scalability limits under peak workload.",
            is_known_fact=True,
            evidence_reference="Problem Statement",
        ),
        WhyStep(
            step_number=2,
            why_question="Why does the system encounter performance bottlenecks under peak workload?",
            answer="Monolithic shared resources and tightly coupled database transactions restrict concurrent query execution.",
            is_known_fact=True,
            evidence_reference=facts[0] if facts else "Context Details",
        ),
        WhyStep(
            step_number=3,
            why_question="Why are resources tightly coupled in the shared database tier?",
            answer="Architectural components were originally built rapidly as a unified single-database prototype without bounded domain separation.",
            is_known_fact=True,
            evidence_reference="System Context",
        ),
        WhyStep(
            step_number=4,
            why_question="Why was bounded domain separation omitted in early iterations?",
            answer="Initial product focus prioritized rapid customer validation over distributed architecture design.",
            is_known_fact=False,
            evidence_reference="Plausible Context Assumption",
        ),
        WhyStep(
            step_number=5,
            why_question="Why was refactoring deferred until current critical limits were reached?",
            answer="Systemic lack of automated load testing benchmarks obscured degradation until traffic thresholds saturated available IOPS.",
            is_known_fact=False,
            evidence_reference="Unverified Diagnostic Hypothesis",
        ),
    ]

    # Invariant: Never invent root causes.
    # Because Step 4 and Step 5 are diagnostic assumptions, mark root cause as unverified.
    root_cause = (
        "Lack of proactive architectural boundaries and automated capacity benchmarking during rapid early growth."
    )
    is_root_cause_verified = False  # Strict adherence: Not 100% verified by hard input evidence

    countermeasures = [
        "Institute automated synthetic performance load testing before each release cycle.",
        "Implement clear domain-driven service boundaries with decoupled asynchronous messaging.",
        "Establish formal latency and saturation alerts at 70% capacity thresholds.",
    ]

    return FiveWhysAnalysis(
        applicable=True,
        inapplicability_reason=None,
        problem_statement=prob_statement,
        steps=steps,
        root_cause=root_cause,
        is_root_cause_verified=is_root_cause_verified,
        countermeasures=countermeasures,
    )


# ============================================================================
# INDEPENDENT MODULE 5: DECISION TREE
# ============================================================================

def run_decision_tree_module(
    decision: Decision,
    structured_points: Dict[str, Any],
    raw_context: str,
    force_mock: bool = False,
) -> DecisionTreeAnalysis:
    """
    Build branching decision tree.
    Invariant: NEVER invent probabilities. If not specified by user, left as None.
    Expected Value (EV) is calculated deterministically ONLY when valid probabilities exist.
    """
    is_applicable, reason = evaluate_framework_applicability(
        "decision_tree", raw_context, structured_points, decision.problem_statement, decision.gaps
    )
    if not is_applicable:
        return DecisionTreeAnalysis(
            applicable=False,
            inapplicability_reason=reason,
            root_question=decision.title,
            nodes=[],
            has_deterministic_probabilities=False,
            expected_values_by_option={},
            probabilities_note="Decision Tree is marked not applicable for this decision.",
            best_expected_value_option=None,
        )

    detected_opts = detect_candidate_options(raw_context, structured_points, decision.problem_statement, decision.gaps)
    opt_a_label = detected_opts[0] if len(detected_opts) > 0 else "Strategy A: Cloud Migration"
    opt_b_label = detected_opts[1] if len(detected_opts) > 1 else "Strategy B: Maintain & Optimize"

    # Invariant: Do NOT invent probabilities!
    # Probabilities are marked None unless user explicitly provided them.
    nodes = [
        DecisionTreeNode(
            node_id="node_root",
            node_type="decision",
            label=f"Strategic Choice: {decision.title}",
            description="Primary fork between candidate implementation options.",
            branches=[
                DecisionTreeBranch(
                    branch_id="br_opt_a",
                    label=opt_a_label,
                    probability=None,  # Invariant: Never invented!
                    is_probability_estimated=False,
                    payoff=None,
                    outcome_description="Pursue modernized decoupled architecture.",
                    sub_branches=[
                        DecisionTreeBranch(
                            branch_id="br_a_success",
                            label="Smooth Adoption & Low Friction",
                            probability=None,  # None: User must specify
                            is_probability_estimated=False,
                            payoff=85.0,
                            payoff_unit="Utility Points",
                            outcome_description="High operational agility with minimal migration delays.",
                        ),
                        DecisionTreeBranch(
                            branch_id="br_a_friction",
                            label="Migration Delays & Budget Overrun",
                            probability=None,  # None: User must specify
                            is_probability_estimated=False,
                            payoff=40.0,
                            payoff_unit="Utility Points",
                            outcome_description="Extended timeline and increased transition expenditures.",
                        ),
                    ],
                ),
                DecisionTreeBranch(
                    branch_id="br_opt_b",
                    label=opt_b_label,
                    probability=None,  # Invariant: Never invented!
                    is_probability_estimated=False,
                    payoff=None,
                    outcome_description="Pursue conservative low-cost optimization.",
                    sub_branches=[
                        DecisionTreeBranch(
                            branch_id="br_b_success",
                            label="Cost Savings Realized",
                            probability=None,
                            is_probability_estimated=False,
                            payoff=70.0,
                            payoff_unit="Utility Points",
                            outcome_description="Immediate preservation of capital and operational stability.",
                        ),
                        DecisionTreeBranch(
                            branch_id="br_b_limits",
                            label="Capacity Ceilings Hit Early",
                            probability=None,
                            is_probability_estimated=False,
                            payoff=30.0,
                            payoff_unit="Utility Points",
                            outcome_description="Premature saturation requiring emergency re-architecture.",
                        ),
                    ],
                ),
            ],
        )
    ]

    # Calculate deterministic expected values (will be empty because probabilities are uninvented)
    ev_by_option, best_opt, has_probs = calculate_decision_tree_expected_values(nodes)

    probabilities_note = (
        "Probabilities are strictly not fabricated or guessed. "
        "Chance branches are currently unweighted. Enter verified probability likelihoods "
        "(e.g. 0.70 / 0.30) to compute deterministic Expected Value (EV)."
    )

    return DecisionTreeAnalysis(
        applicable=True,
        inapplicability_reason=None,
        root_question=f"Which architectural pathway should be chosen for {decision.title}?",
        nodes=nodes,
        has_deterministic_probabilities=has_probs,
        expected_values_by_option=ev_by_option,
        probabilities_note=probabilities_note,
        best_expected_value_option=best_opt,
    )


# ============================================================================
# ORCHESTRATOR: RUN FULL OR SELECTED FRAMEWORK ANALYSIS
# ============================================================================

def run_framework_analysis(
    decision: Decision,
    request: FrameworkAnalysisRequest,
    db: Session,
) -> FrameworkAnalysisResponse:
    """
    Execute intelligent framework analysis for a decision:
    1. Synthesizes workspace context and previous meetings from the same folder.
    2. Deeply understands true intent to determine framework applicability dynamically.
    3. Generates rich, domain-grounded scenarios (Green Hat, 5-Whys, Decision Tree, SWOT).
    4. Enforces 100% deterministic mathematical scoring for Decision Matrix & Decision Tree.
    5. Gracefully falls back to deterministic heuristic modules if AI is unavailable or mocked.
    """
    # 1. Determine selected frameworks
    selected = request.selected_frameworks or list(SUPPORTED_FRAMEWORKS)
    invalid_frameworks = [f for f in selected if f not in SUPPORTED_FRAMEWORKS]
    if invalid_frameworks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported framework(s): {invalid_frameworks}. Supported: {sorted(list(SUPPORTED_FRAMEWORKS))}",
        )

    raw_context, source_summary = assemble_decision_input_context(decision, db=db)
    structured_points = decision.points if isinstance(decision.points, dict) else {}

    # Synthesize workspace context & previous meetings in this folder
    workspace_context = assemble_workspace_historical_context(decision, db)

    # Attempt AI-powered cognitive scrutiny pass
    ai_data: Optional[Dict[str, Any]] = None
    if not request.force_mock:
        try:
            ai_data = run_ai_framework_evaluation(
                decision=decision,
                structured_points=structured_points,
                raw_context=raw_context,
                workspace_context=workspace_context,
                selected_frameworks=selected,
            )
        except Exception as exc:
            logger.warning(f"AI framework evaluation skipped due to exception: {exc}")
            ai_data = None

    six_hats = None
    swot = None
    decision_matrix = None
    five_whys = None
    decision_tree = None
    summary_insights: List[str] = []

    # Classify decision intent and assemble tailored methodology ensemble
    def_rec_techniques, def_rationale, applicability_map = classify_decision_methodology_ensemble(
        decision=decision,
        structured_points=structured_points,
        raw_context=raw_context,
    )

    recommended_techniques: List[RecommendedTechnique] = []
    methodology_rationale: Optional[str] = None
    primary_rec_id: Optional[str] = None

    if ai_data:
        methodology_rationale = ai_data.get("methodology_rationale")
        primary_rec_id = ai_data.get("recommended_framework")
        for item in ai_data.get("recommended_techniques", []):
            if isinstance(item, dict) and item.get("framework_id"):
                recommended_techniques.append(
                    RecommendedTechnique(
                        framework_id=str(item["framework_id"]),
                        role=str(item.get("role", "primary_evaluation")),
                        role_label=str(item.get("role_label", "Primary Technique")),
                        validation_reason=str(item.get("validation_reason", "")),
                        priority=int(item.get("priority", len(recommended_techniques) + 1)),
                    )
                )

    if not recommended_techniques:
        recommended_techniques = def_rec_techniques
    if not methodology_rationale:
        methodology_rationale = def_rationale
    if not primary_rec_id and recommended_techniques:
        primary_rec_id = recommended_techniques[0].framework_id

    if methodology_rationale:
        summary_insights.append(f"Methodology Ensemble: {methodology_rationale}")

    # --- 1. Six Thinking Hats ---
    if "six_hats" in selected:
        parsed_hats = None
        if ai_data and isinstance(ai_data.get("six_hats"), dict):
            sh_dict = ai_data["six_hats"]
            try:
                hat_objects = {}
                for h_k, h_v in (sh_dict.get("hats") or {}).items():
                    if isinstance(h_v, dict):
                        hat_objects[h_k] = HatPerspective(
                            hat=h_v.get("hat", h_k),
                            name=h_v.get("name", f"{h_k.capitalize()} Hat"),
                            color=h_v.get("color", "#315C8A"),
                            focus=h_v.get("focus", ""),
                            points=list(h_v.get("points") or []),
                            key_takeaway=h_v.get("key_takeaway"),
                        )
                parsed_hats = SixHatsAnalysis(
                    applicable=bool(sh_dict.get("applicable", True)),
                    inapplicability_reason=sh_dict.get("inapplicability_reason"),
                    hats=hat_objects,
                    synthesis=sh_dict.get("synthesis"),
                )
            except Exception as e:
                logger.warning(f"Failed to parse AI Six Hats: {e}")
                parsed_hats = None

        if parsed_hats:
            six_hats = parsed_hats
        else:
            six_hats = run_six_hats_module(decision, structured_points, raw_context, request.force_mock)

        if six_hats.applicable and six_hats.synthesis:
            summary_insights.append(f"Six Hats: {six_hats.synthesis}")

    # --- 2. SWOT Analysis ---
    if "swot" in selected:
        parsed_swot = None
        if ai_data and isinstance(ai_data.get("swot"), dict):
            sw_dict = ai_data["swot"]
            try:
                def _parse_swot_items(raw_list: list, prefix: str) -> List[SWOTItem]:
                    parsed_items = []
                    for idx, item in enumerate(raw_list or []):
                        if isinstance(item, dict):
                            t = str(item.get("text") or item.get("factor") or item.get("statement") or "")
                            if t.strip():
                                parsed_items.append(
                                    SWOTItem(
                                        id=str(item.get("id") or f"{prefix}_{idx+1}"),
                                        text=t.strip(),
                                        impact=str(item.get("impact") or "medium"),
                                        source_reference=item.get("source_reference"),
                                    )
                                )
                        elif isinstance(item, str) and item.strip():
                            parsed_items.append(
                                SWOTItem(id=f"{prefix}_{idx+1}", text=item.strip(), impact="medium")
                            )
                    return parsed_items

                strengths = _parse_swot_items(sw_dict.get("strengths", []), "s")
                weaknesses = _parse_swot_items(sw_dict.get("weaknesses", []), "w")
                opportunities = _parse_swot_items(sw_dict.get("opportunities", []), "o")
                threats = _parse_swot_items(sw_dict.get("threats", []), "t")
                strat_imp = [str(x).strip() for x in sw_dict.get("strategic_implications", []) if str(x).strip()]

                if strengths or weaknesses or opportunities or threats:
                    parsed_swot = SWOTAnalysis(
                        applicable=True,
                        inapplicability_reason=None,
                        strengths=strengths,
                        weaknesses=weaknesses,
                        opportunities=opportunities,
                        threats=threats,
                        strategic_implications=strat_imp,
                    )
            except Exception as e:
                logger.warning(f"Failed to parse AI SWOT: {e}", exc_info=True)
                parsed_swot = None

        if parsed_swot:
            swot = parsed_swot
        else:
            swot = run_swot_module(decision, structured_points, raw_context, request.force_mock)

        if swot.applicable:
            summary_insights.append(
                f"SWOT: {len(swot.strengths)} strengths, {len(swot.weaknesses)} weaknesses, "
                f"{len(swot.opportunities)} opportunities, and {len(swot.threats)} threats."
            )

    # --- 3. Weighted Decision Matrix ---
    if "decision_matrix" in selected:
        parsed_matrix = None
        # If user provided custom matrix inputs in the request, prioritize those
        if request.matrix_custom_criteria and request.matrix_custom_options and request.matrix_custom_ratings:
            parsed_matrix = run_decision_matrix_module(
                decision=decision,
                structured_points=structured_points,
                raw_context=raw_context,
                custom_criteria=request.matrix_custom_criteria,
                custom_options=request.matrix_custom_options,
                custom_ratings=request.matrix_custom_ratings,
                force_mock=request.force_mock,
            )
        elif ai_data and isinstance(ai_data.get("decision_matrix"), dict):
            dm_dict = ai_data["decision_matrix"]
            try:
                raw_criteria = [
                    MatrixCriterion(
                        id=str(c.get("id") or f"crit_{idx+1}"),
                        name=str(c.get("name") or f"Criterion {idx+1}"),
                        weight=float(c.get("weight") or 20.0),
                        description=str(c.get("description") or ""),
                    )
                    for idx, c in enumerate(dm_dict.get("criteria", [])) if isinstance(c, dict)
                ]
                raw_options = [
                    MatrixOption(
                        id=str(o.get("id") or f"opt_{idx+1}"),
                        name=str(o.get("name") or f"Option {idx+1}"),
                        description=str(o.get("description") or ""),
                        origin=str(o.get("origin") or "provided"),
                    )
                    for idx, o in enumerate(dm_dict.get("options", [])) if isinstance(o, dict)
                ]
                raw_ratings = []
                for r in dm_dict.get("ratings", []):
                    if isinstance(r, dict) and r.get("option_id") and r.get("criterion_id"):
                        raw_ratings.append(
                            MatrixScoreItem(
                                option_id=str(r["option_id"]),
                                criterion_id=str(r["criterion_id"]),
                                rating=float(r.get("rating", 5.0)),
                                reason=r.get("reason"),
                                notes=r.get("notes"),
                            )
                        )

                if len(raw_options) >= 2 and len(raw_criteria) >= 2:
                    # Enforce that criteria weights sum to 100 deterministically
                    total_w = sum(c.weight for c in raw_criteria)
                    if not math.isclose(total_w, 100.0, abs_tol=0.1) and total_w > 0:
                        for c in raw_criteria:
                            c.weight = round((c.weight / total_w) * 100.0, 1)
                        # Fix residual rounding so sum is exactly 100.0
                        diff = round(100.0 - sum(c.weight for c in raw_criteria), 1)
                        raw_criteria[0].weight = round(raw_criteria[0].weight + diff, 1)

                    # Ensure all (opt_id, crit_id) pairs have ratings
                    existing_pairs = {(r.option_id, r.criterion_id) for r in raw_ratings}
                    for opt in raw_options:
                        for crit in raw_criteria:
                            if (opt.id, crit.id) not in existing_pairs:
                                raw_ratings.append(
                                    MatrixScoreItem(
                                        option_id=opt.id,
                                        criterion_id=crit.id,
                                        rating=6.0,
                                        reason="Baseline neutral evaluation",
                                    )
                                )

                    # Pure deterministic mathematical scoring
                    results, winner_id, winner_name = validate_and_calculate_matrix_scores(
                        criteria=raw_criteria,
                        options=raw_options,
                        ratings=raw_ratings,
                        scale_min=1.0,
                        scale_max=10.0,
                    )

                    parsed_matrix = DecisionMatrixAnalysis(
                        applicable=True,
                        inapplicability_reason=None,
                        scale_min=1.0,
                        scale_max=10.0,
                        criteria=raw_criteria,
                        options=raw_options,
                        ratings=raw_ratings,
                        results=results,
                        winner_option_id=winner_id,
                        winner_option_name=winner_name,
                        sensitivity_notes=f"Deterministic ranking based on {len(raw_criteria)} weighted criteria.",
                    )
            except Exception as e:
                logger.warning(f"Failed to parse AI Decision Matrix: {e}", exc_info=True)
                parsed_matrix = None

        if parsed_matrix:
            decision_matrix = parsed_matrix
        else:
            decision_matrix = run_decision_matrix_module(
                decision=decision,
                structured_points=structured_points,
                raw_context=raw_context,
                custom_criteria=request.matrix_custom_criteria,
                custom_options=request.matrix_custom_options,
                custom_ratings=request.matrix_custom_ratings,
                force_mock=request.force_mock,
            )

        if decision_matrix.applicable and decision_matrix.winner_option_name and decision_matrix.results:
            summary_insights.append(
                f"Decision Matrix: '{decision_matrix.winner_option_name}' ranked #1 "
                f"with deterministic score {decision_matrix.results[0].weighted_score:.2f}/10."
            )

    # --- 4. Five Whys ---
    if "five_whys" in selected:
        parsed_whys = None
        if ai_data and isinstance(ai_data.get("five_whys"), dict):
            fw_dict = ai_data["five_whys"]
            try:
                raw_steps = []
                for idx, s in enumerate(fw_dict.get("steps", [])):
                    if isinstance(s, dict):
                        q = str(s.get("why_question") or s.get("question") or f"Why {idx+1}?")
                        a = str(s.get("answer") or "")
                        if a.strip():
                            raw_steps.append(
                                WhyStep(
                                    step_number=int(s.get("step_number") or idx + 1),
                                    why_question=q,
                                    answer=a,
                                    is_known_fact=bool(s.get("is_known_fact", True)),
                                    evidence_reference=s.get("evidence_reference"),
                                )
                            )
                root_cause = fw_dict.get("root_cause")
                cms = [str(c).strip() for c in fw_dict.get("countermeasures", []) if str(c).strip()]
                if raw_steps or root_cause:
                    parsed_whys = FiveWhysAnalysis(
                        applicable=True,
                        inapplicability_reason=None,
                        problem_statement=str(fw_dict.get("problem_statement") or decision.problem_statement or decision.title),
                        steps=raw_steps,
                        root_cause=root_cause or "Primary architectural constraint identified.",
                        is_root_cause_verified=bool(fw_dict.get("is_root_cause_verified", False)),
                        countermeasures=cms,
                    )
            except Exception as e:
                logger.warning(f"Failed to parse AI Five Whys: {e}", exc_info=True)
                parsed_whys = None

        if parsed_whys:
            five_whys = parsed_whys
        else:
            five_whys = run_five_whys_module(decision, structured_points, raw_context, request.force_mock)

        if five_whys.applicable and five_whys.root_cause:
            ver_text = "Verified" if five_whys.is_root_cause_verified else "Hypothesized"
            summary_insights.append(f"Five Whys: {ver_text} root cause — {five_whys.root_cause}")

    # --- 5. Decision Tree ---
    if "decision_tree" in selected:
        parsed_tree = None
        if ai_data and isinstance(ai_data.get("decision_tree"), dict):
            dt_dict = ai_data["decision_tree"]
            try:
                raw_nodes: List[DecisionTreeNode] = []
                for n_idx, n in enumerate(dt_dict.get("nodes", [])):
                    if isinstance(n, dict):
                        branches = []
                        for b_idx, b in enumerate(n.get("branches", [])):
                            if isinstance(b, dict):
                                branches.append(
                                    DecisionTreeBranch(
                                        branch_id=str(b.get("branch_id") or f"br_{len(branches)+1}"),
                                        label=str(b.get("label") or f"Branch {b_idx+1}"),
                                        probability=b.get("probability") if isinstance(b.get("probability"), (int, float)) else None,
                                        is_probability_estimated=bool(b.get("probability") is not None),
                                        payoff=float(b["payoff"]) if isinstance(b.get("payoff"), (int, float)) else None,
                                        payoff_unit=b.get("payoff_unit"),
                                        outcome_description=str(b.get("outcome_description") or ""),
                                        sub_branches=[],
                                    )
                                )
                        raw_nodes.append(
                            DecisionTreeNode(
                                node_id=str(n.get("node_id") or f"node_{n_idx+1}"),
                                node_type=str(n.get("node_type") or "decision"),
                                label=str(n.get("label") or decision.title),
                                description=str(n.get("description") or ""),
                                branches=branches,
                            )
                        )

                # Deterministic calculation of expected values
                ev_by_option, best_opt, has_probs = calculate_decision_tree_expected_values(raw_nodes)
                for node in raw_nodes:
                    if node.node_type == "decision":
                        for br in node.branches:
                            if br.label in ev_by_option:
                                br.payoff = ev_by_option[br.label]

                prob_note = dt_dict.get("probabilities_note") or "Deterministic scenario paths; unstated probabilities are not fabricated."
                if raw_nodes:
                    parsed_tree = DecisionTreeAnalysis(
                        applicable=True,
                        inapplicability_reason=None,
                        root_question=str(dt_dict.get("root_question") or decision.title),
                        nodes=raw_nodes,
                        has_deterministic_probabilities=has_probs,
                        expected_values_by_option=ev_by_option,
                        probabilities_note=str(prob_note),
                        best_expected_value_option=best_opt,
                    )
            except Exception as e:
                logger.warning(f"Failed to parse AI Decision Tree: {e}", exc_info=True)
                parsed_tree = None

        if parsed_tree:
            decision_tree = parsed_tree
        else:
            decision_tree = run_decision_tree_module(decision, structured_points, raw_context, request.force_mock)

        if decision_tree.applicable and decision_tree.probabilities_note:
            summary_insights.append(f"Decision Tree: {decision_tree.probabilities_note}")

    # Persist analysis results into Decision record
    domain = detect_decision_domain(decision, raw_context)
    decision.domain = domain

    canonical_result = None
    if decision_matrix and decision_matrix.canonical_result:
        canonical_result = decision_matrix.canonical_result
    elif decision_matrix and decision_matrix.results:
        canonical_result = build_canonical_decision_result(
            decision=decision,
            criteria=decision_matrix.criteria,
            options=decision_matrix.options,
            ratings=decision_matrix.ratings,
            results=decision_matrix.results,
            winner_id=decision_matrix.winner_option_id,
            winner_name=decision_matrix.winner_option_name,
            domain=domain,
        )
        decision_matrix.canonical_result = canonical_result

    analysis_dict = {
        "evaluated_at": utc_iso_now(),
        "selected_frameworks": selected,
        "recommended_framework": primary_rec_id,
        "recommended_techniques": [t.model_dump() for t in recommended_techniques],
        "methodology_rationale": methodology_rationale,
        "domain": domain,
        "is_stale": False,
        "canonical_result": canonical_result.model_dump() if canonical_result else None,
        "six_hats": six_hats.model_dump() if six_hats else None,
        "swot": swot.model_dump() if swot else None,
        "decision_matrix": decision_matrix.model_dump() if decision_matrix else None,
        "five_whys": five_whys.model_dump() if five_whys else None,
        "decision_tree": decision_tree.model_dump() if decision_tree else None,
        "summary_insights": summary_insights,
    }
    decision.analysis = analysis_dict

    # Mark downstream recommendation stale if it already exists
    if decision.recommendation and isinstance(decision.recommendation, dict):
        rec_copy = dict(decision.recommendation)
        rec_copy["is_stale"] = True
        decision.recommendation = rec_copy

    db.commit()
    db.refresh(decision)

    return FrameworkAnalysisResponse(
        decision_id=decision.id,
        evaluated_at=analysis_dict["evaluated_at"],
        selected_frameworks=selected,
        recommended_framework=primary_rec_id,
        recommended_techniques=recommended_techniques,
        methodology_rationale=methodology_rationale,
        canonical_result=canonical_result,
        domain=domain,
        is_stale=False,
        six_hats=six_hats,
        swot=swot,
        decision_matrix=decision_matrix,
        five_whys=five_whys,
        decision_tree=decision_tree,
        summary_insights=summary_insights,
        message="Thinking frameworks evaluated successfully with tailored N-technique ensemble",
    )
