"""
DPDP Act 2023 & Enterprise PII Redaction Utility.

Scrubs personally identifiable information (emails, phone numbers, Aadhaar, PAN)
and accidental secrets/tokens from untrusted meeting transcripts or documents
before sending prompts to external cloud LLM providers.
"""

import re
from typing import Tuple

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# Indian PAN: 5 uppercase letters + 4 digits + 1 uppercase letter
_PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")

# Aadhaar: 12 digits grouped as 4-4-4 (space or hyphen separated)
_AADHAAR_RE = re.compile(r"\b[2-9][0-9]{3}[\s-][0-9]{4}[\s-][0-9]{4}\b")

# Phone numbers: +CC followed by 7-13 digits, or standalone 10-digit Indian mobile numbers (6-9 start)
_PHONE_RE = re.compile(
    r"(?<!\d)(?:\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}|[6-9]\d{9})(?!\d)"
)

# Common API keys, bearer tokens, and JWTs
_SECRET_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{25,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[0-9A-Za-z-]{15,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b"
)


def redact_pii_with_stats(text: str) -> Tuple[str, int]:
    """
    Redact PII and secrets from text before external LLM transmission.
    Returns (redacted_text, redaction_count).
    """
    if not text:
        return text, 0

    count = 0

    def _sub(pattern: re.Pattern[str], token: str, value: str) -> str:
        nonlocal count
        updated, n = pattern.subn(token, value)
        count += n
        return updated

    cleaned = text
    cleaned = _sub(_SECRET_RE, "[REDACTED_SECRET]", cleaned)
    cleaned = _sub(_EMAIL_RE, "[REDACTED_EMAIL]", cleaned)
    cleaned = _sub(_AADHAAR_RE, "[REDACTED_AADHAAR]", cleaned)
    cleaned = _sub(_PAN_RE, "[REDACTED_PAN]", cleaned)
    cleaned = _sub(_PHONE_RE, "[REDACTED_PHONE]", cleaned)
    return cleaned, count


def redact_pii(text: str) -> str:
    """Convenience wrapper returning only the PII-redacted text."""
    redacted, _ = redact_pii_with_stats(text)
    return redacted

