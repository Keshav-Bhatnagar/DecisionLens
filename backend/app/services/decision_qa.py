import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from app.models import Decision
from app.services.ai import call_gemini_direct_rest, get_llm_client_and_model

logger = logging.getLogger("decisionlens.decision_qa")


def _build_decision_context(decision: Decision, question: str) -> Tuple[str, List[str]]:
    """
    Assemble a concise, epistemically grounded context bundle from all stages
    of the decision record plus any indexed RAG document excerpts.
    """
    sections: List[str] = []
    sources: List[str] = []

    title = decision.title or f"Decision #{decision.id}"
    domain = decision.domain or "GENERAL"
    sections.append(f"DECISION TITLE: {title}\nDOMAIN: {domain}")

    if decision.problem_statement or decision.description:
        notes = "\n".join(p for p in [decision.problem_statement, decision.description] if p and p.strip())
        if notes:
            sections.append(f"PROBLEM STATEMENT & NOTES:\n{notes}")
            sources.append("Problem Statement & Notes")

    if decision.transcript:
        transcript_snippet = decision.transcript.strip()[:1600]
        sections.append(f"MEETING TRANSCRIPT / NOTES:\n{transcript_snippet}")
        sources.append("Meeting Transcript")

    if decision.points and isinstance(decision.points, dict):
        sf = decision.points
        options = sf.get("options") or sf.get("alternatives") or []
        facts = sf.get("facts") or sf.get("key_facts") or sf.get("points") or []
        constraints = sf.get("constraints") or []
        sf_summary = {
            "options": options[:8],
            "key_facts": facts[:10],
            "constraints": constraints[:8],
        }
        sections.append(f"STAGE 1 STRUCTURED FINDINGS:\n{json.dumps(sf_summary, default=str)}")
        sources.append("Stage 1 Findings")

    raw_gaps = decision.gaps
    if isinstance(raw_gaps, dict):
        gaps = raw_gaps.get("gaps") or raw_gaps.get("items") or []
    elif isinstance(raw_gaps, list):
        gaps = raw_gaps
    else:
        gaps = []

    if gaps:
        resolved_count = sum(1 for g in gaps if isinstance(g, dict) and g.get("is_resolved"))
        open_count = len(gaps) - resolved_count
        gap_lines = []
        for g in gaps[:10]:
            if not isinstance(g, dict):
                continue
            q_text = g.get("question") or g.get("description") or ""
            ans = g.get("user_answer") or g.get("answer") or ("Open / Unresolved" if not g.get("is_resolved") else "Resolved")
            gap_lines.append(f"- {q_text} -> {ans}")
        if gap_lines:
            sections.append("STAGE 2 UNKNOWNS & GAPS:\n" + "\n".join(gap_lines))
            sources.append(f"Stage 2 Gaps ({resolved_count} resolved, {open_count} open)")

    if decision.analysis and isinstance(decision.analysis, dict):
        fa = decision.analysis
        fa_summary = {
            "winner": fa.get("winner") or fa.get("recommended_option"),
            "winner_score": fa.get("winner_score"),
            "option_scores": fa.get("option_scores") or fa.get("scores") or [],
            "red_team_objections": (fa.get("red_team_objections") or [])[:4],
        }
        sections.append(f"MAUT & DECISION GAUNTLET:\n{json.dumps(fa_summary, default=str)}")
        sources.append("MAUT & Gauntlet Scores")

    if decision.recommendation and isinstance(decision.recommendation, dict):
        rec = decision.recommendation
        roadmap = (decision.roadmap if isinstance(decision.roadmap, dict) and decision.roadmap else None) or rec.get("roadmap") or {}
        phases_compact = []
        for ph in (roadmap.get("phases") or [])[:4]:
            if not isinstance(ph, dict):
                continue
            phases_compact.append({
                "title": ph.get("title"),
                "timeline": ph.get("timeline"),
                "tasks": [
                    {"title": t.get("title"), "timeline": t.get("timeline"), "owner": t.get("owner_role")}
                    for t in (ph.get("tasks") or [])[:5]
                    if isinstance(t, dict)
                ],
            })
        rec_summary = {
            "version": rec.get("version"),
            "headline": rec.get("headline"),
            "executive_summary": rec.get("executive_summary"),
            "decision_status": rec.get("decision_status"),
            "risks_and_mitigations": (rec.get("risks_and_mitigations") or [])[:5],
            "conditional_triggers": (rec.get("conditional_triggers") or [])[:5],
            "roadmap_phases": phases_compact,
        }
        sections.append(f"STAGE 3 SYNTHESIS & ROADMAP:\n{json.dumps(rec_summary, default=str)}")
        sources.append(f"Executive Synthesis v{rec.get('version', 1)}")

    # Include indexed document excerpts if available
    try:
        from app.services.rag.document_rag import get_document_rag_service

        doc_rag = get_document_rag_service()
        if doc_rag.has_indexed_documents(decision.id):
            excerpts = doc_rag.retrieve_relevant_excerpts(decision.id, query=question, top_k=3)
            if excerpts:
                doc_lines = []
                for idx, exc in enumerate(excerpts, start=1):
                    doc_name = exc.get("metadata", {}).get("document_name", "Document")
                    content = (exc.get("content") or "").strip()[:350]
                    if content:
                        doc_lines.append(f"[{idx}] ({doc_name}): {content}")
                if doc_lines:
                    sections.append("ATTACHED DOCUMENT EXCERPTS:\n" + "\n".join(doc_lines))
                    sources.append(f"Attached Docs ({len(doc_lines)} excerpts)")
    except Exception as exc:
        logger.warning("RAG lookup skipped in decision Q&A for decision %s: %s", decision.id, exc)

    return "\n\n".join(sections), sources


