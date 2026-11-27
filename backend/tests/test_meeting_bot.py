import pytest
from app.models import Decision, Folder, GoogleMeetBotSession, MeetingPrivateInput, User
from app.services.meeting_bot import (
    add_private_chat_message,
    create_or_join_bot_session,
    finish_bot_session_and_analyze,
    ingest_speech_chunk,
    validate_google_meet_url,
)
from app.services.structuring import assemble_decision_input_context


def test_validate_google_meet_url():
    valid_urls = [
        "https://meet.google.com/abc-defg-hij",
        "http://meet.google.com/abc-defg-hij",
        "meet.google.com/abc-defg-hij",
        "abc-defg-hij",
        "https://meet.google.com/xyz-uvwx-rst?authuser=0",
    ]
    for url in valid_urls:
        is_valid, norm_url, code = validate_google_meet_url(url)
        assert is_valid is True, f"Failed for {url}"
        assert "meet.google.com" in norm_url

    invalid_urls = [
        "",
        "https://zoom.us/j/123456789",
        "https://teams.microsoft.com/l/meetup-join/123",
        "just random text",
    ]
    for url in invalid_urls:
        is_valid, _, _ = validate_google_meet_url(url)
        assert is_valid is False, f"Should be invalid: {url}"


def test_create_and_join_bot_session(db_session, registered_user):
    user = registered_user["user"]
    folder = Folder(name="Cloud Projects", owner_id=user.id)
    db_session.add(folder)
    db_session.commit()

    decision = Decision(
        title="PostgreSQL vs DynamoDB",
        domain="SOFTWARE",
        owner_id=user.id,
        folder_id=folder.id,
    )
    db_session.add(decision)
    db_session.commit()

    session = create_or_join_bot_session(
        db=db_session,
        decision=decision,
        meet_url="https://meet.google.com/abc-defg-hij",
        bot_name="DecisionLens Tech Bot",
    )

    assert session.id is not None
    assert session.status == "active"
    assert session.meet_url == "https://meet.google.com/abc-defg-hij"
    assert session.bot_name == "DecisionLens Tech Bot"
    assert session.private_chat_token is not None
    assert len(session.private_chat_token) > 10


def test_speech_stream_and_distraction_filtering(db_session, registered_user):
    user = registered_user["user"]
    folder = Folder(name="Tech", owner_id=user.id)
    db_session.add(folder)
    db_session.commit()

    decision = Decision(
        title="Database Migration Architecture",
        problem_statement="Should we move from MySQL to Aurora PostgreSQL for our payments workload?",
        owner_id=user.id,
        folder_id=folder.id,
    )
    db_session.add(decision)
    db_session.commit()

    session = create_or_join_bot_session(
        db=db_session,
        decision=decision,
        meet_url="https://meet.google.com/xyz-uvwx-rst",
    )

    # Ingest speech chunks: technical discussion + tangents
    ingest_speech_chunk(db_session, session, "Hey team, anyone ordering pizza or burgers for lunch?", speaker="Dan (PM)")
    ingest_speech_chunk(db_session, session, "Can everyone hear me? Is my mic working?", speaker="Sarah (DevOps)")
    ingest_speech_chunk(db_session, session, "Aurora PostgreSQL supports 15 read replicas with under 10ms replication lag.", speaker="Alex (Architect)")
    ingest_speech_chunk(db_session, session, "The peak write throughput is 8,000 IOPS on our checkout ledger.", speaker="David (Backend)")

    assert "pizza or burgers" in session.raw_transcript
    assert "8,000 IOPS" in session.raw_transcript

    # Finish meeting and analyze
    res = finish_bot_session_and_analyze(db_session, decision, session, force_mock=True)

    assert res.session.status == "completed"
    assert res.tangents_filtered_count >= 1
    assert "pizza or burgers" not in res.transcript
    assert "Aurora PostgreSQL" in res.transcript
    assert decision.transcript == res.transcript


