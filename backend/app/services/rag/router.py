from enum import Enum
import re
from typing import List, Optional, Tuple


class DomainType(str, Enum):
    CAREER = "career"
    LEGAL = "legal"
    SOFTWARE = "software"
    GENERAL = "general"


DOMAIN_KEYWORDS = {
    DomainType.CAREER: [
        "career", "job", "offer", "salary", "compensation", "promotion", "raise",
        "resume", "hiring", "manager", "pivot", "quit", "resign", "role", "interview",
        "equity", "vesting", "bonus", "work-life", "burnout", "employer", "employee",
        "colleague", "workplace", "internship", "fellowship"
    ],
    DomainType.LEGAL: [
        "contract", "liability", "clause", "non-compete", "agreement", "nda",
        "terms of service", "tos", "indemnity", "indemnification", "statute",
        "regulation", "intellectual property", "ip", "patent", "copyright",
        "breach", "settlement", "litigation", "cure period", "termination for cause",
        "arbitration", "jurisdiction", "governing law"
    ],
    DomainType.SOFTWARE: [
        "database", "architecture", "aws", "gcp", "azure", "cloud", "docker",
        "kubernetes", "microservices", "monolith", "latency", "scale", "scalability",
        "nosql", "sql", "postgres", "mongodb", "dynamodb", "redis", "kafka",
        "api", "backend", "frontend", "serverless", "lambda", "framework",
        "refactor", "tech stack", "uptime", "sla", "devops", "ci/cd"
    ],
}


class DomainRouter:
    """
    Intelligent router that classifies decision context into a specific domain.
    """

    def classify(self, text: str) -> Tuple[DomainType, float]:
        """
        Classifies input text and returns (DomainType, confidence_score).
        """
        if not text or not text.strip():
            return DomainType.GENERAL, 0.0

        cleaned = text.lower()
        scores = {domain: 0 for domain in DomainType if domain != DomainType.GENERAL}

        for domain, keywords in DOMAIN_KEYWORDS.items():
            for kw in keywords:
                # Count keyword occurrences
                matches = len(re.findall(r"\b" + re.escape(kw) + r"\b", cleaned))
                scores[domain] += matches

        best_domain = DomainType.GENERAL
        max_score = 0
        for domain, score in scores.items():
            if score > max_score:
                max_score = score
                best_domain = domain

        confidence = min(1.0, max_score / 3.0) if max_score > 0 else 0.0
        return best_domain, round(confidence, 2)


_default_router: Optional[DomainRouter] = None


def classify_decision_domain(text: str) -> Tuple[DomainType, float]:
    global _default_router
    if _default_router is None:
        _default_router = DomainRouter()
    return _default_router.classify(text)
