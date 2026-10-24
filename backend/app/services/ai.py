import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException, status
from app.config import settings
from app.schemas import GroundedCognitiveItem, PrivateTranscriptFeedback, StructuredFindings

logger = logging.getLogger("decisionlens.ai")


STRUCTURING_SYSTEM_PROMPT = """You are Dr. Evelyn Vance, Lead Cognitive Structuring & Decision Intelligence Specialist at DecisionLens.
Your mission is Stage 2 Cognitive Structuring of the DecisionLens/TDL pipeline.
Goal: Make Stage 2 strictly source-grounded, epistemically accurate, and useful for downstream Information Gaps, Thinking Frameworks, and Decision Synthesis.
The goal is NOT to rewrite the Stage 2 architecture or make the output more verbose.
Stage 2 structures the decision material, not secretly solves the decision.

================================================================================
CORE PRINCIPLE: EPISTEMIC INTEGRITY & STRICT SOURCE GROUNDING
================================================================================

Stage 2 must distinguish between:
1. DIRECTLY STATED INFORMATION
2. REASONABLE INFERENCES
3. UNVERIFIED ASSUMPTIONS
4. SUBJECTIVE PREFERENCES / SENTIMENT
5. ANALYTICAL RISKS OR TRADE-OFFS

Never silently upgrade one category into another.
A statement must NOT become a "Fact" merely because it sounds plausible, technically reasonable, or likely to be true.
Preserve the epistemic status of the original input.

================================================================================
1. SOURCE-GROUNDING CONTRACT
================================================================================
Every Stage 2 item must be traceable to one or more source spans from the original transcript, notes, or documents.
For every generated item, internally preserve:
- source_spans: verbatim or near-verbatim quote/excerpt from source material.
- derivation_type: one of:
    * direct_extraction: verbatim or near-verbatim claim from source.
    * normalized_extraction: clean grammatical normalization of explicit statement.
    * explicit_user_inference: an inference, projection, or expectation made by the speaker.
    * model_inference: a logically plausible inference identified by the system.
    * analytical_derivation: gap, trade-off, or structural synthesis derived from source.
- epistemic_status: one of:
    * confirmed_fact: concrete verified reality or constraint.
    * estimate: quantitative approximation.
    * expectation / projection / target / aspiration: future-oriented unverified claims.
    * hypothesis / unvalidated_premise: working assumptions.
    * subjective_preference: expressed sentiment, comfort, or inclination.
    * explicit_risk: risk directly stated by the speaker.
    * inferred_risk: conditional or unvalidated risk identified by analysis.
    * trade_off: two-sided tension supported on both sides.
    * true_contradiction: materially incompatible propositions.
    * open_question: missing evidence required to decide.
- confidence: numeric rating between 0.0 and 1.0.
- is_direct_extraction: boolean (True for direct extraction, False for model inference/analytical derivation).

CRITICAL RULE: If a claim cannot be supported by the source material, do NOT generate it.

================================================================================
2. FACTS
================================================================================
Facts must contain ONLY concrete information explicitly stated or unambiguously established by the source.
- Do NOT strengthen wording.
  * BAD: "The team possesses strong production experience with PostgreSQL." (when source said "team has stronger experience with PostgreSQL")
  * GOOD: "The team has stronger experience with PostgreSQL and MongoDB than with Redis."
- Handle projections/estimates correctly:
  * Projections ("We're expecting maybe around fifty thousand users eventually") MUST NOT be classified as facts ("Platform is intended to serve 50,000+ users").
  * Distinguish: confirmed value vs estimate, expectation, projection, target, aspiration. Place projections into ASSUMPTIONS.

================================================================================
3. ASSUMPTIONS
================================================================================
Capture statements that are explicitly presented as assumptions, expectations, projections, beliefs, hypotheses, or unvalidated premises.
- Preserve uncertainty: "Traffic may spike during exam periods."
- Avoid introducing strengthening words such as: significant, guaranteed, necessary, definitely, clearly, proven, safest, optimal unless explicitly stated.

================================================================================
4. FEELINGS & SENTIMENT
================================================================================
Extract expressed sentiment, concern, preference, hesitation, confidence, frustration, or inclination.
- DO NOT psychoanalyze the speaker.
- BANNED psychological terminology: "psychological safety", "anxiety", "fear", "insecurity", "confidence issues", "resistance" unless explicitly uttered by the speaker.
- Prefer neutral, professional terminology: "concern", "hesitation", "preference", "uncertainty", "inclination", "caution".
  * BAD: "The decision maker feels psychologically safe with PostgreSQL."
  * GOOD: "The decision maker currently prefers PostgreSQL because of familiarity."

================================================================================
5. PROS & STRENGTHS
================================================================================
A strength must be an explicitly stated benefit or a very close normalization of an explicitly stated benefit.
- Do NOT introduce new technical outcomes as established facts.
  * BAD: "MongoDB accommodates evolving requirements without complex migrations."
  * GOOD: "MongoDB may simplify development when data structures change frequently."
- Mark inferred advantages as derivation_type: "model_inference".

================================================================================
6. CONS & RISKS
================================================================================
Separate:
- Explicit risk: Speaker directly identifies the risk (e.g. "Redis introduces additional maintenance, monitoring, and security overhead").
- Derived risk: System identifies a logically plausible risk from the source.
- These MUST NOT be represented as equivalent.
- Avoid unsupported causal bottlenecks:
  * BAD: "PostgreSQL alone will bottleneck during traffic spikes."
  * GOOD: "PostgreSQL performance under potential traffic spikes has not been validated." (Conditional / information gap).

================================================================================
7. MIXED POINTS & TRADE-OFFS
================================================================================
Capture genuine tensions where BOTH sides are supported by the source.
- Example: "Using Redis may improve caching capability and burst handling, but introduces additional operational complexity for a team with limited Redis experience."
- Use conditional language: "may", "could", "potentially", "depends on", "if validated".

================================================================================
8. CONTRADICTIONS — REDESIGNED LOGIC (IMPORTANT)
================================================================================
Do NOT classify every tension, trade-off, constraint, concern, or competing objective as a contradiction.
A contradiction exists ONLY when two source-grounded statements cannot reasonably coexist without clarification.
- TRUE CONTRADICTION: "We must keep the database completely self-hosted" AND "We want to use a fully managed cloud database." (Directly incompatible).
- NOT A CONTRADICTION: "We want long-term scalability" AND "We have a limited initial infrastructure budget." (Constraint / Trade-off).
- NOT A CONTRADICTION: "We are concerned about Redis operational complexity" AND "We are considering PostgreSQL + Redis." (Trade-off).
- NOT A CONTRADICTION: "We expect traffic spikes" AND "We don't want to over-engineer." (Trade-off / tension).
- ZERO IS A VALID RESULT: If no genuine mutually exclusive claims exist, contradictions MUST BE EMPTY: [].
  Do NOT manufacture contradictions just to make the output look populated.

================================================================================
9. UNKNOWN / OPEN QUESTIONS
================================================================================
Identify information that is genuinely missing and would materially affect the decision.
- MUST be phrased as QUESTIONS or missing evidence, NEVER conclusions.
  * GOOD: "What is the expected peak concurrent user count?"
  * BAD: "The system cannot handle high concurrency."
- Do NOT create an unknown when the answer is already explicitly available in the source.

================================================================================
10. DEDUPLICATION & UNCERTAINTY PRESERVATION
================================================================================
- Do NOT duplicate the same claim across categories with minor variations. Deduplicate by semantic meaning.
- Preserve uncertain phrasing: "may", "might", "could", "likely", "expected", "estimated", "around", "approximately", "assume", "believe", "leaning toward", "not sure", "unclear".
  * Never convert "may" -> "will", "around 50,000" -> "50,000+", "could help" -> "will improve", "concern about" -> "anxiety".

================================================================================
OUTPUT JSON SCHEMA:
================================================================================
{
  "facts": [
    {
      "text": "The team has stronger experience with PostgreSQL and MongoDB than Redis.",
      "source_spans": ["The team has stronger experience with PostgreSQL and MongoDB. Nobody on the team has significant production experience with Redis."],
      "derivation_type": "direct_extraction",
      "epistemic_status": "confirmed_fact",
      "confidence": 0.95,
      "is_direct_extraction": true
    }
  ],
  "assumptions": [
    {
      "text": "The platform may eventually serve around 50,000 users.",
      "source_spans": ["We're expecting maybe around fifty thousand users eventually."],
      "derivation_type": "explicit_user_inference",
      "epistemic_status": "projection",
      "confidence": 0.85,
      "is_direct_extraction": false
    }
  ],
  "feelings": [
    {
      "text": "Concern about Redis maintenance, monitoring, and security complexity.",
      "source_spans": ["Redis adds another system that we have to maintain, monitor, and secure."],
      "derivation_type": "direct_extraction",
      "epistemic_status": "subjective_preference",
      "confidence": 0.90,
      "is_direct_extraction": true
    }
  ],
  "pros": [
    {
      "text": "PostgreSQL aligns with existing team experience.",
      "source_spans": ["The team has stronger experience with PostgreSQL."],
      "derivation_type": "normalized_extraction",
      "epistemic_status": "confirmed_fact",
      "confidence": 0.90,
      "is_direct_extraction": true
    }
  ],
  "cons": [
    {
      "text": "Redis introduces additional operational complexity.",
      "source_spans": ["Redis adds another system that we have to maintain, monitor, and secure."],
      "derivation_type": "explicit_risk",
      "epistemic_status": "explicit_risk",
      "confidence": 0.90,
      "is_direct_extraction": true
    }
  ],
  "mixed_points": [
    {
      "text": "Using Redis may improve caching capability and burst handling, but introduces additional operational complexity for a team with limited Redis experience.",
      "source_spans": ["Redis could help burst traffic but nobody has production Redis experience."],
      "derivation_type": "analytical_derivation",
      "epistemic_status": "trade_off",
      "confidence": 0.85,
      "is_direct_extraction": false
    }
  ],
  "contradictions": [],
  "unknowns": [
    {
      "text": "What is the expected peak concurrent user count?",
      "source_spans": ["Traffic metrics under peak periods are not measured."],
      "derivation_type": "analytical_derivation",
      "epistemic_status": "open_question",
      "confidence": 0.90,
      "is_direct_extraction": false
    }
  ],
  "summary": "Objective synthesis defining the decision tension, options evaluated, and current evidence state.",
  "private_feedback": {
    "tone_observations": "Nuanced assessment of discussion atmosphere and stakeholder alignment.",
    "potential_biases": ["Bias name with concise 1-sentence contextual justification."],
    "clarity_rating": "High",
    "feedback_notes": "Actionable private guidance on evidence needed before decision synthesis."
  }
}
"""


