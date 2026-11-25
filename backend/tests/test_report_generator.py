import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from app.services.report_generator import (
    compile_latex_with_pylatex,
    compile_latex_to_pdf_locally,
    generate_decision_latex_report,
    generate_decision_markdown_report,
    generate_decision_interactive_pdf,
)
from app.models import Decision, User, Folder, AnalysisSnapshot
from sqlalchemy.orm import Session


def test_compile_latex_with_pylatex_graceful_on_missing_compiler():
    """Verify compile_latex_with_pylatex executes safely without unhandled crashes."""
    tex_code = r"\documentclass{article}\begin{document}DecisionLens Test Dossier\end{document}"
    # In environments without pdflatex on PATH, it should return None or bytes if installed
    res = compile_latex_with_pylatex(tex_code)
    assert res is None or isinstance(res, bytes)


def test_compile_latex_with_pylatex_success_creates_pdf(tmp_path):
    """Verify compile_latex_with_pylatex returns valid PDF bytes when PyLaTeX generate_pdf succeeds."""
    tex_code = r"\documentclass{article}\begin{document}DecisionLens Test\end{document}"

    def mock_generate_pdf(self, dest, clean=True, clean_tex=False):
        pdf_file = Path(dest + ".pdf")
        pdf_file.write_bytes(b"%PDF-1.4 mock content for decision dossier")

    with patch("pylatex.Document.generate_pdf", new=mock_generate_pdf):
        pdf_bytes = compile_latex_with_pylatex(tex_code)
        assert pdf_bytes is not None
        assert isinstance(pdf_bytes, bytes)
        assert pdf_bytes.startswith(b"%PDF-1.4")


def test_compile_latex_to_pdf_locally_alias():
    """Verify compile_latex_to_pdf_locally delegates to compile_latex_with_pylatex."""
    assert compile_latex_to_pdf_locally is compile_latex_with_pylatex


def test_generate_decision_latex_report_structure(db_session):
    """Verify generate_decision_latex_report includes blunder shield and execution roadmap."""
    test_user = User(
        email="test_pylatex@decisionlens.ai",
        password_hash="hash",
    )
    db_session.add(test_user)
    db_session.flush()

    test_folder = Folder(
        owner_id=test_user.id,
        name="Architecture Sprints",
    )
    db_session.add(test_folder)
    db_session.flush()

    dec = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="PostgreSQL vs ScyllaDB for High-Frequency Ledger",
        domain="SOFTWARE",
        status="decided",
        analysis={
            "decision_statement": "PostgreSQL vs ScyllaDB",
            "domain": "SOFTWARE",
        },
        recommendation={
            "headline": "Adopt PostgreSQL Partitioning with Timescale Extension",
            "recommendation_text": "Provides transactional ACID consistency with low operational overhead.",
            "alternatives_considered": [
                {
                    "name": "ScyllaDB",
                    "is_recommended": False,
                    "description": "Distributed NoSQL",
                    "why_not_recommended": "High maintenance complexity for small team",
                }
            ],
            "blunder_shield": {
                "capital_at_risk_saved": "₹45 Lakh – ₹65 Lakh",
                "developer_sprints_saved": "6 Sprints (12 Wks)",
                "prevented_fatal_trap": "Premature distributed NoSQL clustering",
                "risk_reduction_rationale": "Avoided SRE cluster operational toil.",
            },
        },
        roadmap={
            "title": "PostgreSQL Partitioning Rollout",
            "phases": [
                {
                    "phase_id": "phase-1",
                    "title": "Phase 1: Due Diligence & Validation",
                    "timeline": "Weeks 1-2",
                    "tasks": [
                        {
                            "title": "Benchmark p99 query latency under load",
                            "owner_role": "Lead Architect",
                            "timeline": "Week 1",
                            "is_completed": False,
                        }
                    ],
                }
            ],
        },
    )
    db_session.add(dec)
    db_session.commit()

    tex_code = generate_decision_latex_report(dec)
    assert r"\documentclass" in tex_code
    assert "PostgreSQL vs ScyllaDB" in tex_code
    assert "Capital at Risk" in tex_code
    assert r"Phase 1: Due Diligence \& Validation" in tex_code
    assert r"\end{document}" in tex_code