def test_private_chat_message_and_analysis_integration(db_session, registered_user):
    user = registered_user["user"]
    folder = Folder(name="Platform", owner_id=user.id)
    db_session.add(folder)
    db_session.commit()

    decision = Decision(
        title="Microservices Cutover",
        problem_statement="Moving monolithic backend to 12 microservices on AWS EKS.",
        owner_id=user.id,
        folder_id=folder.id,
    )
    db_session.add(decision)
    db_session.commit()

    session = create_or_join_bot_session(
        db=db_session,
        decision=decision,
        meet_url="https://meet.google.com/abc-defg-hij",
    )

    # Ingest public meeting speech
    ingest_speech_chunk(db_session, session, "We have full team consensus to break into 12 microservices immediately.", speaker="VP of Engineering")

    # Participant privately tells bot about an unspoken operational blocker
    private_msg = add_private_chat_message(
        db=db_session,
        decision=decision,
        session=session,
        message="The on-call rotation currently has only 2 engineers with Kubernetes operator experience. A 12-microservice cutover will cause extreme alert fatigue and downtime.",
        author_name="Anonymous SRE",
        author_role="DevOps / SRE",
        is_anonymous=True,
        category="concern",
        impact_level="critical",
        force_mock=True,
    )

    assert private_msg.id is not None
    assert "DecisionLens Bot" in private_msg.bot_response
    assert private_msg.category == "concern"

    # Verify assemble_decision_input_context includes the private inputs
    agg_text, sources = assemble_decision_input_context(decision, db=db_session)
    assert "CONFIDENTIAL PARTICIPANT INPUTS (PRIVATE BOT CHAT)" in agg_text
    assert "Kubernetes operator experience" in agg_text
    assert "Confidential Participant Input" in sources

    # Finish meeting and run structuring
    res = finish_bot_session_and_analyze(db_session, decision, session, force_mock=True)

    assert res.private_inputs_count == 1
    assert res.structured_findings is not None
    findings = res.structured_findings

    # Check that confidential participant concerns were factored into cons
    cons_text = " ".join(findings.cons)
    assert any("kubernetes operator experience" in c.lower() or "operational" in c.lower() for c in findings.cons)


def test_meeting_bot_api_endpoints(client, registered_user):
    auth_headers = {"Authorization": f"Bearer {registered_user['token']}"}
    # Create folder and decision
    folder_resp = client.post("/api/folders", json={"name": "API Meeting Tests"}, headers=auth_headers)
    assert folder_resp.status_code == 201
    folder_id = folder_resp.json()["id"]

    dec_resp = client.post(
        "/api/decisions",
        json={"title": "Cloudflare vs AWS CloudFront", "folder_id": folder_id, "domain": "SOFTWARE"},
        headers=auth_headers,
    )
    assert dec_resp.status_code == 201
    decision_id = dec_resp.json()["id"]

    # 1. Join Google Meet
    join_resp = client.post(
        f"/api/decisions/{decision_id}/bot/join-meet",
        json={
            "meet_url": "https://meet.google.com/top-meet-ing",
            "bot_name": "DecisionLens Scribe",
            "language": "en",
        },
        headers=auth_headers,
    )
    assert join_resp.status_code == 201
    session_data = join_resp.json()
    session_id = session_data["id"]
    token = session_data["private_chat_token"]
    assert session_data["status"] == "active"
    assert session_data["meet_url"] == "https://meet.google.com/top-meet-ing"

    # 2. Stream speech
    stream_resp = client.post(
        f"/api/decisions/{decision_id}/bot/sessions/{session_id}/speech-stream",
        json={
            "speaker": "Network Architect",
            "text": "Cloudflare Workers edge compute has lower cold-start latency than AWS Lambda@Edge.",
            "timestamp": "11:05",
        },
        headers=auth_headers,
    )
    assert stream_resp.status_code == 200
    assert "Cloudflare Workers" in stream_resp.json()["raw_transcript"]

    # 3. Public participant joins private chat using invite token (No auth required!)
    invite_info_resp = client.get(f"/api/bot/invite/{token}")
    assert invite_info_resp.status_code == 200
    assert invite_info_resp.json()["decision_title"] == "Cloudflare vs AWS CloudFront"

    # Public participant sends private message to bot
    public_chat_resp = client.post(
        f"/api/bot/invite/{token}/chat?force_mock=true",
        json={
            "message": "Enterprise plan pricing with Cloudflare requires an annual minimum commitment of $60,000.",
            "author_role": "FinOps / Finance",
            "category": "fact",
            "is_anonymous": True,
        },
    )
    assert public_chat_resp.status_code == 201
    assert "DecisionLens Bot" in public_chat_resp.json()["bot_response"]

    # 4. Check private chat history
    history_resp = client.get(f"/api/bot/invite/{token}/history")
    assert history_resp.status_code == 200
    assert len(history_resp.json()) == 1
    assert history_resp.json()[0]["author_role"] == "FinOps / Finance"

    # 5. Finish meeting & analyze
    finish_resp = client.post(
        f"/api/decisions/{decision_id}/bot/sessions/{session_id}/finish-and-analyze?force_mock=true",
        headers=auth_headers,
    )
    assert finish_resp.status_code == 200
    finish_data = finish_resp.json()
    assert finish_data["session"]["status"] == "completed"
    assert finish_data["private_inputs_count"] == 1
    assert "Cloudflare Workers" in finish_data["transcript"]
    assert finish_data["structured_findings"] is not None


