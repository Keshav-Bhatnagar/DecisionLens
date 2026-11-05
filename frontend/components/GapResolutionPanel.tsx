"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Flame,
  FileCheck2,
  AlertTriangle,
  Zap,
} from "lucide-react";
import {
  detectGaps,
  getGaps,
  answerGap,
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
import { DecisionLensIcon } from "@/components/DecisionLensLogo";

interface GapResolutionPanelProps {
  decisionId: number;
  initialGaps?: Record<string, unknown>;
  onGapsUpdated?: () => void;
  onAdvanceToNextStage?: () => void;
}

export default function GapResolutionPanel({
  decisionId,
  initialGaps,
  onGapsUpdated,
  onAdvanceToNextStage,
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

  // Streamlined 3-Track Filter Tabs (plus All)
  const [activeTrack, setActiveTrack] = useState<"blockers" | "research" | "resolved" | "all">("blockers");

  // Inline action state
  const [activeActionGapId, setActiveActionGapId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"ask_me" | "research" | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [researchQueryInput, setResearchQueryInput] = useState("");
  const [forceMockToggle, setForceMockToggle] = useState(false);

  // Automated Web Research Runner State
  const [isAutoResearching, setIsAutoResearching] = useState(false);
  const [autoResearchProgress, setAutoResearchProgress] = useState<{ current: number; total: number } | null>(null);

  // Batch Secondary Bundle State
  const [isBatchAccepting, setIsBatchAccepting] = useState(false);
  const [batchDirectiveInput, setBatchDirectiveInput] = useState("");
  const [isSecondaryExpanded, setIsSecondaryExpanded] = useState(false);

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
    setLoading(true);
    setError(null);
    try {
      const res = await getGaps(decisionId);
      updateStateFromResponse(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load information gaps");
    } finally {
      setLoading(false);
    }
  }, [decisionId, updateStateFromResponse]);

  const fetchResearchFindings = useCallback(async () => {
    try {
      const res = await getDecisionResearch(decisionId);
      if (res && res.findings) {
        const map: Record<string, ResearchFindingItem> = {};
        res.findings.forEach((f) => {
          map[f.gap_id] = f;
        });
        setFindingsMap(map);
      }
    } catch {
      // Non-critical background retrieval
    }
  }, [decisionId]);

  useEffect(() => {
    if (initialGaps && "gaps" in initialGaps && Array.isArray(initialGaps.gaps)) {
      updateStateFromResponse(initialGaps as unknown as GapsResponse);
      fetchResearchFindings();
    } else {
      fetchGaps();
      fetchResearchFindings();
    }
  }, [decisionId, initialGaps, updateStateFromResponse, fetchGaps, fetchResearchFindings]);

  // Epistemic Grounding Ratio (0 - 100%)
  const groundingPercentage = useMemo(() => {
    if (totalCount === 0) return 0;
    const resolved = answeredCount + researchedCount;
    return Math.min(100, Math.round((resolved / totalCount) * 100));
  }, [totalCount, answeredCount, researchedCount]);

  const handleDetectGaps = async () => {
    setIsDetecting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await detectGaps(decisionId, false);
      updateStateFromResponse(res);
      setSuccessMsg(
        `Epistemic audit complete! Identified ${res.total_gaps} information gaps across critical assumptions.`
      );
      if (onGapsUpdated) onGapsUpdated();
      fetchResearchFindings();
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
        `${gap.question.replace(/\?$/, "")} benchmark post-mortem limits`
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
        setSuccessMsg(`Logged as Known Risk: "${gap.question.slice(0, 40)}..." flagged for Stage 4 risk scoring.`);
      } else {
        setSuccessMsg(`Grounded! Answer integrated directly into decision baseline facts.`);
      }

      closeActionBox();
      if (onGapsUpdated) onGapsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record answer");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleQuickResolve = async (gap: GapItem, resolutionText: string) => {
    setActionInProgressId(gap.id);
    setError(null);
    try {
      const updated = await answerGap(decisionId, gap.id, resolutionText, false);
      setGaps((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
      const gRes = await getGaps(decisionId);
      updateStateFromResponse(gRes);
      setSuccessMsg(`Grounded: "${resolutionText.slice(0, 50)}..." recorded into decision baseline.`);
      if (onGapsUpdated) onGapsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record resolution");
    } finally {
      setActionInProgressId(null);
    }
  };

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

      setFindingsMap((prev) => ({
        ...prev,
        [gap.id]: res.finding,
      }));

      setGaps((prev) =>
        prev.map((g) => (g.id === res.updated_gap.id ? { ...g, ...res.updated_gap } : g))
      );

      const gRes = await getGaps(decisionId);
      updateStateFromResponse(gRes);
      fetchResearchFindings();

      setSuccessMsg(
        `Empirical Web Research complete: Retrieved ${res.finding.sources.length} sources (${res.finding.consensus}).`
      );
      closeActionBox();
      if (onGapsUpdated) onGapsUpdated();
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Research execution failed";
      if (msg.includes("not configured") || msg.includes("SEARCH_API_KEY")) {
        setUnconfiguredProviderError(true);
      }
      setError(msg);
    } finally {
      setActionInProgressId(null);
    }
  };

  // Tier 1: Auto-resolve all pending web research gaps
  const handleAutoResolveWebGaps = async () => {
    const pending = gaps.filter(
      (g) =>
        g.recommended_resolution_method === "web_research" &&
        (g.status === "pending" || g.status === "research_queued")
    );
    if (pending.length === 0) return;

    setIsAutoResearching(true);
    setError(null);
    setAutoResearchProgress({ current: 0, total: pending.length });

    try {
      for (let i = 0; i < pending.length; i++) {
        const gap = pending[i];
        setAutoResearchProgress({ current: i + 1, total: pending.length });
        try {
          await executeGapResearch(decisionId, gap.id, undefined, false);
        } catch {
          try {
            await executeGapResearch(decisionId, gap.id, undefined, true);
          } catch {
            // Gracefully continue
          }
        }
      }

      const gRes = await getGaps(decisionId);
      updateStateFromResponse(gRes);
      await fetchResearchFindings();
      if (onGapsUpdated) onGapsUpdated();

      setSuccessMsg(`Auto-resolved ${pending.length} external evidence gaps via empirical web research!`);
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Auto-research runner encountered an error");
    } finally {
      setIsAutoResearching(false);
      setAutoResearchProgress(null);
    }
  };

  // Tier 3: Batch accept all secondary / lower-priority doubts
  const handleBatchAcceptSecondary = async () => {
    const criticalIds = new Set(
      gaps
        .filter(
          (g) =>
            g.recommended_resolution_method !== "web_research" &&
            (g.importance === "critical" || g.importance === "high")
        )
        .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
        .slice(0, 3)
        .map((g) => g.id)
    );

    const secondaryPending = gaps.filter(
      (g) =>
        g.recommended_resolution_method !== "web_research" &&
        g.status === "pending" &&
        !criticalIds.has(g.id)
    );

    if (secondaryPending.length === 0) return;

    setIsBatchAccepting(true);
    setError(null);

    try {
      const note = batchDirectiveInput.trim()
        ? `Consolidated Directive: ${batchDirectiveInput.trim()}`
        : "Accepted as standard operational baseline parameter and known non-blocking factor.";

      for (const gap of secondaryPending) {
        await answerGap(decisionId, gap.id, note, true);
      }

      const gRes = await getGaps(decisionId);
      updateStateFromResponse(gRes);
      if (onGapsUpdated) onGapsUpdated();

      setSuccessMsg(
        `Consolidated! Accepted all ${secondaryPending.length} secondary considerations as operational baseline.`
      );
      setBatchDirectiveInput("");
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Batch acceptance failed");
    } finally {
      setIsBatchAccepting(false);
    }
  };

  // Importance Badges
  const getImportanceBadge = (importance: GapImportance) => {
    switch (importance) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
            Critical Blocker
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-orange-50 text-orange-800 border border-orange-200">
            High Impact
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase tracking-wider bg-paper-sidebar text-ink-secondary border border-border">
            Tactical
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono text-ink-secondary border border-border">
            Low
          </span>
        );
    }
  };

  // Status Badges
  const getStatusBadge = (status: GapStatus) => {
    switch (status) {
      case "answered":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Grounded Fact
          </span>
        );
      case "researched":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-sky-50 text-sky-800 border border-sky-300">
            <Globe className="w-3 h-3 text-sky-600" />
            Empirically Audited
          </span>
        );
      case "skipped":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-300">
            <AlertTriangle className="w-3 h-3 text-stone-500" />
            Known Risk
          </span>
        );
      case "research_queued":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300">
            <Clock className="w-3 h-3 text-amber-600" />
            Research Queued
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 text-amber-800 border border-amber-300/80">
            Pending Resolution
          </span>
        );
    }
  };

  // Consensus / Verdict Badges for Empirical Web Research
  const getConsensusBadge = (consensus: EvidenceConsensus, isVerified: boolean) => {
    switch (consensus) {
      case "corroborated":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-emerald-50 text-emerald-900 border border-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            CORROBORATED BENCHMARK {isVerified && <Check className="w-3 h-3 text-emerald-700 inline ml-0.5" />}
          </span>
        );
      case "conflicting_evidence":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            CONFLICTING EVIDENCE / DIVERGENT METRICS
          </span>
        );
      case "unsupported":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-rose-50 text-rose-900 border border-rose-300">
            <X className="w-3.5 h-3.5 text-rose-600" />
            FALSIFIED / UNSUPPORTED CLAIM
          </span>
        );
      case "single_source":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-sky-50 text-sky-900 border border-sky-300">
            <Info className="w-3.5 h-3.5 text-sky-600" />
            SINGLE SOURCE {isVerified ? "(Primary Source Verified)" : "(Uncorroborated)"}
          </span>
        );
    }
  };

  // Tier 1: Pending Web Gaps (eligible for Auto-Resolve)
  const pendingWebGaps = useMemo(() => {
    return gaps.filter(
      (g) =>
        g.recommended_resolution_method === "web_research" &&
        (g.status === "pending" || g.status === "research_queued")
    );
  }, [gaps]);

  // Tier 2: Critical Executive Doubts (Top 3 direct/non-web pending gaps)
  const criticalDoubts = useMemo(() => {
    const directPending = gaps.filter(
      (g) =>
        g.recommended_resolution_method !== "web_research" &&
        g.status === "pending" &&
        (g.importance === "critical" || g.importance === "high")
    );
    const sorted = [...directPending].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
    return sorted.slice(0, 3);
  }, [gaps]);

  // Tier 3: Secondary Pending Doubts (Non-web pending gaps beyond the top 3 critical doubts)
  const secondaryPendingGaps = useMemo(() => {
    const criticalIds = new Set(criticalDoubts.map((g) => g.id));
    return gaps.filter(
      (g) =>
        g.recommended_resolution_method !== "web_research" &&
        g.status === "pending" &&
        !criticalIds.has(g.id)
    );
  }, [gaps, criticalDoubts]);

  // Filtered Gaps by Active Track (secondary pending gaps are bundled into the merged card)
  const filteredGaps = useMemo(() => {
    const secondaryIds = new Set(secondaryPendingGaps.map((g) => g.id));
    switch (activeTrack) {
      case "blockers":
        return gaps.filter(
          (g) =>
            (g.status === "pending" || g.status === "research_queued") &&
            !secondaryIds.has(g.id)
        );
      case "research":
        return gaps.filter(
          (g) => g.recommended_resolution_method === "web_research" || g.status === "researched"
        );
      case "resolved":
        return gaps.filter((g) => g.status === "answered" || g.status === "researched");
      case "all":
      default:
        return gaps.filter((g) => !secondaryIds.has(g.id));
    }
  }, [gaps, activeTrack, secondaryPendingGaps]);

  return (
    <div className="bg-paper-surface rounded-2xl border border-border p-6 sm:p-8 shadow-xs space-y-7 text-ink font-sans">
      
      {/* 1. Executive Header & Falsification Engine Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/80">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <DecisionLensIcon size={32} />
            <div>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-accent block leading-none">
                STAGE 03 / EVIDENCE AUDIT & RESEARCH
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-ink tracking-tight mt-1">
                Information Gaps & Evidence Dossier
              </h2>
            </div>
          </div>
          <p className="text-xs text-ink-secondary max-w-2xl font-light leading-relaxed">
            Stress-testing critical assumptions, SRE operational boundaries, and competitor benchmarks against empirical evidence before committing capital or architecture.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDetectGaps}
          disabled={isDetecting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-ink hover:opacity-90 disabled:opacity-50 text-paper-surface rounded-xl text-xs font-semibold shadow-xs transition-all shrink-0 group"
        >
          {isDetecting ? (
            <>
              <RotateCw className="w-3.5 h-3.5 animate-spin text-paper-surface" />
              Auditing Evidence Base...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-accent group-hover:scale-110 transition" />
              {gaps.length > 0 ? "Re-Audit Information Gaps" : "Run Epistemic Gap Audit"}
            </>
          )}
        </button>
      </div>

      {/* 2. Living Epistemic Grounding Meter (Macro Status Banner) */}
      <div className="p-4 sm:p-5 rounded-xl bg-paper-sidebar border border-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-mono">
            <span className="font-bold text-ink uppercase tracking-wider">Epistemic Grounding Ratio:</span>
            <span className="text-sm font-bold text-accent">{groundingPercentage}%</span>
            <span className="text-[11px] text-ink-secondary">
              ({answeredCount + researchedCount} of {totalCount} items verified)
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <strong className="text-ink">{pendingCount}</strong> Blockers Open
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <strong className="text-ink">{researchedCount}</strong> Web Audited
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <strong className="text-ink">{answeredCount}</strong> Human Decided
            </span>
          </div>
        </div>

        {/* Progress Bar with Luxury Gradient */}
        <div className="w-full h-2 rounded-full bg-paper-surface border border-border overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-emerald-600 transition-all duration-700 ease-out"
            style={{ width: `${groundingPercentage}%` }}
          />
        </div>
      </div>

      {/* 2b. Executive Fast-Track Action Bar (Tier 1 & Tier 3 Funnel) */}
      {gaps.length > 0 && (pendingWebGaps.length > 0 || secondaryPendingGaps.length > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-300/60 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-amber-500/10 text-accent shrink-0">
              <Zap className="w-4 h-4 text-accent" />
            </span>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-ink uppercase tracking-wider">
                  Executive Fast-Track:
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-paper-surface border border-border text-ink-secondary">
                  {criticalDoubts.length} Critical Focus • {secondaryPendingGaps.length} Bundled • {pendingWebGaps.length} Web Gaps
                </span>
              </div>
              <p className="text-[11px] text-ink-secondary">
                {pendingWebGaps.length > 0
                  ? `${pendingWebGaps.length} external evidence queries can be auto-resolved in background.`
                  : "External evidence queries cleared. Focus on core critical doubts below."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {pendingWebGaps.length > 0 && (
              <button
                type="button"
                onClick={handleAutoResolveWebGaps}
                disabled={isAutoResearching}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-paper-surface rounded-lg text-xs font-semibold shadow-xs transition"
              >
                {isAutoResearching ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Resolving {autoResearchProgress?.current || 1}/{autoResearchProgress?.total || pendingWebGaps.length}...
                    </span>
                  </>
                ) : (
                  <>
                    <Globe className="w-3.5 h-3.5" />
                    <span>Auto-Resolve Web Gaps ({pendingWebGaps.length})</span>
                  </>
                )}
              </button>
            )}

            {secondaryPendingGaps.length > 0 && (
              <button
                type="button"
                onClick={handleBatchAcceptSecondary}
                disabled={isBatchAccepting}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-ink hover:opacity-90 disabled:opacity-50 text-paper-surface rounded-lg text-xs font-semibold shadow-xs transition"
              >
                {isBatchAccepting ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Bundling...</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-3.5 h-3.5 text-accent" />
                    <span>Accept Secondary Bundle ({secondaryPendingGaps.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2 animate-in fade-in">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink text-paper-surface hover:opacity-90 rounded-lg text-xs font-semibold shadow-xs transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent" />
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

      {/* 3. Streamlined 3-Track Navigation (Replacing 6 tabs) */}
      {gaps.length > 0 && (
        <div className="flex items-center p-1 bg-paper-sidebar rounded-xl border border-border gap-1 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTrack("blockers")}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTrack === "blockers"
                ? "bg-paper-surface text-ink font-bold shadow-2xs border border-border"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Critical Blockers ({pendingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTrack("research")}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTrack === "research"
                ? "bg-paper-surface text-ink font-bold shadow-2xs border border-border"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-sky-600" />
            <span>Empirical Web Research ({researchedCount + researchQueuedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTrack("resolved")}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTrack === "resolved"
                ? "bg-paper-surface text-ink font-bold shadow-2xs border border-border"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Audited Facts ({answeredCount + researchedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTrack("all")}
            className={`py-2 px-3.5 rounded-lg font-medium transition-all text-ink-secondary hover:text-ink ${
              activeTrack === "all" ? "bg-paper-surface text-ink font-bold shadow-2xs border border-border" : ""
            }`}
          >
            All Dossier ({totalCount})
          </button>
        </div>
      )}

      {/* 4. Gaps Dossier Cards */}
      {loading ? (
        <div className="py-12 text-center text-xs text-ink-secondary flex items-center justify-center gap-2.5 font-mono">
          <RotateCw className="w-4 h-4 animate-spin text-accent" />
          Loading epistemic gap dossier...
        </div>
      ) : gaps.length === 0 ? (
        <div className="p-10 text-center bg-paper-sidebar rounded-2xl border border-dashed border-border space-y-3">
          <HelpCircle className="w-10 h-10 text-accent/60 mx-auto" />
          <h3 className="text-base font-serif font-bold text-ink">
            No Information Gaps Audited Yet
          </h3>
          <p className="text-xs text-ink-secondary max-w-md mx-auto leading-relaxed">
            Click <strong>Run Epistemic Gap Audit</strong> to analyze your Stage 2 structured findings, extract hidden operational blindspots, and prepare empirical research queries.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleDetectGaps}
              disabled={isDetecting}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink text-paper-surface hover:opacity-90 rounded-xl text-xs font-semibold shadow-xs transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Run Epistemic Gap Audit Now
            </button>
          </div>
        </div>
      ) : filteredGaps.length === 0 ? (
        <div className="p-8 text-center text-xs text-ink-secondary bg-paper-sidebar rounded-xl border border-border font-mono">
          No information gaps in the selected track.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGaps.map((gap) => {
            const isActionOpen = activeActionGapId === gap.id;
            const isWorking = actionInProgressId === gap.id;
            const finding = findingsMap[gap.id];
            const isCritical = gap.importance === "critical";

            return (
              <div
                key={gap.id}
                className={`rounded-2xl border transition-all bg-paper-surface p-6 sm:p-7 space-y-6 shadow-2xs ${
                  isCritical && gap.status === "pending"
                    ? "border-amber-300 ring-1 ring-amber-200/60"
                    : "border-border hover:border-accent/40"
                }`}
              >
                {/* 1. Header Meta Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/70">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-ink-secondary bg-paper-sidebar px-2 py-0.5 rounded border border-border">
                      #{gap.priority_score}
                    </span>
                    {getImportanceBadge(gap.importance)}
                    {getStatusBadge(gap.status)}

                    <span className="text-[11px] font-mono text-ink-secondary flex items-center gap-1.5 px-2 py-0.5 rounded bg-paper-sidebar border border-border">
                      {gap.recommended_resolution_method === "web_research" ? (
                        <>
                          <Globe className="w-3 h-3 text-sky-600" />
                          <span>Empirical Web Research</span>
                        </>
                      ) : (
                        <>
                          <User className="w-3 h-3 text-accent" />
                          <span>Executive Decision</span>
                        </>
                      )}
                    </span>
                  </div>

                  {gap.affected_options && gap.affected_options.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-ink-secondary">
                      <span className="text-accent uppercase text-[10px] font-bold">Stakes on:</span>
                      <div className="flex items-center gap-1">
                        {gap.affected_options.map((opt, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-paper-sidebar border border-border text-ink font-semibold">
                            {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Core Question / Claim */}
                <div className="space-y-1">
                  <h3 className="text-lg sm:text-xl font-serif font-bold text-ink leading-snug">
                    {gap.question}
                  </h3>
                </div>

                {/* Part 1: The Strategic Stakes (Why this matters) */}
                <div className="p-4 rounded-xl bg-paper-sidebar/70 border border-border space-y-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-accent uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 text-accent" />
                    <span>The Strategic Stakes & Downstream Impact</span>
                  </div>
                  <p className="text-xs text-ink leading-relaxed font-sans">
                    {gap.reason || "This unknown represents a foundational constraint that directly dictates downstream architectural feasibility and financial risk."}
                  </p>
                  {gap.source_spans && gap.source_spans.length > 0 && (
                    <div className="pt-2 text-[11px] font-mono text-ink-secondary border-t border-border/50">
                      <span className="text-[10px] uppercase text-accent font-bold mr-1.5">Evidence Origin:</span>
                      <span className="italic text-ink">&ldquo;{gap.source_spans[0]}&rdquo;</span>
                    </div>
                  )}
                </div>

                {/* Part 2: Verified Empirical Evidence & Benchmarks (Transparent Receipts) */}
                <div className="p-4 rounded-xl bg-paper-sidebar/40 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-sky-800 uppercase tracking-wider">
                      <Globe className="w-3.5 h-3.5 text-sky-600" />
                      <span>Verified Evidence & Transparent Receipts</span>
                    </div>

                    {finding && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300">
                        {finding.sources?.length || 0} Sources Corroborated
                      </span>
                    )}
                  </div>

                  {finding ? (
                    <div className="space-y-2.5">
                      <p className="text-xs text-ink leading-relaxed font-sans bg-paper-surface p-3.5 rounded-lg border border-border">
                        {finding.synthesis}
                      </p>

                      {/* Verified Claims */}
                      {finding.claims && finding.claims.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {finding.claims.map((clm, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] font-mono bg-paper-surface p-2 rounded border border-border flex items-start justify-between gap-2"
                            >
                              <span className="text-ink">{clm.claim}</span>
                              <span className="text-[10px] text-accent shrink-0 uppercase font-bold">
                                {clm.evidence_type} ({clm.sources_count} sources)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Clickable Transparent Sources */}
                      {finding.sources && finding.sources.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-mono uppercase text-ink-secondary block">
                            Direct Primary Sources (Click to verify with your own eyes):
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {finding.sources.map((src, idx) => (
                              <a
                                key={idx}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-paper-surface border border-border text-[11px] font-mono text-sky-800 hover:text-ink hover:border-sky-500 transition group"
                              >
                                <Globe className="w-3 h-3 text-sky-600" />
                                <span className="font-semibold">{src.source_title || src.url}</span>
                                <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-ink-secondary bg-paper-surface p-3 rounded-lg border border-border">
                      <span>No external benchmark receipts queried yet for this specific parameter.</span>
                      <button
                        type="button"
                        onClick={() => handleExecuteResearch(gap, false)}
                        disabled={isWorking}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-paper-surface rounded-lg text-xs font-semibold shrink-0 transition"
                      >
                        {isWorking ? (
                          <>
                            <RotateCw className="w-3 h-3 animate-spin" />
                            <span>Querying Receipts...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3 h-3" />
                            <span>Retrieve External Receipts</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Part 3: Structured Executive Decision Scenarios (No Blank Page Paralysis!) */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-accent" />
                      <span>Executive Guidance & Resolution Scenarios</span>
                    </span>

                    {gap.status === "answered" && gap.answer && (
                      <span className="text-[11px] font-mono text-emerald-800 font-semibold">
                        Grounded: &ldquo;{gap.answer.slice(0, 40)}...&rdquo;
                      </span>
                    )}
                  </div>

                  {gap.status === "answered" && gap.answer && !isActionOpen ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-mono uppercase text-emerald-800 font-bold block">
                          Audited Human Decision:
                        </span>
                        <p className="text-xs text-emerald-950 font-medium">
                          {gap.answer}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAskMe(gap)}
                        className="text-xs font-mono text-emerald-800 underline hover:text-emerald-950 shrink-0"
                      >
                        Change Guidance
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Structured Guided Scenario Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleQuickResolve(gap, `Adopt conservative operational baseline based on standard tier limits.`)}
                          disabled={isWorking}
                          className="p-3.5 rounded-xl border border-border bg-paper-sidebar/50 hover:bg-paper-surface hover:border-accent text-left transition group space-y-1 disabled:opacity-50"
                        >
                          <span className="text-[10px] font-mono font-bold uppercase text-accent block">
                            Scenario A: Conservative Standard Tier
                          </span>
                          <p className="text-xs text-ink font-medium leading-snug">
                            Design within verified standard tier limits & standard operational SLA tolerances.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickResolve(gap, `Plan for high-capacity scale-out contingency budget and provisions.`)}
                          disabled={isWorking}
                          className="p-3.5 rounded-xl border border-border bg-paper-sidebar/50 hover:bg-paper-surface hover:border-accent text-left transition group space-y-1 disabled:opacity-50"
                        >
                          <span className="text-[10px] font-mono font-bold uppercase text-accent block">
                            Scenario B: Scale-Out Allocation
                          </span>
                          <p className="text-xs text-ink font-medium leading-snug">
                            Allocate buffer contingency & enable horizontal auto-scaling provisions.
                          </p>
                        </button>
                      </div>

                      {/* Custom Input and Known Risk Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => (isActionOpen ? closeActionBox() : openAskMe(gap))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-paper-surface text-ink hover:bg-paper-sidebar border border-border transition"
                          >
                            <User className="w-3 h-3 text-accent" />
                            <span>{isActionOpen && actionType === "ask_me" ? "Close Custom Input" : "Type Exact Constraint / Figure"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAnswerSubmit(gap, true)}
                            disabled={isWorking}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-secondary hover:text-ink hover:bg-paper-sidebar border border-border transition"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Accept as Known Operational Risk</span>
                          </button>
                        </div>
                      </div>

                      {/* Inline Custom Input Box */}
                      {isActionOpen && actionType === "ask_me" && (
                        <div className="p-4 rounded-xl bg-paper-sidebar border border-border space-y-3 animate-in fade-in">
                          <textarea
                            value={answerInput}
                            onChange={(e) => setAnswerInput(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && answerInput.trim()) {
                                handleAnswerSubmit(gap, false);
                              }
                            }}
                            placeholder="State your exact metric, budget ceiling, or team constraint (Cmd + Enter to save)..."
                            rows={2}
                            className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-border bg-paper-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent font-sans leading-relaxed resize-y"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={closeActionBox}
                              className="px-3 py-1 text-xs text-ink-secondary hover:text-ink"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAnswerSubmit(gap, false)}
                              disabled={isWorking || !answerInput.trim()}
                              className="px-4 py-1.5 bg-ink text-paper-surface rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition"
                            >
                              Save Constraint
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

              </div>
            );
          })}

          {/* Tier 3: Consolidated Secondary Considerations Bundle Card (Merged into 1 Card) */}
          {(activeTrack === "blockers" || activeTrack === "all") && secondaryPendingGaps.length > 0 && (
            <div className="rounded-xl border border-amber-300/80 bg-paper-sidebar p-5 sm:p-6 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="p-2 rounded-xl bg-amber-500/10 text-accent shrink-0 mt-0.5">
                    <Layers className="w-5 h-5 text-accent" />
                  </span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-serif font-bold text-ink">
                        Consolidated Secondary Considerations
                      </h4>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        {secondaryPendingGaps.length} Items Merged Into 1 Bundle
                      </span>
                    </div>
                    <p className="text-xs text-ink-secondary max-w-xl font-light leading-relaxed">
                      Non-critical operational nuances, secondary parameter estimates, and minor trade-offs bundled into a single batch dossier so you don&apos;t waste time on trivial questionnaires.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsSecondaryExpanded(!isSecondaryExpanded)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-ink-secondary hover:text-ink hover:bg-paper-surface border border-border transition"
                  >
                    {isSecondaryExpanded ? (
                      <>
                        <span>Collapse Digest</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Review Digest ({secondaryPendingGaps.length})</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleBatchAcceptSecondary}
                    disabled={isBatchAccepting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-paper-surface rounded-xl text-xs font-semibold shadow-xs transition"
                  >
                    {isBatchAccepting ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Accepting All...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Accept All as Baseline ({secondaryPendingGaps.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Digest of all 5 merged items */}
              {isSecondaryExpanded && (
                <div className="space-y-3 pt-3 border-t border-border/80 animate-in fade-in">
                  <div className="space-y-2">
                    {secondaryPendingGaps.map((gap, idx) => (
                      <div
                        key={gap.id}
                        className="p-3.5 rounded-lg bg-paper-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-ink-secondary px-1.5 py-0.5 rounded bg-paper-sidebar border border-border">
                              #{gap.priority_score || idx + 1}
                            </span>
                            <span className="font-semibold text-ink font-sans">{gap.question}</span>
                            <span className="text-[10px] font-mono text-ink-secondary uppercase">
                              ({gap.importance})
                            </span>
                          </div>
                          {gap.reason && (
                            <p className="text-[11px] text-ink-secondary font-light pl-6">
                              {gap.reason}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => openAskMe(gap)}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-accent hover:underline shrink-0"
                        >
                          <span>Answer Separately</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Optional Overarching Directive for the Bundle */}
                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={batchDirectiveInput}
                      onChange={(e) => setBatchDirectiveInput(e.target.value)}
                      placeholder="Optional overarching directive for this bundle (e.g. 'Standardize on default cloud specs')..."
                      className="flex-1 px-3.5 py-2 text-xs bg-paper-surface border border-border rounded-lg text-ink placeholder:text-ink-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent font-sans"
                    />
                    <button
                      type="button"
                      onClick={handleBatchAcceptSecondary}
                      disabled={isBatchAccepting}
                      className="px-4 py-2 bg-ink text-paper-surface rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0 transition"
                    >
                      Apply Directive to All
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. Stage 4 Readiness & Advance Gate (Bottom Action Banner) */}
      {gaps.length > 0 && (
        <div className="pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            {pendingCount > 0 ? (
              <div className="flex items-center gap-2 text-xs font-mono text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{pendingCount} Critical Blockers remain ungrounded.</strong> Advancing will penalize option risk scores.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>All critical gaps resolved!</strong> Epistemic Grounding at {groundingPercentage}%. Ready for Stage 4.
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {onAdvanceToNextStage && (
              <button
                type="button"
                onClick={onAdvanceToNextStage}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-paper-surface hover:opacity-90 rounded-xl text-xs font-semibold shadow-xs transition-all"
              >
                <span>Advance to Thinking Frameworks</span>
                <ArrowRight className="w-3.5 h-3.5 text-accent" />
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
