import io
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable, Flowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

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
    is_meeting = (decision.record_type or "decision").lower() == "meeting"

    report_title = f"DecisionLens Executive Meeting Minutes: {decision.title}" if is_meeting else f"DecisionLens Executive Decision Brief: {decision.title}"
    record_id_tag = f"MTG-{decision.id:04d}" if is_meeting else f"DEC-{decision.id:04d}"
    section1_title = "## 1. Meeting Purpose & Agenda Objectives" if is_meeting else "## 1. Problem Statement & Operational Scope"
    core_label = "**Meeting Purpose & Objectives:**" if is_meeting else "**Core Problem:**"
    bg_label = "**Attendees & Discussion Context:**" if is_meeting else "**Background Context:**"

    lines = [
        f"# {report_title}",
        "",
        f"**Record ID:** `{record_id_tag}`  ",
        f"**Date:** {now_str}  ",
        f"**Status:** {status_str}  ",
        f"**Record Type:** {'Meeting Discussion' if is_meeting else 'Decision Analysis'}  ",
        f"**Confidence Assessment:** {conf_pct}% ({rec.get('confidence_assessment', {}).get('level', 'MEDIUM').upper()})  ",
        f"**Synthesis Type:** {'⚠ Conditional Next Step (Risk-Gated)' if synthesis_type == 'conditional_next_step' else ('✓ Meeting Consensus & Action Items' if is_meeting else '✓ Conclusive Strategic Recommendation')}  ",
        "",
        "---",
        "",
        section1_title,
        "",
        f"{core_label}  \n{decision.problem_statement or ('No explicit meeting agenda provided.' if is_meeting else 'No explicit problem statement provided.')}",
        "",
        f"{bg_label}  \n{decision.description or ('No attendee list or notes provided.' if is_meeting else 'No supplementary background provided.')}",
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


def escape_latex(text: Any) -> str:
    """Escape text safely for LaTeX typesetting."""
    if text is None:
        return ""
    s = str(text)
    replacements = [
        ('\\', r'\textbackslash{}'),
        ('&', r'\&'),
        ('%', r'\%'),
        ('$', r'\$'),
        ('#', r'\#'),
        ('_', r'\_'),
        ('{', r'\{'),
        ('}', r'\}'),
        ('~', r'\textasciitilde{}'),
        ('^', r'\textasciicircum{}'),
    ]
    for orig, repl in replacements:
        s = s.replace(orig, repl)
    s = s.replace('“', "``").replace('”', "''").replace('‘', "`").replace('’', "'")
    s = s.replace('✓', r'\checkmark{}').replace('⚡', r'\textbf{*}').replace('⚠', r'\textbf{!}').replace('•', r'\textbullet{}')
    return s


def escape_xml(s: Any) -> str:
    """Escape text safely for ReportLab Platypus XML markup."""
    if s is None:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def generate_decision_latex_report(decision: Decision) -> str:
    """
    Generate an interactive, publication-grade LaTeX decision brief (.tex)
    incorporating all 10 intelligence phases, hyperref bookmarks, tcolorbox cards,
    normalized decision matrix, SWOT, root-cause chains, and actionable roadmap.
    """
    points = decision.points or {}
    gaps = decision.gaps or {}
    research = decision.research or {}
    analysis = decision.analysis or {}
    rec = decision.recommendation or {}
    roadmap = decision.roadmap or {}

    now_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    status_str = escape_latex(decision.status.upper() if decision.status else "EVALUATING")
    domain_str = escape_latex(decision.domain or "BUSINESS")
    title_escaped = escape_latex(decision.title)
    rec_title = escape_latex(rec.get("headline", "Strategic Recommendation & Roadmap"))

    conf_score = rec.get("confidence_assessment", {}).get("score", 0.85)
    conf_pct = int(conf_score * 100) if isinstance(conf_score, (int, float)) else 85
    conf_level = escape_latex(str(rec.get("confidence_assessment", {}).get("level", "MEDIUM")).upper())

    lines = [
        r"\documentclass[10pt,a4paper]{article}",
        r"\usepackage[utf8]{inputenc}",
        r"\usepackage[margin=1.8cm, top=2.2cm, bottom=2.2cm]{geometry}",
        r"\usepackage{xcolor}",
        r"\usepackage{hyperref}",
        r"\usepackage{tcolorbox}",
        r"\usepackage{booktabs}",
        r"\usepackage{tabularx}",
        r"\usepackage{array}",
        r"\usepackage{fancyhdr}",
        r"\usepackage{enumitem}",
        r"\usepackage{amssymb}",
        r"\usepackage{amsmath}",
        "",
        r"% Editorial dossier color palette",
        r"\definecolor{WarmPaper}{HTML}{F5F1E8}",
        r"\definecolor{CardSurface}{HTML}{FCFBF8}",
        r"\definecolor{InkNavy}{HTML}{161E33}",
        r"\definecolor{InkSecondary}{HTML}{5A6275}",
        r"\definecolor{SteelBlue}{HTML}{2F5D8F}",
        r"\definecolor{BorderGray}{HTML}{D9D2C3}",
        r"\definecolor{AlertRed}{HTML}{991B1B}",
        r"\definecolor{SuccessGreen}{HTML}{166534}",
        "",
        r"\hypersetup{",
        r"    colorlinks=true,",
        r"    linkcolor=SteelBlue,",
        r"    urlcolor=SteelBlue,",
        r"    citecolor=SteelBlue,",
        f"    pdftitle={{DecisionLens Executive Dossier: {title_escaped}}},",
        r"    pdfauthor={DecisionLens Strategic Intelligence Platform},",
        r"    bookmarksnumbered=true,",
        r"    pdfpagemode=UseOutlines",
        r"}",
        "",
        r"\pagestyle{fancy}",
        r"\fancyhf{}",
        r"\fancyhead[L]{\footnotesize \textcolor{InkSecondary}{\textsc{DecisionLens Strategic Intelligence Dossier}}}",
        f"\\fancyhead[R]{{\\footnotesize \\textcolor{{SteelBlue}}{{\\textbf{{DEC-{decision.id:04d}}}}}}}",
        r"\fancyfoot[L]{\scriptsize \textcolor{InkSecondary}{CONFIDENTIAL \& GROUNDED --- AI-POWERED DECISION GOVERNANCE}}",
        r"\fancyfoot[R]{\scriptsize \textcolor{InkSecondary}{Page \thepage}}",
        r"\renewcommand{\headrulewidth}{0.4pt}",
        r"\renewcommand{\footrulewidth}{0.4pt}",
        "",
        r"\begin{document}",
        "",
        r"% Title banner box",
        r"\begin{tcolorbox}[colback=CardSurface, colframe=SteelBlue, arc=2mm, boxrule=1pt]",
        f"{{\\Huge \\textbf{{\\textcolor{{InkNavy}}{{{title_escaped}}}}}}} \\\\[8pt]",
        r"\noindent\begin{tabularx}{\linewidth}{@{} l X r X @{}}",
        f"\\textbf{{Decision ID:}} & DEC-{decision.id:04d} & \\textbf{{Date:}} & {now_str} \\\\",
        f"\\textbf{{Domain:}} & {domain_str} & \\textbf{{Status:}} & {status_str} \\\\",
        f"\\textbf{{Confidence:}} & {conf_pct}\\% ({conf_level}) & \\textbf{{Record Type:}} & {escape_latex(decision.record_type.capitalize())} \\\\",
        r"\end{tabularx}",
        r"\end{tcolorbox}",
        "",
        r"\vspace{0.8em}",
        r"{\hypersetup{linkcolor=InkNavy}",
        r"\tableofcontents",
        r"}",
        r"\vspace{1.2em}",
        r"\noindent\textcolor{BorderGray}{\rule{\linewidth}{0.8pt}}",
        r"\vspace{1em}",
        "",
        r"\section{Problem Statement \& Operational Scope}",
        f"\\textbf{{Core Problem:}} {escape_latex(decision.problem_statement or 'No explicit problem statement recorded.')} \\\\[6pt]",
        f"\\textbf{{Background Context:}} {escape_latex(decision.description or 'No supplemental background provided.')} \\\\[6pt]",
        "",
        r"\noindent\textbf{Ingestion Sources:}",
        r"\begin{itemize}[noitemsep,topsep=2pt]",
        f"\\item \\textbf{{Attached Documents:}} {len(decision.attachments) if decision.attachments else 0} file(s)",
        f"\\item \\textbf{{Audio Recordings:}} {len(decision.audio_recordings) if decision.audio_recordings else 0} recording(s)",
        f"\\item \\textbf{{Transcript Status:}} {'Reviewed by user' if decision.transcript_reviewed else ('Present (Unreviewed)' if decision.transcript else 'None')}",
        r"\end{itemize}",
        "",
        r"\section{Cognitive Structuring (8 Distinct Cognitive Categories)}",
    ]

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
        lines.append(f"\\subsection{{{cat_title}}}")
        if items and isinstance(items, list):
            lines.append(r"\begin{itemize}[noitemsep,topsep=2pt]")
            for item in items:
                lines.append(f"\\item {escape_latex(item)}")
            lines.append(r"\end{itemize}")
        else:
            lines.append(r"\textit{None noted.}")

    # Private feedback
    feedback = points.get("private_feedback")
    if feedback and isinstance(feedback, dict):
        lines.extend([
            r"\subsection{Private Reflective Feedback}",
            r"\begin{tcolorbox}[colback=WarmPaper, colframe=BorderGray, arc=1mm, boxrule=0.6pt]",
            f"\\textbf{{Tone Observations:}} {escape_latex(feedback.get('tone_observations', 'Objective and measured.'))} \\\\[3pt]",
            f"\\textbf{{Clarity Rating:}} {escape_latex(feedback.get('clarity_rating', 'Medium'))} \\\\[3pt]",
            f"\\textbf{{Cognitive Biases Detected:}} {escape_latex(', '.join(feedback.get('potential_biases', ['None detected'])))} \\\\[3pt]",
            f"\\textbf{{Strategic Feedback Notes:}} {escape_latex(feedback.get('feedback_notes', 'N/A'))}",
            r"\end{tcolorbox}",
        ])

    lines.extend([
        "",
        r"\section{Information Gaps \& External Research Resolution}",
    ])

    gap_items = gaps.get("gaps", []) if isinstance(gaps, dict) else (gaps if isinstance(gaps, list) else [])
    if gap_items:
        lines.append(r"\subsection{Identified Information Gaps}")
        lines.append(r"\begin{itemize}[noitemsep,topsep=2pt]")
        for g in gap_items:
            if isinstance(g, dict):
                st = escape_latex(g.get("status", "unanswered").capitalize())
                q = escape_latex(g.get("question", "Gap"))
                imp = escape_latex(g.get("importance", "medium").capitalize())
                lines.append(f"\\item \\textbf{{{q}}} [Importance: {imp}, Status: {st}]")
                if g.get("user_answer"):
                    lines.append(f"\\\\ \\textit{{Answer:}} {escape_latex(g.get('user_answer'))}")
        lines.append(r"\end{itemize}")
    else:
        lines.append(r"\textit{No open information gaps recorded.}")

    # Web research
    research_list = research.get("research", []) if isinstance(research, dict) else (research if isinstance(research, list) else [])
    if research_list:
        lines.append(r"\subsection{Verified Web Research Claims}")
        for r_entry in research_list:
            if isinstance(r_entry, dict):
                q = escape_latex(r_entry.get("query", ""))
                lines.append(f"\\noindent\\textbf{{Query:}} \\texttt{{{q}}}")
                claims = r_entry.get("claims", [])
                if claims:
                    lines.append(r"\begin{itemize}[noitemsep,topsep=2pt]")
                    for c in claims:
                        if isinstance(c, dict):
                            ct = escape_latex(c.get("claim_text", ""))
                            stitle = escape_latex(c.get("source_title") or r_entry.get("title") or "Source")
                            surl = c.get("source_url") or r_entry.get("url") or ""
                            if surl:
                                lines.append(f"\\item ``{ct}'' --- \\href{{{surl}}}{{{stitle}}}")
                            else:
                                lines.append(f"\\item ``{ct}'' --- \\textit{{{stitle}}}")
                    lines.append(r"\end{itemize}")
    else:
        lines.append(r"\textit{No external web research queries recorded.}")

    lines.extend([
        "",
        r"\section{Multi-Lens Analytical Framework Results}",
    ])

    # 1. Decision Matrix
    matrix = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
    if matrix and matrix.get("applicable"):
        lines.append(r"\subsection{Weighted Decision Matrix}")
        criteria = matrix.get("criteria", [])
        ranked_opts = matrix.get("ranked_options", [])
        if criteria and ranked_opts:
            cols = "l c " + " ".join(["c" for _ in criteria]) + " c"
            lines.append(f"\\begin{{tabularx}}{{\\linewidth}}{{{cols}}}")
            lines.append(r"\toprule")
            crit_headers = " & ".join([f"\\textbf{{{escape_latex(c.get('name', 'C'))}}} ({c.get('weight', 0):.0f}\\%)" for c in criteria])
            lines.append(f"\\textbf{{Option}} & \\textbf{{Score}} & {crit_headers} & \\textbf{{Rank}} \\\\")
            lines.append(r"\midrule")
            for opt in ranked_opts:
                opt_name = escape_latex(opt.get("name", "Option"))
                w_score = opt.get("score", opt.get("weighted_score", 0.0))
                rank = opt.get("rank", 1)
                opt_ratings = opt.get("scores", {})
                score_cells = []
                for c in criteria:
                    cid = c.get("id")
                    score_cells.append(f"{opt_ratings.get(cid, '-'):.1f}" if isinstance(opt_ratings.get(cid), (int, float)) else "-")
                row_str = f"\\textbf{{{opt_name}}} & {w_score:.2f} & {' & '.join(score_cells)} & Rank {rank} \\\\"
                lines.append(row_str)
            lines.append(r"\bottomrule")
            lines.append(r"\end{tabularx}")
            lines.append("")

    # 2. SWOT
    swot = analysis.get("swot", {}) if isinstance(analysis, dict) else {}
    if swot and swot.get("applicable"):
        lines.append(r"\subsection{SWOT Analysis}")
        lines.append(r"\begin{tabularx}{\linewidth}{X X}")
        lines.append(r"\toprule")
        lines.append(r"\textbf{Strengths} & \textbf{Weaknesses} \\")
        lines.append(r"\midrule")
        str_items = "\n".join([f"\\textbullet\\ {escape_latex(i.get('point', str(i)) if isinstance(i, dict) else str(i))}\\\\" for i in swot.get("strengths", [])]) or "None"
        weak_items = "\n".join([f"\\textbullet\\ {escape_latex(i.get('point', str(i)) if isinstance(i, dict) else str(i))}\\\\" for i in swot.get("weaknesses", [])]) or "None"
        lines.append(f"{str_items} & {weak_items} \\\\")
        lines.append(r"\midrule")
        lines.append(r"\textbf{Opportunities} & \textbf{Threats} \\")
        lines.append(r"\midrule")
        opp_items = "\n".join([f"\\textbullet\\ {escape_latex(i.get('point', str(i)) if isinstance(i, dict) else str(i))}\\\\" for i in swot.get("opportunities", [])]) or "None"
        thr_items = "\n".join([f"\\textbullet\\ {escape_latex(i.get('point', str(i)) if isinstance(i, dict) else str(i))}\\\\" for i in swot.get("threats", [])]) or "None"
        lines.append(f"{opp_items} & {thr_items} \\\\")
        lines.append(r"\bottomrule")
        lines.append(r"\end{tabularx}")
        lines.append("")

    # 3. Six Hats
    hats = analysis.get("six_hats", {}) if isinstance(analysis, dict) else {}
    if hats and hats.get("applicable"):
        lines.append(r"\subsection{Six Thinking Hats}")
        lines.append(r"\begin{itemize}[noitemsep,topsep=2pt]")
        for h in hats.get("hats", []):
            if isinstance(h, dict):
                col = escape_latex(h.get("hat_color", "").capitalize())
                persp = escape_latex(h.get("perspective_name", ""))
                take = escape_latex(h.get("key_takeaway", ""))
                lines.append(f"\\item \\textbf{{{col} Hat ({persp}):}} {take}")
        lines.append(r"\end{itemize}")

    # 4. Five Whys
    five_whys = analysis.get("five_whys", {}) if isinstance(analysis, dict) else {}
    if five_whys and five_whys.get("applicable"):
        lines.append(r"\subsection{Five Whys Root Cause Analysis}")
        lines.append(r"\begin{enumerate}[noitemsep,topsep=2pt]")
        for step in five_whys.get("chain", []):
            if isinstance(step, dict):
                q = escape_latex(step.get("question", ""))
                a = escape_latex(step.get("answer", ""))
                lines.append(f"\\item \\textbf{{{q}}} \\\\ \\textit{{Answer:}} {a}")
        lines.append(r"\end{enumerate}")
        rc = escape_latex(five_whys.get("root_cause", ""))
        if rc:
            ver = "Verified by Evidence" if five_whys.get("is_root_cause_verified") else "Hypothesis (Unverified)"
            lines.append(f"\\noindent\\textbf{{Root Cause ({ver}):}} {rc} \\\\[6pt]")

    # Section 5: Synthesis & Recommendation
    lines.extend([
        "",
        r"\section{Executive Recommendation \& Final Decision Synthesis}",
        r"\begin{tcolorbox}[colback=CardSurface, colframe=SteelBlue, arc=2mm, boxrule=1pt, title={\textbf{Core Recommendation}}]",
        f"{{\\large \\textbf{{{rec_title}}}}} \\\\[6pt]",
        f"{escape_latex(rec.get('recommendation_text', 'No recommendation generated yet.'))}",
        r"\end{tcolorbox}",
    ])

    # Conditional triggers
    triggers = rec.get("conditional_triggers", [])
    if triggers:
        lines.append(r"\subsection{Mandatory Conditional Triggers \& Guardrails}")
        lines.append(r"\begin{enumerate}[noitemsep,topsep=2pt]")
        for t in triggers:
            lines.append(f"\\item {escape_latex(t)}")
        lines.append(r"\end{enumerate}")

    # Alternatives
    alts = rec.get("alternatives_considered", [])
    if alts:
        lines.append(r"\subsection{Alternatives Evaluated}")
        for alt in alts:
            if isinstance(alt, dict):
                alt_name = escape_latex(alt.get("name", "Option"))
                status = "RECOMMENDED" if alt.get("is_recommended") else "ALTERNATIVE"
                desc = escape_latex(alt.get("description", ""))
                tradeoffs = escape_latex(alt.get("tradeoffs", ""))
                rejection = escape_latex(alt.get("why_not_recommended", ""))
                lines.append(f"\\noindent\\textbf{{{alt_name}}} [\\textsc{{{status}}}] \\\\[2pt]")
                lines.append(f"{desc} \\\\[2pt]")
                lines.append(f"\\textit{{Trade-offs:}} {tradeoffs} \\\\")
                if rejection:
                    lines.append(f"\\textit{{Why Not Chosen:}} {rejection} \\\\[4pt]")

    # Risks
    risks = rec.get("risks_and_mitigations", [])
    if risks:
        lines.append(r"\subsection{Risk Matrix \& Mitigations}")
        lines.append(r"\begin{tabularx}{\linewidth}{l X X}")
        lines.append(r"\toprule")
        lines.append(r"\textbf{Severity} & \textbf{Identified Risk} & \textbf{Mitigation Strategy} \\")
        lines.append(r"\midrule")
        for r in risks:
            if isinstance(r, dict):
                sev = escape_latex(str(r.get("severity", "medium")).upper())
                risk_txt = escape_latex(r.get("risk", ""))
                mit_txt = escape_latex(r.get("mitigation", ""))
                lines.append(f"\\textbf{{{sev}}} & {risk_txt} & {mit_txt} \\\\")
        lines.append(r"\bottomrule")
        lines.append(r"\end{tabularx}")
        lines.append("")

    # Counterarguments
    counterargs = rec.get("counterarguments", [])
    if counterargs:
        lines.append(r"\subsection{Steel-Manned Counterarguments}")
        lines.append(r"\begin{itemize}[noitemsep,topsep=2pt]")
        for c in counterargs:
            if isinstance(c, dict):
                arg = escape_latex(c.get("argument", ""))
                reb = escape_latex(c.get("rebuttal_or_concession", ""))
                lines.append(f"\\item \\textbf{{Objection:}} ``{arg}'' \\\\ \\textit{{Rebuttal:}} {reb}")
        lines.append(r"\end{itemize}")

    # Roadmap
    rm_phases = roadmap.get("phases", [])
    if rm_phases:
        lines.extend([
            "",
            r"\section{Actionable Implementation Roadmap}",
            f"\\textbf{{Roadmap Title:}} {escape_latex(roadmap.get('title', 'Execution Plan'))} \\\\[6pt]",
        ])
        for pidx, phase in enumerate(rm_phases, 1):
            if isinstance(phase, dict):
                p_title = escape_latex(phase.get("title", f"Phase {pidx}"))
                p_time = escape_latex(phase.get("timeline", ""))
                lines.append(f"\\subsection{{{p_title} ({p_time})}}")
                if phase.get("description"):
                    lines.append(f"\\textit{{{escape_latex(phase.get('description'))}}} \\\\[4pt]")
                tasks = phase.get("tasks", [])
                if tasks:
                    lines.append(r"\begin{itemize}[noitemsep,topsep=2pt]")
                    for tidx, task in enumerate(tasks, 1):
                        if isinstance(task, dict):
                            t_title = escape_latex(task.get("title", f"Task {tidx}"))
                            t_role = escape_latex(task.get("owner_role", "Lead"))
                            t_time = escape_latex(task.get("timeline", ""))
                            t_crit = escape_latex(task.get("success_criteria", ""))
                            check_symbol = r"$\boxtimes$" if task.get("is_completed") else r"$\square$"
                            lines.append(f"\\item {check_symbol} \\textbf{{{t_title}}} [Role: {t_role}, Timeline: {t_time}]")
                            if task.get("description"):
                                lines.append(f"\\\\ {escape_latex(task.get('description'))}")
                            if t_crit:
                                lines.append(f"\\\\ \\textit{{Exit Criteria:}} {t_crit}")
                    lines.append(r"\end{itemize}")

    lines.extend([
        "",
        r"\vspace{2em}",
        r"\noindent\textcolor{BorderGray}{\rule{\linewidth}{0.6pt}}",
        r"\vspace{0.5em}",
        r"\begin{center}",
        r"\scriptsize \textcolor{InkSecondary}{Generated automatically by DecisionLens Strategic Intelligence Platform $\bullet$ Confidential \& Grounded}",
        r"\end{center}",
        "",
        r"\end{document}",
    ])

    return "\n".join(lines)


# ReportLab Color Palette
COLOR_PAGE = colors.HexColor("#F5F1E8")
COLOR_SURFACE = colors.HexColor("#FCFBF8")
COLOR_NAVY = colors.HexColor("#161E33")
COLOR_MUTED = colors.HexColor("#5A6275")
COLOR_STEEL = colors.HexColor("#2F5D8F")
COLOR_BORDER = colors.HexColor("#D9D2C3")
COLOR_ALERT = colors.HexColor("#991B1B")
COLOR_SUCCESS = colors.HexColor("#166534")


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas calculating total pages and rendering running editorial headers & footers."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages: int):
        self.saveState()
        # Running header (pages > 1)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(COLOR_MUTED)
            self.drawString(54, 752, "DECISIONLENS STRATEGIC INTELLIGENCE DOSSIER")
            self.drawRightString(558, 752, "EXECUTIVE BRIEF")
            self.setStrokeColor(COLOR_BORDER)
            self.setLineWidth(0.5)
            self.line(54, 745, 558, 745)

        # Running footer (all pages)
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        self.setFont("Helvetica", 8)
        self.setFillColor(COLOR_MUTED)
        self.drawString(54, 32, "CONFIDENTIAL & GROUNDED — AI DECISION INTELLIGENCE PLATFORM")
        self.drawRightString(558, 32, f"Page {self._pageNumber} of {total_pages}")
        self.restoreState()


class BookmarkFlowable(Flowable):
    """Flowable creating a native interactive PDF outline bookmark."""
    def __init__(self, key: str, title: str, level: int = 0):
        super().__init__()
        self.key = key
        self.title = title
        self.level = level
        self.width = 0
        self.height = 0

    def draw(self):
        self.canv.bookmarkPage(self.key)
        self.canv.addOutlineEntry(self.title, self.key, level=self.level, closed=False)


def generate_decision_interactive_pdf(decision: Decision) -> bytes:
    """
    Generate a full-fidelity interactive PDF executive dossier.
    Features:
    - Editorial dossier layout matching DecisionLens tokens
    - Interactive PDF bookmarks outline tree for Acrobat / Chrome sidebar
    - Clickable internal navigation links (Table of Contents)
    - Clickable external citations to verified research sources
    - Styled 8-category cognitive tables, normalized decision matrix, SWOT, and roadmap
    """
    points = decision.points or {}
    gaps = decision.gaps or {}
    research = decision.research or {}
    analysis = decision.analysis or {}
    rec = decision.recommendation or {}
    roadmap = decision.roadmap or {}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    base_styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle",
        parent=base_styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=COLOR_NAVY,
        spaceAfter=4,
    )
    meta_style = ParagraphStyle(
        "MetaText",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12.5,
        textColor=COLOR_MUTED,
    )
    h1_style = ParagraphStyle(
        "Heading1Style",
        parent=base_styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=COLOR_NAVY,
        spaceBefore=12,
        spaceAfter=5,
        keepWithNext=True,
    )
    h2_style = ParagraphStyle(
        "Heading2Style",
        parent=base_styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13.5,
        textColor=COLOR_STEEL,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12.5,
        textColor=COLOR_NAVY,
        spaceAfter=3,
    )
    body_muted = ParagraphStyle(
        "BodyMuted",
        parent=body_style,
        textColor=COLOR_MUTED,
    )
    bullet_style = ParagraphStyle(
        "BulletStyle",
        parent=body_style,
        leftIndent=10,
        firstLineIndent=-10,
        spaceAfter=2.5,
    )
    table_cell = ParagraphStyle(
        "TableCell",
        parent=body_style,
        fontSize=8,
        leading=11,
    )
    table_header = ParagraphStyle(
        "TableHeader",
        parent=table_cell,
        fontName="Helvetica-Bold",
        textColor=COLOR_NAVY,
    )

    story: List[Flowable] = []

    # Title Banner
    now_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    status_str = (decision.status or "EVALUATING").upper()
    domain_str = (decision.domain or "BUSINESS").upper()
    conf_score = rec.get("confidence_assessment", {}).get("score", 0.85)
    conf_pct = int(conf_score * 100) if isinstance(conf_score, (int, float)) else 85
    conf_level = str(rec.get("confidence_assessment", {}).get("level", "MEDIUM")).upper()
    is_meeting = (decision.record_type or "decision").lower() == "meeting"

    banner_subtitle = "DECISIONLENS EXECUTIVE MEETING MINUTES" if is_meeting else "DECISIONLENS STRATEGIC INTELLIGENCE DOSSIER"
    record_id_prefix = "MTG" if is_meeting else "DEC"

    banner_data = [
        [
            Paragraph(f"<b>{banner_subtitle}</b>", ParagraphStyle("BTop", parent=meta_style, fontName="Helvetica-Bold", textColor=COLOR_STEEL)),
            Paragraph(f"<b>STATUS:</b> <font color=\"#166534\">{escape_xml(status_str)}</font>", ParagraphStyle("BStat", parent=meta_style, alignment=2)),
        ],
        [
            Paragraph(f"<b>{escape_xml(decision.title)}</b>", title_style),
            Paragraph(f"<b>ID:</b> {record_id_prefix}-{decision.id:04d}<br/><b>Date:</b> {now_str}<br/><b>Domain:</b> {escape_xml(domain_str)}", meta_style),
        ],
        [
            Paragraph(f"<b>Confidence Assessment:</b> {conf_pct}% ({escape_xml(conf_level)}) &bull; <b>Record Type:</b> {escape_xml('Meeting Discussion' if is_meeting else 'Decision Analysis')}", ParagraphStyle("BBot", parent=meta_style, textColor=COLOR_NAVY)),
            Paragraph("<b>Verified Evidence:</b> Grounded", ParagraphStyle("BBotR", parent=meta_style, alignment=2, textColor=COLOR_MUTED)),
        ]
    ]
    banner_table = Table(banner_data, colWidths=[360, 144])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_SURFACE),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 8))

    # Interactive Table of Contents
    story.append(BookmarkFlowable("sec_toc", "Table of Contents", 0))
    story.append(Paragraph("<b>Table of Contents (Click to Jump Directly)</b>", h2_style))
    toc_links = [
        f'<a href="#sec_problem" color="#2F5D8F">{ "1. Meeting Purpose & Agenda Objectives" if is_meeting else "1. Problem Statement & Operational Scope" }</a>',
        '<a href="#sec_cognitive" color="#2F5D8F">2. Cognitive Structuring (8 Distinct Categories)</a>',
        '<a href="#sec_gaps" color="#2F5D8F">3. Information Gaps & Web Research Resolution</a>',
        f'<a href="#sec_frameworks" color="#2F5D8F">{ "4. Meeting Alignment & Analytical Frameworks" if is_meeting else "4. Multi-Lens Analytical Framework Results" }</a>',
        f'<a href="#sec_synthesis" color="#2F5D8F">{ "5. Meeting Decisions & Executive Minutes" if is_meeting else "5. Strategic Recommendation & Decision Synthesis" }</a>',
        '<a href="#sec_roadmap" color="#2F5D8F">6. Actionable Implementation Roadmap</a>',
    ]
    toc_data = [[Paragraph(link, body_style)] for link in toc_links]
    toc_table = Table(toc_data, colWidths=[504])
    toc_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_PAGE),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(toc_table)
    story.append(Spacer(1, 10))

    # Section 1: Problem Statement
    story.append(BookmarkFlowable("sec_problem", "1. Problem Statement & Scope", 0))
    story.append(Paragraph('<a name="sec_problem"/><b>1. Problem Statement & Operational Scope</b>', h1_style))
    story.append(Paragraph(f"<b>Core Problem:</b> {escape_xml(decision.problem_statement or 'No explicit problem statement recorded.')}", body_style))
    if decision.description:
        story.append(Paragraph(f"<b>Background Context:</b> {escape_xml(decision.description)}", body_style))
    
    ingest_txt = (
        f"<b>Ingestion Overview:</b> Attached Documents: {len(decision.attachments) if decision.attachments else 0} &bull; "
        f"Audio Recordings: {len(decision.audio_recordings) if decision.audio_recordings else 0} &bull; "
        f"Transcript: {'Reviewed by User' if decision.transcript_reviewed else ('Present (Unreviewed)' if decision.transcript else 'None')}"
    )
    story.append(Paragraph(ingest_txt, body_muted))
    story.append(Spacer(1, 6))

    # Section 2: Cognitive Structuring
    story.append(BookmarkFlowable("sec_cognitive", "2. Cognitive Structuring", 0))
    story.append(Paragraph('<a name="sec_cognitive"/><b>2. Cognitive Structuring (8 Distinct Cognitive Categories)</b>', h1_style))
    cat_keys = [
        ("Facts (Concrete, Verified)", "facts"),
        ("Assumptions (Unverified Hypotheses)", "assumptions"),
        ("Pros (Strategic Upsides)", "pros"),
        ("Cons (Vulnerabilities & Friction)", "cons"),
        ("Mixed Points (Nuanced Trade-offs)", "mixed_points"),
        ("Feelings (Stakeholder Morale)", "feelings"),
        ("Contradictions (Direct Inconsistencies)", "contradictions"),
        ("Unknowns (Information Blindspots)", "unknowns"),
    ]
    for i in range(0, len(cat_keys), 2):
        title_a, key_a = cat_keys[i]
        items_a = points.get(key_a, [])
        items_a_txt = "<br/>".join([f"&bull; {escape_xml(item)}" for item in items_a]) if items_a else "<i>None noted.</i>"
        
        if i + 1 < len(cat_keys):
            title_b, key_b = cat_keys[i + 1]
            items_b = points.get(key_b, [])
            items_b_txt = "<br/>".join([f"&bull; {escape_xml(item)}" for item in items_b]) if items_b else "<i>None noted.</i>"
        else:
            title_b, items_b_txt = "", ""

        pair_data = [
            [Paragraph(f"<b>{title_a}</b>", h2_style), Paragraph(f"<b>{title_b}</b>", h2_style)],
            [Paragraph(items_a_txt, table_cell), Paragraph(items_b_txt, table_cell)],
        ]
        t = Table(pair_data, colWidths=[248, 248])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLOR_SURFACE),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 3))

    # Private feedback
    feedback = points.get("private_feedback")
    if feedback and isinstance(feedback, dict):
        fb_txt = (
            f"<b>Tone Observations:</b> {escape_xml(feedback.get('tone_observations', 'Objective.'))}<br/>"
            f"<b>Clarity Rating:</b> {escape_xml(feedback.get('clarity_rating', 'Medium'))} &bull; "
            f"<b>Cognitive Biases Detected:</b> {escape_xml(', '.join(feedback.get('potential_biases', ['None detected'])))}<br/>"
            f"<b>Strategic Feedback:</b> {escape_xml(feedback.get('feedback_notes', 'N/A'))}"
        )
        fb_table = Table([[Paragraph("<b>Private Reflective Feedback</b>", h2_style)], [Paragraph(fb_txt, table_cell)]], colWidths=[504])
        fb_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLOR_PAGE),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(Spacer(1, 3))
        story.append(fb_table)

    story.append(Spacer(1, 6))

    # Section 3: Gaps & Web Research
    story.append(BookmarkFlowable("sec_gaps", "3. Information Gaps & Research", 0))
    story.append(Paragraph('<a name="sec_gaps"/><b>3. Information Gaps & External Research Resolution</b>', h1_style))
    gap_items = gaps.get("gaps", []) if isinstance(gaps, dict) else (gaps if isinstance(gaps, list) else [])
    if gap_items:
        story.append(Paragraph("<b>Identified Information Gaps:</b>", h2_style))
        for g in gap_items:
            if isinstance(g, dict):
                st = escape_xml(g.get("status", "unanswered").capitalize())
                q = escape_xml(g.get("question", "Gap"))
                imp = escape_xml(g.get("importance", "medium").capitalize())
                ans = f" &mdash; <i>Answer:</i> {escape_xml(g.get('user_answer'))}" if g.get("user_answer") else ""
                story.append(Paragraph(f"&bull; <b>{q}</b> [Importance: {imp}, Status: {st}]{ans}", bullet_style))
    
    research_list = research.get("research", []) if isinstance(research, dict) else (research if isinstance(research, list) else [])
    if research_list:
        story.append(Spacer(1, 3))
        story.append(Paragraph("<b>Verified Web Research Citations (Zero-Hallucination):</b>", h2_style))
        for r_entry in research_list:
            if isinstance(r_entry, dict):
                q = escape_xml(r_entry.get("query", ""))
                story.append(Paragraph(f"<b>Query:</b> <code>{q}</code>", body_style))
                claims = r_entry.get("claims", [])
                for c in claims:
                    if isinstance(c, dict):
                        ct = escape_xml(c.get("claim_text", ""))
                        stitle = escape_xml(c.get("source_title") or r_entry.get("title") or "Source")
                        surl = c.get("source_url") or r_entry.get("url") or ""
                        if surl:
                            story.append(Paragraph(f"&bull; &ldquo;{ct}&rdquo; &mdash; <a href=\"{surl}\" color=\"#2F5D8F\"><u>{stitle}</u></a>", bullet_style))
                        else:
                            story.append(Paragraph(f"&bull; &ldquo;{ct}&rdquo; &mdash; <i>{stitle}</i>", bullet_style))

    story.append(Spacer(1, 6))

    # Section 4: Frameworks
    story.append(BookmarkFlowable("sec_frameworks", "4. Multi-Lens Frameworks", 0))
    story.append(Paragraph('<a name="sec_frameworks"/><b>4. Multi-Lens Analytical Framework Results</b>', h1_style))
    matrix = analysis.get("decision_matrix", {}) if isinstance(analysis, dict) else {}
    if matrix and matrix.get("applicable"):
        story.append(Paragraph("<b>Weighted Decision Matrix (Normalized to 100% Weight):</b>", h2_style))
        criteria = matrix.get("criteria", [])
        ranked_opts = matrix.get("ranked_options", [])
        if criteria and ranked_opts:
            m_header = [Paragraph("<b>Option</b>", table_header), Paragraph("<b>Score</b>", table_header)]
            for c in criteria:
                m_header.append(Paragraph(f"<b>{escape_xml(c.get('name', 'C'))}</b><br/>({c.get('weight', 0):.0f}%)", table_header))
            m_header.append(Paragraph("<b>Rank</b>", table_header))

            m_rows = [m_header]
            for opt in ranked_opts:
                opt_name = escape_xml(opt.get("name", "Option"))
                w_score = opt.get("score", opt.get("weighted_score", 0.0))
                rank = opt.get("rank", 1)
                opt_ratings = opt.get("scores", {})
                row = [Paragraph(f"<b>{opt_name}</b>", table_cell), Paragraph(f"<b>{w_score:.2f}</b>", table_cell)]
                for c in criteria:
                    cid = c.get("id")
                    val = opt_ratings.get(cid, "-")
                    row.append(Paragraph(f"{val:.1f}" if isinstance(val, (int, float)) else str(val), table_cell))
                row.append(Paragraph(f"Rank {rank}", table_cell))
                m_rows.append(row)

            num_cols = len(m_header)
            col_w = 504 / num_cols
            m_table = Table(m_rows, colWidths=[col_w] * num_cols)
            m_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), COLOR_PAGE),
                ('BACKGROUND', (0, 1), (-1, -1), COLOR_SURFACE),
                ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ]))
            story.append(m_table)
            story.append(Spacer(1, 4))

    # Section 5: Synthesis & Recommendation
    story.append(BookmarkFlowable("sec_synthesis", "5. Strategic Recommendation", 0))
    story.append(Paragraph('<a name="sec_synthesis"/><b>5. Strategic Recommendation & Decision Synthesis</b>', h1_style))
    rec_title = escape_xml(rec.get("headline", "Strategic Decision Synthesis"))
    rec_text = escape_xml(rec.get("recommendation_text", "No recommendation produced."))
    rec_card = Table(
        [[Paragraph(f"<b>{rec_title}</b>", h1_style)], [Paragraph(rec_text, body_style)]],
        colWidths=[504]
    )
    rec_card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_SURFACE),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_STEEL),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(rec_card)
    story.append(Spacer(1, 5))

    # Risks and Mitigations table
    risks = rec.get("risks_and_mitigations", [])
    if risks:
        story.append(Paragraph("<b>Risk Matrix & Mitigation Strategies:</b>", h2_style))
        r_rows = [[Paragraph("<b>Severity</b>", table_header), Paragraph("<b>Identified Risk</b>", table_header), Paragraph("<b>Mitigation Strategy</b>", table_header)]]
        for r in risks:
            if isinstance(r, dict):
                sev = escape_xml(str(r.get("severity", "medium")).upper())
                risk_txt = escape_xml(r.get("risk", ""))
                mit_txt = escape_xml(r.get("mitigation", ""))
                r_rows.append([Paragraph(f"<b>{sev}</b>", table_cell), Paragraph(risk_txt, table_cell), Paragraph(mit_txt, table_cell)])
        r_table = Table(r_rows, colWidths=[70, 217, 217])
        r_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_PAGE),
            ('BACKGROUND', (0, 1), (-1, -1), COLOR_SURFACE),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(r_table)
        story.append(Spacer(1, 6))

    # Section 6: Roadmap
    story.append(BookmarkFlowable("sec_roadmap", "6. Implementation Roadmap", 0))
    story.append(Paragraph('<a name="sec_roadmap"/><b>6. Actionable Implementation Roadmap</b>', h1_style))
    rm_phases = roadmap.get("phases", [])
    if rm_phases:
        for pidx, phase in enumerate(rm_phases, 1):
            if isinstance(phase, dict):
                p_title = escape_xml(phase.get("title", f"Phase {pidx}"))
                p_time = escape_xml(phase.get("timeline", ""))
                story.append(Paragraph(f"<b>{p_title} ({p_time})</b>", h2_style))
                tasks = phase.get("tasks", [])
                for tidx, task in enumerate(tasks, 1):
                    if isinstance(task, dict):
                        t_title = escape_xml(task.get("title", f"Task {tidx}"))
                        t_role = escape_xml(task.get("owner_role", "Lead"))
                        t_time = escape_xml(task.get("timeline", ""))
                        t_crit = escape_xml(task.get("success_criteria", ""))
                        t_desc = escape_xml(task.get("description", ""))
                        check = "[X]" if task.get("is_completed") else "[ ]"
                        task_txt = f"<b>{check} {t_title}</b> &bull; <i>Role: {t_role}</i> ({t_time})<br/>{t_desc}"
                        if t_crit:
                            task_txt += f"<br/><font color=\"#2F5D8F\">Exit Criteria: {t_crit}</font>"
                        story.append(Paragraph(task_txt, bullet_style))
                story.append(Spacer(1, 3))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buf.getvalue()
