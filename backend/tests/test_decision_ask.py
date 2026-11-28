from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Decision, Folder, User


def _setup_decision(client: TestClient, db_session: Session):
    email = "ask_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}
    user = db_session.query(User).filter(User.email == email).first()

    folder = Folder(name="Product", owner_id=user.id, domain="PRODUCT")
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)

    decision = Decision(
        title="Selecting a Project Management Tool",
        problem_statement="Need a PM tool for 25 engineers within a 30-day deadline and $500/mo budget.",
        domain="PRODUCT",
        folder_id=folder.id,
        owner_id=user.id,
        gaps=[
            {"question": "What is the onboarding time?", "user_answer": "Under 1 week", "is_resolved": True}
        ],
        analysis={
            "winner": "Linear",
            "winner_score": 8.4,
            "option_scores": [
                {"option_name": "Linear", "total_score": 8.4},
                {"option_name": "Jira", "total_score": 7.1},
            ],
        },
        recommendation={
            "version": 1,
            "headline": "Adopt Linear for Engineering PM",
            "executive_summary": "Linear meets the 30-day rollout deadline and $500/mo cap.",
            "risks_and_mitigations": [
                {"risk": "Enterprise reporting limits", "mitigation": "Export CSV weekly to BI"}
            ],
            "roadmap": {
                "phases": [
                    {
                        "phase_id": "phase-1",
                        "title": "Phase 1: Pilot",
                        "timeline": "Week 1",
                        "tasks": [{"title": "Migrate 1 squad"}],
                    }
                ]
            },
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)
    return headers, decision


def test_ask_decision_followup_grounded(client: TestClient, db_session: Session):
    headers, decision = _setup_decision(client, db_session)

    res = client.post(
        f"/api/decisions/{decision.id}/ask",
        headers=headers,
        json={
            "question": "What are the key risks and roadmap timeline?",
            "force_mock": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["question"] == "What are the key risks and roadmap timeline?"
    assert "Enterprise reporting limits" in data["answer"]
    assert "Phase 1: Pilot" in data["answer"]
    assert "Problem Statement & Notes" in data["grounded_sources"]
    assert "Executive Synthesis v1" in data["grounded_sources"]
    assert data["provider"] == "deterministic"


def test_ask_decision_requires_valid_question_and_access(client: TestClient, db_session: Session):
    headers, decision = _setup_decision(client, db_session)

    short_res = client.post(
        f"/api/decisions/{decision.id}/ask",
        headers=headers,
        json={"question": "?", "force_mock": True},
    )
    assert short_res.status_code == 422

    missing_res = client.post(
        "/api/decisions/999999/ask",
        headers=headers,
        json={"question": "What is the risk?", "force_mock": True},
    )
    assert missing_res.status_code == 404