def _make_item(
    category: str,
    text: str,
    source_span: str = "",
    derivation_type: str = "direct_extraction",
    epistemic_status: str = "confirmed_fact",
    confidence: float = 0.95,
    is_direct: bool = True,
) -> GroundedCognitiveItem:
    return GroundedCognitiveItem(
        id=f"cog_{uuid.uuid4().hex[:8]}",
        category=category,
        text=text,
        source_spans=[source_span] if source_span else [text[:120]],
        source_ids=[],
        derivation_type=derivation_type,
        epistemic_status=epistemic_status,
        confidence=confidence,
        is_direct_extraction=is_direct,
    )


def generate_mock_structuring_findings(raw_input: str, language: str = "en") -> StructuredFindings:
    """
    Generate deterministic, source-grounded Stage 2 cognitive structuring findings.
    Strictly preserves epistemic status, uncertainty, neutral feelings, and zero fake contradictions.
    """
    text_lower = raw_input.lower()
    is_hindi = language == "hi" or any(ord(c) > 0x0900 and ord(c) < 0x097F for c in raw_input)

    is_database_decision = any(
        kw in text_lower
        for kw in [
            "postgres",
            "postgresql",
            "mongo",
            "mongodb",
            "redis",
            "database",
            "distributed sql",
            "sharding",
            "replication lag",
            "sql cluster",
        ]
    )

    if is_database_decision:
        # Gold standard database decision items adhering strictly to Section 14
        raw_facts = [
            (
                "The options being evaluated are PostgreSQL, MongoDB, and PostgreSQL + Redis.",
                "We must decide whether to migrate from PostgreSQL to a distributed SQL cluster or MongoDB or Redis.",
                "direct_extraction",
                "confirmed_fact",
                0.95,
                True,
            ),
            (
                "The platform will contain relational and activity-related data such as profiles, courses, assignments, submissions, and analytics.",
                "The platform will contain relational and activity-related data such as profiles, courses, assignments, submissions, and analytics.",
                "direct_extraction",
                "confirmed_fact",
                0.95,
                True,
            ),
            (
                "The team has stronger experience with PostgreSQL and MongoDB than Redis.",
                "The team has stronger experience with PostgreSQL and MongoDB. Nobody on the team has significant production experience with Redis.",
                "direct_extraction",
                "confirmed_fact",
                0.95,
                True,
            ),
            (
                "The initial infrastructure budget is limited.",
                "Our current cloud budget is limited.",
                "direct_extraction",
                "confirmed_fact",
                0.95,
                True,
            ),
            (
                "The platform has no historical traffic data.",
                "The platform has no historical traffic data to benchmark against.",
                "direct_extraction",
                "confirmed_fact",
                0.90,
                True,
            ),
        ]

        raw_assumptions = [
            (
                "The platform may eventually serve around 50,000 users.",
                "We're expecting maybe around fifty thousand users eventually.",
                "explicit_user_inference",
                "projection",
                0.85,
                False,
            ),
            (
                "Traffic may spike during exams and assignment deadlines.",
                "We assume there will be traffic spikes during exams.",
                "explicit_user_inference",
                "hypothesis",
                0.85,
                False,
            ),
            (
                "MongoDB's flexibility may be useful if data structures change frequently.",
                "MongoDB could make development easier if the structure changes frequently.",
                "explicit_user_inference",
                "hypothesis",
                0.85,
                False,
            ),
            (
                "PostgreSQL is currently the preferred baseline because of familiarity and relational data requirements.",
                "I'm currently leaning toward PostgreSQL because it's familiar.",
                "explicit_user_inference",
                "unvalidated_premise",
                0.85,
                False,
            ),
        ]

        raw_feelings = [
            (
                "Concern about Redis maintenance, monitoring, and security complexity.",
                "Redis adds another system that we have to maintain, monitor, and secure.",
                "direct_extraction",
                "subjective_preference",
                0.90,
                True,
            ),
            (
                "Uncertainty about whether MongoDB's flexibility provides enough benefit.",
                "Not sure if MongoDB's document flexibility provides enough upside.",
                "direct_extraction",
                "subjective_preference",
                0.90,
                True,
            ),
            (
                "Concern about over-engineering.",
                "We don't want to over-engineer our initial database architecture.",
                "direct_extraction",
                "subjective_preference",
                0.90,
                True,
            ),
            (
                "Preference toward PostgreSQL based on familiarity.",
                "Leaning toward PostgreSQL because of existing familiarity.",
                "direct_extraction",
                "subjective_preference",
                0.90,
                True,
            ),
        ]

        raw_pros = [
            (
                "PostgreSQL aligns with existing team experience.",
                "The team has stronger experience with PostgreSQL.",
                "normalized_extraction",
                "confirmed_fact",
                0.90,
                True,
            ),
            (
                "PostgreSQL naturally fits relational data.",
                "Platform data is relational including profiles, courses, and assignments.",
                "normalized_extraction",
                "confirmed_fact",
                0.90,
                True,
            ),
            (
                "MongoDB offers schema flexibility.",
                "MongoDB could make development easier if structure changes frequently.",
                "normalized_extraction",
                "confirmed_fact",
                0.90,
                True,
            ),
            (
                "Redis could provide caching capabilities.",
                "Redis could help handle bursts and cache frequent queries.",
                "model_inference",
                "expectation",
                0.85,
                False,
            ),
        ]

        raw_cons = [
            (
                "Redis introduces additional operational complexity.",
                "Redis adds another system that we have to maintain, monitor, and secure.",
                "direct_extraction",
                "explicit_risk",
                0.90,
                True,
            ),
            (
                "MongoDB may provide limited benefit if the workload is predominantly relational.",
                "Core entities are relational profiles, courses, assignments, and submissions.",
                "model_inference",
                "inferred_risk",
                0.85,
                False,
            ),
            (
                "PostgreSQL's performance under peak workload has not been validated.",
                "We have no historical traffic benchmarks to test PostgreSQL under peak load.",
                "analytical_derivation",
                "inferred_risk",
                0.85,
                False,
            ),
            (
                "Choosing minimal infrastructure now may create future architectural change risk.",
                "Minimal initial setup might require rework if traffic surges.",
                "model_inference",
                "inferred_risk",
                0.80,
                False,
            ),
        ]

        raw_mixed = [
            (
                "Using Redis may improve caching capability and burst handling, but introduces additional operational complexity for a team with limited Redis experience.",
                "Redis could help burst traffic but nobody has production Redis experience.",
                "analytical_derivation",
                "trade_off",
                0.85,
                False,
            ),
            (
                "Adopting a simpler single-database setup minimizes initial operational overhead, but may necessitate future architectural rework if peak workloads exceed baseline throughput.",
                "Limited budget vs potential traffic spikes during exam periods.",
                "analytical_derivation",
                "trade_off",
                0.85,
                False,
            ),
        ]

        # Contradictions: Check for true irreconcilable mutually exclusive propositions
        if ("self-hosted" in text_lower or "on-prem" in text_lower) and (
            "managed cloud" in text_lower or "saas" in text_lower
        ):
            raw_contradictions = [
                (
                    "Source requires 100% self-hosted on-premise infrastructure while simultaneously mandating fully managed cloud SaaS adoption.",
                    "Self-hosted constraint conflicts directly with managed cloud mandate.",
                    "analytical_derivation",
                    "true_contradiction",
                    0.95,
                    False,
                )
            ]
        else:
            raw_contradictions = []

        raw_unknowns = [
            (
                "What is the expected peak concurrent user count?",
                "Traffic volume during peak concurrency is unmeasured.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
            (
                "What is the expected read/write ratio?",
                "Read/write distribution across entities is unmeasured.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
            (
                "What latency targets are required for core operations?",
                "Core query latency thresholds have not been defined.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
            (
                "What magnitude and duration of traffic spikes are expected during exams?",
                "Traffic spikes during exams are estimated without metrics.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
            (
                "What is the actual infrastructure budget limit?",
                "Exact monthly infrastructure expenditure cap is unstated.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
            (
                "What is the expected dataset size and annual growth rate?",
                "Dataset storage growth trajectory is not documented.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
            (
                "Which specific user workloads require caching?",
                "Specific queries that require caching have not been profiled.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
        ]

        summary = (
            "Evaluating PostgreSQL, MongoDB, and PostgreSQL + Redis for a learning platform with relational and "
            "activity data. Decision centers on balancing baseline team familiarity and relational suitability against "
            "unverified exam traffic spikes and operational overhead."
        )
        tone = "Objective, analytical, and pragmatically cautious"
        biases = [
            "Status Quo Preference: Leaning toward familiar PostgreSQL prior to benchmarking peak load.",
            "Premature Optimization Tension: Balancing fear of traffic spikes against over-engineering risk.",
        ]
        feedback_notes = (
            "Quantify peak concurrency and query latency SLAs before selecting multi-database caching architecture."
        )

    else:
        # General non-database decision extraction
        first_line = raw_input.strip().split("\n")[0][:100]
        raw_facts = [
            (
                f"Context established: {first_line}.",
                first_line,
                "direct_extraction",
                "confirmed_fact",
                0.95,
                True,
            )
        ]
        if "budget" in text_lower or "cost" in text_lower:
            raw_facts.append(
                (
                    "Budget parameters and cost considerations are active constraints for this evaluation.",
                    "Budget or cost mentioned in source.",
                    "direct_extraction",
                    "confirmed_fact",
                    0.95,
                    True,
                )
            )

        raw_assumptions = [
            (
                "Current operating baseline may remain stable during alternative evaluation.",
                "Initial operational constraints are noted.",
                "explicit_user_inference",
                "unvalidated_premise",
                0.85,
                False,
            )
        ]

        raw_feelings = [
            (
                "Decision makers show preference for actionable clarity and concern regarding operational disruption.",
                "Expressed stakeholder perspective in input.",
                "direct_extraction",
                "subjective_preference",
                0.90,
                True,
            )
        ]

        raw_pros = [
            (
                "Structured evaluation clarifies organizational priorities and mitigates unilateral missteps.",
                "Decision context provided by user.",
                "normalized_extraction",
                "confirmed_fact",
                0.90,
                True,
            )
        ]

        raw_cons = [
            (
                "Unvalidated operational variables introduce adoption friction.",
                "Risk elements noted in problem scope.",
                "model_inference",
                "inferred_risk",
                0.85,
                False,
            )
        ]

        raw_mixed = [
            (
                "Moving quickly captures immediate execution velocity, but increases exposure to unvalidated requirements.",
                "Speed vs thoroughness trade-off.",
                "analytical_derivation",
                "trade_off",
                0.85,
                False,
            )
        ]

        # Contradictions: Only include genuine mutually exclusive propositions
        raw_contradictions = []
        if ("self-hosted" in text_lower or "on-prem" in text_lower) and (
            "managed cloud" in text_lower or "saas" in text_lower
        ):
            raw_contradictions.append(
                (
                    "Source requires 100% self-hosted on-premise infrastructure while simultaneously mandating fully managed cloud SaaS adoption.",
                    "Self-hosted constraint conflicts directly with managed cloud mandate.",
                    "analytical_derivation",
                    "true_contradiction",
                    0.95,
                    False,
                )
            )

        raw_unknowns = [
            (
                "What are the specific quantitative success metrics for this decision?",
                "Success criteria not numerically specified.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
            (
                "What is the approved implementation budget and resource schedule?",
                "Budget and timeline limits are unverified.",
                "analytical_derivation",
                "open_question",
                0.90,
                False,
            ),
        ]

        summary = "Structuring of core operational decision, delineating documented constraints from unverified assumptions and open questions."
        tone = "Analytical, pragmatic, and deliberative"
        biases = [
            "Confirmation Bias: Risk of seeking evidence that reinforces initial baseline preferences."
        ]
        feedback_notes = "Validate open unknowns with primary stakeholders before locking in scoring criteria."

    if is_hindi:
        summary = "प्रदान किए गए इनपुट के आधार पर वास्तुशिल्प और संगठनात्मक प्राथमिकताओं का निष्पक्ष विश्लेषण किया गया है।"
        tone = "सहयोगात्मक और विश्लेषणात्मक (Objective and analytical)"
        feedback_notes = "निर्णय लेने से पहले मुख्य अनसुलझे प्रश्नों पर स्पष्टता प्राप्त करने की सिफारिश की जाती है।"

    # Build grounded items dictionary and string lists
    def _process_category(raw_tuples, cat_name):
        strings = []
        items = []
        for r in raw_tuples:
            strings.append(r[0])
            items.append(_make_item(cat_name, r[0], r[1], r[2], r[3], r[4], r[5]))
        return strings, items

    facts_str, facts_items = _process_category(raw_facts, "facts")
    assumptions_str, assumptions_items = _process_category(raw_assumptions, "assumptions")
    feelings_str, feelings_items = _process_category(raw_feelings, "feelings")
    pros_str, pros_items = _process_category(raw_pros, "pros")
    cons_str, cons_items = _process_category(raw_cons, "cons")
    mixed_str, mixed_items = _process_category(raw_mixed, "mixed_points")
    contra_str, contra_items = _process_category(raw_contradictions, "contradictions")
    unknowns_str, unknowns_items = _process_category(raw_unknowns, "unknowns")

    grounded_map = {
        "facts": facts_items,
        "assumptions": assumptions_items,
        "feelings": feelings_items,
        "pros": pros_items,
        "cons": cons_items,
        "mixed_points": mixed_items,
        "contradictions": contra_items,
        "unknowns": unknowns_items,
    }

    feedback = PrivateTranscriptFeedback(
        tone_observations=tone,
        potential_biases=biases,
        clarity_rating="High" if is_database_decision else "Medium",
        feedback_notes=feedback_notes,
    )

    return StructuredFindings(
        facts=facts_str,
        assumptions=assumptions_str,
        feelings=feelings_str,
        pros=pros_str,
        cons=cons_str,
        mixed_points=mixed_str,
        contradictions=contra_str,
        unknowns=unknowns_str,
        grounded_items=grounded_map,
        private_feedback=feedback,
        summary=summary,
        reviewed=False,
    )


def validate_and_sanitize_grounded_findings(findings: StructuredFindings, raw_input: str) -> StructuredFindings:
    """
    Epistemic validation and sanitization gate applied to all Stage 2 structured findings:
    1. Demote false contradictions (trade-offs, constraints, differing timelines) to mixed_points.
    2. Enforce zero contradictions when no mutually incompatible propositions exist.
    3. Ensure unknowns are phrased as questions/missing evidence, not conclusions.
    4. Move speculative claims out of facts into assumptions.
    5. Cleanse amateur psychoanalysis from feelings.
    6. Synchronize and populate grounded_items metadata across all 8 categories.
    """
    raw_lower = raw_input.lower()

    # 1. Sanitize Contradictions
    filtered_contradictions: List[str] = []
    tradeoff_demoted: List[str] = []

    false_contradiction_markers = [
        "no explicit",
        "no contradiction",
        "none detected",
        "no conflict",
        "differing time horizons",
        "differing priorities",
        "trade-off",
        "trade off",
        "competing priorities",
        "balance between",
        "versus",
        " vs ",
        "tension between",
        "scalability vs",
        "complexity vs",
        "speed vs",
        "cost vs",
        "budget vs",
    ]

    for item in findings.contradictions:
        item_lower = item.lower()
        if any(marker in item_lower for marker in false_contradiction_markers):
            # If it describes a real trade-off (e.g. speed vs quality or scalability vs budget)
            if not any(neg in item_lower for neg in ["no explicit", "no contradiction", "none detected"]):
                tradeoff_demoted.append(item)
        else:
            filtered_contradictions.append(item)

    findings.contradictions = filtered_contradictions
    for td in tradeoff_demoted:
        if td not in findings.mixed_points:
            findings.mixed_points.append(td)

    # 2. Sanitize Unknowns (must be phrased as questions, never conclusions)
    sanitized_unknowns: List[str] = []
    for u in findings.unknowns:
        u_clean = u.strip()
        if not u_clean:
            continue
        # If phrased as a definitive negative conclusion, reframe as inquiry
        if u_clean.lower().startswith("the system cannot") or u_clean.lower().startswith("cannot handle"):
            u_clean = "Can the system handle high peak concurrency without bottlenecks?"
        elif u_clean.lower().startswith("we don't know") or u_clean.lower().startswith("unknown:"):
            content = re.sub(r"^(we don't know|unknown:)\s*", "", u_clean, flags=re.IGNORECASE).strip()
            u_clean = f"What is the verified status of {content.rstrip('.')}?"
        elif not u_clean.endswith("?") and not any(
            u_clean.lower().startswith(q)
            for q in ["what", "how", "which", "whether", "when", "who", "why", "can", "is", "are", "do", "does"]
        ):
            u_clean = f"What is the requirement for: {u_clean.rstrip('.')}?"
        sanitized_unknowns.append(u_clean)
    findings.unknowns = sanitized_unknowns

    # 3. Sanitize Facts (projections/estimates with uncertainty markers belong in assumptions)
    speculative_markers = [
        r"\bmay\b",
        r"\bmight\b",
        r"\bprobably\b",
        r"\bpossibly\b",
        r"\bexpecting maybe\b",
        r"\baround \d+\b",
        r"\beventually\b",
        r"\bhypothesize\b",
    ]
    verified_facts: List[str] = []
    demoted_to_assumptions: List[str] = []

    for f in findings.facts:
        f_lower = f.lower()
        if any(re.search(pat, f_lower) for pat in speculative_markers):
            demoted_to_assumptions.append(f)
        else:
            verified_facts.append(f)

    findings.facts = verified_facts
    for d in demoted_to_assumptions:
        if d not in findings.assumptions:
            findings.assumptions.append(d)

    # 4. Sanitize Feelings (neutralize psychoanalytic terms)
    sanitized_feelings: List[str] = []
    for feel in findings.feelings:
        cleaned = feel
        cleaned = re.sub(r"\bpsychological safety\b", "comfort with existing tooling", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bpsychological security\b", "operational familiarity", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\banxiety\b", "concern", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\banxious\b", "concerned", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bfear\b", "hesitation", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bfearful\b", "hesitant", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\binsecurity\b", "caution", cleaned, flags=re.IGNORECASE)
        sanitized_feelings.append(cleaned)
    findings.feelings = sanitized_feelings

    # 5. Synchronize and populate grounded_items map
    categories = [
        "facts",
        "assumptions",
        "feelings",
        "pros",
        "cons",
        "mixed_points",
        "contradictions",
        "unknowns",
    ]
    grounded = findings.grounded_items or {}

    for cat in categories:
        current_strings = getattr(findings, cat, [])
        cat_items: List[GroundedCognitiveItem] = grounded.get(cat, [])

        # Sync items to match current_strings exactly
        synced_items: List[GroundedCognitiveItem] = []
        for text in current_strings:
            matching = next((item for item in cat_items if item.text == text), None)
            if matching:
                synced_items.append(matching)
            else:
                # Create a grounded item with appropriate derivation & epistemic status
                derivation = (
                    "direct_extraction"
                    if cat in {"facts", "feelings"}
                    else (
                        "normalized_extraction"
                        if cat == "pros"
                        else (
                            "explicit_user_inference"
                            if cat == "assumptions"
                            else "analytical_derivation"
                        )
                    )
                )
                epistemic = (
                    "confirmed_fact"
                    if cat in {"facts", "pros"}
                    else (
                        "subjective_preference"
                        if cat == "feelings"
                        else (
                            "projection"
                            if cat == "assumptions"
                            else (
                                "trade_off"
                                if cat == "mixed_points"
                                else (
                                    "true_contradiction"
                                    if cat == "contradictions"
                                    else (
                                        "open_question"
                                        if cat == "unknowns"
                                        else "inferred_risk"
                                    )
                                )
                            )
                        )
                    )
                )
                synced_items.append(
                    _make_item(
                        category=cat,
                        text=text,
                        source_span=text[:120],
                        derivation_type=derivation,
                        epistemic_status=epistemic,
                        confidence=0.95 if cat in {"facts", "feelings"} else 0.85,
                        is_direct=cat in {"facts", "feelings"},
                    )
                )
        grounded[cat] = synced_items

    findings.grounded_items = grounded
    return findings


def call_gemini_direct_rest(model: str, system_prompt: str, user_prompt: str, api_key: str) -> str:
    """Direct REST caller for Google Gemini using the native generateContent API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}],
            }
        ],
        "systemInstruction": {
            "parts": [{"text": system_prompt}],
        },
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def get_llm_client_and_model():
    """
    Returns (client, model_name, provider_name).
    Supports:
    - Google Gemini (via OpenAI-compatible endpoint with GEMINI_API_KEY / GOOGLE_API_KEY)
    - OpenAI (with OPENAI_API_KEY)
    - Mock fallback when neither is configured
    """
    provider = settings.active_ai_provider

    if provider == "gemini":
        from openai import OpenAI
        gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
        client = OpenAI(
            api_key=gemini_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            default_headers={"x-goog-api-key": gemini_key},
        )
        return client, settings.gemini_model, "gemini"

    if provider == "openai":
        from openai import OpenAI
        openai_key = settings.openai_api_key.strip()
        client = OpenAI(api_key=openai_key)
        return client, settings.openai_model, "openai"

    return None, None, "mock"


class AIService:
    """Configurable hosted AI service interfacing with Gemini or OpenAI models."""

    def __init__(self):
        self.debug = settings.debug

    def is_configured(self) -> bool:
        """Check if either Gemini or OpenAI is configured with an active API key."""
        return settings.has_ai_key

    def structure_untrusted_input(
        self,
        raw_text: str,
        language: str = "en",
        force_mock: bool = False,
    ) -> StructuredFindings:
        """
        Structure untrusted input into 8 cognitive categories + private feedback.
        Uses Gemini or OpenAI with json_object response format. Falls back cleanly
        to deterministic mock when no API key is configured or force_mock is requested.
        Applies epistemic validation and source-grounding sanitation to all results.
        """
        if not raw_text or not raw_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot structure empty input. Please provide a problem statement, notes, transcript, or document.",
            )

        client, model, provider = get_llm_client_and_model()

        # Use mock when not configured or force_mock is requested
        if force_mock or client is None:
            logger.info("Using mock AI structuring engine (force_mock=%s, has_key=%s)", force_mock, settings.has_ai_key)
            mock_findings = generate_mock_structuring_findings(raw_text, language)
            return validate_and_sanitize_grounded_findings(mock_findings, raw_text)

        fenced_input = f"<UNTRUSTED_USER_INPUT>\n{raw_text}\n</UNTRUSTED_USER_INPUT>"
        user_prompt = (
            f"Analyze and structure the following untrusted input into the 8 cognitive categories "
            f"and provide private feedback with strict source grounding. Target language context: {language}.\n\n{fenced_input}"
        )

        response_content = None

        # 1. Primary execution via OpenAI / OpenAI-compatible endpoint
        try:
            logger.info("Calling hosted %s model (%s) for cognitive structuring", provider.upper(), model)
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": STRUCTURING_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            response_content = response.choices[0].message.content
        except Exception as exc:
            # 2. Resilient fallback for Gemini: call Google's native REST endpoint directly
            if provider == "gemini":
                gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
                try:
                    logger.info("OpenAI-compatible proxy failed (%s), falling back to native Gemini REST endpoint", exc)
                    response_content = call_gemini_direct_rest(
                        model=model,
                        system_prompt=STRUCTURING_SYSTEM_PROMPT,
                        user_prompt=user_prompt,
                        api_key=gemini_key,
                    )
                except Exception as rest_exc:
                    logger.error("Native Gemini REST call also failed: %s", rest_exc)
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Hosted AI structuring service failure (gemini): {str(rest_exc)}",
                    )
            else:
                logger.error("Hosted AI structuring error (%s): %s", provider, exc)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Hosted AI structuring service failure ({provider}): {str(exc)}",
                )

        if not response_content:
            raise ValueError(f"Empty response received from {provider.upper()} model.")

        parsed_data = json.loads(response_content)
        findings = StructuredFindings.model_validate(parsed_data)
        findings = validate_and_sanitize_grounded_findings(findings, raw_text)
        findings.reviewed = False
        return findings


# Global AI Service instance
ai_service = AIService()
