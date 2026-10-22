import pytest
from fastapi.testclient import TestClient
from app.config import settings
from app.services.search import (
    determine_source_reliability,
    generate_narrow_search_query,
    analyze_evidence_and_synthesize,
)


@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user for research tests."""
    email = "research_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def researched_decision_id(client: TestClient, auth_headers: dict):
    """Create a folder, decision, and detected gaps for research tests."""
    folder_res = client.post(
        "/api/folders",
        json={"name": "Multi-Region Cloud Architecture", "description": "Evaluating high availability vendors"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]

    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": fid,
            "title": "AWS Aurora vs Google Spanner Multi-Region Evaluation",
            "problem_statement": "We must verify whether Spanner or Aurora can satisfy 99.999% SLA with sub-minute disaster recovery.",
            "description": "We need exact verified benchmark metrics on failover latency and cross-region replica overhead.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    # Pre-populate structured points
    client.patch(
        f"/api/decisions/{did}/structuring",
        headers=auth_headers,
        json={
            "unknowns": [
                "Exact multi-region availability SLA and failover latency benchmark."
            ],
            "mark_reviewed": True,
        },
    )

    # Detect gaps
    client.post(
        f"/api/decisions/{did}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )

    return did


def test_unconfigured_provider_error_state(client: TestClient, auth_headers: dict, researched_decision_id: int):
    """
    Test that when the search provider is unconfigured (empty API key),
    attempting live research execution returns a clear HTTP 503 error state.
    """
    gaps_res = client.get(f"/api/decisions/{researched_decision_id}/gaps", headers=auth_headers)
    gap_id = gaps_res.json()["gaps"][0]["id"]

    # Ensure search_api_key is empty to trigger unconfigured state
    orig_key = settings.search_api_key
    orig_tavily = settings.tavily_api_key
    orig_serper = settings.serper_api_key
    orig_provider = settings.search_provider
    try:
        settings.search_api_key = ""
        settings.tavily_api_key = ""
        settings.serper_api_key = ""
        settings.search_provider = "tavily"

        # Direct execution endpoint without force_mock
        res = client.post(
            f"/api/decisions/{researched_decision_id}/gaps/{gap_id}/research/execute?force_mock=false",
            headers=auth_headers,
        )
        assert res.status_code == 503
        detail = res.json()["detail"]
        assert "not configured" in detail.lower()
        assert "search_api_key" in detail.lower() or "tavily_api_key" in detail.lower()

        # Via research gap route with execute=True
        res2 = client.post(
            f"/api/decisions/{researched_decision_id}/gaps/{gap_id}/research",
            headers=auth_headers,
            json={"resolution_method": "web_research", "execute": True, "force_mock": False},
        )
        assert res2.status_code == 503
        assert "not configured" in res2.json()["detail"].lower()
    finally:
        settings.search_api_key = orig_key
        settings.tavily_api_key = orig_tavily
        settings.serper_api_key = orig_serper
        settings.search_provider = orig_provider


def test_execute_research_with_mock_provider(client: TestClient, auth_headers: dict, researched_decision_id: int):
    """
    Test successful execution of web research using the deterministic mock search provider.
    Verifies narrowly scoped query, stored sources, provenance, claims, and status update.
    """
    gaps_res = client.get(f"/api/decisions/{researched_decision_id}/gaps", headers=auth_headers)
    gap_id = gaps_res.json()["gaps"][0]["id"]

    res = client.post(
        f"/api/decisions/{researched_decision_id}/gaps/{gap_id}/research/execute?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()

    # Check updated gap structure
    updated_gap = data["updated_gap"]
    assert updated_gap["id"] == gap_id
    assert updated_gap["status"] == "researched"
    assert updated_gap["research_query"] is not None
    assert len(updated_gap["research_query"]) > 5
    assert updated_gap["answer"] is not None

    # Check finding details
    finding = data["finding"]
    assert finding["gap_id"] == gap_id
    assert len(finding["sources"]) > 0
    assert len(finding["claims"]) > 0
    assert finding["synthesis"] != ""

    # Verify source attributes: title, URL, retrieval timestamp, relevant claims, reliability label
    source = finding["sources"][0]
    assert "source_title" in source and len(source["source_title"]) > 0
    assert "url" in source and source["url"].startswith("http")
    assert "retrieval_timestamp" in source and len(source["retrieval_timestamp"]) > 10
    assert "relevant_claims" in source and isinstance(source["relevant_claims"], list)
    assert "reliability_label" in source and source["reliability_label"] in [
        "primary_source",
        "secondary_source",
        "community_opinion",
        "low_confidence",
    ]


def test_prefer_primary_sources():
    """
    Unit test for provenance classification: official documentation and cloud vendor sites
    must be labeled as primary sources and preferred ahead of secondary sources.
    """
    # Vendor & doc sites
    assert determine_source_reliability("https://cloud.google.com/spanner/docs/sla") == "primary_source"
    assert determine_source_reliability("https://aws.amazon.com/rds/aurora/sla/") == "primary_source"
    assert determine_source_reliability("https://docs.github.com/en/actions") == "primary_source"
    assert determine_source_reliability("https://csrc.nist.gov/publications/sp800") == "primary_source"

    # Tech journalism & analyst reports
    assert determine_source_reliability("https://www.infoq.com/articles/distributed-sql") == "secondary_source"
    assert determine_source_reliability("https://techcrunch.com/2026/01/cloud-spend") == "secondary_source"
    assert determine_source_reliability("https://www.gartner.com/en/documents/database-tco") == "secondary_source"

    # Community forums
    assert determine_source_reliability("https://reddit.com/r/devops/comments/1234") == "community_opinion"
    assert determine_source_reliability("https://news.ycombinator.com/item?id=5678") == "community_opinion"


def test_narrowly_scoped_query_generation():
    """Test generating narrow, targeted queries instead of conversational questions."""
    q = "What is the exact failover recovery time and SLA for multi-region?"
    affected = ["AWS Aurora", "Google Spanner"]
    narrow = generate_narrow_search_query(q, reason="To satisfy 99.999% SLA", affected_options=affected)

    assert "AWS Aurora" in narrow
    assert "Google Spanner" in narrow
    assert "failover recovery time" in narrow
    assert not narrow.startswith("What is")


def test_distinguish_single_source_from_conflicting_evidence():
    """
    Test consensus logic:
    - Corroborated when multiple reliable sources agree.
    - Single source when only one reports.
    - Conflicting when evidence directly clashes.
    """
    # 1. Corroborated primary sources
    corroborated_sources = [
        {
            "title": "Vendor A SLA",
            "url": "https://cloud.google.com/spanner/docs/sla",
            "raw_claims": ["Guarantees 99.999% availability with zero downtime."],
        },
        {
            "title": "Vendor B SLA",
            "url": "https://aws.amazon.com/rds/aurora/sla/",
            "raw_claims": ["Guarantees 99.99% availability with sub-minute failover."],
        },
    ]
    f1 = analyze_evidence_and_synthesize("gap_1", "What is the SLA?", "Spanner vs Aurora SLA", corroborated_sources)
    assert f1.consensus in ["corroborated", "single_source"]
    assert f1.is_verified is True

    # 2. Conflicting evidence
    conflicting_sources = [
        {
            "title": "Contradictory Review A",
            "url": "https://www.infoq.com/article1",
            "raw_claims": ["System claims 99.999% SLA but third party disputed metrics contradict this claim."],
        },
        {
            "title": "Contradictory Review B",
            "url": "https://www.infoq.com/article2",
            "raw_claims": ["Independent audit confirms contradictory benchmarks."],
        },
    ]
    f2 = analyze_evidence_and_synthesize("gap_2", "Are metrics reliable?", "audit benchmarks", conflicting_sources)
    assert f2.consensus == "conflicting_evidence"
    # STRICT INVARIANT: Conflicting evidence is NEVER verified!
    assert f2.is_verified is False


def test_never_mark_unsupported_claim_verified():
    """
    CRITICAL INVARIANT TEST:
    Ensure that an unsupported claim (no sources or empty results) is NEVER marked verified.
    """
    f_empty = analyze_evidence_and_synthesize("gap_3", "Unknown Metric?", "query", [])
    assert f_empty.consensus == "unsupported"
    assert f_empty.is_verified is False  # Must be False

    for c in f_empty.claims:
        assert c.is_verified is False
        assert c.consensus == "unsupported"


def test_research_persistence_and_retrieval(client: TestClient, auth_headers: dict, researched_decision_id: int):
    """
    Test that executing research persists the findings into decision.research,
    incorporates verified facts into decision.points, and can be retrieved via GET /research.
    """
    gaps_res = client.get(f"/api/decisions/{researched_decision_id}/gaps", headers=auth_headers)
    gap_id = gaps_res.json()["gaps"][0]["id"]

    exec_res = client.post(
        f"/api/decisions/{researched_decision_id}/gaps/{gap_id}/research/execute?force_mock=true",
        headers=auth_headers,
    )
    assert exec_res.status_code == 200

    # Retrieve full decision research logs
    res_log = client.get(f"/api/decisions/{researched_decision_id}/research", headers=auth_headers)
    assert res_log.status_code == 200
    res_data = res_log.json()
    assert res_data["decision_id"] == researched_decision_id
    assert res_data["total_findings"] >= 1
    assert any(f["gap_id"] == gap_id for f in res_data["findings"])

    # Verify decision points received verified fact
    dec_res = client.get(f"/api/decisions/{researched_decision_id}", headers=auth_headers)
    pts = dec_res.json()["points"]
    assert "facts" in pts
    assert any("Web Researched" in f for f in pts["facts"])


def test_research_missing_gap_returns_404(client: TestClient, auth_headers: dict, researched_decision_id: int):
    """Test researching a non-existent gap ID returns HTTP 404."""
    res = client.post(
        f"/api/decisions/{researched_decision_id}/gaps/non_existent_gap_999/research/execute?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
