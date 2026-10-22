import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from app.config import settings
from app.schemas import (
    ResearchClaimItem,
    ResearchFindingItem,
    ResearchSourceItem,
)

logger = logging.getLogger("decisionlens.search")


class SearchProviderNotConfiguredError(Exception):
    """Raised when an external web search provider is required but lacks API credentials."""

    def __init__(self, provider: str, message: Optional[str] = None):
        msg = message or (
            f"External web search provider '{provider}' is not configured. "
            f"Please set SEARCH_API_KEY (or TAVILY_API_KEY / SERPER_API_KEY) in backend/.env, "
            f"or specify force_mock=true to use the deterministic test provider."
        )
        super().__init__(msg)
        self.provider = provider
        self.message = msg


# Known domain classification lists
PRIMARY_DOMAINS = {
    "aws.amazon.com",
    "cloud.google.com",
    "azure.microsoft.com",
    "docs.github.com",
    "github.com",
    "postgresql.org",
    "python.org",
    "kubernetes.io",
    "developer.apple.com",
    "developer.android.com",
    "rfc-editor.org",
    "w3.org",
    "nist.gov",
    "sec.gov",
}

SECONDARY_DOMAINS = {
    "infoq.com",
    "techcrunch.com",
    "zdnet.com",
    "gartner.com",
    "forrester.com",
    "reuters.com",
    "bloomberg.com",
    "wired.com",
    "theverge.com",
    "arstechnica.com",
}

COMMUNITY_DOMAINS = {
    "reddit.com",
    "news.ycombinator.com",
    "stackoverflow.com",
    "medium.com",
    "substack.com",
    "quora.com",
}


def determine_source_reliability(url: str, title: str = "") -> str:
    """
    Classify source reliability label according to strict provenance:
    - primary_source: Official documentation, vendor sites, standard registries, .gov, .edu
    - secondary_source: Established technology publications and industry analyst firms
    - community_opinion: Forums, social discussions, community blogs
    - low_confidence: Generic unverified domains or promotional content
    """
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]

        # .gov and .edu are always primary sources
        if domain.endswith(".gov") or domain.endswith(".edu"):
            return "primary_source"

        # Check primary domain match (including subdomains)
        for p in PRIMARY_DOMAINS:
            if domain == p or domain.endswith("." + p):
                return "primary_source"

        # Check secondary
        for s in SECONDARY_DOMAINS:
            if domain == s or domain.endswith("." + s):
                return "secondary_source"

        # Check community
        for c in COMMUNITY_DOMAINS:
            if domain == c or domain.endswith("." + c):
                return "community_opinion"

        # Fallback heuristic based on title or URL
        if any(term in url.lower() for term in ["docs.", "/docs", "/documentation", "/whitepaper", "/sla"]):
            return "primary_source"

        return "low_confidence"
    except Exception:
        return "low_confidence"


def generate_narrow_search_query(
    question: str,
    reason: str = "",
    affected_options: Optional[List[str]] = None,
    custom_query: Optional[str] = None,
) -> str:
    """
    Transform broad or conversational gap questions into narrowly scoped,
    concrete search queries targeting specific metrics, benchmarks, or SLA constraints.
    """
    if custom_query and custom_query.strip():
        return custom_query.strip()

    clean_q = re.sub(
        r"^(what is|how do we|can we|is there|why is|are there|does)\s+",
        "",
        question,
        flags=re.IGNORECASE,
    ).strip(" ?.")

    # Incorporate affected candidate options to sharpen scoping
    options_context = ""
    if affected_options and len(affected_options) > 0:
        valid_opts = [o.strip() for o in affected_options[:2] if o.strip()]
        if valid_opts:
            options_context = " vs ".join(valid_opts)

    if options_context and options_context.lower() not in clean_q.lower():
        narrow = f"{options_context} {clean_q} benchmark documentation"
    else:
        narrow = f"{clean_q} official benchmark documentation"

    # Normalize whitespace
    narrow = re.sub(r"\s+", " ", narrow).strip()
    return narrow[:140]


