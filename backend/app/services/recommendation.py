import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.models import Decision, AnalysisSnapshot, RoadmapRecord
from app.services.ai import get_llm_client_and_model, call_gemini_direct_rest
from app.services.folder_context import get_folder_precedents
from app.schemas import (
    AlternativeOption,
    AssumptionItem,
    CanonicalDecisionResult,
    ConfidenceAssessment,
    CounterargumentItem,
    DecisionDomain,
    DecisionSynthesis,
    RiskMitigationItem,
    RoadmapData,
    RoadmapPhase,
    RoadmapTask,
    SupportingEvidenceItem,
    SynthesisRequest,
)

logger = logging.getLogger("decisionlens.recommendation")

SYNTHESIS_SYSTEM_PROMPT = """You are the Senior Strategic Decision Advisor & Chief Decision Architect at DecisionLens.
Your mandate is to synthesize multi-stage analytical findings (structured facts, answered research gaps, identified risks, and multi-criteria evaluations) into an authoritative, executive-grade decision memo and actionable execution roadmap.

================================================================================
EXECUTIVE MANDATE & WRITING GUIDELINES:
================================================================================
1. NATURAL EXECUTIVE VOICE:
   - Write with clarity, intellectual honesty, and executive authority.
   - Avoid mechanical boilerplate, robotic clichés, or repeating raw formulas like "Based on deterministic Weighted Decision Matrix analysis... achieved Rank #1 with score X/10".
   - State the core strategic verdict directly in the headline and recommendation narrative.
   - Frame the rationale around real operational advantages, risk posture, and alignment with the decision goals.

2. DECISION POSTURE:
   - If critical information gaps or blocking risks remain unresolved:
     Set "synthesis_type": "conditional_next_step", "status": "CONDITIONAL", and provide clear "conditional_triggers" detailing the specific due-diligence clearances required before irrevocable capital or organizational commitment.
   - If critical gaps are resolved and foundational facts are validated:
     Set "synthesis_type": "recommendation", "status": "READY", with an explicit green light for execution.

3. WINNER FIDELITY (ABSOLUTE RULE):
   - You MUST recommend the canonical winner option identified in the context.
   - In "alternatives_considered", mark the canonical winner as "is_recommended": true and all other options as "is_recommended": false.
   - For alternative options, articulate genuine strategic trade-offs and provide a clear, respectful "why_not_recommended" explanation.

4. CONTEXTUAL & GROUNDED ROADMAP:
   - Formulate a 3-phase execution roadmap where EVERY milestone is directly tailored to the user's specific problem, domain, and alternatives.
   - Phase 1: Due Diligence & Pre-Commitment Validation (Weeks 1-2) — Resolve active unknowns, stress-test core assumptions, and secure pre-commitment clearances.
   - Phase 2: Contract Structuring & Primary Execution (Weeks 3-5) — Negotiate binding terms, procure assets, or deploy core operational workflows for the chosen option.
   - Phase 3: Operationalization & Performance Governance (Weeks 6-8) — Complete final cutover/closing, establish KPI telemetry, and institute executive audit checkpoints.
   - Every task must have: "task_id", "title", "description", "owner_role", "timeline", "dependencies", "success_criteria", "is_completed": false, "source_type", "source_ids", "depends_on_gap_ids", and "reason".
   - Assign domain-appropriate owner roles (e.g. Legal Counsel, Investment Committee, Technical Architect, Operations Lead, People Partner).

5. EVIDENCE & CITATIONS:
   - Ground claims strictly in provided facts and research findings. Never invent fake URLs or external citations.
   - Document any information limitations or blindspots transparently in "confidence_assessment.limitations".

================================================================================
OUTPUT JSON SCHEMA:
================================================================================
{
  "synthesis_type": "recommendation" | "conditional_next_step",
  "headline": "Strategic Headline (e.g. Executive Mandate: Proceed with [Winner] or Strategic Plan: Staged Commitment to [Winner])",
  "recommendation_text": "Compelling 2-3 paragraph executive recommendation explaining the strategic rationale, comparative advantages over runner-up alternatives, and risk mitigation posture.",
  "conditional_triggers": ["Specific condition or due-diligence clearance required before capital commitment"],
  "alternatives_considered": [
    {
      "name": "Option Name",
      "description": "Strategic overview of this alternative",
      "pros": ["Key advantages"],
      "cons": ["Key disadvantages or operational costs"],
      "tradeoff_analysis": "Nuanced analysis of what is gained vs sacrificed",
      "is_recommended": true | false,
      "why_not_recommended": null or "Explicit reason why this alternative was deprioritized"
    }
  ],
  "supporting_evidence": [
    {
      "claim": "Evidence claim text",
      "source": "Source title",
      "url": "Source URL or null",
      "relevance": "High/medium relevance explanation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Key underlying operating assumption",
      "impact_if_false": "Impact on timeline, budget, or outcomes if invalid",
      "is_verified": false
    }
  ],
  "risks_and_mitigations": [
    {
      "risk": "Identified operational, legal, or market risk",
      "severity": "high" | "medium" | "low",
      "mitigation": "Proactive preventative mitigation measure",
      "contingency_plan": "Specific fallback action if risk materializes"
    }
  ],
  "counterarguments": [
    {
      "argument": "Steel-manned opposing viewpoint or stakeholder objection",
      "rebuttal_or_concession": "Principled rebuttal or legitimate concession with boundary safeguards"
    }
  ],
  "confidence_assessment": {
    "level": "high" | "medium" | "low",
    "score": 0.88,
    "status": "READY" | "CONDITIONAL",
    "rationale": "Clear executive rationale explaining the confidence rating",
    "limitations": ["Documented blindspot or unverified variable"],
    "conditions_precedent": ["Action item required prior to closing"]
  },
  "roadmap": {
    "title": "3-Phase Execution Roadmap: [Winner]",
    "phases": [
      {
        "phase_id": "phase-1",
        "title": "Phase 1: Due Diligence & Pre-Commitment Validation",
        "timeline": "Weeks 1-2",
        "description": "Phase summary",
        "tasks": [
          {
            "task_id": "task-1",
            "title": "Actionable task title",
            "description": "Concrete task description",
            "owner_role": "Executive / Operational role",
            "timeline": "Weeks 1-2",
            "dependencies": [],
            "success_criteria": "Measurable exit criteria",
            "is_completed": false,
            "source_type": "gap" | "condition" | "risk" | "decision_requirement",
            "source_ids": ["gap_1"],
            "depends_on_gap_ids": ["gap_1"],
            "reason": "Why this task is critical to execution"
          }
        ]
      }
    ]
  }
}
"""


