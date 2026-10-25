from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app.models import Decision
from app.services.gaps import generate_universal_decision_gaps
from app.services.search import check_evidence_relevance, ResearchSourceItem


@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user."""
    email = "cross_domain_gaps@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def folder_id(client: TestClient, auth_headers: dict):
    folder_res = client.post(
        "/api/folders",
        json={"name": "Cross Domain Workspace", "description": "Testing domain-agnostic completeness"},
        headers=auth_headers,
    )
    return folder_res.json()["id"]


# ==============================================================================
# TEST 1 — Education: "I need to choose a college."
# ==============================================================================
def test_1_education_college_selection(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "College Selection",
            "problem_statement": "I need to choose a college.",
            "description": "I have multiple offers but haven't decided where to enroll.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])

    # No hardcoded irrelevant checklists
    assert "soc2" not in combined_text
    assert "spanner" not in combined_text
    assert "hostel" not in combined_text

    # Selection dimensions: evaluative criteria, budget/boundary, feasibility
    assert any(kw in combined_text for kw in ["criteria", "priority", "priorities", "budget", "cost", "boundary", "feasibility", "bandwidth"])
    for g in data["gaps"]:
        assert g["materiality_reason"], "Every gap must include a materiality reason"
        assert g["gap_type"], "Every gap must include a gap_type"


# ==============================================================================
# TEST 2 — Career: "I have two job offers and need to decide which one to accept."
# ==============================================================================
def test_2_career_job_offers(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Career Move: Offer Evaluation",
            "problem_statement": "I have two job offers and need to decide which one to accept.",
            "description": "Considering an offer from Acme Corp and another from Beta Labs.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])

    # Does NOT blindly copy database or hardware checklists
    assert "latency" not in combined_text
    assert "throughput" not in combined_text
    assert "battery" not in combined_text

    # Evaluative criteria, compensation boundary, long-term feasibility
    assert any(kw in combined_text for kw in ["criteria", "priority", "priorities", "budget", "cost", "investment", "feasibility"])


# ==============================================================================
# TEST 3 — Personal: "I am thinking about moving to another city."
# ==============================================================================
def test_3_personal_city_relocation(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "City Relocation",
            "problem_statement": "I am thinking about moving to another city.",
            "description": "Debating whether to relocate to Seattle or Austin.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])
    assert "soc2" not in combined_text
    assert "database" not in combined_text
    # Asks for evaluative lifestyle/career criteria, cost boundary, feasibility
    assert any(kw in combined_text for kw in ["criteria", "priority", "priorities", "budget", "cost", "feasibility"])


# ==============================================================================
# TEST 4 — Business Timing: "We need to decide when to launch our new product."
# ==============================================================================
def test_4_business_timing_launch(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Product Launch Timing",
            "problem_statement": "We need to decide when to launch our new product.",
            "description": "Core development is wrapping up. Sales and marketing want to align release dates.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])

    # Timing dimensions: readiness gates, milestone dependencies, external windows
    assert any(kw in combined_text for kw in ["readiness", "launch", "deadline", "milestone", "dependency", "window", "date", "timing"])


# ==============================================================================
# TEST 5 — Business Diagnosis: "Our sales are much lower than expected. We need to understand why."
# ==============================================================================
def test_5_business_diagnosis_sales_drop(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Sales Performance Diagnosis",
            "problem_statement": "Our sales are much lower than expected. We need to understand why.",
            "description": "Revenue dropped 25% over the past two quarters without obvious explanation.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])

    # Diagnostic dimensions needed to distinguish causes
    assert any(kw in combined_text for kw in ["timeline", "funnel", "conversion", "traffic", "cohort", "onset", "stage", "drop"])

    # Must NOT prematurely declare a cause
    for g in data["gaps"]:
        assert "your marketing is weak" not in g["question"].lower()
        assert "your product is bad" not in g["question"].lower()
        # Diagnostic problems have no fabricated options
        assert len(g["affected_options"]) == 0
        assert len(g.get("affected_dimensions", [])) > 0


# ==============================================================================
# TEST 6 — Strategy: "We need to figure out how to outperform our competitors."
# ==============================================================================
def test_6_strategy_outperform_competitors(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Competitive Strategy",
            "problem_statement": "We need to figure out how to outperform our competitors.",
            "description": "Facing price pressure in our B2B SaaS niche. Need a defensible advantage.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    for g in data["gaps"]:
        assert len(g["affected_options"]) == 0, "Do NOT fabricate options when none were specified"
        assert len(g.get("affected_dimensions", [])) > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])
    assert any(kw in combined_text for kw in ["differentiation", "competitor", "advantage", "positioning", "capability", "market", "segment", "resource"])


# ==============================================================================
# TEST 7 — Consumer Decision: "I need to choose between two cars."
# ==============================================================================
def test_7_consumer_car_selection(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Car Selection",
            "problem_statement": "I need to choose between two cars: Toyota RAV4 or Honda CR-V.",
            "description": "Evaluating family safety, cargo space, and fuel efficiency.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    combined_text = " ".join([g["question"].lower() + " " + g["title"].lower() for g in data["gaps"]])
    assert "soc2" not in combined_text
    assert "database" not in combined_text
    assert any(kw in combined_text for kw in ["criteria", "priority", "budget", "cost", "feasibility", "metrics", "trade-offs"])


# ==============================================================================
# TEST 8 — Technical Decision: "We need to choose a database architecture for our platform."
# ==============================================================================
def test_8_technical_database_selection(client: TestClient, auth_headers: dict, folder_id: int):
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Database Architecture Selection",
            "problem_statement": "We need to choose a database architecture for our platform: PostgreSQL or MongoDB.",
            "description": "Evaluating transactional guarantees and scaling characteristics.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    res = client.post(f"/api/decisions/{did}/gaps/detect?force_mock=true", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_gaps"] > 0

    for g in data["gaps"]:
        if g.get("affected_options"):
            for opt in g["affected_options"]:
                assert opt in ["PostgreSQL", "MongoDB"], f"Unexpected fabricated option: {opt}"


# ==============================================================================
# TEST 9 — Zero Gaps Valid When Evidence Is Fully Sufficient
# ==============================================================================
def test_9_zero_gaps_valid_when_fully_specified():
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
    assert len(gaps) == 0, f"Expected 0 gaps for fully specified decision, but got {len(gaps)}"


# ==============================================================================
# TEST 10 — Non-Redundancy Safeguard (Do not re-ask known budget)
# ==============================================================================
def test_10_non_redundancy_safeguard():
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
    all_text = " ".join([g.question.lower() + " " + g.title.lower() for g in gaps])
    assert "budget ceiling" not in all_text
    assert "maximum acceptable annual budget" not in all_text


# ==============================================================================
# TEST 11 — Research Relevance Verification
# ==============================================================================
def test_11_research_relevance_verification():
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


# ==============================================================================
# TEST 12 — Precision Guardrail Sanitizer Verification
# ==============================================================================
def test_12_precision_guardrail_sanitizer():
    from app.services.gaps import sanitize_gap_precision

    # Case 1: Unsupported 12-month period
    ctx1 = "We don't know peak concurrent users."
    q1 = "What is the expected peak concurrent user count during the next 12 months?"
    s1 = sanitize_gap_precision(q1, ctx1)
    assert "during the next 12 months" not in s1
    assert s1 == "What is the expected peak concurrent user count?"

    # Case 2: Unsupported monthly budget
    ctx2 = "Our initial infrastructure budget is limited."
    q2 = "What is the maximum monthly infrastructure budget?"
    s2 = sanitize_gap_precision(q2, ctx2)
    assert "monthly" not in s2
    assert "acceptable infrastructure budget" in s2

    # Case 3: Unsupported timeframe 12–24 months
    ctx3 = "The structure may change frequently."
    q3 = "How frequently will the structures change over the next 12–24 months?"
    s3 = sanitize_gap_precision(q3, ctx3)
    assert "12–24" not in s3
    assert "over the next" not in s3
    assert s3.startswith("How frequently")

    # Case 4: Unsupported peak traffic condition
    ctx4 = "We don't know the read-to-write ratio."
    q4 = "What is the expected read-to-write ratio during peak traffic?"
    s4 = sanitize_gap_precision(q4, ctx4)
    assert "during peak traffic" not in s4
    assert s4 == "What is the expected read-to-write ratio?"

    # Case 5: When context explicitly establishes timeframe, preserve it
    ctx5 = "We need our plans for the next 12 months finalized."
    q5 = "What is the expected peak concurrent user count during the next 12 months?"
    s5 = sanitize_gap_precision(q5, ctx5)
    assert "next 12 months" in s5


# ==============================================================================
# TEST 13 — Discovered Gaps Traceability (derived_from & discovery_reason)
# ==============================================================================
def test_13_traceability_metadata():
    from app.schemas import GapItem

    gap = GapItem(
        id="gap_trace_1",
        title="Schema Volatility Assessment",
        question="How frequently are the relevant data structures expected to change?",
        reason="Assesses whether schema flexibility justifies Document DB over Relational DB.",
        gap_type="REQUIREMENT",
        importance="high",
        derived_from=["decision_context", "stage_2_pro", "stage_2_assumption"],
        discovery_reason="Schema flexibility is presented as a potential benefit of MongoDB, but the actual degree of schema volatility has not been established.",
        materiality_reason="Determines if frequent migrations will occur, directly impacting operational maintenance.",
    )

    assert "stage_2_pro" in gap.derived_from
    assert "stage_2_assumption" in gap.derived_from
    assert "degree of schema volatility has not been established" in gap.discovery_reason
    assert gap.question.endswith("?")
