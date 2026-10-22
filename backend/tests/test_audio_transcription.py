import io
import wave
import pytest
from fastapi.testclient import TestClient


def create_test_wav_bytes(duration_seconds: float = 0.5, sample_rate: int = 16000) -> bytes:
    """Generate a minimal valid 16kHz mono PCM WAV file in memory."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        num_frames = int(sample_rate * duration_seconds)
        wf.writeframes(b"\x00\x00" * num_frames)
    return buf.getvalue()


@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user, returning auth headers."""
    email = "audio_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def decision_id(client: TestClient, auth_headers: dict):
    """Create a folder and decision for testing."""
    folder_res = client.post(
        "/api/folders",
        json={"name": "Audio Workspace", "description": "Folder for voice testing"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]

    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": fid,
            "title": "Cloud Architecture Review",
            "problem_statement": "Evaluate multi-region setup",
            "language": "en",
        },
        headers=auth_headers,
    )
    return dec_res.json()["id"]


def test_audio_upload_and_transcription_english(client: TestClient, auth_headers: dict, decision_id: int):
    """Test uploading valid audio with English speech-to-text, FFmpeg normalization, and original storage."""
    wav_bytes = create_test_wav_bytes(duration_seconds=0.5)

    res = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "en", "apply_enhancement": "true", "force_mock": "true"},
        files={"file": ("meeting_notes.wav", wav_bytes, "audio/wav")},
    )

    assert res.status_code == 201
    data = res.json()
    assert data["language"] == "en"
    assert data["transcript_reviewed"] is False
    assert len(data["transcript"]) > 0
    assert "architectural" in data["transcript"].lower()
    assert data["audio_recording"] is not None
    assert data["audio_recording"]["original_filename"] == "meeting_notes.wav"

    # Verify decision is updated in database
    dec_check = client.get(f"/api/decisions/{decision_id}", headers=auth_headers).json()
    assert dec_check["transcript"] == data["transcript"]
    assert dec_check["language"] == "en"
    assert dec_check["transcript_reviewed"] is False
    assert "Voice Recording Transcript (EN)" in dec_check["raw_input"]


def test_audio_upload_and_transcription_hindi(client: TestClient, auth_headers: dict, decision_id: int):
    """Test uploading audio with Hindi language control."""
    wav_bytes = create_test_wav_bytes(duration_seconds=0.5)

    res = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "hi", "apply_enhancement": "true", "force_mock": "true"},
        files={"file": ("hindi_discussion.wav", wav_bytes, "audio/wav")},
    )

    assert res.status_code == 201
    data = res.json()
    assert data["language"] == "hi"
    assert data["transcript_reviewed"] is False
    assert "बैठक" in data["transcript"] or len(data["transcript"]) > 0


def test_audio_unsupported_language_rejection(client: TestClient, auth_headers: dict, decision_id: int):
    """DecisionLens strictly restricts transcription to English and Hindi. French, Spanish etc. must be rejected."""
    wav_bytes = create_test_wav_bytes(duration_seconds=0.5)

    res = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "fr", "force_mock": "true"},
        files={"file": ("french_test.wav", wav_bytes, "audio/wav")},
    )

    assert res.status_code == 400
    assert "Unsupported language" in res.json()["detail"]
    assert "English ('en') and Hindi ('hi')" in res.json()["detail"]


def test_audio_empty_file_rejection(client: TestClient, auth_headers: dict, decision_id: int):
    """Reject empty audio files (0 bytes)."""
    res = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "en", "force_mock": "true"},
        files={"file": ("empty.wav", b"", "audio/wav")},
    )

    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()


def test_audio_unsupported_extension_rejection(client: TestClient, auth_headers: dict, decision_id: int):
    """Reject non-audio file extensions."""
    res = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "en", "force_mock": "true"},
        files={"file": ("notes.txt", b"plain text is not audio", "text/plain")},
    )

    assert res.status_code == 400
    assert "Unsupported audio format" in res.json()["detail"]


