import pytest
from fastapi.testclient import TestClient

from app.schemas import (
    MatrixCriterion,
    MatrixOption,
    MatrixScoreItem,
)
from app.services.framework_engine import (
    calculate_decision_tree_expected_values,
    validate_and_calculate_matrix_scores,
    DecisionTreeNode,
    DecisionTreeBranch,
    detect_candidate_options,
)


# ==========================================
# Fixtures
# ==========================================

@pytest.fixture
def auth_headers(client: TestClient):
    """Register and login a test user, returning auth headers."""
    email = "framework_user@decisionlens.ai"
    password = "SecurePassword123!"
    client.post("/api/auth/register", json={"email": email, "password": password})
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_decision_id(client: TestClient, auth_headers: dict):
    """Create a test folder and decision with substantive context."""
    folder_res = client.post(
        "/api/folders",
        json={"name": "Architecture Workspace", "description": "Cloud decisions"},
        headers=auth_headers,
    )
    fid = folder_res.json()["id"]

    dec_res = client.post(
        "/api/decisions",
        json={
            "folder_id": fid,
            "title": "Migrate Monolith to Managed Microservices",
            "problem_statement": "System encounters performance bottlenecks and high latency under peak traffic due to shared monolithic database.",
            "description": "Evaluating whether to migrate to managed Kubernetes microservices vs modular monolith refactoring.",
            "language": "en",
        },
        headers=auth_headers,
    )
    return dec_res.json()["id"]


# ==========================================
# 1. Deterministic Scoring Unit Tests
# ==========================================

def test_deterministic_matrix_scoring_math():
    """Verify exact weighted sum formula: sum(weight * rating) / 100."""
    criteria = [
        MatrixCriterion(id="c1", name="Cost", weight=40.0),
        MatrixCriterion(id="c2", name="Speed", weight=60.0),
    ]
    options = [
        MatrixOption(id="opt1", name="Option 1"),
        MatrixOption(id="opt2", name="Option 2"),
    ]
    ratings = [
        MatrixScoreItem(option_id="opt1", criterion_id="c1", rating=8.0),
        MatrixScoreItem(option_id="opt1", criterion_id="c2", rating=6.0),
        MatrixScoreItem(option_id="opt2", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="opt2", criterion_id="c2", rating=9.0),
    ]

    # Opt1 score: (40 * 8.0 + 60 * 6.0) / 100 = (320 + 360) / 100 = 6.80
    # Opt2 score: (40 * 5.0 + 60 * 9.0) / 100 = (200 + 540) / 100 = 7.40
    results, winner_id, winner_name = validate_and_calculate_matrix_scores(
        criteria=criteria, options=options, ratings=ratings, scale_min=1.0, scale_max=10.0
    )

    assert len(results) == 2
    # Option 2 should win
    assert winner_id == "opt2"
    assert winner_name == "Option 2"
    assert results[0].option_id == "opt2"
    assert results[0].weighted_score == 7.4
    assert results[0].rank == 1
    assert results[1].option_id == "opt1"
    assert results[1].weighted_score == 6.8
    assert results[1].rank == 2


