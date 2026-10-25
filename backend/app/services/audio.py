import json
import logging
import os
import shutil
import ssl
import subprocess
import tempfile
import urllib.request
import uuid
from pathlib import Path
from typing import Optional, Tuple

import certifi
from fastapi import HTTPException, status
from app.config import settings

logger = logging.getLogger("decisionlens.audio")

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg"}
SUPPORTED_LANGUAGES = {"en", "hi"}
MAX_AUDIO_DURATION_SECONDS = 7200  # 2 hours limit



def get_audio_extension(filename: str) -> str:
    """Return lowercase extension including leading dot, normalized."""
    _, ext = os.path.splitext(filename)
    return ext.lower()


def validate_audio_file(
    content: bytes,
    filename: str,
    mime_type: Optional[str] = None,
    language: str = "en",
) -> str:
    """
    Validate audio content, extension, size, and language.
    Raises HTTPException on validation failure.
    Returns normalized extension.
    """
    # 1. Validate language
    norm_lang = language.strip().lower()
    if norm_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language '{language}'. DecisionLens strictly supports English ('en') and Hindi ('hi').",
        )

    # 2. Validate empty content
    if not content or len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty (0 bytes).",
        )

    # 3. Validate size limit
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Audio file size ({len(content) / (1024 * 1024):.1f}MB) exceeds the maximum allowed limit of {settings.max_upload_mb}MB.",
        )

    # 4. Validate extension
    ext = get_audio_extension(filename)
    # If filename doesn't have an extension (e.g. raw blob upload), infer from mime_type
    if not ext and mime_type:
        if "webm" in mime_type:
            ext = ".webm"
        elif "wav" in mime_type:
            ext = ".wav"
        elif "ogg" in mime_type:
            ext = ".ogg"
        elif "mp4" in mime_type or "m4a" in mime_type:
            ext = ".m4a"
        elif "mpeg" in mime_type or "mp3" in mime_type:
            ext = ".mp3"

    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format '{ext or filename}'. Allowed audio formats: .wav, .mp3, .m4a, .webm, .ogg",
        )

    return ext


def get_ffmpeg_binary() -> Optional[str]:
    """
    Find FFmpeg binary from system PATH, or fallback to bundled imageio-ffmpeg.
    Ensures seamless audio transcoding and normalization on systems without global FFmpeg.
    """
    bin_path = shutil.which("ffmpeg")
    if bin_path:
        return bin_path
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            return exe
    except Exception:
        pass
    return None


def probe_audio_duration(file_path: Path) -> Optional[float]:
    """
    Use ffprobe to determine duration in seconds.
    Returns None if ffprobe is unavailable or fails.
    """
    ffprobe_bin = shutil.which("ffprobe")
    if not ffprobe_bin:
        return None

    try:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(file_path),
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception as exc:
        logger.warning(f"Failed to probe audio duration for {file_path}: {exc}")
    return None