def _detect_critical_unknowns(gaps: Dict[str, Any], points: Dict[str, Any]) -> List[str]:
    """Identify whether any critical or high-importance unknowns/gaps remain unresolved."""
    critical = []

    gap_items = []
    if isinstance(gaps, dict):
        gap_items = gaps.get("gaps", [])
    elif isinstance(gaps, list):
        gap_items = gaps

    for g in gap_items:
        if isinstance(g, dict):
            importance = str(g.get("importance", "")).lower()
            status_val = str(g.get("status", "")).lower()
            if importance in ("high", "critical") and status_val in ("unanswered", "skipped", "pending"):
                critical.append(f"Unresolved High-Importance Gap: {g.get('question', 'Key unknown')}")

    if isinstance(points, dict):
        unknowns = points.get("unknowns", [])
        for u in unknowns:
            u_str = str(u).lower()
            if any(k in u_str for k in ("tco", "budget", "compliance", "security", "legal", "sla", "sla guarantee", "scalability", "title", "zoning", "feeder road")):
                critical.append(f"Key Unknown: {u}")

    return critical


def generate_domain_grounded_roadmap(
    domain: str,
    top_option_name: str,
    critical_gaps: List[str],
    critical_conditions: List[str],
    risks: List[str],
    decision_title: Optional[str] = None,
    assumptions: Optional[List[str]] = None,
) -> RoadmapData:
    """
    Generate a realistic, tailored 3-phase execution roadmap grounded in the decision's domain and context.
    Tasks are dynamically derived from active unknown gaps, assumptions, and domain governance practices.
    Never uses hardcoded templates or non-domain jargon.
    """
    domain_upper = (domain or "BUSINESS").upper()
    title_context = f" for {decision_title}" if decision_title else ""

    role_map = {
        "REAL_ESTATE": (
            "Legal Due Diligence Counsel",
            "Valuation & Survey Surveyor",
            "Transaction Advisory Partner",
            "Asset Management Committee",
        ),
        "SOFTWARE": (
            "Lead Technical Architect",
            "Security & Compliance Lead",
            "Engineering Delivery Manager",
            "VP of Engineering",
        ),
        "FINANCE": (
            "Financial Due Diligence Lead",
            "Investment Risk Officer",
            "Corporate Counsel & CFO",
            "Investment Committee",
        ),
        "CAREER": (
            "Career Advisor & Legal Counsel",
            "Industry Peer Mentor",
            "Executive Candidate",
            "Steering Sponsor",
        ),
        "BUSINESS": (
            "Strategic Due Diligence Lead",
            "Risk & Operations Analyst",
            "Operations & Delivery Lead",
            "Executive Steering Committee",
        ),
    }
    roles = role_map.get(domain_upper, role_map["BUSINESS"])
    legal_role, risk_role, ops_role, exec_role = roles

    # Phase 1: Pre-Commitment Validation & Due Diligence (Weeks 1-2)
    phase1_tasks: List[RoadmapTask] = []

    if critical_gaps:
        for idx, g in enumerate(critical_gaps[:2]):
            clean_gap = (
                g.replace("Unresolved High-Importance Gap: ", "")
                .replace("Key Unknown: ", "")
                .strip()
            )
            summary = (clean_gap[:55] + "...") if len(clean_gap) > 55 else clean_gap
            phase1_tasks.append(
                RoadmapTask(
                    task_id=f"task-p1-{idx+1}",
                    title=f"Resolve Unknown: {summary}",
                    description=f"Conduct focused investigation and audit operational readiness regarding: {clean_gap}",
                    owner_role=risk_role if idx == 0 else legal_role,
                    timeline="Weeks 1-2",
                    dependencies=[],
                    success_criteria=f"Documented evidentiary clearance resolving ambiguity on {summary.lower()}.",
                    is_completed=False,
                    source_type="gap",
                    source_ids=[g],
                    depends_on_gap_ids=[g],
                    reason="Pre-commitment diligence must resolve this unknown to avoid premature capital allocation.",
                )
            )
    else:
        if domain_upper == "REAL_ESTATE":
            phase1_tasks.append(
                RoadmapTask(
                    task_id="task-p1-re",
                    title=f"Complete Title, Encumbrance & Zoning Clearance{title_context}",
                    description="Engage independent property legal counsel to verify clean marketable title, non-encumbrance certificate, and municipal zoning compliance.",
                    owner_role=legal_role,
                    timeline="Weeks 1-2",
                    dependencies=[],
                    success_criteria="Certified legal title clearance certificate confirming clean and marketable status.",
                    is_completed=False,
                    source_type="condition",
                    reason="Title succession and municipal zoning conformity are mandatory prerequisites before contract execution.",
                )
            )
        elif domain_upper == "SOFTWARE":
            phase1_tasks.append(
                RoadmapTask(
                    task_id="task-p1-sw",
                    title=f"Conduct Architecture Validation & Security Review{title_context}",
                    description=f"Validate integration feasibility, data flow latency, and security boundaries for {top_option_name}.",
                    owner_role=legal_role,
                    timeline="Weeks 1-2",
                    dependencies=[],
                    success_criteria="Architectural sign-off confirming performance SLAs and compliance boundaries.",
                    is_completed=False,
                    source_type="decision_requirement",
                    reason="Validates non-functional performance requirements before full-scale engineering commitment.",
                )
            )
        else:
            phase1_tasks.append(
                RoadmapTask(
                    task_id="task-p1-biz",
                    title=f"Audit Boundary Conditions & Feasibility Thresholds{title_context}",
                    description=f"Validate core operational constraints, resource availability, and threshold criteria for {top_option_name}.",
                    owner_role=legal_role,
                    timeline="Weeks 1-2",
                    dependencies=[],
                    success_criteria="Approved boundary charter with agreed non-negotiable operational thresholds.",
                    is_completed=False,
                    source_type="decision_requirement",
                    reason="Aligns executive stakeholders on critical boundaries before deploying capital.",
                )
            )

    if assumptions:
        first_asmp = str(assumptions[0]).strip()
        asmp_summary = (first_asmp[:55] + "...") if len(first_asmp) > 55 else first_asmp
        phase1_tasks.append(
            RoadmapTask(
                task_id="task-p1-asmp",
                title=f"Stress-Test Assumption: {asmp_summary}",
                description=f"Gather empirical benchmark data to validate operating assumption: '{first_asmp}'.",
                owner_role=risk_role,
                timeline="Week 2",
                dependencies=[phase1_tasks[0].task_id] if phase1_tasks else [],
                success_criteria="Empirical data confirms variance is within acceptable operational tolerance.",
                is_completed=False,
                source_type="condition",
                reason="Mitigates execution risks originating from unverified baseline hypotheses.",
            )
        )
    else:
        phase1_tasks.append(
            RoadmapTask(
                task_id="task-p1-eval",
                title=f"Independent Valuation & Commercial Terms Audit{title_context}",
                description="Audit pricing benchmarks, commercial structure, and comparative transaction history.",
                owner_role=risk_role,
                timeline="Week 2",
                dependencies=[phase1_tasks[0].task_id] if phase1_tasks else [],
                success_criteria="Comparative valuation report validating financial viability.",
                is_completed=False,
                source_type="risk",
                reason="Ensures commercial baseline aligns with empirical market metrics.",
            )
        )

    # Phase 2: Contract Structuring & Execution (Weeks 3-5)
    phase2_tasks: List[RoadmapTask] = [
        RoadmapTask(
            task_id="task-p2-terms",
            title=f"Draft & Negotiate Definitive Terms for {top_option_name}",
            description=f"Incorporate milestone-linked payment schedules, exit covenants, and protective indemnity terms into definitive agreements.",
            owner_role=ops_role,
            timeline="Weeks 3-4",
            dependencies=[t.task_id for t in phase1_tasks[:1]],
            success_criteria="Executed definitive bilateral agreement or project charter signed by all key parties.",
            is_completed=False,
            source_type="decision_requirement",
            reason="Translates strategic intent into binding contractual and operational governance.",
        ),
        RoadmapTask(
            task_id="task-p2-exec",
            title=f"Launch Core Implementation Workstream: {top_option_name}",
            description=f"Mobilize primary operating resources, establish telemetry tracking, and initiate initial execution tranches.",
            owner_role=ops_role,
            timeline="Weeks 4-5",
            dependencies=["task-p2-terms"],
            success_criteria="First execution milestone delivered within budget and timeline targets.",
            is_completed=False,
            source_type="decision_requirement",
            reason="Unleashes primary execution within controlled risk parameters.",
        ),
    ]

    # Phase 3: Operationalization & Performance Governance (Weeks 6-8)
    phase3_tasks: List[RoadmapTask] = [
        RoadmapTask(
            task_id="task-p3-close",
            title=f"Complete Formal Closing & Operational Cutover{title_context}",
            description=f"Execute final disbursements or cutover protocols, transferring full ownership and accountability to operating leads.",
            owner_role=exec_role,
            timeline="Weeks 6-7",
            dependencies=["task-p2-exec"],
            success_criteria="Official legal closing or full operational production status achieved.",
            is_completed=False,
            source_type="condition",
            reason="Formalizes irrevocable commitment and establishes stable operating equilibrium.",
        ),
        RoadmapTask(
            task_id="task-p3-gov",
            title="Institute Post-Execution Governance & Audit Cadence",
            description=f"Establish monthly review committee to audit realized outcomes, track KPIs against projections, and manage risk covenants.",
            owner_role=exec_role,
            timeline="Week 8",
            dependencies=["task-p3-close"],
            success_criteria="First post-closing governance review completed with baseline scorecard signed.",
            is_completed=False,
            source_type="decision_requirement",
            reason="Guarantees sustained accountability and ensures expected strategic ROI is captured.",
        ),
    ]

    return RoadmapData(
        title=f"Strategic Execution Roadmap: {top_option_name}",
        phases=[
            RoadmapPhase(
                phase_id="phase-1",
                title="Phase 1: Due Diligence & Pre-Commitment Validation",
                timeline="Weeks 1-2",
                description="Resolve critical unknowns, stress-test operating assumptions, and complete pre-commitment audits before irreversible resource allocation.",
                tasks=phase1_tasks,
            ),
            RoadmapPhase(
                phase_id="phase-2",
                title="Phase 2: Contract Structuring & Primary Execution",
                timeline="Weeks 3-5",
                description=f"Finalize binding agreements and mobilize primary execution workstreams for {top_option_name}.",
                tasks=phase2_tasks,
            ),
            RoadmapPhase(
                phase_id="phase-3",
                title="Phase 3: Operationalization & Performance Governance",
                timeline="Weeks 6-8",
                description="Complete formal transition, achieve steady-state operations, and institute ongoing executive governance.",
                tasks=phase3_tasks,
            ),
        ],
    )