def _call_tavily_search(query: str, api_key: str) -> List[dict]:
    """Execute live search via Tavily Search API."""
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "advanced",
        "include_answer": True,
        "max_results": 5,
    }
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("results", []):
        results.append({
            "title": item.get("title", "Untitled Source"),
            "url": item.get("url", ""),
            "content": item.get("content", ""),
            "raw_claims": [item.get("content", "")[:300]] if item.get("content") else [],
        })
    return results


def _call_serper_search(query: str, api_key: str) -> List[dict]:
    """Execute live search via Serper Google Search API."""
    url = "https://google.serper.dev/search"
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    payload = {"q": query, "num": 5}
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("organic", []):
        results.append({
            "title": item.get("title", "Untitled Source"),
            "url": item.get("link", ""),
            "content": item.get("snippet", ""),
            "raw_claims": [item.get("snippet", "")] if item.get("snippet") else [],
        })
    return results


def get_mock_search_results(query: str) -> List[dict]:
    """
    Deterministic mock web search results tailored for tests and offline execution.
    Contains both primary sources and secondary benchmark articles.
    """
    q_lower = query.lower()

    if "spanner" in q_lower or "aurora" in q_lower or "database" in q_lower:
        return [
            {
                "title": "Google Cloud Spanner High Availability & Multi-Region SLAs",
                "url": "https://cloud.google.com/spanner/docs/sla",
                "content": "Cloud Spanner multi-region instance configurations provide 99.999% availability with zero planned downtime and synchronous cross-region data replication.",
                "raw_claims": [
                    "Cloud Spanner provides five nines (99.999%) availability for multi-region configurations.",
                    "Replication across regions is synchronous using Paxos consensus, preventing data loss on regional disruption."
                ],
            },
            {
                "title": "AWS Aurora Global Database Features and SLA",
                "url": "https://aws.amazon.com/rds/aurora/sla/",
                "content": "Amazon Aurora Global Database provides replication latency under 1 second and up to 99.99% availability for multi-region clusters with sub-minute disaster recovery.",
                "raw_claims": [
                    "Amazon Aurora Global Database guarantees up to 99.99% availability SLA.",
                    "Disaster recovery failover can be executed in under 1 minute with sub-second replication latency."
                ],
            },
            {
                "title": "InfoQ Enterprise Database Benchmark: Distributed SQL vs Aurora Global",
                "url": "https://www.infoq.com/articles/distributed-sql-aurora-spanner-benchmark/",
                "content": "Independent benchmark indicates Spanner delivers higher write consistency at 30-40% higher baseline cost, while Aurora offers lower entry pricing but higher cross-region replica overhead under heavy write load.",
                "raw_claims": [
                    "Spanner exhibits zero replica lag under heavy cross-region transactions due to TrueTime consensus.",
                    "Aurora entry cost is 30% lower for single-region workloads with gradual cost scaling for read replicas."
                ],
            },
        ]
    elif "cost" in q_lower or "pricing" in q_lower or "budget" in q_lower:
        return [
            {
                "title": "Official Cloud Infrastructure Cost Calculator & Tiered Rates",
                "url": "https://cloud.google.com/pricing/calculator",
                "content": "Committed use discounts (CUD) provide up to 57% savings on 3-year commitments for predictable enterprise database and compute workloads.",
                "raw_claims": [
                    "3-year enterprise commitments yield between 45% and 57% cost reduction compared to on-demand hourly pricing.",
                    "Data egress charges between cross-region zones range from $0.01 to $0.02 per gigabyte."
                ],
            },
            {
                "title": "Gartner Research: Cloud Database TCO Comparative Study",
                "url": "https://www.gartner.com/en/documents/database-tco-analysis",
                "content": "Enterprises migrating legacy relational databases to managed cloud services observe average 3-year TCO reduction of 28% despite higher storage IOPS charges.",
                "raw_claims": [
                    "Managed database operational savings offset infrastructure unit fees by 28% over 36 months."
                ],
            },
        ]
    else:
        return [
            {
                "title": "Industry Architecture Review: Standard Operating Guidelines",
                "url": "https://www.infoq.com/articles/enterprise-architecture-guidelines/",
                "content": "Standardized criteria across reliability, team capability, and operational expenditure dictate migration feasibility.",
                "raw_claims": [
                    "Cross-functional architectural audits recommend verifying operational failover SLA prior to committing contract negotiations."
                ],
            },
            {
                "title": "NIST Technical Guidelines on Cloud Resilience & High Availability",
                "url": "https://csrc.nist.gov/publications/detail/sp/800-145/final",
                "content": "Cloud resilience architectures require documented Recovery Point Objective (RPO) and Recovery Time Objective (RTO) verification.",
                "raw_claims": [
                    "Critical systems must establish verified multi-region recovery objectives with periodic automated DR drills."
                ],
            },
        ]


