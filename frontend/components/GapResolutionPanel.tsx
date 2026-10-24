"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  HelpCircle,
  Search,
  User,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Send,
  RotateCw,
  X,
  ChevronDown,
  ChevronUp,
  Tag,
  ShieldAlert,
  ShieldCheck,
  Globe,
  ExternalLink,
  Info,
  Check,
  Layers,
} from "lucide-react";
import {
  detectGaps,
  getGaps,
  answerGap,
  queueGapResearch,
  executeGapResearch,
  getDecisionResearch,
  GapItem,
  GapsResponse,
  GapImportance,
  GapStatus,
  ResearchFindingItem,
  EvidenceConsensus,
  ReliabilityLabel,
} from "@/lib/api";

interface GapResolutionPanelProps {
  decisionId: number;
  initialGaps?: Record<string, unknown>;
  onGapsUpdated?: () => void;
}

export default function GapResolutionPanel({
  decisionId,
  initialGaps,
  onGapsUpdated,
}: GapResolutionPanelProps) {
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [detectedAt, setDetectedAt] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [researchQueuedCount, setResearchQueuedCount] = useState(0);
  const [researchedCount, setResearchedCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [unconfiguredProviderError, setUnconfiguredProviderError] = useState<boolean>(false);

  // Research findings map: gap_id -> ResearchFindingItem
  const [findingsMap, setFindingsMap] = useState<Record<string, ResearchFindingItem>>({});
  const [expandedFindingGapId, setExpandedFindingGapId] = useState<string | null>(null);

  // Active filter tab
  const [filterTab, setFilterTab] = useState<
    "all" | "pending" | "answered" | "skipped" | "research_queued" | "researched"
  >("all");

  // State for active inline modals / expansion
  const [activeActionGapId, setActiveActionGapId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"ask_me" | "research" | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [researchQueryInput, setResearchQueryInput] = useState("");
  const [forceMockToggle, setForceMockToggle] = useState(false);

  const updateStateFromResponse = useCallback((res: GapsResponse) => {
    setGaps(res.gaps || []);
    setDetectedAt(res.detected_at || null);
    setTotalCount(res.total_gaps || 0);
    setPendingCount(res.pending_count || 0);
    setAnsweredCount(res.answered_count || 0);
    setSkippedCount(res.skipped_count || 0);
    setResearchQueuedCount(res.research_queued_count || 0);
    setResearchedCount(
      res.researched_count ??
        (res.gaps ? res.gaps.filter((g) => g.status === "researched").length : 0)
    );
  }, []);

  const fetchGaps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getGaps(decisionId);
      updateStateFromResponse(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load gaps";
      if (!msg.includes("404")) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [decisionId, updateStateFromResponse]);

  const fetchResearchFindings = useCallback(async () => {
    try {
      const res = await getDecisionResearch(decisionId);
      const map: Record<string, ResearchFindingItem> = {};
      for (const f of res.findings || []) {
        map[f.gap_id] = f;
      }
      setFindingsMap(map);
    } catch {
      // Research log might not exist yet
    }
  }, [decisionId]);

  useEffect(() => {
    if (initialGaps && Array.isArray((initialGaps as unknown as GapsResponse).gaps)) {
      const gResp = initialGaps as unknown as GapsResponse;
      updateStateFromResponse(gResp);
    } else {
      fetchGaps();
    }
    fetchResearchFindings();
  }, [decisionId, initialGaps, updateStateFromResponse, fetchGaps, fetchResearchFindings]);

  const handleDetectGaps = async () => {
    setIsDetecting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await detectGaps(decisionId);
      updateStateFromResponse(res);
      setSuccessMsg(`Detected ${res.total_gaps} prioritized information gaps!`);
      if (onGapsUpdated) onGapsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to analyze decision gaps");
    } finally {
      setIsDetecting(false);
    }
  };

  const openAskMe = (gap: GapItem) => {
    setActiveActionGapId(gap.id);
    setActionType("ask_me");
    setAnswerInput(gap.answer || "");
    setError(null);
  };

  const openResearch = (gap: GapItem) => {
    setActiveActionGapId(gap.id);
    setActionType("research");
    setResearchQueryInput(
      gap.research_query ||
        `${gap.question.replace(/\?$/, "")} benchmark documentation`
    );
    setError(null);
    setUnconfiguredProviderError(false);
  };

  const closeActionBox = () => {
    setActiveActionGapId(null);
    setActionType(null);
    setAnswerInput("");
    setResearchQueryInput("");
    setUnconfiguredProviderError(false);
  };

  const handleAnswerSubmit = async (gap: GapItem, skip: boolean = false) => {
    setActionInProgressId(gap.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await answerGap(
        decisionId,
        gap.id,
        skip ? undefined : answerInput,
        skip
      );

      setGaps((prev) =>
        prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g))
      );

      const res = await getGaps(decisionId);
      updateStateFromResponse(res);

      if (skip) {
        setSuccessMsg(`Gap marked as Unknown: "${gap.question.slice(0, 45)}..." retained in unknowns.`);
      } else {
        setSuccessMsg(`Answer recorded and integrated into decision facts!`);
      }

      closeActionBox();
      if (onGapsUpdated) onGapsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save answer");
    } finally {
      setActionInProgressId(null);
    }
  };

  // Phase 8 Direct Research Execution
  const handleExecuteResearch = async (gap: GapItem, forceMock: boolean = forceMockToggle) => {
    setActionInProgressId(gap.id);
    setError(null);
    setSuccessMsg(null);
    setUnconfiguredProviderError(false);
    try {
      const res = await executeGapResearch(
        decisionId,
        gap.id,
        researchQueryInput.trim() || undefined,
        forceMock
      );

      // Update local findings map
      setFindingsMap((prev) => ({
        ...prev,
        [gap.id]: res.finding,
      }));

      // Update local gaps list
      setGaps((prev) =>
        prev.map((g) => (g.id === res.updated_gap.id ? { ...g, ...res.updated_gap } : g))
      );

      // Re-fetch gap counts and research
      const gRes = await getGaps(decisionId);
      updateStateFromResponse(gRes);
      fetchResearchFindings();

      setSuccessMsg(
        `Research executed! Retrieved ${res.finding.sources.length} sources (${res.finding.consensus}).`
      );
      closeActionBox();
      setExpandedFindingGapId(gap.id); // Auto-expand evidence view
      if (onGapsUpdated) onGapsUpdated();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute research";
      if (msg.includes("503") || msg.toLowerCase().includes("not configured")) {
        setUnconfiguredProviderError(true);
        setError(
          "External search provider is not configured. Configure SEARCH_API_KEY in backend/.env, or run with the deterministic test provider."
        );
      } else {
        setError(msg);
      }
    } finally {
      setActionInProgressId(null);
    }
  };

  // Queue only (Phase 7 backward-compatibility)
  const handleQueueResearch = async (gap: GapItem) => {
    setActionInProgressId(gap.id);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await queueGapResearch(
        decisionId,
        gap.id,
        researchQueryInput.trim() || undefined
      );

      setGaps((prev) =>
        prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g))
      );

      const res = await getGaps(decisionId);
      updateStateFromResponse(res);

      setSuccessMsg(`Research request queued for future execution!`);
      closeActionBox();
      if (onGapsUpdated) onGapsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to queue research");
    } finally {
      setActionInProgressId(null);
    }
  };

  const getImportanceBadge = (importance: GapImportance) => {
    switch (importance) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <ShieldAlert className="w-3 h-3 text-rose-600" />
            Critical
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
            High
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
            Medium
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-normal bg-slate-100 text-slate-700 border border-slate-300">
            Low
          </span>
        );
    }
  };

  const getStatusBadge = (status: GapStatus) => {
    switch (status) {
      case "researched":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
            <Globe className="w-3 h-3 text-indigo-600" />
            Researched
          </span>
        );
      case "answered":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Answered
          </span>
        );
      case "skipped":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-300">
            <HelpCircle className="w-3 h-3 text-purple-600" />
            Marked Unknown
          </span>
        );
      case "research_queued":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3 h-3 text-blue-600" />
            Research Queued
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            Pending
          </span>
        );
    }
  };

  const getConsensusBadge = (consensus: EvidenceConsensus, isVerified: boolean) => {
    switch (consensus) {
      case "corroborated":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            Corroborated Evidence {isVerified && <Check className="w-3 h-3 text-emerald-700 inline ml-0.5" />}
          </span>
        );
      case "single_source":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Info className="w-3 h-3 text-blue-600" />
            Single Source {isVerified ? "(Primary)" : "(Uncorroborated)"}
          </span>
        );
      case "conflicting_evidence":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            Conflicting Evidence (Unverified)
          </span>
        );
      case "unsupported":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <X className="w-3 h-3 text-rose-600" />
            Unsupported Claim
          </span>
        );
      default:
        return null;
    }
  };

  const getReliabilityBadge = (label: ReliabilityLabel) => {
    switch (label) {
      case "primary_source":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            Primary Source (Preferred)
          </span>
        );
      case "secondary_source":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Secondary Source
          </span>
        );
      case "community_opinion":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
            Community Opinion
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
            Low Confidence
          </span>
        );
    }
  };

  const filteredGaps = gaps.filter((g) => {
    if (filterTab === "all") return true;
    return g.status === filterTab;
  });

  return (
    <div className="glass-panel rounded-2xl specular-edge p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Globe className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Information Gaps & Evidence
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Resolve critical uncertainties before finalizing your decision. Provide direct knowledge or run live web research to gather corroborated facts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDetectGaps}
          disabled={isDetecting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          {isDetecting ? (
            <>
              <RotateCw className="w-4 h-4 animate-spin" />
              Detecting Gaps...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {gaps.length > 0 ? "Re-Detect Gaps" : "Detect Information Gaps"}
            </>
          )}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1 font-medium">{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {unconfiguredProviderError && activeActionGapId && (
            <div className="pt-2 pl-6">
              <button
                type="button"
                onClick={() => {
                  const target = gaps.find((g) => g.id === activeActionGapId);
                  if (target) handleExecuteResearch(target, true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Retry with Deterministic Test Provider
              </button>
            </div>
          )}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* Clean Status & Filter Strip */}
      {gaps.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{pendingCount} Needs Attention</span>
            </div>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1.5 font-medium text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{answeredCount + researchedCount} Resolved</span>
            </div>
            {totalCount > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{totalCount} total</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === "all"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              All ({gaps.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("pending")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === "pending"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-white text-slate-600 hover:bg-amber-50 border border-slate-200"
              }`}
            >
              Needs Attention ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("answered")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === "answered"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-white text-slate-600 hover:bg-emerald-50 border border-slate-200"
              }`}
            >
              Answered ({answeredCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("researched")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterTab === "researched"
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-white text-slate-600 hover:bg-indigo-50 border border-slate-200"
              }`}
            >
              Researched ({researchedCount})
            </button>
            {skippedCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("skipped")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  filterTab === "skipped"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "bg-white text-slate-600 hover:bg-purple-50 border border-slate-200"
                }`}
              >
                Unknowns ({skippedCount})
              </button>
            )}
            {researchQueuedCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("research_queued")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  filterTab === "research_queued"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-white text-slate-600 hover:bg-blue-50 border border-slate-200"
                }`}
              >
                Queued ({researchQueuedCount})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Gaps List */}
      {loading ? (
        <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <RotateCw className="w-4 h-4 animate-spin text-indigo-600" />
          Loading information gaps...
        </div>
      ) : gaps.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
          <HelpCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 mb-1">
            No Information Gaps Detected Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            Click <strong>Detect Information Gaps</strong> to analyze structured findings, unverified assumptions,
            and missing critical criteria to generate targeted questions.
          </p>
          <button
            type="button"
            onClick={handleDetectGaps}
            disabled={isDetecting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Sparkles className="w-4 h-4" />
            Detect Gaps Now
          </button>
        </div>
      ) : filteredGaps.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
          No gaps match the selected tab filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGaps.map((gap) => {
            const isActionOpen = activeActionGapId === gap.id;
            const isWorking = actionInProgressId === gap.id;
            const finding = findingsMap[gap.id];
            const isFindingExpanded = expandedFindingGapId === gap.id;

            return (
              <div
                key={gap.id}
                className="glass-card glass-card-hover rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all"
              >
                {/* Main Card Header */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        #{gap.priority_score}
                      </span>
                      {getImportanceBadge(gap.importance)}
                      {getStatusBadge(gap.status)}
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium bg-slate-100/70 px-2 py-0.5 rounded">
                        {gap.recommended_resolution_method === "ask_user" ? (
                          <>
                            <User className="w-3 h-3 text-indigo-500" />
                            Recommended: Ask Me
                          </>
                        ) : (
                          <>
                            <Search className="w-3 h-3 text-blue-500" />
                            Recommended: Web Research
                          </>
                        )}
                      </span>
                    </div>

                    {/* Action trigger buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openAskMe(gap)}
                        disabled={isWorking}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          gap.status === "answered"
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 shadow-2xs"
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        {gap.status === "answered" ? "Edit Answer" : "Answer Question"}
                      </button>

                      <button
                        type="button"
                        onClick={() => openResearch(gap)}
                        disabled={isWorking}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          gap.status === "researched"
                            ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                            : gap.status === "research_queued"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                        }`}
                      >
                        <Search className="w-3.5 h-3.5 text-blue-600" />
                        {gap.status === "researched" ? "Re-Research" : "Research Web"}
                      </button>
                    </div>
                  </div>

                  {/* Question */}
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug mb-1.5">
                    {gap.question}
                  </h4>

                  {/* Reason */}
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    <span className="font-semibold text-slate-700">Why this matters: </span>
                    {gap.reason}
                  </p>

                  {/* Affected Options Chips */}
                  {gap.affected_options && gap.affected_options.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium mr-1">
                        Affected Options:
                      </span>
                      {gap.affected_options.map((opt, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium"
                        >
                          <Tag className="w-2.5 h-2.5 text-slate-400" />
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Researched Findings Display (Phase 8) */}
                  {gap.status === "researched" && (
                    <div className="mt-3 p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-indigo-600" />
                          <span className="text-xs font-bold text-indigo-950">
                            Synthesized Web Evidence:
                          </span>
                        </div>
                        {finding && getConsensusBadge(finding.consensus, finding.is_verified)}
                      </div>

                      <p className="text-xs font-medium text-slate-800 leading-relaxed">
                        {gap.answer || (finding && finding.synthesis)}
                      </p>

                      {/* Evidence inspection toggle button */}
                      {finding && finding.sources && finding.sources.length > 0 && (
                        <div className="pt-1 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFindingGapId(
                                isFindingExpanded ? null : gap.id
                              )
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            {isFindingExpanded
                              ? "Hide Evidence Breakdown"
                              : `View ${finding.sources.length} Sources & Provenance`}
                            {isFindingExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Query: &quot;{finding.narrow_query}&quot;
                          </span>
                        </div>
                      )}

                      {/* Detailed Sources & Claims Inspector */}
                      {isFindingExpanded && finding && (
                        <div className="mt-3 pt-3 border-t border-indigo-100/80 space-y-3 animate-in fade-in">
                          <div className="space-y-2">
                            <span className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                              Retrieved Sources ({finding.sources.length}):
                            </span>
                            <div className="space-y-2">
                              {finding.sources.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5 shadow-2xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                      <span className="text-slate-400 font-mono text-[10px]">
                                        [{idx + 1}]
                                      </span>
                                      {s.source_title}
                                    </div>
                                    {getReliabilityBadge(s.reliability_label)}
                                  </div>

                                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    <a
                                      href={s.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline truncate max-w-sm"
                                    >
                                      {s.url}
                                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                    </a>
                                    <span>•</span>
                                    <span>{new Date(s.retrieval_timestamp).toLocaleDateString()}</span>
                                  </div>

                                  {s.relevant_claims && s.relevant_claims.length > 0 && (
                                    <div className="bg-slate-50 p-2 rounded text-[11px] text-slate-700 border border-slate-100 font-mono leading-relaxed">
                                      {s.relevant_claims.map((c, ci) => (
                                        <p key={ci}>&ldquo;{c}&rdquo;</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Claims Consensus Breakdown */}
                          {finding.claims && finding.claims.length > 0 && (
                            <div className="space-y-1.5 pt-2 border-t border-indigo-100/80">
                              <span className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                                Claim Verification Status:
                              </span>
                              <div className="space-y-1.5">
                                {finding.claims.map((c, cidx) => (
                                  <div
                                    key={cidx}
                                    className="p-2 bg-white rounded border border-slate-200 text-[11px] flex items-start justify-between gap-2"
                                  >
                                    <span className="text-slate-800 font-medium">{c.claim}</span>
                                    <span className="shrink-0 font-bold">
                                      {c.is_verified ? (
                                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px] inline-flex items-center gap-1">
                                          <Check className="w-2.5 h-2.5" />
                                          Verified Fact
                                        </span>
                                      ) : (
                                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px]">
                                          Unverified / Disputed
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* If answered via Ask Me, display answer banner */}
                  {gap.status === "answered" && gap.answer && (
                    <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-800 mb-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Recorded Fact (Integrated into Decision):
                      </div>
                      <p className="font-medium text-slate-800 pl-5">{gap.answer}</p>
                    </div>
                  )}

                  {/* If skipped, display notice */}
                  {gap.status === "skipped" && (
                    <div className="mt-3 p-3 bg-purple-50/70 border border-purple-200 rounded-lg text-xs text-purple-900">
                      <div className="flex items-center gap-1.5 font-semibold text-purple-800">
                        <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                        Explicitly Retained as Unknown:
                      </div>
                      <p className="text-purple-700 text-[11px] pl-5 mt-0.5">
                        This gap remains marked as an unresolved uncertainty in decision unknowns, preventing premature assumptions.
                      </p>
                    </div>
                  )}

                  {/* If queued without execution yet */}
                  {gap.status === "research_queued" && gap.research_query && (
                    <div className="mt-3 p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-blue-800">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          Validated Research Flow Queued:
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExecuteResearch(gap, true)}
                          disabled={isWorking}
                          className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline"
                        >
                          Execute Now (Test Provider)
                        </button>
                      </div>
                      <p className="font-mono text-[11px] text-blue-950 pl-5 bg-white/70 p-1.5 rounded border border-blue-200/60 my-1">
                        Query: &quot;{gap.research_query}&quot;
                      </p>
                    </div>
                  )}
                </div>

                {/* Inline Action Drawer (Ask Me or Research This) */}
                {isActionOpen && (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-3 animate-in fade-in">
                    {actionType === "ask_me" ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                            <User className="w-4 h-4 text-indigo-600" />
                            Provide Direct Answer (Ask Me)
                          </div>
                          <button
                            type="button"
                            onClick={closeActionBox}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-xs text-slate-500">
                          Your answer will be converted into a verified decision fact and updated in structured findings.
                        </p>

                        <textarea
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          placeholder="Type your answer, internal constraint, or team preference..."
                          rows={2}
                          className="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleAnswerSubmit(gap, true)}
                            disabled={isWorking}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors font-medium"
                          >
                            Skip (Mark as Unknown)
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={closeActionBox}
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAnswerSubmit(gap, false)}
                              disabled={isWorking || !answerInput.trim()}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                            >
                              {isWorking ? (
                                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              Save Answer
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                            <Globe className="w-4 h-4 text-blue-600" />
                            Execute External Web Research (Research This — Phase 8)
                          </div>
                          <button
                            type="button"
                            onClick={closeActionBox}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-xs text-slate-500">
                          Executes narrowly scoped web search to retrieve official vendor documentation and primary benchmarks. Unsupported claims will never be marked verified.
                        </p>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700 block">
                            Narrowly Scoped Search Query:
                          </label>
                          <input
                            type="text"
                            value={researchQueryInput}
                            onChange={(e) => setResearchQueryInput(e.target.value)}
                            placeholder="e.g. Google Spanner vs AWS Aurora failover SLA recovery benchmark"
                            className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            id={`mock-toggle-${gap.id}`}
                            checked={forceMockToggle}
                            onChange={(e) => setForceMockToggle(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <label htmlFor={`mock-toggle-${gap.id}`} className="text-[11px] cursor-pointer">
                            Use deterministic test provider (recommended for local development without API keys)
                          </label>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                          <button
                            type="button"
                            onClick={() => handleQueueResearch(gap)}
                            disabled={isWorking}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors font-medium"
                          >
                            Queue Without Executing
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={closeActionBox}
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExecuteResearch(gap)}
                              disabled={isWorking || !researchQueryInput.trim()}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                            >
                              {isWorking ? (
                                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Search className="w-3.5 h-3.5" />
                              )}
                              Execute Web Research
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
