import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Decision, Folder, User, AnalysisSnapshot, RoadmapRecord
from app.services.recommendation import generate_mock_synthesis, run_decision_synthesis


@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user for synthesis tests."""
    email = "synth_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers(client: TestClient):
    """Register and login a separate user for cross-user tests."""
    email = "other_synth_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_user(db_session: Session, auth_headers: dict):
    return db_session.query(User).filter(User.email == "synth_user@decisionlens.ai").first()


@pytest.fixture
def test_folder(client: TestClient, auth_headers: dict, db_session: Session):
    folder_res = client.post(
        "/api/folders",
        json={"name": "Synthesis Workspace", "description": "Decision tests"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]
    return db_session.query(Folder).filter(Folder.id == fid).first()


def test_synthesis_decisive_recommendation_when_gaps_resolved(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    When all key gaps are resolved and solid facts exist, synthesis produces
    a decisive 'recommendation' with alternatives, evidence, and actionable roadmap.
    """
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Database Migration Architecture",
        problem_statement="Choose between Postgres and DynamoDB for high-throughput service.",
        points={
            "facts": [
                "Service requires ACID transactions across multi-table accounts.",
                "Estimated peak traffic is 15,000 queries per second.",
                "Existing team has 5 years of production PostgreSQL operational experience.",
            ],
            "assumptions": ["Storage volume will grow at 10% month-over-month."],
            "pros": ["PostgreSQL ACID support eliminates distributed inconsistency."],
            "cons": ["Manual sharding may be required past 50,000 QPS."],
            "unknowns": [],
        },
        points_reviewed=True,
        gaps={
            "gaps": [
                {
                    "gap_id": "gap-1",
                    "question": "What is the expected read vs write ratio?",
                    "importance": "high",
                    "status": "answered",
                    "user_answer": "80% reads, 20% writes.",
                }
            ]
        },
        research={
            "research": [
                {
                    "query": "PostgreSQL 16 connection pooling performance benchmarks",
                    "title": "PostgreSQL 16 High-Throughput Benchmarks",
                    "url": "https://pgbench.postgresql.org/reports/pg16-acid",
                    "claims": [
                        {
                            "claim_text": "PostgreSQL 16 sustains 25k QPS with connection pooling on standard instances.",
                            "source_title": "PostgreSQL 16 High-Throughput Benchmarks",
                            "source_url": "https://pgbench.postgresql.org/reports/pg16-acid",
                            "reliability_label": "high",
                        }
                    ],
                }
            ]
        },
        analysis={
            "decision_matrix": {
                "ranked_options": [
                    {"name": "PostgreSQL Cluster with PgBouncer", "score": 8.7, "rank": 1},
                    {"name": "Amazon DynamoDB Managed Service", "score": 7.1, "rank": 2},
                ]
            }
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"user_priorities": ["ACID compliance", "team expertise"], "force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["decision_id"] == decision.id
    assert data["synthesis_type"] == "recommendation"
    assert "PostgreSQL" in data["headline"]
    assert len(data["alternatives_considered"]) >= 2
    assert len(data["supporting_evidence"]) >= 2
    assert len(data["risks_and_mitigations"]) >= 1
    assert len(data["counterarguments"]) >= 1
    assert data["confidence_assessment"]["level"] == "high"
    assert data["confidence_assessment"]["score"] >= 0.8
    assert len(data["roadmap"]["phases"]) >= 3


def test_synthesis_conditional_next_step_when_critical_unknowns_remain(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    When critical or high-importance gaps remain unanswered or skipped,
    synthesis MUST NOT force an ungrounded decision; it must produce 'conditional_next_step'.
    """
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Enterprise CRM Vendor Procurement",
        problem_statement="Selecting enterprise CRM between Vendor Alpha and Vendor Beta.",
        points={
            "facts": ["Contract commitment is for 3 years."],
            "assumptions": ["Vendor Alpha API rate limits will be sufficient."],
            "pros": ["Vendor Alpha has modern UI."],
            "cons": ["High licensing costs."],
            "unknowns": ["Vendor Alpha SLA guarantees and data egress fees are completely unknown."],
        },
        points_reviewed=True,
        gaps={
            "gaps": [
                {
                    "gap_id": "gap-vendor-sla",
                    "question": "What is Vendor Alpha's guaranteed uptime SLA and penalty rebate?",
                    "importance": "critical",
                    "status": "unanswered",  # UNRESOLVED CRITICAL GAP!
                }
            ]
        },
        analysis={
            "decision_matrix": {
                "ranked_options": [
                    {"name": "Vendor Alpha Enterprise", "score": 8.0, "rank": 1},
                    {"name": "Vendor Beta Cloud", "score": 7.4, "rank": 2},
                ]
            }
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Must be conditional_next_step
    assert data["synthesis_type"] == "conditional_next_step"
    assert len(data["conditional_triggers"]) >= 1
    assert any("condition" in t.lower() or "trigger" in t.lower() for t in data["conditional_triggers"])
    assert data["confidence_assessment"]["level"] in ("medium", "low")
    assert any("unresolved" in lim.lower() for lim in data["confidence_assessment"]["limitations"])


def test_synthesis_never_invents_sources(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    Supporting evidence citations MUST only reference real research claims or user-reported facts.
    Never invent fake URLs or external citations.
    """
    verified_url = "https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final"
    verified_title = "NIST SP 800-53 Rev. 5 Security Controls"
    verified_claim = "FedRAMP High requires multi-factor cryptographic hardware tokens."

    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Compliance Authentication Standards",
        problem_statement="Implementing authentication for federal government integration.",
        points={"facts": ["Authentication system must achieve FedRAMP compliance."]},
        gaps={"gaps": []},
        research={
            "research": [
                {
                    "query": "NIST SP 800-53 hardware token requirement",
                    "title": verified_title,
                    "url": verified_url,
                    "claims": [
                        {
                            "claim_text": verified_claim,
                            "source_title": verified_title,
                            "source_url": verified_url,
                            "reliability_label": "high",
                        }
                    ],
                }
            ]
        },
        analysis={},
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    evidence = data["supporting_evidence"]
    assert len(evidence) >= 1

    # Check that any research claim citation matches the actual verified research
    research_evidence = [e for e in evidence if e["evidence_type"] == "research_claim"]
    assert len(research_evidence) >= 1
    for r_ev in research_evidence:
        assert r_ev["source_url"] == verified_url
        assert r_ev["source_title"] == verified_title
        assert r_ev["claim"] == verified_claim


def test_synthesis_never_invents_probabilities(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    When Decision Tree has no deterministic probabilities, synthesis explicitly
    acknowledges the absence of probabilities in limitations and never guesses them.
    """
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Market Expansion Choice",
        problem_statement="Choose between opening London office or Tokyo office.",
        points={"facts": ["Budget is $500,000 for year 1 expansion."]},
        gaps={"gaps": []},
        analysis={
            "decision_tree": {
                "has_deterministic_probabilities": False,
                "probabilities_note": "Probabilities were not documented and were strictly not invented.",
            }
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    limitations = data["confidence_assessment"]["limitations"]
    assert any("probabilities" in lim.lower() and "not fabricated" in lim.lower() for lim in limitations)


def test_synthesis_immutable_snapshots_and_version_preservation(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    Repeated syntheses create new version snapshots while strictly preserving
    prior analysis snapshots without mutation.
    """
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Cloud Storage Provider Evaluation",
        problem_statement="Selecting primary object storage tier.",
        points={"facts": ["Data retention policy is 7 years."]},
        gaps={"gaps": []},
        analysis={},
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # First synthesis -> Snapshot Version 1
    resp1 = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"user_priorities": ["lowest egress cost"], "force_mock": True},
        headers=auth_headers,
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["version"] == 1

    # Second synthesis -> Snapshot Version 2
    resp2 = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"user_priorities": ["highest availability"], "force_mock": True},
        headers=auth_headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["version"] == 2

    # Query snapshots list
    snapshots_resp = client.get(
        f"/api/decisions/{decision.id}/synthesis/snapshots",
        headers=auth_headers,
    )
    assert snapshots_resp.status_code == 200
    snapshots = snapshots_resp.json()
    assert len(snapshots) == 2
    assert snapshots[0]["version"] == 2  # Newest first
    assert snapshots[1]["version"] == 1

    # Retrieve snapshot 1 detail directly
    snap1_id = snapshots[1]["id"]
    snap1_detail_resp = client.get(
        f"/api/decisions/{decision.id}/synthesis/snapshots/{snap1_id}",
        headers=auth_headers,
    )
    assert snap1_detail_resp.status_code == 200
    snap1_detail = snap1_detail_resp.json()
    assert snap1_detail["version"] == 1
    assert snap1_detail["user_priorities"] == ["lowest egress cost"]


def test_roadmap_editing_preserves_prior_analysis_snapshots(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    Editing the active roadmap (marking task done, adding a task, modifying phases)
    updates the active roadmap while leaving historical snapshots completely untouched.
    """
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Frontend Architecture Modernization",
        problem_statement="Transitioning legacy client to Next.js.",
        points={"facts": ["Target deployment is serverless container."]},
        gaps={"gaps": []},
        analysis={},
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # Initial synthesis creates snapshot v1 and active roadmap v1
    synth_resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert synth_resp.status_code == 200
    synth_data = synth_resp.json()
    orig_roadmap = synth_data["roadmap"]
    orig_task_count = len(orig_roadmap["phases"][0]["tasks"])

    import copy
    # User modifies roadmap: marks task complete and adds custom task
    modified_phases = copy.deepcopy(orig_roadmap["phases"])
    modified_phases[0]["tasks"][0]["is_completed"] = True
    modified_phases[0]["tasks"].append(
        {
            "task_id": "custom-task-99",
            "title": "Custom User Milestone: Executive Signoff Meeting",
            "description": "Present prototype to VP of Engineering.",
            "owner_role": "Project Manager",
            "timeline": "Week 1 Friday",
            "dependencies": [],
            "success_criteria": "Written approval obtained.",
            "is_completed": False,
        }
    )

    update_resp = client.put(
        f"/api/decisions/{decision.id}/roadmap",
        json={
            "title": "Customized Next.js Migration Roadmap",
            "phases": modified_phases,
        },
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    updated_roadmap = update_resp.json()
    assert updated_roadmap["title"] == "Customized Next.js Migration Roadmap"
    assert updated_roadmap["phases"][0]["tasks"][0]["is_completed"] is True
    assert len(updated_roadmap["phases"][0]["tasks"]) == orig_task_count + 1

    # Fetch active roadmap via GET
    get_roadmap_resp = client.get(
        f"/api/decisions/{decision.id}/roadmap",
        headers=auth_headers,
    )
    assert get_roadmap_resp.status_code == 200
    assert get_roadmap_resp.json()["title"] == "Customized Next.js Migration Roadmap"

    # CRITICAL: Verify the historical analysis snapshot was NOT mutated!
    snapshots_resp = client.get(
        f"/api/decisions/{decision.id}/synthesis/snapshots",
        headers=auth_headers,
    )
    snap_id = snapshots_resp.json()[0]["id"]
    snap_detail = client.get(
        f"/api/decisions/{decision.id}/synthesis/snapshots/{snap_id}",
        headers=auth_headers,
    ).json()

    # In the immutable snapshot, the original task is still incomplete and the custom task does not exist
    snapshot_tasks = snap_detail["recommendation"]["roadmap"]["phases"][0]["tasks"]
    assert snapshot_tasks[0]["is_completed"] is False
    assert not any(t["task_id"] == "custom-task-99" for t in snapshot_tasks)


def test_synthesis_cross_user_isolation(
    client: TestClient,
    auth_headers: dict,
    test_user: User,
    test_folder: Folder,
    other_auth_headers: dict,
    db_session: Session,
):
    """Ensure User B cannot view or modify User A's synthesis, snapshots, or roadmap (404 anti-enumeration)."""
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="User A Secret Strategy",
        problem_statement="Confidential operational plan.",
        points={"facts": ["Classified organizational metrics."]},
        gaps={"gaps": []},
        analysis={},
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # User A creates synthesis
    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # User B attempts to access User A's synthesis -> 404 (prevent metadata leakage)
    res_b_synth = client.get(f"/api/decisions/{decision.id}/synthesis", headers=other_auth_headers)
    assert res_b_synth.status_code == 404

    # User B attempts to list snapshots -> 404
    res_b_snaps = client.get(f"/api/decisions/{decision.id}/synthesis/snapshots", headers=other_auth_headers)
    assert res_b_snaps.status_code == 404

    # User B attempts to get roadmap -> 404
    res_b_road = client.get(f"/api/decisions/{decision.id}/roadmap", headers=other_auth_headers)
    assert res_b_road.status_code == 404

    # User B attempts to edit roadmap -> 404
    res_b_edit = client.put(
        f"/api/decisions/{decision.id}/roadmap",
        json={"title": "Hacked Title", "phases": []},
        headers=other_auth_headers,
    )
    assert res_b_edit.status_code == 404


def test_executive_sovereign_override_and_revert(
    client: TestClient,
    auth_headers: dict,
    test_user: User,
    test_folder: Folder,
    db_session: Session,
):
    """
    Verify leadership can execute a sovereign override on the AI synthesis winner,
    and subsequently revert back to the AI recommendation.
    """
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Streaming vs Batch Pipeline",
        problem_statement="Choose Kafka vs Batch Processing for financial events.",
        points={"facts": ["Transactions arrive at 5k/sec."]},
        gaps={"gaps": []},
        analysis={},
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # 1. Generate synthesis
    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    original_headline = resp.json()["headline"]

    # 2. Executive overrides with a strategic choice
    override_payload = {
        "overridden_winner": "Option B: Managed Kafka Cluster",
        "reason": "Executive board mandate for sub-second audit log replication.",
        "revert_to_ai": False,
    }
    override_resp = client.put(
        f"/api/decisions/{decision.id}/synthesis/override",
        json=override_payload,
        headers=auth_headers,
    )
    assert override_resp.status_code == 200
    synth_data = override_resp.json()
    assert "Option B: Managed Kafka Cluster" in synth_data["headline"]
    assert synth_data["override"] is not None
    assert synth_data["override"]["overridden_winner"] == "Option B: Managed Kafka Cluster"
    assert "Executive board mandate" in synth_data["override"]["reason"]

    # 3. Verify persistence on GET
    get_resp = client.get(
        f"/api/decisions/{decision.id}/synthesis",
        headers=auth_headers,
    )
    assert get_resp.status_code == 200
    persisted = get_resp.json()
    assert "Option B: Managed Kafka Cluster" in persisted["headline"]
    assert persisted["override"] is not None

    # 4. Revert override back to AI recommendation
    revert_payload = {
        "revert_to_ai": True,
    }
    revert_resp = client.put(
        f"/api/decisions/{decision.id}/synthesis/override",
        json=revert_payload,
        headers=auth_headers,
    )
    assert revert_resp.status_code == 200
    reverted = revert_resp.json()
    assert reverted["override"] is None
    assert "Executive Mandate: Proceed with" in reverted["headline"]


def test_synthesis_blunder_shield_and_report_alignment(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    Verify prompt, synthesis response, and final report generators (Markdown, PDF, LaTeX)
    are 100% aligned with Blunder Shield metrics and MADR architectural governance.
    """
    from app.services.report_generator import (
        generate_decision_markdown_report,
        generate_decision_interactive_pdf,
        generate_decision_latex_report,
    )

    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Production Microservices Migration",
        problem_statement="Evaluate migration from modular monolith to microservices under high load.",
        domain="SOFTWARE",
        points={
            "facts": ["Modular monolith currently processes 12,000 requests/sec."],
            "assumptions": ["Traffic may double in 12 months."],
            "pros": ["Modular monolith is maintainable with low team overhead."],
            "cons": ["Potential shared database bottleneck at 3x scale."],
            "unknowns": [],
        },
        points_reviewed=True,
        gaps={"gaps": []},
        analysis={
            "decision_matrix": {
                "results": [
                    {"option_name": "Optimized Modular Monolith", "option_id": "OPT_001", "weighted_score": 8.7, "rank": 1},
                    {"option_name": "Full Microservices Rewrite", "option_id": "OPT_002", "weighted_score": 6.2, "rank": 2},
                ]
            }
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # 1. Generate synthesis via API
    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    synth_data = resp.json()

    # Verify BlunderShield is present and epistemically computed
    shield = synth_data.get("blunder_shield")
    assert shield is not None, "blunder_shield must be populated in DecisionSynthesis"
    assert "₹" in shield["capital_at_risk_saved"], "Capital at risk must have currency metric"
    assert "Sprints" in shield["developer_sprints_saved"], "Velocity must specify sprints saved"
    assert "Full Microservices Rewrite" in shield["prevented_fatal_trap"] or "Premature" in shield["prevented_fatal_trap"]
    assert len(shield["risk_reduction_rationale"]) > 10

    # Refresh decision from DB
    db_session.refresh(decision)

    # 2. Markdown Report verification
    md_report = generate_decision_markdown_report(decision)
    assert "### 🛡️ Capital at Risk & Blunder Shield" in md_report
    assert "Capital at Risk Prevented" in md_report
    assert shield["capital_at_risk_saved"] in md_report
    assert "### 📜 Architectural Decision Record (Git-Native MADR Standard)" in md_report
    assert f"ADR-{decision.id:04d}" in md_report

    # 3. Interactive PDF verification
    pdf_bytes = generate_decision_interactive_pdf(decision)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 2000
    assert pdf_bytes.startswith(b"%PDF")

    # 4. LaTeX Report verification
    latex_report = generate_decision_latex_report(decision)
    assert "Capital at Risk \\& Blunder Shield Protection" in latex_report
    assert f"ADR-{decision.id:04d}" in latex_report


def test_cloud_migration_receipt_vs_services_archetype(
    client: TestClient, auth_headers: dict, test_user: User, test_folder: Folder, db_session: Session
):
    """
    Verify that an Azure vs AWS decision generates a CLOUD_MIGRATION receipt
    with cloud-specific line items (cutover run-rate, egress, RI shortfall, IAM retraining)
    instead of generic developer pod rewrite toil.
    """
    from app.services.recommendation import compute_blunder_shield
    from app.services.report_generator import generate_decision_markdown_report, generate_decision_interactive_pdf

    # 1. Test Cloud Migration Archetype (Azure vs AWS)
    cloud_shield = compute_blunder_shield(
        domain="SOFTWARE",
        top_option_name="AWS Cloud Native Architecture",
        runner_up_name="Azure Cloud Migration",
        decision_title="Cloud Platform Selection: AWS vs Azure",
        problem_statement="Choose between AWS and Microsoft Azure for high-throughput enterprise workloads with 50TB storage.",
        facts=["Current infrastructure runs on AWS with existing savings plans.", "Workload transfers 50TB across services."],
        decision_id=404,
    )
    assert cloud_shield.receipt is not None
    assert cloud_shield.receipt.decision_type == "CLOUD_MIGRATION"
    item_names = [item.item_name for item in cloud_shield.receipt.line_items]
    assert any("Dual-Cloud Cutover" in name for name in item_names)
    assert any("Egress" in name for name in item_names)
    assert any("Committed Use / RI" in name for name in item_names)
    assert any("Cloud IAM" in name for name in item_names)
    assert not any("Pod Payroll" in name for name in item_names), "Cloud migration must not report pod rewrite payroll"

    # 2. Test Build vs Buy Archetype (Auth0 vs Custom)
    bvb_shield = compute_blunder_shield(
        domain="PRODUCT",
        top_option_name="Managed Identity via Auth0",
        runner_up_name="Custom In-House Authentication",
        decision_title="Identity System: Build vs Buy (Auth0 vs In-House)",
        problem_statement="Decide whether to buy Auth0 enterprise plan or build custom in-house auth server.",
        facts=["Team has zero cryptography or OAuth2 compliance experts."],
        decision_id=505,
    )
    assert bvb_shield.receipt is not None
    assert bvb_shield.receipt.decision_type == "BUILD_VS_BUY"
    bvb_items = [item.item_name for item in bvb_shield.receipt.line_items]
    assert any("Enterprise Platform Tier" in name for name in bvb_items)
    assert any("Custom Maintenance Sprints" in name for name in bvb_items)

    # 3. Create full Decision record with Azure vs AWS and verify Markdown & PDF report receipts
    decision = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="AWS vs Azure Enterprise Cloud Migration",
        problem_statement="Select between AWS and Azure for core analytics and database hosting.",
        domain="SOFTWARE",
        points={
            "facts": ["Existing AWS savings plans expire in 9 months.", "Data egress tariffs must be controlled."],
            "unknowns": [],
        },
        points_reviewed=True,
        gaps={"gaps": []},
        analysis={
            "decision_matrix": {
                "results": [
                    {"option_name": "AWS Architecture", "option_id": "OPT_001", "weighted_score": 8.9, "rank": 1},
                    {"option_name": "Azure Migration", "option_id": "OPT_002", "weighted_score": 7.1, "rank": 2},
                ]
            }
        },
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    resp = client.post(
        f"/api/decisions/{decision.id}/synthesis",
        json={"force_mock": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    synth_json = resp.json()
    receipt = synth_json["blunder_shield"]["receipt"]
    assert receipt is not None
    assert receipt["decision_type"] == "CLOUD_MIGRATION"

    db_session.refresh(decision)
    md_report = generate_decision_markdown_report(decision)
    assert "Itemized FinOps Sunk-Cost Receipt" in md_report
    assert "Dual-Cloud Cutover Run-Rate Overlap" in md_report
    assert "Cross-Cloud Data Egress & Transfer Tariffs" in md_report

    pdf_bytes = generate_decision_interactive_pdf(decision)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 2000