def test_deterministic_decision_tree_ev_calculation():
    """Verify deterministic Expected Value: sum(P_i * Payoff_i) when valid probabilities sum to 1.0."""
    nodes = [
        DecisionTreeNode(
            node_id="n1",
            node_type="decision",
            label="Launch Strategy",
            branches=[
                DecisionTreeBranch(
                    branch_id="b1",
                    label="Cloud Native",
                    probability=None,
                    outcome_description="Cloud fork",
                    sub_branches=[
                        DecisionTreeBranch(
                            branch_id="b1_high",
                            label="High Adoption",
                            probability=0.70,
                            payoff=100.0,
                            outcome_description="Strong revenue",
                        ),
                        DecisionTreeBranch(
                            branch_id="b1_low",
                            label="Low Adoption",
                            probability=0.30,
                            payoff=20.0,
                            outcome_description="Weak revenue",
                        ),
                    ],
                ),
                DecisionTreeBranch(
                    branch_id="b2",
                    label="On-Premises",
                    probability=None,
                    outcome_description="On prem fork",
                    sub_branches=[
                        DecisionTreeBranch(
                            branch_id="b2_high",
                            label="High Adoption",
                            probability=0.50,
                            payoff=60.0,
                            outcome_description="Moderate revenue",
                        ),
                        DecisionTreeBranch(
                            branch_id="b2_low",
                            label="Low Adoption",
                            probability=0.50,
                            payoff=40.0,
                            outcome_description="Flat revenue",
                        ),
                    ],
                ),
            ],
        )
    ]

    # EV(Cloud Native) = 0.70 * 100 + 0.30 * 20 = 70 + 6 = 76.0
    # EV(On-Premises)  = 0.50 * 60 + 0.50 * 40 = 30 + 20 = 50.0
    ev_dict, best_opt, has_probs = calculate_decision_tree_expected_values(nodes)

    assert has_probs is True
    assert ev_dict["Cloud Native"] == 76.0
    assert ev_dict["On-Premises"] == 50.0
    assert best_opt == "Cloud Native"


# ==========================================
# 2. Invalid Weights & Negative Weight Tests
# ==========================================

def test_matrix_invalid_weights_sum_less_than_100():
    """Weights summing to 80 (not 100) must raise ValueError."""
    criteria = [
        MatrixCriterion(id="c1", name="Cost", weight=40.0),
        MatrixCriterion(id="c2", name="Speed", weight=40.0),  # Sum = 80.0
    ]
    options = [MatrixOption(id="o1", name="A"), MatrixOption(id="o2", name="B")]
    ratings = [
        MatrixScoreItem(option_id="o1", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="o1", criterion_id="c2", rating=5.0),
        MatrixScoreItem(option_id="o2", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="o2", criterion_id="c2", rating=5.0),
    ]

    with pytest.raises(ValueError, match="Criteria weights must strictly sum to 100"):
        validate_and_calculate_matrix_scores(criteria, options, ratings)


def test_matrix_invalid_weights_sum_greater_than_100():
    """Weights summing to 120 (not 100) must raise ValueError."""
    criteria = [
        MatrixCriterion(id="c1", name="Cost", weight=70.0),
        MatrixCriterion(id="c2", name="Speed", weight=50.0),  # Sum = 120.0
    ]
    options = [MatrixOption(id="o1", name="A"), MatrixOption(id="o2", name="B")]
    ratings = [
        MatrixScoreItem(option_id="o1", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="o1", criterion_id="c2", rating=5.0),
        MatrixScoreItem(option_id="o2", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="o2", criterion_id="c2", rating=5.0),
    ]

    with pytest.raises(ValueError, match="Criteria weights must strictly sum to 100"):
        validate_and_calculate_matrix_scores(criteria, options, ratings)


# ==========================================
# 3. Missing Data & Rating Boundary Tests
# ==========================================

def test_matrix_missing_option_rating():
    """Missing rating for an option-criterion pair must raise ValueError."""
    criteria = [
        MatrixCriterion(id="c1", name="Cost", weight=50.0),
        MatrixCriterion(id="c2", name="Speed", weight=50.0),
    ]
    options = [MatrixOption(id="o1", name="A"), MatrixOption(id="o2", name="B")]
    # Only 3 ratings provided instead of 4
    ratings = [
        MatrixScoreItem(option_id="o1", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="o1", criterion_id="c2", rating=5.0),
        MatrixScoreItem(option_id="o2", criterion_id="c1", rating=5.0),
        # Missing (o2, c2)
    ]

    with pytest.raises(ValueError, match="Missing ratings"):
        validate_and_calculate_matrix_scores(criteria, options, ratings)


