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

