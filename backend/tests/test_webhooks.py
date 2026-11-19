"""
Tests for GitOps and Enterprise Knowledge Base Synchronization Webhooks.

Asserts:
- Rejection (401) when X-Webhook-Secret is missing or incorrect.
- Success (200) when correct secret is passed, returning re-indexed domain collections.
- Rate-limiting (429) to prevent DoS / resource exhaustion.
"""

import pytest
from starlette.testclient import TestClient
from app.config import settings


def test_webhook_unauthorized_without_secret(client: TestClient):
    """Calling the sync webhook without the secret header must be rejected with 401."""
    res = client.post("/api/webhooks/rag-sync")
    assert res.status_code == 401
    assert "Invalid or missing X-Webhook-Secret" in res.json()["detail"]


def test_webhook_unauthorized_with_wrong_secret(client: TestClient):
    """Calling the sync webhook with a forged secret must be rejected with 401."""
    res = client.post(
        "/api/webhooks/rag-sync",
        headers={"X-Webhook-Secret": "forged_malicious_token_123"},
    )
    assert res.status_code == 401
    assert "Invalid or missing X-Webhook-Secret" in res.json()["detail"]


def test_webhook_authorized_sync_success(client: TestClient):
    """Calling the sync webhook with the valid configured secret triggers vector hot-reload."""
    secret = settings.webhook_secret
    res = client.post(
        "/api/webhooks/rag-sync",
        headers={"X-Webhook-Secret": secret},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "synchronized"
    assert "Successfully re-indexed" in data["message"]
    assert "legal" in data["domains_reindexed"]
    assert "software" in data["domains_reindexed"]
    assert len(data["domains_reindexed"]) >= 8


def test_webhook_rate_limiting(client: TestClient):
    """Subsequent immediate invocations must be throttled with 429 to prevent DoS."""
    secret = settings.webhook_secret
    # First invocation (may succeed if cooldown expired)
    _ = client.post("/api/webhooks/rag-sync", headers={"X-Webhook-Secret": secret})
    
    # Second immediate invocation must hit 429 cooldown
    res2 = client.post("/api/webhooks/rag-sync", headers={"X-Webhook-Secret": secret})
    assert res2.status_code == 429
    assert "Rate limit exceeded" in res2.json()["detail"]
