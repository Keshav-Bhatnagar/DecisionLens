import json
import logging
from typing import Dict, Any, List, Optional
from apps.api.core.config import settings
from apps.api.services.frameworks import get_framework

logger = logging.getLogger(__name__)


class LLMService:
    def __init__(self):
        self.provider = settings.DEFAULT_LLM_PROVIDER
        self.gemini_key = settings.GEMINI_API_KEY
        self.openai_key = settings.OPENAI_API_KEY
        self.anthropic_key = settings.ANTHROPIC_API_KEY

    def is_configured(self) -> bool:
        """Check if any LLM API key is present in environment."""
        return bool(self.gemini_key or self.openai_key or self.anthropic_key)

    def analyze_session(
        self,
        objective: str,
        framework_type: str,
        context_data: Optional[Dict[str, Any]] = None,
        transcript_text: Optional[str] = None,
        responses: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Run decision framework analysis over session objective, context, transcript, and responses.
        Falls back to specialized deterministic framework engine if external LLM keys are unset.
        """
        framework = get_framework(framework_type)
        context = dict(context_data or {})
        if transcript_text:
            context["transcript_summary"] = transcript_text[:1000]

        # If live LLM keys are configured, we could execute real provider request
        if self.gemini_key and self.provider == "gemini":
            try:
                return self._call_gemini(objective, framework_type, context, responses)
            except Exception as e:
                logger.warning(f"Live Gemini invocation failed, fallback to framework engine: {e}")

        # Run structured domain decision framework
        return framework.analyze(objective, context, responses or [])

    def _call_gemini(
        self,
        objective: str,
        framework_type: str,
        context: Dict[str, Any],
        responses: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """Call Gemini API when GEMINI_API_KEY is present."""
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_key}"
        prompt = f"""
        Act as an executive decision scientist. Perform a {framework_type.upper()} analysis for the following objective:
        Objective: {objective}
        Context: {json.dumps(context)}
        User Responses: {json.dumps(responses or [])}

        Return STRICT JSON with keys:
        - summary: string
        - matrix: object (criteria & alternatives or swot quadrants)
        - key_findings: array of strings
        - recommendations: array of strings
        - confidence_score: float between 0.0 and 1.0
        """
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"response_mime_type": "application/json"},
        }
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(raw_text)
            parsed["framework"] = framework_type
            return parsed


llm_service = LLMService()