def _build_deterministic_answer(decision: Decision, question: str) -> str:
    """
    Compute a dynamic, grounded fallback answer from the decision's actual
    scores, gaps, risks, and roadmap when no live LLM is configured.
    """
    q_lower = question.lower()
    rec = decision.recommendation if isinstance(decision.recommendation, dict) else {}
    fa = decision.analysis if isinstance(decision.analysis, dict) else {}
    raw_gaps = decision.gaps
    if isinstance(raw_gaps, dict):
        gaps = raw_gaps.get("gaps") or raw_gaps.get("items") or []
    elif isinstance(raw_gaps, list):
        gaps = raw_gaps
    else:
        gaps = []

    headline = rec.get("headline") or fa.get("winner") or decision.title
    summary = rec.get("executive_summary") or decision.problem_statement or ""
    parts: List[str] = [f"Based on the current decision record for **{decision.title or 'this decision'}** ({headline}):"]

    if any(k in q_lower for k in ("risk", "blunder", "downside", "fail", "worry", "concern")):
        risks = rec.get("risks_and_mitigations") or []
        if risks:
            bullets = []
            for r in risks[:3]:
                if isinstance(r, dict):
                    bullets.append(f"- **{r.get('risk', 'Risk')}** — Mitigation: {r.get('mitigation', 'Monitor closely')}")
            if bullets:
                parts.append("**Key Risks & Mitigations:**\n" + "\n".join(bullets))

    if any(k in q_lower for k in ("roadmap", "timeline", "deadline", "week", "day", "schedule", "plan", "task", "next")):
        phases = (rec.get("roadmap") or {}).get("phases") or []
        if phases:
            p_lines = [
                f"- **{p.get('title')}** ({p.get('timeline', 'TBD')}): {len(p.get('tasks') or [])} tasks"
                for p in phases[:3]
                if isinstance(p, dict)
            ]
            parts.append("**Execution Roadmap:**\n" + "\n".join(p_lines))

    if any(k in q_lower for k in ("gap", "unknown", "missing", "question", "assumption")):
        if gaps:
            g_lines = []
            for g in gaps[:4]:
                if isinstance(g, dict):
                    status_lbl = "Resolved" if g.get("is_resolved") else "Open"
                    g_lines.append(f"- [{status_lbl}] {g.get('question') or g.get('description')}")
            parts.append("**Tracked Unknowns & Gaps:**\n" + "\n".join(g_lines))

    if any(k in q_lower for k in ("score", "why", "option", "compare", "alternative", "rank", "maut", "winner")):
        scores = fa.get("option_scores") or fa.get("scores") or []
        if isinstance(scores, list) and scores:
            s_lines = [
                f"- {s.get('option_name') or s.get('name')}: {s.get('total_score') or s.get('score')}/10"
                for s in scores[:4]
                if isinstance(s, dict)
            ]
            if s_lines:
                parts.append("**Evaluated Option Scores:**\n" + "\n".join(s_lines))

    if len(parts) == 1 and summary:
        parts.append(summary[:500])

    return "\n\n".join(parts)


def answer_decision_question(
    decision: Decision,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
    force_mock: bool = False,
) -> Dict[str, Any]:
    """
    Answer a follow-up question grounded in the full decision record
    (notes, transcript, Stage 1 findings, Stage 2 gaps, MAUT scores, Stage 3 synthesis & roadmap, and docs).
    """
    context_text, sources = _build_decision_context(decision, question)

    if not force_mock:
        client, model, provider = get_llm_client_and_model("synthesis")
        if client and provider != "mock":
            system_prompt = (
                "You are DecisionLens's Executive Decision Advisor.\n"
                "Answer the user's follow-up question strictly grounded in the provided Decision Record.\n"
                "Rules:\n"
                "- Cite specific option names, scores, constraints, resolved/open gaps, risks, or roadmap timelines from the record.\n"
                "- If the user asks a 'what-if' scenario (e.g., budget cut, tighter deadline), reason explicitly from the recorded constraints and trade-offs.\n"
                "- If a specific fact is missing from the record, state clearly what is missing instead of inventing numbers.\n"
                "- Keep the response crisp, well-structured, and directly actionable."
            )

            history_block = ""
            if history:
                recent = history[-6:]
                formatted = []
                for turn in recent:
                    role = (turn.get("role") or "user").upper()
                    content = (turn.get("content") or "").strip()[:500]
                    if content:
                        formatted.append(f"{role}: {content}")
                if formatted:
                    history_block = "RECENT Q&A CONTEXT:\n" + "\n".join(formatted) + "\n\n"

            user_prompt = (
                f"DECISION RECORD:\n{context_text}\n\n"
                f"{history_block}"
                f"USER QUESTION: {question.strip()}"
            )

            try:
                raw_answer: Optional[str] = None
                if provider == "azure":
                    resp = client.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        temperature=0.2,
                    )
                    raw_answer = resp.choices[0].message.content
                elif provider == "gemini":
                    gemini_key = os.getenv("GEMINI_API_KEY")
                    if gemini_key:
                        raw_answer = call_gemini_direct_rest(
                            prompt=f"{system_prompt}\n\n{user_prompt}",
                            model_name=model,
                            api_key=gemini_key,
                            temperature=0.2,
                        )

                if raw_answer and raw_answer.strip():
                    return {
                        "question": question.strip(),
                        "answer": raw_answer.strip(),
                        "grounded_sources": sources,
                        "provider": provider,
                    }
            except Exception as exc:
                logger.warning("LLM decision Q&A failed, falling back to deterministic synthesis: %s", exc)

    return {
        "question": question.strip(),
        "answer": _build_deterministic_answer(decision, question),
        "grounded_sources": sources,
        "provider": "deterministic",
    }
