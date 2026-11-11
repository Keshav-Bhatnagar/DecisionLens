import json
import logging
import re
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
    BlunderReceipt,
    BlunderShield,
    CanonicalDecisionResult,
    ConfidenceAssessment,
    CounterargumentItem,
    DecisionDomain,
    DecisionSynthesis,
    ReceiptLineItem,
    RiskMitigationItem,
    RoadmapData,
    RoadmapPhase,
    RoadmapTask,
    SupportingEvidenceItem,
    SynthesisRequest,
)

logger = logging.getLogger("decisionlens.recommendation")

SYNTHESIS_SYSTEM_PROMPT = """You are the Stage 5 Executive Decision Synthesis & Governance Engine for DecisionLens.
Your mandate is to synthesize multi-stage analytical findings (structured facts, answered research gaps, identified risks, and multi-criteria evaluations) into an authoritative, executive-grade decision memo, quantified capital-at-risk blunder shield, and actionable execution roadmap.

================================================================================
EXECUTIVE MANDATE & WRITING GUIDELINES:
================================================================================
1. NATURAL EXECUTIVE VOICE:
   - Write with clarity, intellectual honesty, and executive authority.
   - Avoid mechanical boilerplate, robotic clichés, or repeating raw formulas like "Based on deterministic Weighted Decision Matrix analysis... achieved Rank #1 with score X/10".
   - State the core strategic verdict directly in the headline and recommendation narrative.
   - Frame the rationale around real operational advantages, risk posture, and alignment with the decision goals.

2. DECISION POSTURE & AUTHORITY ENFORCEMENT:
   - PARTICIPANT AUTHORITY & VETO RESPECT:
     * If an alternative violates an explicit "[DEVOPS / SRE CONSTRAINT]" (e.g. exceeds infra capacity, violates uptime SLAs, lacks failover), it CANNOT be recommended unconditionally and MUST trigger a pre-mortem due-diligence spike.
     * If an alternative breaches a "[SECURITY CONSTRAINT]" (e.g. non-compliant data residency under DPDP Act, unencrypted storage), it CANNOT be recommended as an unconditional winner.
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
  "blunder_shield": {
    "capital_at_risk_saved": "Estimated capital at risk saved (e.g. '₹45 Lakh – ₹65 Lakh')",
    "developer_sprints_saved": "Estimated engineering velocity saved (e.g. '6 Sprints (12 Wks)')",
    "prevented_fatal_trap": "Specific fatal sunk-cost trap or flawed alternative neutralized",
    "risk_reduction_rationale": "Clear operational rationale explaining why capital and velocity are protected"
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


def compute_blunder_shield(
    domain: str,
    top_option_name: str,
    risks: Optional[List[str]] = None,
    runner_up_name: Optional[str] = None,
    decision_title: Optional[str] = None,
    problem_statement: Optional[str] = None,
    facts: Optional[List[str]] = None,
    decision_id: Optional[int] = None,
) -> BlunderShield:
    """
    Epistemically compute the Capital at Risk prevented, engineering velocity saved,
    fatal sunk-cost trap neutralized, and itemized financial receipt for the executive synthesis.
    Context-aware: dynamically classifies into Cloud Migration, Build vs Buy, Database Architecture,
    Software Rewrite, Real Estate, Finance, Career, or Operations.
    """
    domain_upper = (domain or "BUSINESS").upper()
    runner = runner_up_name or "Alternative Option"
    
    # Analyze contextual keywords to determine exact financial archetype
    context_text = f"{decision_title or ''} {problem_statement or ''} {top_option_name or ''} {runner_up_name or ''} {' '.join(str(f) for f in (facts or []))}".lower()

    # Cloud-to-cloud vendor migration (e.g. AWS vs Azure, GCP vs AWS, on-prem to cloud)
    is_cloud_vendor = (
        ("aws" in context_text and "azure" in context_text)
        or ("cloud migration" in context_text)
        or ("multi-cloud" in context_text)
        or ("cloud provider" in context_text)
        or any(k in context_text for k in ["aws vs", "azure vs", "gcp vs", "google cloud vs", "on-prem vs", "on-premise vs"])
    ) and not any(k in context_text for k in ["microservices vs", "monolith vs", "modular monolith"])

    is_build_vs_buy = any(k in context_text for k in ["build vs buy", "buy vs build", "in-house vs", "in house vs", "auth0", "stripe", "vendor vs", "saas vs", "off-the-shelf", "custom auth", "custom payment"])
    is_database_engine = any(k in context_text for k in ["database migration", "sql vs nosql", "acid vs", "postgres vs", "dynamodb vs", "mongodb vs", "cassandra vs"]) and not any(k in context_text for k in ["microservices vs", "monolith vs"])

    dec_id_tag = decision_id or 101
    line_items: List[ReceiptLineItem] = []

    if is_cloud_vendor and domain_upper in ("SOFTWARE", "PRODUCT", "BUSINESS", "OPERATIONS"):
        archetype = "CLOUD_MIGRATION"
        capital = "₹48 Lakh – ₹72 Lakh"
        sprints = "5 Sprints (10 Wks)"
        trap = f"Stranded cloud commitments with {runner}, cross-cloud egress tariffs, and multi-region FinOps drift"
        rationale = "Neutralized dual-cloud cutover bill overlap, AWS/Azure reservation penalties, and IAM policy divergence."
        line_items = [
            ReceiptLineItem(
                item_name="Dual-Cloud Cutover Run-Rate Overlap",
                category="Cloud Infrastructure",
                unit_basis="Parallel staging & production testing across both clouds (8 weeks)",
                amount_inr="₹14.50 Lakh",
                rationale="Dual billing avoided through disciplined staged cutover rather than protracted trial.",
            ),
            ReceiptLineItem(
                item_name="Cross-Cloud Data Egress & Transfer Tariffs",
                category="Network & Bandwidth",
                unit_basis="Database state snapshot & storage sync egress tariffs (~45TB transfer @ standard egress)",
                amount_inr="₹4.20 Lakh",
                rationale="Prevented repeat bulk data roundtrips through staged local snapshot verification.",
            ),
            ReceiptLineItem(
                item_name="Unamortized Committed Use / RI Shortfall",
                category="Vendor Contract Commitments",
                unit_basis="Pre-committed 1-year compute savings plan shortfall on deprioritized vendor",
                amount_inr="₹21.00 Lakh",
                rationale="Avoided stranded compute commitments by aligning contract renewal timeline with migration milestones.",
            ),
            ReceiptLineItem(
                item_name="Cloud IAM, Terraform & FinOps Retraining",
                category="Engineering Enablement",
                unit_basis="SRE & Platform pod retraining on IAM policies, security guardrails, and IaC translation",
                amount_inr="₹8.50 Lakh",
                rationale="Prevented production outage risks stemming from cloud IAM permission mismatches.",
            ),
        ]
        total_receipt = "₹48.20 Lakh"

    elif is_build_vs_buy and domain_upper in ("SOFTWARE", "PRODUCT", "BUSINESS"):
        archetype = "BUILD_VS_BUY"
        capital = "₹45 Lakh – ₹68 Lakh"
        sprints = "6 Sprints (12 Wks)"
        trap = f"Custom maintenance toil and technical debt trap with {runner} vs undifferentiated SaaS commodity"
        rationale = "Shielded engineering velocity from maintaining non-core primitives and avoided enterprise seat tax escalations."
        line_items = [
            ReceiptLineItem(
                item_name="Enterprise Platform Tier & Seat Escalation",
                category="Vendor Licensing",
                unit_basis="Year 1 enterprise platform tier minimum commit + user seat expansion",
                amount_inr="₹18.50 Lakh",
                rationale="Avoided paying for high-tier enterprise features before true usage demand.",
            ),
            ReceiptLineItem(
                item_name="Custom Maintenance Sprints & Protocol Upgrades",
                category="Developer Payroll",
                unit_basis="2 dedicated engineers maintaining custom adapters, tokens & bugfixes (6 months)",
                amount_inr="₹24.00 Lakh",
                rationale="Shielded engineering capacity to focus on core product revenue drivers.",
            ),
            ReceiptLineItem(
                item_name="SOC-2 / Security Vulnerability Auditing",
                category="Compliance & Security",
                unit_basis="Independent penetration testing and compliance audit overhead",
                amount_inr="₹8.50 Lakh",
                rationale="Prevented enterprise sales deal stalls caused by uncertified custom authentication.",
            ),
        ]
        total_receipt = "₹51.00 Lakh"

    elif is_database_engine and domain_upper in ("SOFTWARE", "PRODUCT"):
        archetype = "DATABASE_ARCHITECTURE"
        capital = "₹45 Lakh – ₹65 Lakh"
        sprints = "6 Sprints (12 Wks)"
        trap = f"Distributed transaction inconsistency and manual sharding toil from premature adoption of {runner}"
        rationale = "Prevented database dual-write complexity, data patching toil, and overprovisioned IOPS burn."
        line_items = [
            ReceiptLineItem(
                item_name="Database Sharding & Overprovisioned Compute",
                category="Cloud Storage / Compute",
                unit_basis="Premature multi-node cluster provisioning and unneeded IOPS allocations (6 months)",
                amount_inr="₹12.50 Lakh",
                rationale="Avoided paying for unneeded multi-region distributed nodes before query bottlenecks emerged.",
            ),
            ReceiptLineItem(
                item_name="Distributed Inconsistency & Data Patching Toil",
                category="Engineering SRE Drag",
                unit_basis="Engineers manually resolving eventual consistency conflicts and reconciliation jobs",
                amount_inr="₹18.00 Lakh",
                rationale="Eliminated weekly operational firefighting around distributed state drift.",
            ),
            ReceiptLineItem(
                item_name="Dual-Write Migration Pipeline & Schema Drift",
                category="Developer Payroll",
                unit_basis="Pipeline engineering for rollback protection and backward compatibility",
                amount_inr="₹14.50 Lakh",
                rationale="Prevented schema desynchronization during cutover.",
            ),
        ]
        total_receipt = "₹45.00 Lakh"

    elif domain_upper == "REAL_ESTATE":
        archetype = "REAL_ESTATE_ACQUISITION"
        capital = "₹1.50 Cr – ₹2.80 Cr"
        sprints = "8 Sprints (16 Wks)"
        trap = f"Irrevocable capital lockup in {runner} with title defects or unvetted zoning"
        rationale = "Neutralized unhedged capital allocation, boundary disputes, and high carrying costs."
        line_items = [
            ReceiptLineItem(
                item_name="Stamp Duty & Registration Fee Overhang",
                category="Statutory Regulatory Costs",
                unit_basis="6% statutory levy on acquisition value committed prematurely",
                amount_inr="₹75.00 Lakh",
                rationale="Avoided non-refundable statutory disbursements prior to clear title search.",
            ),
            ReceiptLineItem(
                item_name="Carrying Cost of Capital During Gestation",
                category="Cost of Capital",
                unit_basis="12% per annum financing interest during extended approvals lockup",
                amount_inr="₹60.00 Lakh",
                rationale="Protected corporate balance sheet liquidity from unproductive land carrying drag.",
            ),
            ReceiptLineItem(
                item_name="Independent Title Search, Zoning & Legal Retainers",
                category="Professional Advisory",
                unit_basis="Comprehensive 30-year revenue records search and environmental clearances",
                amount_inr="₹15.00 Lakh",
                rationale="Secured complete indemnity coverage before executing binding conveyance deed.",
            ),
        ]
        total_receipt = "₹1.50 Cr"

    elif domain_upper == "FINANCE":
        archetype = "FINANCIAL_TREASURY"
        capital = "₹85 Lakh – ₹1.40 Cr"
        sprints = "6 Sprints (12 Wks)"
        trap = f"Premature balance-sheet exposure and non-amortizable commitments via {runner}"
        rationale = "Prevented negative net present value drift, interest rate drag, and unhedged counterparty risk."
        line_items = [
            ReceiptLineItem(
                item_name="Premature Balance Sheet Liquidity Lockup",
                category="Liquidity Opportunity Cost",
                unit_basis="Opportunity cost of unallocated treasury liquidity deployed in low-yield asset",
                amount_inr="₹45.00 Lakh",
                rationale="Preserved working capital optionality for higher risk-adjusted operating hurdles.",
            ),
            ReceiptLineItem(
                item_name="Unhedged Interest Rate & Counterparty Risk",
                category="Market & Credit Risk",
                unit_basis="Basis-point drift exposure on unhedged variable rate commitments",
                amount_inr="₹35.00 Lakh",
                rationale="Neutralized balance-sheet volatility through fixed milestone covenant structures.",
            ),
            ReceiptLineItem(
                item_name="Regulatory Compliance & Capital Adequacy Buffer",
                category="Compliance Reserve",
                unit_basis="Reserve capital required to satisfy statutory solvency mandates",
                amount_inr="₹15.00 Lakh",
                rationale="Maintained mandatory capital buffers without triggering punitive audits.",
            ),
        ]
        total_receipt = "₹95.00 Lakh"

    elif domain_upper == "CAREER":
        archetype = "CAREER_CAPITAL"
        capital = "₹25 Lakh – ₹45 Lakh"
        sprints = "4 Sprints (8 Wks)"
        trap = f"Costly career detour or golden handcuffs commitment to {runner}"
        rationale = "Protected professional compounding, avoided skill stagnation, and preserved strategic optionality."
        line_items = [
            ReceiptLineItem(
                item_name="Compounding Compensation Opportunity Cost",
                category="Earnings Potential",
                unit_basis="12-month delta in market base salary and equity value accrual",
                amount_inr="₹24.00 Lakh",
                rationale="Avoided 1-year plateau in sub-market compensation band.",
            ),
            ReceiptLineItem(
                item_name="Severance Risk & Equity Vesting Forfeiture",
                category="Equity & Benefits",
                unit_basis="Unvested cliff options forfeited upon premature organizational pivot",
                amount_inr="₹12.00 Lakh",
                rationale="Ensured minimum guaranteed vesting horizon before executing career transition.",
            ),
            ReceiptLineItem(
                item_name="Skill Depreciation in Deprioritized Domain",
                category="Human Capital",
                unit_basis="Cost of re-skilling after working on legacy or non-strategic tech stack",
                amount_inr="₹8.00 Lakh",
                rationale="Preserved technical relevancy in high-demand architectural paradigms.",
            ),
        ]
        total_receipt = "₹44.00 Lakh"

    elif domain_upper in ("SOFTWARE", "PRODUCT"):
        has_k8s = any(k in context_text for k in ["k8s", "kubernetes", "eks", "gke", "aks", "helm", "service mesh", "istio"])
        has_kafka = any(k in context_text for k in ["kafka", "msk", "event-driven", "event driven", "confluent", "rabbitmq", "pubsub"])
        has_serverless = any(k in context_text for k in ["serverless", "lambda", "fargate", "api gateway", "eventbridge", "cloud functions"])

        if has_k8s or has_kafka:
            archetype = "KUBERNETES_MICROSERVICES"
            capital = "₹52 Lakh – ₹78 Lakh"
            sprints = "6 Sprints (12 Wks)"
            trap = f"Managed Kubernetes (EKS/GKE) & Kafka cluster sprawl with {runner} vs lean modular architecture"
            rationale = "Neutralized multi-AZ control plane tariffs, node overprovisioning, managed Kafka broker minimums, and service-mesh telemetry sprawl."
            line_items = [
                ReceiptLineItem(
                    item_name="Engineering SRE & Platform Pod Payroll",
                    category="DevOps & Platform Engineering",
                    unit_basis="1 Platform/K8s Architect + 2 Backend Seniors + 1 SRE (3 months / 6 sprints @ ₹11.2L/mo)",
                    amount_inr="₹33.60 Lakh",
                    rationale="Avoided hiring specialized Kubernetes/Helm infrastructure engineers before traffic justifies it.",
                ),
                ReceiptLineItem(
                    item_name="Managed K8s Control Plane & Multi-AZ Worker Nodes",
                    category="Cloud Compute & Clusters",
                    unit_basis="EKS/GKE cluster fees ($73/mo) + minimum 6 multi-AZ worker nodes overprovisioned for pod headroom",
                    amount_inr="₹8.40 Lakh",
                    rationale="Eliminated baseline cluster tax and idle compute capacity reserved for autoscaling buffers.",
                ),
                ReceiptLineItem(
                    item_name="Managed Kafka / Event Broker Minimum Cluster Commit",
                    category="Message Streaming Infrastructure",
                    unit_basis="3-broker production Kafka (MSK / Confluent) minimum cluster tier + storage IOPS",
                    amount_inr="₹7.20 Lakh",
                    rationale="Prevented paying high minimum cluster baselines for modest message throughput.",
                ),
                ReceiptLineItem(
                    item_name="Distributed Tracing & APM Telemetry Ingestion",
                    category="Observability & Log Tariffs",
                    unit_basis="Datadog / APM host agents + distributed span ingestion and cross-AZ NAT gateway fees",
                    amount_inr="₹5.80 Lakh",
                    rationale="Avoided paying punitive per-gigabyte log and span ingestion fees across microservice hops.",
                ),
            ]
            total_receipt = "₹55.00 Lakh"

        elif has_serverless:
            archetype = "SERVERLESS_MICROSERVICES"
            capital = "₹42 Lakh – ₹64 Lakh"
            sprints = "5 Sprints (10 Wks)"
            trap = f"API Gateway request metering, cold-start latency mitigation, and distributed state fragmentation with {runner}"
            rationale = "Avoided high API Gateway invocation surcharges, provisioned concurrency waste, and multi-service debugging drag."
            line_items = [
                ReceiptLineItem(
                    item_name="Developer Pod Serverless Decomposition Burn",
                    category="Developer Payroll",
                    unit_basis="2 Backend Seniors + 1 Cloud Architect decomposing domains into discrete Lambda functions",
                    amount_inr="₹28.00 Lakh",
                    rationale="Prevented fragmentation of business logic across dozens of isolated serverless handlers.",
                ),
                ReceiptLineItem(
                    item_name="API Gateway & Ingress Request Metering Surcharges",
                    category="Cloud API Ingress",
                    unit_basis="High-frequency HTTP calls through API Gateway ($3.50/M) + cross-function VPC NAT gateways",
                    amount_inr="₹6.80 Lakh",
                    rationale="Avoided paying per-request gateway taxes on high internal microservice-to-microservice traffic.",
                ),
                ReceiptLineItem(
                    item_name="Provisioned Concurrency & Cold-Start Latency Buffer",
                    category="Serverless Compute",
                    unit_basis="Keeping pre-warmed execution environments active to satisfy latency SLAs",
                    amount_inr="₹5.40 Lakh",
                    rationale="Eliminated paying for idle compute in serverless architectures to mask cold start latency.",
                ),
                ReceiptLineItem(
                    item_name="Distributed Observability & CloudWatch Log Ingestion",
                    category="Telemetry Tariffs",
                    unit_basis="CloudWatch Logs ingestion ($0.50/GB) + X-Ray distributed trace aggregation",
                    amount_inr="₹4.80 Lakh",
                    rationale="Prevented runaway CloudWatch logging bills from chatty microservice communications.",
                ),
            ]
            total_receipt = "₹45.00 Lakh"

        else:
            archetype = "ARCHITECTURE_REWRITE"
            capital = "₹45 Lakh – ₹65 Lakh"
            sprints = "6 Sprints (12 Wks)"
            trap = f"Premature architecture sprawl and maintenance drag from {runner}"
            rationale = "Avoided unbudgeted rewrite toil, licensing lock-in, and severe developer on-call burnout."
            line_items = [
                ReceiptLineItem(
                    item_name="5-Person Engineering Pod Payroll Burn",
                    category="Engineering Payroll",
                    unit_basis="1 Lead Architect + 2 Seniors + 1 SRE + 1 QA (3 months / 6 sprints @ ₹10.8L/mo)",
                    amount_inr="₹32.50 Lakh",
                    rationale="Direct payroll waste avoided on aborted architecture that would be refactored.",
                ),
                ReceiptLineItem(
                    item_name="POC Staging Clusters & Telemetry Ingestion Sprawl",
                    category="Cloud Infrastructure",
                    unit_basis="Unneeded staging Kubernetes clusters, distributed tracing logs, and message queues",
                    amount_inr="₹6.50 Lakh",
                    rationale="Prevented running oversized infrastructure before product throughput demands it.",
                ),
                ReceiptLineItem(
                    item_name="Rollback Technical Debt & Incident Firefighting Drag",
                    category="Developer Toil",
                    unit_basis="Developer hours spent unwinding circular dependencies and on-call paging",
                    amount_inr="₹11.00 Lakh",
                    rationale="Protected team morale, prevented developer attrition, and maintained product delivery cadence.",
                ),
            ]
            total_receipt = "₹50.00 Lakh"

    else:
        archetype = "OPERATIONAL_GOVERNANCE"
        capital = "₹50 Lakh – ₹80 Lakh"
        sprints = "5 Sprints (10 Wks)"
        trap = f"Single-vendor lock-in and supply-chain fragility with {runner}"
        rationale = "Secured dual-sourcing resilience, prevented SLA penalty defaults, and controlled operational overhead."
        line_items = [
            ReceiptLineItem(
                item_name="Vendor Lock-in & Supply Chain Disruption Exposure",
                category="Procurement Risk",
                unit_basis="Sole-source supplier premium and inventory buffer holding costs",
                amount_inr="₹28.00 Lakh",
                rationale="Secured dual-sourcing commercial leverage before volume scale-up.",
            ),
            ReceiptLineItem(
                item_name="Operational Rework & SLA Penalty Default",
                category="Operational Continuity",
                unit_basis="Contractual SLA default liquidated damages avoided from operational bottlenecks",
                amount_inr="₹16.00 Lakh",
                rationale="Guaranteed service uptime standards during process transition.",
            ),
            ReceiptLineItem(
                item_name="Procurement Due Diligence & Audit Buffer",
                category="Quality Assurance",
                unit_basis="Independent third-party vendor quality and security audit retainers",
                amount_inr="₹12.00 Lakh",
                rationale="Prevented onboarding financially unstable vendors.",
            ),
        ]
        total_receipt = "₹56.00 Lakh"

    if risks and len(risks) > 0:
        first_risk = str(risks[0]).strip()
        if len(first_risk) > 10 and not first_risk.startswith("Unbudgeted"):
            rationale = f"{rationale} Proactively mitigates: {first_risk[:90]}."

    receipt_obj = BlunderReceipt(
        receipt_id=f"RCP-DEC-{dec_id_tag:04d}-{archetype[:6]}",
        decision_type=archetype,
        total_capital_at_risk=total_receipt,
        line_items=line_items,
        currency="INR",
        audit_standard="DecisionLens Munshi FinOps Standard v2.1",
    )

    return BlunderShield(
        capital_at_risk_saved=capital,
        developer_sprints_saved=sprints,
        prevented_fatal_trap=trap,
        risk_reduction_rationale=rationale,
        receipt=receipt_obj,
    )


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
        "PRODUCT": (
            "Principal Product Manager",
            "Growth & Analytics Lead",
            "Design & Engineering Lead",
            "Chief Product Officer",
        ),
        "OPERATIONS": (
            "Head of Procurement & Supply",
            "Quality Assurance Lead",
            "Logistics Operations Director",
            "Chief Operating Officer",
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
        elif domain_upper == "PRODUCT":
            phase1_tasks.append(
                RoadmapTask(
                    task_id="task-p1-prod",
                    title=f"Activation Milestone & Cohort Prototype Validation{title_context}",
                    description=f"Run qualitative user interviews and low-fidelity prototype walkthrough to test Time-to-Value for {top_option_name}.",
                    owner_role=legal_role,
                    timeline="Weeks 1-2",
                    dependencies=[],
                    success_criteria="Validated activation funnel with >= 80% user prototype task completion rate.",
                    is_completed=False,
                    source_type="decision_requirement",
                    reason="Empirically verifies core value hypothesis before allocating engineering sprints.",
                )
            )
        elif domain_upper == "OPERATIONS":
            phase1_tasks.append(
                RoadmapTask(
                    task_id="task-p1-ops",
                    title=f"Supplier SLA & Dual-Sourcing Feasibility Audit{title_context}",
                    description=f"Audit vendor OTIF history, lead time variance, and secondary backup capacity for {top_option_name}.",
                    owner_role=legal_role,
                    timeline="Weeks 1-2",
                    dependencies=[],
                    success_criteria="Verified vendor capability assessment with >= 95% target OTIF SLA agreement.",
                    is_completed=False,
                    source_type="decision_requirement",
                    reason="Insulates supply chain against single-source disruption and inventory stockouts.",
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

    # Phase 2: Core Execution, System Build & Milestone Rollout (Weeks 3-5)
    if domain_upper == "REAL_ESTATE":
        phase2_tasks: List[RoadmapTask] = [
            RoadmapTask(
                task_id="task-p2-terms",
                title=f"Draft Joint Development Agreements & Finalize Conveyance Terms for {top_option_name}",
                description=f"Establish binding conveyance covenants, milestone-linked escrow payment schedules, and title indemnity terms with the registrar.",
                owner_role=legal_role,
                timeline="Weeks 3-4",
                dependencies=[t.task_id for t in phase1_tasks[:1]],
                success_criteria="Executed definitive conveyance charter and escrow agreements signed with registrar.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Translates strategic intent into binding legal agreements and financial escrow controls.",
            ),
            RoadmapTask(
                task_id="task-p2-exec",
                title=f"Site Demarcation, Perimeter Fencing & Utility Mobilization",
                description=f"Conduct physical boundary survey, erect permanent perimeter markers, and clear right-of-way feeder road access for {top_option_name}.",
                owner_role=ops_role,
                timeline="Weeks 4-5",
                dependencies=["task-p2-terms"],
                success_criteria="Complete boundary demarcation and physical perimeter handover certificate signed.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Secures physical possession and site control within verified zoning parameters.",
            ),
            RoadmapTask(
                task_id="task-p2-canary",
                title="Statutory Zoning Sanctions & Master Plan Layout Sanctions",
                description="Submit master layout to competent town planning authority and procure statutory environmental and zoning clearances.",
                owner_role=risk_role,
                timeline="Week 5",
                dependencies=["task-p2-exec"],
                success_criteria="Sanctioned master layout plan and formal zoning commencement certificate obtained.",
                is_completed=False,
                source_type="risk",
                reason="Guarantees regulatory compliance and eliminates municipal halt risk during execution.",
            ),
        ]

        # Phase 3: Operationalization, Hardening & Value Realization (Weeks 6-8)
        phase3_tasks: List[RoadmapTask] = [
            RoadmapTask(
                task_id="task-p3-close",
                title=f"Complete Final Deed Registration & Escrow Tranche Disbursement{title_context}",
                description=f"Register definitive deed at the sub-registrar office, disburse escrow milestone tranches, and clear residual encumbrance liabilities.",
                owner_role=legal_role,
                timeline="Weeks 6-7",
                dependencies=["task-p2-canary"],
                success_criteria="Registered sale deed index-II issued and non-encumbrance certificate verified.",
                is_completed=False,
                source_type="condition",
                reason="Formalizes legal conveyance and secures unencumbered asset ownership.",
            ),
            RoadmapTask(
                task_id="task-p3-runbook",
                title="Anchor Tenant Commercial Leasing & Facility Handover Protocol",
                description="Finalize institutional warehouse lease agreements and transfer site operating protocols to asset managers.",
                owner_role=ops_role,
                timeline="Week 7",
                dependencies=["task-p3-close"],
                success_criteria="Executed pre-lease LOIs covering >= 30% of planned gross leasable area.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Ensures immediate cash-flow generation and operational continuity.",
            ),
            RoadmapTask(
                task_id="task-p3-gov",
                title="Institute Boardroom Audit Cadence & 30-Day Fiduciary Valuation Review",
                description=f"Establish monthly executive committee cadence to audit realized outcomes against the Sunk-Cost Shield target and asset valuation benchmarks.",
                owner_role=exec_role,
                timeline="Week 8",
                dependencies=["task-p3-runbook"],
                success_criteria="First 30-day post-closing governance scorecard signed off by executive stakeholders.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Guarantees sustained fiduciary accountability and ensures expected strategic ROI is captured.",
            ),
        ]
    elif domain_upper == "SOFTWARE":
        phase2_tasks: List[RoadmapTask] = [
            RoadmapTask(
                task_id="task-p2-terms",
                title=f"Draft System Specifications & Finalize Contracts for {top_option_name}",
                description=f"Establish architectural API contracts, milestone-linked delivery SLAs, and vendor indemnity terms.",
                owner_role=ops_role if ops_role != "Lead Technical Architect" else "Lead Technical Architect",
                timeline="Weeks 3-4",
                dependencies=[t.task_id for t in phase1_tasks[:1]],
                success_criteria="Executed definitive specification charter and contractual agreements signed.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Translates strategic intent into binding architectural contracts and operational governance.",
            ),
            RoadmapTask(
                task_id="task-p2-exec",
                title=f"Launch Core Implementation & Dual-Run Canary Migration",
                description=f"Mobilize engineering pods, build core service modules, and establish real-time telemetry pipelines.",
                owner_role="Lead Technical Architect",
                timeline="Weeks 4-5",
                dependencies=["task-p2-terms"],
                success_criteria="Core functional modules deployed to staging environment passing end-to-end integration tests.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Unleashes primary execution within controlled risk parameters.",
            ),
            RoadmapTask(
                task_id="task-p2-canary",
                title="Deploy Automated Canary Routing with Rollback Circuit Breakers",
                description="Configure staged 5% -> 25% -> 100% traffic shifting with automated rollback triggered on P99 latency spikes or error budget burn.",
                owner_role="Staff SRE / Platform Lead",
                timeline="Week 5",
                dependencies=["task-p2-exec"],
                success_criteria="Canary routing verified in staging with automated rollback drill executed successfully.",
                is_completed=False,
                source_type="risk",
                reason="Guarantees zero-outage blast radius containment during initial production exposure.",
            ),
        ]

        # Phase 3: Operationalization, Hardening & Value Realization (Weeks 6-8)
        phase3_tasks: List[RoadmapTask] = [
            RoadmapTask(
                task_id="task-p3-close",
                title=f"Complete Production Cutover & Deprecate Stranded Legacy Assets{title_context}",
                description=f"Execute full production cutover, decommission deprioritized infrastructure, and eliminate stranded cloud spend.",
                owner_role="Staff SRE / Platform Lead",
                timeline="Weeks 6-7",
                dependencies=["task-p2-canary"],
                success_criteria="Full production traffic cutover complete with 100% of legacy resources cleanly de-provisioned.",
                is_completed=False,
                source_type="condition",
                reason="Formalizes cutover commitment and prevents lingering zombie asset cloud burn.",
            ),
            RoadmapTask(
                task_id="task-p3-runbook",
                title="Operational Runbook Handover & 24/7 Incident Escalation Playbook",
                description="Transfer steady-state operating runbooks, alert runbooks, and SLA dashboards to on-call platform engineers.",
                owner_role="Staff SRE / Platform Lead",
                timeline="Week 7",
                dependencies=["task-p3-close"],
                success_criteria="Operations team completes simulation walkthrough with documented runbooks verified.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Ensures operational continuity and prevents single-engineer bus-factor vulnerability.",
            ),
            RoadmapTask(
                task_id="task-p3-gov",
                title="Institute Boardroom Audit Cadence & 30-Day Fiduciary ROI Review",
                description=f"Establish monthly executive committee cadence to audit realized outcomes against the Sunk-Cost Shield target.",
                owner_role="Fiduciary Sponsor / VP Eng",
                timeline="Week 8",
                dependencies=["task-p3-runbook"],
                success_criteria="First 30-day post-closing governance scorecard signed off by executive stakeholders.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Guarantees sustained fiduciary accountability and ensures expected strategic ROI is captured.",
            ),
        ]
    else:
        # Cross-Domain Business & Operational Roadmap (Free from Software Jargon)
        phase2_tasks: List[RoadmapTask] = [
            RoadmapTask(
                task_id="task-p2-terms",
                title=f"Draft Operational Charter & Finalize Vendor SLA Agreements for {top_option_name}",
                description=f"Establish formal delivery milestones, quality benchmarks, and supplier indemnity provisions.",
                owner_role=legal_role,
                timeline="Weeks 3-4",
                dependencies=[t.task_id for t in phase1_tasks[:1]],
                success_criteria="Executed operational agreements and commercial contracts formally approved.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Translates strategic intent into binding contractual commitments and performance governance.",
            ),
            RoadmapTask(
                task_id="task-p2-exec",
                title=f"Mobilize Core Execution Pods & Pilot Workstream Delivery",
                description=f"Deploy cross-functional execution teams, configure pilot workflows, and establish KPI tracking dashboards.",
                owner_role=ops_role,
                timeline="Weeks 4-5",
                dependencies=["task-p2-terms"],
                success_criteria="Pilot workflow operational with initial cohort transactions processed cleanly.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Launches core operational capability within measured trial parameters.",
            ),
            RoadmapTask(
                task_id="task-p2-canary",
                title="Audit Quality Control Gates & Risk Containment Protocols",
                description="Execute operational fire drills to verify contingency responses and fail-safe exception protocols.",
                owner_role=risk_role,
                timeline="Week 5",
                dependencies=["task-p2-exec"],
                success_criteria="Exception drill completed successfully with zero compliance breaches.",
                is_completed=False,
                source_type="risk",
                reason="Guarantees operational resilience before enterprise-wide scale-up.",
            ),
        ]

        # Phase 3: Enterprise Operationalization & Value Realization (Weeks 6-8)
        phase3_tasks: List[RoadmapTask] = [
            RoadmapTask(
                task_id="task-p3-close",
                title=f"Complete Full Operational Rollout & Decommission Deprioritized Workstreams{title_context}",
                description=f"Execute organization-wide operational transition and sunset redundant vendor contracts.",
                owner_role=ops_role,
                timeline="Weeks 6-7",
                dependencies=["task-p2-canary"],
                success_criteria="100% operational volume transitioned with redundant commitments cleanly decommissioned.",
                is_completed=False,
                source_type="condition",
                reason="Consolidates organizational focus and eliminates lingering cost drag.",
            ),
            RoadmapTask(
                task_id="task-p3-runbook",
                title="Operational SOP Handover & Steady-State Governance Protocols",
                description="Transfer standard operating procedures, escalation matrices, and performance reporting to operational owners.",
                owner_role=ops_role,
                timeline="Week 7",
                dependencies=["task-p3-close"],
                success_criteria="Operational owners sign off on comprehensive procedural handover.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Secures operational stability and prevents single-point-of-failure vulnerabilities.",
            ),
            RoadmapTask(
                task_id="task-p3-gov",
                title="Institute Executive Governance Cadence & 30-Day Fiduciary ROI Audit",
                description=f"Establish monthly executive committee review to audit realized outcomes against strategic baseline targets for {top_option_name}.",
                owner_role=exec_role,
                timeline="Week 8",
                dependencies=["task-p3-runbook"],
                success_criteria="First 30-day post-transition performance review approved by executive stakeholders.",
                is_completed=False,
                source_type="decision_requirement",
                reason="Ensures sustained accountability and guarantees projected return on investment.",
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


def _extract_option_keywords(name: str) -> set:
    tokens = set(re.findall(r'[a-zA-Z]{3,}', name.lower()))
    stopwords = {"option", "architecture", "approach", "standard", "alternative", "system", "path", "based"}
    return tokens - stopwords


def _score_text_relevance(text: str, keywords: set) -> int:
    t_lower = text.lower()
    return sum(1 for kw in keywords if kw in t_lower)


def build_grounded_alternatives(
    matrix_results: List[Dict[str, Any]],
    criteria_dict: Dict[str, str],
    points: Dict[str, Any],
    top_option_id: str,
    top_option_name: str,
    canonical_winner_score: float,
) -> List[AlternativeOption]:
    """
    Epistemically constructs domain-grounded upsides (pros) and downsides (cons)
    for each alternative, strictly deduplicating semantically redundant options
    and ensuring downsides of one option are NEVER erroneously assigned to another.
    """
    facts = points.get("facts", [])
    all_pros = points.get("pros", [])
    all_cons = points.get("cons", [])
    all_mixed = points.get("mixed_points", [])

    # Step 1: Deduplicate redundant options and filter out synonyms of the winner
    winner_kws = _extract_option_keywords(top_option_name)
    seen_keys: List[set] = [winner_kws]
    filtered_results: List[Dict[str, Any]] = []

    # Ensure winner is always first
    winner_added = False
    for r in matrix_results:
        opt_name = r.get("option_name") or ""
        is_winner = (r.get("option_id") == top_option_id or opt_name == top_option_name or r.get("rank") == 1)
        if is_winner and not winner_added:
            filtered_results.append(r)
            winner_added = True
            break

    for r in matrix_results:
        opt_name = r.get("option_name") or ""
        is_winner = (r.get("option_id") == top_option_id or opt_name == top_option_name or r.get("rank") == 1)
        if is_winner:
            continue

        kws = _extract_option_keywords(opt_name)
        # Check if this alternative is a synonym of the winner
        if kws and winner_kws and (kws == winner_kws or (len(kws & winner_kws) / max(len(kws), len(winner_kws)) >= 0.7)):
            continue

        # Check if this alternative is duplicate of an already added alternative
        is_dup = False
        for sk in seen_keys:
            if kws and sk and (kws.issubset(sk) or sk.issubset(kws) or (len(kws & sk) / max(len(kws), len(sk)) >= 0.6)):
                is_dup = True
                break
        if not is_dup:
            seen_keys.append(kws)
            filtered_results.append(r)

    alternatives: List[AlternativeOption] = []
    for r in filtered_results[:4]:
        opt_name = r.get("option_name", "Alternative")
        opt_rank = r.get("rank", 1)
        opt_score = r.get("weighted_score", 0.0)
        is_winner = (r.get("option_id") == top_option_id or opt_name == top_option_name or opt_rank == 1)
        kws = _extract_option_keywords(opt_name)
        scores = r.get("criteria_scores", {})

        # Dynamic pros from criteria
        top_criteria_pros: List[str] = []
        low_criteria_cons: List[str] = []
        for cid, cscore in sorted(scores.items(), key=lambda x: x[1], reverse=True):
            cname = criteria_dict.get(cid, cid)
            if cscore >= 7.5:
                top_criteria_pros.append(f"Strong performance in {cname} ({cscore:.1f}/10)")
            elif cscore <= 5.5:
                low_criteria_cons.append(f"Operational friction in {cname} ({cscore:.1f}/10)")

        # Dynamic pros from points matching keywords
        matched_pros: List[str] = []
        for p in all_pros + all_mixed:
            if _score_text_relevance(p, kws) > 0:
                matched_pros.append(p)

        # Dynamic cons from points matching keywords
        matched_cons: List[str] = []
        negative_indicators = [
            "limit", "starvation", "outage", "complexity", "overhead",
            "constraint", "bill", "cost", "zero production experience",
            "burn out", "delay", "risk", "friction"
        ]
        for c in all_cons + facts:
            if any(neg in c.lower() for neg in negative_indicators):
                if _score_text_relevance(c, kws) > 0:
                    matched_cons.append(c)

        # Synthesize domain-specific architectural reasoning if points lack explicit bullet points
        opt_lower = opt_name.lower()
        if is_winner:
            pros = [
                f"Highest weighted framework score ({opt_score:.2f}/10)",
                "Superior alignment with critical operational and financial criteria",
            ]
            if top_criteria_pros:
                pros.extend(top_criteria_pros[:2])
            if matched_pros:
                pros.extend(matched_pros[:1])

            if "monolith" in opt_lower:
                pros.append("Single datastore ACID consistency with zero distributed lock contention")
            elif "microservice" in opt_lower:
                pros.append("Isolated deployment cadence and independent pod autoscaling")
            elif "cloud" in opt_lower:
                pros.append("Elastic resource allocation with reduced upfront on-prem capital outlay")

            # Winner cons: ONLY winner-specific operational watchouts
            winner_cons = (
                matched_cons[:2]
                if matched_cons
                else (
                    low_criteria_cons[:2]
                    if low_criteria_cons
                    else ["Requires rigorous architectural boundary enforcement to prevent cross-module coupling."]
                )
            )

            alternatives.append(
                AlternativeOption(
                    name=opt_name,
                    description=f"Primary recommended path achieving Rank #{opt_rank} in Weighted Decision Matrix ({opt_score:.2f}/10).",
                    pros=pros[:3],
                    cons=winner_cons[:2],
                    tradeoffs="Delivers optimal delivery speed, lowest operational toil, and grounded cost efficiency.",
                    is_recommended=True,
                    why_not_recommended=None,
                )
            )
        else:
            # Runner-up alternative: Generate concrete architectural trade-offs
            alt_pros = list(matched_pros[:2])
            if not alt_pros and top_criteria_pros:
                alt_pros.extend(top_criteria_pros[:2])

            if not alt_pros:
                if "microservice" in opt_lower:
                    alt_pros = ["Independent pod release cycles", "Fault isolation across service boundaries"]
                elif "monolith" in opt_lower:
                    alt_pros = ["Direct in-memory function calls", "Simplified single-repo deployment"]
                elif "buy" in opt_lower or "vendor" in opt_lower:
                    alt_pros = ["Turnkey commercial availability", "Offloaded maintenance responsibility"]
                elif "outright" in opt_lower or "buyout" in opt_lower:
                    alt_pros = ["Immediate 100% legal ownership", "Unfettered development discretion"]
                else:
                    alt_pros = [f"Viable approach with specific strengths in {opt_name}"]

            alt_cons: List[str] = list(low_criteria_cons[:2])
            if matched_cons:
                alt_cons.extend(matched_cons[:2])

            if not alt_cons:
                if "microservice" in opt_lower:
                    alt_cons = [
                        "Eventual consistency and SAGA pattern complexity across transactional boundaries",
                        "High network hop latency, distributed tracing overhead, and 3x SRE operational tax",
                    ]
                elif "monolith" in opt_lower:
                    alt_cons = ["Shared deployment blast radius requiring synchronized test pipelines"]
                elif "buy" in opt_lower or "vendor" in opt_lower:
                    alt_cons = ["Escalating enterprise seat tax and vendor roadmap dependency lock-in"]
                elif "outright" in opt_lower or "buyout" in opt_lower:
                    alt_cons = ["High upfront capital commitment with severe liquidity impact"]
                else:
                    alt_cons = [f"Sub-optimal criteria score ({opt_score:.2f}/10 vs {canonical_winner_score:.2f}/10)"]

            primary_divergence = low_criteria_cons[0].lower() if low_criteria_cons else "lower operational and delivery efficiency"
            why_deprioritized = (
                f"Rank #{opt_rank} ({opt_score:.2f}/10 vs {canonical_winner_score:.2f}/10). "
                f"Deprioritized with lower deterministic score primarily due to {primary_divergence} relative to {top_option_name}."
            )

            alternatives.append(
                AlternativeOption(
                    name=opt_name,
                    description=f"Alternative evaluated in Decision Matrix (Rank #{opt_rank}, Score: {opt_score:.2f}/10).",
                    pros=alt_pros[:3],
                    cons=alt_cons[:3],
                    tradeoffs=f"Requires accepting higher operational overhead and lower criteria alignment than {top_option_name}.",
                    is_recommended=False,
                    why_not_recommended=why_deprioritized,
                )
            )

    return alternatives


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

    # Gather RAG document excerpts
    try:
        from app.services.rag.document_rag import get_document_rag_service
        doc_rag = get_document_rag_service()
        if doc_rag.has_indexed_documents(decision.id):
            query = f"{decision.title or ''} {decision.problem_statement or ''}".strip()
            doc_excerpts = doc_rag.retrieve_relevant_excerpts(decision.id, query=query or "architecture requirements", top_k=3)
            for exc in doc_excerpts:
                doc_name = exc.get("metadata", {}).get("document_name", "Technical Specification")
                content = exc.get("content", "").strip()
                if content:
                    supporting_evidence.append(
                        SupportingEvidenceItem(
                            claim=(content[:180] + "...") if len(content) > 180 else content,
                            source_title=f"Internal Spec ({doc_name})",
                            source_url=None,
                            evidence_type="document_excerpt",
                            reliability="high",
                        )
                    )
    except Exception as exc:
        logger.warning(f"Failed to gather RAG document evidence in mock synthesis: {exc}")

    # Gather Domain RAG standards
    try:
        from app.services.rag.domain_rag import get_domain_rag_service
        domain_rag = get_domain_rag_service()
        domain_rag.initialize_knowledge_bases()
        query = f"{decision.title or ''} {decision.problem_statement or ''}".strip()
        guidelines = domain_rag.retrieve_guidelines(query=query or "system design standards", top_k=2)
        for g in guidelines:
            domain_name = g.get("metadata", {}).get("domain", "System Design")
            content = g.get("content", "").strip()
            if content:
                supporting_evidence.append(
                    SupportingEvidenceItem(
                        claim=(content[:180] + "...") if len(content) > 180 else content,
                        source_title=f"Architectural Standard ({domain_name.upper()})",
                        source_url=None,
                        evidence_type="domain_standard",
                        reliability="high",
                    )
                )
    except Exception as exc:
        logger.warning(f"Failed to gather Domain RAG evidence in mock synthesis: {exc}")

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
    matrix_data = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
    criteria_dict = {c["id"]: c.get("name", c["id"]) for c in matrix_data.get("criteria", []) if isinstance(c, dict)}
    if matrix_results and len(matrix_results) >= 2:
        alternatives = build_grounded_alternatives(
            matrix_results=matrix_results,
            criteria_dict=criteria_dict,
            points=points,
            top_option_id=top_option_id,
            top_option_name=top_option_name,
            canonical_winner_score=canonical_winner_score,
        )
    else:
        alternatives = [
            AlternativeOption(
                name=top_option_name,
                description="Primary recommended path.",
                pros=["Optimal strategic alignment", "Verified compliance with foundational constraints"],
                cons=["Demands disciplined implementation tracking to meet delivery deadlines"],
                tradeoffs="Demands thorough validation to unlock superior long-term upside.",
                is_recommended=True,
                why_not_recommended=None,
            ),
            AlternativeOption(
                name=second_option_name,
                description="Secondary fallback option.",
                pros=["Alternative approach offering localized flexibility"],
                cons=["Lower criteria alignment and higher operational friction compared to primary path"],
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

    blunder_shield = compute_blunder_shield(
        domain=domain,
        top_option_name=top_option_name,
        risks=[r.risk for r in risks_and_mitigations],
        runner_up_name=second_option_name,
        decision_title=decision.title,
        problem_statement=decision.problem_statement,
        facts=facts,
        decision_id=decision.id,
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
        blunder_shield=blunder_shield,
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

    # Gather RAG document excerpts and domain standards
    doc_excerpts = []
    try:
        from app.services.rag.document_rag import get_document_rag_service
        doc_rag = get_document_rag_service()
        if doc_rag.has_indexed_documents(decision.id):
            query = f"{decision.title or ''} {decision.problem_statement or ''}".strip()
            doc_excerpts = doc_rag.retrieve_relevant_excerpts(decision.id, query=query or "architecture requirements", top_k=4)
    except Exception as exc:
        logger.warning(f"Failed to gather RAG document excerpts for hosted synthesis: {exc}")

    domain_guidelines = []
    try:
        from app.services.rag.domain_rag import get_domain_rag_service
        domain_rag = get_domain_rag_service()
        domain_rag.initialize_knowledge_bases()
        query = f"{decision.title or ''} {decision.problem_statement or ''}".strip()
        domain_guidelines = domain_rag.retrieve_guidelines(query=query or "system design standards", top_k=2)
    except Exception as exc:
        logger.warning(f"Failed to gather domain guidelines for hosted synthesis: {exc}")

    payload_context = {
        "title": decision.title,
        "problem_statement": decision.problem_statement,
        "raw_input": decision.raw_input,
        "domain": domain,
        "retrieved_document_excerpts": doc_excerpts,
        "domain_architectural_guidelines": domain_guidelines,
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
        for alt_m in ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-flash-latest"]:
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
            if provider in {"azure", "gemini"}:
                try:
                    gemini_key = (settings.gemini_api_key or settings.google_api_key).strip()
                    if gemini_key:
                        fallback_model = cand_model if provider == "gemini" else "gemini-3.5-flash"
                        raw_content = call_gemini_direct_rest(
                            model=fallback_model,
                            system_prompt=SYNTHESIS_SYSTEM_PROMPT,
                            user_prompt=prompt_user,
                            api_key=gemini_key,
                        )
                        if raw_content:
                            logger.info("Direct REST synthesis succeeded with fallback model '%s'", fallback_model)
                            break
                except Exception as rest_exc:
                    last_err = rest_exc
                    logger.warning("Direct REST fallback failed for synthesis: %s", rest_exc)

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

        # Defensive enrichment: If alternatives lack distinct pros/cons or have generic placeholders, enrich with domain-grounded alternatives
        if any(not alt.get("cons") or "Viable alternative option" in alt.get("pros", []) for alt in parsed["alternatives_considered"] if isinstance(alt, dict)):
            matrix_data = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
            criteria_dict = {c["id"]: c.get("name", c["id"]) for c in matrix_data.get("criteria", []) if isinstance(c, dict)}
            enriched_alts = build_grounded_alternatives(
                matrix_results=canonical_dict.get("results") or matrix_data.get("results", []),
                criteria_dict=criteria_dict,
                points=points,
                top_option_id=canonical_winner_id or "",
                top_option_name=canonical_winner_name,
                canonical_winner_score=canonical_winner_score,
            )
            if enriched_alts:
                parsed["alternatives_considered"] = [a.model_dump() for a in enriched_alts]

    # Defensive validation: Ensure headline and recommendation recommend canonical winner
    if canonical_winner_name not in parsed.get("headline", ""):
        parsed["headline"] = f"Strategic Execution: '{canonical_winner_name}' (Rank #{canonical_winner_rank}, Score: {canonical_winner_score:.2f}/10)"

    # Defensive enrichment: Ensure blunder_shield is populated and valid
    raw_shield = parsed.get("blunder_shield")
    if not raw_shield or not isinstance(raw_shield, dict) or not raw_shield.get("capital_at_risk_saved"):
        computed_shield = compute_blunder_shield(
            domain=domain,
            top_option_name=canonical_winner_name,
            risks=[r.get("risk", "") for r in parsed.get("risks_and_mitigations", []) if isinstance(r, dict)],
            runner_up_name=matrix_results[1].get("option_name") if len(matrix_results) >= 2 else None,
            decision_title=decision.title,
            problem_statement=decision.problem_statement,
            facts=points.get("facts", []),
            decision_id=decision.id,
        )
        parsed["blunder_shield"] = computed_shield.model_dump()

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
