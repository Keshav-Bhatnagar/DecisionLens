import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.models import Folder, Decision, User
from app.services.folder_context import (
    get_folder_precedents,
    format_folder_precedents_for_prompt,
)
from app.services.structuring import assemble_decision_input_context
from app.services.recommendation import run_decision_synthesis


def test_folder_precedents_extraction_and_assembly(db_session: Session, registered_user: dict):
    user_id = registered_user["user"].id

    # 1. Create a Folder
    folder = Folder(name="Cloud Migration Project", owner_id=user_id)
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)

    now = datetime.now(timezone.utc)

    # 2. Create Meeting 1 in this folder (older)
    meeting_1 = Decision(
        owner_id=user_id,
        folder_id=folder.id,
        title="Meeting 1: Architecture Inception",
        record_type="meeting",
        problem_statement="Determine primary database engine for scale",
        points={
            "facts": [
                "PostgreSQL 17 supports pgvector for embeddings",
                "Supabase provides automated PITR backups",
            ],
            "unknowns": [
                "What is the expected writes/second peak volume?",
            ],
        },
        gaps={
            "gaps": [
                {
                    "id": "gap_1",
                    "question": "What is the expected maintenance window?",
                    "status": "answered",
                    "answer": "Sundays 02:00 to 04:00 UTC",
                }
            ]
        },
        recommendation={
            "headline": "Adopt PostgreSQL 17 on Supabase",
            "recommendation_text": "Proceed with Supabase PostgreSQL as the primary transactional datastore.",
        },
        analysis={
            "canonical_result": {
                "winner_option_name": "Supabase PostgreSQL",
            }
        },
        roadmap={
            "phases": [
                {"phase_name": "Phase 1: Schema Inception"},
                {"phase_name": "Phase 2: Data Cutover"},
            ]
        },
        created_at=now - timedelta(hours=2),
    )
    db_session.add(meeting_1)
    db_session.commit()
    db_session.refresh(meeting_1)

    # 3. Create Meeting 2 in the same folder (newer)
    meeting_2 = Decision(
        owner_id=user_id,
        folder_id=folder.id,
        title="Meeting 2: Database Cutover Plan",
        record_type="meeting",
        problem_statement="Plan execution schedule and zero-downtime replication strategy",
        created_at=now,
    )
    db_session.add(meeting_2)
    db_session.commit()
    db_session.refresh(meeting_2)

    # Test get_folder_precedents
    precedents = get_folder_precedents(meeting_2, db_session)
    assert len(precedents) == 1
    p1 = precedents[0]
    assert p1["id"] == meeting_1.id
    assert p1["title"] == "Meeting 1: Architecture Inception"
    assert "PostgreSQL 17 supports pgvector for embeddings" in p1["established_facts"]
    assert p1["verdict_headline"] == "Adopt PostgreSQL 17 on Supabase"
    assert len(p1["answered_gaps"]) == 1
    assert p1["answered_gaps"][0]["answer"] == "Sundays 02:00 to 04:00 UTC"

    # Test prompt formatting
    formatted_text = format_folder_precedents_for_prompt(precedents)
    assert "PRIOR FOLDER CONTEXT & ORGANIZATIONAL MEMORY" in formatted_text
    assert "Meeting 1: Architecture Inception" in formatted_text
    assert "Supabase PostgreSQL" in formatted_text

    # Test assemble_decision_input_context inherits memory
    raw_context, source_summary = assemble_decision_input_context(meeting_2, db=db_session)
    assert "Folder Memory (1 Prior Record)" in source_summary
    assert "PRIOR FOLDER CONTEXT & ORGANIZATIONAL MEMORY" in raw_context
    assert "PostgreSQL 17 supports pgvector" in raw_context


def test_folder_precedents_multi_tenant_isolation(db_session: Session, registered_user: dict):
    user_id = registered_user["user"].id

    # Create Folder 1 for user 1
    folder1 = Folder(name="Confidential Mergers", owner_id=user_id)
    db_session.add(folder1)
    db_session.commit()
    db_session.refresh(folder1)

    # Create User 2 and Folder 2
    user2 = User(email="otheruser@example.com", password_hash="secret")
    db_session.add(user2)
    db_session.commit()
    db_session.refresh(user2)

    folder2 = Folder(name="Other User Folder", owner_id=user2.id)
    db_session.add(folder2)
    db_session.commit()
    db_session.refresh(folder2)

    # Decision by User 2 in Folder 2
    d_user2 = Decision(
        owner_id=user2.id,
        folder_id=folder2.id,
        title="User 2 Secret Project",
        record_type="decision",
        points={"facts": ["Super Secret Fact"]},
    )
    db_session.add(d_user2)
    db_session.commit()

    # Decision by User 1 in Folder 1
    d_user1 = Decision(
        owner_id=user_id,
        folder_id=folder1.id,
        title="User 1 Decision",
        record_type="decision",
    )
    db_session.add(d_user1)
    db_session.commit()
    db_session.refresh(d_user1)

    # Precedents for User 1 must NOT see User 2's data
    precedents = get_folder_precedents(d_user1, db_session)
    assert len(precedents) == 0

    _, source_summary = assemble_decision_input_context(d_user1, db=db_session)
    assert "Folder Memory" not in source_summary


def test_synthesis_incorporates_folder_continuity(db_session: Session, registered_user: dict):
    user_id = registered_user["user"].id

    folder = Folder(name="Project Continuity", owner_id=user_id)
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)

    now = datetime.now(timezone.utc)

    # Meeting 1
    meeting_1 = Decision(
        owner_id=user_id,
        folder_id=folder.id,
        title="Session Alpha",
        record_type="meeting",
        problem_statement="Evaluate cloud providers",
        recommendation={
            "headline": "Proceed with Hybrid Cloud Strategy",
            "recommendation_text": "Hybrid cloud balances latency and compliance requirements.",
        },
        analysis={
            "canonical_result": {
                "winner_option_name": "Hybrid Cloud",
            }
        },
        created_at=now - timedelta(hours=1),
    )
    db_session.add(meeting_1)
    db_session.commit()

    # Meeting 2
    meeting_2 = Decision(
        owner_id=user_id,
        folder_id=folder.id,
        title="Session Beta: Vendor Contracts",
        record_type="meeting",
        problem_statement="Select hardware vendors for hybrid deployment",
        points={
            "facts": ["Vendor A offers 99.99% uptime guarantee."],
        },
        analysis={
            "decision_matrix": {
                "ranked_options": [
                    {"name": "Vendor A", "id": "OPT_001", "score": 8.5, "rank": 1},
                    {"name": "Vendor B", "id": "OPT_002", "score": 7.0, "rank": 2},
                ]
            }
        },
        created_at=now,
    )
    db_session.add(meeting_2)
    db_session.commit()
    db_session.refresh(meeting_2)

    # Run synthesis on Meeting 2
    synthesis = run_decision_synthesis(meeting_2, db=db_session, force_mock=True)

    # Verify continuity note is present in recommendation
    assert "Session Alpha" in synthesis.recommendation_text or "prior folder" in synthesis.recommendation_text.lower()

    # Verify supporting evidence includes prior folder record milestone
    evidence_claims = [e.claim for e in synthesis.supporting_evidence]
    evidence_sources = [e.source_title for e in synthesis.supporting_evidence]
    assert any("Session Alpha" in s for s in evidence_sources)
