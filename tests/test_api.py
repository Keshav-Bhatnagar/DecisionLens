import pytest
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.core.database import SessionLocal
from apps.api.models.database import Folder, DecisionSession

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["app"] == "DecisionLens API"


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"]["connected"] is True


def test_database_read_write():
    response = client.get("/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["read_write_verified"] is True
    assert data["details"]["matches"] is True


def test_folders_and_sessions_crud():
    # 1. Create a folder (write to DB)
    folder_res = client.post(
        "/folders",
        json={"name": "Q1 2026 Core Infrastructure", "description": "High-impact tech stack choices"},
    )
    assert folder_res.status_code == 201
    folder = folder_res.json()
    folder_id = folder["id"]
    assert folder["name"] == "Q1 2026 Core Infrastructure"

    # 2. List folders (read from DB)
    list_folders_res = client.get("/folders")
    assert list_folders_res.status_code == 200
    folder_ids = [f["id"] for f in list_folders_res.json()]
    assert folder_id in folder_ids

    # 3. Create a decision session (write to DB)
    session_res = client.post(
        "/sessions",
        json={
            "title": "PostgreSQL vs TiDB for Analytics",
            "objective": "Determine distributed database strategy for petabyte-scale event ingestion.",
            "folder_id": folder_id,
            "framework_type": "mcda",
        },
    )
    assert session_res.status_code == 201
    sess = session_res.json()
    session_id = sess["id"]

    # 4. Generate sample media with ffmpeg (write media & transcript to DB)
    media_res = client.post(f"/media/generate-sample/{session_id}")
    assert media_res.status_code == 201
    media = media_res.json()
    assert media["file_name"] == "sample_decision_meeting.wav"

    # 5. Check transcripts generated from media
    trans_res = client.get(f"/transcripts/session/{session_id}")
    assert trans_res.status_code == 200
    transcripts = trans_res.json()
    assert len(transcripts) >= 1
    assert transcripts[0]["word_count"] > 0

    # 6. Add stakeholder response
    resp_res = client.post(
        "/responses",
        json={
            "session_id": session_id,
            "question": "What is our hard latency threshold?",
            "answer": "P99 under 50ms across all read queries.",
            "speaker": "Engineering Director",
        },
    )
    assert resp_res.status_code == 201

    # 7. Run MCDA analysis (read from DB, synthesize, write analysis to DB)
    analysis_res = client.post(f"/analysis/generate/{session_id}?framework=mcda")
    assert analysis_res.status_code == 201
    analysis = analysis_res.json()
    assert analysis["framework"] == "mcda"
    assert len(analysis["matrix"]["ranked_alternatives"]) >= 1
    assert analysis["confidence_score"] > 0.8