def test_new_meeting_invite_closes_previous_and_late_chunk_keeps_completed(db_session, registered_user):
    user = registered_user["user"]
    folder = Folder(name="Infra", owner_id=user.id)
    db_session.add(folder)
    db_session.commit()

    decision = Decision(
        title="Redis vs Memcached",
        domain="SOFTWARE",
        owner_id=user.id,
        folder_id=folder.id,
    )
    db_session.add(decision)
    db_session.commit()

    s1 = create_or_join_bot_session(
        db=db_session,
        decision=decision,
        meet_url="https://meet.google.com/aaa-bbbb-ccc",
    )
    assert s1.status == "active"

    # Inviting bot to a different Meet URL must close s1 and create a fresh session
    s2 = create_or_join_bot_session(
        db=db_session,
        decision=decision,
        meet_url="https://meet.google.com/ddd-eeee-fff",
    )
    db_session.refresh(s1)
    assert s2.id != s1.id
    assert s1.status == "completed"
    assert s1.ended_at is not None
    assert s2.status == "active"
    assert s2.meet_url == "https://meet.google.com/ddd-eeee-fff"

    # Late audio chunk arriving after s1 is completed must NOT flip s1 back to active
    ingest_speech_chunk(db_session, s1, "Final buffered sentence", speaker="Host")
    db_session.refresh(s1)
    assert s1.status == "completed"
    assert "Final buffered sentence" in s1.raw_transcript


def test_meet_runner_trim_overlap():
    from app.services.meet_runner import MeetBotRunner

    prev = "Learn all about databases in this course designed to help you"
    nxt = "designed to help you understand the complexities of database architecture"
    trimmed = MeetBotRunner._trim_overlap(prev, nxt)
    assert trimmed == "understand the complexities of database architecture"

    # Non-overlapping sentence should remain untouched
    unrelated = "The storage engine manages pages on disk."
    assert MeetBotRunner._trim_overlap(prev, unrelated) == unrelated

    runner = MeetBotRunner(session_id=999, meet_url="https://meet.google.com/abc-defg-hij")
    assert runner.get_pending_stats() == (0, 0)
    assert runner.stop_event.is_set() is False


def test_force_new_session_on_same_meet_url_starts_clean_transcript(db_session, registered_user):
    user = registered_user["user"]
    folder = Folder(name="Infra 2", owner_id=user.id)
    db_session.add(folder)
    db_session.commit()

    decision = Decision(
        title="Kafka vs RabbitMQ",
        domain="SOFTWARE",
        owner_id=user.id,
        folder_id=folder.id,
    )
    db_session.add(decision)
    db_session.commit()

    s1 = create_or_join_bot_session(
        db=db_session,
        decision=decision,
        meet_url="https://meet.google.com/zzz-aaaa-bbb",
    )
    ingest_speech_chunk(db_session, s1, "Old disrupted meeting text", speaker="Host")
    assert "Old disrupted meeting text" in s1.raw_transcript

    # Re-inviting with force_new=True (even to the same URL) must close s1 and create a clean s2
    s2 = create_or_join_bot_session(
        db=db_session,
        decision=decision,
        meet_url="https://meet.google.com/zzz-aaaa-bbb",
        force_new=True,
    )
    db_session.refresh(s1)
    assert s2.id != s1.id
    assert s1.status == "completed"
    assert s2.status == "active"
    assert s2.raw_transcript == ""
