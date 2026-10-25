import logging
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models import Decision

logger = logging.getLogger("decisionlens.folder_context")


def get_folder_precedents(
    decision: Decision,
    db: Optional[Session],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Retrieve chronological historical decisions and meetings sharing the same folder_id.
    Filters by the same owner_id and ensures privacy and multi-tenant security.
    Returns the most recent precedents preceding the current decision.
    """
    if db is None or not decision.folder_id or not decision.id:
        return []

    try:
        query = (
            db.query(Decision)
            .filter(
                Decision.folder_id == decision.folder_id,
                Decision.owner_id == decision.owner_id,
                Decision.id != decision.id,
            )
        )

        if decision.created_at:
            query = query.filter(
                (Decision.created_at < decision.created_at)
                | ((Decision.created_at == decision.created_at) & (Decision.id < decision.id))
            )
        else:
            query = query.filter(Decision.id < decision.id)

        records = query.order_by(Decision.created_at.asc(), Decision.id.asc()).all()

        # Take the most recent `limit` prior records
        if len(records) > limit:
            records = records[-limit:]

        precedents: List[Dict[str, Any]] = []
        for rec in records:
            points = rec.points if isinstance(rec.points, dict) else {}
            gaps = rec.gaps if isinstance(rec.gaps, dict) else {}
            rec_recommendation = rec.recommendation if isinstance(rec.recommendation, dict) else {}
            rec_analysis = rec.analysis if isinstance(rec.analysis, dict) else {}
            rec_roadmap = rec.roadmap if isinstance(rec.roadmap, dict) else {}

            canonical_winner = None
            if "canonical_result" in rec_analysis and isinstance(rec_analysis["canonical_result"], dict):
                canonical_winner = rec_analysis["canonical_result"].get("winner_option_name")
            elif "decision_matrix" in rec_analysis and isinstance(rec_analysis["decision_matrix"], dict):
                dm = rec_analysis["decision_matrix"]
                if "canonical_result" in dm and isinstance(dm["canonical_result"], dict):
                    canonical_winner = dm["canonical_result"].get("winner_option_name")

            # Extract answered gaps
            answered_gaps = []
            for g in gaps.get("gaps", []):
                if isinstance(g, dict) and g.get("status") == "answered" and g.get("answer"):
                    answered_gaps.append({
                        "question": g.get("question", "").strip(),
                        "answer": g.get("answer", "").strip(),
                    })

            # Extract roadmap phase names
            roadmap_phases = []
            for p in rec_roadmap.get("phases", []):
                if isinstance(p, dict):
                    phase_title = p.get("phase_name") or p.get("title") or ""
                    if phase_title:
                        roadmap_phases.append(phase_title.strip())

            # Extract latest real-world outcome review
            outcome_info = None
            if hasattr(rec, "outcomes") and rec.outcomes:
                latest_outcome = rec.outcomes[-1]
                outcome_info = {
                    "implementation_status": latest_outcome.implementation_status,
                    "chosen_option": latest_outcome.chosen_option,
                    "utility_rating": latest_outcome.utility_rating,
                    "lessons_learned": latest_outcome.lessons_learned,
                    "unexpected_challenges": latest_outcome.unexpected_challenges,
                }

            precedent_data = {
                "id": rec.id,
                "title": rec.title or f"Record #{rec.id}",
                "record_type": getattr(rec, "record_type", "decision") or "decision",
                "created_at": rec.created_at.strftime("%Y-%m-%d %H:%M UTC") if rec.created_at else None,
                "problem_statement": (rec.problem_statement or rec.description or "").strip(),
                "established_facts": [str(f).strip() for f in points.get("facts", [])[:6] if str(f).strip()],
                "unresolved_unknowns": [str(u).strip() for u in points.get("unknowns", [])[:4] if str(u).strip()],
                "verdict_headline": rec_recommendation.get("headline"),
                "verdict_winner": canonical_winner,
                "verdict_summary": (rec_recommendation.get("recommendation_text") or "")[:280].strip(),
                "answered_gaps": answered_gaps[:4],
                "active_roadmap_phases": roadmap_phases[:3],
                "outcome_info": outcome_info,
            }
            precedents.append(precedent_data)

        return precedents
    except Exception as exc:
        logger.warning("Error fetching folder precedents for decision %s: %s", decision.id, exc)
        return []


def format_folder_precedents_for_prompt(precedents: List[Dict[str, Any]]) -> str:
    """
    Format folder precedents into a clear, high-density markdown context block
    for injection into LLM prompts (Structuring, Gap Detection, Frameworks, Synthesis).
    """
    if not precedents:
        return ""

    lines = [
        f"### PRIOR FOLDER CONTEXT & ORGANIZATIONAL MEMORY ({len(precedents)} Preceding Record(s) in this Folder)",
        "The current record is part of a multi-session project folder. Prior meetings and decisions in this folder",
        "have already established verified facts, resolved critical trade-offs, and agreed on active initiatives.",
        "You MUST treat these precedents as continuous historical baseline to prevent redundant questioning and preserve continuity:",
        "",
    ]

    for idx, p in enumerate(precedents, start=1):
        date_suffix = f", Date: {p['created_at']}" if p.get("created_at") else ""
        lines.append(f"#### Precedent {idx}: [{p['record_type'].upper()}] \"{p['title']}\" (ID #{p['id']}{date_suffix})")
        if p["problem_statement"]:
            lines.append(f"- Focus / Context: {p['problem_statement']}")

        if p["established_facts"]:
            lines.append("- Established Facts:")
            for f in p["established_facts"]:
                lines.append(f"  * {f}")

        if p["verdict_headline"] or p["verdict_winner"]:
            verdict_info = p["verdict_headline"] or f"Approved Winner: {p['verdict_winner']}"
            lines.append(f"- Prior Verdict / Resolution: {verdict_info}")
            if p["verdict_summary"]:
                lines.append(f"  * Context: {p['verdict_summary']}")

        if p["answered_gaps"]:
            lines.append("- Previously Clarified Gaps:")
            for g in p["answered_gaps"]:
                lines.append(f"  * Q: {g['question']} -> Answer: {g['answer']}")

        if p["unresolved_unknowns"]:
            lines.append("- Carried-Over Open Questions:")
            for u in p["unresolved_unknowns"]:
                lines.append(f"  * {u}")

        if p["active_roadmap_phases"]:
            lines.append(f"- Active Roadmap Initiatives: {', '.join(p['active_roadmap_phases'])}")

        if p.get("outcome_info"):
            oi = p["outcome_info"]
            lines.append(f"- Real-World Outcome Follow-up (Client Rating: {oi['utility_rating']}/5):")
            lines.append(f"  * Status: {oi['implementation_status']} (Chosen Option: {oi['chosen_option']})")
            if oi.get("lessons_learned"):
                lines.append(f"  * Lessons Learned: {oi['lessons_learned']}")
            if oi.get("unexpected_challenges"):
                challenges_str = ", ".join(str(c) for c in oi["unexpected_challenges"][:3] if c)
                if challenges_str:
                    lines.append(f"  * Production Challenges: {challenges_str}")

        lines.append("")

    return "\n".join(lines).strip()

