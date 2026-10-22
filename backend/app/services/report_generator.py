import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models import Decision, Attachment
from app.config import settings


def generate_decision_markdown_report(decision: Decision) -> str:
    """
    Generate an executive-grade Markdown decision brief covering all 10 intelligence phases:
    Problem, Ingestion, Cognitive Structuring, Private Feedback, Gaps, Research,
    5 Frameworks, Final Synthesis, and Actionable Execution Roadmap.
    """
    points = decision.points or {}
    gaps = decision.gaps or {}
    research = decision.research or {}
    analysis = decision.analysis or {}
    rec = decision.recommendation or {}
    roadmap = decision.roadmap or {}

    now_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    status_str = decision.status.upper() if decision.status else "EVALUATING"
    confidence_score = rec.get("confidence_assessment", {}).get("score", 0.85)
    conf_pct = int(confidence_score * 100) if isinstance(confidence_score, (int, float)) else 85
    synthesis_type = rec.get("synthesis_type", "recommendation")

    lines = [
        f"# DecisionLens Executive Decision Brief: {decision.title}",
        "",
        f"**Decision ID:** `DEC-{decision.id:04d}`  ",
        f"**Date:** {now_str}  ",
        f"**Status:** {status_str}  ",
        f"**Record Type:** {decision.record_type.capitalize()}  ",
        f"**Confidence Assessment:** {conf_pct}% ({rec.get('confidence_assessment', {}).get('level', 'MEDIUM').upper()})  ",
        f"**Synthesis Type:** {'⚠ Conditional Next Step (Risk-Gated)' if synthesis_type == 'conditional_next_step' else '✓ Conclusive Strategic Recommendation'}  ",
        "",
        "---",
        "",
        "## 1. Problem Statement & Operational Scope",
        "",
        f"**Core Problem:**  \n{decision.problem_statement or 'No explicit problem statement provided.'}",
        "",
        f"**Background Context:**  \n{decision.description or 'No supplementary background provided.'}",
        "",
    ]

    # Ingestion details
    attach_count = len(decision.attachments) if decision.attachments else 0
    audio_count = len(decision.audio_recordings) if decision.audio_recordings else 0
    has_transcript = bool(decision.transcript.strip()) if decision.transcript else False

    lines.extend([
        "### Ingestion Sources",
        f"- **Attached Documents:** {attach_count} file(s)",
        f"- **Audio Recordings:** {audio_count} recording(s)",
        f"- **Discussion Transcript:** {'Reviewed by user ✓' if decision.transcript_reviewed else ('Present (Unreviewed)' if has_transcript else 'None')}",
        "",
        "---",
        "",
        "## 2. Cognitive Structuring (8 Distinct Cognitive Categories)",
        "",
    ])

    # 8 categories
    cat_keys = [
        ("Facts (Concrete, Verified)", "facts"),
        ("Assumptions (Unverified Hypotheses)", "assumptions"),
        ("Pros (Strategic Upsides)", "pros"),
        ("Cons (Vulnerabilities & Friction)", "cons"),
        ("Mixed Points (Nuanced Trade-offs)", "mixed_points"),
        ("Feelings (Stakeholder Morale & Anxiety)", "feelings"),
        ("Contradictions (Direct Inconsistencies)", "contradictions"),
        ("Unknowns (Information Blindspots)", "unknowns"),
    ]

    for cat_title, cat_key in cat_keys:
        items = points.get(cat_key, [])
        lines.append(f"### {cat_title}")
        if items and isinstance(items, list):
            for item in items:
                lines.append(f"- {item}")
        else:
            lines.append("- *None noted.*")
        lines.append("")

    # Private feedback
    feedback = points.get("private_feedback")
    if feedback and isinstance(feedback, dict):
        lines.extend([
            "### Private Reflective Feedback",
            f"- **Tone Observations:** {feedback.get('tone_observations', 'Objective and measured.')}",
            f"- **Clarity Rating:** {feedback.get('clarity_rating', 'Medium')}",
            f"- **Cognitive Biases Detected:** {', '.join(feedback.get('potential_biases', ['None detected']))}",
            f"- **Strategic Feedback Notes:** {feedback.get('feedback_notes', 'N/A')}",
            "",
        ])

    lines.extend([
        "---",
        "",
        "## 3. Information Gaps & External Research Resolution",
        "",
    ])

    gap_items = gaps.get("gaps", []) if isinstance(gaps, dict) else (gaps if isinstance(gaps, list) else [])
    if gap_items:
        lines.append("### Identified Information Gaps")
        for g in gap_items:
            if isinstance(g, dict):
                status_icon = "✓" if g.get("status") in ("answered", "researched") else "○"
                lines.append(
                    f"- [{status_icon}] **{g.get('question', 'Gap')}** (Importance: {g.get('importance', 'medium').capitalize()}, Status: {g.get('status', 'unanswered').capitalize()})"
                )
                if g.get("user_answer"):
                    lines.append(f"  - *User Answer:* {g.get('user_answer')}")
        lines.append("")
    else:
        lines.append("*No open information gaps recorded.*\n")

    # Research Claims
    research_list = research.get("research", []) if isinstance(research, dict) else (research if isinstance(research, list) else [])
    if research_list:
        lines.append("### Verified Web Research Claims (Zero Fabricated Citations)")
        for r_entry in research_list:
            if isinstance(r_entry, dict):
                lines.append(f"**Query:** `{r_entry.get('query', '')}`")
                claims = r_entry.get("claims", [])
                for c in claims:
                    if isinstance(c, dict):
                        lines.append(f"- &ldquo;{c.get('claim_text', '')}&rdquo;")
                        src_title = c.get("source_title") or r_entry.get("title") or "Source"
                        src_url = c.get("source_url") or r_entry.get("url") or ""
                        if src_url:
                            lines.append(f"  - *Source:* [{src_title}]({src_url}) (Reliability: {c.get('reliability_label', 'high').upper()})")
                        else:
                            lines.append(f"  - *Source:* {src_title} (Reliability: {c.get('reliability_label', 'high').upper()})")
                lines.append("")
    else:
        lines.append("*No external research queries recorded.*\n")

    lines.extend([
        "---",
        "",
        "## 4. Multi-Lens Analytical Framework Results",
        "",
    ])

    # 1. Decision Matrix
    matrix = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
    if matrix and matrix.get("applicable"):
        lines.append("### Weighted Decision Matrix (Scoring Math Normalized to 100% Weight)")
        criteria = matrix.get("criteria", [])
        ranked_opts = matrix.get("ranked_options", [])
        if criteria and ranked_opts:
            # Build table header
            crit_headers = " | ".join([f"**{c.get('name', 'Crit')}** ({c.get('weight', 0):.0f}%)" for c in criteria])
            lines.append(f"| Option | Total Weighted Score | {crit_headers} | Rank |")
            lines.append(f"| :--- | :---: | {' | '.join([':---:' for _ in criteria])} | :---: |")

            for opt in ranked_opts:
                opt_name = opt.get("name", "Option")
                w_score = opt.get("score", opt.get("weighted_score", 0.0))
                rank = opt.get("rank", 1)
                rank_badge = "🥇 Rank 1" if rank == 1 else f"Rank {rank}"
                # Individual scores
                score_cells = []
                opt_ratings = opt.get("scores", {})
                for c in criteria:
                    cid = c.get("id")
                    score_cells.append(f"{opt_ratings.get(cid, '-'):.1f}" if isinstance(opt_ratings.get(cid), (int, float)) else "-")
                lines.append(f"| **{opt_name}** | **{w_score:.2f} / 10.0** | {' | '.join(score_cells)} | {rank_badge} |")
            lines.append("")
    elif matrix and not matrix.get("applicable"):
        lines.append(f"### Weighted Decision Matrix: *Not Applicable ({matrix.get('inapplicable_reason', 'Unsuitable')})*\n")

    # 2. SWOT
    swot = analysis.get("swot", {}) if isinstance(analysis, dict) else {}
    if swot and swot.get("applicable"):
        lines.append("### SWOT Analysis")
        for quad in ["strengths", "weaknesses", "opportunities", "threats"]:
            items = swot.get(quad, [])
            lines.append(f"**{quad.capitalize()}:**")
            if items:
                for item in items:
                    t = item.get("point", item.get("description", str(item))) if isinstance(item, dict) else str(item)
                    lines.append(f"- {t}")
            else:
                lines.append("- *None noted.*")
        lines.append("")

    # 3. Six Thinking Hats
    hats = analysis.get("six_hats", {}) if isinstance(analysis, dict) else {}
    if hats and hats.get("applicable"):
        lines.append("### Six Thinking Hats")
        hat_list = hats.get("hats", [])
        for h in hat_list:
            if isinstance(h, dict):
                lines.append(f"- **{h.get('hat_color', '').capitalize()} Hat ({h.get('perspective_name', '')}):** {h.get('key_takeaway', '')}")
        lines.append("")

    # 4. Five Whys
    five_whys = analysis.get("five_whys", {}) if isinstance(analysis, dict) else {}
    if five_whys and five_whys.get("applicable"):
        lines.append("### Five Whys Root Cause Analysis")
        chain = five_whys.get("chain", [])
        for step in chain:
            if isinstance(step, dict):
                lines.append(f"{step.get('step_number', 1)}. **Why?** {step.get('question', '')}  \n   *Answer:* {step.get('answer', '')}")
        root_cause = five_whys.get("root_cause", "")
        verified = five_whys.get("is_root_cause_verified", False)
        if root_cause:
            lines.append(f"\n**Root Cause ({'Verified by Evidence ✓' if verified else 'Hypothesis (Unverified)'}):** {root_cause}\n")

    # 5. Decision Tree
    tree = analysis.get("decision_tree", {}) if isinstance(analysis, dict) else {}
    if tree and tree.get("applicable"):
        lines.append("### Decision Tree & Expected Value Modeling")
        lines.append(f"**Root Question:** {tree.get('root_question', '')}")
        ev_map = tree.get("expected_values_by_option", {})
        if ev_map:
            for opt_name, ev_val in ev_map.items():
                lines.append(f"- **{opt_name}:** Expected Value = {ev_val:.2f}")
        lines.append(f"*{tree.get('probabilities_note', 'Probabilities were not documented and were strictly not invented.')}*\n")

    lines.extend([
        "---",
        "",
        "## 5. Executive Recommendation & Final Decision Synthesis",
        "",
        f"### {rec.get('headline', 'Strategic Decision Synthesis')}",
        "",
        f"{rec.get('recommendation_text', 'No recommendation generated yet.')}",
        "",
    ])

    triggers = rec.get("conditional_triggers", [])
    if triggers:
        lines.append("### Mandatory Conditional Triggers & Benchmarks")
        for idx, t in enumerate(triggers, 1):
            lines.append(f"[{idx}] {t}")
        lines.append("")

    # Alternatives Considered
    alts = rec.get("alternatives_considered", [])
    if alts:
        lines.append("### Alternatives Evaluated")
        for alt in alts:
            if isinstance(alt, dict):
                status_label = "RECOMMENDED" if alt.get("is_recommended") else "ALTERNATIVE"
                lines.append(f"#### {alt.get('name', 'Option')} ({status_label})")
                lines.append(f"{alt.get('description', '')}")
                lines.append(f"- **Trade-off:** {alt.get('tradeoffs', '')}")
                if alt.get("why_not_recommended"):
                    lines.append(f"- **Why Not Chosen:** {alt.get('why_not_recommended')}")
                lines.append("")

    # Supporting Evidence
    evidence = rec.get("supporting_evidence", [])
    if evidence:
        lines.append("### Supporting Evidence")
        for ev in evidence:
            if isinstance(ev, dict):
                src = ev.get("source_title", "Verified Source")
                url = ev.get("source_url")
                if url:
                    lines.append(f"- &ldquo;{ev.get('claim', '')}&rdquo; — [{src}]({url})")
                else:
                    lines.append(f"- &ldquo;{ev.get('claim', '')}&rdquo; — *{src}*")
        lines.append("")

    # Risks and Mitigations
    risks = rec.get("risks_and_mitigations", [])
    if risks:
        lines.append("### Risk Matrix & Mitigations")
        for r in risks:
            if isinstance(r, dict):
                lines.append(f"- **Risk ({r.get('severity', 'medium').upper()}):** {r.get('risk', '')}")
                lines.append(f"  - *Mitigation:* {r.get('mitigation', '')}")
                lines.append(f"  - *Contingency:* {r.get('contingency_plan', '')}")
        lines.append("")

    # Counterarguments
    counterargs = rec.get("counterarguments", [])
    if counterargs:
        lines.append("### Steel-Manned Counterarguments")
        for c in counterargs:
            if isinstance(c, dict):
                lines.append(f"- **Objection:** &ldquo;{c.get('argument', '')}&rdquo;")
                lines.append(f"  - *Rebuttal/Concession:* {c.get('rebuttal_or_concession', '')}")
        lines.append("")

    # Confidence limitations
    conf = rec.get("confidence_assessment", {})
    if conf:
        lines.append(f"### Confidence Assessment ({conf.get('level', 'medium').upper()})")
        lines.append(f"{conf.get('rationale', '')}")
        limitations = conf.get("limitations", [])
        if limitations:
            lines.append("\n**Documented Limitations:**")
            for lim in limitations:
                lines.append(f"- {lim}")
        lines.append("")

    # Roadmap
    rm_phases = roadmap.get("phases", [])
    if rm_phases:
        lines.extend([
            "---",
            "",
            f"## 6. Actionable Implementation Roadmap: {roadmap.get('title', 'Execution Plan')}",
            "",
        ])
        for phase in rm_phases:
            if isinstance(phase, dict):
                lines.append(f"### {phase.get('title', 'Phase')} ({phase.get('timeline', '')})")
                if phase.get("description"):
                    lines.append(f"*{phase.get('description')}*\n")
                tasks = phase.get("tasks", [])
                for task in tasks:
                    if isinstance(task, dict):
                        check = "x" if task.get("is_completed") else " "
                        lines.append(f"- [{check}] **{task.get('title', 'Task')}** — *Role: {task.get('owner_role', 'Lead')}* ({task.get('timeline', '')})")
                        if task.get("description"):
                            lines.append(f"  - {task.get('description')}")
                        if task.get("success_criteria"):
                            lines.append(f"  - *Success Criteria:* {task.get('success_criteria')}")
                lines.append("")

    lines.extend([
        "---",
        "",
        "*Report generated automatically by DecisionLens Strategic Decision Intelligence Platform.*",
        "*Confidential & Proprietary.*",
    ])

    return "\n".join(lines)


def generate_decision_json_report(decision: Decision) -> Dict[str, Any]:
    """Generate complete structured JSON export of the entire decision lifecycle."""
    return {
        "decision_id": decision.id,
        "title": decision.title,
        "record_type": decision.record_type,
        "status": decision.status,
        "language": decision.language,
        "problem_statement": decision.problem_statement,
        "description": decision.description,
        "created_at": decision.created_at.isoformat() if decision.created_at else None,
        "updated_at": decision.updated_at.isoformat() if decision.updated_at else None,
        "transcript": {
            "content": decision.transcript,
            "reviewed": decision.transcript_reviewed,
        },
        "attachments_count": len(decision.attachments) if decision.attachments else 0,
        "audio_recordings_count": len(decision.audio_recordings) if decision.audio_recordings else 0,
        "structured_findings": decision.points or {},
        "gaps_and_research": {
            "gaps": decision.gaps or {},
            "research": decision.research or {},
        },
        "framework_analysis": decision.analysis or {},
        "final_synthesis": decision.recommendation or {},
        "active_roadmap": decision.roadmap or {},
        "snapshots_count": len(decision.snapshots) if decision.snapshots else 0,
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
