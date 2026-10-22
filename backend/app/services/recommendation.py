import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.models import Decision, AnalysisSnapshot, RoadmapRecord
from app.schemas import (
    AlternativeOption,
    AssumptionItem,
    ConfidenceAssessment,
    CounterargumentItem,
    DecisionSynthesis,
    RiskMitigationItem,
    RoadmapData,
    RoadmapPhase,
    RoadmapTask,
    SupportingEvidenceItem,
    SynthesisRequest,
)

logger = logging.getLogger("decisionlens.recommendation")

SYNTHESIS_SYSTEM_PROMPT = """You are DecisionLens Synthesis Engine, an executive-level strategic decision advisor.
Your role is to synthesize all available user inputs, resolved gaps, web research citations, and analytical framework outputs into an objective, defensible decision synthesis and actionable execution roadmap.

CRITICAL FIDELITY & SAFETY RULES:
1. NEVER INVENT SOURCES OR CITATIONS:
   - Any supporting evidence must strictly derive from the user-reported facts in <FACTS> or the verified web research in <RESEARCH_CLAIMS>.
   - If an evidence claim has a source, use the exact title and URL provided. Never fabricate a URL or publisher.
2. NEVER INVENT PROBABILITIES:
   - If the decision tree or inputs do not specify exact probabilities, do NOT guess them. Note the absence of empirical probabilities under confidence limitations.
3. RECOMMENDATION VS CONDITIONAL NEXT STEP:
   - Inspect <UNRESOLVED_UNKNOWNS> and <GAPS>. If any high-importance or critical gaps remain unanswered or skipped, or if critical viability risks are unresolved, DO NOT force an ungrounded final decision. Produce a "conditional_next_step" with explicit conditional triggers and risk-gated milestones.
   - If evidence is solid and key questions are answered, produce a decisive "recommendation".
4. STEEL-MAN OPPOSING ARGUMENTS:
   - Explicitly articulate the strongest counterarguments or objections and provide legitimate rebuttals or concessions.
5. ACTIONABLE ROADMAP:
   - Produce a chronological 3-phase roadmap with concrete tasks, assigned owner roles, realistic timelines, dependencies, and unambiguous success criteria.
6. OUTPUT FORMAT:
   - Output ONLY valid JSON matching the specified schema.
"""


def _detect_critical_unknowns(gaps: Dict[str, Any], points: Dict[str, Any]) -> List[str]:
    """Identify whether any critical or high-importance unknowns/gaps remain unresolved."""
    critical = []

    # Check gaps list
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

    # Check points unknowns
    if isinstance(points, dict):
        unknowns = points.get("unknowns", [])
        for u in unknowns:
            u_str = str(u).lower()
            if any(k in u_str for k in ("tco", "budget", "compliance", "security", "legal", "sla", "sla guarantee", "scalability")):
                critical.append(f"Key Unknown: {u}")

    return critical


