import pytest
from fastapi.testclient import TestClient

from app.models import Decision, Folder
from app.services.meeting_filter import (
    filter_meeting_distractions,
    _split_into_dialogue_segments,
    _heuristic_is_distraction,
)


def test_heuristic_is_distraction():
    # Tangents should be detected
    assert _heuristic_is_distraction("Hey what's for lunch today?") is not None
    assert _heuristic_is_distraction("Did anyone watch the cricket match yesterday?") is not None
    assert _heuristic_is_distraction("How was your weekend everyone?") is not None
    assert _heuristic_is_distraction("Can you hear me?") is not None
    assert _heuristic_is_distraction("haha") is not None

    # Technical statements must NOT be marked as distraction
    assert _heuristic_is_distraction("We need to decide whether to use PostgreSQL with PgBouncer or MongoDB.") is None
    assert _heuristic_is_distraction("The AWS RDS multi-AZ instance will cost $450 per month.") is None
    assert _heuristic_is_distraction("Our P99 latency SLA requirement is under 80 milliseconds.") is None
    assert _heuristic_is_distraction("Kafka partition count needs to be scaled to 16 for peak throughput.") is None


def test_split_into_dialogue_segments():
    text = (
        "Alice: We should evaluate AWS Aurora vs Google Cloud Spanner.\n"
        "Bob: What's the pricing difference for multi-region replication?\n"
        "Charlie: Did you guys order pizza for lunch?\n"
        "Alice: Aurora will cost approximately $600/month."
    )
    segments = _split_into_dialogue_segments(text)
    assert len(segments) == 4
    assert segments[0] == ("Alice", "We should evaluate AWS Aurora vs Google Cloud Spanner.")
    assert segments[2] == ("Charlie", "Did you guys order pizza for lunch?")


def test_filter_meeting_distractions_heuristics():
    raw_transcript = (
        "Alice: Hey team, good morning. Can you hear me?\n"
        "Bob: Yes, loud and clear. Did you see that football match last night?\n"
        "Alice: No, I didn't watch it. Let's focus on our microservices architecture.\n"
        "Bob: Right, our P99 latency SLA must be under 50ms for the payment gateway.\n"
        "Charlie: What's for lunch today? Should we get Thai food?\n"
        "Alice: We should deploy Redis cluster in front of PostgreSQL to cache customer sessions.\n"
        "Bob: Agreed, Redis will reduce our database CPU utilization from 85% to 20%."
    )

    res = filter_meeting_distractions(
        transcript=raw_transcript,
        decision_title="Payment Gateway Architecture & Database Cache",
        decision_context="Latency optimization and caching for payment processing",
        force_heuristics=True,
    )

    # Verify distractions were removed
    assert len(res.removed_tangents) >= 3
    removed_texts = [t["text"] for t in res.removed_tangents]
    assert any("football" in t for t in removed_texts)
    assert any("lunch" in t or "Thai" in t for t in removed_texts)

    # Verify critical technical decisions are strictly preserved
    assert "P99 latency SLA must be under 50ms" in res.cleaned_transcript
    assert "Redis cluster in front of PostgreSQL" in res.cleaned_transcript
    assert "database CPU utilization from 85% to 20%" in res.cleaned_transcript

    # Verify metrics
    assert res.signal_ratio < 1.0
    assert res.total_segments == 7
    assert res.kept_segments <= 4


def test_filter_meeting_distractions_pure_signal():
    pure_tech_transcript = (
        "Alice: We evaluated CockroachDB vs AWS Aurora PostgreSQL.\n"
        "Bob: Aurora provides lower write latency in a single region.\n"
        "Alice: Yes, but CockroachDB handles cross-region quorum writes natively."
    )
    res = filter_meeting_distractions(
        transcript=pure_tech_transcript,
        decision_title="Database Evaluation",
        force_heuristics=True,
    )
    assert len(res.removed_tangents) == 0
    assert res.signal_ratio == 1.0
    assert "CockroachDB" in res.cleaned_transcript
    assert "AWS Aurora" in res.cleaned_transcript


def test_filter_tangents_endpoint(client: TestClient, registered_user: dict, db_session):
    user = registered_user["user"]
    token = registered_user["token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    folder = Folder(
        owner_id=user.id,
        name="Architecture Sprints",
        description="Engineering architecture decisions",
    )
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)

    decision = Decision(
        owner_id=user.id,
        folder_id=folder.id,
        title="Worker Job Processing Architecture",
        problem_statement="Deciding between AWS Lambda vs Kubernetes for worker jobs",
        transcript=(
            "Sarah: Good morning everyone, can you hear me?\n"
            "John: Yes, loud and clear. Did you see that football match yesterday?\n"
            "Sarah: We need to decide between AWS Lambda and Kubernetes EKS for the worker jobs.\n"
            "John: Lambda will cost $120/mo but has cold start latencies of 1.5 seconds.\n"
            "Dave: What's for lunch today? Are we ordering pizza?\n"
            "Sarah: EKS has fixed cluster cost of $72/mo plus EC2 instances."
        ),
    )
    db_session.add(decision)
    db_session.commit()
    db_session.refresh(decision)

    # Call the filter-tangents endpoint
    res = client.post(
        f"/api/decisions/{decision.id}/transcription/filter-tangents?force_heuristics=true",
        headers=auth_headers,
    )

    assert res.status_code == 200
    data = res.json()
    assert data["decision_id"] == decision.id
    assert data["tangents_filtered_count"] >= 2
    assert data["signal_ratio"] < 1.0
    assert len(data["removed_tangents"]) >= 2

    # Check cleaned transcript kept tech points and dropped lunch/smalltalk
    filtered = data["filtered_transcript"]
    assert "AWS Lambda and Kubernetes EKS" in filtered
    assert "cold start latencies" in filtered
    assert "fixed cluster cost" in filtered
    assert "ordering pizza" not in filtered

    # Verify database persistence
    db_session.refresh(decision)
    assert decision.transcript == filtered
