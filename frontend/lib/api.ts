/**
 * DecisionLens Typed API Client
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface HealthStatus {
  status: string;
  project: string;
  environment: string;
  version: string;
  storage_ready: boolean;
}

export interface User {
  id: number;
  email: string;
  created_at: string;
  oauth_provider?: string | null;
  avatar_url?: string | null;
  display_name?: string | null;
}

export interface OAuthProviderInfo {
  id: "google" | "github" | "microsoft" | string;
  name: string;
  configured: boolean;
  client_id?: string | null;
  auth_url?: string | null;
}

export interface OAuthLoginPayload {
  provider: "google" | "github" | "microsoft" | string;
  token?: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Folder {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
  decision_count?: number;
}

export interface Decision {
  id: number;
  owner_id: number;
  folder_id: number;
  title: string;
  description: string;
  problem_statement: string;
  record_type: "decision" | "meeting" | string;
  status: "draft" | "evaluating" | "decided" | "archived" | string;
  language: string;
  raw_input: string;
  transcript: string;
  transcript_reviewed: boolean;
  points: Record<string, unknown>;
  points_reviewed?: boolean;
  gaps: Record<string, unknown>;
  research: Record<string, unknown>;
  analysis: Record<string, unknown>;
  recommendation: Record<string, unknown>;
  roadmap: Record<string, unknown>;
  domain?: string;
  created_at: string;
  updated_at: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Token helpers using localStorage
export const TOKEN_KEY = "decisionlens_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Common fetch helper with auto token injection and standardized error handling
 */
export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getStoredToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorDetail = errorJson.detail;
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiError(response.status, errorDetail);
  }

  // Handle empty responses like 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ==========================================
// API Methods
// ==========================================

export async function getHealthStatus(): Promise<HealthStatus> {
  return fetchApi<HealthStatus>("/api/health");
}

export async function registerUser(email: string, password: string): Promise<TokenResponse> {
  const res = await fetchApi<TokenResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(res.access_token);
  return res;
}

export async function loginUser(email: string, password: string): Promise<TokenResponse> {
  const res = await fetchApi<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(res.access_token);
  return res;
}

export async function getMe(): Promise<User | null> {
  const token = getStoredToken();
  if (!token) {
    return null;
  }
  try {
    return await fetchApi<User>("/api/auth/me");
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      clearStoredToken();
      return null;
    }
    throw err;
  }
}

export async function changePassword(
  current_password: string,
  new_password: string
): Promise<{ message: string }> {
  return fetchApi<{ message: string }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}

export async function getOAuthProviders(): Promise<OAuthProviderInfo[]> {
  return fetchApi<OAuthProviderInfo[]>("/api/auth/oauth/providers");
}