def enhance_audio_with_ffmpeg(
    input_path: Path,
    output_path: Path,
    enable_normalization: bool = True,
    enable_noise_reduction: bool = True,
) -> bool:
    """
    Apply FFmpeg loudness normalization (loudnorm) and optional high-pass filter noise reduction.
    Returns True if successfully enhanced, False if FFmpeg fails or is not installed.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    if not ffmpeg_bin:
        logger.warning("FFmpeg binary not found on system PATH or imageio-ffmpeg. Audio enhancement skipped.")
        return False

    audio_filters = []
    if enable_noise_reduction:
        # High-pass filter at 200 Hz to remove low-frequency ambient rumble and mic handling hum
        audio_filters.append("highpass=f=200")
    if enable_normalization:
        # EBU R128 two-pass-like integrated loudness normalization
        audio_filters.append("loudnorm")

    filter_str = ",".join(audio_filters) if audio_filters else "anull"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", str(input_path),
        "-af", filter_str,
        "-c:a", "pcm_s16le",
        "-ar", "16000",
        str(output_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=60,
        )
        if result.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
            return True
        logger.warning(f"FFmpeg returned non-zero code {result.returncode}: {result.stderr}")
    except Exception as exc:
        logger.warning(f"FFmpeg execution failed on {input_path}: {exc}")

    return False


def get_mock_transcript(language: str = "en") -> str:
    """Generate mock transcript for unit testing when force_mock=True."""
    if language == "hi":
        return (
            "हमने बैठक में निर्णय लिया कि हम बहु-किरायेदार वास्तुकला (multi-tenant architecture) "
            "के साथ आगे बढ़ेंगे। मुख्य प्राथमिकता डेटा गोपनीयता, स्केलेबिलिटी और सुरक्षित प्रमाणीकरण है। "
            "अगले कदम में डेटाबेस माइग्रेशन और फॉल-बैक रणनीतियों की समीक्षा शामिल है।"
        )
    return (
        "We discussed the core architectural decisions for the platform. "
        "The team agreed to proceed with a modular multi-tenant architecture, ensuring data isolation, "
        "strict tenancy checks, and robust error fallback. Key priorities are low-latency text extraction, "
        "voice normalization, and actionable decision frameworks. Next action is reviewing technical tradeoffs."
    )


def transcribe_audio_google_free(audio_path: Path, language: str = "en") -> str:
    """
    Transcribe audio file locally using FFmpeg 16kHz mono FLAC segmentation
    and Google Speech Recognition API (with SSL certifi validation).
    Supports English ('en' -> 'en-US') and Hindi ('hi' -> 'hi-IN').
    Works without requiring an OpenAI API key.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    if not ffmpeg_bin:
        logger.warning("FFmpeg binary not available for audio transcription segmentation.")
        return ""

    norm_lang = language.strip().lower()
    google_lang = "hi-IN" if norm_lang == "hi" else "en-US"
    key = settings.google_speech_api_key or os.getenv("GOOGLE_SPEECH_API_KEY", "")
    key_param = f"&key={key}" if key else ""
    url = f"https://www.google.com/speech-api/v2/recognize?output=json&lang={google_lang}{key_param}"

    try:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ssl_context = ssl.create_default_context()

    with tempfile.TemporaryDirectory() as tmpdir:
        # Segment into 15-second 16kHz mono FLAC chunks for optimal recognition accuracy
        out_pattern = Path(tmpdir) / "chunk_%03d.flac"
        cmd = [
            ffmpeg_bin, "-y", "-i", str(audio_path),
            "-f", "segment", "-segment_time", "15",
            "-ar", "16000", "-ac", "1",
            str(out_pattern)
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            logger.warning(f"FFmpeg segmentation failed ({res.stderr.decode('utf-8', errors='ignore')}), trying direct FLAC conversion")
            direct_flac = Path(tmpdir) / "direct.flac"
            cmd_direct = [
                ffmpeg_bin, "-y", "-i", str(audio_path),
                "-ar", "16000", "-ac", "1",
                "-f", "flac", str(direct_flac)
            ]
            res_direct = subprocess.run(cmd_direct, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res_direct.returncode == 0 and direct_flac.exists():
                chunks = [direct_flac]
            else:
                return ""
        else:
            chunks = sorted(list(Path(tmpdir).glob("chunk_*.flac")))

        results = []
        for chunk in chunks:
            if chunk.stat().st_size < 100:
                continue
            flac_bytes = chunk.read_bytes()
            req = urllib.request.Request(
                url,
                data=flac_bytes,
                headers={"Content-Type": "audio/x-flac; rate=16000"}
            )
            try:
                with urllib.request.urlopen(req, timeout=20, context=ssl_context) as resp:
                    body = resp.read().decode("utf-8", errors="ignore")
                lines = [l.strip() for l in body.split("\n") if l.strip()]
                for line in lines:
                    try:
                        data = json.loads(line)
                        if "result" in data and len(data["result"]) > 0:
                            alt = data["result"][0]["alternative"][0]["transcript"]
                            if alt.strip():
                                results.append(alt.strip())
                    except Exception:
                        pass
            except Exception as exc:
                logger.debug(f"Google speech chunk recognition error: {exc}")

        return " ".join(results).strip()


def transcribe_audio_gemini(audio_path: Path, language: str = "en") -> str:
    """
    Transcribe audio file using Google Gemini native multimodal audio understanding.
    Fast (typically 1-3 seconds), highly accurate, and supports both English and Hindi.
    """
    api_key = (settings.gemini_api_key or settings.google_api_key).strip()
    if not api_key:
        return ""

    if not audio_path.exists() or audio_path.stat().st_size == 0:
        return ""

    ext = audio_path.suffix.lower()
    mime_map = {
        ".wav": "audio/wav",
        ".mp3": "audio/mp3",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
    }
    mime_type = mime_map.get(ext, "audio/wav")

    norm_lang = language.strip().lower()
    if norm_lang == "hi":
        instruction = (
            "Provide an accurate, verbatim speech-to-text transcript of this audio recording in Hindi "
            "(use Devanagari script or natural conversational Hinglish as spoken). "
            "Perform speaker diarization: if multiple speakers are talking, distinguish distinct voices and label each turn "
            "(e.g., 'Speaker 1:', 'Speaker 2:', or use their actual names if participants state or address each other by name). "
            "Preserve conversational back-and-forth exchanges clearly line by line. "
            "If only one person is speaking, transcribe naturally without unnecessary speaker prefixes. "
            "Output ONLY the transcribed dialogue without commentary, intro/outro, timestamps, or markdown code blocks."
        )
    else:
        instruction = (
            "Provide an accurate, verbatim speech-to-text transcript of this audio recording in English. "
            "Perform speaker diarization: if multiple speakers are talking, distinguish distinct voices and label each turn "
            "(e.g., 'Speaker 1:', 'Speaker 2:', or use their actual names if participants state or address each other by name). "
            "Preserve conversational back-and-forth exchanges clearly line by line. "
            "If only one person is speaking, transcribe naturally without unnecessary speaker prefixes. "
            "Output ONLY the transcribed dialogue without commentary, intro/outro, timestamps, or markdown code blocks."
        )

    try:
        import base64
        import httpx

        audio_bytes = audio_path.read_bytes()
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        models_to_try = [
            "gemini-flash-lite-latest",
            "gemini-3.1-flash-lite-preview",
            "gemini-flash-latest",
            settings.gemini_model,
        ]
        seen = set()
        unique_models = []
        for m in models_to_try:
            if m and m not in seen:
                seen.add(m)
                unique_models.append(m)

        for model_name in unique_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
            headers = {
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            }
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": instruction},
                            {
                                "inline_data": {
                                    "mime_type": mime_type,
                                    "data": audio_b64,
                                }
                            },
                        ],
                    }
                ],
                "generationConfig": {
                    "temperature": 0.0,
                },
            }
            with httpx.Client(timeout=35.0) as client:
                resp = client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            text = parts[0]["text"].strip()
                            if text:
                                logger.info(
                                    f"Successfully transcribed audio via Gemini ({model_name}, {len(text)} chars)"
                                )
                                return text
                else:
                    logger.warning(
                        f"Gemini STT with model {model_name} returned HTTP {resp.status_code}: {resp.text[:200]}"
                    )
    except Exception as exc:
        logger.warning(f"Gemini audio transcription error: {exc}")

    return ""


