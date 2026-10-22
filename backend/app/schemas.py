import re
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator


# ==========================================
# User & Auth Schemas
# ==========================================

class UserBase(BaseModel):
    email: EmailStr


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(
        ...,
        min_length=8,
        description="Password must be at least 8 characters long",
    )

    @field_validator("password")
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit.")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_=+[\]/\\`~]", v):
            raise ValueError("Password must contain at least one special character.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==========================================
# Folder Schemas
# ==========================================

class FolderBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = ""
    color: Optional[str] = "#4F46E5"


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = None
    color: Optional[str] = None


class FolderResponse(FolderBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime
    decision_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Decision Schemas
# ==========================================

class DecisionBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = ""
    problem_statement: Optional[str] = ""
    record_type: Optional[str] = Field("decision", description="'decision' or 'meeting'")
    status: Optional[str] = Field("draft", description="'draft', 'evaluating', 'decided', or 'archived'")
    language: Optional[str] = Field("en", description="'en' or 'hi'")


class DecisionCreate(DecisionBase):
    folder_id: int


class DecisionUpdate(BaseModel):
    folder_id: Optional[int] = None
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    problem_statement: Optional[str] = None
    record_type: Optional[str] = None
    status: Optional[str] = None
    language: Optional[str] = None
    raw_input: Optional[str] = None


class DecisionResponse(DecisionBase):
    id: int
    owner_id: int
    folder_id: int
    raw_input: str
    transcript: str
    transcript_reviewed: bool
    points: Dict[str, Any]
    points_reviewed: bool = False
    gaps: Dict[str, Any]
    research: Dict[str, Any]
    analysis: Dict[str, Any]
    recommendation: Dict[str, Any]
    roadmap: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Attachment Schemas
# ==========================================

class AttachmentResponse(BaseModel):
    id: int
    owner_id: int
    decision_id: int
    original_name: str
    media_type: str
    file_size: int
    extracted_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Audio & Transcription Schemas (Phase 5)
# ==========================================

class AudioRecordingResponse(BaseModel):
    id: int
    owner_id: int
    decision_id: int
    original_filename: str
    media_type: str
    file_size: int
    duration_seconds: Optional[float] = None
    language: str
    used_enhanced: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TranscriptUpdate(BaseModel):
    transcript: str = Field(..., description="Edited transcript text")
    mark_reviewed: bool = Field(True, description="Whether to mark transcript as reviewed")


class TranscriptionResponse(BaseModel):
    transcript: str
    language: str
    transcript_reviewed: bool
    used_enhanced: bool
    audio_id: Optional[int] = None
    audio_recording: Optional[AudioRecordingResponse] = None
    message: Optional[str] = None


# ==========================================
# Input Structuring Schemas (Phase 6)
# ==========================================

class PrivateTranscriptFeedback(BaseModel):
    tone_observations: str = Field(
        "", description="Assessment of discussion tone, emotional intensity, or conversational dynamics"
    )
    potential_biases: List[str] = Field(
        default_factory=list, description="Detected cognitive biases with brief contextual notes"
    )
    clarity_rating: str = Field(
        "Medium", description="Estimated clarity of problem formulation: High, Medium, or Low"
    )
    feedback_notes: str = Field(
        "", description="Private coaching notes and recommendations to refine the decision basis"
    )


class StructuredFindings(BaseModel):
    facts: List[str] = Field(
        default_factory=list, description="Concrete verified facts, metrics, and hard constraints"
    )
    assumptions: List[str] = Field(
        default_factory=list, description="Unverified hypotheses, untested premises, projections"
    )
    feelings: List[str] = Field(
        default_factory=list, description="Emotional reactions, team sentiment, gut instincts, and morale concerns"
    )
    pros: List[str] = Field(
        default_factory=list, description="Strengths, positive benefits, and favorable outcomes"
    )
    cons: List[str] = Field(
        default_factory=list, description="Downsides, negative risks, drawbacks, and limitations"
    )
    mixed_points: List[str] = Field(
        default_factory=list, description="Nuanced trade-offs containing both upside and downside"
    )
    contradictions: List[str] = Field(
        default_factory=list, description="Conflicting statements or opposing claims found in the inputs"
    )
    unknowns: List[str] = Field(
        default_factory=list, description="Missing data, unanswered questions, and open uncertainties"
    )
    private_feedback: Optional[PrivateTranscriptFeedback] = Field(
        default_factory=PrivateTranscriptFeedback, description="Private feedback on inputs/transcript"
    )
    summary: str = Field("", description="Objective summary of the input data")
    reviewed: bool = Field(False, description="Whether the user has reviewed and approved these findings")
    reviewed_at: Optional[datetime] = None


class StructuringUpdate(BaseModel):
    facts: Optional[List[str]] = None
    assumptions: Optional[List[str]] = None
    feelings: Optional[List[str]] = None
    pros: Optional[List[str]] = None
    cons: Optional[List[str]] = None
    mixed_points: Optional[List[str]] = None
    contradictions: Optional[List[str]] = None
    unknowns: Optional[List[str]] = None
    private_feedback: Optional[PrivateTranscriptFeedback] = None
    summary: Optional[str] = None
    mark_reviewed: bool = Field(True, description="Whether to mark the findings as reviewed")


class StructuringResponse(BaseModel):
    decision_id: int
    findings: StructuredFindings
    points_reviewed: bool
    source_summary: Optional[str] = None
    message: Optional[str] = None


# ==========================================
# Gap Detection & Resolution Schemas (Phase 7)
# ==========================================

class GapItem(BaseModel):
    id: str = Field(..., description="Unique gap identifier (e.g. gap_1)")
    question: str = Field(..., description="Targeted question to resolve the information deficit")
    reason: str = Field(..., description="Explanation of why this information matters for the decision")
    importance: str = Field(
        ..., description="'critical', 'high', 'medium', or 'low'"
    )
    priority_score: int = Field(1, description="Numerical priority rank (1 is highest)")
    affected_options: List[str] = Field(
        default_factory=list, description="Alternative decision options impacted by this uncertainty"
    )
    recommended_resolution_method: str = Field(
        "ask_user", description="'ask_user' (internal/preference) or 'web_research' (external/benchmark facts)"
    )
    status: str = Field(
        "pending", description="'pending', 'answered', 'skipped', 'research_queued', or 'researched'"
    )
    answer: Optional[str] = Field(None, description="User-provided answer or research synthesis")
    research_query: Optional[str] = Field(None, description="Validated web research query")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GapAnswerRequest(BaseModel):
    answer: Optional[str] = Field(None, description="User's answer to the gap question")
    skip: bool = Field(False, description="If true, marks the gap as skipped and keeps it as unknown")


class GapResearchRequest(BaseModel):
    resolution_method: str = Field(
        "web_research", description="Must be 'web_research' (strictly validated)"
    )
    custom_query: Optional[str] = Field(
        None, description="Optional custom search query. If omitted, derived from question"
    )
    execute: bool = Field(
        False, description="Whether to execute web research immediately (Phase 8). Default False preserves queue flow."
    )
    force_mock: bool = Field(
        False, description="Force deterministic mock search provider for testing"
    )


class GapsResponse(BaseModel):
    decision_id: int
    gaps: List[GapItem]
    detected_at: Optional[str] = None
    total_gaps: int = 0
    pending_count: int = 0
    answered_count: int = 0
    skipped_count: int = 0
    research_queued_count: int = 0
    researched_count: int = 0
    message: Optional[str] = None


# ==========================================
# External Web Search & Research Schemas (Phase 8)
# ==========================================

class ResearchSourceItem(BaseModel):
    source_title: str = Field(..., description="Title of the retrieved web page or document")
    url: str = Field(..., description="Direct URL of the source")
    retrieval_timestamp: str = Field(..., description="ISO 8601 UTC timestamp of retrieval")
    relevant_claims: List[str] = Field(
        default_factory=list, description="Factual claims and data snippets extracted from this source"
    )
    reliability_label: str = Field(
        "secondary_source",
        description="'primary_source', 'secondary_source', 'community_opinion', or 'low_confidence'",
    )


class ResearchClaimItem(BaseModel):
    claim: str = Field(..., description="Synthesized factual claim statement")
    sources_count: int = Field(1, description="Number of independent sources asserting this claim")
    evidence_type: str = Field("secondary_source", description="Predominant source classification")
    consensus: str = Field(
        "single_source",
        description="'corroborated', 'single_source', 'conflicting_evidence', or 'unsupported'",
    )
    is_verified: bool = Field(
        False,
        description="Strict invariant: True ONLY if corroborated/primary without conflict; False for unsupported or conflicting",
    )


class ResearchFindingItem(BaseModel):
    id: str = Field(..., description="Unique finding ID (e.g. res_gap_1)")
    gap_id: str = Field(..., description="Associated gap question identifier")
    question: str = Field(..., description="Target question that initiated the research")
    narrow_query: str = Field(..., description="Narrowly scoped query executed against search provider")
    synthesis: str = Field(..., description="Objective, citation-backed factual synthesis")
    consensus: str = Field(
        "single_source",
        description="Overall evidence consensus: 'corroborated', 'single_source', 'conflicting_evidence', or 'unsupported'",
    )
    is_verified: bool = Field(
        False, description="Strict verification state. Unsupported claims are NEVER marked True."
    )
    sources: List[ResearchSourceItem] = Field(
        default_factory=list, description="List of retrieved web sources"
    )
    claims: List[ResearchClaimItem] = Field(
        default_factory=list, description="Extracted claims with per-claim consensus and verification"
    )
    created_at: str = Field(..., description="ISO 8601 UTC creation timestamp")


class ResearchExecuteResponse(BaseModel):
    decision_id: int
    gap_id: str
    finding: ResearchFindingItem
    updated_gap: GapItem
    message: Optional[str] = None


class DecisionResearchResponse(BaseModel):
    decision_id: int
    requests: List[dict] = Field(default_factory=list)
    findings: List[ResearchFindingItem] = Field(default_factory=list)
    total_findings: int = 0


# ==========================================
# Thinking Frameworks Schemas (Phase 9)
# ==========================================

# --- 1. Six Thinking Hats ---
class HatPerspective(BaseModel):
    hat: str = Field(..., description="'white', 'red', 'black', 'yellow', 'green', or 'blue'")
    name: str = Field(..., description="Full hat name, e.g. 'White Hat (Facts & Information)'")
    color: str = Field(..., description="UI hex code or color token")
    focus: str = Field(..., description="Cognitive focus of this hat")
    points: List[str] = Field(default_factory=list, description="Extracted points from this perspective")
    key_takeaway: Optional[str] = Field(None, description="Primary takeaway from this hat")


class SixHatsAnalysis(BaseModel):
    applicable: bool = Field(True, description="Whether Six Hats is applicable to this decision")
    inapplicability_reason: Optional[str] = None
    hats: Dict[str, HatPerspective] = Field(default_factory=dict)
    synthesis: Optional[str] = Field(None, description="Overall synthesis across all 6 hats")


# --- 2. SWOT Analysis ---
class SWOTItem(BaseModel):
    id: str = Field(..., description="Unique item ID, e.g. s_1, w_1")
    text: str = Field(..., description="Description of the factor")
    impact: str = Field("medium", description="'high', 'medium', or 'low'")
    source_reference: Optional[str] = Field(None, description="Context source or citation")


class SWOTAnalysis(BaseModel):
    applicable: bool = Field(True, description="Whether SWOT is applicable to this decision")
    inapplicability_reason: Optional[str] = None
    strengths: List[SWOTItem] = Field(default_factory=list, description="Internal positive capabilities/assets")
    weaknesses: List[SWOTItem] = Field(default_factory=list, description="Internal negative gaps/limitations")
    opportunities: List[SWOTItem] = Field(default_factory=list, description="External positive trends/tailwinds")
    threats: List[SWOTItem] = Field(default_factory=list, description="External negative risks/headwinds")
    strategic_implications: List[str] = Field(
        default_factory=list, description="Cross-quadrant strategies (SO, WO, ST, WT)"
    )


# --- 3. Weighted Decision Matrix ---
class MatrixCriterion(BaseModel):
    id: str = Field(..., description="Unique criterion ID, e.g. crit_cost")
    name: str = Field(..., description="Criterion label, e.g. 'Implementation Cost'")
    weight: float = Field(..., ge=0, le=100, description="Criterion weight in % (must sum to 100)")
    description: Optional[str] = ""


class MatrixOption(BaseModel):
    id: str = Field(..., description="Unique option ID, e.g. opt_a")
    name: str = Field(..., description="Option label, e.g. 'Option A: Cloud Platform'")
    description: Optional[str] = ""


class MatrixScoreItem(BaseModel):
    option_id: str
    criterion_id: str
    rating: float = Field(..., description="Rating on agreed scale (e.g. 1.0 to 10.0)")
    notes: Optional[str] = None


class MatrixResultOption(BaseModel):
    option_id: str
    option_name: str
    weighted_score: float = Field(..., description="Deterministic weighted sum: sum(weight * rating) / 100")
    normalized_score: float = Field(..., description="Score normalized as percentage of maximum possible")
    rank: int = Field(..., description="Rank among options (1 is highest)")
    criteria_scores: Dict[str, float] = Field(default_factory=dict, description="Criterion ID -> raw rating")
    criteria_weighted_scores: Dict[str, float] = Field(default_factory=dict, description="Criterion ID -> (weight * rating) / 100")


class DecisionMatrixAnalysis(BaseModel):
    applicable: bool = Field(True, description="Whether Weighted Decision Matrix is applicable")
    inapplicability_reason: Optional[str] = None
    scale_min: float = Field(1.0, description="Minimum rating on scale")
    scale_max: float = Field(10.0, description="Maximum rating on scale")
    criteria: List[MatrixCriterion] = Field(default_factory=list)
    options: List[MatrixOption] = Field(default_factory=list)
    ratings: List[MatrixScoreItem] = Field(default_factory=list)
    results: List[MatrixResultOption] = Field(default_factory=list, description="Deterministic calculated scores and ranks")
    winner_option_id: Optional[str] = None
    winner_option_name: Optional[str] = None
    sensitivity_notes: Optional[str] = None


class MatrixEvaluationRequest(BaseModel):
    criteria: List[MatrixCriterion]
    options: List[MatrixOption]
    ratings: List[MatrixScoreItem]
    scale_min: float = 1.0
    scale_max: float = 10.0


class MatrixEvaluationResponse(BaseModel):
    valid: bool
    scale_min: float
    scale_max: float
    total_weight: float
    criteria: List[MatrixCriterion]
    options: List[MatrixOption]
    ratings: List[MatrixScoreItem]
    results: List[MatrixResultOption]
    winner_option_id: Optional[str] = None
    winner_option_name: Optional[str] = None


# --- 4. Five Whys ---
class WhyStep(BaseModel):
    step_number: int = Field(..., ge=1, le=5, description="Level of the why sequence (1 to 5)")
    why_question: str = Field(..., description="The specific iterative question: 'Why did [previous statement] occur?'")
    answer: str = Field(..., description="Answer grounded in facts or marked as unknown")
    is_known_fact: bool = Field(True, description="False if this step requires validation")
    evidence_reference: Optional[str] = Field(None, description="Direct quote or source from input context")


class FiveWhysAnalysis(BaseModel):
    applicable: bool = Field(True, description="Whether Five Whys is applicable")
    inapplicability_reason: Optional[str] = None
    problem_statement: str = Field(..., description="Starting symptom/incident statement")
    steps: List[WhyStep] = Field(default_factory=list, description="Sequential iterative whys")
    root_cause: Optional[str] = Field(
        None,
        description="Identified root cause. Invariant: Never invented; marked as 'Unverified Root Cause' if not directly proven"
    )
    is_root_cause_verified: bool = Field(False, description="True only if root cause is directly substantiated by facts")
    countermeasures: List[str] = Field(
        default_factory=list, description="Actionable countermeasures targeting the root cause"
    )


# --- 5. Decision Tree ---
class DecisionTreeBranch(BaseModel):
    branch_id: str
    label: str = Field(..., description="Action, branch name, or scenario")
    probability: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Probability (0.0 to 1.0). Invariant: Strictly None if unknown; never invented!"
    )
    is_probability_estimated: bool = Field(False, description="True if provided by user; False if unknown")
    payoff: Optional[float] = Field(None, description="Financial or utility payoff/value if available")
    payoff_unit: Optional[str] = Field(None, description="e.g. 'USD', 'Points', 'Hours'")
    outcome_description: str = Field(..., description="Scenario description")
    sub_branches: List["DecisionTreeBranch"] = Field(default_factory=list)


DecisionTreeBranch.model_rebuild()


class DecisionTreeNode(BaseModel):
    node_id: str
    node_type: str = Field(..., description="'decision', 'chance', or 'terminal'")
    label: str
    description: Optional[str] = ""
    branches: List[DecisionTreeBranch] = Field(default_factory=list)
    expected_value: Optional[float] = Field(
        None,
        description="Deterministic expected value. Strictly None if probabilities or payoffs are missing"
    )


class DecisionTreeAnalysis(BaseModel):
    applicable: bool = Field(True, description="Whether Decision Tree is applicable")
    inapplicability_reason: Optional[str] = None
    root_question: str = Field(..., description="Primary choice question")
    nodes: List[DecisionTreeNode] = Field(default_factory=list)
    has_deterministic_probabilities: bool = Field(
        False, description="True ONLY if valid probabilities summing to 1.0 are present"
    )
    expected_values_by_option: Dict[str, float] = Field(
        default_factory=dict, description="Option name/ID -> deterministic Expected Value"
    )
    probabilities_note: str = Field(
        ...,
        description="Explanation of probability status. Invariant: Highlights that unstated probabilities are not invented."
    )
    best_expected_value_option: Optional[str] = None


# --- Overall Framework Analysis Request & Response ---
class FrameworkAnalysisRequest(BaseModel):
    selected_frameworks: Optional[List[str]] = Field(
        None,
        description="Frameworks to run: 'six_hats', 'swot', 'decision_matrix', 'five_whys', 'decision_tree'. Null runs all."
    )
    matrix_custom_criteria: Optional[List[MatrixCriterion]] = None
    matrix_custom_options: Optional[List[MatrixOption]] = None
    matrix_custom_ratings: Optional[List[MatrixScoreItem]] = None
    force_mock: bool = Field(False, description="Force deterministic mock mode for testing")


class FrameworkAnalysisResponse(BaseModel):
    decision_id: int
    evaluated_at: str
    selected_frameworks: List[str]
    six_hats: Optional[SixHatsAnalysis] = None
    swot: Optional[SWOTAnalysis] = None
    decision_matrix: Optional[DecisionMatrixAnalysis] = None
    five_whys: Optional[FiveWhysAnalysis] = None
    decision_tree: Optional[DecisionTreeAnalysis] = None
    summary_insights: List[str] = Field(default_factory=list)
    message: Optional[str] = None


# ==========================================
# Phase 10: Final Decision Synthesis & Roadmap Schemas
# ==========================================

class AlternativeOption(BaseModel):
    name: str = Field(..., description="Name of option or alternative")
    description: str = Field(..., description="Brief overview of the alternative")
    pros: List[str] = Field(default_factory=list, description="Direct advantages")
    cons: List[str] = Field(default_factory=list, description="Downsides or risks")
    tradeoffs: str = Field(..., description="Strategic trade-offs involved")
    is_recommended: bool = Field(False, description="Whether this is the recommended path")
    why_not_recommended: Optional[str] = Field(None, description="Reason if not chosen or deferred")


class SupportingEvidenceItem(BaseModel):
    claim: str = Field(..., description="The factual claim supporting the synthesis")
    source_title: Optional[str] = Field(None, description="Actual cited source title (never invented)")
    source_url: Optional[str] = Field(None, description="Source URL if from research")
    evidence_type: str = Field("user_fact", description="'user_fact', 'research_claim', or 'framework_metric'")
    reliability: Optional[str] = Field(None, description="'high', 'medium', or 'low'")


class AssumptionItem(BaseModel):
    assumption: str = Field(..., description="Assumption statement")
    is_verified: bool = Field(False, description="True only if confirmed by facts or research")
    impact_if_false: str = Field(..., description="Potential consequence if this assumption fails")


class RiskMitigationItem(BaseModel):
    risk: str = Field(..., description="Identified threat or failure mode")
    severity: str = Field("medium", description="'low', 'medium', 'high', or 'critical'")
    mitigation: str = Field(..., description="Specific preventative action")
    contingency_plan: str = Field(..., description="Fallback action if risk materializes")


class CounterargumentItem(BaseModel):
    argument: str = Field(..., description="Steel-manned counterargument or objection")
    rebuttal_or_concession: str = Field(..., description="Rebuttal or thoughtful concession")


class ConfidenceAssessment(BaseModel):
    level: str = Field("medium", description="'high', 'medium', or 'low'")
    score: float = Field(0.75, ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0")
    rationale: str = Field(..., description="Why this confidence level was assigned")
    limitations: List[str] = Field(
        default_factory=list,
        description="Explicit limitations, unresolved unknowns, or missing information"
    )


class RoadmapTask(BaseModel):
    task_id: str = Field(..., description="Unique task identifier, e.g. task-1")
    title: str = Field(..., description="Short actionable task title")
    description: str = Field("", description="Detailed task requirements")
    owner_role: str = Field("Lead", description="Role or team responsible")
    timeline: str = Field("Week 1", description="Target timeframe or milestone")
    dependencies: List[str] = Field(default_factory=list, description="List of prerequisite task IDs")
    success_criteria: str = Field("", description="Objective completion definition")
    is_completed: bool = Field(False, description="Completion toggle")


class RoadmapPhase(BaseModel):
    phase_id: str = Field(..., description="Unique phase identifier, e.g. phase-1")
    title: str = Field(..., description="Phase title, e.g. Phase 1: Pre-Commitment & Pilot")
    timeline: str = Field("Week 1-2", description="Phase duration")
    description: str = Field("", description="Phase goal")
    tasks: List[RoadmapTask] = Field(default_factory=list, description="Ordered tasks for this phase")


class RoadmapData(BaseModel):
    title: str = Field("Implementation Roadmap", description="Roadmap title")
    phases: List[RoadmapPhase] = Field(default_factory=list)


class DecisionSynthesis(BaseModel):
    decision_id: int
    synthesis_type: str = Field(
        "recommendation",
        description="'recommendation' if decision is conclusive, or 'conditional_next_step' if critical unknowns remain"
    )
    headline: str = Field(..., description="Executive summary statement")
    recommendation_text: str = Field(..., description="Comprehensive strategic recommendation")
    conditional_triggers: List[str] = Field(
        default_factory=list,
        description="Conditions that must be met or triggers that pivot the path"
    )
    alternatives_considered: List[AlternativeOption] = Field(default_factory=list)
    supporting_evidence: List[SupportingEvidenceItem] = Field(default_factory=list)
    assumptions: List[AssumptionItem] = Field(default_factory=list)
    risks_and_mitigations: List[RiskMitigationItem] = Field(default_factory=list)
    counterarguments: List[CounterargumentItem] = Field(default_factory=list)
    confidence_assessment: ConfidenceAssessment
    roadmap: RoadmapData
    created_at: str
    version: int = 1


class SynthesisRequest(BaseModel):
    user_priorities: Optional[List[str]] = Field(
        None,
        description="Explicit user strategic priorities (e.g. ['minimize cost', 'maximize speed', 'maintain full autonomy'])"
    )
    force_mock: bool = Field(False, description="Force deterministic mock mode for testing")


class RoadmapUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, description="Optional updated roadmap title")
    phases: List[RoadmapPhase] = Field(..., description="Updated phases and tasks")


class SnapshotSummary(BaseModel):
    id: int
    decision_id: int
    version: int
    title: str
    synthesis_type: str
    headline: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SnapshotDetail(BaseModel):
    id: int
    decision_id: int
    version: int
    title: str
    synthesis_type: str
    headline: str
    recommendation: Dict[str, Any]
    framework_snapshot: Dict[str, Any]
    input_snapshot: Dict[str, Any]
    gaps_snapshot: Dict[str, Any]
    research_snapshot: Dict[str, Any]
    user_priorities: List[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)





