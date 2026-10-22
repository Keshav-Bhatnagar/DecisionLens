import io
import pytest
from fastapi.testclient import TestClient

from app.models import Attachment


def test_complete_decision_lens_end_to_end_lifecycle(client: TestClient):
    """
    Phase 11 End-to-End Integration Test:
    Covers the complete user journey through all intelligence modules:
      1. Register & Authenticate User
      2. Create Workspace / Folder
      3. Create Decision Record
      4. Ingestion: Upload Reference Document Attachment
      5. Ingestion: Record / Update Audio Transcript and Mark Reviewed
      6. Cognitive Structuring: 8-Category Extraction & Private Feedback + User Review
      7. Gap Resolution: Detect Gaps, Resolve via Ask Me, Resolve via Web Research
      8. Framework Analysis: 5 Thinking Frameworks (MCDA Matrix 100% Weights, SWOT, 6 Hats, 5 Whys, Decision Tree EV)
      9. Synthesis & Roadmap: Produce Recommendation, Grounded Evidence, Editable Roadmap
      10. Report Export: Export Markdown Brief, Export JSON, Save to Document Library Attachment
      11. Multi-Tenant Isolation: Ensure unauthorized users cannot access or export
    """

    # -------------------------------------------------------------
    # 1. User Registration & Authentication
    # -------------------------------------------------------------
    user_email = "executive_lead@decisionlens.ai"
    password = "SuperSecurePassword2026!"

    reg_res = client.post(
        "/api/auth/register",
        json={"email": user_email, "password": password},
    )
    assert reg_res.status_code in [200, 201], f"Registration failed: {reg_res.text}"
    user_data = reg_res.json()
    assert user_data["user"]["email"] == user_email if "user" in user_data else user_data["email"] == user_email

    login_res = client.post(
        "/api/auth/login",
        json={"email": user_email, "password": password},
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    me_res = client.get("/api/auth/me", headers=auth_headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == user_email

    # -------------------------------------------------------------
    # 2. Workspace / Folder Management
    # -------------------------------------------------------------
    folder_res = client.post(
        "/api/folders",
        json={
            "name": "Cloud Infrastructure 2026",
            "description": "Strategic database and hosting migration architecture",
            "color": "#4F46E5",
        },
        headers=auth_headers,
    )
    assert folder_res.status_code in [200, 201]
    folder_id = folder_res.json()["id"]

    folders_list = client.get("/api/folders", headers=auth_headers)
    assert folders_list.status_code == 200
    assert any(f["id"] == folder_id for f in folders_list.json())

    # -------------------------------------------------------------
    # 3. Decision Record Creation
    # -------------------------------------------------------------
    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": folder_id,
            "title": "Migrate Primary Database to Distributed Cloud Architecture",
            "problem_statement": "Evaluate whether to migrate from single-node PostgreSQL to AWS Aurora or Google Spanner to sustain 99.999% availability.",
            "description": "Peak shopping seasons have increased replica lag to over 45 seconds, risking checkout transaction consistency.",
            "record_type": "decision",
            "status": "evaluating",
            "language": "en",
        },
        headers=auth_headers,
    )
    assert dec_res.status_code in [200, 201]
    decision_id = dec_res.json()["id"]

    # -------------------------------------------------------------
    # 4. Ingestion: Reference Document Attachment & Text Extraction
    # -------------------------------------------------------------
    doc_content = (
        b"# Benchmarks 2026\n"
        b"Postgres cluster currently handles 12,000 writes/second.\n"
        b"Replication lag on peak load exceeds 45s.\n"
        b"Maximum allowable failover time is 30 seconds."
    )
    file_payload = {
        "file": ("database_benchmarks.md", io.BytesIO(doc_content), "text/markdown"),
    }
    upload_res = client.post(
        f"/api/decisions/{decision_id}/attachments",
        headers=auth_headers,
        files=file_payload,
    )
    assert upload_res.status_code in [200, 201], f"Upload failed: {upload_res.text}"
    att_data = upload_res.json()
    assert att_data["original_name"] == "database_benchmarks.md"
    assert "12,000 writes/second" in att_data["extracted_text"]

    attachments_res = client.get(f"/api/decisions/{decision_id}/attachments", headers=auth_headers)
    assert attachments_res.status_code == 200
    assert len(attachments_res.json()) >= 1

    # -------------------------------------------------------------
    # 5. Ingestion: Voice Recording Transcript Review
    # -------------------------------------------------------------
    transcript_text = (
        "During the architecture sync, the infrastructure lead stressed that cross-region failover "
        "must be fully automated. The VP of Finance stated our monthly infrastructure cap is $25k. "
        "The team feels enthusiastic about managed services, but fears migration downtime. "
        "We are assuming network latency between us-east and eu-west will remain below 80 milliseconds."
    )
    transcript_res = client.patch(
        f"/api/decisions/{decision_id}/transcription/transcript",
        headers=auth_headers,
        json={"transcript": transcript_text, "mark_reviewed": True},
    )
    assert transcript_res.status_code == 200
    assert transcript_res.json()["transcript_reviewed"] is True
    assert transcript_res.json()["transcript"] == transcript_text

    # -------------------------------------------------------------
    # 6. Cognitive Structuring (8 Categories + Private Feedback)
    # -------------------------------------------------------------
    struct_res = client.post(
        f"/api/decisions/{decision_id}/structuring/analyze?force_mock=true",
        headers=auth_headers,
    )
    assert struct_res.status_code == 200
    findings = struct_res.json()["findings"]

    for cat in ["facts", "assumptions", "feelings", "pros", "cons", "mixed_points", "contradictions", "unknowns"]:
        assert cat in findings
        assert isinstance(findings[cat], list)

    assert findings["private_feedback"] is not None
    assert "tone_observations" in findings["private_feedback"]
    assert "potential_biases" in findings["private_feedback"]

    # Explicit user review and modification of points
    review_res = client.patch(
        f"/api/decisions/{decision_id}/structuring",
        headers=auth_headers,
        json={
            "facts": [
                "Postgres cluster currently handles 12,000 writes/second.",
                "Peak replication lag exceeds 45 seconds.",
                "Monthly infrastructure cloud budget is capped at $25,000."
            ],
            "assumptions": [
                "Network latency between us-east and eu-west will remain below 80ms."
            ],
            "unknowns": [
                "Exact pricing tier for multi-region active-active distributed clusters.",
                "Real-world data migration cutover window required for 5TB database."
            ],
            "mark_reviewed": True,
        },
    )
    assert review_res.status_code == 200
    assert review_res.json()["points_reviewed"] is True

    # -------------------------------------------------------------
    # 7. Information Gap Detection & Dual Resolution (Ask Me & Research)
    # -------------------------------------------------------------
    gaps_detect_res = client.post(
        f"/api/decisions/{decision_id}/gaps/detect?force_mock=true",
        headers=auth_headers,
    )
    assert gaps_detect_res.status_code == 200
    gaps_list = gaps_detect_res.json()["gaps"]
    assert len(gaps_list) >= 2

    # Identify or configure gaps for dual route resolution
    gap_ask = gaps_list[0]
    gap_research = gaps_list[1]

    # Resolve Gap 1 via "Ask Me"
    ask_answer_res = client.post(
        f"/api/decisions/{decision_id}/gaps/{gap_ask['id']}/answer",
        headers=auth_headers,
        json={"answer": "The database cutover window is approved for a maximum of 4 hours on Saturday night."},
    )
    assert ask_answer_res.status_code == 200
    assert ask_answer_res.json()["status"] in ["answered", "resolved"]

    # Resolve Gap 2 via "Research This" (with mock provider)
    research_exec_res = client.post(
        f"/api/decisions/{decision_id}/gaps/{gap_research['id']}/research/execute?force_mock=true",
        headers=auth_headers,
    )
    assert research_exec_res.status_code == 200
    research_data = research_exec_res.json()
    assert research_data["updated_gap"]["status"] == "researched"
    assert "finding" in research_data
    assert len(research_data["finding"]["sources"]) > 0
    assert len(research_data["finding"]["claims"]) > 0

    # -------------------------------------------------------------
    # 8. Thinking Frameworks Analysis (5 Frameworks + Deterministic MCDA)
    # -------------------------------------------------------------
    analysis_res = client.post(
        f"/api/decisions/{decision_id}/analysis",
        headers=auth_headers,
        json={"force_mock": True},
    )
    assert analysis_res.status_code == 200
    analysis_data = analysis_res.json()

    assert analysis_data["decision_matrix"] is not None
    assert analysis_data["decision_matrix"]["applicable"] is True
    matrix = analysis_data["decision_matrix"]
    assert abs(sum(c["weight"] for c in matrix["criteria"]) - 100.0) < 0.1
    assert analysis_data["six_hats"] is not None
    assert analysis_data["swot"] is not None
    assert analysis_data["five_whys"] is not None
    assert analysis_data["decision_tree"] is not None

    # Verify deterministic calculation of ranked matrix
    matrix_res = client.post(
        f"/api/decisions/{decision_id}/analysis/matrix/evaluate",
        headers=auth_headers,
        json={
            "scale_max": 10.0,
            "criteria": [
                {"id": "crit_perf", "name": "Write Throughput & Latency", "weight": 50.0},
                {"id": "crit_cost", "name": "Monthly Infrastructure Cost", "weight": 50.0},
            ],
            "options": [
                {"id": "opt_aurora", "name": "AWS Aurora Multi-Region"},
                {"id": "opt_spanner", "name": "Google Cloud Spanner"},
            ],
            "ratings": [
                {"option_id": "opt_aurora", "criterion_id": "crit_perf", "rating": 8.0},
                {"option_id": "opt_aurora", "criterion_id": "crit_cost", "rating": 8.0},
                {"option_id": "opt_spanner", "criterion_id": "crit_perf", "rating": 9.0},
                {"option_id": "opt_spanner", "criterion_id": "crit_cost", "rating": 6.0},
            ],
        },
    )
    assert matrix_res.status_code == 200
    m_calc = matrix_res.json()
    assert m_calc["valid"] is True
    assert m_calc["total_weight"] == 100.0
    assert len(m_calc["results"]) == 2

    # -------------------------------------------------------------
    # 9. Final Decision Synthesis & Actionable Roadmap
    # -------------------------------------------------------------
    synth_res = client.post(
        f"/api/decisions/{decision_id}/synthesis",
        headers=auth_headers,
        json={"force_mock": True},
    )
    assert synth_res.status_code == 200
    synthesis = synth_res.json()
    assert "headline" in synthesis
    assert "synthesis_type" in synthesis
    assert len(synthesis["alternatives_considered"]) > 0
    assert "roadmap" in synthesis
    assert len(synthesis["roadmap"]["phases"]) > 0

    # User modifies / updates the active roadmap
    current_phases = synthesis["roadmap"]["phases"]
    current_phases[0]["phase_name"] = "Phase 1: Proof of Concept & Benchmark Validation"
    roadmap_res = client.put(
        f"/api/decisions/{decision_id}/roadmap",
        headers=auth_headers,
        json={"title": "Custom Migration Implementation Plan", "phases": current_phases},
    )
    assert roadmap_res.status_code == 200
    assert roadmap_res.json()["title"] == "Custom Migration Implementation Plan"

    # -------------------------------------------------------------
    # 10. Complete Report Export (Markdown, JSON & Attachment Save)
    # -------------------------------------------------------------
    # 10a. Markdown Export
    export_md_res = client.get(
        f"/api/decisions/{decision_id}/export?format=markdown",
        headers=auth_headers,
    )
    assert export_md_res.status_code == 200
    md_data = export_md_res.json()
    assert md_data["decision_id"] == decision_id
    assert md_data["format"] == "markdown"
    assert "Migrate Primary Database to Distributed Cloud Architecture" in md_data["content"]
    assert "## 5. Executive Recommendation & Final Decision Synthesis" in md_data["content"]
    assert "## 6. Actionable Implementation Roadmap" in md_data["content"]
    assert "12,000 writes/second" in md_data["content"]

    # 10b. JSON Export
    export_json_res = client.get(
        f"/api/decisions/{decision_id}/export?format=json",
        headers=auth_headers,
    )
    assert export_json_res.status_code == 200
    json_data = export_json_res.json()
    assert json_data["decision_id"] == decision_id
    assert json_data["title"] == "Migrate Primary Database to Distributed Cloud Architecture"
    assert "structured_findings" in json_data
    assert "framework_analysis" in json_data
    assert "final_synthesis" in json_data
    assert "active_roadmap" in json_data
    assert "exported_at" in json_data

    # 10c. Save Report to Document Library (creates Attachment record)
    save_report_res = client.post(
        f"/api/decisions/{decision_id}/export/save",
        headers=auth_headers,
    )
    assert save_report_res.status_code == 200
    saved_info = save_report_res.json()
    assert saved_info["attachment_id"] is not None
    assert "saved" in saved_info["message"].lower()
    assert saved_info["filename"].endswith(".md")
    assert saved_info["file_size"] > 0

    # Confirm saved brief appears in the decision's attachment library
    final_attachments_res = client.get(
        f"/api/decisions/{decision_id}/attachments",
        headers=auth_headers,
    )
    assert final_attachments_res.status_code == 200
    att_list = final_attachments_res.json()
    assert any(a["id"] == saved_info["attachment_id"] for a in att_list)

    # -------------------------------------------------------------
    # 11. Multi-Tenant Security & Isolation
    # -------------------------------------------------------------
    other_email = "attacker@rivalcorp.ai"
    client.post("/api/auth/register", json={"email": other_email, "password": password})
    other_login = client.post("/api/auth/login", json={"email": other_email, "password": password})
    other_token = other_login.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # Other user must receive 404 when accessing decision, report export, or saving report
    assert client.get(f"/api/decisions/{decision_id}", headers=other_headers).status_code == 404
    assert client.get(f"/api/decisions/{decision_id}/export", headers=other_headers).status_code == 404
    assert client.post(f"/api/decisions/{decision_id}/export/save", headers=other_headers).status_code == 404
