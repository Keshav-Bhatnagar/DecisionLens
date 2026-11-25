"""
Regression Test Suite for Real-World Critical Edge Cases:
1. Cloud infrastructure decision created inside a PERSONAL folder (domain precedence & isolation)
2. Three explicit alternatives preserved including on-premises status quo (never truncated to pair)
3. Non-travel decision classified as PERSONAL (zero travel jargon in roadmap/shield, owner strictly 'You')
4. Criterion-specific evidence-backed fallback scoring (independent scoring across criteria)
5. Unresolved research preventing READY status (unresolved_research treated as open uncertainty)
6. Conditional synthesis preserving evaluating/conditional state (never auto-marked 'decided')
"""

import re
from datetime import datetime, timezone
import pytest
from sqlalchemy.orm import Session

from app.models import Decision, Folder, User, DecisionOutcome
from app.schemas import (
    DecisionDomain,
    DecisionLifecycleStatus,
    MatrixCriterion,
    MatrixOption,
    MatrixResultOption,
)
from app.services.framework_engine import (
    detect_decision_domain,
    build_domain_grounded_criteria,
    create_stable_matrix_options,
    build_grounded_ratings,
    build_canonical_decision_result,
    detect_candidate_options,
)
from app.services.recommendation import (
    run_decision_synthesis,
    generate_mock_synthesis,
    _detect_critical_unknowns,
)
from app.services.report_generator import (
    generate_decision_markdown_report,
    generate_decision_latex_report,
    generate_decision_json_report,
)


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def test_user(registered_user: dict) -> User:
    return registered_user["user"]


@pytest.fixture
def test_folder(test_user: User, db_session: Session) -> Folder:
    folder = Folder(
        name="Strategic Architecture Workspace",
        owner_id=test_user.id,
        domain="AUTO",
    )
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)
    return folder


# ============================================================================
# Scenario 1: Cloud Infrastructure Decision Inside a PERSONAL Folder
# ============================================================================

def test_cloud_decision_inside_personal_folder_precedence_and_isolation(
    test_user: User, test_folder: Folder, db_session: Session
):
    """
    Edge Case: User creates a production cloud migration decision inside a folder
    whose domain is set to PERSONAL.
    Invariant:
    - If decision domain is AUTO, detector classifies the decision as SOFTWARE based on title/problem.
    - Explicit decision domain (SOFTWARE) takes precedence over folder domain (PERSONAL).
    - Downstream criteria, roadmap, and blunder shield receive SOFTWARE, not PERSONAL.
    """
    # Force folder to PERSONAL
    test_folder.domain = DecisionDomain.PERSONAL.value
    db_session.commit()

    # 1. AUTO decision domain must classify as SOFTWARE, not inherit PERSONAL
    auto_decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Should we migrate production infrastructure to AWS?",
        problem_statement="Evaluate cloud migration vs retaining on-premises datacenter hardware.",
        domain="AUTO",
    )
    db_session.add(auto_decision)
    db_session.commit()
    db_session.refresh(auto_decision)

    detected_dom = detect_decision_domain(auto_decision)
    assert detected_dom == DecisionDomain.SOFTWARE.value
    assert auto_decision.domain_source == "ai_detected"
    assert auto_decision.domain_confidence >= 0.50

    # 2. Downstream criteria must be software architecture criteria
    criteria = build_domain_grounded_criteria(detected_dom)
    criterion_ids = [c.id for c in criteria]
    assert "crit_sw_scale" in criterion_ids or "crit_sw_cost" in criterion_ids
    assert "crit_pers_emo" not in criterion_ids
    assert "crit_pers_time" not in criterion_ids

    # 3. Explicit decision domain takes precedence even if folder is PERSONAL
    explicit_decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Core Kubernetes Ingress Architecture",
        domain=DecisionDomain.SOFTWARE.value,
        domain_source="manual",
    )
    db_session.add(explicit_decision)
    db_session.commit()
    db_session.refresh(explicit_decision)

    explicit_dom = detect_decision_domain(explicit_decision)
    assert explicit_dom == DecisionDomain.SOFTWARE.value
    assert explicit_decision.domain_source == "manual"


# ============================================================================
# Scenario 2: Three Alternatives Preserved Including Status Quo
# ============================================================================