def execute_web_search(query: str, force_mock: bool = False) -> List[dict]:
    """
    Execute web search against the configured provider:
    - Checks settings.search_provider ('tavily', 'serper', 'mock').
    - If provider is not mock and credentials are missing, raises SearchProviderNotConfiguredError.
    - If force_mock is True, runs deterministic mock provider.
    """
    provider = (settings.search_provider or "tavily").strip().lower()

    if force_mock or provider == "mock":
        logger.info(f"Using mock web search provider for query: '{query}'")
        return get_mock_search_results(query)

    api_key = settings.search_api_key or settings.tavily_api_key or settings.serper_api_key

    if provider == "tavily":
        tavily_key = settings.tavily_api_key or settings.search_api_key
        if not tavily_key or not tavily_key.strip():
            raise SearchProviderNotConfiguredError(
                provider="tavily",
                message=(
                    "Web search provider 'tavily' is not configured. "
                    "Please set SEARCH_API_KEY or TAVILY_API_KEY in backend/.env, "
                    "or pass force_mock=true to use the deterministic test provider."
                ),
            )
        try:
            return _call_tavily_search(query, tavily_key)
        except Exception as exc:
            logger.error(f"Tavily search API error: {exc}")
            raise

    elif provider == "serper":
        serper_key = settings.serper_api_key or settings.search_api_key
        if not serper_key or not serper_key.strip():
            raise SearchProviderNotConfiguredError(
                provider="serper",
                message=(
                    "Web search provider 'serper' is not configured. "
                    "Please set SEARCH_API_KEY or SERPER_API_KEY in backend/.env, "
                    "or pass force_mock=true to use the deterministic test provider."
                ),
            )
        try:
            return _call_serper_search(query, serper_key)
        except Exception as exc:
            logger.error(f"Serper search API error: {exc}")
            raise

    else:
        # Default fallback if unknown provider configured
        raise SearchProviderNotConfiguredError(
            provider=provider,
            message=f"Unsupported or unconfigured search provider '{provider}'. Allowed: tavily, serper, mock.",
        )


