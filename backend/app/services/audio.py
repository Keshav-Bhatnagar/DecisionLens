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


NOISE_PATTERNS = {
    "<noise>", "[noise]", "(noise)",
    "<silence>", "[silence]", "(silence)",
    "[background noise]", "<background noise>",
    "[applause]", "[laughter]", "[gasp]",
    "<ambient>", "[ambient sound]",
}


def clean_noise_tokens(text: str) -> str:
    """Strip AI noise annotations and check if meaningful speech remains."""
    if not text:
        return ""
    cleaned = text.strip()
    for np in NOISE_PATTERNS:
        cleaned = cleaned.replace(np, "").replace(np.upper(), "")
    cleaned = " ".join(cleaned.split()).strip()
    return cleaned


def enhance_audio_with_ffmpeg(
    input_path: Path,
    output_path: Path,
    enable_normalization: bool = True,
    enable_noise_reduction: bool = True,
) -> bool:
    """
    Apply fast FFmpeg loudness normalization (loudnorm) and optional high-pass filter noise reduction.
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
        # EBU R128 integrated loudness normalization
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
        "-threads", "2",
        str(output_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
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
        consecutive_errors = 0
        for chunk in chunks[:6]:
            if consecutive_errors >= 2:
                break
            if chunk.stat().st_size < 100:
                continue
            flac_bytes = chunk.read_bytes()
            req = urllib.request.Request(
                url,
                data=flac_bytes,
                headers={"Content-Type": "audio/x-flac; rate=16000"}
            )
            try:
                with urllib.request.urlopen(req, timeout=4.0, context=ssl_context) as resp:
                    body = resp.read().decode("utf-8", errors="ignore")
                lines = [l.strip() for l in body.split("\n") if l.strip()]
                for line in lines:
                    try:
                        data = json.loads(line)
                        if "result" in data and len(data["result"]) > 0:
                            alt = data["result"][0]["alternative"][0]["transcript"]
                            if alt.strip():
                                results.append(alt.strip())
                                consecutive_errors = 0
                    except Exception:
                        pass
            except Exception as exc:
                consecutive_errors += 1
                logger.debug(f"Google speech chunk recognition error: {exc}")

        return " ".join(results).strip()


def transcribe_audio_gemini(
    audio_path: Path,
    language: str = "en",
    client_hint: Optional[str] = None,
) -> str:
    """
    Transcribe audio file using Google Gemini 3.5 Flash native multimodal audio understanding.
    Fast (typically 2-4 seconds), executive-grade accuracy, and supports both English and Hindi.
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
    hint_clause = ""
    if client_hint and len(client_hint.strip()) > 3:
        clean_hint = clean_noise_tokens(client_hint)
        if clean_hint:
            hint_clause = f"\nOptional phonetics reference from microphone draft: \"{clean_hint}\""

    if norm_lang == "hi":
        instruction = (
            "Provide an accurate, high-fidelity verbatim speech-to-text transcript of this audio in Hindi "
            "(use Devanagari script or conversational Hinglish as spoken). "
            "Perform speaker diarization: distinguish different speakers line by line (e.g. 'Speaker 1:', 'Speaker 2:'). "
            "Output ONLY the transcribed dialogue with proper punctuation, without meta commentary or markdown blocks."
            f"{hint_clause}"
        )
    else:
        instruction = (
            "Provide a high-fidelity verbatim speech-to-text transcript of this audio in English. "
            "Accurately capture all technical terminology, acronyms, trade-offs, and proper nouns. "
            "Perform speaker diarization: distinguish different speakers line by line (e.g. 'Speaker 1:', 'Speaker 2:'). "
            "Output ONLY the transcribed dialogue with complete sentences and punctuation, without meta commentary or markdown blocks."
            f"{hint_clause}"
        )

    try:
        import base64
        import httpx

        audio_bytes = audio_path.read_bytes()
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        # Active Google multimodal models
        models_to_try = [
            "gemini-3.5-flash",
            "gemini-3.8-flash",
            "gemini-flash-latest",
        ]

        for model_name in models_to_try:
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
            try:
                with httpx.Client(timeout=20.0) as client:
                    resp = client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts and "text" in parts[0]:
                                raw_text = parts[0]["text"].strip()
                                clean_text = clean_noise_tokens(raw_text)
                                if clean_text:
                                    logger.info(
                                        f"Successfully transcribed audio via Gemini ({model_name}, {len(clean_text)} chars)"
                                    )
                                    return clean_text
                                else:
                                    logger.info(f"Gemini output was noise/silence token ({raw_text}) - treating as silent")
                                    return ""
                    else:
                        logger.warning(
                            f"Gemini STT with model {model_name} returned HTTP {resp.status_code}: {resp.text[:200]}"
                        )
            except Exception as model_err:
                logger.warning(f"Gemini STT with model {model_name} exception: {model_err}")
                continue
    except Exception as exc:
        logger.warning(f"Gemini audio transcription error: {exc}")

    return ""