def transcribe_audio_file(
    audio_path: Path,
    language: str = "en",
    force_mock: bool = False,
    client_transcript: Optional[str] = None,
) -> str:
    """
    Transcribe audio file with multi-tiered speech-to-text pipeline:
    1. If force_mock=True (unit tests), returns unit test mock text.
    2. Tier 1: Google Gemini native multimodal speech recognition (fast, high accuracy, English & Hindi).
    3. Tier 2: OpenAI Whisper (whisper-1) if OpenAI API key is configured.
    4. Tier 3: Browser live-captured Web Speech transcript if provided.
    5. Tier 4: FFmpeg + Google Speech Recognition v2.
    Strictly restricted to 'en' and 'hi'.
    """
    norm_lang = language.strip().lower()
    if norm_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language '{language}'. DecisionLens strictly supports English ('en') and Hindi ('hi').",
        )

    # Unit testing hook
    if force_mock:
        logger.info(f"Using mock transcription for testing (language={norm_lang}, force_mock=True)")
        return get_mock_transcript(norm_lang)

    # 1. Tier 1: Google Gemini multimodal transcription (fastest & most accurate with GEMINI_API_KEY)
    gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
    if gemini_key:
        try:
            gemini_text = transcribe_audio_gemini(audio_path, language=norm_lang)
            if gemini_text and gemini_text.strip():
                return gemini_text.strip()
        except Exception as exc:
            logger.warning(f"Tier 1 Gemini transcription attempt failed: {exc}")

    # 2. Tier 2: Hosted OpenAI Whisper if API key is provided
    openai_key = settings.openai_api_key.strip()
    if openai_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            whisper_prompt = (
                "Transcript of a decision-making discussion or executive meeting with multiple speakers. "
                "Speaker 1: ... Speaker 2: ... Clear dialogue turns, trade-offs, and decisions."
            )
            with open(audio_path, "rb") as f:
                transcription = client.audio.transcriptions.create(
                    model=settings.whisper_model,
                    file=f,
                    language=norm_lang,
                    prompt=whisper_prompt,
                )
            text = transcription.text.strip()
            if text:
                return text
        except Exception as exc:
            logger.warning(f"OpenAI Whisper transcription failed ({exc}). Falling back to browser/Google Speech.")

    # 3. Tier 3: Browser live-captured Web Speech transcript if provided
    if client_transcript and client_transcript.strip():
        logger.info(f"Using browser Web Speech transcript fallback ({len(client_transcript)} chars)")
        return client_transcript.strip()

    # 4. Tier 4: Google Speech Recognition via FFmpeg
    try:
        recognized = transcribe_audio_google_free(audio_path, language=norm_lang)
        if recognized and recognized.strip():
            logger.info(f"Successfully transcribed audio via Google Speech API ({len(recognized)} chars)")
            return recognized.strip()
    except Exception as exc:
        logger.warning(f"Google Speech Recognition execution error: {exc}")

    # 5. If speech was completely silent or unintelligible, return empty string
    return ""


