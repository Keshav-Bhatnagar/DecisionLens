"""
Meeting Distraction & Tangent Filter Subsystem for DecisionLens.

Automatically filters off-topic chatter, social banter, lunch/coffee orders,
sports talk, and non-decision distractions from meeting transcripts and audio inputs,
ensuring that only high-signal technical and architectural content reaches the
decision pipeline, structuring engine, and RAG knowledge base.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings

logger = logging.getLogger("decisionlens.services.meeting_filter")

# Common social small-talk and distraction patterns (English and Hindi)
DISTRACTION_PATTERNS = [
    # Food, coffee, lunch, snacks, drinks
    r"\b(what['’]?s for lunch|order(ing)? (food|pizza|lunch|coffee|tea|biryani|burgers?)|did anyone eat|who wants coffee|chai peete hain|lunch break|grab a bite|snack time|get (thai|chinese|burgers?|food|lunch))\b",
    # Weather, weekend, small talk
    r"\b(how was (your|the) weekend|nice weather today|it['’]?s raining outside|plans for the weekend|happy friday|happy monday|how are the kids)\b",
    # Sports, games, movies, gossip
    r"\b(did (you|anyone) (watch|see) (the|that|yesterday['’]?s)?\s*(match|game|movie|series|cricket|football|ipl|super bowl)|score kya hua|who won yesterday|netflix|box office)\b",
    # Filler greetings / mic checks with no substance
    r"\b(can you hear me|am i audible|is my screen visible|test test 1 2 3|loud and clear)\b",
    # Random off-topic banter
    r"\b(traffic was terrible|commute was crazy|parking was full|bought a new car|flight was delayed)\b",
]

# High-signal technical and decision anchors
TECH_SIGNAL_KEYWORDS = {
    "architecture", "latency", "throughput", "database", "postgres", "sql", "nosql",
    "redis", "cache", "kafka", "queue", "api", "rest", "graphql", "grpc", "microservice",
    "monolith", "aws", "azure", "gcp", "cloud", "docker", "kubernetes", "k8s", "serverless",
    "lambda", "compute", "storage", "s3", "cost", "pricing", "budget", "billing",
    "scalability", "scale", "performance", "p99", "cpu", "ram", "memory", "io", "iops",
    "security", "compliance", "soc2", "gdpr", "encryption", "tls", "auth", "oauth",
    "token", "sre", "devops", "ci/cd", "deployment", "rollback", "migration", "failover",
    "sharding", "replica", "clustering", "concurrency", "deadlock", "thread", "async",
    "framework", "library", "sdk", "backend", "frontend", "infrastructure", "cluster",
    "sla", "slo", "downtime", "uptime", "outage", "monitoring", "telemetry", "prometheus",
    "grafana", "test", "benchmark", "trade-off", "tradeoff", "decision", "requirement",
}


@dataclass
class TangentSnippet:
    text: str
    reason: str
    speaker: Optional[str] = None
    start_char: int = 0
    end_char: int = 0


@dataclass
class FilterResult:
    cleaned_transcript: str
    removed_tangents: List[Dict[str, Any]]
    total_segments: int
    kept_segments: int
    signal_ratio: float


def _split_into_dialogue_segments(text: str) -> List[Tuple[Optional[str], str]]:
    """
    Split transcript into dialogue turns or sentence units.
    Preserves speaker tags (e.g., "Alice: ...", "[00:15] Bob: ...") when present.
    """
    if not text or not text.strip():
        return []

    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    segments: List[Tuple[Optional[str], str]] = []

    speaker_pattern = re.compile(
        r"^(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([A-Za-z0-9_\-\s]{2,25}):\s*(.*)$"
    )

    for line in lines:
        match = speaker_pattern.match(line)
        if match:
            speaker = match.group(1).strip()
            content = match.group(2).strip()
            if content:
                segments.append((speaker, content))
        else:
            # Split long paragraph by sentence boundaries if needed
            sentences = re.split(r"(?<=[.!?])\s+", line)
            for s in sentences:
                s = s.strip()
                if s:
                    segments.append((None, s))

    return segments


def _heuristic_is_distraction(text: str) -> Optional[str]:
    """Check if a segment matches common distraction/tangent patterns."""
    lower = text.lower().strip()

    # If it contains strong technical signal keywords, keep it even if casual words exist
    tokens = set(re.findall(r"\b[a-z0-9_\-\.]{2,}\b", lower))
    has_tech_signal = bool(tokens & TECH_SIGNAL_KEYWORDS)

    # Pure mic checks or call setup greetings with no technical payload
    if len(lower) < 65 and not has_tech_signal:
        if re.search(r"\b(hey team|good morning|good afternoon|good evening|hello everyone|can you hear me|am i audible|is my screen visible|test test 1 2 3|loud and clear)\b", lower):
            return "Call setup / mic check greeting"

    for pattern in DISTRACTION_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            # Overrule if it has significant tech context
            if has_tech_signal and len(lower) > 60:
                continue
            return "Social banter / off-topic tangent"

    # Very short uninformative interjections (e.g., "yeah", "hmm", "cool cool", "haha")
    if re.match(r"^(yeah|yep|yup|nope|cool|haha|lol|hmm|right|okay okay)[.!?]*$", lower):
        return "Low-signal conversational filler"

    return None


FILTER_SYSTEM_PROMPT = """You are DecisionLens's Technical Meeting Distraction Filter.
Your job is to separate technical decision signals from off-topic distractions and social chatter in meeting transcripts.