def test_audio_size_limit_rejection(client: TestClient, auth_headers: dict, decision_id: int):
    """Reject audio files exceeding size limit (> 25MB)."""
    # 26MB dummy bytes
    huge_bytes = b"x" * (26 * 1024 * 1024)

    res = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "en", "force_mock": "true"},
        files={"file": ("huge_recording.wav", huge_bytes, "audio/wav")},
    )

    assert res.status_code == 413
    assert "exceeds the maximum allowed limit" in res.json()["detail"]


def test_retry_with_original_unenhanced_audio(client: TestClient, auth_headers: dict, decision_id: int):
    """Test the fallback/retry endpoint using unenhanced original audio."""
    wav_bytes = create_test_wav_bytes(duration_seconds=0.5)

    # 1. Upload audio with enhancement
    res_upload = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "en", "apply_enhancement": "true", "force_mock": "true"},
        files={"file": ("audio_enhance_test.wav", wav_bytes, "audio/wav")},
    )
    assert res_upload.status_code == 201

    # 2. Trigger retry with original audio
    res_retry = client.post(
        f"/api/decisions/{decision_id}/transcription/retry-original?force_mock=true",
        headers=auth_headers,
    )

    assert res_retry.status_code == 200
    data = res_retry.json()
    assert data["used_enhanced"] is False
    assert "original audio" in data["message"].lower()
    assert len(data["transcript"]) > 0


def test_transcript_editing_and_explicit_review(client: TestClient, auth_headers: dict, decision_id: int):
    """Test editing transcript and marking it as explicitly reviewed."""
    edited_text = (
        "We finalized that our multi-cloud deployment will adopt Kubernetes with automated failover. "
        "All team leads approved this architectural milestone."
    )

    patch_res = client.patch(
        f"/api/decisions/{decision_id}/transcription/transcript",
        headers=auth_headers,
        json={"transcript": edited_text, "mark_reviewed": True},
    )

    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["transcript"] == edited_text
    assert data["transcript_reviewed"] is True

    # Verify persistent state in decision
    dec = client.get(f"/api/decisions/{decision_id}", headers=auth_headers).json()
    assert dec["transcript"] == edited_text
    assert dec["transcript_reviewed"] is True
    assert "Reviewed Voice Transcript" in dec["raw_input"]


def test_audio_streaming(client: TestClient, auth_headers: dict, decision_id: int):
    """Test streaming the stored audio file."""
    wav_bytes = create_test_wav_bytes(duration_seconds=0.5)

    res_upload = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=auth_headers,
        data={"language": "en", "force_mock": "true"},
        files={"file": ("stream_test.wav", wav_bytes, "audio/wav")},
    )
    audio_id = res_upload.json()["audio_id"]

    stream_res = client.get(
        f"/api/decisions/{decision_id}/transcription/audio/{audio_id}",
        headers=auth_headers,
    )
    assert stream_res.status_code == 200
    assert len(stream_res.content) > 0


def test_audio_cross_user_isolation(client: TestClient, auth_headers: dict, decision_id: int):
    """Test that User B cannot access or modify User A's audio transcription."""
    # Register user B
    b_email = "user_b_audio@decisionlens.ai"
    b_pass = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": b_email, "password": b_pass})
    b_login = client.post("/api/auth/login", json={"email": b_email, "password": b_pass})
    b_headers = {"Authorization": f"Bearer {b_login.json()['access_token']}"}

    # User B attempts to upload audio to User A's decision
    wav_bytes = create_test_wav_bytes(duration_seconds=0.5)
    res_b = client.post(
        f"/api/decisions/{decision_id}/transcription",
        headers=b_headers,
        data={"language": "en", "force_mock": "true"},
        files={"file": ("b_hack.wav", wav_bytes, "audio/wav")},
    )
    assert res_b.status_code == 404

    # User B attempts to edit User A's transcript
    res_b_patch = client.patch(
        f"/api/decisions/{decision_id}/transcription/transcript",
        headers=b_headers,
        json={"transcript": "Unauthorized edit", "mark_reviewed": True},
    )
    assert res_b_patch.status_code == 404