def analyze_evidence_and_synthesize(
    gap_id: str,
    question: str,
    narrow_query: str,
    raw_results: List[dict],
) -> ResearchFindingItem:
    """
    Evaluate retrieved sources, classify provenance, prioritize primary sources,
    distinguish single-source from conflicting evidence, and enforce verification rules:
    CRITICAL INVARIANT: Never mark an unsupported or conflicting claim verified!
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    if not raw_results:
        # Unsupported: No sources retrieved
        return ResearchFindingItem(
            id=f"res_{gap_id}_{int(datetime.now(timezone.utc).timestamp())}",
            gap_id=gap_id,
            question=question,
            narrow_query=narrow_query,
            synthesis="No verified public documentation or factual evidence could be retrieved for this query.",
            consensus="unsupported",
            is_verified=False,  # Strict invariant
            sources=[],
            claims=[
                ResearchClaimItem(
                    claim="No empirical evidence found in retrieved search results.",
                    sources_count=0,
                    evidence_type="low_confidence",
                    consensus="unsupported",
                    is_verified=False,
                )
            ],
            created_at=now_iso,
        )

    # Process and classify each retrieved source
    sources: List[ResearchSourceItem] = []
    for item in raw_results:
        url = item.get("url", "")
        title = item.get("title", "Web Source")
        reliability = determine_source_reliability(url, title)
        claims_list = item.get("raw_claims", [])
        if not claims_list and item.get("content"):
            claims_list = [item.get("content")[:250]]

        sources.append(
            ResearchSourceItem(
                source_title=title,
                url=url,
                retrieval_timestamp=now_iso,
                relevant_claims=claims_list,
                reliability_label=reliability,
            )
        )

    # Sort sources: prefer primary sources first, then secondary, then community
    priority_order = {
        "primary_source": 1,
        "secondary_source": 2,
        "community_opinion": 3,
        "low_confidence": 4,
    }
    sources.sort(key=lambda s: priority_order.get(s.reliability_label, 5))

    # Extract individual claims from sources
    claim_items: List[ResearchClaimItem] = []
    primary_sources_count = sum(1 for s in sources if s.reliability_label == "primary_source")
    total_sources = len(sources)

    # Evaluate whether evidence is conflicting or corroborated
    all_claims_texts = []
    for s in sources:
        all_claims_texts.extend(s.relevant_claims)

    # Check for contradictions in claims (e.g. conflicting metrics or dispute statements)
    lower_texts = " ".join(all_claims_texts).lower()
    conflict_indicators = [
        "contradict",
        "conflicting",
        "disputed",
        "dispute",
        "inconsistent",
        "refuted",
        "disagree",
        "opposing claims",
    ]
    has_conflicts = any(indicator in lower_texts for indicator in conflict_indicators)

    for s in sources:
        for c in s.relevant_claims:
            is_primary = s.reliability_label == "primary_source"

            # Determine claim consensus
            if has_conflicts:
                claim_consensus = "conflicting_evidence"
                claim_verified = False  # NEVER mark conflicting verified
            elif total_sources >= 2 and (is_primary or primary_sources_count >= 1):
                claim_consensus = "corroborated"
                claim_verified = True
            elif is_primary:
                claim_consensus = "single_source"
                claim_verified = True  # Authoritative primary source without contradiction
            elif total_sources == 1:
                claim_consensus = "single_source"
                claim_verified = False  # Uncorroborated secondary/community claim remains unverified
            else:
                claim_consensus = "single_source"
                claim_verified = False

            claim_items.append(
                ResearchClaimItem(
                    claim=c,
                    sources_count=1,
                    evidence_type=s.reliability_label,
                    consensus=claim_consensus,
                    is_verified=claim_verified,
                )
            )

    # Overall finding consensus
    if has_conflicts:
        overall_consensus = "conflicting_evidence"
        overall_verified = False
    elif any(c.consensus == "corroborated" and c.is_verified for c in claim_items):
        overall_consensus = "corroborated"
        overall_verified = True
    elif any(c.is_verified for c in claim_items):
        overall_consensus = "single_source"
        overall_verified = True
    else:
        overall_consensus = "single_source"
        overall_verified = False

    # Synthesize human-readable factual summary citing preferred primary sources
    primary_cits = [f"{s.source_title} ({s.url})" for s in sources if s.reliability_label == "primary_source"]
    secondary_cits = [f"{s.source_title} ({s.url})" for s in sources if s.reliability_label != "primary_source"]

    synthesis_lines = []
    if claim_items:
        key_claims = [c.claim for c in claim_items[:3]]
        synthesis_lines.append(" ".join(key_claims))
    else:
        synthesis_lines.append(f"Retrieved {len(sources)} sources regarding {narrow_query}.")

    if primary_cits:
        synthesis_lines.append(f"Verified via primary sources: {'; '.join(primary_cits[:2])}.")
    elif secondary_cits:
        synthesis_lines.append(f"Derived from secondary industry sources: {'; '.join(secondary_cits[:2])}.")

    synthesis_text = " ".join(synthesis_lines)

    return ResearchFindingItem(
        id=f"res_{gap_id}_{int(datetime.now(timezone.utc).timestamp())}",
        gap_id=gap_id,
        question=question,
        narrow_query=narrow_query,
        synthesis=synthesis_text,
        consensus=overall_consensus,
        is_verified=overall_verified,
        sources=sources,
        claims=claim_items,
        created_at=now_iso,
    )