def test_three_alternatives_preserved_including_onprem_status_quo():
    """
    Edge Case: Decision context describes three distinct options:
    1. Public Cloud Deployment (AWS / GCP)
    2. Hybrid On-Premises Setup
    3. Continue / Upgrade Existing On-Premises Infrastructure (Status Quo)
    Invariant:
    - Option extractor preserves all 3 options.
    - It does NOT truncate or replace with a generic 2-option pair.
    """
    context = (
        "We are evaluating three architectural paths for production infrastructure:\n"
        "1. Public Cloud Deployment (AWS / GCP)\n"
        "2. Hybrid On-Premises Setup\n"
        "3. Continue / Upgrade Existing On-Premises Infrastructure (Status Quo)\n"
        "Current datacenter utilization is 85%."
    )

    raw_options = detect_candidate_options(
        context_text=context,
        structured_points={},
        problem_statement="Should we migrate production infrastructure to the cloud?",
        decision_gaps=None,
    )
    options = create_stable_matrix_options(raw_options)

    assert len(options) >= 3, f"Expected at least 3 options, got {len(options)}: {[o.name for o in options]}"
    opt_names = [o.name.lower() for o in options]

    has_cloud = any("cloud" in name or "aws" in name for name in opt_names)
    has_hybrid = any("hybrid" in name for name in opt_names)
    has_status_quo = any("on-prem" in name or "existing" in name or "datacenter" in name or "upgrade" in name for name in opt_names)

    assert has_cloud, "Public Cloud Deployment alternative was missing"
    assert has_hybrid, "Hybrid On-Premises Setup alternative was missing"
    assert has_status_quo, "Status Quo / Continue Existing On-Premises alternative was missing"


# ============================================================================
# Scenario 3: Non-Travel Decision Classified as PERSONAL
# ============================================================================

def test_non_travel_personal_decision_roadmap_and_shield_isolation(
    test_user: User, test_folder: Folder, db_session: Session
):
    """
    Edge Case: A decision classified as PERSONAL that has nothing to do with travel
    (e.g., Pet Adoption: Dog vs Cat).
    Invariant:
    - Zero travel terminology in execution roadmap (no hotels, flights, itineraries, packing checklists).
    - Zero travel terminology in blunder shield.
    - All task owners in the roadmap are strictly 'You'.
    """
    pet_decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Adopt a Family Pet: Golden Retriever vs British Shorthair Cat",
        problem_statement="Should we adopt a dog or cat given our work schedule and home environment?",
        domain=DecisionDomain.PERSONAL.value,
        points={
            "facts": [
                "Apartment allows pets up to 25kg.",
                "Work schedule allows 2 daily outdoor walks.",
            ],
            "unknowns": [
                "Local veterinary emergency clinic availability.",
            ],
        },
        analysis={
            "canonical_result": {
                "decision_id": 901,
                "winner_option_id": "OPT_001",
                "winner_option_name": "Adopt a Golden Retriever Dog",
                "winner_score": 8.6,
                "winner_rank": 1,
                "results": [
                    {"option_name": "Adopt a Golden Retriever Dog", "option_id": "OPT_001", "weighted_score": 8.6, "normalized_score": 86.0, "rank": 1},
                    {"option_name": "Adopt a British Shorthair Cat", "option_id": "OPT_002", "weighted_score": 7.4, "normalized_score": 74.0, "rank": 2},
                ],
            }
        },
    )
    db_session.add(pet_decision)
    db_session.commit()
    db_session.refresh(pet_decision)

    synthesis = generate_mock_synthesis(pet_decision)
    assert synthesis.domain == "PERSONAL"

    # 1. Verify Roadmap has ZERO travel jargon
    all_roadmap_text = " ".join(
        f"{t.title} {t.description}" for p in synthesis.roadmap.phases for t in p.tasks
    ).lower()

    banned_travel_words = [
        "hotel", "flight", "itinerary", "transit reservation", "booking cancellation",
        "resort", "packing checklist", "post-trip", "travel insurance", "manali", "sightseeing"
    ]
    for word in banned_travel_words:
        assert not re.search(r"\b" + re.escape(word) + r"\b", all_roadmap_text), (
            f"Found travel contaminant '{word}' in non-travel personal roadmap!"
        )

    # 2. Verify task owner is strictly 'You'
    for p in synthesis.roadmap.phases:
        for t in p.tasks:
            assert t.owner_role == "You", f"Expected task owner 'You', got '{t.owner_role}'"

    # 3. Verify Blunder Shield does not reference travel
    if synthesis.blunder_shield:
        shield_txt = f"{synthesis.blunder_shield.prevented_fatal_trap} {synthesis.blunder_shield.risk_reduction_rationale}".lower()
        for word in ["hotel", "flight", "booking cancellation", "travel insurance"]:
            assert word not in shield_txt, f"Found travel jargon '{word}' in personal blunder shield"


