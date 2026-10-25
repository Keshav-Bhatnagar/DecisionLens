"""
Reasoning Integrity & Traceability Regression Test Suite.
Tests the full DecisionLens pipeline:
STRUCTURING -> GAPS -> RESEARCH -> FRAMEWORKS -> SYNTHESIS -> ROADMAP

Ensures:
1. Winner preservation: Synthesis must never override the canonical framework winner.
2. Winner update after evidence: When evidence shifts the winner, synthesis reflects the new winner.
3. No domain contamination: Real estate decisions never contain software engineering roadmap concepts.
4. Option provenance: Derived/hybrid options track origin, parent options, and derivation reason.
5. Score traceability: Every criterion rating contains provenance reasons and supporting IDs.
6. Categorical confidence: Uses HIGH/MEDIUM/LOW and READY/CONDITIONAL states rather than fabricated numbers.
7. Stale state invalidation: Upstream edits invalidate downstream framework and recommendation states.
8. Unsupported claim prevention: Recommendations are strictly grounded in canonical data.
9. Gap dependency: Gap resolution updates affected options and downstream conditions.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Decision, Folder, User
from app.schemas import (
    CanonicalDecisionResult,
    DecisionDomain,
    MatrixCriterion,
    MatrixOption,
    MatrixScoreItem,
)
from app.services.framework_engine import (
    build_canonical_decision_result,
    build_domain_grounded_criteria,
    create_stable_matrix_options,
    detect_decision_domain,
    run_framework_analysis,
    validate_and_calculate_matrix_scores,
)
from app.services.recommendation import run_decision_synthesis


@pytest.fixture
def auth_headers(registered_user):
    return {"Authorization": f"Bearer {registered_user['token']}"}


@pytest.fixture
def test_folder(client: TestClient, auth_headers: dict, db_session: Session) -> Folder:
    folder_res = client.post(
        "/api/folders",
        json={"name": "Real Estate Workspace", "description": "Land decisions"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]
    return db_session.query(Folder).filter(Folder.id == fid).first()


def test_1_winner_preservation(client: TestClient, auth_headers: dict, registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 1 — Winner Preservation
    Framework winner = Joint Venture Land Bank Hybrid (8.40) over
    Structured Buyout (8.35) and Direct Outright Purchase (6.70).
    Synthesis MUST recommend Joint Venture Land Bank Hybrid.
    """
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="50-Acre Land Acquisition for Logistics Park",
        problem_statement="Evaluate ₹50 Crore real estate transaction between outright purchase, structured buyout, and JV hybrid.",
        domain="REAL_ESTATE",
        points={
            "facts": [
                "Total land parcel is 50 contiguous acres.",
                "Acquisition capital requirement is ₹50 Crore.",
                "Target exit is long-term logistics warehouse park.",
            ],
            "unknowns": ["Pending title verification on 5 acres.", "Feeder road access permission."],
        },
        points_reviewed=True,
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # Criteria strictly summing to 100
    criteria = [
        MatrixCriterion(id="crit_title", name="Title & Encumbrance Risk", weight=30.0, description="Clear legal title"),
        MatrixCriterion(id="crit_capital", name="Capital Outlay & Financing", weight=25.0, description="Cash commitment"),
        MatrixCriterion(id="crit_roi", name="Appreciation & ROI", weight=25.0, description="Development upside"),
        MatrixCriterion(id="crit_partner", name="Execution & Partner Alignment", weight=20.0, description="Partner reliability"),
    ]

    options = [
        MatrixOption(id="OPT_001", name="Direct Outright Purchase", description="Full upfront purchase", origin="primary"),
        MatrixOption(id="OPT_002", name="Structured Buyout", description="Phased installment buyout", origin="primary"),
        MatrixOption(
            id="OPT_003",
            name="Joint Venture Land Bank Hybrid",
            description="Hybrid land bank and joint development",
            origin="derived",
            derived_from=["OPT_001", "OPT_002"],
            derivation_reason="Combines land banking upside with phased JV risk sharing.",
        ),
    ]

    # Exactly reproducing the tested real-estate scores:
    # Direct Outright Purchase = 6.70
    # Structured Buyout = 8.35
    # Joint Venture Land Bank Hybrid = 8.40 (Canonical Winner)
    ratings = [
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_title", rating=6.0, reason="High outright legal risk"),
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_capital", rating=6.0, reason="High upfront ₹50 Cr capital lock-in"),
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_roi", rating=8.0, reason="100% equity upside capture"),
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_partner", rating=7.0, reason="No partner friction"),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_title", rating=8.5, reason="Phased title verification"),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_capital", rating=8.4, reason="Tranche-based payment schedule"),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_roi", rating=8.2, reason="Preserves land value"),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_partner", rating=8.25, reason="Structured seller terms"),
        MatrixScoreItem(option_id="OPT_003", criterion_id="crit_title", rating=8.5, reason="Shared due diligence covenants"),
        MatrixScoreItem(option_id="OPT_003", criterion_id="crit_capital", rating=8.5, reason="Minimal upfront capital outlay"),
        MatrixScoreItem(option_id="OPT_003", criterion_id="crit_roi", rating=8.5, reason="High development participation upside"),
        MatrixScoreItem(option_id="OPT_003", criterion_id="crit_partner", rating=8.0, reason="Balanced joint development agreement"),
    ]

    results, winner_id, winner_name = validate_and_calculate_matrix_scores(criteria, options, ratings)
    assert winner_id == "OPT_003"
    assert winner_name == "Joint Venture Land Bank Hybrid"
    assert results[0].option_id == "OPT_003"
    assert results[0].weighted_score == 8.40
    assert results[1].option_id == "OPT_002"
    assert results[1].weighted_score == 8.35
    assert results[2].option_id == "OPT_001"
    assert results[2].weighted_score == 6.70

    # Build canonical decision result
    canonical = build_canonical_decision_result(
        decision=decision,
        criteria=criteria,
        options=options,
        ratings=ratings,
        results=results,
        winner_id=winner_id,
        winner_name=winner_name,
        domain="REAL_ESTATE",
    )

    decision.analysis = {
        "domain": "REAL_ESTATE",
        "canonical_result": canonical.model_dump(),
        "decision_matrix": {
            "results": [r.model_dump() for r in results],
            "winner_option_id": winner_id,
            "winner_option_name": winner_name,
            "options": [o.model_dump() for o in options],
            "criteria": [c.model_dump() for c in criteria],
            "ratings": [r.model_dump() for r in ratings],
        },
    }
    db_session.commit()

    # Execute synthesis
    synthesis = run_decision_synthesis(decision, db_session, force_mock=True)

    # Synthesis MUST recommend the canonical winner, NOT Direct Outright Purchase!
    assert "Joint Venture Land Bank Hybrid" in synthesis.headline
    assert "Joint Venture Land Bank Hybrid" in synthesis.recommendation_text
    assert "Direct Outright Purchase" not in synthesis.headline

    # Verify alternatives ranking: winner is recommended, others are explicitly not recommended
    winner_alt = next(a for a in synthesis.alternatives_considered if a.name == "Joint Venture Land Bank Hybrid")
    assert winner_alt.is_recommended is True
    assert winner_alt.why_not_recommended is None

    outright_alt = next(a for a in synthesis.alternatives_considered if a.name == "Direct Outright Purchase")
    assert outright_alt.is_recommended is False
    assert "lower deterministic score" in outright_alt.why_not_recommended or "Rank #3" in outright_alt.why_not_recommended


