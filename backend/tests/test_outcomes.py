import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def auth_headers(client: TestClient):
    email = "outcomes_test_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def decision_context(client: TestClient, auth_headers: dict):
    folder_res = client.post(
        "/api/folders",
        json={"name": "Post-Decision Outcomes Folder", "description": "Testing outcome tracking"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]

    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": fid,
            "title": "PostgreSQL vs MongoDB Architecture",
            "problem_statement": "Deciding on our primary datastore for 50,000 users.",
            "description": "Evaluating managed Postgres vs Atlas MongoDB.",
            "record_type": "decision",
        },
        headers=auth_headers,
    )
    did = dec_res.json()["id"]
    return {"folder_id": fid, "decision_id": did}


def test_create_and_list_decision_outcome(client: TestClient, auth_headers: dict, decision_context: dict):
    did = decision_context["decision_id"]
    fid = decision_context["folder_id"]

    # 1. Post a 30-day outcome review
    payload = {
        "implementation_status": "implemented_as_recommended",
        "chosen_option": "Supabase PostgreSQL + PgBouncer",
        "utility_rating": 5,
        "predicted_vs_actual": {
            "budget": {"target": "$250/mo", "actual": "$210/mo"},
            "p95_latency": {"target": "<100ms", "actual": "72ms"}
        },
        "unexpected_challenges": ["Need to tune max client connections in serverless functions"],
        "what_worked_well": "Zero downtime migration and seamless row-level security",
        "lessons_learned": "Enabling connection pooling on day one is mandatory for serverless workers",
        "would_recommend_tool": True,
        "days_since_decision": 30,
    }

    create_res = client.post(f"/api/decisions/{did}/outcomes", json=payload, headers=auth_headers)
    assert create_res.status_code == 201, create_res.text
    data = create_res.json()
    assert data["utility_rating"] == 5
    assert data["chosen_option"] == "Supabase PostgreSQL + PgBouncer"
    assert data["implementation_status"] == "implemented_as_recommended"
    outcome_id = data["id"]

    # 2. Get list of outcomes for the decision
    list_res = client.get(f"/api/decisions/{did}/outcomes", headers=auth_headers)
    assert list_res.status_code == 200
    outcomes = list_res.json()
    assert len(outcomes) == 1
    assert outcomes[0]["id"] == outcome_id

    # 3. Get latest outcome
    latest_res = client.get(f"/api/decisions/{did}/outcomes/latest", headers=auth_headers)
    assert latest_res.status_code == 200
    latest = latest_res.json()
    assert latest["id"] == outcome_id

    # 4. Check folder level insights
    insights_res = client.get(f"/api/folders/{fid}/outcomes/insights", headers=auth_headers)
    assert insights_res.status_code == 200
    insights = insights_res.json()
    assert insights["total_outcomes_recorded"] == 1
    assert insights["average_utility_rating"] == 5.0
    assert insights["implementation_rate_pct"] == 100.0
    assert len(insights["common_lessons"]) == 1

    # 5. Delete outcome
    del_res = client.delete(f"/api/decisions/{did}/outcomes/{outcome_id}", headers=auth_headers)
    assert del_res.status_code == 204