def generate_mock_synthesis(
    decision: Decision,
    user_priorities: Optional[List[str]] = None,
    version: int = 1,
    folder_precedents: Optional[List[Dict[str, Any]]] = None,
) -> DecisionSynthesis:
    """
    Generate high-fidelity deterministic synthesis adhering to all Phase 10 constraints.
    Authoritatively consumes the canonical framework result and enforces domain grounding.
    """
    points = decision.points or {}
    gaps = decision.gaps or {}
    research = decision.research or {}
    analysis = decision.analysis or {}

    facts = points.get("facts", [])
    assumptions = points.get("assumptions", [])
    pros = points.get("pros", [])
    cons = points.get("cons", [])
    unknowns = points.get("unknowns", [])

    # Identify critical unresolved unknowns
    critical_unknowns = _detect_critical_unknowns(gaps, points)

    # 1. Authoritative canonical framework result extraction
    matrix_data = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
    canonical_dict = analysis.get("canonical_result") or matrix_data.get("canonical_result")
    matrix_results = matrix_data.get("results", [])
    if not matrix_results and matrix_data.get("ranked_options"):
        matrix_results = [
            {
                "option_name": ro.get("name"),
                "option_id": ro.get("id", f"OPT_{i+1:03d}"),
                "weighted_score": ro.get("score", 8.0),
                "rank": ro.get("rank", i + 1),
            }
            for i, ro in enumerate(matrix_data.get("ranked_options", []))
        ]

    canonical_winner_id = None
    canonical_winner_name = None
    canonical_winner_score = 8.0
    canonical_winner_rank = 1
    decision_status = "READY"
    critical_conditions: List[str] = []
    unresolved_gap_ids: List[str] = []

    if canonical_dict and isinstance(canonical_dict, dict):
        canonical_winner_id = canonical_dict.get("winner_option_id")
        canonical_winner_name = canonical_dict.get("winner_option_name")
        canonical_winner_score = canonical_dict.get("winner_score", 8.0)
        canonical_winner_rank = canonical_dict.get("winner_rank", 1)
        decision_status = canonical_dict.get("decision_status", "READY")
        critical_conditions = canonical_dict.get("critical_conditions", [])
        unresolved_gap_ids = canonical_dict.get("unresolved_critical_gap_ids", [])
        if canonical_dict.get("results"):
            matrix_results = canonical_dict.get("results")
    elif matrix_results:
        top_res = matrix_results[0]
        canonical_winner_id = top_res.get("option_id")
        canonical_winner_name = top_res.get("option_name")
        canonical_winner_score = top_res.get("weighted_score", 8.0)
        canonical_winner_rank = top_res.get("rank", 1)
        decision_status = "CONDITIONAL" if critical_unknowns else "READY"

    if not canonical_winner_name:
        canonical_winner_name = "Primary Strategy"
        canonical_winner_id = "OPT_001"

    top_option_name = canonical_winner_name
    top_option_id = canonical_winner_id

    second_option_name = "Alternative Option"
    if matrix_results and len(matrix_results) >= 2:
        second_option_name = matrix_results[1].get("option_name", second_option_name)

    domain = getattr(decision, "domain", None) or analysis.get("domain") or "BUSINESS"

    # Supporting evidence gathering
    supporting_evidence: List[SupportingEvidenceItem] = []
    research_list = research.get("research", []) if isinstance(research, dict) else (research if isinstance(research, list) else [])

    for r_entry in research_list:
        if isinstance(r_entry, dict):
            claims = r_entry.get("claims", [])
            for c in claims:
                if isinstance(c, dict):
                    supporting_evidence.append(
                        SupportingEvidenceItem(
                            claim=c.get("claim_text", "Verified research finding"),
                            source_title=c.get("source_title") or r_entry.get("title") or "Verified Web Research",
                            source_url=c.get("source_url") or r_entry.get("url"),
                            evidence_type="research_claim",
                            reliability=c.get("reliability_label", "high"),
                        )
                    )

    for f in facts[:3]:
        supporting_evidence.append(
            SupportingEvidenceItem(
                claim=str(f),
                source_title="User-Reported Fact",
                source_url=None,
                evidence_type="user_fact",
                reliability="high",
            )
        )

    supporting_evidence.append(
        SupportingEvidenceItem(
            claim=f"'{top_option_name}' achieved Rank #1 in Weighted Decision Matrix with score {canonical_winner_score:.2f}/10.",
            source_title="Deterministic Weighted Decision Matrix",
            source_url=None,
            evidence_type="framework_metric",
            reliability="high",
        )
    )

    if folder_precedents:
        for p in folder_precedents[:2]:
            v_info = p.get("verdict_headline") or (f"Approved {p.get('verdict_winner')}" if p.get("verdict_winner") else None)
            if v_info:
                supporting_evidence.append(
                    SupportingEvidenceItem(
                        claim=f"Aligned with previous project milestone: {v_info}",
                        source_title=f"Prior Folder Record #{p['id']}: {p['title']}",
                        source_url=None,
                        evidence_type="folder_memory",
                        reliability="high",
                    )
                )

    is_conditional = (decision_status == "CONDITIONAL") or (len(critical_unknowns) > 0)

    decision_title_str = decision.title or "Strategic Dilemma"

    continuity_note = ""
    if folder_precedents:
        continuity_note = f" This builds directly upon decisions and verified baseline established in prior folder session '{folder_precedents[-1]['title']}'."

    if is_conditional:
        decision_status = "CONDITIONAL"
        synthesis_type = "conditional_next_step"
        headline = f"Strategic Execution Plan: '{top_option_name}' (Risk-Gated Pre-Commitment)"
        rec_text = (
            f"Following multi-criteria strategic evaluation of '{decision_title_str}', '{top_option_name}' "
            f"emerges as the recommended strategic direction, achieving optimal alignment across primary decision criteria. "
            f"However, because {len(critical_unknowns) or len(unresolved_gap_ids)} critical unknown(s) remain unresolved, "
            f"execution must proceed under an explicit risk-gated framework: Phase 1 focuses strictly on targeted due diligence "
            f"and clearance of precedent conditions before irrevocable capital or organizational commitment is finalized."
            f"{continuity_note}"
        )
        conditional_triggers = critical_conditions or [
            f"Condition A: Verify satisfactory resolution for {critical_unknowns[0] if critical_unknowns else 'critical gaps'} prior to irrevocable contract execution.",
            f"Condition B: Ensure initial expenditure does not exceed agreed due-diligence budget contingency.",
            f"Pivot Trigger: If validation metrics or due-diligence covenants fail, pivot to '{second_option_name}' (Rank #2).",
        ]
        confidence_level = "medium"
        conf_rationale = (
            f"Assessment is CONDITIONAL due to {len(critical_unknowns) or len(unresolved_gap_ids)} "
            f"unresolved high-impact unknown(s) identified in discovery, despite strong matrix alignment ({canonical_winner_score:.2f}/10)."
        )
    else:
        decision_status = "READY"
        synthesis_type = "recommendation"
        headline = f"Executive Mandate: Proceed with '{top_option_name}'"
        rec_text = (
            f"Following comprehensive evaluation across weighted criteria, '{top_option_name}' is confirmed as the "
            f"optimal strategic path for '{decision_title_str}'. With foundational facts validated and all critical "
            f"information gaps resolved, the leadership team should proceed directly to implementation under the attached phased roadmap."
            f"{continuity_note}"
        )
        conditional_triggers = []
        confidence_level = "high"
        conf_rationale = (
            f"High confidence supported by validated facts, comprehensive matrix evaluation "
            f"({canonical_winner_score:.2f}/10), and zero blocking high-importance gaps."
        )

    # Formulate alternatives considered with strict adherence to matrix scores and ranks
    alternatives: List[AlternativeOption] = []
    if matrix_results and len(matrix_results) >= 2:
        for r in matrix_results[:4]:
            opt_name = r.get("option_name")
            opt_rank = r.get("rank", 1)
            opt_score = r.get("weighted_score", 0.0)
            if r.get("option_id") == top_option_id or opt_name == top_option_name:
                alternatives.append(
                    AlternativeOption(
                        name=opt_name,
                        description=f"Primary recommended path achieving Rank #{opt_rank} in Weighted Decision Matrix.",
                        pros=[f"Highest weighted framework score ({opt_score:.2f}/10)", "Superior alignment with critical criteria"],
                        cons=cons[:1] if cons else ["Requires rigorous pre-execution due diligence"],
                        tradeoffs="Demands thorough validation to unlock superior long-term upside.",
                        is_recommended=True,
                        why_not_recommended=None,
                    )
                )
            else:
                alternatives.append(
                    AlternativeOption(
                        name=opt_name,
                        description=f"Alternative evaluated in Decision Matrix (Rank #{opt_rank}, Score: {opt_score:.2f}/10).",
                        pros=["Viable alternative option"],
                        cons=[f"Lower overall criteria alignment ({opt_score:.2f}/10 vs {canonical_winner_score:.2f}/10)"],
                        tradeoffs=f"Trades away criteria performance compared to {top_option_name}.",
                        is_recommended=False,
                        why_not_recommended=f"Ranked #{opt_rank} with lower deterministic score ({opt_score:.2f}/10) compared to {top_option_name} ({canonical_winner_score:.2f}/10).",
                    )
                )
    else:
        alternatives = [
            AlternativeOption(
                name=top_option_name,
                description="Primary recommended path.",
                pros=["Optimal strategic alignment"],
                cons=["Implementation dedication required"],
                tradeoffs="Demands thorough validation.",
                is_recommended=True,
                why_not_recommended=None,
            ),
            AlternativeOption(
                name=second_option_name,
                description="Secondary fallback option.",
                pros=["Alternative approach"],
                cons=["Suboptimal criteria alignment"],
                tradeoffs="Trades performance for fallback utility.",
                is_recommended=False,
                why_not_recommended=f"Lower overall alignment compared to {top_option_name}.",
            ),
        ]

    assumptions_items = []
    if assumptions:
        for a in assumptions[:3]:
            assumptions_items.append(
                AssumptionItem(
                    assumption=str(a),
                    is_verified=False,
                    impact_if_false="May require re-evaluating operational timeline or adjusting cost projections by 10-20%.",
                )
            )
    else:
        assumptions_items.append(
            AssumptionItem(
                assumption="Target team bandwidth and operational continuity remain stable over the execution horizon.",
                is_verified=False,
                impact_if_false="Project completion milestones may slip by 2-4 weeks.",
            )
        )

    risks_and_mitigations = [
        RiskMitigationItem(
            risk="Unbudgeted operational overhead or unanticipated regulatory friction during execution.",
            severity="high" if is_conditional else "medium",
            mitigation="Establish rigorous due diligence covenants and weekly milestone audit checkpoints with a 15% safety contingency.",
            contingency_plan="Invoke contractual exit triggers or descope secondary commitments if primary covenants fail.",
        ),
    ]

    counterarguments = [
        CounterargumentItem(
            argument=f"Adopting '{second_option_name}' would be faster and avoid internal operational complexity.",
            rebuttal_or_concession=(
                f"While '{second_option_name}' may offer initial simplicity, it compromises on critical value drivers. "
                f"The chosen path ({top_option_name}) captures superior risk-adjusted alignment ({canonical_winner_score:.2f}/10)."
            ),
        ),
    ]

    limitations = [
        "Grounded exclusively in provided inputs and verified research; external unstated factors were not fabricated."
    ]
    if critical_unknowns:
        limitations.extend(critical_unknowns)
    if "decision_tree" in analysis and analysis["decision_tree"]:
        tree_obj = analysis["decision_tree"]
        if not tree_obj.get("has_deterministic_probabilities"):
            limitations.append("Decision Tree branch probabilities were unstated and were intentionally not fabricated.")

    # Deterministic mathematical confidence formula: 0.88 for READY, reduced proportionally by unresolved gaps
    calc_score = 0.88 if not is_conditional else max(0.45, round(0.70 - 0.05 * len(critical_unknowns), 2))

    confidence = ConfidenceAssessment(
        level=confidence_level,
        status=decision_status,
        score=calc_score,
        rationale=conf_rationale,
        limitations=limitations,
    )

    roadmap = generate_domain_grounded_roadmap(
        domain=domain,
        top_option_name=top_option_name,
        critical_gaps=critical_unknowns,
        critical_conditions=conditional_triggers,
        risks=[r.risk for r in risks_and_mitigations],
        decision_title=decision.title,
        assumptions=[a.assumption for a in assumptions_items],
    )

    return DecisionSynthesis(
        decision_id=decision.id,
        synthesis_type=synthesis_type,
        headline=headline,
        recommendation_text=rec_text,
        conditional_triggers=conditional_triggers,
        alternatives_considered=alternatives,
        supporting_evidence=supporting_evidence,
        assumptions=assumptions_items,
        risks_and_mitigations=risks_and_mitigations,
        counterarguments=counterarguments,
        confidence_assessment=confidence,
        roadmap=roadmap,
        canonical_result=canonical_dict,
        decision_status=decision_status,
        domain=domain,
        is_stale=False,
        created_at=datetime.now(timezone.utc).isoformat(),
        version=version,
    )