def transcribe_audio_azure_speech(
    audio_path: Path,
    language: str = "en",
    key: Optional[str] = None,
    region: Optional[str] = None,
) -> str:
    """
    Transcribe audio file via Microsoft Azure AI Speech REST API.
    Converts audio to 16kHz 16-bit mono PCM WAV, segments if longer than 50 seconds,
    and returns high-accuracy punctuated transcription.
    Supports English ('en-US') and Hindi ('hi-IN').
    """
    speech_key = (key or settings.azure_speech_key).strip()
    raw_region = (region or settings.azure_speech_region).strip()
    speech_region = raw_region.lower().replace(" ", "").replace("-", "")
    if not speech_key or not speech_region:
        return ""

    locale = "hi-IN" if language.lower() == "hi" else "en-US"
    url = f"https://{speech_region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language={locale}&format=detailed"

    ffmpeg_bin = get_ffmpeg_binary()
    if not ffmpeg_bin:
        logger.warning("FFmpeg binary not found for Azure Speech audio preparation.")
        return ""

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        converted_wav = temp_dir_path / "audio_16k.wav"

        # Transcode to 16kHz, 16-bit mono PCM WAV
        cmd = [
            ffmpeg_bin, "-y",
            "-i", str(audio_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(converted_wav),
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
        if res.returncode != 0 or not converted_wav.exists() or converted_wav.stat().st_size == 0:
            logger.warning("Failed to transcode audio for Azure Speech: %s", res.stderr)
            return ""

        # Check duration
        duration = probe_audio_duration(converted_wav) or 0.0

        headers = {
            "Ocp-Apim-Subscription-Key": speech_key,
            "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
            "Accept": "application/json",
        }

        # If <= 55 seconds, send in a single call
        if duration <= 55.0:
            audio_data = converted_wav.read_bytes()
            try:
                import httpx
                with httpx.Client(timeout=30.0) as client:
                    resp = client.post(url, headers=headers, content=audio_data)
                    if resp.status_code == 200:
                        data = resp.json()
                        status_str = data.get("RecognitionStatus")
                        if status_str == "Success":
                            text = data.get("DisplayText") or ""
                            if not text and data.get("NBest"):
                                text = data["NBest"][0].get("Display", "")
                            return clean_noise_tokens(text)
                        elif status_str in ("NoMatch", "InitialSilenceTimeout"):
                            logger.info("Azure Speech detected silence or no speech match.")
                            return ""
                        else:
                            logger.warning("Azure Speech recognition status: %s", status_str)
                    else:
                        logger.warning("Azure Speech API returned HTTP %s: %s", resp.status_code, resp.text[:200])
            except Exception as exc:
                logger.warning("Azure Speech REST request error: %s", exc)
            return ""

        # If > 55 seconds, segment into 45-second chunks
        segment_pattern = str(temp_dir_path / "chunk_%03d.wav")
        seg_cmd = [
            ffmpeg_bin, "-y",
            "-i", str(converted_wav),
            "-f", "segment",
            "-segment_time", "45",
            "-c", "copy",
            segment_pattern,
        ]
        subprocess.run(seg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)

        chunks = sorted(list(temp_dir_path.glob("chunk_*.wav")))
        if not chunks:
            chunks = [converted_wav]

        collected_texts = []
        try:
            import httpx
            with httpx.Client(timeout=30.0) as client:
                for chunk in chunks:
                    chunk_bytes = chunk.read_bytes()
                    resp = client.post(url, headers=headers, content=chunk_bytes)
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("RecognitionStatus") == "Success":
                            chunk_text = data.get("DisplayText") or ""
                            if not chunk_text and data.get("NBest"):
                                chunk_text = data["NBest"][0].get("Display", "")
                            cleaned = clean_noise_tokens(chunk_text)
                            if cleaned:
                                collected_texts.append(cleaned)
                    else:
                        logger.warning("Azure Speech chunk transcription HTTP %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.warning("Azure Speech chunked transcription error: %s", exc)

        full_text = " ".join(collected_texts).strip()
        return full_text


def transcribe_audio_file(
    audio_path: Path,
    language: str = "en",
    force_mock: bool = False,
    client_transcript: Optional[str] = None,
) -> str:
    """
    Transcribe audio file with multi-tiered speech-to-text pipeline:
    1. If force_mock=True (unit tests), returns unit test mock text.
    2. Tier 0: Azure AI Speech Service (Primary if configured in Azure).
    3. Tier 1: Google Gemini 3.5 Flash multimodal transcription (Option A Fallback).
    4. Tier 2: OpenAI Whisper (whisper-1) if OpenAI API key is configured.
    5. Tier 3: Browser live-captured Web Speech transcript if remote models are unavailable.
    6. Tier 4: FFmpeg + Google Speech Recognition v2.
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

    # 0. Tier 0: Azure AI Speech Service (Option B primary)
    azure_speech_key = settings.azure_speech_key.strip()
    azure_speech_region = settings.azure_speech_region.strip()
    if azure_speech_key and azure_speech_region:
        try:
            logger.info("Attempting Tier 0 Azure AI Speech transcription (language=%s)...", norm_lang)
            azure_text = transcribe_audio_azure_speech(
                audio_path,
                language=norm_lang,
                key=azure_speech_key,
                region=azure_speech_region,
            )
            if azure_text and azure_text.strip():
                logger.info("Successfully transcribed audio via Azure AI Speech (%d chars)", len(azure_text))
                return azure_text.strip()
            logger.info("Azure AI Speech returned empty or silence. Checking fallback...")
        except Exception as exc:
            logger.warning("Tier 0 Azure AI Speech transcription failed (%s). Falling back to Tier 1 Gemini.", exc)

    # 1. Tier 1 (Fallback Option A): Google Gemini 3.5 Flash multimodal transcription (highest quality)
    gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
    if gemini_key:
        try:
            gemini_text = transcribe_audio_gemini(
                audio_path,
                language=norm_lang,
                client_hint=client_transcript,
            )
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
            text = clean_noise_tokens(transcription.text.strip())
            if text:
                return text
        except Exception as exc:
            logger.warning(f"OpenAI Whisper transcription failed ({exc}). Falling back to browser/Google Speech.")

    # 3. Tier 3: Browser live-captured Web Speech transcript fallback if remote AI failed
    if client_transcript and client_transcript.strip():
        cleaned_client = clean_noise_tokens(client_transcript)
        if cleaned_client:
            logger.info(f"Using browser Web Speech transcript fallback ({len(cleaned_client)} chars)")
            return cleaned_client

    # 4. Tier 4: Google Speech Recognition via FFmpeg
    try:
        recognized = transcribe_audio_google_free(audio_path, language=norm_lang)
        cleaned_rec = clean_noise_tokens(recognized)
        if cleaned_rec:
            logger.info(f"Successfully transcribed audio via Google Speech API ({len(cleaned_rec)} chars)")
            return cleaned_rec
    except Exception as exc:
        logger.warning(f"Google Speech Recognition execution error: {exc}")

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
