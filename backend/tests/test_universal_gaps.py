from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app.models import Decision
from app.services.gaps import generate_universal_decision_gaps
from app.services.search import check_evidence_relevance, ResearchSourceItem


@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user."""
    email = "universal_gaps@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def folder_id(client: TestClient, auth_headers: dict):
    folder_res = client.post(
        "/api/folders",
        json={"name": "Universal Gaps Test Folder", "description": "Testing dynamic gap detection"},
        headers=auth_headers,
    )
    return folder_res.json()["id"]


def test_scenario_a_college_selection(client: TestClient, auth_headers: dict, folder_id: int):
    """Scenario A: Selection - 'Which college should I choose?'
    Verifies dynamic requirement discovery without hardcoded checklists (no SOC2, no hostel)."""
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "College Selection",
            "problem_statement": "Which college should I choose for my undergraduate studies?",
            "description": "I have multiple offers but haven't decided where to enroll.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(
        f"/api/decisions/{did}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    questions = [g["question"].lower() for g in data["gaps"]]
    titles = [g["title"].lower() for g in data["gaps"]]
    combined_text = " ".join(questions + titles)

    # Must NOT invent unrelated technical checklists
    assert "soc2" not in combined_text
    assert "spanner" not in combined_text
    assert "aurora" not in combined_text
    assert "battery" not in combined_text

    # Must identify education/selection requirements like program/field, budget, or criteria
    has_selection_dimension = any(
        kw in combined_text for kw in ["academic", "course", "program", "field", "budget", "cost", "career", "criteria", "location", "ranking"]
    )
    assert has_selection_dimension, f"Expected education selection dimensions, got: {combined_text}"

    # Verify provenance and explainability
    for g in data["gaps"]:
        assert g["materiality_reason"], "Every gap must include a materiality reason"
        assert g["gap_type"], "Every gap must include a gap_type"


def test_scenario_b_timing_product_launch(client: TestClient, auth_headers: dict, folder_id: int):
    """Scenario B: Timing - 'When should we launch our product?'
    Verifies timing and readiness reasoning without hardcoded domain lists."""
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Product Launch Timing",
            "problem_statement": "When should we launch our product?",
            "description": "The engineering team is finishing core features, but sales and marketing want to coordinate the release.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(
        f"/api/decisions/{did}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])

    # Timing and readiness dimensions should be present
    has_timing_dimension = any(
        kw in combined_text for kw in ["readiness", "launch", "deadline", "milestone", "dependency", "window", "date", "timing", "criteria"]
    )
    assert has_timing_dimension, f"Expected timing dimensions, got: {combined_text}"

    # Verify no hardware/laptop checklist items
    assert "battery" not in combined_text
    assert "gpu" not in combined_text


def test_scenario_c_strategy_competitive(client: TestClient, auth_headers: dict, folder_id: int):
    """Scenario C: Strategy - 'How can we outperform our competitors?'
    Verifies strategic analysis, dimensions tracking, and no option fabrication."""
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Competitive Strategy",
            "problem_statement": "How can we outperform our competitors?",
            "description": "We are facing rising competition in our SaaS space and need a defensible growth plan.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(
        f"/api/decisions/{did}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    # Since user stated no explicit options, affected_options should be empty (no fabrication)
    for g in data["gaps"]:
        assert len(g["affected_options"]) == 0, "Do NOT fabricate options when none were specified by user"
        assert len(g.get("affected_dimensions", [])) > 0, "Should populate affected_dimensions for strategy problems"

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])
    has_strategy_dimension = any(
        kw in combined_text for kw in ["differentiation", "competitor", "advantage", "positioning", "capability", "market", "segment", "strength"]
    )
    assert has_strategy_dimension, f"Expected strategy dimensions, got: {combined_text}"


def test_scenario_d_diagnosis_sales_drop(client: TestClient, auth_headers: dict, folder_id: int):
    """Scenario D: Diagnosis - 'Why are our sales so low?'
    Verifies diagnostic mode identifying evidence needed to distinguish causes without premature diagnosis."""
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Sales Performance Diagnosis",
            "problem_statement": "Why are our sales so low?",
            "description": "Sales have dropped over recent weeks. We are trying to understand the underlying drivers.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(
        f"/api/decisions/{did}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])

    # Diagnostic dimensions needed to isolate root cause
    has_diagnostic_dimension = any(
        kw in combined_text for kw in ["timeline", "funnel", "conversion", "traffic", "cohort", "onset", "lead", "retention", "drop", "segment"]
    )
    assert has_diagnostic_dimension, f"Expected diagnostic dimensions, got: {combined_text}"

    # Must NOT prematurely declare a cause like "your marketing is bad"
    for g in data["gaps"]:
        q = g["question"].lower()
        assert "your marketing is weak" not in q
        assert "your product is bad" not in q


def test_scenario_e_technical_selection_database(client: TestClient, auth_headers: dict, folder_id: int):
    """Scenario E: Technical selection - 'Which database architecture should we use?'
    Verifies option grounding and technical requirements analysis."""
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Database Architecture Selection",
            "problem_statement": "Which database architecture should we use: PostgreSQL or MongoDB?",
            "description": "We need to handle mixed transactional workloads and high read throughput.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(
        f"/api/decisions/{did}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    # Options were explicitly named: PostgreSQL and MongoDB
    for g in data["gaps"]:
        if g.get("affected_options"):
            for opt in g["affected_options"]:
                assert opt in ["PostgreSQL", "MongoDB"], f"Unexpected fabricated option: {opt}"


def test_zero_gaps_valid_when_fully_specified():
    """Scenario F: Zero Is Valid - When all decision requirements are established, zero gaps are generated."""
    fully_specified_points = {
        "facts": [
            "We have selected PostgreSQL and MongoDB as our final two candidates.",
            "Expected peak throughput is exactly 8,500 operations per second with a maximum latency target of 45ms.",
            "Total allocated annual infrastructure budget is capped at $45,000.",
            "Our internal engineering team has 6 years of deep operational experience managing PostgreSQL in production.",
            "Launch is scheduled for November 15th, and all dependencies are unblocked.",
            "Success criteria require multi-region read replicas with 99.99% availability SLA.",
        ],
        "assumptions": ["Traffic will scale linearly by 15% month over month."],
        "pros": ["PostgreSQL ACID guarantees match our financial ledger requirements."],
        "cons": ["MongoDB sharding requires additional cluster nodes."],
        "unknowns": [],
        "feelings": ["Team prefers relational data integrity."],
        "mixed_points": [],
        "contradictions": [],
    }

    dummy_dec = Decision(
        id=999,
        title="Database Architecture Selection",
        problem_statement="Choose between PostgreSQL and MongoDB for our analytics service.",
        description="All budget limits, throughput targets, SLA criteria, and team skills are strictly established.",
        points=fully_specified_points,
    )

    gaps = generate_universal_decision_gaps(decision=dummy_dec)

    # When all necessary criteria (budget, criteria, workload SLA, team experience) are covered and unknowns are empty,
    # the engine should report 0 gaps rather than inventing artificial ones.
    assert len(gaps) == 0, f"Expected 0 gaps for fully specified decision, but got {len(gaps)}"


def test_non_redundancy_safeguard():
    """Scenario G: Non-redundancy - Stated facts must not be re-requested."""
    points_with_known_budget = {
        "facts": [
            "The maximum acceptable annual budget ceiling is strictly $25,000 USD.",
            "Target launch date is set for Q3 2026.",
        ],
        "unknowns": [],
    }

    dummy_dec = Decision(
        id=998,
        title="College Selection",
        problem_statement="Which college should I choose for graduate school?",
        description="I have saved money and know my budget ceiling is $25,000.",
        points=points_with_known_budget,
    )

    gaps = generate_universal_decision_gaps(decision=dummy_dec)

    gap_questions = [g.question.lower() for g in gaps]
    gap_titles = [g.title.lower() for g in gaps]
    all_text = " ".join(gap_questions + gap_titles)

    # The engine must NOT ask for the budget limit again
    assert "budget ceiling" not in all_text
    assert "maximum acceptable annual budget" not in all_text


def test_research_relevance_verification():
    """Scenario H: Research results must be evaluated against the gap question.
    Irrelevant results must not mark the gap as resolved."""
    gap_question = "What is the peak write throughput and latency for distributed multi-region replication?"

    irrelevant_sources = [
        ResearchSourceItem(
            source_title="Ergonomic Office Chairs Review 2026",
            url="https://example.com/chairs",
            retrieval_timestamp=datetime.now(timezone.utc).isoformat(),
            relevant_claims=["The Herman Miller Aeron provides lumbar support and adjustable armrests."],
        ),
        ResearchSourceItem(
            source_title="Healthy Recipes for Quick Dinners",
            url="https://example.com/recipes",
            retrieval_timestamp=datetime.now(timezone.utc).isoformat(),
            relevant_claims=["Quick stir fry recipes using fresh vegetables and tofu ready in 15 minutes."],
        ),
    ]

    is_relevant, explanation = check_evidence_relevance(gap_question, irrelevant_sources)
    assert not is_relevant, "Irrelevant sources should fail relevance check"
    assert any(w in explanation.lower() for w in ["irrelevant", "not address", "did not mention", "unsupported"])

    relevant_sources = [
        ResearchSourceItem(
            source_title="Distributed Database Performance Benchmarks",
            url="https://example.com/db-benchmarks",
            retrieval_timestamp=datetime.now(timezone.utc).isoformat(),
            relevant_claims=["Under multi-region replication, peak write throughput reaches 12,000 ops/sec with 65ms p99 write latency."],
        )
    ]

    is_rel, _ = check_evidence_relevance(gap_question, relevant_sources)
    assert is_rel, "Directly matching technical performance benchmark should pass relevance check"