def test_2_winner_changes_after_evidence(client: TestClient, auth_headers: dict, registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 2 — Winner Changes After Evidence
    Initial winner = Option A.
    Evidence resolves a gap and recalculation makes Option B the winner.
    Synthesis must immediately recommend Option B.
    """
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="Commercial Facility Acquisition",
        domain="REAL_ESTATE",
        points={"facts": ["Initial inspection completed."]},
        points_reviewed=True,
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    criteria = [
        MatrixCriterion(id="crit_1", name="Financial Risk", weight=50.0),
        MatrixCriterion(id="crit_2", name="Location Quality", weight=50.0),
    ]
    options = [
        MatrixOption(id="OPT_001", name="Site Alpha (Downtown)", origin="primary"),
        MatrixOption(id="OPT_002", name="Site Beta (Suburban)", origin="primary"),
    ]

    # Round 1: Site Alpha wins
    ratings_r1 = [
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_1", rating=8.0),
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_2", rating=8.0),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_1", rating=6.0),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_2", rating=6.0),
    ]
    res_1, w_id_1, w_name_1 = validate_and_calculate_matrix_scores(criteria, options, ratings_r1)
    assert w_name_1 == "Site Alpha (Downtown)"

    canonical_1 = build_canonical_decision_result(decision, criteria, options, ratings_r1, res_1, w_id_1, w_name_1, "REAL_ESTATE")
    decision.analysis = {"canonical_result": canonical_1.model_dump(), "domain": "REAL_ESTATE"}
    db_session.commit()

    synth_1 = run_decision_synthesis(decision, db_session, force_mock=True)
    assert "Site Alpha (Downtown)" in synth_1.headline

    # Round 2: Evidence reveals environmental contamination at Site Alpha and tax abatements at Site Beta
    ratings_r2 = [
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_1", rating=3.0, reason="Environmental contamination discovered"),
        MatrixScoreItem(option_id="OPT_001", criterion_id="crit_2", rating=8.0),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_1", rating=9.0, reason="Tax abatement package confirmed"),
        MatrixScoreItem(option_id="OPT_002", criterion_id="crit_2", rating=8.0),
    ]
    res_2, w_id_2, w_name_2 = validate_and_calculate_matrix_scores(criteria, options, ratings_r2)
    assert w_name_2 == "Site Beta (Suburban)"

    canonical_2 = build_canonical_decision_result(decision, criteria, options, ratings_r2, res_2, w_id_2, w_name_2, "REAL_ESTATE")
    decision.analysis = {"canonical_result": canonical_2.model_dump(), "domain": "REAL_ESTATE"}
    db_session.commit()

    synth_2 = run_decision_synthesis(decision, db_session, force_mock=True)
    assert "Site Beta (Suburban)" in synth_2.headline
    assert "Site Beta (Suburban)" in synth_2.recommendation_text


def test_3_no_domain_contamination(registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 3 — No Domain Contamination
    A REAL_ESTATE decision must NOT contain software roadmap concepts.
    Forbidden words: technical lead, proof-of-concept, spike, engineering integration,
    staging environment, pilot users, production migration, traffic migration, decommission legacy pathways.
    """
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="50-Acre Agricultural Land Parcel Conversion",
        domain="REAL_ESTATE",
        points={"facts": ["50 acres zoned for commercial development."]},
        points_reviewed=True,
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    from app.schemas import FrameworkAnalysisRequest
    req = FrameworkAnalysisRequest(selected_frameworks=["decision_matrix"], force_mock=True)
    resp = run_framework_analysis(decision, req, db_session)
    assert resp.domain == "REAL_ESTATE"

    synthesis = run_decision_synthesis(decision, db_session, force_mock=True)

    roadmap_text = ""
    for phase in synthesis.roadmap.phases:
        roadmap_text += f"{phase.title} {phase.description} "
        for task in phase.tasks:
            roadmap_text += f"{task.title} {task.description} {task.owner_role} {task.success_criteria} {task.reason} "
    roadmap_text_lower = roadmap_text.lower()

    software_terms = [
        "proof-of-concept", "poc spike", "technical lead", "engineering team",
        "staging environment", "pilot users", "production migration",
        "traffic migration", "decommission legacy pathways", "devops",
        "api contract", "codebase", "unit test", "load test"
    ]
    for term in software_terms:
        assert term not in roadmap_text_lower, f"Domain contamination: Found software term '{term}' in REAL_ESTATE roadmap!"

    re_terms = ["title", "encumbrance", "zoning", "valuation", "escrow", "deed", "registrar"]
    matched = [t for t in re_terms if t in roadmap_text_lower]
    assert len(matched) >= 3, f"Expected real estate terms in roadmap, matched: {matched}"


def test_4_option_provenance():
    """
    TEST 4 — Option Provenance
    Derived options must explicitly record origin='derived', derived_from, and derivation_reason.
    """
    raw_names = [
        "Direct Outright Purchase",
        "Structured Buyout",
        "Joint Venture Land Bank Hybrid",
    ]
    options = create_stable_matrix_options(raw_names)

    assert len(options) == 3
    assert options[0].id == "OPT_001"
    assert options[0].origin == "primary"
    assert options[0].derived_from is None

    assert options[1].id == "OPT_002"
    assert options[1].origin == "primary"

    assert options[2].id == "OPT_003"
    assert options[2].origin == "derived"
    assert options[2].derived_from == ["OPT_001", "OPT_002"]
    assert "Synthesized alternative" in options[2].derivation_reason or "hybrid" in options[2].derivation_reason.lower()


def test_5_score_traceability(registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 5 — Score Traceability
    Every criterion rating must have justified provenance reasons, supporting finding IDs, and gap IDs.
    """
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="Warehouse Logistics Land Hub",
        problem_statement="Choose between Direct Outright Purchase, Structured Buyout, and Joint Venture Land Bank Hybrid.",
        domain="REAL_ESTATE",
        points={"facts": ["Highway connectivity verified.", "Soil test passed."]},
        gaps={"gaps": [{"id": "gap_title_1", "question": "Clear title?", "affected_options": ["Direct Outright Purchase", "Structured Buyout"]}]},
        points_reviewed=True,
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    from app.services.framework_engine import run_decision_matrix_module
    matrix = run_decision_matrix_module(decision, decision.points, "Context")

    assert len(matrix.ratings) > 0
    for r in matrix.ratings:
        assert r.status in ("justified", "insufficient_evidence")
        assert r.reason is not None and len(r.reason.strip()) > 10
        assert isinstance(r.supporting_finding_ids, list)
        assert isinstance(r.supporting_evidence_ids, list)


def test_6_no_fabricated_confidence(registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 6 — No Fabricated Confidence Numbers
    Confidence must expose categorical level ('high', 'medium', 'low') and status ('READY', 'CONDITIONAL').
    """
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="Industrial Park Acquisition",
        domain="REAL_ESTATE",
        points={"facts": ["Verified site map."]},
        points_reviewed=True,
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    synthesis = run_decision_synthesis(decision, db_session, force_mock=True)
    conf = synthesis.confidence_assessment

    assert conf.level in ("high", "medium", "low")
    assert conf.status in ("READY", "CONDITIONAL", "NOT_READY")
    assert conf.rationale is not None


def test_7_stale_analysis_invalidation(client: TestClient, auth_headers: dict, registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 7 — Stale Analysis Invalidation
    Editing upstream findings or answering a gap must invalidate downstream framework and recommendation state.
    """
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="Expansion Facility Decision",
        domain="BUSINESS",
        points={"facts": ["Current lease expires in 6 months."]},
        points_reviewed=True,
        analysis={"is_stale": False, "selected_frameworks": ["decision_matrix"]},
        recommendation={"is_stale": False, "headline": "Initial Recommendation"},
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # 1. Update findings via PATCH
    patch_resp = client.patch(
        f"/api/decisions/{decision.id}/structuring",
        json={"facts": ["Updated lease expires in 12 months with renewal option."]},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200

    db_session.refresh(decision)
    assert decision.analysis.get("is_stale") is True
    assert decision.recommendation.get("is_stale") is True


def test_8_unsupported_claim_prevention(registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 8 — Unsupported Claim Prevention
    Synthesis must cite verified facts and framework metrics, not fabricated claims.
    """
    verified_fact = "Zoning permission granted for 40% ground coverage."
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="Zoning Compliance Review",
        domain="REAL_ESTATE",
        points={"facts": [verified_fact]},
        points_reviewed=True,
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    synthesis = run_decision_synthesis(decision, db_session, force_mock=True)

    evidence_claims = [e.claim for e in synthesis.supporting_evidence]
    assert any(verified_fact in c for c in evidence_claims)


def test_9_gap_dependency_propagation(client: TestClient, auth_headers: dict, registered_user: dict, test_folder: Folder, db_session: Session):
    """
    TEST 9 — Gap Dependency Propagation
    When a gap is answered or researched, downstream state is marked stale,
    and resolving critical gaps transitions the decision from CONDITIONAL to READY.
    """
    decision = Decision(
        owner_id=registered_user["user"].id,
        folder_id=test_folder.id,
        title="Highway Access Land Parcel",
        problem_statement="Choose between Direct Outright Purchase, Structured Buyout, and Joint Venture Land Bank Hybrid.",
        domain="REAL_ESTATE",
        points={"facts": ["10 acres adjacent to national highway."]},
        gaps={
            "gaps": [
                {
                    "id": "gap-access-1",
                    "question": "Is NHAI highway access cut approved?",
                    "reason": "Crucial road connectivity for heavy transport vehicles.",
                    "importance": "critical",
                    "status": "unanswered",
                    "affected_options": ["Direct Outright Purchase", "Structured Buyout"],
                }
            ]
        },
        points_reviewed=True,
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # Evaluate frameworks initially -> Unresolved critical gap makes it CONDITIONAL
    from app.schemas import FrameworkAnalysisRequest
    req = FrameworkAnalysisRequest(selected_frameworks=["decision_matrix"], force_mock=True)
    fw_resp = run_framework_analysis(decision, req, db_session)
    assert fw_resp.canonical_result.decision_status == "CONDITIONAL"

    synth_conditional = run_decision_synthesis(decision, db_session, force_mock=True)
    assert synth_conditional.synthesis_type == "conditional_next_step"
    assert synth_conditional.decision_status == "CONDITIONAL"

    # Now answer the gap via API
    ans_resp = client.post(
        f"/api/decisions/{decision.id}/gaps/gap-access-1/answer",
        json={"answer": "NHAI issued formal access permission notification on Oct 2026."},
        headers=auth_headers,
    )
    assert ans_resp.status_code == 200

    db_session.refresh(decision)
    # Downstream analysis is now marked stale!
    assert decision.analysis.get("is_stale") is True
    assert decision.recommendation.get("is_stale") is True

    # Re-evaluate framework analysis
    fw_resp_resolved = run_framework_analysis(decision, req, db_session)
    assert fw_resp_resolved.canonical_result.decision_status == "READY"
    assert fw_resp_resolved.is_stale is False

    # Re-synthesize
    synth_ready = run_decision_synthesis(decision, db_session, force_mock=True)
    assert synth_ready.synthesis_type == "recommendation"
    assert synth_ready.decision_status == "READY"
