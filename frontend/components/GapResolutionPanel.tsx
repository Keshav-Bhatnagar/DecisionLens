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
  BookOpen,
  Copy,
  Share2,
} from "lucide-react";
import {
  analyzeDecisionInputs,
  detectGaps,
  getGaps,
  answerGap,
  executeGapResearch,
  getDecisionResearch,
  shareGapsToSlack,
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
  isAdvancing?: boolean;
}

export default function GapResolutionPanel({
  decisionId,
  initialGaps,
  onGapsUpdated,
  onAdvanceToNextStage,
  isAdvancing = false,
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
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);
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
      await analyzeDecisionInputs(decisionId);
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Critical Blocker
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-orange-500/10 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300 border border-orange-500/30">
            High Impact
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium uppercase tracking-wider bg-paper-sidebar text-ink-secondary border border-border">
            Tactical
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono text-ink-secondary border border-border">
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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
            Grounded Fact
          </span>
        );
      case "researched":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-sky-500/10 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30">
            Empirically Audited
          </span>
        );
      case "skipped":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-paper-sidebar text-ink-secondary border border-border">
            Known Risk
          </span>
        );
      case "research_queued":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
            Research Queued
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
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
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
            CORROBORATED BENCHMARK {isVerified && <Check className="w-3 h-3 text-emerald-500 inline ml-0.5" />}
          </span>
        );
      case "conflicting_evidence":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            CONFLICTING EVIDENCE / DIVERGENT METRICS
          </span>
        );
      case "unsupported":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-rose-500/10 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30">
            <X className="w-3.5 h-3.5 text-rose-500" />
            FALSIFIED / UNSUPPORTED CLAIM
          </span>
        );
      case "single_source":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-sky-500/10 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30">
            <Info className="w-3.5 h-3.5 text-sky-500" />
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

  const [copiedGaps, setCopiedGaps] = useState(false);
  const [showSlackBox, setShowSlackBox] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("decisionlens_slack_webhook") || "" : ""
  );
  const [sendingSlack, setSendingSlack] = useState(false);
  const [slackFeedback, setSlackFeedback] = useState<string | null>(null);

  const handleCopyGapsForSlack = () => {
    const openGaps = gaps.filter((g) => g.status === "pending" || g.status === "research_queued");
    const target = openGaps.length > 0 ? openGaps : gaps;
    if (target.length === 0) return;
    const text = [
      `*Missing Meeting Takeaways & Open Gaps (${target.length})*`,
      ...target.map((g, i) => `${i + 1}. [${(g.importance || "important").toUpperCase()}] ${g.question}`),
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopiedGaps(true);
    setTimeout(() => setCopiedGaps(false), 2000);
  };

  const handleSendToSlack = async () => {
    const url = slackWebhook.trim();
    if (!url) return;
    setSendingSlack(true);
    setSlackFeedback(null);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("decisionlens_slack_webhook", url);
      }
      const res = await shareGapsToSlack(decisionId, url, false);
      setSlackFeedback(res.message);
      setTimeout(() => setSlackFeedback(null), 4000);
    } catch (err: unknown) {
      setSlackFeedback(err instanceof Error ? err.message : "Failed to send to Slack");
    } finally {
      setSendingSlack(false);
    }
  };

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

  const activeGap = useMemo(() => {
    if (gaps.length === 0) return null;
    if (selectedGapId) {
      const found = gaps.find((g) => g.id === selectedGapId);
      if (found) return found;
    }
    return gaps.find((g) => g.status === "pending") || gaps[0];
  }, [gaps, selectedGapId]);

  const activeGapIdx = activeGap ? gaps.findIndex((g) => g.id === activeGap.id) : -1;

  const advanceToNextGap = (currentId: string) => {
    const curIdx = gaps.findIndex((g) => g.id === currentId);
    const nextPending =
      gaps.slice(curIdx + 1).find((g) => g.status === "pending") ||
      gaps.find((g) => g.id !== currentId && g.status === "pending") ||
      gaps[(curIdx + 1) % gaps.length];
    if (nextPending) {
      setSelectedGapId(nextPending.id);
      setAnswerInput(nextPending.answer || "");
    }
  };

  return (
    <div className="space-y-4 text-[#1d1d1b] dark:text-[#F0EAE1] font-sans">
      {error && (
        <div className="p-3.5 bg-rose-500/10 dark:bg-rose-950/30 border border-rose-500/30 rounded-md text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-[#4f4b40] dark:text-[#A89F91] flex items-center justify-center gap-2 font-courier">
          <RotateCw className="w-4 h-4 animate-spin text-[#7a4e10] dark:text-[#D4AA50]" />
          Loading questions...
        </div>
      ) : gaps.length === 0 ? (
        <div className="p-10 text-center bg-[#EDE5D5] dark:bg-[#221F1C] rounded-md border border-[#cfc7b2] dark:border-[#38332C] space-y-3">
          <HelpCircle className="w-9 h-9 text-[#7a4e10]/70 mx-auto" />
          <h3 className="text-lg font-newsreader text-[#1d1d1b] dark:text-[#F0EAE1]">
            No Open Questions Found Yet
          </h3>
          <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] max-w-md mx-auto">
            Scan your Stage 01 notes and documents to surface any missing constraints or assumptions.
          </p>
          <button
            type="button"
            onClick={handleDetectGaps}
            disabled={isDetecting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] rounded-md text-xs font-semibold cursor-pointer"
          >
            {isDetecting ? "Scanning..." : "Scan Notes for Questions"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT 4-COL: Scannable Question Queue */}
          <aside className="lg:col-span-4 bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-4 shadow-2xs space-y-3">
            <div className="space-y-2 border-b border-[#cfc7b2] dark:border-[#38332C] pb-3">
              <div className="flex items-center justify-between text-xs font-courier">
                <span className="font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                  Questions
                </span>
                <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                  {answeredCount + researchedCount} of {totalCount} Answered
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] overflow-hidden">
                <div
                  className="h-full bg-[#7a4e10] dark:bg-[#D4AA50] transition-all duration-500"
                  style={{ width: `${groundingPercentage}%` }}
                />
              </div>
            </div>

            <div className="divide-y divide-[#cfc7b2]/70 dark:divide-[#38332C]">
              {gaps.map((g, idx) => {
                const isSelected = activeGap?.id === g.id;
                const isDone = g.status === "answered" || Boolean(findingsMap[g.id]);
                const isSkipped = g.status === "skipped";
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGapId(g.id);
                      setAnswerInput(g.answer || "");
                    }}
                    className={`w-full text-left py-2.5 px-2.5 rounded transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                      isSelected
                        ? "bg-[#E5DEC9] dark:bg-[#181614] border-l-2 border-l-[#7a4e10] dark:border-l-[#D4AA50]"
                        : "hover:bg-[#E5DEC9]/50 dark:hover:bg-[#181614]/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] line-clamp-1 leading-snug">
                        {idx + 1}. {g.question}
                      </span>
                      {g.answer && (
                        <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91] truncate block mt-0.5">
                          {g.answer}
                        </span>
                      )}
                    </div>
                    <span className="font-courier text-[11px] font-bold shrink-0 mt-0.5 text-[#7a4e10] dark:text-[#D4AA50]">
                      {isDone ? "✓" : isSkipped ? "–" : isSelected ? "●" : "○"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[#cfc7b2] dark:border-[#38332C] space-y-2 font-courier">
              {onAdvanceToNextStage && (
                <button
                  type="button"
                  disabled={isAdvancing}
                  onClick={onAdvanceToNextStage}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[#F4F0E6] rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isAdvancing ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating Verdict...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Final Decision</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}

              <div className="flex items-center justify-between text-[11px] text-[#4f4b40] dark:text-[#A89F91] pt-1">
                <button
                  type="button"
                  onClick={handleDetectGaps}
                  disabled={isDetecting}
                  title="Scan Stage 01 notes for any newly added gaps without erasing your existing answers"
                  className="hover:underline cursor-pointer"
                >
                  {isDetecting ? "Scanning..." : "Scan for new gaps"}
                </button>
                <button
                  type="button"
                  onClick={handleCopyGapsForSlack}
                  className="hover:underline cursor-pointer"
                >
                  {copiedGaps ? "Copied!" : "Copy questions"}
                </button>
              </div>
            </div>
          </aside>

          {/* RIGHT 8-COL: Single Focused Active Question Card */}
          {activeGap && (() => {
            const isWorking = actionInProgressId === activeGap.id;
            const finding = findingsMap[activeGap.id];
            const isCritical = activeGap.importance === "critical";

            return (
              <div className="lg:col-span-8 bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-6 sm:p-7 shadow-2xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#cfc7b2]/70 dark:border-[#38332C] pb-3 font-courier">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#7a4e10] dark:text-[#D4AA50]">
                      Question {activeGapIdx + 1} of {gaps.length} · {isCritical ? "High Impact" : "Optional"}
                    </span>
                    {activeGap.status === "answered" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]">
                        Answered ✓
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExecuteResearch(activeGap, false)}
                    disabled={isWorking}
                    title="Search the web for real-world benchmarks and attach findings below"
                    className="text-xs font-sans font-semibold text-[#7a4e10] dark:text-[#D4AA50] hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {isWorking ? "Searching web..." : "Fetch web benchmark ↓"}
                  </button>
                </div>

                <div className="space-y-2">
                  <h2 className="font-newsreader text-xl sm:text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug">
                    {activeGap.question}
                  </h2>
                  <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                    {activeGap.reason || "Answering this helps sharpen your final recommendation."}
                  </p>
                </div>

                {finding && (
                  <div className="p-3.5 rounded-md bg-[#E5DEC9]/80 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-2 text-xs">
                    <span className="font-courier text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                      Web Benchmark Found
                    </span>
                    <p className="text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed">
                      {finding.synthesis}
                    </p>
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await handleQuickResolve(activeGap, "Proceed with conservative baseline within current budget, timeline, and team capacity.");
                      advanceToNextGap(activeGap.id);
                    }}
                    disabled={isWorking}
                    className="w-full text-left p-3.5 rounded-md bg-[#E5DEC9]/80 hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] transition cursor-pointer disabled:opacity-50"
                  >
                    <div className="text-sm font-semibold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Conservative Baseline
                    </div>
                    <div className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-0.5">
                      Stick strictly to current budget, timeline, and team capacity.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await handleQuickResolve(activeGap, "Plan with growth contingency buffer for higher scope, adoption, or edge cases.");
                      advanceToNextGap(activeGap.id);
                    }}
                    disabled={isWorking}
                    className="w-full text-left p-3.5 rounded-md bg-[#E5DEC9]/80 hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] transition cursor-pointer disabled:opacity-50"
                  >
                    <div className="text-sm font-semibold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Add Contingency Buffer
                    </div>
                    <div className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-0.5">
                      Allow extra budget or rollout time for unexpected scope or edge cases.
                    </div>
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="text-xs font-semibold text-[#4f4b40] dark:text-[#A89F91] block">
                    Or type your exact answer:
                  </label>
                  <textarea
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    placeholder="e.g. Under 1 week onboarding, $500/mo hard cap..."
                    rows={2}
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border-2 border-[#b8af99] dark:border-[#38332C] bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7d7567] focus:outline-none focus:border-[#7a4e10] dark:focus:border-[#D4AA50]"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#cfc7b2]/70 dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={async () => {
                      await handleAnswerSubmit(activeGap, true);
                      advanceToNextGap(activeGap.id);
                    }}
                    disabled={isWorking}
                    className="text-xs font-semibold text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] hover:underline cursor-pointer"
                  >
                    Skip for now
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!answerInput.trim()) return;
                      await handleQuickResolve(activeGap, answerInput.trim());
                      advanceToNextGap(activeGap.id);
                    }}
                    disabled={isWorking || !answerInput.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:text-[#181614] text-[#F4F0E6] text-xs font-semibold rounded-md transition disabled:opacity-45 cursor-pointer"
                  >
                    <span>{isWorking ? "Saving..." : "Save & Next Question"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