export async function authenticateOAuth(payload: OAuthLoginPayload): Promise<TokenResponse> {
  const res = await fetchApi<TokenResponse>("/api/auth/oauth/authenticate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setStoredToken(res.access_token);
  return res;
}

// Folders
export async function getFolders(): Promise<Folder[]> {
  return fetchApi<Folder[]>("/api/folders");
}

export async function getFolder(folderId: number): Promise<Folder> {
  return fetchApi<Folder>(`/api/folders/${folderId}`);
}

export async function createFolder(data: {
  name: string;
  description?: string;
  color?: string;
}): Promise<Folder> {
  return fetchApi<Folder>("/api/folders", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateFolder(
  folderId: number,
  data: { name?: string; description?: string; color?: string }
): Promise<Folder> {
  return fetchApi<Folder>(`/api/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteFolder(folderId: number): Promise<{ status: string; id: number }> {
  return fetchApi<{ status: string; id: number }>(`/api/folders/${folderId}`, {
    method: "DELETE",
  });
}

// Decisions
export async function getDecisions(folderId?: number): Promise<Decision[]> {
  const query = folderId ? `?folder_id=${folderId}` : "";
  return fetchApi<Decision[]>(`/api/decisions${query}`);
}

export async function getDecision(decisionId: number): Promise<Decision> {
  return fetchApi<Decision>(`/api/decisions/${decisionId}`);
}

export async function createDecision(data: {
  folder_id: number;
  title: string;
  description?: string;
  problem_statement?: string;
  record_type?: string;
  status?: string;
  language?: string;
}): Promise<Decision> {
  return fetchApi<Decision>("/api/decisions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateDecision(
  decisionId: number,
  data: {
    folder_id?: number;
    title?: string;
    description?: string;
    problem_statement?: string;
    record_type?: string;
    status?: string;
    language?: string;
    raw_input?: string;
  }
): Promise<Decision> {
  return fetchApi<Decision>(`/api/decisions/${decisionId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteDecision(decisionId: number): Promise<{ status: string; id: number }> {
  return fetchApi<{ status: string; id: number }>(`/api/decisions/${decisionId}`, {
    method: "DELETE",
  });
}

// ==========================================
// Attachments
// ==========================================

export interface Attachment {
  id: number;
  owner_id: number;
  decision_id: number;
  original_name: string;
  media_type: string;
  file_size: number;
  extracted_text: string;
  created_at: string;
}

export async function getAttachments(decisionId: number): Promise<Attachment[]> {
  return fetchApi<Attachment[]>(`/api/decisions/${decisionId}/attachments`);
}

export async function uploadAttachment(decisionId: number, file: File): Promise<Attachment> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);

  const url = `${API_BASE_URL}/api/decisions/${decisionId}/attachments`;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Upload failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorDetail = errorJson.detail;
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiError(response.status, errorDetail);
  }

  return response.json() as Promise<Attachment>;
}

export async function deleteAttachment(
  decisionId: number,
  attachmentId: number
): Promise<{ status: string; id: number }> {
  return fetchApi<{ status: string; id: number }>(
    `/api/decisions/${decisionId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    }
  );
}

// ==========================================
// Audio & Transcription API (Phase 5)
// ==========================================

export interface AudioRecording {
  id: number;
  owner_id: number;
  decision_id: number;
  original_filename: string;
  media_type: string;
  file_size: number;
  duration_seconds?: number | null;
  language: string;
  used_enhanced: boolean;
  created_at: string;
}

export interface TranscriptionResponse {
  transcript: string;
  language: string;
  transcript_reviewed: boolean;
  used_enhanced: boolean;
  audio_id?: number | null;
  audio_recording?: AudioRecording | null;
  message?: string;
}

export async function uploadAudio(
  decisionId: number,
  audioBlob: Blob | File,
  options?: {
    language?: string;
    applyEnhancement?: boolean;
    filename?: string;
    clientTranscript?: string;
  }
): Promise<TranscriptionResponse> {
  const token = getStoredToken();
  const formData = new FormData();

  const filename =
    options?.filename ||
    (audioBlob instanceof File ? audioBlob.name : "recorded_audio.webm");

  formData.append("file", audioBlob, filename);
  formData.append("language", options?.language || "en");
  formData.append(
    "apply_enhancement",
    options?.applyEnhancement !== false ? "true" : "false"
  );
  if (options?.clientTranscript) {
    formData.append("client_transcript", options.clientTranscript);
  }

  const url = `${API_BASE_URL}/api/decisions/${decisionId}/transcription`;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Audio upload failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorDetail = errorJson.detail;
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiError(response.status, errorDetail);
  }

  return response.json() as Promise<TranscriptionResponse>;
}

export async function retryOriginalAudio(
  decisionId: number
): Promise<TranscriptionResponse> {
  return fetchApi<TranscriptionResponse>(
    `/api/decisions/${decisionId}/transcription/retry-original`,
    {
      method: "POST",
    }
  );
}

export async function updateTranscript(
  decisionId: number,
  transcript: string,
  markReviewed: boolean = true
): Promise<TranscriptionResponse> {
  return fetchApi<TranscriptionResponse>(
    `/api/decisions/${decisionId}/transcription/transcript`,
    {
      method: "PATCH",
      body: JSON.stringify({
        transcript,
        mark_reviewed: markReviewed,
      }),
    }
  );
}

export async function getTranscriptionDetails(
  decisionId: number
): Promise<TranscriptionResponse> {
  return fetchApi<TranscriptionResponse>(
    `/api/decisions/${decisionId}/transcription`
  );
}

export async function getAudioRecordings(
  decisionId: number
): Promise<AudioRecording[]> {
  return fetchApi<AudioRecording[]>(
    `/api/decisions/${decisionId}/transcription/recordings`
  );
}

export function getAudioStreamUrl(
  decisionId: number,
  audioId: number,
  useOriginal: boolean = false
): string {
  const token = getStoredToken();
  const base = `${API_BASE_URL}/api/decisions/${decisionId}/transcription/audio/${audioId}`;
  const params = new URLSearchParams();
  if (useOriginal) params.append("use_original", "true");
  if (token) params.append("token", token);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

// ==========================================
// Input Structuring API (Phase 6)
// ==========================================

export interface PrivateTranscriptFeedback {
  tone_observations: string;
  potential_biases: string[];
  clarity_rating: string;
  feedback_notes: string;
}

export interface StructuredFindings {
  facts: string[];
  assumptions: string[];
  feelings: string[];
  pros: string[];
  cons: string[];
  mixed_points: string[];
  contradictions: string[];
  unknowns: string[];
  private_feedback?: PrivateTranscriptFeedback;
  summary: string;
  reviewed: boolean;
  reviewed_at?: string | null;
}

export interface StructuringResponse {
  decision_id: number;
  findings: StructuredFindings;
  points_reviewed: boolean;
  source_summary?: string | null;
  message?: string | null;
}

export async function analyzeDecisionInputs(
  decisionId: number,
  forceMock: boolean = false
): Promise<StructuringResponse> {
  const query = forceMock ? "?force_mock=true" : "";
  return fetchApi<StructuringResponse>(
    `/api/decisions/${decisionId}/structuring/analyze${query}`,
    {
      method: "POST",
    }
  );
}

export async function getStructuredFindings(
  decisionId: number
): Promise<StructuringResponse> {
  return fetchApi<StructuringResponse>(
    `/api/decisions/${decisionId}/structuring`
  );
}

export async function updateStructuredFindings(
  decisionId: number,
  data: {
    facts?: string[];
    assumptions?: string[];
    feelings?: string[];
    pros?: string[];
    cons?: string[];
    mixed_points?: string[];
    contradictions?: string[];
    unknowns?: string[];
    summary?: string;
    private_feedback?: PrivateTranscriptFeedback;
    mark_reviewed?: boolean;
  }
): Promise<StructuringResponse> {
  return fetchApi<StructuringResponse>(
    `/api/decisions/${decisionId}/structuring`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

// ==========================================
// Gap Detection & Resolution API (Phase 7)
// ==========================================

export type GapImportance = "critical" | "high" | "medium" | "low";
export type GapResolutionMethod = "ask_user" | "web_research";
export type GapStatus = "pending" | "answered" | "skipped" | "research_queued" | "researched";

export interface GapItem {
  id: string;
  question: string;
  reason: string;
  importance: GapImportance;
  priority_score: number;
  affected_options: string[];
  recommended_resolution_method: GapResolutionMethod;
  status: GapStatus;
  answer?: string | null;
  research_query?: string | null;
  source_origin?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface GapsResponse {
  decision_id: number;
  gaps: GapItem[];
  detected_at?: string | null;
  total_gaps: number;
  pending_count: number;
  answered_count: number;
  skipped_count: number;
  research_queued_count: number;
  researched_count?: number;
  message?: string | null;
}

export async function detectGaps(
  decisionId: number,
  forceMock: boolean = false
): Promise<GapsResponse> {
  const query = forceMock ? "?force_mock=true" : "";
  return fetchApi<GapsResponse>(
    `/api/decisions/${decisionId}/gaps/detect${query}`,
    {
      method: "POST",
    }
  );
}

export async function getGaps(decisionId: number): Promise<GapsResponse> {
  return fetchApi<GapsResponse>(`/api/decisions/${decisionId}/gaps`);
}

export async function answerGap(
  decisionId: number,
  gapId: string,
  answer?: string,
  skip: boolean = false
): Promise<GapItem> {
  return fetchApi<GapItem>(
    `/api/decisions/${decisionId}/gaps/${gapId}/answer`,
    {
      method: "POST",
      body: JSON.stringify({ answer, skip }),
    }
  );
}

export async function queueGapResearch(
  decisionId: number,
  gapId: string,
  customQuery?: string
): Promise<GapItem> {
  return fetchApi<GapItem>(
    `/api/decisions/${decisionId}/gaps/${gapId}/research`,
    {
      method: "POST",
      body: JSON.stringify({
        resolution_method: "web_research",
        custom_query: customQuery,
        execute: false,
      }),
    }
  );
}

// ==========================================
// Web Research & Verification API (Phase 8)
// ==========================================

export type ReliabilityLabel =
  | "primary_source"
  | "secondary_source"
  | "community_opinion"
  | "low_confidence";

export type EvidenceConsensus =
  | "corroborated"
  | "single_source"
  | "conflicting_evidence"
  | "unsupported";

export interface ResearchSourceItem {
  source_title: string;
  url: string;
  retrieval_timestamp: string;
  relevant_claims: string[];
  reliability_label: ReliabilityLabel;
}

export interface ResearchClaimItem {
  claim: string;
  sources_count: number;
  evidence_type: string;
  consensus: EvidenceConsensus;
  is_verified: boolean;
}

export interface ResearchFindingItem {
  id: string;
  gap_id: string;
  question: string;
  narrow_query: string;
  synthesis: string;
  consensus: EvidenceConsensus;
  is_verified: boolean;
  sources: ResearchSourceItem[];
  claims: ResearchClaimItem[];
  created_at: string;
}

export interface ResearchExecuteResponse {
  decision_id: number;
  gap_id: string;
  finding: ResearchFindingItem;
  updated_gap: GapItem;
  message?: string | null;
}

export interface DecisionResearchResponse {
  decision_id: number;
  requests: Array<{
    gap_id: string;
    query: string;
    status: string;
    queued_at?: string;
    executed_at?: string;
    finding_id?: string;
  }>;
  findings: ResearchFindingItem[];
  total_findings: number;
}

export async function executeGapResearch(
  decisionId: number,
  gapId: string,
  customQuery?: string,
  forceMock: boolean = false
): Promise<ResearchExecuteResponse> {
  const params = new URLSearchParams();
  if (customQuery) params.append("custom_query", customQuery);
  if (forceMock) params.append("force_mock", "true");
  const q = params.toString() ? `?${params.toString()}` : "";

  return fetchApi<ResearchExecuteResponse>(
    `/api/decisions/${decisionId}/gaps/${gapId}/research/execute${q}`,
    {
      method: "POST",
    }
  );
}

export async function getDecisionResearch(
  decisionId: number
): Promise<DecisionResearchResponse> {
  return fetchApi<DecisionResearchResponse>(
    `/api/decisions/${decisionId}/research`
  );
}

// ==========================================
// Thinking Frameworks (Phase 9)
// ==========================================

export interface HatPerspective {
  hat: string;
  name: string;
  color: string;
  focus: string;
  points: string[];
  key_takeaway?: string | null;
}

export interface SixHatsAnalysis {
  applicable: boolean;
  inapplicability_reason?: string | null;
  hats: Record<string, HatPerspective>;
  synthesis?: string | null;
}

export interface SWOTItem {
  id: string;
  text: string;
  impact: "high" | "medium" | "low";
  source_reference?: string | null;
}

export interface SWOTAnalysis {
  applicable: boolean;
  inapplicability_reason?: string | null;
  strengths: SWOTItem[];
  weaknesses: SWOTItem[];
  opportunities: SWOTItem[];
  threats: SWOTItem[];
  strategic_implications: string[];
}

export interface CanonicalDecisionResult {
  winner_option_id: string;
  winner_option_name: string;
  winner_score: number;
  winner_rank: number;
  total_options_evaluated: number;
  domain: string;
  margin_over_runner_up?: number | null;
  unresolved_gaps_count: number;
  critical_unresolved_gaps: string[];
  decision_status: "READY" | "CONDITIONAL" | string;
  conditions_precedent: string[];
  calculated_at?: string;
  is_stale?: boolean;
}

export interface MatrixCriterion {
  id: string;
  name: string;
  weight: number;
  description?: string;
}

export interface MatrixOption {
  id: string;
  name: string;
  description?: string;
  origin?: "original" | "derived" | "imported" | string;
  derived_from?: string[];
  derivation_reason?: string | null;
}

export interface MatrixScoreItem {
  option_id: string;
  criterion_id: string;
  rating: number;
  notes?: string | null;
  reason?: string | null;
  supporting_finding_ids?: string[];
  supporting_gap_ids?: string[];
  supporting_evidence_ids?: string[];
  status?: string;
}

export interface MatrixResultOption {
  option_id: string;
  option_name: string;
  weighted_score: number;
  normalized_score: number;
  rank: number;
  criteria_scores: Record<string, number>;
  criteria_weighted_scores: Record<string, number>;
}

export interface DecisionMatrixAnalysis {
  applicable: boolean;
  inapplicability_reason?: string | null;
  scale_min: number;
  scale_max: number;
  criteria: MatrixCriterion[];
  options: MatrixOption[];
  ratings: MatrixScoreItem[];
  results: MatrixResultOption[];
  winner_option_id?: string | null;
  winner_option_name?: string | null;
  sensitivity_notes?: string | null;
  canonical_result?: CanonicalDecisionResult | null;
  domain?: string;
  is_stale?: boolean;
}

export interface MatrixEvaluationRequest {
  criteria: MatrixCriterion[];
  options: MatrixOption[];
  ratings: MatrixScoreItem[];
  scale_min?: number;
  scale_max?: number;
}

export interface MatrixEvaluationResponse {
  valid: boolean;
  scale_min: number;
  scale_max: number;
  total_weight: number;
  criteria: MatrixCriterion[];
  options: MatrixOption[];
  ratings: MatrixScoreItem[];
  results: MatrixResultOption[];
  winner_option_id?: string | null;
  winner_option_name?: string | null;
}

export interface WhyStep {
  step_number: number;
  why_question: string;
  answer: string;
  is_known_fact: boolean;
  evidence_reference?: string | null;
}

export interface FiveWhysAnalysis {
  applicable: boolean;
  inapplicability_reason?: string | null;
  problem_statement: string;
  steps: WhyStep[];
  root_cause?: string | null;
  is_root_cause_verified: boolean;
  countermeasures: string[];
}

export interface DecisionTreeBranch {
  branch_id: string;
  label: string;
  probability?: number | null;
  is_probability_estimated: boolean;
  payoff?: number | null;
  payoff_unit?: string | null;
  outcome_description: string;
  sub_branches?: DecisionTreeBranch[];
}

export interface DecisionTreeNode {
  node_id: string;
  node_type: "decision" | "chance" | "terminal";
  label: string;
  description?: string;
  branches: DecisionTreeBranch[];
  expected_value?: number | null;
}

export interface DecisionTreeAnalysis {
  applicable: boolean;
  inapplicability_reason?: string | null;
  root_question: string;
  nodes: DecisionTreeNode[];
  has_deterministic_probabilities: boolean;
  expected_values_by_option: Record<string, number>;
  probabilities_note: string;
  best_expected_value_option?: string | null;
}

export interface FrameworkAnalysisRequest {
  selected_frameworks?: string[];
  matrix_custom_criteria?: MatrixCriterion[];
  matrix_custom_options?: MatrixOption[];
  matrix_custom_ratings?: MatrixScoreItem[];
  force_mock?: boolean;
}

export interface RecommendedTechnique {
  framework_id: string;
  role: string;
  role_label: string;
  validation_reason: string;
  priority: number;
}

export interface FrameworkAnalysisResponse {
  decision_id: number;
  evaluated_at: string;
  selected_frameworks: string[];
  recommended_framework?: string | null;
  recommended_techniques?: RecommendedTechnique[];
  methodology_rationale?: string | null;
  six_hats?: SixHatsAnalysis | null;
  swot?: SWOTAnalysis | null;
  decision_matrix?: DecisionMatrixAnalysis | null;
  five_whys?: FiveWhysAnalysis | null;
  decision_tree?: DecisionTreeAnalysis | null;
  summary_insights: string[];
  canonical_result?: CanonicalDecisionResult | null;
  domain?: string;
  is_stale?: boolean;
  message?: string | null;
}

export async function evaluateFrameworks(
  decisionId: number,
  request?: FrameworkAnalysisRequest
): Promise<FrameworkAnalysisResponse> {
  return fetchApi<FrameworkAnalysisResponse>(
    `/api/decisions/${decisionId}/analysis`,
    {
      method: "POST",
      body: JSON.stringify(request || {}),
    }
  );
}

export async function getFrameworkAnalysis(
  decisionId: number,
  autoRun: boolean = false,
  forceMock: boolean = false
): Promise<FrameworkAnalysisResponse> {
  const params = new URLSearchParams();
  if (autoRun) params.append("auto_run", "true");
  if (forceMock) params.append("force_mock", "true");
  const q = params.toString() ? `?${params.toString()}` : "";

  return fetchApi<FrameworkAnalysisResponse>(
    `/api/decisions/${decisionId}/analysis${q}`
  );
}

export async function evaluateMatrixScores(
  decisionId: number,
  request: MatrixEvaluationRequest
): Promise<MatrixEvaluationResponse> {
  return fetchApi<MatrixEvaluationResponse>(
    `/api/decisions/${decisionId}/analysis/matrix/evaluate`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  );
}

// ==========================================
// Phase 10: Decision Synthesis & Roadmap Types
// ==========================================

export interface AlternativeOption {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  tradeoffs: string;
  is_recommended: boolean;
  why_not_recommended?: string | null;
}

export interface SupportingEvidenceItem {
  claim: string;
  source_title?: string | null;
  source_url?: string | null;
  evidence_type: "user_fact" | "research_claim" | "framework_metric" | string;
  reliability?: "high" | "medium" | "low" | string | null;
}

export interface AssumptionItem {
  assumption: string;
  is_verified: boolean;
  impact_if_false: string;
}

export interface RiskMitigationItem {
  risk: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  mitigation: string;
  contingency_plan: string;
}

export interface CounterargumentItem {
  argument: string;
  rebuttal_or_concession: string;
}

export interface ConfidenceAssessment {
  level: "high" | "medium" | "low" | string;
  score: number;
  rationale: string;
  limitations: string[];
  status?: "READY" | "CONDITIONAL" | string;
  conditions_precedent?: string[];
}

export interface RoadmapTask {
  task_id: string;
  title: string;
  description?: string;
  owner_role?: string;
  timeline?: string;
  dependencies?: string[];
  success_criteria?: string;
  is_completed?: boolean;
  source_type?: string;
  source_ids?: string[];
  depends_on_gap_ids?: string[];
  depends_on_risk_ids?: string[];
  depends_on_condition_ids?: string[];
  reason?: string;
}

export interface RoadmapPhase {
  phase_id: string;
  title: string;
  timeline: string;
  description?: string;
  tasks: RoadmapTask[];
}

export interface RoadmapData {
  title: string;
  phases: RoadmapPhase[];
}

export interface DecisionSynthesis {
  decision_id: number;
  synthesis_type: "recommendation" | "conditional_next_step" | string;
  headline: string;
  recommendation_text: string;
  conditional_triggers: string[];
  alternatives_considered: AlternativeOption[];
  supporting_evidence: SupportingEvidenceItem[];
  assumptions: AssumptionItem[];
  risks_and_mitigations: RiskMitigationItem[];
  counterarguments: CounterargumentItem[];
  confidence_assessment: ConfidenceAssessment;
  roadmap: RoadmapData;
  created_at: string;
  version: number;
  canonical_result?: CanonicalDecisionResult | null;
  domain?: string;
  is_stale?: boolean;
}

export interface SynthesisRequest {
  user_priorities?: string[];
  force_mock?: boolean;
}

export interface RoadmapUpdateRequest {
  title?: string;
  phases: RoadmapPhase[];
}

export interface SnapshotSummary {
  id: number;
  decision_id: number;
  version: number;
  title: string;
  synthesis_type: string;
  headline: string;
  created_at: string;
}

export interface SnapshotDetail {
  id: number;
  decision_id: number;
  version: number;
  title: string;
  synthesis_type: string;
  headline: string;
  recommendation: DecisionSynthesis;
  framework_snapshot: Record<string, unknown>;
  input_snapshot: Record<string, unknown>;
  gaps_snapshot: Record<string, unknown>;
  research_snapshot: Record<string, unknown>;
  user_priorities: string[];
  created_at: string;
}

export async function synthesizeDecision(
  decisionId: number,
  request?: SynthesisRequest
): Promise<DecisionSynthesis> {
  return fetchApi<DecisionSynthesis>(
    `/api/decisions/${decisionId}/synthesis`,
    {
      method: "POST",
      body: JSON.stringify(request || {}),
    }
  );
}

export async function getDecisionSynthesis(
  decisionId: number
): Promise<DecisionSynthesis> {
  return fetchApi<DecisionSynthesis>(
    `/api/decisions/${decisionId}/synthesis`
  );
}

export async function getAnalysisSnapshots(
  decisionId: number
): Promise<SnapshotSummary[]> {
  return fetchApi<SnapshotSummary[]>(
    `/api/decisions/${decisionId}/synthesis/snapshots`
  );
}

export async function getAnalysisSnapshotDetail(
  decisionId: number,
  snapshotId: number
): Promise<SnapshotDetail> {
  return fetchApi<SnapshotDetail>(
    `/api/decisions/${decisionId}/synthesis/snapshots/${snapshotId}`
  );
}

export async function getActiveRoadmap(
  decisionId: number
): Promise<RoadmapData> {
  return fetchApi<RoadmapData>(
    `/api/decisions/${decisionId}/roadmap`
  );
}

export async function updateActiveRoadmap(
  decisionId: number,
  request: RoadmapUpdateRequest
): Promise<RoadmapData> {
  return fetchApi<RoadmapData>(
    `/api/decisions/${decisionId}/roadmap`,
    {
      method: "PUT",
      body: JSON.stringify(request),
    }
  );
}

export interface ReportExportResponse {
  decision_id: number;
  title: string;
  format: string;
  content: string;
}

export interface SaveReportResponse {
  attachment_id: number;
  filename: string;
  file_size: number;
  content: string;
  created_at: string;
  message: string;
}

export async function exportDecisionReport(
  decisionId: number,
  format: "markdown" | "json" = "markdown"
): Promise<ReportExportResponse> {
  return fetchApi<ReportExportResponse>(
    `/api/decisions/${decisionId}/export?format=${format}`
  );
}

export async function saveDecisionReportExport(
  decisionId: number
): Promise<SaveReportResponse> {
  return fetchApi<SaveReportResponse>(
    `/api/decisions/${decisionId}/export/save`,
    {
      method: "POST",
    }
  );
}



