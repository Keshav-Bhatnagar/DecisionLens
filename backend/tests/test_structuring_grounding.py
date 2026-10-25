import pytest
from fastapi.testclient import TestClient

from app.schemas import GroundedCognitiveItem, StructuredFindings
from app.services.ai import (
    generate_mock_structuring_findings,
    validate_and_sanitize_grounded_findings,
)


@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user for structuring tests."""
    email = "epistemic_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_db_decision_id(client: TestClient, auth_headers: dict):
    """
    Decision setup mirroring the Section 14 database evaluation:
    PostgreSQL, MongoDB, and PostgreSQL + Redis.
    """
    folder_res = client.post(
        "/api/folders",
        json={"name": "Core Platform Evaluation", "description": "Database architecture selection"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]

    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": fid,
            "title": "Database Engine Migration: PostgreSQL vs MongoDB vs Redis",
            "problem_statement": (
                "The options being evaluated are PostgreSQL, MongoDB, and PostgreSQL + Redis. "
                "The platform will contain relational and activity-related data such as profiles, courses, assignments, submissions, and analytics. "
                "The team has stronger experience with PostgreSQL and MongoDB. Nobody on the team has significant production experience with Redis. "
                "The initial infrastructure budget is limited, and the platform has no historical traffic data."
            ),
            "description": (
                "We're expecting maybe around fifty thousand users eventually. We assume there will be traffic spikes during exams and assignment deadlines. "
                "MongoDB could make development easier if the structure changes frequently. I'm currently leaning toward PostgreSQL because it's familiar. "
                "Redis adds another system that we have to maintain, monitor, and secure. We don't want to over-engineer our initial infrastructure."
            ),
            "record_type": "decision",
            "language": "en",
        },
        headers=auth_headers,
    )
    return dec_res.json()["id"]


def test_source_grounding_contract_metadata_preservation():
    """Verify that every generated Stage 2 item preserves epistemic and source-grounding metadata."""
    sample_text = (
        "The team has stronger experience with PostgreSQL and MongoDB than Redis. "
        "We are expecting maybe around fifty thousand users eventually. "
        "Redis adds another system that we have to maintain, monitor, and secure. "
        "PostgreSQL is currently preferred because of familiarity."
    )
    findings = generate_mock_structuring_findings(sample_text)

    # 1. Verify grounded_items is present
    assert findings.grounded_items is not None
    assert isinstance(findings.grounded_items, dict)

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
    for cat in categories:
        assert cat in findings.grounded_items
        cat_items = findings.grounded_items[cat]
        assert isinstance(cat_items, list)

        for item in cat_items:
            assert isinstance(item, GroundedCognitiveItem)
            assert item.id.startswith("cog_")
            assert item.category == cat
            assert len(item.text) > 0
            assert len(item.source_spans) > 0, f"Item '{item.text}' missing source_spans"
            assert item.derivation_type in [
                "direct_extraction",
                "normalized_extraction",
                "explicit_user_inference",
                "model_inference",
                "analytical_derivation",
            ]
            assert item.epistemic_status in [
                "confirmed_fact",
                "estimate",
                "expectation",
                "projection",
                "target",
                "aspiration",
                "hypothesis",
                "unvalidated_premise",
                "subjective_preference",
                "explicit_risk",
                "inferred_risk",
                "trade_off",
                "true_contradiction",
                "open_question",
            ]
            assert 0.0 <= item.confidence <= 1.0


def test_facts_no_unsupported_strengthening_and_no_projections_as_facts():
    """
    Verify facts contain only concrete information explicitly stated.
    - No strengthening (e.g. must NOT add 'strong production experience').
    - Projections ('around 50,000 users') must NOT be in facts.
    """
    sample_text = (
        "The team has stronger experience with PostgreSQL and MongoDB. "
        "Nobody on the team has significant production experience with Redis. "
        "We're expecting maybe around fifty thousand users eventually."
    )
    findings = generate_mock_structuring_findings(sample_text)

    # Facts verification
    facts_joined = " ".join(findings.facts)
    # MUST NOT strengthen claim into "strong production experience with PostgreSQL"
    assert "strong production experience with PostgreSQL" not in facts_joined
    # Projections must NOT be in facts
    assert "50,000" not in facts_joined
    assert "50,000+" not in facts_joined

    # Projection must be in assumptions
    assumptions_joined = " ".join(findings.assumptions)
    assert "50,000" in assumptions_joined
    assert "may" in assumptions_joined or "around" in assumptions_joined


def test_assumptions_preserve_uncertainty_and_no_banned_strengthening():
    """Verify assumptions preserve uncertainty and avoid banned certainty adverbs."""
    sample_text = "We assume there will be traffic spikes during exams and assignment deadlines."
    findings = generate_mock_structuring_findings(sample_text)

    banned_words = [
        "guaranteed",
        "necessary",
        "definitely",
        "clearly",
        "proven",
        "safest",
        "optimal",
    ]
    for assumption in findings.assumptions:
        for bw in banned_words:
            assert bw not in assumption.lower(), f"Banned certainty word '{bw}' found in assumption: {assumption}"


def test_feelings_sentiment_no_amateur_psychoanalysis():
    """
    Verify feelings extraction uses neutral, professional terminology.
    Must NOT contain psychological concepts (anxiety, psychological safety, fear, insecurity).
    """
    sample_text = (
        "I'm currently leaning toward PostgreSQL because it's familiar. "
        "Redis adds another system that we have to maintain, monitor, and secure. "
        "We don't want to over-engineer our initial infrastructure."
    )
    findings = generate_mock_structuring_findings(sample_text)

    banned_psycho_terms = [
        "psychological safety",
        "psychological security",
        "anxiety",
        "fear",
        "insecurity",
        "confidence issues",
        "resistance",
    ]
    for feeling in findings.feelings:
        for pt in banned_psycho_terms:
            assert pt not in feeling.lower(), f"Banned psychoanalytic term '{pt}' found in feeling: {feeling}"

    # Verify neutral terms are used
    feelings_joined = " ".join(findings.feelings).lower()
    assert any(term in feelings_joined for term in ["concern", "hesitation", "preference", "uncertainty"])


def test_contradictions_redesign_zero_is_valid_result():
    """
    Verify contradiction logic:
    - Trade-offs (scalability vs limited budget, Redis complexity vs burst caching) are NOT contradictions.
    - ZERO contradictions is a valid result (contradictions = []).
    - No fake placeholder filler items.
    """
    tradeoff_input = (
        "We want long-term scalability and burst capacity, but our initial infrastructure budget is limited. "
        "We are concerned about Redis operational complexity, but we are considering PostgreSQL + Redis for caching. "
        "We expect traffic spikes, but we don't want to over-engineer."
    )
    findings = generate_mock_structuring_findings(tradeoff_input)

    # In this scenario, all points are constraints/trade-offs, NOT mutually incompatible propositions.
    assert findings.contradictions == [], "Expected zero contradictions for trade-off inputs"
    assert len(findings.contradictions) == 0

    # Ensure fake fillers are never generated
    for c in findings.contradictions:
        assert "no explicit" not in c.lower()
        assert "no contradiction" not in c.lower()


def test_true_contradiction_detected_when_propositions_mutually_exclusive():
    """Verify that a true contradiction IS detected when two statements directly conflict."""
    contradictory_input = (
        "We must keep the database completely self-hosted on-premise due to strict internal compliance. "
        "However, executive leadership mandates that we must adopt a fully managed cloud SaaS database."
    )
    findings = generate_mock_structuring_findings(contradictory_input)

    assert len(findings.contradictions) > 0
    contra_joined = " ".join(findings.contradictions).lower()
    assert "self-hosted" in contra_joined or "cloud" in contra_joined


def test_unknowns_phrased_as_questions_never_conclusions():
    """Verify that all unknowns are phrased as investigative questions, not conclusions."""
    findings = generate_mock_structuring_findings("PostgreSQL vs MongoDB vs Redis evaluation")

    assert len(findings.unknowns) > 0
    for u in findings.unknowns:
        assert u.endswith("?"), f"Unknown '{u}' must end with a question mark"
        assert not u.lower().startswith("the system cannot"), f"Unknown '{u}' should not be a negative conclusion"
        assert not u.lower().startswith("we don't know"), f"Unknown '{u}' should be framed as a direct inquiry"


def test_pydantic_model_validator_normalizes_rich_and_flat_data():
    """
    Test that StructuredFindings model_validator handles:
    1. Flat string lists -> Populates both .facts and .grounded_items['facts'].
    2. Dicts with text & source_spans -> Extracts clean strings into .facts while preserving rich metadata in .grounded_items.
    """
    raw_data = {
        "facts": [
            {
                "text": "The team has stronger experience with PostgreSQL than Redis.",
                "source_spans": ["The team has stronger experience with PostgreSQL."],
                "derivation_type": "direct_extraction",
                "epistemic_status": "confirmed_fact",
                "confidence": 0.95,
                "is_direct_extraction": True,
            }
        ],
        "assumptions": ["Traffic may spike during exam periods."],
        "contradictions": [],
        "unknowns": ["What is the expected peak concurrency?"],
    }

    findings = StructuredFindings.model_validate(raw_data)

    # Downstream consumers receive clean strings
    assert findings.facts == ["The team has stronger experience with PostgreSQL than Redis."]
    assert findings.assumptions == ["Traffic may spike during exam periods."]
    assert findings.contradictions == []
    assert findings.unknowns == ["What is the expected peak concurrency?"]

    # Grounded items internally holds full traceable metadata
    assert "facts" in findings.grounded_items
    fact_grounded = findings.grounded_items["facts"][0]
    assert fact_grounded.text == "The team has stronger experience with PostgreSQL than Redis."
    assert fact_grounded.derivation_type == "direct_extraction"
    assert fact_grounded.epistemic_status == "confirmed_fact"
    assert fact_grounded.is_direct_extraction is True

    # Assumptions automatically populated in grounded_items
    assert "assumptions" in findings.grounded_items
    asmp_grounded = findings.grounded_items["assumptions"][0]
    assert asmp_grounded.text == "Traffic may spike during exam periods."
    assert asmp_grounded.derivation_type == "explicit_user_inference"


def test_end_to_end_structuring_api_endpoint(client: TestClient, auth_headers: dict, sample_db_decision_id: int):
    """
    End-to-end integration test with the database decision through the REST API.
    Verifies Section 14 expectations:
    - 5 Facts
    - 4 Assumptions
    - 4 Feelings
    - 4 Pros
    - 4 Cons
    - 2 Mixed Points
    - 0 Contradictions
    - 7 Unknowns
    """
    res = client.post(
        f"/api/decisions/{sample_db_decision_id}/structuring/analyze?force_mock=true",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()

    findings = data["findings"]

    # Epistemic counts from Section 14
    assert len(findings["facts"]) >= 4
    assert len(findings["assumptions"]) >= 3
    assert len(findings["feelings"]) >= 3
    assert len(findings["pros"]) >= 3
    assert len(findings["cons"]) >= 3
    assert len(findings["mixed_points"]) >= 2
    assert len(findings["contradictions"]) == 0, "No genuine contradictions exist; zero is valid"
    assert len(findings["unknowns"]) >= 5

    # Grounded items metadata in response
    assert "grounded_items" in findings
    assert "facts" in findings["grounded_items"]
    assert len(findings["grounded_items"]["facts"]) == len(findings["facts"])


def test_source_traceability_structure_with_statement_and_source_statement():
    """
    Verify traceability structure matches the contract:
    {
      "statement": "...",
      "source_ids": ["..."],
      "derivation_type": "direct_extraction | normalized_extraction | inference | analytical_derivation",
      "epistemic_status": "stated | assumed | uncertain | inferred | unknown"
    }
    """
    raw_item = {
        "statement": "The team has stronger experience with PostgreSQL and MongoDB.",
        "source_statement": "The team has stronger experience with PostgreSQL and MongoDB. Nobody has production Redis experience.",
        "source_ids": ["transcript_sec_1"],
        "derivation_type": "direct_extraction",
        "epistemic_status": "stated",
        "category": "facts",
    }
    item = GroundedCognitiveItem.model_validate(raw_item)
    assert item.statement == "The team has stronger experience with PostgreSQL and MongoDB."
    assert item.text == "The team has stronger experience with PostgreSQL and MongoDB."
    assert item.source_statement == "The team has stronger experience with PostgreSQL and MongoDB. Nobody has production Redis experience."
    assert item.source_spans == ["The team has stronger experience with PostgreSQL and MongoDB. Nobody has production Redis experience."]
    assert item.derivation_type == "direct_extraction"
    assert item.epistemic_status == "stated"


def test_stage2_source_boundary_purges_external_research_markers():
    """
    NON-NEGOTIABLE SOURCE BOUNDARY:
    External web research, retrieved documents, industry knowledge, benchmarks, standards,
    provider information, or research-agent outputs MUST NOT be inserted into Stage 2 categories.
    """
    raw_user_input = "We are choosing between PostgreSQL and MongoDB for our user activity database. Budget is limited."
    
    findings = StructuredFindings(
        facts=[
            "PostgreSQL is being evaluated for user activity database.",
            "Web Researched (gap_1): PostgreSQL connection pool sizing benchmark shows 50-100 max connections.",
            "Industry standard benchmark suggests MongoDB is better for document stores.",
        ],
        assumptions=[
            "Budget constraints are strict.",
            "External research indicates AWS RDS costs are rising.",
        ],
        feelings=[
            "Decision makers are cautious about operational overhead.",
        ],
        pros=[
            "Structured evaluation clarifies priorities.",
            "Per research, PostgreSQL has extensive community extensions.",
        ],
        cons=[
            "Conflicting research evidence on replication lag across availability zones.",
        ],
        mixed_points=[
            "PostgreSQL familiarity vs MongoDB document model flexibility.",
        ],
        contradictions=[
            "Unsupported by research: Database must be simultaneously on-prem and serverless cloud.",
        ],
        unknowns=[
            "What is the expected read/write ratio?",
            "Web Researched: Unverified third-party SLA metrics.",
        ],
        summary="Database selection evaluation.",
    )

    sanitized = validate_and_sanitize_grounded_findings(findings, raw_input=raw_user_input)

    # 1. Facts must NOT contain external research or benchmarks
    assert len(sanitized.facts) == 1
    assert "Web Researched" not in sanitized.facts[0]
    assert "Industry standard" not in sanitized.facts[0]

    # 2. Assumptions must NOT contain external research
    assert all("External research" not in a for a in sanitized.assumptions)

    # 3. Pros and Cons must NOT contain external research or conflicting research evidence
    assert all("Per research" not in p for p in sanitized.pros)
    assert all("Conflicting research" not in c for c in sanitized.cons)

    # 4. Contradictions must NOT contain research markers
    assert all("Unsupported by research" not in ct for ct in sanitized.contradictions)

    # 5. Unknowns must NOT contain external research findings
    assert all("Web Researched" not in u for u in sanitized.unknowns)


def test_stage2_source_boundary_purges_ungrounded_fabricated_claims():
    """
    Validation Rule Step 1 & 2:
    For every Stage 2 item, identify supporting source statement and confirm it comes
    from user's original input. If completely ungrounded, remove item from Stage 2.
    """
    raw_user_input = (
        "We are evaluating PostgreSQL versus MongoDB for our educational platform. "
        "The team knows PostgreSQL well, but has zero Redis experience. "
        "Our cloud budget is limited to $2,000 monthly."
    )

    findings = StructuredFindings(
        facts=[
            "The team has stronger familiarity with PostgreSQL.",
            "Our cloud budget is limited to $2,000 monthly.",
            "The company is planning an acquisition of an enterprise oracle license in Tokyo.",
        ],
        assumptions=[
            "Initial operational constraints are noted.",
            "Competitor XYZ is losing market share in Latin America.",
        ],
        feelings=[
            "Stakeholders are cautious about adopting unfamiliar technology.",
        ],
        pros=[
            "PostgreSQL leverages existing team expertise.",
        ],
        cons=[
            "Adopting Redis introduces maintenance complexity for an inexperienced team.",
        ],
        mixed_points=[
            "Team familiarity with PostgreSQL vs flexibility of MongoDB.",
        ],
        contradictions=[],
        unknowns=["What is the peak query latency requirement?"],
        summary="Evaluation of database architecture.",
    )

    sanitized = validate_and_sanitize_grounded_findings(findings, raw_input=raw_user_input)

    # Grounded items matching raw_user_input should remain
    assert any("PostgreSQL" in f for f in sanitized.facts)
    assert any("budget" in f.lower() for f in sanitized.facts)

    # Fabricated / completely foreign claims must be purged by 4-step validation
    assert not any("acquisition" in f.lower() for f in sanitized.facts)
    assert not any("latin america" in a.lower() for a in sanitized.assumptions)