def test_generate_decision_interactive_pdf_publication_grade(db_session):
    """Verify generate_decision_interactive_pdf builds an A4 publication-grade PDF dossier."""
    test_user = User(
        email="test_pdf_pub@decisionlens.ai",
        password_hash="hash",
    )
    db_session.add(test_user)
    db_session.flush()

    test_folder = Folder(
        owner_id=test_user.id,
        name="Architecture Sprints",
    )
    db_session.add(test_folder)
    db_session.flush()

    dec = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="Monolith vs Microservices Architecture Dossier",
        domain="SOFTWARE",
        status="decided",
        problem_statement="Evaluate migration from monolith to microservices.",
        description="Comprehensive architecture and FinOps review.",
        points={
            "facts": ["Peak 5,000 req/s", "RDS at 75% load"],
            "assumptions": ["Microservices enable independent scaling"],
            "pros": ["Modular monolith preserves single DB consistency"],
            "cons": ["Microservices add distributed tracing overhead"],
        },
        recommendation={
            "headline": "Adopt Modular Monolith with Domain Boundaries",
            "recommendation_text": "Option 1 is confirmed as the optimal strategic path with 88% confidence.",
            "confidence_assessment": {"score": 0.88, "level": "HIGH"},
            "blunder_shield": {
                "capital_at_risk_saved": "₹45 Lakh – ₹65 Lakh",
                "developer_sprints_saved": "6 Sprints (12 Wks)",
                "prevented_fatal_trap": "Premature microservices sprawl",
                "risk_reduction_rationale": "Avoided unbudgeted distributed tracing and APM licensing.",
                "receipt": {
                    "receipt_id": "MUNSHI-FINOPS-TEST",
                    "total_capital_at_risk": "₹52,50,000",
                    "decision_type": "MIGRATION",
                    "line_items": [
                        {
                            "item_name": "APM Tooling Avoided",
                            "category": "Licensing",
                            "unit_basis": "12 months Datadog",
                            "amount_inr": "₹18,50,000",
                            "rationale": "In-memory monolith needs zero APM tracing agents.",
                        }
                    ],
                },
            },
        },
        roadmap={
            "title": "Modular Monolith Execution Plan",
            "phases": [
                {
                    "title": "Phase 1: Package Boundaries",
                    "timeline": "Weeks 1-2",
                    "tasks": [
                        {
                            "title": "Setup ArchUnit boundary enforcement",
                            "owner_role": "Lead Architect",
                            "timeline": "Week 1",
                            "is_completed": True,
                            "success_criteria": "Zero cyclic dependencies",
                        }
                    ],
                }
            ],
        },
    )
    db_session.add(dec)
    db_session.commit()

    pdf_bytes = generate_decision_interactive_pdf(dec)
    assert pdf_bytes is not None
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 5000  # Multi-page typeset PDF is at least 5KB


def test_report_generator_conditional_decision_status(db_session: Session):
    """
    Verify report generator correctly renders 'conditional' decisions with
    'CONDITIONAL (Awaiting Validation)' in executive brief and
    'PROVISIONAL (Awaiting Validation Clearance)' in ADR status.
    """
    from app.services.report_generator import (
        generate_decision_markdown_report,
        generate_decision_latex_report,
    )

    test_user = User(
        email="test_cond_report@decisionlens.ai",
        password_hash="hash",
    )
    db_session.add(test_user)
    db_session.flush()

    test_folder = Folder(
        owner_id=test_user.id,
        name="Architecture Sprints",
    )
    db_session.add(test_folder)
    db_session.flush()

    dec = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="High-Scale Message Broker Evaluation",
        domain="SOFTWARE",
        status="conditional",
        problem_statement="Should we adopt Apache Kafka or AWS SQS?",
        recommendation={
            "headline": "Adopt Apache Kafka with Strict Retention Guardrails",
            "synthesis_type": "conditional_next_step",
            "confidence_assessment": {"score": 0.65, "level": "medium"},
        },
    )
    db_session.add(dec)
    db_session.commit()

    md_report = generate_decision_markdown_report(dec)
    assert "**Status:** CONDITIONAL (Awaiting Validation)" in md_report
    assert "PROVISIONAL (Awaiting Validation Clearance)" in md_report

    latex_report = generate_decision_latex_report(dec)
    assert "CONDITIONAL (Awaiting Validation)" in latex_report
    assert "PROVISIONAL (Awaiting Validation Clearance)" in latex_report


