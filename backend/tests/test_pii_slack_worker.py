import httpx
from fastapi.testclient import TestClient

from app.auth import create_token, hash_password
from app.models import Decision, Folder, User
from app.services.pii_redactor import redact_pii_with_stats
from app.worker import claim_next_bot_job, enqueue_bot_job


def test_dpdp_pii_redactor_scrubs_sensitive_fields_and_preserves_timestamps():
    sample = (
        "[00:12:34] Priya: Reach me at priya.sharma@example.com or +91 9876543210. "
        "My PAN is ABCDE1234F, Aadhaar 2345 6789 0123, and key sk-proj-1234567890abcdefghij12345. "
        "Postgres port is 6543 and budget is ₹1500."
    )
    redacted, count = redact_pii_with_stats(sample)

    assert count == 5
    assert "[REDACTED_EMAIL]" in redacted
    assert "[REDACTED_PHONE]" in redacted
    assert "[REDACTED_PAN]" in redacted
    assert "[REDACTED_AADHAAR]" in redacted
    assert "[REDACTED_SECRET]" in redacted
    assert "priya.sharma@example.com" not in redacted
    assert "9876543210" not in redacted
    assert "ABCDE1234F" not in redacted
    assert "2345 6789 0123" not in redacted
    assert "[00:12:34]" in redacted
    assert "6543" in redacted
    assert "₹1500" in redacted


def test_share_gaps_to_slack_validates_url_and_delivers_open_gaps(client: TestClient, db_session, monkeypatch):
    user = User(email="slack_owner@example.com", password_hash=hash_password("StrongPass123!"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    folder = Folder(owner_id=user.id, name="Core Platform", description="Infra")
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)

    decision = Decision(
        owner_id=user.id,
        folder_id=folder.id,
        title="Adopt Postgres Queue",
        gaps={
            "gaps": [
                {"id": "g1", "question": "What is peak concurrent Meet bot count?", "importance": "critical", "status": "pending"},
                {"id": "g2", "question": "Already answered?", "importance": "low", "status": "answered"},
            ]
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    token = create_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Reject non-Slack webhook URLs (SSRF guard)
    bad_resp = client.post(
        f"/api/decisions/{decision.id}/gaps/share-slack",
        json={"webhook_url": "http://169.254.169.254/latest/meta-data"},
        headers=headers,
    )
    assert bad_resp.status_code == 400

    captured = {}

    class _FakeResp:
        def raise_for_status(self):
            return None

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, json):
            captured["url"] = url
            captured["text"] = json["text"]
            return _FakeResp()

    monkeypatch.setattr(httpx, "Client", _FakeClient)

    ok_resp = client.post(
        f"/api/decisions/{decision.id}/gaps/share-slack",
        json={"webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX"},
        headers=headers,
    )
    assert ok_resp.status_code == 200
    body = ok_resp.json()
    assert body["sent"] is True
    assert body["gaps_shared"] == 1
    assert "What is peak concurrent Meet bot count?" in captured["text"]
    assert "Already answered?" not in captured["text"]


def test_postgres_worker_queue_enqueue_and_atomic_claim(db_session):
    job = enqueue_bot_job(
        db_session,
        session_id=101,
        meet_url="https://meet.google.com/abc-defg-hij",
        bot_name="DecisionLens Bot",
        language="en",
    )
    assert job.status == "queued"

    claimed = claim_next_bot_job(db_session, worker_id="worker-test-1")
    assert claimed is not None
    assert claimed.id == job.id
    assert claimed.status == "running"
    assert claimed.worker_id == "worker-test-1"

    # Second claim sees nothing left in queue
    second = claim_next_bot_job(db_session, worker_id="worker-test-2")
    assert second is None