CONTEXT: The meeting is intended to evaluate and make a technical/engineering decision (architecture, technology stack, cloud pricing, scalability, performance, security, operational constraints).

INPUT: A list of numbered meeting dialogue segments.
OUTPUT: A JSON object classifying each segment (and optionally repairing phonetic Hinglish/ASR typos):
{
  "classifications": [
    {
      "index": 1,
      "is_distraction": true | false,
      "reason": "Technical requirement" | "Social banter" | "Off-topic lunch discussion" | "Mic check",
      "category": "technical" | "off_topic",
      "cleaned_text": "Clean Romanized Hinglish/English version of the segment with phonetic ASR errors repaired (omit or keep exact if already clean)."
    }
  ]
}

RULES:
1. KEEP (is_distraction=false): Any statement about architecture, code, cloud costs, databases, performance, timelines, engineering trade-offs, security, testing, or action items.
2. DISCARD (is_distraction=true): Small talk, food orders, weekend chat, sports, weather, unrelated project gossip, pure mic checks.
3. When in doubt on a technical point, KEEP it. Never discard a technical trade-off.
4. For kept segments with phonetic Hinglish or Indian-accent ASR typos (or Devanagari fragments), repair them cleanly into natural Romanized Hinglish/English in "cleaned_text" without inventing new facts or numbers."""


def _llm_classify_and_repair_segments(
    segments: List[Tuple[Optional[str], str]],
    decision_title: str = "",
    decision_context: str = "",
) -> Optional[Tuple[List[bool], Dict[int, str]]]:
    """
    Use LLM to classify segments and optionally repair phonetic Hinglish/ASR typos.
    Returns (is_distraction_list, {zero_based_idx: repaired_text}) when available.
    """
    from app.services.ai import call_gemini_direct_rest, get_llm_client_and_model

    client, model, provider = get_llm_client_and_model(task="structuring")
    if client is None:
        return None

    # Limit to batches of 40 segments to avoid prompt overflow
    segment_texts = []
    for idx, (speaker, content) in enumerate(segments, start=1):
        spk_label = f"{speaker}: " if speaker else ""
        segment_texts.append(f"[{idx}] {spk_label}{content}")

    user_prompt = (
        f"DECISION TOPIC: {decision_title or 'Technical Architecture & Engineering Decision'}\n"
        f"CONTEXT: {decision_context[:500]}\n\n"
        f"MEETING SEGMENTS:\n" + "\n".join(segment_texts[:40])
    )

    try:
        if provider == "gemini":
            gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
            content = call_gemini_direct_rest(
                model=model,
                system_prompt=FILTER_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                api_key=gemini_key,
                temperature=0.0,
            )
        else:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": FILTER_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.0,
            )
            content = response.choices[0].message.content

        clean = (content or "").strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```(?:json)?|```$", "", clean, flags=re.MULTILINE).strip()
        data = json.loads(clean)
        classifications = data.get("classifications", [])

        distraction_map = {}
        repaired_map: Dict[int, str] = {}
        for c in classifications:
            idx = int(c.get("index", 0))
            distraction_map[idx] = bool(c.get("is_distraction", False))
            repaired = (c.get("cleaned_text") or "").strip()
            if idx >= 1 and repaired:
                repaired_map[idx - 1] = repaired

        results = [distraction_map.get(i, False) for i in range(1, len(segments) + 1)]
        return results, repaired_map
    except Exception as exc:
        logger.warning(f"LLM meeting distraction classification failed: {exc}. Using heuristic classifier.")
        return None


def _llm_classify_segments(
    segments: List[Tuple[Optional[str], str]],
    decision_title: str = "",
    decision_context: str = "",
) -> Optional[List[bool]]:
    """
    Use LLM to classify segments when available.
    Returns list of booleans: True if segment is distraction, False if relevant.
    """
    res = _llm_classify_and_repair_segments(
        segments, decision_title=decision_title, decision_context=decision_context
    )
    return res[0] if res is not None else None


def filter_meeting_distractions(
    transcript: str,
    decision_title: str = "",
    decision_context: str = "",
    force_heuristics: bool = False,
) -> FilterResult:
    """
    Main entry point: filters out off-topic distractions and social chatter
    from a meeting transcript.

    Returns:
    - FilterResult with cleaned_transcript, removed_tangents, and metrics.
    """
    if not transcript or not transcript.strip():
        return FilterResult(
            cleaned_transcript="",
            removed_tangents=[],
            total_segments=0,
            kept_segments=0,
            signal_ratio=1.0,
        )

    segments = _split_into_dialogue_segments(transcript)
    if not segments:
        return FilterResult(
            cleaned_transcript=transcript.strip(),
            removed_tangents=[],
            total_segments=0,
            kept_segments=0,
            signal_ratio=1.0,
        )

    llm_classifications: Optional[List[bool]] = None
    repaired_texts: Dict[int, str] = {}
    if not force_heuristics and len(transcript) > 100:
        llm_res = _llm_classify_and_repair_segments(
            segments, decision_title=decision_title, decision_context=decision_context
        )
        if llm_res is not None:
            llm_classifications, repaired_texts = llm_res

    kept_lines: List[str] = []
    removed_tangents: List[Dict[str, Any]] = []

    for i, (speaker, content) in enumerate(segments):
        # 1. Heuristic check
        heuristic_reason = _heuristic_is_distraction(content)
        
        # 2. Check classification
        is_distraction = False
        reason = ""

        if heuristic_reason:
            is_distraction = True
            reason = heuristic_reason
        elif llm_classifications and i < len(llm_classifications) and llm_classifications[i]:
            is_distraction = True
            reason = "Off-topic tangent identified by context analyzer"

        if is_distraction:
            removed_tangents.append(
                {
                    "speaker": speaker or "Unknown",
                    "text": content,
                    "reason": reason,
                    "index": i + 1,
                }
            )
        else:
            final_text = repaired_texts.get(i) or content
            line = f"{speaker}: {final_text}" if speaker else final_text
            kept_lines.append(line)

    total_count = len(segments)
    kept_count = len(kept_lines)
    signal_ratio = round(kept_count / total_count, 3) if total_count > 0 else 1.0

    # If everything was filtered (rare edge case), fall back to original text with a warning
    cleaned_transcript = "\n".join(kept_lines).strip()
    if not cleaned_transcript and transcript.strip():
        logger.warning("Distraction filter removed all content; reverting to original transcript.")
        cleaned_transcript = transcript.strip()
        signal_ratio = 1.0

    return FilterResult(
        cleaned_transcript=cleaned_transcript,
        removed_tangents=removed_tangents,
        total_segments=total_count,
        kept_segments=kept_count,
        signal_ratio=signal_ratio,
    )