# ============================================================================
# Scenario 4: Criterion-Specific Evidence-Backed Fallback Scoring
# ============================================================================

def test_criterion_specific_independent_fallback_scoring():
    """
    Edge Case: Fallback rating engine must evaluate criteria independently.
    Invariant:
    - Ratings across Security, Cost, Scalability, and Reliability are not identical synthetic copies.
    - Real evidence citations (supporting_finding_ids, supporting_gap_ids, supporting_evidence_ids) are populated.
    - Verified evidence elevates status to 'justified'.
    """
    criteria = build_domain_grounded_criteria(DecisionDomain.SOFTWARE.value)
    options = create_stable_matrix_options([
        "Public Cloud Deployment",
        "Hybrid Setup",
        "Retain On-Premises Hardware",
    ])

    structured_points = {
        "facts": [
            "Current datacenter hardware requires ₹40 Lakh refresh next quarter.",
            "Public Cloud provides ISO 27001 and SOC2 Type II compliance.",
        ],
        "pros": [
            "Public Cloud auto-scales compute during peak traffic spikes.",
        ],
        "cons": [
            "Public Cloud network egress costs can be unpredictable.",
        ],
    }

    decision_gaps = {
        "gaps": [
            {
                "id": "gap_egress_cap",
                "question": "What is the annual egress bandwidth budget cap?",
                "status": "answered",
                "resolved_answer": "Annual egress budget is capped at ₹15 Lakh with SLA approved.",
                "affected_options": ["Public Cloud Deployment"],
            }
        ]
    }

    research_data = {
        "research": [
            {
                "gap_id": "gap_egress_cap",
                "claims": [
                    {
                        "id": "claim_sla_benchmark",
                        "claim_text": "Public cloud multi-region SLA guarantees 99.999% uptime with sub-30ms latency.",
                        "source_title": "Official Cloud SLA Documentation",
                        "reliability_label": "primary_source",
                    }
                ],
            }
        ]
    }

    ratings = build_grounded_ratings(
        options=options,
        criteria=criteria,
        structured_points=structured_points,
        decision_gaps=decision_gaps,
        domain=DecisionDomain.SOFTWARE.value,
        research_data=research_data,
    )

    cloud_ratings = {r.criterion_id: r for r in ratings if r.option_id == "OPT_001"}
    scale_rating = cloud_ratings["crit_sw_scale"]
    cost_rating = cloud_ratings["crit_sw_cost"]
    arch_rating = cloud_ratings["crit_sw_arch"]

    # Ratings must be scored independently, not identical copies
    assert scale_rating.rating != cost_rating.rating or scale_rating.reason != cost_rating.reason
    assert arch_rating.rating != cost_rating.rating

    # Provenance must cite real gap and research IDs
    assert "gap_egress_cap" in cost_rating.supporting_gap_ids or "gap_egress_cap" in scale_rating.supporting_gap_ids
    assert "claim_sla_benchmark" in scale_rating.supporting_evidence_ids or "claim_sla_benchmark" in cost_rating.supporting_evidence_ids
    assert scale_rating.status == "justified" or cost_rating.status == "justified"
    assert scale_rating.rating >= 8.0


# ============================================================================
# Scenario 5: Unresolved Research Preventing READY Status
# ============================================================================

