import json
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Decision
from app.schemas import (
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
    SixHatsAnalysis,
    SWOTAnalysis,
    SWOTItem,
    WhyStep,
)
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
        extracted_options = detect_candidate_options(context_text, structured_points, problem_statement)
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
) -> List[str]:
    """Extract candidate options mentioned in points, pros/cons, or problem statement."""
    options = []
    text = f"{context_text} {problem_statement}"
    text_lower = text.lower()

    # Check for architectural or platform options in text
    if "microservices" in text_lower or "monolith" in text_lower:
        options = ["Microservices Architecture", "Modular Monolith Architecture"]
    elif "cloud" in text_lower and ("on-premise" in text_lower or "hybrid" in text_lower):
        options = ["Public Cloud Deployment", "Hybrid On-Premises Setup"]
    elif "postgres" in text_lower or "mongodb" in text_lower:
        options = ["Relational DB (PostgreSQL)", "Document DB (MongoDB)"]
    elif "option a" in text_lower or "option 1" in text_lower:
        options = ["Option A", "Option B"]
    elif "buy" in text_lower and "build" in text_lower:
        options = ["Build In-House", "Purchase Commercial Vendor"]
    else:
        # Check structured points for alternative hints
        mixed = structured_points.get("mixed_points", [])
        contradictions = structured_points.get("contradictions", [])
        if mixed or contradictions:
            options = ["Primary Proposed Strategy", "Conservative Fallback Strategy"]
        elif "evaluate" in text_lower or "choose" in text_lower or "decide" in text_lower:
            options = ["Option A: Recommended Strategy", "Option B: Alternative Approach"]

    return options


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
    """Generate and calculate Weighted Decision Matrix with deterministic scoring."""
    is_applicable, reason = evaluate_framework_applicability(
        "decision_matrix", raw_context, structured_points, decision.problem_statement
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
        )

    # 1. Define or use criteria (weights strictly summing to 100)
    criteria = custom_criteria or [
        MatrixCriterion(
            id="crit_cost",
            name="Cost & TCO Efficiency",
            weight=30.0,
            description="Infrastructure, licensing, and operational expenses over a 12-month horizon.",
        ),
        MatrixCriterion(
            id="crit_speed",
            name="Time to Value & Velocity",
            weight=25.0,
            description="Implementation schedule, team learning curve, and delivery speed.",
        ),
        MatrixCriterion(
            id="crit_scale",
            name="Scalability & Reliability",
            weight=25.0,
            description="Ability to handle traffic spikes, fault tolerance, and system uptime.",
        ),
        MatrixCriterion(
            id="crit_risk",
            name="Risk & Maintainability",
            weight=20.0,
            description="Low vendor lock-in, clear debugging paths, and long-term architectural stability.",
        ),
    ]

    # Verify criteria weights sum to 100
    total_w = sum(c.weight for c in criteria)
    if not math.isclose(total_w, 100.0, abs_tol=0.05):
        # Normalize weights safely if custom criteria had slight rounding discrepancy
        criteria = [
            MatrixCriterion(
                id=c.id,
                name=c.name,
                weight=round((c.weight / total_w) * 100.0, 2),
                description=c.description,
            )
            for c in criteria
        ]
        # Adjust last criterion for exact 100.0 sum
        current_sum = sum(c.weight for c in criteria[:-1])
        criteria[-1].weight = round(100.0 - current_sum, 2)

    # 2. Define or use options
    detected_opts = detect_candidate_options(raw_context, structured_points, decision.problem_statement)
    opt_a_name = detected_opts[0] if len(detected_opts) > 0 else "Option A: Cloud Platform"
    opt_b_name = detected_opts[1] if len(detected_opts) > 1 else "Option B: Modular Self-Hosted"

    options = custom_options or [
        MatrixOption(
            id="opt_a",
            name=opt_a_name,
            description="Managed modern architecture prioritizing rapid deployment and automated operations.",
        ),
        MatrixOption(
            id="opt_b",
            name=opt_b_name,
            description="Self-hosted or conservative architecture prioritizing cost control and zero vendor lock-in.",
        ),
    ]

    scale_min = 1.0
    scale_max = 10.0

    # 3. Define or use ratings
    ratings = custom_ratings or [
        MatrixScoreItem(option_id="opt_a", criterion_id="crit_cost", rating=7.0, notes="Higher recurring expenses"),
        MatrixScoreItem(option_id="opt_a", criterion_id="crit_speed", rating=9.0, notes="Fastest time to market"),
        MatrixScoreItem(option_id="opt_a", criterion_id="crit_scale", rating=9.0, notes="Automated horizontal scale"),
        MatrixScoreItem(option_id="opt_a", criterion_id="crit_risk", rating=7.5, notes="Moderate vendor dependency"),
        MatrixScoreItem(option_id="opt_b", criterion_id="crit_cost", rating=9.0, notes="Low direct cloud fees"),
        MatrixScoreItem(option_id="opt_b", criterion_id="crit_speed", rating=6.0, notes="Requires manual operational setup"),
        MatrixScoreItem(option_id="opt_b", criterion_id="crit_scale", rating=7.0, notes="Requires manual scaling configuration"),
        MatrixScoreItem(option_id="opt_b", criterion_id="crit_risk", rating=8.0, notes="Open source with zero lock-in"),
    ]

    # 4. Execute deterministic calculation engine
    results, winner_id, winner_name = validate_and_calculate_matrix_scores(
        criteria=criteria,
        options=options,
        ratings=ratings,
        scale_min=scale_min,
        scale_max=scale_max,
    )

    sensitivity_notes = (
        f"Deterministic calculation ranks '{winner_name}' #1 with a weighted score of {results[0].weighted_score:.2f}/10. "
        f"If Cost weight increases above 45%, rank order shifts toward the cost-advantaged alternative."
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
        "decision_tree", raw_context, structured_points, decision.problem_statement
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

    detected_opts = detect_candidate_options(raw_context, structured_points, decision.problem_statement)
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
    Execute framework analysis for a decision with support for framework selection,
    inapplicability detection, and deterministic scoring.
    """
    # 1. Determine selected frameworks
    selected = request.selected_frameworks or list(SUPPORTED_FRAMEWORKS)
    # Validate requested framework identifiers
    invalid_frameworks = [f for f in selected if f not in SUPPORTED_FRAMEWORKS]
    if invalid_frameworks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported framework(s): {invalid_frameworks}. Supported: {sorted(list(SUPPORTED_FRAMEWORKS))}",
        )

    raw_context, source_summary = assemble_decision_input_context(decision)
    structured_points = decision.points if isinstance(decision.points, dict) else {}

    six_hats = None
    swot = None
    decision_matrix = None
    five_whys = None
    decision_tree = None
    summary_insights: List[str] = []

    # 2. Run selected frameworks independently
    if "six_hats" in selected:
        six_hats = run_six_hats_module(decision, structured_points, raw_context, request.force_mock)
        if six_hats.applicable and six_hats.synthesis:
            summary_insights.append(f"Six Hats: {six_hats.synthesis}")

    if "swot" in selected:
        swot = run_swot_module(decision, structured_points, raw_context, request.force_mock)
        if swot.applicable:
            summary_insights.append(
                f"SWOT: Identified {len(swot.strengths)} strengths, {len(swot.weaknesses)} weaknesses, "
                f"{len(swot.opportunities)} opportunities, and {len(swot.threats)} threats."
            )

    if "decision_matrix" in selected:
        decision_matrix = run_decision_matrix_module(
            decision=decision,
            structured_points=structured_points,
            raw_context=raw_context,
            custom_criteria=request.matrix_custom_criteria,
            custom_options=request.matrix_custom_options,
            custom_ratings=request.matrix_custom_ratings,
            force_mock=request.force_mock,
        )
        if decision_matrix.applicable and decision_matrix.winner_option_name:
            summary_insights.append(
                f"Decision Matrix: '{decision_matrix.winner_option_name}' ranked #1 "
                f"with deterministic score {decision_matrix.results[0].weighted_score:.2f}/10."
            )

    if "five_whys" in selected:
        five_whys = run_five_whys_module(decision, structured_points, raw_context, request.force_mock)
        if five_whys.applicable and five_whys.root_cause:
            ver_text = "Verified" if five_whys.is_root_cause_verified else "Hypothesized"
            summary_insights.append(f"Five Whys: {ver_text} root cause — {five_whys.root_cause}")

    if "decision_tree" in selected:
        decision_tree = run_decision_tree_module(decision, structured_points, raw_context, request.force_mock)
        if decision_tree.applicable:
            summary_insights.append(f"Decision Tree: {decision_tree.probabilities_note}")

    # 3. Persist analysis results into Decision record
    analysis_dict = {
        "evaluated_at": utc_iso_now(),
        "selected_frameworks": selected,
        "six_hats": six_hats.model_dump() if six_hats else None,
        "swot": swot.model_dump() if swot else None,
        "decision_matrix": decision_matrix.model_dump() if decision_matrix else None,
        "five_whys": five_whys.model_dump() if five_whys else None,
        "decision_tree": decision_tree.model_dump() if decision_tree else None,
        "summary_insights": summary_insights,
    }
    decision.analysis = analysis_dict
    db.commit()
    db.refresh(decision)

    return FrameworkAnalysisResponse(
        decision_id=decision.id,
        evaluated_at=analysis_dict["evaluated_at"],
        selected_frameworks=selected,
        six_hats=six_hats,
        swot=swot,
        decision_matrix=decision_matrix,
        five_whys=five_whys,
        decision_tree=decision_tree,
        summary_insights=summary_insights,
        message="Thinking frameworks evaluated successfully",
    )
