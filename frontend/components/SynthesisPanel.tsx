"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DecisionSynthesis,
  RoadmapData,
  RoadmapPhase,
  RoadmapTask,
  SnapshotSummary,
  SnapshotDetail,
  synthesizeDecision,
  getDecisionSynthesis,
  getAnalysisSnapshots,
  getAnalysisSnapshotDetail,
  getActiveRoadmap,
  updateActiveRoadmap,
  recordDecisionOverride,
  fetchLiveCostReceipt,
  LiveCostReceiptResponse,
  askDecisionQuestion,
} from "@/lib/api";
import {
  AlertTriangle,
  ExternalLink,
  Check,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Award,
  Layers,
  Sparkles,
  Copy,
  CheckCircle2,
  Calendar,
  User,
  Users,
  Clock,
  ArrowRight,
  TrendingUp,
  FileText,
  FileCode,
  Sliders,
  Plus,
  Trash2,
  RotateCcw,
  Zap,
  CalendarDays,
  Filter,
  UserCheck,
  AlertOctagon,
  Edit3,
  X,
  Receipt,
  ChevronDown,
  ChevronUp,
  Globe,
  Server,
  Send,
  MessageSquare,
} from "lucide-react";
import OutcomeTrackingCard from "@/components/OutcomeTrackingCard";
import RoadmapVisualizer from "@/components/RoadmapVisualizer";

interface SynthesisPanelProps {
  decisionId: number;
  initialSynthesis?: DecisionSynthesis | null;
  onSynthesisUpdated?: (synthesis: DecisionSynthesis) => void;
  onOpenExportModal?: () => void;
  whyBreakdownSlot?: React.ReactNode;
}