def test_report_generator_includes_stage6_outcomes(db_session: Session):
    """
    Verify report generator (JSON, Markdown, LaTeX, and PDF) includes
    Stage 6 Outcome Realization & Continuous Learning when outcomes are recorded.
    """
    from app.services.report_generator import (
        generate_decision_json_report,
        generate_decision_markdown_report,
        generate_decision_latex_report,
        generate_decision_interactive_pdf,
    )
    from app.models import DecisionOutcome

    test_user = User(
        email="test_outcome_report@decisionlens.ai",
        password_hash="hash",
    )
    db_session.add(test_user)
    db_session.flush()

    test_folder = Folder(
        owner_id=test_user.id,
        name="Platform Evolutions",
    )
    db_session.add(test_folder)
    db_session.flush()

    dec = Decision(
        owner_id=test_user.id,
        folder_id=test_folder.id,
        title="PostgreSQL 17 Migration",
        domain="SOFTWARE",
        status="decided",
        problem_statement="Should we migrate to PostgreSQL 17?",
        recommendation={
            "headline": "Upgrade to PostgreSQL 17 with PgBouncer Pooling",
            "synthesis_type": "recommendation",
            "confidence_assessment": {"score": 0.90, "level": "high"},
        },
        roadmap={
            "title": "Upgrade Roadmap",
            "phases": [
                {
                    "title": "Phase 1: Canary Deploy",
                    "timeline": "Week 1",
                    "tasks": [{"title": "Deploy canary instance", "owner_role": "DBA", "timeline": "Day 1"}],
                }
            ],
        },
    )
    db_session.add(dec)
    db_session.commit()
    db_session.refresh(dec)

    outcome = DecisionOutcome(
        decision_id=dec.id,
        owner_id=test_user.id,
        implementation_status="implemented_as_recommended",
        chosen_option="PostgreSQL 17 on AWS RDS",
        utility_rating=9,
        days_since_decision=30,
        what_worked_well="Zero downtime cutover with logical replication.",
        lessons_learned="PgBouncer connection pool size needed 25% bump during peak hours.",
        unexpected_challenges=["Replication lag spiked briefly during index builds"],
        would_recommend_tool=True,
        predicted_vs_actual={"latency_reduction_achieved": True, "budget_held": True},
    )
    db_session.add(outcome)
    db_session.commit()
    db_session.refresh(dec)

    # 1. JSON Export must include outcomes array and count
    json_report = generate_decision_json_report(dec)
    assert "outcomes" in json_report
    assert json_report["outcomes_count"] == 1
    assert json_report["outcomes"][0]["utility_rating"] == 9
    assert json_report["outcomes"][0]["chosen_option"] == "PostgreSQL 17 on AWS RDS"
    assert "PgBouncer" in json_report["outcomes"][0]["lessons_learned"]

    # 2. Markdown Report must include Stage 6 section
    md_report = generate_decision_markdown_report(dec)
    assert "## 7. Stage 6: Outcome Realization & Continuous Learning" in md_report
    assert "PostgreSQL 17 on AWS RDS" in md_report
    assert "**9/10**" in md_report
    assert "PgBouncer connection pool size" in md_report

    # 3. LaTeX Report must include Stage 6 section
    latex_report = generate_decision_latex_report(dec)
    assert "Stage 6: Outcome Realization" in latex_report
    assert "PostgreSQL 17 on AWS RDS" in latex_report

    # 4. Interactive PDF must build successfully with Stage 6 section flowable
    pdf_bytes = generate_decision_interactive_pdf(dec)
    assert pdf_bytes is not None
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 5000