def test_unresolved_research_prevents_ready_status(
    test_user: User, test_folder: Folder
):
    """
    Edge Case: Web research failed or was unresolved (status='unresolved_research').
    Invariant:
    - _detect_critical_unknowns detects this gap.
    - build_canonical_decision_result treats the gap as an unresolved critical unknown.
    - Resulting canonical status is strictly 'CONDITIONAL', never 'READY'.
    """
    gaps = {
        "gaps": [
            {
                "id": "gap_cloud_compliance",
                "question": "Has the financial sector RBI compliance certification been completed?",
                "importance": "critical",
                "status": "unresolved_research",  # Failed research attempt
                "affected_options": ["Public Cloud Deployment"],
            }
        ]
    }

    # 1. Critical unknowns detector must detect unresolved research
    critical_unknowns = _detect_critical_unknowns(gaps=gaps, points={})
    assert len(critical_unknowns) >= 1
    assert any("RBI compliance" in u for u in critical_unknowns)

    # 2. Canonical result must be CONDITIONAL
    mock_decision = Decision(
        id=777,
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="FinTech Cloud Architecture",
        gaps=gaps,
        points={},
    )
    criteria = [MatrixCriterion(id="crit_sec", name="Security & Compliance", weight=100.0)]
    options = [
        MatrixOption(id="OPT_001", name="Public Cloud"),
        MatrixOption(id="OPT_002", name="Private Datacenter"),
    ]
    results = [
        MatrixResultOption(option_id="OPT_001", option_name="Public Cloud", weighted_score=8.5, normalized_score=85.0, rank=1),
        MatrixResultOption(option_id="OPT_002", option_name="Private Datacenter", weighted_score=6.5, normalized_score=65.0, rank=2),
    ]

    canonical = build_canonical_decision_result(
        decision=mock_decision,
        criteria=criteria,
        options=options,
        ratings=[],
        results=results,
        winner_id="OPT_001",
        winner_name="Public Cloud",
        domain=DecisionDomain.SOFTWARE.value,
    )

    assert canonical.decision_status == "CONDITIONAL"
    assert "gap_cloud_compliance" in canonical.unresolved_critical_gap_ids
    assert len(canonical.critical_conditions) >= 1


# ============================================================================
# Scenario 6: Conditional Synthesis Preserving Non-Decided State
# ============================================================================

def test_conditional_synthesis_preserves_conditional_lifecycle_state(
    test_user: User, test_folder: Folder, db_session: Session
):
    """
    Edge Case: Synthesis engine produces a conditional recommendation.
    Invariant:
    - Synthesis output decision_status == 'CONDITIONAL'.
    - In database, decision.status is saved as 'conditional', NEVER 'decided'.
    - Markdown report displays 'Status: CONDITIONAL (Awaiting Validation)'.
    - LaTeX report displays ADR status 'PROVISIONAL (Awaiting Validation Clearance)'.
    """
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Enterprise Data Warehouse Migration",
        problem_statement="Should we migrate Snowflake data to BigQuery?",
        domain=DecisionDomain.SOFTWARE.value,
        status=DecisionLifecycleStatus.EVALUATING.value,
        points={
            "facts": ["Current annual Snowflake spend is ₹60 Lakh."],
            "unknowns": ["Data transfer egress cost over DirectConnect is unvetted."],
        },
        gaps={
            "gaps": [
                {
                    "id": "gap_egress_rate",
                    "question": "What is the committed DirectConnect egress transfer pricing tier?",
                    "importance": "critical",
                    "status": "pending",
                }
            ]
        },
        analysis={
            "decision_matrix": {
                "results": [
                    {"option_name": "Google BigQuery", "option_id": "OPT_001", "weighted_score": 8.7, "rank": 1},
                    {"option_name": "Retain Snowflake", "option_id": "OPT_002", "weighted_score": 6.8, "rank": 2},
                ]
            }
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    synthesis = run_decision_synthesis(decision, db_session, force_mock=True)

    # 1. Synthesis output must be CONDITIONAL
    assert synthesis.decision_status == "CONDITIONAL"
    assert synthesis.synthesis_type == "conditional_next_step"

    # 2. Database record must be 'conditional', NEVER 'decided'
    db_session.refresh(decision)
    assert decision.status == DecisionLifecycleStatus.CONDITIONAL.value
    assert decision.status != "decided"

    # 3. Markdown report must reflect CONDITIONAL status
    md_report = generate_decision_markdown_report(decision)
    assert "**Status:** CONDITIONAL (Awaiting Validation)" in md_report
    assert "PROVISIONAL (Awaiting Validation Clearance)" in md_report

    # 4. LaTeX report must reflect PROVISIONAL ADR governance status
    latex_report = generate_decision_latex_report(decision)
    assert "CONDITIONAL (Awaiting Validation)" in latex_report
    assert "PROVISIONAL (Awaiting Validation Clearance)" in latex_report