def test_matrix_rating_out_of_bounds():
    """Rating of 15.0 on a 1-10 scale must be rejected."""
    criteria = [
        MatrixCriterion(id="c1", name="Cost", weight=50.0),
        MatrixCriterion(id="c2", name="Speed", weight=50.0),
    ]
    options = [MatrixOption(id="o1", name="A"), MatrixOption(id="o2", name="B")]
    ratings = [
        MatrixScoreItem(option_id="o1", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="o1", criterion_id="c2", rating=15.0),  # > scale_max
        MatrixScoreItem(option_id="o2", criterion_id="c1", rating=5.0),
        MatrixScoreItem(option_id="o2", criterion_id="c2", rating=5.0),
    ]

    with pytest.raises(ValueError, match="outside allowed scale"):
        validate_and_calculate_matrix_scores(criteria, options, ratings, scale_min=1.0, scale_max=10.0)


def test_matrix_insufficient_options():
    """Only 1 option must raise ValueError (cannot rank against itself)."""
    criteria = [MatrixCriterion(id="c1", name="Cost", weight=100.0)]
    options = [MatrixOption(id="o1", name="A")]
    ratings = [MatrixScoreItem(option_id="o1", criterion_id="c1", rating=5.0)]

    with pytest.raises(ValueError, match="requires at least 2 distinct candidate options"):
        validate_and_calculate_matrix_scores(criteria, options, ratings)


# ==========================================
# 4. Strict Invariants: No Invented Probabilities / Root Causes
# ==========================================

def test_decision_tree_never_invents_probabilities():
    """Unstated probabilities must remain None; EV must not be fabricated."""
    nodes = [
        DecisionTreeNode(
            node_id="n1",
            node_type="decision",
            label="Fork",
            branches=[
                DecisionTreeBranch(
                    branch_id="b1",
                    label="Choice A",
                    probability=None,  # Not provided
                    outcome_description="Unknown branch",
                    sub_branches=[
                        DecisionTreeBranch(
                            branch_id="b1_sub",
                            label="Scenario 1",
                            probability=None,  # Never invented!
                            payoff=50.0,
                            outcome_description="Result",
                        )
                    ],
                )
            ],
        )
    ]
    ev_dict, best_opt, has_probs = calculate_decision_tree_expected_values(nodes)
    assert has_probs is False
    assert ev_dict == {}
    assert best_opt is None


# ==========================================
# 5. Full Framework Outputs & Selection API Integration Tests
# ==========================================

