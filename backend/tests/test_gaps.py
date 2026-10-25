import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user for gap detection tests."""
    email = "gaps_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def decision_id(client: TestClient, auth_headers: dict):
    """Create a folder and decision with substantive content for gap detection."""
    folder_res = client.post(
        "/api/folders",
        json={"name": "Cloud Strategy Workspace", "description": "Evaluating cloud vendors"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]

    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": fid,
            "title": "Cloud Vendor & Database Migration",
            "problem_statement": "We must decide whether to migrate to AWS Aurora PostgreSQL or Google Cloud Spanner to satisfy global 99.999% SLA.",
            "description": "Our current database infrastructure faces read replica lag. We need to evaluate total monthly costs and team maintenance overhead.",
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]

    # Pre-populate structured points with known unknowns
    client.patch(
        f"/api/decisions/{did}/structuring",
        headers=auth_headers,
        json={
            "unknowns": [
                "Exact total cost of ownership across 12 months is unknown.",
                "Team operational comfort with distributed transactions is unverified."
            ],
            "mark_reviewed": True,
        },
    )

    return did


def test_detect_gaps_success(client: TestClient, auth_headers: dict, decision_id: int):
    """Test detecting prioritized information gaps with reason, importance, options, and methods."""
    res = client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )

    assert res.status_code == 200
    data = res.json()
    assert data["decision_id"] == decision_id
    assert data["total_gaps"] >= 3
    assert data["pending_count"] >= 3

    # Verify structured properties of each gap
    for gap in data["gaps"]:
        assert "id" in gap
        assert len(gap["question"]) > 5
        assert len(gap["reason"]) > 5
        assert gap["importance"] in {"critical", "high", "medium", "low"}
        assert gap["priority_score"] >= 1
        assert isinstance(gap["affected_options"], list)
        assert gap["recommended_resolution_method"] in {"ask_user", "web_research"}
        assert gap["status"] == "pending"
        assert gap["answer"] is None


def test_answer_gap_ask_me_flow(client: TestClient, auth_headers: dict, decision_id: int):
    """Test Ask Me flow: user answers a gap, persisting answer and incorporating it into decision context."""
    # Detect gaps first
    detect_res = client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    first_gap_id = detect_res.json()["gaps"][0]["id"]

    # Answer the gap
    user_answer = "Maximum infrastructure budget is $18,000 per month approved by VP of Engineering."
    ans_res = client.post(
        f"/api/decisions/{decision_id}/gaps/{first_gap_id}/answer",
        headers=auth_headers,
        json={"answer": user_answer, "skip": False},
    )

    assert ans_res.status_code == 200
    gap_data = ans_res.json()
    assert gap_data["id"] == first_gap_id
    assert gap_data["status"] == "answered"
    assert gap_data["answer"] == user_answer

    # Verify state persistence via GET
    get_res = client.get(f"/api/decisions/{decision_id}/gaps", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["answered_count"] == 1

    # Verify Stage 2 Source Boundary: answering a gap updates Stage 3 gaps, NEVER mutating Stage 2 decision.points
    dec_res = client.get(f"/api/decisions/{decision_id}", headers=auth_headers)
    assert not any(user_answer in str(f) for f in dec_res.json()["points"].get("facts", []))


def test_skip_gap_keeps_marked_unknown(client: TestClient, auth_headers: dict, decision_id: int):
    """Test that skipping a gap sets status to 'skipped' and keeps it explicitly marked as unknown in gaps layer."""
    detect_res = client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    gap_to_skip = detect_res.json()["gaps"][1]["id"]

    skip_res = client.post(
        f"/api/decisions/{decision_id}/gaps/{gap_to_skip}/answer",
        headers=auth_headers,
        json={"skip": True},
    )

    assert skip_res.status_code == 200
    data = skip_res.json()
    assert data["id"] == gap_to_skip
    assert data["status"] == "skipped"
    assert data["answer"] is None

    # Verify counts reflect skipped state
    get_res = client.get(f"/api/decisions/{decision_id}/gaps", headers=auth_headers)
    assert get_res.json()["skipped_count"] >= 1

    # Verify Stage 2 Source Boundary: skipping a gap updates Stage 3 gaps, NEVER injecting into Stage 2 decision.points
    dec_res = client.get(f"/api/decisions/{decision_id}", headers=auth_headers)
    unknowns = dec_res.json()["points"].get("unknowns", [])
    assert not any("Unresolved Gap" in u for u in unknowns)


def test_missing_gap_id_returns_404(client: TestClient, auth_headers: dict, decision_id: int):
    """Verify that answering or researching a non-existent gap returns HTTP 404."""
    # Detect gaps first so decision has gaps structure
    client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )

    bad_id = "non_existent_gap_999"

    # Test missing ID on answer
    ans_res = client.post(
        f"/api/decisions/{decision_id}/gaps/{bad_id}/answer",
        headers=auth_headers,
        json={"answer": "Some answer"},
    )
    assert ans_res.status_code == 404
    assert f"'{bad_id}' not found" in ans_res.json()["detail"]

    # Test missing ID on research
    res_res = client.post(
        f"/api/decisions/{decision_id}/gaps/{bad_id}/research",
        headers=auth_headers,
        json={"resolution_method": "web_research"},
    )
    assert res_res.status_code == 404
    assert f"'{bad_id}' not found" in res_res.json()["detail"]


def test_invalid_research_method_returns_400(client: TestClient, auth_headers: dict, decision_id: int):
    """Verify that submitting an invalid resolution method returns HTTP 400."""
    detect_res = client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    gap_id = detect_res.json()["gaps"][0]["id"]

    res = client.post(
        f"/api/decisions/{decision_id}/gaps/{gap_id}/research",
        headers=auth_headers,
        json={"resolution_method": "unsupported_telepathy_method"},
    )

    assert res.status_code == 400
    assert "Invalid resolution method" in res.json()["detail"]
    assert "web_research" in res.json()["detail"]


def test_queue_research_success_and_no_fabrication(
    client: TestClient, auth_headers: dict, decision_id: int
):
    """
    Test the Research This route queues a validated inquiry without fabricating fake results.
    """
    detect_res = client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    gap_id = detect_res.json()["gaps"][1]["id"]
    custom_q = "AWS Aurora vs Google Spanner multi-region write latency benchmarks 2025"

    res = client.post(
        f"/api/decisions/{decision_id}/gaps/{gap_id}/research",
        headers=auth_headers,
        json={"resolution_method": "web_research", "custom_query": custom_q},
    )

    assert res.status_code == 200
    data = res.json()
    assert data["id"] == gap_id
    assert data["status"] == "research_queued"
    assert data["research_query"] == custom_q

    # Check persistence in decision.research
    dec_res = client.get(f"/api/decisions/{decision_id}", headers=auth_headers)
    research_obj = dec_res.json()["research"]
    assert "requests" in research_obj
    req = next(r for r in research_obj["requests"] if r["gap_id"] == gap_id)
    assert req["query"] == custom_q
    assert req["status"] == "queued"
    # No fabricated results
    assert req["results"] == []


def test_gaps_cross_user_isolation(client: TestClient, auth_headers: dict, decision_id: int):
    """Test that User B cannot view, answer, or queue research on User A's gaps."""
    # Detect gaps as User A
    detect_res = client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    gap_id = detect_res.json()["gaps"][0]["id"]

    # Register User B
    b_email = "user_b_gaps@decisionlens.ai"
    b_pass = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": b_email, "password": b_pass})
    b_login = client.post("/api/auth/login", json={"email": b_email, "password": b_pass})
    b_headers = {"Authorization": f"Bearer {b_login.json()['access_token']}"}

    # User B attempts to detect gaps on User A's decision
    assert client.post(f"/api/decisions/{decision_id}/gaps/detect", headers=b_headers).status_code == 404

    # User B attempts to get User A's gaps
    assert client.get(f"/api/decisions/{decision_id}/gaps", headers=b_headers).status_code == 404

    # User B attempts to answer User A's gap
    assert client.post(
        f"/api/decisions/{decision_id}/gaps/{gap_id}/answer",
        headers=b_headers,
        json={"answer": "Malicious answer"},
    ).status_code == 404

    # User B attempts to queue research on User A's gap
    assert client.post(
        f"/api/decisions/{decision_id}/gaps/{gap_id}/research",
        headers=b_headers,
        json={"resolution_method": "web_research"},
    ).status_code == 404
