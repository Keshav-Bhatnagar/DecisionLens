import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User, Folder, Decision
from app.auth import hash_password, create_token


@pytest.fixture
def user_a(db_session: Session) -> dict:
    """Fixture for primary test user (User A)."""
    user = User(email="user_a@example.com", password_hash=hash_password("PasswordA123!"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return {"user": user, "token": create_token(user.id)}


@pytest.fixture
def user_b(db_session: Session) -> dict:
    """Fixture for secondary test user (User B) to test isolation."""
    user = User(email="user_b@example.com", password_hash=hash_password("PasswordB123!"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return {"user": user, "token": create_token(user.id)}


def test_folder_crud(client: TestClient, user_a: dict):
    """Test full CRUD lifecycle for folders."""
    headers = {"Authorization": f"Bearer {user_a['token']}"}

    # 1. Create folder
    create_res = client.post(
        "/api/folders",
        headers=headers,
        json={"name": "Product Strategy", "description": "Q4 roadmap planning", "color": "#10B981"},
    )
    assert create_res.status_code == 201
    folder = create_res.json()
    folder_id = folder["id"]
    assert folder["name"] == "Product Strategy"
    assert folder["color"] == "#10B981"
    assert folder["decision_count"] == 0

    # 2. List folders
    list_res = client.get("/api/folders", headers=headers)
    assert list_res.status_code == 200
    folders = list_res.json()
    assert len(folders) == 1
    assert folders[0]["id"] == folder_id

    # 3. Get single folder
    get_res = client.get(f"/api/folders/{folder_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == folder_id

    # 4. Update folder
    update_res = client.patch(
        f"/api/folders/{folder_id}",
        headers=headers,
        json={"name": "Executive Strategy", "color": "#6366F1"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Executive Strategy"
    assert update_res.json()["color"] == "#6366F1"

    # 5. Delete folder
    del_res = client.delete(f"/api/folders/{folder_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify deleted
    assert client.get(f"/api/folders/{folder_id}", headers=headers).status_code == 404


def test_decision_crud_and_multiple_records_in_folder(client: TestClient, user_a: dict):
    """Test folder supports multiple decisions and meeting records with problem statements."""
    headers = {"Authorization": f"Bearer {user_a['token']}"}

    # Create folder
    f_res = client.post("/api/folders", headers=headers, json={"name": "Engineering Decisions"})
    folder_id = f_res.json()["id"]

    # Create record 1: Standard Decision
    d1_res = client.post(
        "/api/decisions",
        headers=headers,
        json={
            "folder_id": folder_id,
            "title": "Migrate to Microservices",
            "problem_statement": "Monolith deployment takes too long and fails frequently.",
            "record_type": "decision",
            "status": "evaluating",
        },
    )
    assert d1_res.status_code == 201
    d1 = d1_res.json()
    assert d1["record_type"] == "decision"
    assert d1["problem_statement"] == "Monolith deployment takes too long and fails frequently."

    # Create record 2: Meeting Record in same folder
    d2_res = client.post(
        "/api/decisions",
        headers=headers,
        json={
            "folder_id": folder_id,
            "title": "Weekly Architecture Sync - Oct 16",
            "problem_statement": "Discuss database partitioning strategies for multi-region.",
            "record_type": "meeting",
            "status": "draft",
        },
    )
    assert d2_res.status_code == 201
    d2 = d2_res.json()
    assert d2["record_type"] == "meeting"

    # Verify folder list reflects decision_count = 2
    f_list = client.get("/api/folders", headers=headers).json()
    assert f_list[0]["decision_count"] == 2

    # List decisions filtered by folder_id
    decisions_list = client.get(f"/api/decisions?folder_id={folder_id}", headers=headers).json()
    assert len(decisions_list) == 2
    titles = [d["title"] for d in decisions_list]
    assert "Migrate to Microservices" in titles
    assert "Weekly Architecture Sync - Oct 16" in titles

    # Update decision problem statement
    patch_res = client.patch(
        f"/api/decisions/{d1['id']}",
        headers=headers,
        json={"problem_statement": "Updated: Monolith build time is 45 mins; latency SLAs breaching."},
    )
    assert patch_res.status_code == 200
    assert "Updated: Monolith" in patch_res.json()["problem_statement"]


def test_cross_user_isolation(client: TestClient, user_a: dict, user_b: dict):
    """Verify strict multi-tenancy: User B cannot access, mutate, or target User A's resources."""
    headers_a = {"Authorization": f"Bearer {user_a['token']}"}
    headers_b = {"Authorization": f"Bearer {user_b['token']}"}

    # User A creates folder & decision
    f_res = client.post("/api/folders", headers=headers_a, json={"name": "User A Private Vault"})
    folder_a_id = f_res.json()["id"]

    d_res = client.post(
        "/api/decisions",
        headers=headers_a,
        json={"folder_id": folder_a_id, "title": "User A Secret Acquisition"},
    )
    decision_a_id = d_res.json()["id"]

    # User B tries to view User A's folder -> 404 Not Found (prevents enumeration)
    assert client.get(f"/api/folders/{folder_a_id}", headers=headers_b).status_code == 404

    # User B tries to update User A's folder -> 404
    assert client.patch(f"/api/folders/{folder_a_id}", headers=headers_b, json={"name": "Hacked"}).status_code == 404

    # User B tries to delete User A's folder -> 404
    assert client.delete(f"/api/folders/{folder_a_id}", headers=headers_b).status_code == 404

    # User B tries to view User A's decision -> 404
    assert client.get(f"/api/decisions/{decision_a_id}", headers=headers_b).status_code == 404

    # User B tries to update User A's decision -> 404
    assert client.patch(f"/api/decisions/{decision_a_id}", headers=headers_b, json={"title": "Hacked"}).status_code == 404

    # User B tries to delete User A's decision -> 404
    assert client.delete(f"/api/decisions/{decision_a_id}", headers=headers_b).status_code == 404

    # User B tries to create a decision pointing to User A's folder -> 404
    hijack_res = client.post(
        "/api/decisions",
        headers=headers_b,
        json={"folder_id": folder_a_id, "title": "Injected Decision"},
    )
    assert hijack_res.status_code == 404

    # User B's list endpoints must NOT include User A's data
    b_folders = client.get("/api/folders", headers=headers_b).json()
    assert len(b_folders) == 0

    b_decisions = client.get("/api/decisions", headers=headers_b).json()
    assert len(b_decisions) == 0


def test_folder_cascade_delete(client: TestClient, user_a: dict):
    """Verify deleting a folder cascades and deletes all contained decisions."""
    headers = {"Authorization": f"Bearer {user_a['token']}"}

    # Create folder and two decisions
    f_res = client.post("/api/folders", headers=headers, json={"name": "Temporary Project"})
    folder_id = f_res.json()["id"]

    d1_id = client.post("/api/decisions", headers=headers, json={"folder_id": folder_id, "title": "Sub 1"}).json()["id"]
    d2_id = client.post("/api/decisions", headers=headers, json={"folder_id": folder_id, "title": "Sub 2"}).json()["id"]

    # Delete folder
    del_res = client.delete(f"/api/folders/{folder_id}", headers=headers)
    assert del_res.status_code == 200

    # Folder must be gone
    assert client.get(f"/api/folders/{folder_id}", headers=headers).status_code == 404

    # Both child decisions must also be gone
    assert client.get(f"/api/decisions/{d1_id}", headers=headers).status_code == 404
    assert client.get(f"/api/decisions/{d2_id}", headers=headers).status_code == 404


def test_persistence_after_reload(client: TestClient, user_a: dict, db_session: Session):
    """Verify data is persisted to the database and queryable independently."""
    headers = {"Authorization": f"Bearer {user_a['token']}"}

    f_res = client.post("/api/folders", headers=headers, json={"name": "Persistent Folder"})
    folder_id = f_res.json()["id"]

    d_res = client.post(
        "/api/decisions",
        headers=headers,
        json={"folder_id": folder_id, "title": "Persistent Decision", "problem_statement": "Core problem statement"},
    )
    decision_id = d_res.json()["id"]

    # Query DB directly bypassing API
    db_session.expire_all()
    folder_in_db = db_session.get(Folder, folder_id)
    assert folder_in_db is not None
    assert folder_in_db.name == "Persistent Folder"

    decision_in_db = db_session.get(Decision, decision_id)
    assert decision_in_db is not None
    assert decision_in_db.title == "Persistent Decision"
    assert decision_in_db.problem_statement == "Core problem statement"
    assert decision_in_db.folder_id == folder_id