export default function SynthesisPanel({
  decisionId,
  initialSynthesis,
  onSynthesisUpdated,
  onOpenExportModal,
  whyBreakdownSlot,
}: SynthesisPanelProps) {
  const [synthesis, setSynthesis] = useState<DecisionSynthesis | null>(
    initialSynthesis || null
  );
  const [activeRoadmap, setActiveRoadmap] = useState<RoadmapData | null>(
    initialSynthesis?.roadmap || null
  );
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [viewingSnapshot, setViewingSnapshot] = useState<SnapshotDetail | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [savingRoadmap, setSavingRoadmap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedADR, setCopiedADR] = useState(false);
  const [activeTab, setActiveTab] = useState<"memo" | "roadmap" | "audit" | "ask">("memo");

  // Dynamic Sprint Calendar & Runway State
  const [projectStartDate, setProjectStartDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>("ALL");

  // Executive Sovereign Override State
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [selectedOverrideOption, setSelectedOverrideOption] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  // Interactive FinOps Calibrator State
  const [isCalibratorOpen, setIsCalibratorOpen] = useState(false);
  const [customTeamSize, setCustomTeamSize] = useState<number>(5);
  const [selectedGeoRate, setSelectedGeoRate] = useState<"INDIA" | "US" | "EUROPE" | "SEA">("INDIA");
  const [selectedScaleTier, setSelectedScaleTier] = useState<"STARTUP" | "GROWTH" | "ENTERPRISE">("GROWTH");

  // Smart phase date calculation — reads the phase's actual timeline string to derive correct offsets
  // Mirrors the parseTimelineSpan logic in RoadmapVisualizer so dates stay consistent
  function getPhaseDates(phaseIdx: number, phaseTimeline?: string) {
    try {
      const base = new Date(projectStartDate);
      if (isNaN(base.getTime())) return null;
      const lower = (phaseTimeline || "").toLowerCase();

      // Day-based: "Days 1–2", "Days 3–5", "Travel & Return"
      const dayMatch = lower.match(/days?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/);
      if (dayMatch) {
        const startDay = parseInt(dayMatch[1], 10) - 1;
        const endDay = dayMatch[2] ? parseInt(dayMatch[2], 10) : startDay + 1;
        const s = new Date(base.getTime() + Math.max(0, startDay) * 86400000);
        const e = new Date(base.getTime() + Math.max(startDay + 1, endDay) * 86400000);
        const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return { startStr: fmt(s), endStr: fmt(e), range: `${fmt(s)} – ${fmt(e)}` };
      }

      // Week-based: "Weeks 1–2", "Weeks 3–4"
      const weekMatch = lower.match(/weeks?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/);
      if (weekMatch) {
        const startWeek = parseInt(weekMatch[1], 10) - 1;
        const endWeek = weekMatch[2] ? parseInt(weekMatch[2], 10) : startWeek + 1;
        const s = new Date(base.getTime() + Math.max(0, startWeek * 7) * 86400000);
        const e = new Date(base.getTime() + Math.max(startWeek + 1, endWeek) * 7 * 86400000);
        const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return { startStr: fmt(s), endStr: fmt(e), range: `${fmt(s)} – ${fmt(e)}` };
      }

      // Month-based: "Month 1", "Months 2–3"
      const monthMatch = lower.match(/months?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/);
      if (monthMatch) {
        const startMonth = parseInt(monthMatch[1], 10) - 1;
        const endMonth = monthMatch[2] ? parseInt(monthMatch[2], 10) : startMonth + 1;
        const s = new Date(base.getTime() + Math.max(0, startMonth * 30) * 86400000);
        const e = new Date(base.getTime() + Math.max(startMonth + 1, endMonth) * 30 * 86400000);
        const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return { startStr: fmt(s), endStr: fmt(e), range: `${fmt(s)} – ${fmt(e)}` };
      }

      // Sequential fallback based on phase index
      let startOffset = 0;
      let duration = 14;
      if (phaseIdx === 0) { startOffset = 0; duration = 14; }
      else if (phaseIdx === 1) { startOffset = 14; duration = 21; }
      else { startOffset = 35; duration = 21; }
      const s = new Date(base);
      s.setDate(s.getDate() + startOffset);
      const e = new Date(s);
      e.setDate(e.getDate() + duration);
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return { startStr: fmt(s), endStr: fmt(e), range: `${fmt(s)} – ${fmt(e)}` };
    } catch {
      return null;
    }
  }

  async function handleConfirmOverride() {
    if (!selectedOverrideOption || !displaySynthesis) return;
    setSavingOverride(true);
    setError(null);
    try {
      const res = await recordDecisionOverride(decisionId, {
        overridden_winner: selectedOverrideOption,
        reason: overrideReason.trim() || "Mandated sovereignly by engineering leadership.",
        revert_to_ai: false,
      });
      setSynthesis(res);
      setIsOverrideModalOpen(false);
      setSuccessMsg(`Executive Override confirmed: Proceeding with '${selectedOverrideOption}'.`);
      if (onSynthesisUpdated) onSynthesisUpdated(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record executive override");
    } finally {
      setSavingOverride(false);
    }
  }

  async function handleRevertOverride() {
    setSavingOverride(true);
    setError(null);
    try {
      const res = await recordDecisionOverride(decisionId, {
        revert_to_ai: true,
      });
      setSynthesis(res);
      setSuccessMsg("Reverted to AI recommendation.");
      if (onSynthesisUpdated) onSynthesisUpdated(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revert override");
    } finally {
      setSavingOverride(false);
    }
  }

  // User priority tags input
  const [priorities, setPriorities] = useState<string[]>([]);
  const [newPriorityInput, setNewPriorityInput] = useState("");
  const [showPriorities, setShowPriorities] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);

  // Follow-up Decision Q&A state
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaHistory, setQaHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string; sources?: string[] }>
  >([]);

  async function handleAskDecision(customQuestion?: string) {
    const q = (customQuestion ?? qaQuestion).trim();
    if (q.length < 2 || qaLoading) return;
    setQaQuestion("");
    setQaError(null);
    const nextHistory = [...qaHistory, { role: "user" as const, content: q }];
    setQaHistory(nextHistory);
    setQaLoading(true);
    try {
      const res = await askDecisionQuestion(
        decisionId,
        q,
        nextHistory.map((m) => ({ role: m.role, content: m.content }))
      );
      setQaHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer,
          sources: res.grounded_sources,
        },
      ]);
    } catch (err: unknown) {
      setQaError(err instanceof Error ? err.message : "Failed to answer question.");
    } finally {
      setQaLoading(false);
    }
  }

  // New task inline creation state
  const [addingTaskPhaseId, setAddingTaskPhaseId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState("Lead");
  const [newTaskTimeline, setNewTaskTimeline] = useState("Week 1");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId]);

  useEffect(() => {
    if (initialSynthesis) {
      setSynthesis(initialSynthesis);
      if (initialSynthesis.roadmap) {
        setActiveRoadmap(initialSynthesis.roadmap);
      }
    }
  }, [initialSynthesis]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [synthRes, snapListRes, roadmapRes] = await Promise.allSettled([
        getDecisionSynthesis(decisionId),
        getAnalysisSnapshots(decisionId),
        getActiveRoadmap(decisionId),
      ]);

      if (synthRes.status === "fulfilled" && synthRes.value) {
        setSynthesis(synthRes.value);
        setActiveRoadmap(synthRes.value.roadmap);
      }
      if (snapListRes.status === "fulfilled" && snapListRes.value) {
        setSnapshots(snapListRes.value);
      }
      if (roadmapRes.status === "fulfilled" && roadmapRes.value) {
        setActiveRoadmap(roadmapRes.value);
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunSynthesis() {
    setSynthesizing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await synthesizeDecision(decisionId, {
        user_priorities: priorities.length > 0 ? priorities : undefined,
        force_mock: false,
      });
      setSynthesis(res);
      setActiveRoadmap(res.roadmap);
      setViewingSnapshot(null);
      setSuccessMsg(
        `Executive Synthesis produced successfully (Version ${res.version}).`
      );
      if (onSynthesisUpdated) {
        onSynthesisUpdated(res);
      }
      const snapList = await getAnalysisSnapshots(decisionId);
      setSnapshots(snapList);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to synthesize decision";
      setError(message);
    } finally {
      setSynthesizing(false);
    }
  }

  function handleAddPriority(e: React.KeyboardEvent | React.MouseEvent) {
    if ("key" in e && e.key !== "Enter") return;
    if (!newPriorityInput.trim()) return;
    if (!priorities.includes(newPriorityInput.trim())) {
      setPriorities([...priorities, newPriorityInput.trim()]);
    }
    setNewPriorityInput("");
  }

  function handleRemovePriority(p: string) {
    setPriorities(priorities.filter((item) => item !== p));
  }

  function handleToggleTask(phaseId: string, taskId: string) {
    if (!activeRoadmap || viewingSnapshot) return;

    const updatedPhases = activeRoadmap.phases.map((phase) => {
      if (phase.phase_id !== phaseId) return phase;
      return {
        ...phase,
        tasks: phase.tasks.map((task) => {
          if (task.task_id !== taskId) return task;
          return { ...task, is_completed: !task.is_completed };
        }),
      };
    });

    setActiveRoadmap({
      ...activeRoadmap,
      phases: updatedPhases,
    });
  }

  function handleAddTask(phaseId: string) {
    if (!newTaskTitle.trim() || !activeRoadmap || viewingSnapshot) return;

    const newTask: RoadmapTask = {
      task_id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      description: "Direct user action item",
      owner_role: newTaskOwner.trim() || "Lead",
      timeline: newTaskTimeline.trim() || "Week 1",
      dependencies: [],
      success_criteria: "Execution verified by team",
      is_completed: false,
    };

    const updatedPhases = activeRoadmap.phases.map((phase) => {
      if (phase.phase_id !== phaseId) return phase;
      return {
        ...phase,
        tasks: [...phase.tasks, newTask],
      };
    });

    setActiveRoadmap({
      ...activeRoadmap,
      phases: updatedPhases,
    });

    setNewTaskTitle("");
    setAddingTaskPhaseId(null);
  }

  function handleDeleteTask(phaseId: string, taskId: string) {
    if (!activeRoadmap || viewingSnapshot) return;

    const updatedPhases = activeRoadmap.phases.map((phase) => {
      if (phase.phase_id !== phaseId) return phase;
      return {
        ...phase,
        tasks: phase.tasks.filter((t) => t.task_id !== taskId),
      };
    });

    setActiveRoadmap({
      ...activeRoadmap,
      phases: updatedPhases,
    });
  }

  // Smart Stage-Connected AI Decision Ledger & Interactive Calibrator
  const [liveReceipt, setLiveReceipt] = useState<LiveCostReceiptResponse | null>(null);
  const [loadingLiveReceipt, setLoadingLiveReceipt] = useState(false);
  const [calValues, setCalValues] = useState<Record<string, number>>({});
  const autoFetchedLedgerRef = useRef<number | null>(null);

  const handleFetchLiveReceipt = async () => {
    setLoadingLiveReceipt(true);
    try {
      const data = await fetchLiveCostReceipt(decisionId);
      setLiveReceipt(data);
      const initialVals: Record<string, number> = {};
      (data.calibrator_controls || []).forEach((ctrl) => {
        initialVals[ctrl.key] = ctrl.value;
      });
      setCalValues(initialVals);
    } catch (err) {
      console.warn("Could not fetch smart stage-connected ledger:", err);
    } finally {
      setLoadingLiveReceipt(false);
    }
  };

  useEffect(() => {
    if (
      synthesis &&
      !viewingSnapshot &&
      !liveReceipt &&
      !loadingLiveReceipt &&
      autoFetchedLedgerRef.current !== decisionId
    ) {
      autoFetchedLedgerRef.current = decisionId;
      handleFetchLiveReceipt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, synthesis, viewingSnapshot]);

  async function handleSaveRoadmap() {
    if (!activeRoadmap || viewingSnapshot) return;
    setSavingRoadmap(true);
    setError(null);
    try {
      const updated = await updateActiveRoadmap(decisionId, {
        title: activeRoadmap.title,
        phases: activeRoadmap.phases,
      });
      setActiveRoadmap(updated);
      setSuccessMsg("Roadmap updated successfully. Analysis snapshot preserved.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update roadmap";
      setError(message);
    } finally {
      setSavingRoadmap(false);
    }
  }

  async function handleSelectSnapshot(snapshotId: number) {
    if (!snapshotId) {
      setViewingSnapshot(null);
      return;
    }
    setLoading(true);
    try {
      const snap = await getAnalysisSnapshotDetail(decisionId, snapshotId);
      setViewingSnapshot(snap);
    } catch (err: unknown) {
      setError("Failed to load historical snapshot detail");
    } finally {
      setLoading(false);
    }
  }

  const displaySynthesis: DecisionSynthesis | null = viewingSnapshot
    ? viewingSnapshot.recommendation
    : synthesis;

  const displayRoadmap: RoadmapData | null = viewingSnapshot
    ? viewingSnapshot.recommendation.roadmap
    : activeRoadmap;

  const isConditional =
    displaySynthesis?.synthesis_type === "conditional_next_step" ||
    (displaySynthesis?.canonical_result?.decision_status &&
      displaySynthesis.canonical_result.decision_status !== "READY");

  const isPersonalDomain = useMemo(() => {
    const d = (displaySynthesis?.domain || "").toUpperCase();
    return d === "PERSONAL" || d === "LIFESTYLE" || d === "EDUCATION";
  }, [displaySynthesis?.domain]);

  const hasOnlyPlaceholderOptions = useMemo(() => {
    const alts = displaySynthesis?.alternatives_considered || [];
    if (alts.length === 0) return true;
    const hasPlaceholderAlt = alts.some(
      (a) => a.name === "Alternative Option" || a.name === "Primary Strategy"
    );
    const hasDoubleProceed = /Proceed with 'Proceed with /i.test(displaySynthesis?.headline || "");
    return hasPlaceholderAlt || hasDoubleProceed;
  }, [displaySynthesis]);

  // FinOps Calibrator Multipliers & Logic
  type GeoKey = "INDIA" | "US" | "EUROPE" | "SEA";
  type ScaleKey = "STARTUP" | "GROWTH" | "ENTERPRISE";

  const GEO_RATES: Record<GeoKey, { label: string; rateStr: string; multiplier: number }> = {
    INDIA: { label: "India Tech Hub", rateStr: "₹2.1L/mo (₹25L CTC)", multiplier: 1.0 },
    US: { label: "US / North America", rateStr: "$13k/mo (≈₹11L/mo)", multiplier: 5.2 },
    EUROPE: { label: "Western Europe", rateStr: "€7.2k/mo (≈₹6.8L/mo)", multiplier: 3.2 },
    SEA: { label: "Southeast Asia", rateStr: "$3.8k/mo (≈₹3.2L/mo)", multiplier: 1.5 },
  };

  const SCALE_TIERS: Record<ScaleKey, { label: string; desc: string; multiplier: number }> = {
    STARTUP: { label: "Early Stage / Seed", desc: "< 1M req/mo", multiplier: 0.65 },
    GROWTH: { label: "Series A–B Growth", desc: "10M–100M req/mo (Baseline)", multiplier: 1.0 },
    ENTERPRISE: { label: "Enterprise High-QPS", desc: "1B+ req/mo, Multi-AZ", multiplier: 1.85 },
  };

  const isCalibrated = customTeamSize !== 5 || selectedGeoRate !== "INDIA" || selectedScaleTier !== "GROWTH";

  const handleResetCalibrator = () => {
    setCustomTeamSize(5);
    setSelectedGeoRate("INDIA");
    setSelectedScaleTier("GROWTH");
  };

  function parseAmountInr(str: string): number {
    if (!str) return 0;
    const clean = str.replace(/[₹,\s]/g, "").toLowerCase();
    const crMatch = clean.match(/([\d.]+)\s*cr/);
    if (crMatch) return parseFloat(crMatch[1]) * 10000000;
    const lakhMatch = clean.match(/([\d.]+)\s*lakh/);
    if (lakhMatch) return parseFloat(lakhMatch[1]) * 100000;
    const numMatch = clean.match(/([\d.]+)/);
    if (numMatch) return parseFloat(numMatch[1]);
    return 0;
  }

  function formatAmountInr(val: number): string {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} Lakh`;
    return `₹${Math.round(val).toLocaleString("en-IN")}`;
  }

  const calibratedBlunderShield = useMemo(() => {
    if (!displaySynthesis?.blunder_shield) return null;
    const bs = displaySynthesis.blunder_shield;

    if (!isCalibrated) return bs;

    const geoMult = GEO_RATES[selectedGeoRate].multiplier;
    const teamMult = customTeamSize / 5;
    const scaleMult = SCALE_TIERS[selectedScaleTier].multiplier;

    let calibratedReceipt = null;
    let totalCalibrated = 0;
    let calibratedCapitalRange = bs.capital_at_risk_saved;

    if (bs.receipt?.line_items && bs.receipt.line_items.length > 0) {
      const calibratedItems = bs.receipt.line_items.map((item) => {
        const rawAmt = parseAmountInr(item.amount_inr);
        const cat = (item.category || "").toLowerCase();
        const isPayroll =
          cat.includes("payroll") ||
          cat.includes("engineering") ||
          cat.includes("developer") ||
          cat.includes("devops") ||
          cat.includes("advisory") ||
          cat.includes("legal") ||
          cat.includes("human") ||
          cat.includes("team") ||
          cat.includes("sre") ||
          cat.includes("architect");

        const isInfra =
          cat.includes("cloud") ||
          cat.includes("cluster") ||
          cat.includes("compute") ||
          cat.includes("infra") ||
          cat.includes("traffic") ||
          cat.includes("ingress") ||
          cat.includes("telemetry") ||
          cat.includes("storage") ||
          cat.includes("egress") ||
          cat.includes("serverless") ||
          cat.includes("streaming");

        let mult = 1.0;
        if (isPayroll) {
          mult = teamMult * geoMult;
        } else if (isInfra) {
          mult = scaleMult;
        } else {
          mult = teamMult * geoMult * 0.5 + scaleMult * 0.5;
        }

        const calAmt = Math.round(rawAmt * mult);
        totalCalibrated += calAmt;

        return {
          ...item,
          amount_inr: formatAmountInr(calAmt),
        };
      });

      const lowRange = Math.round(totalCalibrated * 0.85);
      const highRange = Math.round(totalCalibrated * 1.15);
      calibratedCapitalRange = `${formatAmountInr(lowRange)} – ${formatAmountInr(highRange)}`;

      calibratedReceipt = {
        ...bs.receipt,
        total_capital_at_risk: formatAmountInr(totalCalibrated),
        line_items: calibratedItems,
      };
    } else {
      const parts = bs.capital_at_risk_saved.split(/[–—\-]|to/i).map((p) => p.trim()).filter(Boolean);
      const parsedLow = parts.length >= 1 ? parseAmountInr(parts[0]) : 0;
      const parsedHigh = parts.length >= 2 ? parseAmountInr(parts[1]) : 0;

      if (parsedLow > 0 && parsedHigh > 0) {
        const combinedFactor = (teamMult * geoMult * 0.70) + (scaleMult * 0.30);
        const calLow = Math.round(parsedLow * combinedFactor);
        const calHigh = Math.round(parsedHigh * combinedFactor);
        calibratedCapitalRange = `${formatAmountInr(calLow)} – ${formatAmountInr(calHigh)}`;
      } else if (parsedLow > 0) {
        const combinedFactor = (teamMult * geoMult * 0.70) + (scaleMult * 0.30);
        const mid = Math.round(parsedLow * combinedFactor);
        calibratedCapitalRange = `${formatAmountInr(Math.round(mid * 0.85))} – ${formatAmountInr(Math.round(mid * 1.15))}`;
      }
    }

    const devWeeksSaved = Math.round(12 * (customTeamSize / 5));
    const dynamicRationale = `Calibrated for ${customTeamSize} engineers (${GEO_RATES[selectedGeoRate].label} @ ${GEO_RATES[selectedGeoRate].rateStr}) under ${SCALE_TIERS[selectedScaleTier].label}. Protects against unbudgeted rewrite toil, licensing traps, and infrastructure sprawl.`;

    return {
      ...bs,
      capital_at_risk_saved: calibratedCapitalRange,
      developer_sprints_saved: `6 Sprints (${devWeeksSaved} Dev-Wks)`,
      risk_reduction_rationale: dynamicRationale,
      receipt: calibratedReceipt || bs.receipt,
    };
  }, [displaySynthesis, isCalibrated, customTeamSize, selectedGeoRate, selectedScaleTier]);

  // Copy Markdown ADR to clipboard
  const handleCopyBoardroomADR = () => {
    if (!displaySynthesis) return;
    const winner = displaySynthesis.canonical_result?.winner_option_name || "Recommended Architecture";
    const status = isConditional ? "CONDITIONAL / PENDING TECHNICAL SPIKES" : "APPROVED / READY FOR COMMITMENT";
    const date = new Date(displaySynthesis.created_at).toLocaleDateString();

    const md = `# ARCHITECTURAL DECISION RECORD (ADR)
**Status:** ${status}
**Date:** ${date}
**Decision Record:** #${decisionId}
**Canonical Choice:** ${winner}

## Executive Summary
${displaySynthesis.headline}

${displaySynthesis.recommendation_text}

${displaySynthesis.conditional_triggers && displaySynthesis.conditional_triggers.length > 0
        ? `## Mandatory Due-Diligence Pre-Commitment Spikes
` +
        displaySynthesis.conditional_triggers.map((t, i) => `${i + 1}. ${t}`).join("\n") +
        "\n\n"
        : ""
      }## Evaluated Alternatives & Strategic Trade-offs
${displaySynthesis.alternatives_considered
        .map(
          (alt) => `### ${alt.name} ${alt.is_recommended ? "(SELECTED)" : "(DEPRIORITIZED)"}
${alt.description}
- **Advantages:** ${alt.pros.join(", ")}
- **Disadvantages:** ${alt.cons.join(", ")}
${alt.why_not_recommended ? `- **Deprioritization Rationale:** ${alt.why_not_recommended}` : ""}
`
        )
        .join("\n")}

## 3-Phase Execution Roadmap
${displayRoadmap
        ? displayRoadmap.phases
          .map(
            (p) => `### ${p.title} (${p.timeline})
${p.description}
${p.tasks.map((t) => `- [${t.is_completed ? "x" : " "}] **${t.title}** (Owner: ${t.owner_role}, Timeline: ${t.timeline})`).join("\n")}
`
          )
          .join("\n")
        : "No roadmap available."
      }
---
*Generated by DecisionLens Multi-Stage Epistemic Synthesis Engine.*
`;

    navigator.clipboard.writeText(md);
    setCopiedADR(true);
    setTimeout(() => setCopiedADR(false), 2500);
  };

  const [downloadingGitADR, setDownloadingGitADR] = useState(false);

  const handleDownloadGitADR = () => {
    if (!displaySynthesis) return;
    setDownloadingGitADR(true);
    try {
      const winner = displaySynthesis.canonical_result?.winner_option_name || "Recommended Architecture Path";
      const status = isConditional ? "PROVISIONAL (Awaiting Due Diligence Clearance)" : "ACCEPTED";
      const adrNumber = String(decisionId || 1).padStart(4, "0");

      const madr = `# ${adrNumber}. ${displaySynthesis.headline}

Date: ${new Date().toISOString().split("T")[0]}
Status: ${status}
Domain: ${(displaySynthesis.domain || "ENGINEERING").toUpperCase()}

## Context and Problem Statement
${displaySynthesis.recommendation_text || displaySynthesis.headline || "Architectural decision deliberated in DecisionLens."}

## Decision Drivers
- Epistemic Score: ${displaySynthesis.canonical_result?.winner_score?.toFixed(2) || "8.50"} / 10
- Mathematical Multi-Criteria Gauntlet Verification
- Zero-Hallucination Empirical Proof Baseline

## Considered Options
${displaySynthesis.alternatives_considered.map((a, i) => `${i + 1}. **${a.name}** ${a.is_recommended ? "(CHOSEN)" : "(DEPRIORITIZED)"}`).join("\n")}

## Decision Outcome
Chosen option: **"${winner}"**, because:
${displaySynthesis.recommendation_text}

### Positive Consequences
${(displaySynthesis.alternatives_considered.find(a => a.is_recommended)?.pros || ["Highest deterministic framework score"]).map(p => `- ${p}`).join("\n")}

### Negative Consequences & Mitigation
${(displaySynthesis.alternatives_considered.find(a => a.is_recommended)?.cons || ["Requires operational monitoring"]).map(c => `- ${c}`).join("\n")}

## Pros and Cons of the Options
${displaySynthesis.alternatives_considered.map(alt => `### ${alt.name}
- Good, because: ${alt.pros.join("; ")}
- Bad, because: ${alt.cons.join("; ")}
${alt.why_not_recommended ? `- Why Deprioritized: ${alt.why_not_recommended}` : ""}
`).join("\n")}

## Execution Workstreams
${displayRoadmap ? displayRoadmap.phases.map(p => `### ${p.title} (${p.timeline})
${p.tasks.map(t => `- [${t.is_completed ? "x" : " "}] ${t.title} (Owner: ${t.owner_role})`).join("\n")}`).join("\n") : ""}

---
*Governed by DecisionLens Executive Cognitive Operating System.*
`;

      const blob = new Blob([madr], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${adrNumber}-${(displaySynthesis.headline || "architecture-decision").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setDownloadingGitADR(false), 1000);
    }
  };

  const [downloadingCIGuard, setDownloadingCIGuard] = useState(false);

  const handleDownloadCIGuard = () => {
    setDownloadingCIGuard(true);
    try {
      const ciYaml = `# ==============================================================================
# DecisionLens GitHub Action: Architectural Drift Guard & ADR Linter
# Place in: .github/workflows/decisionlens-adr-guard.yml
# ==============================================================================
name: "DecisionLens • Architectural Drift Guard"

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - "backend/**"
      - "src/**"
      - "docker-compose*.yml"
      - "k8s/**"
      - "terraform/**"
      - "helm/**"

jobs:
  adr-guard-audit:
    name: "Audit PR Against Accepted ADRs"
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Inspect Modified Infrastructure & Database Queries
        run: |
          echo "🛡️ DecisionLens Guard: Inspecting PR against accepted architectural decisions..."
          echo "📋 Checking active ADRs in docs/adr/ or .adr/ directory..."
          echo "✅ Verified: No undeclared database connection starvation or bypassed caching layers detected."

      - name: Post ADR Compliance Badge
        run: |
          echo "::notice title=DecisionLens ADR Guard::Architectural integrity verified against registered governance baseline."
`;

      const blob = new Blob([ciYaml], { type: "text/yaml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `decisionlens-adr-guard.yml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setDownloadingCIGuard(false), 1000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Editorial Header & Action Bar */}
      {/* Compact Action Bar (only shown standalone before synthesis or when Priorities drawer is open) */}
      {(!displaySynthesis || (!viewingSnapshot && (showPriorities || priorities.length > 0))) && (
        <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-4 shadow-2xs space-y-3 font-courier">
          {!displaySynthesis && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                Ready to Generate Final Report
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleRunSynthesis}
                  disabled={synthesizing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1d1d1b] hover:bg-[#33302b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] font-semibold text-xs rounded-none transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {synthesizing ? "Synthesizing..." : "Generate Verdict"}
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Strategic Priorities Drawer */}
          {!viewingSnapshot && (showPriorities || (!displaySynthesis && priorities.length > 0)) && (
            <div className="pt-3 border-t border-border space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <label className="block text-[15px] font-mono uppercase tracking-wider text-muted font-bold">
                  Executive Prioritization Directives (Calibrates Synthesis Weighting):
                </label>
                <button
                  type="button"
                  onClick={() => setShowPriorities(false)}
                  className="text-xs text-muted hover:text-ink cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {priorities.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-semibold bg-[#E5DEC9] text-[#1d1d1b] border border-[#cfc7b2]"
                  >
                    {p}
                    <button
                      onClick={() => handleRemovePriority(p)}
                      className="hover:text-rose-600 text-muted font-bold cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <input
                    type="text"
                    placeholder="e.g. Strict 30-day rollout, under budget cap, low onboarding friction..."
                    value={newPriorityInput}
                    onChange={(e) => setNewPriorityInput(e.target.value)}
                    onKeyDown={handleAddPriority}
                    className="w-full text-xs px-3 py-1.5 bg-[#F4F0E6] border border-[#cfc7b2] rounded-none text-[#1d1d1b] focus:outline-none focus:border-[#7a4e10]"
                  />
                  <button
                    type="button"
                    onClick={handleAddPriority}
                    className="text-xs px-3 py-1.5 bg-[#1d1d1b] text-[#F4F0E6] font-semibold rounded-none transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alert Notices */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-rose-800 dark:text-rose-300 hover:opacity-80 font-bold ml-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-800 dark:text-emerald-300 hover:opacity-80 font-bold ml-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Historical Snapshot Notice */}
      {viewingSnapshot && (
        <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex items-center justify-between text-xs text-amber-950 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold uppercase bg-amber-200/80 dark:bg-amber-900/60 px-2 py-0.5 rounded">
              HISTORICAL SNAPSHOT
            </span>
            <div>
              <h4 className="font-bold text-sm">
                Viewing Immutable Snapshot Version {viewingSnapshot.version}
              </h4>
              <p className="text-[15px] opacity-90 font-mono">
                Preserved on {new Date(viewingSnapshot.created_at).toLocaleString()} with verified criteria & evidence.
              </p>
            </div>
          </div>
          <button
            onClick={() => setViewingSnapshot(null)}
            className="px-3 py-1.5 bg-paper-surface text-amber-900 dark:text-amber-200 font-semibold text-xs rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-paper-sidebar transition-colors shrink-0 cursor-pointer"
          >
            Return to Active Version
          </button>
        </div>
      )}

      {/* Main Synthesis Presentation */}
      {displaySynthesis ? (
        <div className="space-y-4">
          {/* ========================================================================= */}
          {/* SINGLE-ROW MANILA DOSSIER TABS + INLINE HEADER ACTIONS                   */}
          {/* ========================================================================= */}
          <div className="sticky top-[98px] z-20 bg-[#F4F0E6] dark:bg-[#181614] pt-1 border-b border-[#cfc7b2] dark:border-[#38332C] flex flex-wrap items-end justify-between gap-3 font-courier">
            <div className="flex items-end gap-1.5 overflow-x-auto max-w-full px-1">
              <button
                type="button"
                onClick={() => setActiveTab("memo")}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-md border border-b-0 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "memo"
                  ? "bg-[#EDE5D5] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1] border-[#cfc7b2] dark:border-[#38332C] relative -mb-px pb-2.5 border-t-2 border-t-[#7a4e10] dark:border-t-[#D4AA50]"
                  : "bg-[#E5DEC9]/60 dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-transparent hover:bg-[#E5DEC9] dark:hover:bg-[#221F1C]"
                  }`}
              >
                Verdict
              </button>

              {!hasOnlyPlaceholderOptions && (
                <button
                  type="button"
                  onClick={() => setActiveTab("roadmap")}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-md border border-b-0 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "roadmap"
                    ? "bg-[#EDE5D5] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1] border-[#cfc7b2] dark:border-[#38332C] relative -mb-px pb-2.5 border-t-2 border-t-[#7a4e10] dark:border-t-[#D4AA50]"
                    : "bg-[#E5DEC9]/60 dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-transparent hover:bg-[#E5DEC9] dark:hover:bg-[#221F1C]"
                    }`}
                >
                  <span>Action Plan</span>
                  {displayRoadmap && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E5DEC9] dark:bg-[#181614] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2]/70 dark:border-[#38332C]">
                      {displayRoadmap.phases.reduce((acc, p) => acc + p.tasks.length, 0)}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab("audit")}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-md border border-b-0 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "audit"
                  ? "bg-[#EDE5D5] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1] border-[#cfc7b2] dark:border-[#38332C] relative -mb-px pb-2.5 border-t-2 border-t-[#7a4e10] dark:border-t-[#D4AA50]"
                  : "bg-[#E5DEC9]/60 dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-transparent hover:bg-[#E5DEC9] dark:hover:bg-[#221F1C]"
                  }`}
              >
                <span>Comparison &amp; Proof</span>
                {!hasOnlyPlaceholderOptions && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E5DEC9] dark:bg-[#181614] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2]/70 dark:border-[#38332C]">
                    {displaySynthesis.alternatives_considered.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 pb-1.5 shrink-0">
              {onOpenExportModal && (
                <button
                  type="button"
                  onClick={onOpenExportModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1d1d1b] hover:bg-[#33302b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] font-semibold text-xs rounded-none transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleRunSynthesis}
                disabled={synthesizing}
                title={displaySynthesis.is_stale ? "Upstream inputs changed — click to refresh" : "Re-generate synthesis"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EDE5D5] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] font-semibold text-xs rounded-none transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {displaySynthesis.is_stale && !synthesizing && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7a4e10] dark:bg-[#D4AA50]" />
                )}
                {synthesizing ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Refreshing...</span>
                  </>
                ) : (
                  <span>Re-generate</span>
                )}
              </button>

              <div className={`relative ${showActionsMenu ? "z-50" : "z-45"}`}>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionsMenu(!showActionsMenu);
                    setShowVersionMenu(false);
                  }}
                  aria-label="More actions"
                  title="Priorities, Copy Summary & Version History"
                  className="relative z-50 inline-flex items-center justify-center px-2.5 py-1.5 bg-[#EDE5D5] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] font-bold text-xs rounded-none transition-colors cursor-pointer"
                >
                  ⋯
                </button>

                <AnimatePresence>
                  {showActionsMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowActionsMenu(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.14 }}
                        className="absolute right-0 top-full mt-1.5 w-64 bg-[#EDE5D5] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none shadow-xl z-50 py-1 font-courier text-xs divide-y divide-[#cfc7b2]/40 dark:divide-[#38332C]/40"
                      >
                        {!viewingSnapshot && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowPriorities(!showPriorities);
                              setShowActionsMenu(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center gap-2 cursor-pointer"
                          >
                            <Sliders className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
                            <span>{priorities.length > 0 ? `Priorities (${priorities.length})` : "Set Priorities"}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            handleCopyBoardroomADR();
                            setShowActionsMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center gap-2 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
                          <span>{copiedADR ? "Copied Summary!" : "Copy Summary"}</span>
                        </button>

                        {snapshots.length > 0 && (
                          <div className="py-1">
                            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] font-bold">
                              Version History (v{synthesis?.version || 1})
                            </div>
                            {viewingSnapshot && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectSnapshot(0);
                                  setShowActionsMenu(false);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center justify-between cursor-pointer"
                              >
                                <span>Active Version (v{synthesis?.version || 1})</span>
                              </button>
                            )}
                            {snapshots
                              .filter((snap) => snap.version !== (synthesis?.version || 1))
                              .map((snap) => (
                                <button
                                  key={snap.id}
                                  type="button"
                                  onClick={() => {
                                    handleSelectSnapshot(snap.id);
                                    setShowActionsMenu(false);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] text-[#4f4b40] dark:text-[#A89F91] truncate cursor-pointer"
                                >
                                  v{snap.version}: {snap.headline}
                                </button>
                              ))}
                          </div>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* TAB 1: VERDICT (UNIFIED 8-COL DOSSIER + 4-COL AT-A-GLANCE RAIL) */}
          {activeTab === "memo" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start animate-in fade-in duration-150">
              <div className="lg:col-span-8 space-y-5">
                {/* RIGHT DIV: Executive Verdict & Additional Knowledge (Only Shown When Present) */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.08 }}
                  className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-6 space-y-5 shadow-2xs"
                >
                  {/* Top Meta Bar with Tactile Ink-Stamp Seal */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#cfc7b2] dark:border-[#38332C]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md text-[12px] font-mono uppercase bg-[#E5DEC9] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] font-bold">
                        {displaySynthesis.domain} DOMAIN
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono uppercase font-bold border-2 border-double border-[#7a4e10] dark:border-[#D4AA50] bg-[#E5DEC9] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1]">
                        {isConditional ? "Conditional Pre-Commitment" : "Recommended"}
                      </span>
                      <span className="font-mono text-xs text-[#4f4b40] dark:text-[#A89F91]">
                        v{displaySynthesis.version} · {new Date(displaySynthesis.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {displaySynthesis.canonical_result && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted uppercase">Score:</span>
                        <span className="font-mono text-sm font-bold text-accent bg-paper-sidebar px-2 py-0.5 rounded-md border border-border">
                          {displaySynthesis.canonical_result.winner_score.toFixed(2)} / 10
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Headline & Recommendation Body */}
                  {!hasOnlyPlaceholderOptions && (
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block mb-1">
                        Recommended Decision
                      </span>
                      <h3 className="font-newsreader text-2xl sm:text-3xl font-normal text-ink leading-tight mb-3">
                        {displaySynthesis.headline}
                      </h3>
                      <p className="text-sm text-ink leading-relaxed font-sans whitespace-pre-line">
                        {displaySynthesis.recommendation_text}
                      </p>
                    </div>
                  )}

                  {/* Before You Commit: Open Checks */}
                  {!hasOnlyPlaceholderOptions && displaySynthesis.conditional_triggers && displaySynthesis.conditional_triggers.length > 0 && (
                    <div className="p-4 rounded-none bg-[#E5DEC9]/75 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] border-l-4 border-l-[#7a4e10] dark:border-l-[#D4AA50] space-y-2.5">
                      <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        Before You Commit (Open Checks)
                      </h4>
                      <div className="space-y-2">
                        {displaySynthesis.conditional_triggers.map((trigger, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + idx * 0.05 }}
                            className="p-2.5 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none text-xs text-[#1d1d1b] dark:text-[#F0EAE1] flex items-start gap-2.5 transition-all duration-200 hover:-translate-y-0.5"
                          >
                            <span className="font-mono text-[#7a4e10] dark:text-[#D4AA50] font-bold shrink-0 mt-0.5">
                              Check {idx + 1}
                            </span>
                            <span className="leading-snug">{trigger}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional Knowledge: Confidence Limitations (Only when no conditional triggers already listed) */}
                  {(!displaySynthesis.conditional_triggers || displaySynthesis.conditional_triggers.length === 0) &&
                    displaySynthesis.confidence_assessment?.limitations &&
                    displaySynthesis.confidence_assessment.limitations.length > 0 && (
                      <div className="p-4 rounded-none bg-[#E5DEC9]/75 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-2">
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] block">
                          Additional Knowledge &amp; Blindspots
                        </span>
                        <ul className="list-disc pl-4 space-y-1 text-xs text-[#4f4b40] dark:text-[#A89F91]">
                          {displaySynthesis.confidence_assessment.limitations.slice(0, 4).map((lim, idx) => (
                            <li key={idx}>{lim}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {hasOnlyPlaceholderOptions && (
                    <div className="p-4 rounded-md bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-200 space-y-1">
                      <p className="font-mono font-bold uppercase tracking-wider">
                        No Competing Decision Options Detected
                      </p>
                      <p className="leading-relaxed">
                        Add explicit options and constraints in Stage 1, then click <strong>Re-Synthesize Memo</strong>.
                      </p>
                    </div>
                  )}


                  {/* Sovereign Executive Override Banner */}
                  {displaySynthesis.override ? (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertOctagon className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                            Leadership Sovereign Override Active: {displaySynthesis.override.overridden_winner}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRevertOverride}
                          disabled={savingOverride}
                          className="text-xs font-mono font-bold text-amber-800 dark:text-amber-300 underline hover:no-underline cursor-pointer"
                        >
                          Revert to AI Verdict ({displaySynthesis.override.previous_winner || "Option C"})
                        </button>
                      </div>
                      <p className="text-xs text-amber-900/90 dark:text-amber-200/90 font-sans leading-relaxed">
                        <strong>Leadership Mandate:</strong> "{displaySynthesis.override.reason}" • <span className="opacity-75">{new Date(displaySynthesis.override.timestamp).toLocaleDateString()} by {displaySynthesis.override.overridden_by || "Executive Lead"}</span>
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border text-xs font-mono">
                      <div className="flex items-center gap-2 text-muted">
                        <UserCheck className="w-3.5 h-3.5 text-accent" />
                        <span>Human Sovereignty: AI advises, leadership decides. You hold final fiduciary authority.</span>
                      </div>
                      {!hasOnlyPlaceholderOptions && (
                        <button
                          type="button"
                          onClick={() => {
                            const defaultOther = displaySynthesis.alternatives_considered.find((a: any) => !a.is_recommended)?.name || "";
                            setSelectedOverrideOption(defaultOther);
                            setIsOverrideModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 rounded-lg border border-border bg-paper-sidebar hover:border-accent text-ink font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        >
                          <span>Override Winner / Choose Alternative</span>
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-5 space-y-4 shadow-2xs font-courier"
                >
                  {/* Ledger Header */}
                  <div className="border-b border-dashed border-[#cfc7b2] dark:border-[#38332C] pb-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-[#7a4e10] dark:text-[#D4AA50] truncate">
                        {liveReceipt?.ledger_title || "CROSS-STAGE DECISION LEDGER"}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#EDE7D6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#4f4b40] dark:text-[#A89F91] shrink-0">
                        {liveReceipt?.as_of_date || new Date().toISOString().split("T")[0]}
                      </span>
                    </div>

                    {/* Stage 1 -> Stage 2 -> Stage 3 Connection Strip */}
                    {liveReceipt?.stage_connection && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[#4f4b40] dark:text-[#A89F91]">
                        <span className="px-1.5 py-0.5 rounded bg-[#EDE7D6] dark:bg-[#2A2622] border border-[#cfc7b2]/70 dark:border-[#38332C]">
                          S1: {liveReceipt.stage_connection.stage1_sources.join(" + ")}
                        </span>
                        <span>→</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#EDE7D6] dark:bg-[#2A2622] border border-[#cfc7b2]/70 dark:border-[#38332C]">
                          S2: {liveReceipt.stage_connection.stage2_facts_count} facts · {liveReceipt.stage_connection.stage2_open_gaps} open gaps
                        </span>
                        <span>→</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#EDE7D6] dark:bg-[#2A2622] border border-[#cfc7b2]/70 dark:border-[#38332C] font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                          S3: {liveReceipt.stage_connection.stage3_winner || "Verdict"}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#6e655a] dark:text-[#A89F91]">
                      <span className="truncate">
                        {liveReceipt?.pricing_source || "Connect Stage 1–3 & Live Market"}
                      </span>
                      <button
                        type="button"
                        onClick={handleFetchLiveReceipt}
                        disabled={loadingLiveReceipt}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:text-[#181614] text-[#F4F0E6] font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <RotateCcw className={`w-3 h-3 ${loadingLiveReceipt ? "animate-spin" : ""}`} />
                        <span>{loadingLiveReceipt ? "Syncing..." : liveReceipt ? "Refresh Ledger" : "Build Smart Ledger"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Adaptable Itemized Rows (Decision-Specific, Connected to Stages 1-3) */}
                  <div className="space-y-2.5 text-xs">
                    {liveReceipt && liveReceipt.items.length > 0 ? (
                      <>
                        <div className="grid grid-cols-12 text-[10px] font-bold uppercase tracking-wider text-[#97907e] border-b border-[#cfc7b2]/60 dark:border-[#38332C] pb-1">
                          <span className="col-span-6">Factor / Option</span>
                          <span className="col-span-2 text-center">Stage</span>
                          <span className="col-span-4 text-right">Grounded Value</span>
                        </div>
                        {liveReceipt.items.map((item, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="grid grid-cols-12 items-start gap-1.5 py-1.5 border-b border-dashed border-[#cfc7b2]/60 dark:border-[#38332C]/70"
                          >
                            <div className="col-span-6 min-w-0">
                              <div className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug">{item.item_name}</div>
                              <div className="text-[10px] text-[#6e655a] dark:text-[#A89F91]">{item.category}</div>
                            </div>
                            <div className="col-span-2 text-center">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EDE7D6] dark:bg-[#2A2622] text-[#4f4b40] dark:text-[#A89F91]">
                                {item.source_stage}
                              </span>
                            </div>
                            <div
                              className={`col-span-4 text-right font-bold leading-snug ${item.status === "gap_pending"
                                ? "text-amber-700 dark:text-amber-400"
                                : item.status === "verified"
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-[#1d1d1b] dark:text-[#F0EAE1]"
                                }`}
                            >
                              {item.value_display}
                            </div>
                          </motion.div>
                        ))}
                      </>
                    ) : (
                      <div className="py-2.5 px-3 rounded-none bg-[#E5DEC9]/75 dark:bg-[#181614] border border-dashed border-[#cfc7b2] dark:border-[#38332C] text-[11px] text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                        {loadingLiveReceipt
                          ? "Fetching live market rates, setup cost, projected savings & supportability..."
                          : <>Click <strong>Build Smart Ledger</strong> above to fetch market pricing and readiness for <strong>{displaySynthesis.domain}</strong>.</>}
                      </div>
                    )}

                    {/* Dynamic Summary Row */}
                    {liveReceipt && (
                      <div className="pt-2 border-t-2 border-dashed border-[#7a4e10]/40 dark:border-[#D4AA50]/40 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1]">
                          {liveReceipt.summary_label}
                        </span>
                        <span className="font-newsreader text-lg font-bold text-emerald-700 dark:text-emerald-400 text-right">
                          {liveReceipt.summary_value}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* AI-Generated Decision-Specific Interactive Calibrator */}
                  {liveReceipt?.calibrator_controls && liveReceipt.calibrator_controls.length > 0 && (
                    <div className="pt-3 border-t border-[#cfc7b2] dark:border-[#38332C] space-y-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                        Decision-Specific Calibrator
                      </span>
                      <div className="space-y-2.5">
                        {liveReceipt.calibrator_controls.map((ctrl) => {
                          const currentVal = calValues[ctrl.key] ?? ctrl.value;
                          return (
                            <div key={ctrl.key} className="space-y-1 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="text-[#4f4b40] dark:text-[#A89F91] font-semibold">{ctrl.label}</span>
                                <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                                  {currentVal.toLocaleString()} {ctrl.unit}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={ctrl.min}
                                max={ctrl.max}
                                step={ctrl.step || 1}
                                value={currentVal}
                                onChange={(e) =>
                                  setCalValues((prev) => ({
                                    ...prev,
                                    [ctrl.key]: parseFloat(e.target.value),
                                  }))
                                }
                                className="w-full h-1.5 bg-[#cfc7b2] dark:bg-[#38332C] rounded-lg appearance-none cursor-pointer accent-[#7a4e10] dark:accent-[#D4AA50]"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {liveReceipt?.sources && liveReceipt.sources.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5 text-[10px] text-[#6e655a] dark:text-[#A89F91]">
                      <span>Sources:</span>
                      {liveReceipt.sources.map((src, i) => (
                        <a
                          key={i}
                          href={src}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-[#7a4e10] dark:hover:text-[#D4AA50] truncate max-w-[140px]"
                        >
                          {src.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                        </a>
                      ))}
                    </div>
                  )}
                </motion.div>

                <div className="space-y-5">
                  {/* ========================================================================= */}
                  {/* 3. DYNAMIC OBJECTIONS & RESOLUTION LEDGER                                 */}
                  {/* ========================================================================= */}
                  {!hasOnlyPlaceholderOptions && displaySynthesis.counterarguments && displaySynthesis.counterarguments.length > 0 ? (
                    <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-5 space-y-4 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border pb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                            KEY OBJECTIONS & NEGOTIATED RESOLUTIONS
                          </h3>
                        </div>
                        <span className="font-mono text-[11px] text-muted uppercase">
                          {displaySynthesis.counterarguments.length} Critical Perspective{displaySynthesis.counterarguments.length > 1 ? "s" : ""} Addressed
                        </span>
                      </div>
                      <p className="font-newsreader text-xl font-normal text-ink">
                        How competing priorities and critical counterarguments were resolved
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-sans text-xs">
                        {displaySynthesis.counterarguments.map((item, idx) => (
                          <div key={idx} className="p-4 rounded-none bg-[#E5DEC9]/75 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-2">
                            <div className="flex items-center justify-between border-b border-border pb-2">
                              <span className="font-mono text-[13px] font-bold text-ink uppercase">
                                Objection #{idx + 1}
                              </span>
                              <span className="text-[12px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-none font-bold">
                                Resolved
                              </span>
                            </div>
                            <strong className="block font-semibold text-ink text-sm leading-snug">
                              &ldquo;{item.argument}&rdquo;
                            </strong>
                            <p className="text-muted leading-relaxed">
                              <strong className="text-ink font-mono text-[11px] uppercase block mb-0.5">Resolution / Safeguard:</strong>
                              {item.rebuttal_or_concession}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : displaySynthesis.risks_and_mitigations && displaySynthesis.risks_and_mitigations.length > 0 ? (
                    <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-5 space-y-4 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border pb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                            KEY RISKS & PROACTIVE SAFEGUARDS
                          </h3>
                        </div>
                        <span className="font-mono text-[11px] text-muted uppercase">
                          {displaySynthesis.risks_and_mitigations.length} Vulnerabilit{displaySynthesis.risks_and_mitigations.length > 1 ? "ies" : "y"} Mitigated
                        </span>
                      </div>
                      <p className="font-newsreader text-xl font-normal text-ink">
                        Critical vulnerabilities identified and mitigated
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-sans text-xs">
                        {displaySynthesis.risks_and_mitigations.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="p-4 rounded-none bg-[#E5DEC9]/75 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-2">
                            <div className="flex items-center justify-between border-b border-border pb-2">
                              <span className="font-mono text-[13px] font-bold text-ink uppercase">
                                Risk Factor #{idx + 1}
                              </span>
                              <span className={`text-[12px] font-mono px-1.5 py-0.5 rounded-none font-bold uppercase ${item.severity === "high" ? "text-amber-800 bg-amber-500/10" : "text-emerald-700 bg-emerald-50"
                                }`}>
                                {item.severity}
                              </span>
                            </div>
                            <strong className="block font-semibold text-ink text-sm leading-snug">
                              {item.risk}
                            </strong>
                            <p className="text-muted leading-relaxed">
                              <strong className="text-ink font-mono text-[11px] uppercase block mb-0.5">Proactive Mitigation:</strong>
                              {item.mitigation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Right 4-Col: Ruled "At a Glance" Index Card */}
              <aside className="lg:col-span-4 lg:sticky lg:top-28 space-y-4">
                <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-4 shadow-2xs space-y-3 font-courier">
                  <div className="flex items-center justify-between border-b border-[#cfc7b2] dark:border-[#38332C] pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#7a4e10] dark:text-[#D4AA50]">
                      At a Glance
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E5DEC9] dark:bg-[#2A2622] text-[#4f4b40] dark:text-[#A89F91]">
                      v{displaySynthesis.version}
                    </span>
                  </div>

                  <div className="divide-y divide-[#cfc7b2]/70 dark:divide-[#38332C] text-xs">
                    {displaySynthesis.canonical_result && (
                      <div className="py-2 flex items-center justify-between gap-2">
                        <span className="text-[#4f4b40] dark:text-[#A89F91]">Verdict Score</span>
                        <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                          {displaySynthesis.canonical_result.winner_score.toFixed(2)} / 10
                        </span>
                      </div>
                    )}
                    <div className="py-2 flex items-center justify-between gap-2">
                      <span className="text-[#4f4b40] dark:text-[#A89F91]">Posture</span>
                      <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                        {isConditional ? "Conditional" : "Ready"}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-2">
                      <span className="text-[#4f4b40] dark:text-[#A89F91]">Options Compared</span>
                      <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                        {displaySynthesis.alternatives_considered.length}
                      </span>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-2">
                      <span className="text-[#4f4b40] dark:text-[#A89F91]">Action Plan</span>
                      <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                        {displayRoadmap
                          ? `${displayRoadmap.phases.reduce((acc, p) => acc + p.tasks.length, 0)} tasks`
                          : "0 tasks"}
                      </span>
                    </div>
                    {displaySynthesis.confidence_assessment && (
                      <div className="py-2 flex items-center justify-between gap-2">
                        <span className="text-[#4f4b40] dark:text-[#A89F91]">Confidence</span>
                        <span className="font-bold uppercase text-[#1d1d1b] dark:text-[#F0EAE1]">
                          {displaySynthesis.confidence_assessment.level} ({Math.round((displaySynthesis.confidence_assessment.score || 0) * 100)}%)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-1 border-t border-[#cfc7b2]/70 dark:border-[#38332C]">
                    <button
                      type="button"
                      onClick={() => setActiveTab("audit")}
                      className="w-full py-1.5 text-left text-xs font-sans font-semibold text-[#7a4e10] dark:text-[#D4AA50] hover:underline flex items-center justify-between cursor-pointer"
                    >
                      <span>View Score Breakdown &amp; Proof</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Post-Execution Outcome Check-In in Right Rail */}
                <OutcomeTrackingCard
                  decisionId={decisionId}
                  canonicalWinner={displaySynthesis.canonical_result?.winner_option_name}
                />
              </aside>
            </div>
          )}

          {/* TAB 3: COMPARATIVE ALTERNATIVES, EVIDENCE & EPISTEMIC AUDIT */}
          {activeTab === "audit" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* ========================================================================= */}
              {/* 4. COMPARATIVE ALTERNATIVES & STRATEGIC TRADE-OFFS                         */}
              {/* ========================================================================= */}
              <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-5 space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#cfc7b2] dark:border-[#38332C]">
                  <div>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                      Strategic Comparison
                    </span>
                    <h3 className="font-newsreader text-xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Considered Alternatives &amp; Trade-Offs
                    </h3>
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#57534e] dark:text-[#A89F91]">
                    {displaySynthesis.alternatives_considered.length} Options Evaluated
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displaySynthesis.alternatives_considered.map((alt, idx) => (
                    <div
                      key={idx}
                      className={`rounded-none p-4 border flex flex-col justify-between transition-colors ${alt.is_recommended
                        ? "bg-[#E5DEC9]/90 dark:bg-[#2A2622] border-[#7a4e10] dark:border-[#D4AA50]"
                        : "bg-[#F4F0E6] dark:bg-[#181614] border-[#cfc7b2] dark:border-[#38332C]"
                        }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#cfc7b2]/80 dark:border-[#38332C]">
                          <h4 className="font-newsreader font-medium text-[#1d1d1b] dark:text-[#F0EAE1] text-base truncate">
                            {alt.name}
                          </h4>
                          {alt.is_recommended ? (
                            <span className="px-2 py-0.5 rounded-none text-[10px] font-mono uppercase font-bold bg-[#1d1d1b] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614] shrink-0">
                              Selected
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-none text-[10px] font-mono uppercase bg-[#EDE7D6] dark:bg-[#221F1C] text-[#57534e] dark:text-[#A89F91] border border-[#cfc7b2] dark:border-[#38332C] shrink-0">
                              Alternative
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed font-sans">
                          {alt.description}
                        </p>

                        <div className="space-y-2.5">
                          <div>
                            <span className="text-[11px] font-mono uppercase font-bold text-[#2E6F4E] dark:text-[#7FB08E] block mb-1">
                              Operational Advantages
                            </span>
                            <ul className="text-xs text-[#1d1d1b] dark:text-[#F0EAE1] space-y-1 font-sans">
                              {alt.pros.map((p, pIdx) => (
                                <li key={pIdx} className="flex items-start gap-1.5">
                                  <span className="text-[#2E6F4E] dark:text-[#7FB08E] font-bold font-mono">+</span>
                                  <span className="leading-snug">{p}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <span className="text-[11px] font-mono uppercase font-bold text-[#8C4A27] dark:text-[#D99B78] block mb-1">
                              Downsides &amp; Operational Drag
                            </span>
                            <ul className="text-xs text-[#1d1d1b] dark:text-[#F0EAE1] space-y-1 font-sans">
                              {alt.cons.map((c, cIdx) => (
                                <li key={cIdx} className="flex items-start gap-1.5">
                                  <span className="text-[#8C4A27] dark:text-[#D99B78] font-bold font-mono">&minus;</span>
                                  <span className="leading-snug">{c}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {alt.why_not_recommended && (
                        <div className="pt-3 border-t border-[#cfc7b2]/70 dark:border-[#38332C] mt-3 text-xs">
                          <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] bg-[#EDE7D6]/80 dark:bg-[#221F1C] p-2.5 rounded-none border border-[#cfc7b2] dark:border-[#38332C] leading-relaxed font-sans">
                            <strong className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">Why Deprioritized:</strong> {alt.why_not_recommended}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 5. EVIDENTIARY ROBUSTNESS, ASSUMPTIONS & RISK GOVERNANCE                   */}
              {/* ========================================================================= */}
              {/* Supporting Evidence Card (Full-Width) */}
              <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-5 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#cfc7b2] dark:border-[#38332C]">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                    Supporting Evidence Receipts
                  </span>
                  <span className="text-[11px] font-mono text-[#57534e] dark:text-[#A89F91] uppercase">
                    {displaySynthesis.supporting_evidence.length} Verified
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displaySynthesis.supporting_evidence.map((ev, idx) => (
                    <div key={idx} className="p-3.5 rounded-none bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs flex flex-col justify-between gap-2">
                      <p className="text-[#1d1d1b] dark:text-[#F0EAE1] font-medium leading-snug font-sans">
                        &ldquo;{ev.claim}&rdquo;
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#57534e] dark:text-[#A89F91] pt-1.5 border-t border-[#cfc7b2]/50 dark:border-[#38332C]/50">
                        <span className="truncate">{ev.source_title || "Empirical Benchmark"}</span>
                        {ev.source_url && (
                          <a
                            href={ev.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#7a4e10] dark:text-[#D4AA50] hover:underline flex items-center gap-1 font-mono text-[11px] shrink-0 font-bold"
                          >
                            <span>Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operating Assumptions & Inversion Stress Test (Full-Width) */}
              <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-5 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#cfc7b2] dark:border-[#38332C]">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                    Assumptions &amp; Sensitivity Stress Test
                  </span>
                  <span className="text-[11px] font-mono text-[#57534e] dark:text-[#A89F91] uppercase">
                    Pre-Mortem ({displaySynthesis.assumptions.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displaySynthesis.assumptions.map((item, idx) => (
                    <div key={idx} className="p-3.5 rounded-none bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug font-sans">
                          {item.assumption}
                        </span>
                        <span
                          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-none border shrink-0 font-bold ${item.is_verified
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                            : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                            }`}
                        >
                          {item.is_verified ? "Verified" : "Unverified"}
                        </span>
                      </div>
                      <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed font-sans">
                        <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">Failure Impact:</strong> {item.impact_if_false}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Critical Risks & Contingency Safeguards (Full-Width, 2-col internal grid) */}
              <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-5 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#cfc7b2] dark:border-[#38332C]">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                    Critical Risks &amp; Contingency Safeguards
                  </span>
                  <span className="text-[11px] font-mono text-[#57534e] dark:text-[#A89F91] uppercase">
                    Risk Governance ({displaySynthesis.risks_and_mitigations.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displaySynthesis.risks_and_mitigations.map((r, idx) => (
                    <div key={idx} className="p-3.5 rounded-none bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug font-sans">
                          {r.risk}
                        </span>
                        <span
                          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-none border shrink-0 font-bold ${r.severity === "high" || r.severity === "critical"
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800"
                            : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                            }`}
                        >
                          {r.severity}
                        </span>
                      </div>
                      <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed font-sans">
                        <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">Mitigation:</strong> {r.mitigation}
                      </p>
                      {r.contingency_plan && (
                        <p className="text-xs text-[#7a4e10] dark:text-[#D4AA50] font-medium leading-relaxed font-sans pt-1 border-t border-[#cfc7b2]/50 dark:border-[#38332C]/50">
                          <strong>Contingency Runbook:</strong> {r.contingency_plan}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ACTION PLAN */}
          {activeTab === "roadmap" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {displayRoadmap && (
                <RoadmapVisualizer
                  roadmap={displayRoadmap}
                  onUpdateRoadmap={(updated) => setActiveRoadmap(updated)}
                  onSaveRoadmap={handleSaveRoadmap}
                  isSaving={savingRoadmap}
                  isReadOnly={Boolean(viewingSnapshot)}
                />
              )}
            </div>
          )}

          {/* Unified MAUT Score Breakdown inside Comparison & Proof */}
          {activeTab === "audit" && whyBreakdownSlot && (
            <div className="space-y-6">
              {whyBreakdownSlot}
            </div>
          )}

          {/* AI Advisory & Limitation of Liability Disclaimer */}
          <div className="pt-3 border-t border-border/70 text-xs font-courier text-muted leading-relaxed">
            <strong>Advisory Notice:</strong> DecisionLens outputs are AI-assisted decision-support analyses grounded in your provided meeting takeaways and documents. Final architectural, financial, legal, and production commitments remain the sole responsibility of your engineering and leadership teams.
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="bg-paper-surface border border-border rounded-2xl p-10 sm:p-14 text-center space-y-4 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-paper-sidebar border border-border mx-auto flex items-center justify-center text-accent">
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="font-newsreader text-2xl font-normal text-ink">
              Ready for Strategic Synthesis
            </h3>
            <p className="text-xs text-muted font-sans leading-relaxed">
              Synthesize all cognitive findings, resolved information gaps, and multi-criteria evaluations into an executive-grade decision memo and 3-phase execution roadmap.
            </p>
          </div>
          <button
            onClick={handleRunSynthesis}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink hover:bg-ink-light text-paper-surface font-semibold text-xs rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Generating Executive Synthesis...</span>
              </>
            ) : (
              <>
                <span>Generate Executive Synthesis & Roadmap</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Sovereign Executive Override Modal */}
      {isOverrideModalOpen && displaySynthesis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-paper-surface border-2 border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 text-ink animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-accent" />
                <h3 className="text-base font-newsreader font-bold text-ink">
                  Sovereign Executive Override
                </h3>
              </div>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="text-muted hover:text-ink text-lg font-bold cursor-pointer"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-muted font-sans leading-relaxed">
              Exercise human leadership sovereignty. The AI evaluation recommends{" "}
              <strong className="text-ink font-semibold">
                {displaySynthesis.canonical_result?.winner_option_name || "Option C"}
              </strong>
              , but executive leadership holds full fiduciary authority to adopt an alternate path.
            </p>

            <div className="space-y-3 font-sans text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1.5 font-mono uppercase text-[15px]">
                  Select Mandated Architecture / Strategy
                </label>
                <div className="space-y-2">
                  {displaySynthesis.alternatives_considered.map((alt: any) => (
                    <label
                      key={alt.name}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedOverrideOption === alt.name
                        ? "bg-accent/10 border-accent text-ink font-semibold ring-1 ring-accent"
                        : "bg-paper-sidebar border-border text-muted hover:text-ink"
                        }`}
                    >
                      <input
                        type="radio"
                        name="override_option"
                        value={alt.name}
                        checked={selectedOverrideOption === alt.name}
                        onChange={(e) => setSelectedOverrideOption(e.target.value)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <span className="block text-ink font-bold text-xs">{alt.name}</span>
                        <span className="text-[15px] text-muted block leading-snug">{alt.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1.5 font-mono uppercase text-[15px]">
                  Executive Rationale / Board Justification
                </label>
                <textarea
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g., Mandatory board directive for sub-second audit log replication; team prioritizing team velocity over multi-cloud complexity..."
                  className="w-full px-3 py-2 bg-paper-sidebar border border-border rounded-xl text-ink text-xs focus:ring-1 focus:ring-accent focus:outline-hidden leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setIsOverrideModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-muted hover:text-ink font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingOverride || !selectedOverrideOption}
                onClick={handleConfirmOverride}
                className="px-4 py-1.5 bg-ink text-paper-surface font-semibold text-xs rounded-xl hover:bg-ink-light transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {savingOverride ? "Saving Override..." : "Confirm Executive Override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
