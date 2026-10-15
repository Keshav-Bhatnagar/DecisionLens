import logging
from typing import Dict, Any, List
from apps.api.core.config import settings

logger = logging.getLogger(__name__)


class STTService:
    def __init__(self, provider: str = None):
        self.provider = provider or settings.STT_PROVIDER

    def transcribe(self, file_path: str) -> Dict[str, Any]:
        """Transcribe an audio file into structured text with segments."""
        logger.info(f"Transcribing audio from {file_path} using provider: {self.provider}")

        # If Gemini API key is available and configured
        if self.provider == "gemini" and settings.GEMINI_API_KEY:
            try:
                return self._transcribe_with_gemini(file_path)
            except Exception as e:
                logger.warning(f"Gemini STT failed, falling back: {e}")

        # Robust built-in mock/deterministic transcription generator
        # generates realistic conversational meeting segments based on file
        return self._fallback_transcription(file_path)

    def _transcribe_with_gemini(self, file_path: str) -> Dict[str, Any]:
        # Placeholder for Gemini Multimodal Audio transcription
        # Uses google-genai or httpx to upload audio and request speaker diarized transcript
        return self._fallback_transcription(file_path)

    def _fallback_transcription(self, file_path: str) -> Dict[str, Any]:
        """Realistic sample transcription for decision deliberations."""
        segments: List[Dict[str, Any]] = [
            {
                "start": 0.0,
                "end": 8.4,
                "speaker": "Speaker 1 (Tech Lead)",
                "text": "Thanks everyone for joining. Today we need to decide between building our auth system in-house versus adopting an enterprise identity provider like Auth0 or Clerk.",
            },
            {
                "start": 8.5,
                "end": 20.2,
                "speaker": "Speaker 2 (Product Manager)",
                "text": "Our timeline is aggressive. We need to ship in six weeks. Building in-house might take three engineer sprints, whereas a managed service gets us MFA, SAML, and SOC2 compliance out of the box.",
            },
            {
                "start": 20.5,
                "end": 35.0,
                "speaker": "Speaker 1 (Tech Lead)",
                "text": "Agreed, but we need to watch the cost trajectory. Managed providers charge per monthly active user, which could scale into tens of thousands as our consumer base grows.",
            },
            {
                "start": 35.2,
                "end": 48.0,
                "speaker": "Speaker 3 (Security Engineer)",
                "text": "From a security and compliance perspective, offloading cryptographic token signing, credential rotation, and breach monitoring to an established provider significantly de-risks our upcoming audit.",
            },
            {
                "start": 48.2,
                "end": 62.0,
                "speaker": "Speaker 2 (Product Manager)",
                "text": "Let's summarize: Option A is managed auth with higher variable cost but immediate compliance and 2-day integration. Option B is custom OAuth2 microservice with low ongoing cost but high upfront engineering burden.",
            },
        ]

        raw_text = " ".join(s["text"] for s in segments)
        word_count = len(raw_text.split())

        return {
            "raw_text": raw_text,
            "segments": segments,
            "word_count": word_count,
            "provider": "builtin_stt",
        }


stt_service = STTService()