def test_evaluate_all_frameworks_api(client: TestClient, auth_headers: dict, test_decision_id: int):
    """POST /api/decisions/{id}/analysis evaluates and returns all 5 frameworks."""
    res = client.post(
        f"/api/decisions/{test_decision_id}/analysis",
        headers=auth_headers,
        json={"force_mock": True},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["decision_id"] == test_decision_id
    assert len(data["selected_frameworks"]) == 5

    # 1. Six Hats Output Verification
    assert data["six_hats"] is not None
    assert data["six_hats"]["applicable"] is True
    hats = data["six_hats"]["hats"]
    for hat_name in ["white", "red", "black", "yellow", "green", "blue"]:
        assert hat_name in hats
        assert len(hats[hat_name]["points"]) > 0
        assert hats[hat_name]["key_takeaway"] is not None

    # 2. SWOT Output Verification
    assert data["swot"] is not None
    assert data["swot"]["applicable"] is True
    assert len(data["swot"]["strengths"]) > 0
    assert len(data["swot"]["weaknesses"]) > 0
    assert len(data["swot"]["opportunities"]) > 0
    assert len(data["swot"]["threats"]) > 0
    assert len(data["swot"]["strategic_implications"]) > 0

    # 3. Decision Matrix Output Verification
    assert data["decision_matrix"] is not None
    assert data["decision_matrix"]["applicable"] is True
    matrix = data["decision_matrix"]
    total_w = sum(c["weight"] for c in matrix["criteria"])
    assert abs(total_w - 100.0) < 0.1
    assert len(matrix["options"]) >= 2
    assert len(matrix["results"]) >= 2
    assert matrix["winner_option_id"] is not None
    assert matrix["results"][0]["rank"] == 1

    # 4. Five Whys Output Verification
    assert data["five_whys"] is not None
    assert data["five_whys"]["applicable"] is True
    whys = data["five_whys"]
    assert len(whys["steps"]) == 5
    assert whys["steps"][0]["step_number"] == 1
    assert whys["root_cause"] is not None
    # Strict invariant: root cause unverified if based on diagnostic assumptions
    assert whys["is_root_cause_verified"] is False
    assert len(whys["countermeasures"]) > 0

    # 5. Decision Tree Output Verification
    assert data["decision_tree"] is not None
    assert data["decision_tree"]["applicable"] is True
    tree = data["decision_tree"]
    assert len(tree["nodes"]) > 0
    # Strict invariant: probabilities are not invented, so has_deterministic_probabilities is False
    assert tree["has_deterministic_probabilities"] is False
    assert "not fabricated" in tree["probabilities_note"].lower()


def test_framework_selection_subset(client: TestClient, auth_headers: dict, test_decision_id: int):
    """Allow framework selection: user requests only Six Hats and SWOT."""
    res = client.post(
        f"/api/decisions/{test_decision_id}/analysis",
        headers=auth_headers,
        json={"selected_frameworks": ["six_hats", "swot"], "force_mock": True},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["selected_frameworks"] == ["six_hats", "swot"]
    assert data["six_hats"] is not None
    assert data["swot"] is not None
    assert data["decision_matrix"] is None
    assert data["five_whys"] is None
    assert data["decision_tree"] is None


def test_get_framework_analysis_persistence(client: TestClient, auth_headers: dict, test_decision_id: int):
    """GET /api/decisions/{id}/analysis returns stored analysis after execution."""
    # Execute analysis first
    client.post(
        f"/api/decisions/{test_decision_id}/analysis",
        headers=auth_headers,
        json={"force_mock": True},
    )

    # Fetch via GET
    get_res = client.get(
        f"/api/decisions/{test_decision_id}/analysis",
        headers=auth_headers,
    )
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["decision_id"] == test_decision_id
    assert data["six_hats"]["applicable"] is True


def test_matrix_evaluate_direct_endpoint(client: TestClient, auth_headers: dict, test_decision_id: int):
    """POST /api/decisions/{id}/analysis/matrix/evaluate performs standalone deterministic calculation."""
    payload = {
        "scale_min": 1.0,
        "scale_max": 10.0,
        "criteria": [
            {"id": "c1", "name": "Performance", "weight": 50.0},
            {"id": "c2", "name": "Simplicity", "weight": 50.0},
        ],
        "options": [
            {"id": "o_micro", "name": "Microservices"},
            {"id": "o_mono", "name": "Monolith"},
        ],
        "ratings": [
            {"option_id": "o_micro", "criterion_id": "c1", "rating": 9.0},
            {"option_id": "o_micro", "criterion_id": "c2", "rating": 5.0},
            {"option_id": "o_mono", "criterion_id": "c1", "rating": 6.0},
            {"option_id": "o_mono", "criterion_id": "c2", "rating": 9.0},
        ],
    }

    # Microservices: 50 * 9 + 50 * 5 = 700 / 100 = 7.0
    # Monolith:      50 * 6 + 50 * 9 = 750 / 100 = 7.5 (Winner)
    res = client.post(
        f"/api/decisions/{test_decision_id}/analysis/matrix/evaluate",
        headers=auth_headers,
        json=payload,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["total_weight"] == 100.0
    assert data["winner_option_id"] == "o_mono"
    assert data["results"][0]["option_name"] == "Monolith"
    assert data["results"][0]["weighted_score"] == 7.5


def test_cross_user_analysis_isolation(client: TestClient, auth_headers: dict, test_decision_id: int):
    """User B cannot access or trigger analysis on User A's decision."""
    # Register User B
    client.post("/api/auth/register", json={"email": "user_b_fw@decisionlens.ai", "password": "Password123!"})
    b_login = client.post("/api/auth/login", json={"email": "user_b_fw@decisionlens.ai", "password": "Password123!"})
    b_token = b_login.json()["access_token"]
    b_headers = {"Authorization": f"Bearer {b_token}"}

    res = client.post(
        f"/api/decisions/{test_decision_id}/analysis",
        headers=b_headers,
        json={"force_mock": True},
    )
    assert res.status_code == 404


def test_detect_candidate_options_from_stage3_gaps():
    """Gaps' affected_options are harvested with high fidelity."""
    decision_gaps = {
        "gaps": [
            {"id": "g1", "question": "Cost?", "affected_options": ["AWS Fargate", "Google Cloud Run"]},
            {"id": "g2", "question": "Security?", "affected_options": ["Google Cloud Run", "Azure Container Apps"]},
        ]
    }
    options = detect_candidate_options(
        context_text="",
        structured_points={},
        problem_statement="Evaluate serverless container platforms",
        decision_gaps=decision_gaps,
    )
    assert options == ["AWS Fargate", "Google Cloud Run", "Azure Container Apps"]


def test_detect_candidate_options_case_insensitive_deduplication():
    """Duplicate candidate options with differing cases or spacing are unified."""
    decision_gaps = {
        "gaps": [
            {"id": "g1", "affected_options": ["AWS", "aws", "  AWS  "]},
            {"id": "g2", "affected_options": ["GCP", "gcp"]},
        ]
    }
    options = detect_candidate_options(
        context_text="",
        structured_points={},
        problem_statement="Choose cloud provider",
        decision_gaps=decision_gaps,
    )
    assert options == ["AWS", "GCP"]


def test_detect_candidate_options_union_with_text():
    """Gaps options union cleanly with explicit text detection without dropping third choices."""
    decision_gaps = {
        "gaps": [
            {"id": "g1", "affected_options": ["AWS Fargate", "Google Cloud Run"]},
        ]
    }
    options = detect_candidate_options(
        context_text="Evaluating microservices architecture vs monolith",
        structured_points={},
        problem_statement="Comparing deployments",
        decision_gaps=decision_gaps,
    )
    # Gap options come first, followed by detected text options
    assert "AWS Fargate" in options
    assert "Google Cloud Run" in options
    assert "Microservices Architecture" in options


def test_detect_candidate_options_empty_gaps_fallback():
    """When gaps produce no options, fallback to context text detection works as before."""
    options = detect_candidate_options(
        context_text="Evaluating whether to build in-house or buy commercial vendor.",
        structured_points={},
        problem_statement="Vendor procurement",
        decision_gaps={"gaps": []},
    )
    assert options == ["Build In-House", "Purchase Commercial Vendor"]


def test_decision_matrix_inherits_gap_affected_options_via_api(
    client: TestClient,
    auth_headers: dict,
    test_decision_id: int,
):
    """The Decision Matrix API generates options inheriting from Stage 3 gaps."""
    # 1. Trigger gaps detection on the decision
    client.post(
        f"/api/decisions/{test_decision_id}/gaps",
        headers=auth_headers,
        json={"force_mock": True},
    )

    # 2. Trigger framework evaluation
    res = client.post(
        f"/api/decisions/{test_decision_id}/analysis",
        headers=auth_headers,
        json={"selected_frameworks": ["decision_matrix"], "force_mock": True},
    )
    assert res.status_code == 200
    data = res.json()
    matrix = data["decision_matrix"]
    assert matrix is not None
    assert matrix["applicable"] is True

    # Options in matrix should be populated with options matching the decision's gaps or context
    matrix_opt_names = [o["name"] for o in matrix["options"]]
    assert len(matrix_opt_names) >= 2
    # Verify results and ratings exist for all generated options
    assert len(matrix["results"]) == len(matrix["options"])
    assert matrix["winner_option_name"] in matrix_opt_names


def test_curated_methodology_ensemble_recommendation(client: TestClient, auth_headers: dict, test_decision_id: int):
    """Verify that the engine recommends N complementary techniques with validation reasons and methodology rationale."""
    res = client.post(
        f"/api/decisions/{test_decision_id}/analysis",
        headers=auth_headers,
        json={"force_mock": True},
    )
    assert res.status_code == 200
    data = res.json()
    assert "recommended_techniques" in data
    assert len(data["recommended_techniques"]) >= 2
    for tech in data["recommended_techniques"]:
        assert "framework_id" in tech
        assert "role" in tech
        assert "role_label" in tech
        assert "validation_reason" in tech
        assert len(tech["validation_reason"]) > 10
        assert tech["priority"] >= 1
    assert data["methodology_rationale"] is not None
    assert len(data["methodology_rationale"]) > 15


def test_cloud_detection_preserves_third_alternative_status_quo():
    """Verify that cloud infrastructure detection generates all 3 alternatives including status quo."""
    from app.services.framework_engine import detect_candidate_options

    # Case 1: Generic cloud vs on-premise inquiry
    options = detect_candidate_options(
        context_text="Evaluating whether to migrate our core production infrastructure to the cloud or stay on-premise.",
        structured_points={},
        problem_statement="Should we migrate production infrastructure to the cloud?",
        decision_gaps=None,
    )
    assert len(options) >= 3
    assert "Public Cloud Deployment" in options
    assert "Hybrid On-Premises Setup" in options
    assert "Continue / Upgrade Existing On-Premises Infrastructure" in options

    # Case 2: Explicit 3 alternatives supplied in problem statement
    explicit_statement = (
        "Should we migrate production infrastructure to the cloud?\n"
        "1. Full Public Cloud Migration\n"
        "2. Hybrid Cloud Deployment\n"
        "3. Upgrade Existing On-Premises Infrastructure"
    )
    explicit_options = detect_candidate_options(
        context_text="",
        structured_points={},
        problem_statement=explicit_statement,
        decision_gaps=None,
    )
    assert len(explicit_options) >= 3
    assert any("Public Cloud" in opt for opt in explicit_options)
    assert any("Hybrid" in opt for opt in explicit_options)
    assert any("Existing" in opt or "On-Premises" in opt for opt in explicit_options)


def test_mock_rating_engine_scores_criteria_independently():
    """
    Verify mock rating engine evaluates each criterion independently:
    - Public Cloud gets higher Scalability than Cost (due to egress fees/variable opex).
    - Ratings vary across Security, Cost, Scalability, and Reliability rather than returning identical base scores.
    - No fabricated synthetic IDs like fact_1 or ev_1_1.
    """
    from app.services.framework_engine import (
        build_domain_grounded_criteria,
        create_stable_matrix_options,
        build_grounded_ratings,
    )
    from app.schemas import DecisionDomain

    criteria = build_domain_grounded_criteria(DecisionDomain.SOFTWARE.value)
    options = create_stable_matrix_options([
        "Public Cloud Deployment",
        "Hybrid On-Premises Setup",
        "Continue / Upgrade Existing On-Premises Infrastructure",
    ])

    structured_points = {
        "pros": [
            "Public Cloud provides automated auto-scaling and elastic throughput for peak loads.",
            "On-Premises provides predictable hardware depreciation with zero monthly bandwidth egress fees.",
        ],
        "cons": [
            "Public Cloud has variable monthly opex with unpredictable data egress bandwidth billing.",
            "On-Premises has 6-month hardware procurement lead times limiting elastic scalability.",
        ],
        "facts": [
            "Current on-premises servers are 80% utilized.",
        ],
    }

    ratings = build_grounded_ratings(
        options=options,
        criteria=criteria,
        structured_points=structured_points,
        raw_context="Infrastructure migration evaluation",
        domain=DecisionDomain.SOFTWARE.value,
    )

    # 1. Verify no fake synthetic IDs (no 'fact_1' or 'ev_1_1')
    for r in ratings:
        for fid in r.supporting_finding_ids:
            assert not fid.startswith("fact_"), f"Synthetic ID '{fid}' found in supporting_finding_ids"
        for eid in r.supporting_evidence_ids:
            assert not eid.startswith("ev_"), f"Synthetic ID '{eid}' found in supporting_evidence_ids"

    # 2. Verify independent criteria scoring: Cloud Scalability vs Cloud Cost
    cloud_ratings = {r.criterion_id: r for r in ratings if r.option_id == "OPT_001"}
    cloud_scale = cloud_ratings["crit_sw_scale"]
    cloud_cost = cloud_ratings["crit_sw_cost"]

    # Scalability should be noticeably higher than Cost for Public Cloud
    assert cloud_scale.rating > cloud_cost.rating
    assert cloud_scale.rating >= 8.5
    assert cloud_cost.rating <= 6.5

    # 3. Verify On-Premises scores differently: Cost higher than Scalability
    onprem_ratings = {r.criterion_id: r for r in ratings if r.option_id == "OPT_003"}
    onprem_scale = onprem_ratings["crit_sw_scale"]
    onprem_cost = onprem_ratings["crit_sw_cost"]

    assert onprem_cost.rating > onprem_scale.rating
    assert onprem_cost.rating >= 7.5
    assert onprem_scale.rating <= 6.0


def test_missing_ai_ratings_not_silently_six(client: TestClient, auth_headers: dict, test_decision_id: int):
    """
    Verify that when AI decision matrix response omits an option-criterion rating:
    - It does NOT silently become a verified 6.0.
    - Missing cells are flagged with status='insufficient_evidence' and [UNRATED IN AI OUTPUT].
    - Matrix sensitivity notes include a clear warning about unrated pairs.
    """
    import json
    from unittest.mock import patch

    # Mock AI response with an intentionally missing rating for OPT_002 on crit_sw_cost
    mock_ai_payload = {
        "recommended_framework": "decision_matrix",
        "methodology_rationale": "Multi-criteria trade-off comparison.",
        "recommended_techniques": [
            {
                "framework_id": "decision_matrix",
                "role": "primary_evaluation",
                "role_label": "Primary Decision Matrix",
                "validation_reason": "Evaluates architectural trade-offs.",
                "priority": 1,
            }
        ],
        "decision_matrix": {
            "applicable": True,
            "inapplicability_reason": None,
            "criteria": [
                {"id": "crit_sw_scale", "name": "Scalability & Reliability", "weight": 50.0, "description": "Scale"},
                {"id": "crit_sw_cost", "name": "Infrastructure & TCO", "weight": 50.0, "description": "Cost"},
            ],
            "options": [
                {"id": "opt_1", "name": "Public Cloud Deployment", "description": "Cloud"},
                {"id": "opt_2", "name": "On-Premises Infrastructure", "description": "On-Prem"},
            ],
            # Note: Omit (opt_2, crit_sw_cost) entirely!
            "ratings": [
                {"option_id": "opt_1", "criterion_id": "crit_sw_scale", "rating": 9.0, "reason": "Elastic"},
                {"option_id": "opt_1", "criterion_id": "crit_sw_cost", "rating": 5.5, "reason": "Opex"},
                {"option_id": "opt_2", "criterion_id": "crit_sw_scale", "rating": 5.0, "reason": "Fixed"},
            ],
        },
    }

    with patch("app.services.framework_engine.run_ai_framework_evaluation", return_value=mock_ai_payload):
        res = client.post(
            f"/api/decisions/{test_decision_id}/analysis",
            headers=auth_headers,
            json={"selected_frameworks": ["decision_matrix"], "force_mock": False},
        )
        assert res.status_code == 200
        data = res.json()
        matrix = data["decision_matrix"]
        assert matrix is not None

        # Find the omitted rating: (opt_2, crit_sw_cost)
        omitted_rating = next(
            (r for r in matrix["ratings"] if r["option_id"] == "opt_2" and r["criterion_id"] == "crit_sw_cost"),
            None,
        )
        assert omitted_rating is not None
        # It must NOT be a silent verified 6.0
        assert omitted_rating["status"] == "insufficient_evidence"
        assert "[UNRATED IN AI OUTPUT]" in omitted_rating["reason"]

        # Sensitivity notes must warn the user
        assert "Warning" in matrix["sensitivity_notes"]
        assert "unrated in the model response" in matrix["sensitivity_notes"]


def test_stage4_incorporates_resolved_gaps_and_research_evidence():
    """
    Verify that Stage 4 receives resolved gap answers and verified research claims:
    - In fallback scoring, resolved gap answers and research claims directly influence criterion ratings.
    - gap_ids and research evidence_ids are preserved in ratings provenance.
    - Stage 2 structured points remain immutable.
    """
    from app.services.framework_engine import (
        build_domain_grounded_criteria,
        create_stable_matrix_options,
        build_grounded_ratings,
    )
    from app.schemas import DecisionDomain

    criteria = build_domain_grounded_criteria(DecisionDomain.SOFTWARE.value)
    options = create_stable_matrix_options([
        "Public Cloud Deployment",
        "Hybrid On-Premises Setup",
        "Continue / Upgrade Existing On-Premises Infrastructure",
    ])

    structured_points = {
        "facts": ["Current datacenter utilization is 85%."],
        "pros": ["Public Cloud offers auto-scaling."],
        "cons": ["Public Cloud has unpredictable bandwidth egress costs."],
    }
    points_before = dict(structured_points)

    decision_gaps = {
        "gaps": [
            {
                "id": "gap_egress_budget",
                "question": "What is the annual egress budget cap?",
                "status": "answered",
                "resolved_answer": "Annual egress bandwidth budget is capped at ₹15 lakh with 99.999% SLA approved.",
                "affected_options": ["Public Cloud Deployment"],
            }
        ]
    }

    research_data = {
        "research": [
            {
                "gap_id": "gap_egress_budget",
                "claims": [
                    {
                        "id": "claim_sla_benchmark",
                        "claim_text": "Verified public cloud multi-region latency is under 30ms with 99.999% SLA guaranteed.",
                        "source_title": "Official Cloud SLA Documentation",
                        "reliability_label": "primary_source",
                    }
                ]
            }
        ]
    }

    ratings = build_grounded_ratings(
        options=options,
        criteria=criteria,
        structured_points=structured_points,
        decision_gaps=decision_gaps,
        raw_context="Core production infrastructure evaluation",
        domain=DecisionDomain.SOFTWARE.value,
        research_data=research_data,
    )

    # 1. Verify Stage 2 structured points were NOT mutated
    assert structured_points == points_before

    # 2. Verify that resolved gap and research claims influenced Public Cloud ratings and IDs
    cloud_ratings = {r.criterion_id: r for r in ratings if r.option_id == "OPT_001"}
    cloud_scale = cloud_ratings["crit_sw_scale"]
    cloud_cost = cloud_ratings["crit_sw_cost"]

    # Gap answer and research claim were cited in provenance
    assert "gap_egress_budget" in cloud_cost.supporting_gap_ids or "gap_egress_budget" in cloud_scale.supporting_gap_ids
    assert "claim_sla_benchmark" in cloud_scale.supporting_evidence_ids
    assert cloud_scale.status == "justified"
    assert cloud_scale.rating >= 9.0