def process_and_store_audio(
    content: bytes,
    original_filename: str,
    mime_type: Optional[str] = None,
    language: str = "en",
    apply_enhancement: bool = True,
) -> Tuple[Path, Optional[Path], Optional[float], bool]:
    """
    Validate, securely store original audio, run FFmpeg enhancement if enabled,
    and return (original_path, enhanced_path, duration_seconds, used_enhanced).
    """
    ext = validate_audio_file(content, original_filename, mime_type, language)

    # 1. Prepare storage directories
    original_dir = settings.storage_path / "audio" / "original"
    enhanced_dir = settings.storage_path / "audio" / "enhanced"
    original_dir.mkdir(parents=True, exist_ok=True)
    enhanced_dir.mkdir(parents=True, exist_ok=True)

    # 2. Write original audio
    file_uuid = uuid.uuid4().hex
    original_path = original_dir / f"{file_uuid}{ext}"
    original_path.write_bytes(content)

    # 3. Probe duration
    duration = probe_audio_duration(original_path)
    if duration is not None and duration > MAX_AUDIO_DURATION_SECONDS:
        # Clean up stored file and reject
        try:
            original_path.unlink()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Audio duration ({duration / 60:.1f} minutes) exceeds the maximum limit of {MAX_AUDIO_DURATION_SECONDS // 60} minutes.",
        )

    # 4. Enhance audio via FFmpeg
    enhanced_path: Optional[Path] = None
    used_enhanced = False
    if apply_enhancement:
        candidate_enhanced = enhanced_dir / f"{file_uuid}_enhanced.wav"
        success = enhance_audio_with_ffmpeg(
            original_path,
            candidate_enhanced,
            enable_normalization=True,
            enable_noise_reduction=True,
        )
        if success:
            enhanced_path = candidate_enhanced
            used_enhanced = True
        else:
            logger.warning("Audio enhancement failed or was skipped. Falling back to original audio.")

    return original_path, enhanced_path, duration, used_enhanced