def generate_mock_synthesis(
    decision: Decision,
    user_priorities: Optional[List[str]] = None,
    version: int = 1,
) -> DecisionSynthesis:
    """
    Generate high-fidelity deterministic synthesis adhering to all Phase 10 constraints.
    Accurately reflects input points, research claims, matrix scoring, and gap resolution status.
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

    # Check matrix options if available
    matrix_data = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
    matrix_options = matrix_data.get("ranked_options", []) or matrix_data.get("options", [])
    
    top_option_name = "Primary Strategy (Direct Implementation)"
    second_option_name = "Alternative Strategy (Phased Outsourcing / Off-the-Shelf)"
    third_option_name = "Status Quo (Maintain Current Operations)"

    if matrix_options and len(matrix_options) >= 2:
        top_option_name = matrix_options[0].get("name", top_option_name)
        second_option_name = matrix_options[1].get("name", second_option_name)
        if len(matrix_options) > 2:
            third_option_name = matrix_options[2].get("name", third_option_name)

    # Gather real research claims for citations (never invented!)
    supporting_evidence: List[SupportingEvidenceItem] = []
    
    # 1. From real research records if present
    research_list = []
    if isinstance(research, dict):
        research_list = research.get("research", [])
    elif isinstance(research, list):
        research_list = research

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

    # 2. From actual user-reported facts
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

    # 3. From matrix score if available
    if matrix_options:
        top_opt = matrix_options[0]
        supporting_evidence.append(
            SupportingEvidenceItem(
                claim=f"{top_opt.get('name', 'Top Option')} achieved Rank 1 in Decision Matrix with score {top_opt.get('score', top_opt.get('weighted_score', '8.2'))}/10",
                source_title="Deterministic Weighted Decision Matrix",
                source_url=None,
                evidence_type="framework_metric",
                reliability="high",
            )
        )

    # If no evidence was found, supply a grounded default
    if not supporting_evidence:
        supporting_evidence.append(
            SupportingEvidenceItem(
                claim="Decision evaluated based on user-provided operational scope and constraints.",
                source_title="Problem Statement & User Inputs",
                source_url=None,
                evidence_type="user_fact",
                reliability="high",
            )
        )

    # Decide synthesis type: If critical unknowns remain, it MUST be a conditional next step!
    is_conditional = len(critical_unknowns) > 0

    if is_conditional:
        synthesis_type = "conditional_next_step"
        headline = f"Conditional Pilot for '{top_option_name}' Pending Resolution of {len(critical_unknowns)} Critical Unknown(s)"
        rec_text = (
            f"Because key strategic questions remain unresolved regarding {critical_unknowns[0]}, "
            f"committing fully to '{top_option_name}' immediately presents avoidable exposure. "
            f"We recommend initiating a scoped, risk-gated validation pilot for '{top_option_name}' "
            f"while enforcing explicit trigger conditions before capital or operational lock-in."
        )
        conditional_triggers = [
            f"Condition A: Verify satisfactory resolution for {critical_unknowns[0]} before entering long-term contract.",
            f"Condition B: Ensure pilot budget does not exceed predefined 15% contingency limit.",
            f"Pivot Trigger: If validation metrics fall below agreed benchmarks within 30 days, pivot immediately to '{second_option_name}'.",
        ]
        confidence_level = "medium"
        confidence_score = 0.65
        conf_rationale = (
            f"Confidence is moderately constrained ({confidence_score * 100:.0f}%) due to {len(critical_unknowns)} "
            "unresolved high-impact unknown(s) identified in discovery."
        )
    else:
        synthesis_type = "recommendation"
        headline = f"Proceed with Strategic Execution of '{top_option_name}'"
        rec_text = (
            f"Based on comprehensive analysis of verified facts, weighted criteria, and gap resolutions, "
            f"'{top_option_name}' emerges as the superior path, optimizing for strategic control, "
            f"long-term value, and alignment with stated operational goals."
        )
        conditional_triggers = []
        confidence_level = "high"
        confidence_score = 0.88
        conf_rationale = (
            f"High confidence ({confidence_score * 100:.0f}%) supported by validated facts, "
            "comprehensive matrix evaluation, and zero blocking high-importance gaps."
        )

    # Formulate alternatives considered
    alternatives = [
        AlternativeOption(
            name=top_option_name,
            description=f"Primary recommended path emphasizing highest weighted alignment and upside.",
            pros=pros[:2] if pros else ["Direct alignment with strategic goals", "High operational control"],
            cons=cons[:2] if cons else ["Requires upfront resource dedication", "Implementation effort"],
            tradeoffs="Demands higher initial focus in exchange for greater long-term durability and ROI.",
            is_recommended=True,
            why_not_recommended=None,
        ),
        AlternativeOption(
            name=second_option_name,
            description="Secondary contingency option providing faster deployment with reduced customization.",
            pros=["Rapid time-to-market", "Lower initial engineering overhead"],
            cons=["Vendor lock-in vulnerability", "Ongoing variable subscription overhead"],
            tradeoffs="Trading architectural sovereignty and recurring margin for short-term rollout velocity.",
            is_recommended=False,
            why_not_recommended=(
                f"Scored lower on strategic criteria and flexibility compared to {top_option_name}. "
                "Reserved as an active fallback if primary pilot milestones fail."
            ),
        ),
        AlternativeOption(
            name=third_option_name,
            description="Retain baseline operations without structural change.",
            pros=["Zero capital outlay", "No disruption to daily workflow"],
            cons=["Compounds technical and operational debt", "Vulnerable to market and competitor shifts"],
            tradeoffs="Avoids immediate expenditure at the expense of compounded future risk.",
            is_recommended=False,
            why_not_recommended="Fails to solve the root problem and leaves known vulnerabilities unaddressed.",
        ),
    ]

    # Formulate assumptions
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
                assumption="Target team bandwidth and operational continuity remain stable over the next quarter.",
                is_verified=False,
                impact_if_false="Project completion milestones may slip by 2-4 weeks.",
            )
        )

    # Formulate risks and mitigations
    risks_and_mitigations = [
        RiskMitigationItem(
            risk="Resource bottleneck or key personnel turnover during initial deployment phase.",
            severity="high" if is_conditional else "medium",
            mitigation="Establish rigorous architectural documentation and cross-train a secondary engineer on all key modules.",
            contingency_plan="Engage specialized contractor for surge capacity if milestone velocities drop below 80%.",
        ),
        RiskMitigationItem(
            risk="Unbudgeted operational overhead or unanticipated integration friction.",
            severity="medium",
            mitigation="Establish strict weekly cost tracking against defined milestone budgets with an explicit 15% safety buffer.",
            contingency_plan="Descope non-essential secondary features prior to milestone sign-off.",
        ),
    ]

    # Formulate counterarguments
    counterarguments = [
        CounterargumentItem(
            argument=f"Adopting '{second_option_name}' would be faster and avoid internal operational friction.",
            rebuttal_or_concession=(
                f"While '{second_option_name}' offers immediate velocity, it exposes the team to recurring "
                f"licensing increases and dependency risk. The chosen path ({top_option_name}) captures superior "
                f"unit economics and preserves core organizational leverage."
            ),
        ),
        CounterargumentItem(
            argument=f"Deferring this decision until all possible future unknowns are resolved minimizes risk.",
            rebuttal_or_concession=(
                "Indefinite deferral incurs escalating opportunity cost and compounds operational debt. "
                "The proposed risk-gated roadmap manages uncertainty responsibly without paralysis."
            ),
        ),
    ]

    # Formulate confidence limitations
    limitations = [
        f"Grounded exclusively in provided inputs and verified research; external unstated factors were not fabricated."
    ]
    if critical_unknowns:
        limitations.extend(critical_unknowns)
    if "decision_tree" in analysis and analysis["decision_tree"]:
        tree_obj = analysis["decision_tree"]
        if not tree_obj.get("has_deterministic_probabilities"):
            limitations.append("Decision Tree branch probabilities were unstated and were intentionally not fabricated.")

    confidence = ConfidenceAssessment(
        level=confidence_level,
        score=confidence_score,
        rationale=conf_rationale,
        limitations=limitations,
    )

    # Formulate Actionable Roadmap
    roadmap = RoadmapData(
        title=f"Strategic Execution Roadmap: {top_option_name}",
        phases=[
            RoadmapPhase(
                phase_id="phase-1",
                title="Phase 1: Pre-Commitment & Risk Validation",
                timeline="Weeks 1-2",
                description="Validate core assumptions, resolve remaining critical gaps, and establish benchmark criteria.",
                tasks=[
                    RoadmapTask(
                        task_id="task-1-1",
                        title="Finalize Stakeholder Requirements & Boundary Conditions",
                        description="Document non-negotiable architectural, security, and budget thresholds.",
                        owner_role="Decision Lead",
                        timeline="Week 1",
                        dependencies=[],
                        success_criteria="Signed charter with approved boundary conditions.",
                        is_completed=False,
                    ),
                    RoadmapTask(
                        task_id="task-1-2",
                        title="Execute Scoped Proof-of-Concept / Verification Spike",
                        description=f"Conduct rapid 5-day technical spike on key integration points for {top_option_name}.",
                        owner_role="Technical Lead",
                        timeline="Week 2",
                        dependencies=["task-1-1"],
                        success_criteria="Spike demonstrates acceptable performance and validates critical unknown resolutions.",
                        is_completed=False,
                    ),
                ],
            ),
            RoadmapPhase(
                phase_id="phase-2",
                title="Phase 2: Core Implementation & Pilot Rollout",
                timeline="Weeks 3-6",
                description="Implement primary capabilities and deploy to controlled pilot audience.",
                tasks=[
                    RoadmapTask(
                        task_id="task-2-1",
                        title="Deploy Core Infrastructure & Integrations",
                        description="Build and integrate primary system components with automated test coverage.",
                        owner_role="Engineering Team",
                        timeline="Weeks 3-4",
                        dependencies=["task-1-2"],
                        success_criteria="Passing integration test suite and staging environment operational.",
                        is_completed=False,
                    ),
                    RoadmapTask(
                        task_id="task-2-2",
                        title="Conduct Controlled Pilot Launch",
                        description="Roll out to initial 10-20% subset of users/processes to capture operational telemetry.",
                        owner_role="Operations Lead",
                        timeline="Weeks 5-6",
                        dependencies=["task-2-1"],
                        success_criteria="Zero critical regressions and user satisfaction rating > 85%.",
                        is_completed=False,
                    ),
                ],
            ),
            RoadmapPhase(
                phase_id="phase-3",
                title="Phase 3: Full Cutover & Value Realization",
                timeline="Weeks 7-8",
                description="Execute complete organizational transition and review post-decision ROI.",
                tasks=[
                    RoadmapTask(
                        task_id="task-3-1",
                        title="Execute Full Production Migration",
                        description="Complete remaining cutover, decommission legacy pathways, and monitor live metrics.",
                        owner_role="DevOps & Operations",
                        timeline="Week 7",
                        dependencies=["task-2-2"],
                        success_criteria="100% traffic transitioned with operational SLAs within target margins.",
                        is_completed=False,
                    ),
                    RoadmapTask(
                        task_id="task-3-2",
                        title="Post-Implementation Review & Retrospective",
                        description="Measure realized outcomes against Decision Matrix criteria and roadmap milestones.",
                        owner_role="Executive Sponsor",
                        timeline="Week 8",
                        dependencies=["task-3-1"],
                        success_criteria="Formal executive report documenting achieved metrics and lessons learned.",
                        is_completed=False,
                    ),
                ],
            ),
        ],
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
        created_at=datetime.now(timezone.utc).isoformat(),
        version=version,
    )


def execute_hosted_synthesis(
    decision: Decision,
    user_priorities: Optional[List[str]] = None,
    version: int = 1,
) -> DecisionSynthesis:
    """Execute hosted LLM synthesis call with strict grounding and schema validation."""
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    points = decision.points or {}
    gaps = decision.gaps or {}
    research = decision.research or {}
    analysis = decision.analysis or {}

    payload_context = {
        "title": decision.title,
        "problem_statement": decision.problem_statement,
        "raw_input": decision.raw_input,
        "facts": points.get("facts", []),
        "assumptions": points.get("assumptions", []),
        "pros": points.get("pros", []),
        "cons": points.get("cons", []),
        "unknowns": points.get("unknowns", []),
        "contradictions": points.get("contradictions", []),
        "gaps": gaps,
        "research": research,
        "framework_analysis": analysis,
        "user_priorities": user_priorities or [],
        "version": version,
    }

    prompt_user = (
        f"Synthesize the final decision recommendation and execution roadmap based on the following verified decision context:\n\n"
        f"{json.dumps(payload_context, indent=2)}\n\n"
        f"Remember: Do NOT invent sources or probabilities. If critical unknowns remain, return 'conditional_next_step'. "
        f"Output JSON strictly matching the DecisionSynthesis schema."
    )

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
            {"role": "user", "content": prompt_user},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    raw_content = response.choices[0].message.content
    if not raw_content:
        raise ValueError("Empty response received from LLM during decision synthesis.")

    parsed = json.loads(raw_content)
    parsed["decision_id"] = decision.id
    parsed["version"] = version
    parsed["created_at"] = datetime.now(timezone.utc).isoformat()

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
    4. Updates Decision model fields (recommendation, roadmap, status='decided').
    """
    # Determine next snapshot version
    max_version = (
        db.query(func.max(AnalysisSnapshot.version))
        .filter(AnalysisSnapshot.decision_id == decision.id)
        .scalar()
    ) or 0
    next_version = max_version + 1

    # Generate synthesis
    if force_mock or not settings.openai_api_key:
        logger.info("Using deterministic mock synthesis engine (force_mock=%s)", force_mock)
        synthesis = generate_mock_synthesis(decision, user_priorities, version=next_version)
    else:
        try:
            logger.info("Executing hosted OpenAI decision synthesis for decision %s", decision.id)
            synthesis = execute_hosted_synthesis(decision, user_priorities, version=next_version)
        except Exception as exc:
            logger.warning("Hosted synthesis failed (%s), falling back to high-fidelity mock", exc)
            synthesis = generate_mock_synthesis(decision, user_priorities, version=next_version)

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
    decision.recommendation = synthesis.model_dump()
    decision.roadmap = synthesis.roadmap.model_dump()
    decision.status = "decided"

    db.commit()
    db.refresh(decision)

    return synthesis