def execute_hosted_synthesis(
    decision: Decision,
    user_priorities: Optional[List[str]] = None,
    version: int = 1,
    folder_precedents: Optional[List[Dict[str, Any]]] = None,
) -> DecisionSynthesis:
    """Execute hosted LLM synthesis call with strict grounding, schema validation, and canonical winner enforcement."""
    client, model, provider = get_llm_client_and_model()
    if client is None:
        raise ValueError("No hosted LLM provider configured for synthesis.")

    points = decision.points or {}
    gaps = decision.gaps or {}
    research = decision.research or {}
    analysis = decision.analysis or {}

    matrix_data = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
    canonical_dict = analysis.get("canonical_result") or matrix_data.get("canonical_result")
    matrix_results = matrix_data.get("results", [])
    if not matrix_results and matrix_data.get("ranked_options"):
        matrix_results = [
            {
                "option_name": ro.get("name"),
                "option_id": ro.get("id", f"OPT_{i+1:03d}"),
                "weighted_score": ro.get("score", 8.0),
                "rank": ro.get("rank", i + 1),
            }
            for i, ro in enumerate(matrix_data.get("ranked_options", []))
        ]

    canonical_winner_id = None
    canonical_winner_name = None
    canonical_winner_score = 8.0
    canonical_winner_rank = 1
    decision_status = "READY"

    if canonical_dict and isinstance(canonical_dict, dict):
        canonical_winner_id = canonical_dict.get("winner_option_id")
        canonical_winner_name = canonical_dict.get("winner_option_name")
        canonical_winner_score = canonical_dict.get("winner_score", 8.0)
        canonical_winner_rank = canonical_dict.get("winner_rank", 1)
        decision_status = canonical_dict.get("decision_status", "READY")
    elif matrix_results:
        top_res = matrix_results[0]
        canonical_winner_id = top_res.get("option_id")
        canonical_winner_name = top_res.get("option_name")
        canonical_winner_score = top_res.get("weighted_score", 8.0)
        canonical_winner_rank = top_res.get("rank", 1)

    if not canonical_winner_name:
        canonical_winner_name = "Primary Strategy"
        canonical_winner_id = "OPT_001"

    domain = getattr(decision, "domain", None) or analysis.get("domain") or "BUSINESS"

    payload_context = {
        "title": decision.title,
        "problem_statement": decision.problem_statement,
        "raw_input": decision.raw_input,
        "domain": domain,
        "facts": points.get("facts", []),
        "assumptions": points.get("assumptions", []),
        "pros": points.get("pros", []),
        "cons": points.get("cons", []),
        "unknowns": points.get("unknowns", []),
        "contradictions": points.get("contradictions", []),
        "gaps": gaps,
        "research": research,
        "canonical_framework_result": canonical_dict or {
            "winner_option_id": canonical_winner_id,
            "winner_option_name": canonical_winner_name,
            "winner_score": canonical_winner_score,
            "winner_rank": canonical_winner_rank,
            "decision_status": decision_status,
        },
        "authoritative_winner": {
            "option_id": canonical_winner_id,
            "option_name": canonical_winner_name,
            "weighted_score": canonical_winner_score,
            "rank": canonical_winner_rank,
        },
        "prior_folder_precedents": folder_precedents or [],
        "user_priorities": user_priorities or [],
        "version": version,
    }

    continuity_instruction = ""
    if folder_precedents:
        continuity_instruction = (
            f"4. FOLDER CONTINUITY: This session follows {len(folder_precedents)} preceding record(s) in this project folder. "
            f"Explicitly maintain strategic continuity with prior established facts, milestones, and approved verdicts.\n"
        )

    prompt_user = (
        f"Synthesize the final decision recommendation and execution roadmap based on the following verified decision context:\n\n"
        f"{json.dumps(payload_context, indent=2)}\n\n"
        f"MANDATORY INSTRUCTIONS:\n"
        f"1. You MUST recommend '{canonical_winner_name}' (ID: {canonical_winner_id}, Score: {canonical_winner_score:.2f}/10, Rank #{canonical_winner_rank}). Do NOT substitute or alter the winner.\n"
        f"2. In 'alternatives_considered', mark '{canonical_winner_name}' as is_recommended=true and ALL others as is_recommended=false.\n"
        f"3. Ground all roadmap tasks strictly in the domain '{domain}'. Do NOT use software development terminology (POC, technical lead, staging, traffic migration) unless domain is SOFTWARE.\n"
        f"{continuity_instruction}"
        f"5. Output JSON strictly matching the DecisionSynthesis schema."
    )

    logger.info("Executing hosted %s (%s) decision synthesis for decision %s", provider.upper(), model, decision.id)

    raw_content = None
    candidate_models = [model]
    if provider == "gemini":
        for alt_m in ["gemini-flash-latest", "gemini-pro-latest", "gemini-3.5-flash"]:
            if alt_m not in candidate_models:
                candidate_models.append(alt_m)

    last_err = None
    for cand_model in candidate_models:
        try:
            logger.info("Attempting hosted %s synthesis with model '%s'...", provider.upper(), cand_model)
            response = client.chat.completions.create(
                model=cand_model,
                messages=[
                    {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt_user},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            raw_content = response.choices[0].message.content
            if raw_content:
                logger.info("Synthesis succeeded with model '%s'", cand_model)
                break
        except Exception as proxy_exc:
            last_err = proxy_exc
            logger.warning("Synthesis with model '%s' failed (%s), trying fallback...", cand_model, proxy_exc)
            if provider == "gemini":
                try:
                    gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
                    raw_content = call_gemini_direct_rest(
                        model=cand_model,
                        system_prompt=SYNTHESIS_SYSTEM_PROMPT,
                        user_prompt=prompt_user,
                        api_key=gemini_key,
                    )
                    if raw_content:
                        logger.info("Direct REST synthesis succeeded with model '%s'", cand_model)
                        break
                except Exception as rest_exc:
                    last_err = rest_exc
                    logger.warning("Direct REST fallback failed for '%s': %s", cand_model, rest_exc)

    if not raw_content and last_err:
        raise last_err

    if not raw_content:
        raise ValueError("Empty response received from LLM during decision synthesis.")

    parsed = json.loads(raw_content)
    parsed["decision_id"] = decision.id
    parsed["version"] = version
    parsed["created_at"] = datetime.now(timezone.utc).isoformat()
    parsed["domain"] = domain
    parsed["canonical_result"] = canonical_dict
    parsed["decision_status"] = decision_status
    parsed["is_stale"] = False

    # Defensive validation: Enforce canonical winner in alternatives_considered
    if "alternatives_considered" in parsed and isinstance(parsed["alternatives_considered"], list):
        found_winner = False
        for alt in parsed["alternatives_considered"]:
            if isinstance(alt, dict):
                if alt.get("name") == canonical_winner_name:
                    alt["is_recommended"] = True
                    alt["why_not_recommended"] = None
                    found_winner = True
                else:
                    alt["is_recommended"] = False
                    if not alt.get("why_not_recommended"):
                        alt["why_not_recommended"] = f"Lower framework score compared to {canonical_winner_name} ({canonical_winner_score:.2f}/10)."
        if not found_winner:
            parsed["alternatives_considered"].insert(
                0,
                {
                    "name": canonical_winner_name,
                    "description": f"Authoritative winner from Weighted Decision Matrix (Rank #{canonical_winner_rank}, Score: {canonical_winner_score:.2f}/10).",
                    "pros": [f"Rank #1 in Decision Matrix ({canonical_winner_score:.2f}/10)"],
                    "cons": [],
                    "tradeoffs": "Balanced optimal trade-offs.",
                    "is_recommended": True,
                    "why_not_recommended": None,
                },
            )

    # Defensive validation: Ensure headline and recommendation recommend canonical winner
    if canonical_winner_name not in parsed.get("headline", ""):
        parsed["headline"] = f"Strategic Execution: '{canonical_winner_name}' (Rank #{canonical_winner_rank}, Score: {canonical_winner_score:.2f}/10)"

    return DecisionSynthesis.model_validate(parsed)


def run_decision_synthesis(
    decision: Decision,
    db: Session,
    user_priorities: Optional[List[str]] = None,
    force_mock: bool = False,
) -> DecisionSynthesis:
    """
    Main orchestrator for Phase 10 synthesis:
    1. Runs synthesis engine (mock or hosted LLM).
    2. Preserves prior analysis versions by creating an immutable AnalysisSnapshot record.
    3. Creates/updates RoadmapRecord.
    4. Updates Decision model fields (recommendation, roadmap, status='decided', is_stale=False).
    """
    max_version = (
        db.query(func.max(AnalysisSnapshot.version))
        .filter(AnalysisSnapshot.decision_id == decision.id)
        .scalar()
    ) or 0
    next_version = max_version + 1

    folder_precedents = get_folder_precedents(decision, db) if db is not None else []

    if force_mock or not settings.has_ai_key:
        logger.info("Using deterministic mock synthesis engine (force_mock=%s, has_key=%s)", force_mock, settings.has_ai_key)
        synthesis = generate_mock_synthesis(
            decision,
            user_priorities,
            version=next_version,
            folder_precedents=folder_precedents,
        )
    else:
        try:
            synthesis = execute_hosted_synthesis(
                decision,
                user_priorities,
                version=next_version,
                folder_precedents=folder_precedents,
            )
        except Exception as exc:
            logger.warning("Hosted synthesis failed (%s), falling back to high-fidelity mock", exc)
            synthesis = generate_mock_synthesis(
                decision,
                user_priorities,
                version=next_version,
                folder_precedents=folder_precedents,
            )

    # 1. Save immutable AnalysisSnapshot record
    snapshot = AnalysisSnapshot(
        decision_id=decision.id,
        owner_id=decision.owner_id,
        version=next_version,
        title=decision.title,
        synthesis_type=synthesis.synthesis_type,
        headline=synthesis.headline,
        recommendation=synthesis.model_dump(),
        framework_snapshot=decision.analysis or {},
        input_snapshot=decision.points or {},
        gaps_snapshot=decision.gaps or {},
        research_snapshot=decision.research or {},
        user_priorities=user_priorities or [],
    )
    db.add(snapshot)
    db.flush()

    # 2. Deactivate previous active roadmap records and create new active RoadmapRecord
    db.query(RoadmapRecord).filter(
        RoadmapRecord.decision_id == decision.id,
        RoadmapRecord.is_active.is_(True),
    ).update({"is_active": False})

    new_roadmap = RoadmapRecord(
        decision_id=decision.id,
        owner_id=decision.owner_id,
        snapshot_id=snapshot.id,
        version=next_version,
        title=synthesis.roadmap.title,
        phases=[p.model_dump() for p in synthesis.roadmap.phases],
        is_active=True,
    )
    db.add(new_roadmap)

    # 3. Update Decision model
    rec_dict = synthesis.model_dump()
    rec_dict["is_stale"] = False
    decision.recommendation = rec_dict
    decision.roadmap = synthesis.roadmap.model_dump()
    decision.status = "decided"

    db.commit()
    db.refresh(decision)

    return synthesis
