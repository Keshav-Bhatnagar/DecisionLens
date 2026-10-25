from datetime import timedelta
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import hash_password, verify_password, create_token, verify_ownership


def test_password_hashing():
    """Verify Argon2 hashing and verification."""
    password = "SuperSecretPassword123!"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_register_success(client: TestClient):
    """Verify new user registration."""
    payload = {
        "email": "newuser@example.com",
        "password": "ValidPassword999!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "newuser@example.com"
    assert "id" in data["user"]


def test_register_duplicate_email(client: TestClient, registered_user: dict):
    """Verify duplicate email registration is rejected with HTTP 400."""
    payload = {
        "email": registered_user["email"],  # same email
        "password": "AnotherPassword123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_register_weak_password(client: TestClient):
    """Verify passwords shorter than 8 characters are rejected."""
    payload = {
        "email": "weak@example.com",
        "password": "short",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_register_password_complexity_rules(client: TestClient):
    """Verify passwords missing uppercase, lowercase, digit, or special character are rejected."""
    # Missing symbol
    r1 = client.post("/api/auth/register", json={"email": "nosym@example.com", "password": "AuditPassword2026"})
    assert r1.status_code == 422
    assert "special character" in str(r1.json()).lower()

    # Missing uppercase
    r2 = client.post("/api/auth/register", json={"email": "noupper@example.com", "password": "auditpassword2026!"})
    assert r2.status_code == 422
    assert "uppercase" in str(r2.json()).lower()

    # Missing lowercase
    r3 = client.post("/api/auth/register", json={"email": "nolower@example.com", "password": "AUDITPASSWORD2026!"})
    assert r3.status_code == 422
    assert "lowercase" in str(r3.json()).lower()

    # Missing digit
    r4 = client.post("/api/auth/register", json={"email": "nodigit@example.com", "password": "AuditPassword!#"})
    assert r4.status_code == 422
    assert "digit" in str(r4.json()).lower()


def test_login_success(client: TestClient, registered_user: dict):
    """Verify login with correct credentials."""
    payload = {
        "email": registered_user["email"],
        "password": registered_user["password"],
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == registered_user["email"]


def test_login_invalid_password(client: TestClient, registered_user: dict):
    """Verify login with wrong password returns HTTP 401."""
    payload = {
        "email": registered_user["email"],
        "password": "WrongPassword!",
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 401
    assert "incorrect email or password" in response.json()["detail"].lower()


def test_login_nonexistent_email(client: TestClient):
    """Verify login with non-existent email returns HTTP 401."""
    payload = {
        "email": "doesnotexist@example.com",
        "password": "AnyPassword123!",
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 401
    assert "incorrect email or password" in response.json()["detail"].lower()


def test_get_me_success(client: TestClient, registered_user: dict):
    """Verify authenticated /me endpoint returns user profile."""
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert data["email"] == registered_user["email"]
    assert data["id"] == registered_user["user"].id


def test_get_me_unauthenticated(client: TestClient):
    """Verify unauthenticated request to /me is rejected."""
    response = client.get("/api/auth/me")
    assert response.status_code == 403 or response.status_code == 401


def test_get_me_invalid_token(client: TestClient):
    """Verify malformed token is rejected with HTTP 401."""
    headers = {"Authorization": "Bearer invalid.malformed.token"}
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


def test_get_me_expired_token(client: TestClient, registered_user: dict):
    """Verify expired token is rejected with HTTP 401."""
    # Create token that expired 1 hour ago
    expired_token = create_token(
        user_id=registered_user["user"].id,
        expires_delta=timedelta(hours=-1),
    )
    headers = {"Authorization": f"Bearer {expired_token}"}
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


def test_verify_ownership_reusable_check():
    """Verify ownership checker enforces user isolation and 404 on mismatch."""
    current_user_id = 42

    # Matching owner passes without exception
    verify_ownership(resource_owner_id=42, current_user_id=current_user_id, resource_name="Decision")

    # Mismatched owner raises HTTP 404 (preventing resource ID enumeration)
    with pytest.raises(HTTPException) as exc_info:
        verify_ownership(resource_owner_id=99, current_user_id=current_user_id, resource_name="Decision")

    assert exc_info.value.status_code == 404
    assert "Decision not found" in exc_info.value.detail


def test_change_password_success(client: TestClient, registered_user: dict):
    """Verify changing password updates hash and allows logging in with new credentials."""
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    payload = {
        "current_password": registered_user["password"],
        "new_password": "NewSecretPass2026!",
    }
    res = client.post("/api/auth/change-password", headers=headers, json=payload)
    assert res.status_code == 200
    assert "successfully" in res.json()["message"].lower()

    # Old password fails
    fail_login = client.post(
        "/api/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert fail_login.status_code == 401

    # New password succeeds
    ok_login = client.post(
        "/api/auth/login",
        json={"email": registered_user["email"], "password": "NewSecretPass2026!"},
    )
    assert ok_login.status_code == 200


def test_change_password_wrong_current(client: TestClient, registered_user: dict):
    """Verify changing password rejects incorrect current password with HTTP 400."""
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    payload = {
        "current_password": "WrongPassword123!",
        "new_password": "NewSecretPass2026!",
    }
    res = client.post("/api/auth/change-password", headers=headers, json=payload)
    assert res.status_code == 400
    assert "current password does not match" in res.json()["detail"].lower()


def test_change_password_weak_new(client: TestClient, registered_user: dict):
    """Verify changing password validates new password complexity (HTTP 422 on failure)."""
    headers = {"Authorization": f"Bearer {registered_user['token']}"}
    payload = {
        "current_password": registered_user["password"],
        "new_password": "weak",
    }
    res = client.post("/api/auth/change-password", headers=headers, json=payload)
    assert res.status_code == 422


def test_oauth_providers_list(client: TestClient):
    """Verify GET /api/auth/oauth/providers returns Google, GitHub, and Microsoft metadata."""
    res = client.get("/api/auth/oauth/providers")
    assert res.status_code == 200
    providers = res.json()
    assert isinstance(providers, list)
    provider_ids = [p["id"] for p in providers]
    assert "google" in provider_ids
    assert "github" in provider_ids
    assert "microsoft" in provider_ids

    # Check Google provider attributes
    google_p = next(p for p in providers if p["id"] == "google")
    assert "Google Workspace" in google_p["name"]
    assert "configured" in google_p


def test_oauth_authenticate_google_sandbox(client: TestClient):
    """Verify authenticating via Google OAuth creates user with provider tag and returns JWT."""
    payload = {
        "provider": "google",
        "email": "executive.director@google.com",
        "display_name": "Executive Director",
        "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    }
    res = client.post("/api/auth/oauth/authenticate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "executive.director@google.com"
    assert data["user"]["oauth_provider"] == "google"
    assert data["user"]["display_name"] == "Executive Director"

    # User can now query /api/auth/me using this JWT
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "executive.director@google.com"
    assert me_res.json()["oauth_provider"] == "google"


def test_oauth_authenticate_github_existing_linking(client: TestClient, registered_user: dict):
    """Verify OAuth authentication with an existing user's email links the OAuth provider."""
    payload = {
        "provider": "github",
        "email": registered_user["email"],
        "display_name": "GitHub Developer",
        "avatar_url": "https://avatars.githubusercontent.com/u/12345",
    }
    res = client.post("/api/auth/oauth/authenticate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == registered_user["email"]
    assert data["user"]["oauth_provider"] == "github"
    assert data["user"]["display_name"] == "GitHub Developer"


def test_oauth_authenticate_unsupported_provider(client: TestClient):
    """Verify unsupported provider is rejected with HTTP 400."""
    payload = {
        "provider": "unsupported_provider_xyz",
        "email": "test@example.com",
    }
    res = client.post("/api/auth/oauth/authenticate", json=payload)
    assert res.status_code == 400
    assert "unsupported oauth provider" in res.json()["detail"].lower()


def test_oauth_authenticate_missing_credentials(client: TestClient):
    """Verify OAuth request without email or id_token fails validation."""
    payload = {
        "provider": "google",
    }
    res = client.post("/api/auth/oauth/authenticate", json=payload)
    assert res.status_code == 400
    assert "missing oauth credentials" in res.json()["detail"].lower()

