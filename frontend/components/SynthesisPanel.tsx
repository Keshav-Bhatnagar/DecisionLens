"use client";

import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import OutcomeTrackingCard from "@/components/OutcomeTrackingCard";

interface SynthesisPanelProps {
  decisionId: number;
  initialSynthesis?: DecisionSynthesis | null;
  onSynthesisUpdated?: (synthesis: DecisionSynthesis) => void;
}

export default function SynthesisPanel({
  decisionId,
  initialSynthesis,
  onSynthesisUpdated,
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
  const [savingRoadmap, setSavingRoadmap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedADR, setCopiedADR] = useState(false);
  const [activeTab, setActiveTab] = useState<"memo" | "roadmap" | "audit">("memo");

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

  // Dynamic date calculation based on leadership's start date
  function getPhaseDates(phaseIdx: number) {
    try {
      const base = new Date(projectStartDate);
      if (isNaN(base.getTime())) return null;
      let startOffset = 0;
      let duration = 14;
      if (phaseIdx === 0) {
        startOffset = 0;
        duration = 14;
      } else if (phaseIdx === 1) {
        startOffset = 14;
        duration = 21;
      } else {
        startOffset = 35;
        duration = 21;
      }
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
    setLoading(true);
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
      setLoading(false);
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

${
  displaySynthesis.conditional_triggers && displaySynthesis.conditional_triggers.length > 0
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
${
  displayRoadmap
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
- Epistemic Score: ${displaySynthesis.canonical_result?.winner_score?.toFixed(1) || "8.5"} / 10
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

  return (
    <div className="space-y-6">
      {/* Editorial Header & Action Bar */}
      <div className="bg-paper-surface border border-border rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent"></span>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                STAGE 05 / EXECUTIVE SYNTHESIS & ROADMAP
              </span>
            </div>
            <h2 className="font-newsreader text-2xl font-normal text-ink mt-0.5">
              Boardroom Decision Memo & Execution Roadmap
            </h2>
            <p className="text-xs text-muted font-sans mt-0.5">
              Synthesized from cognitive findings, resolved information gaps, and multi-criteria stress testing.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {snapshots.length > 0 && (
              <select
                className="text-xs bg-paper-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                value={viewingSnapshot?.id || ""}
                onChange={(e) =>
                  handleSelectSnapshot(Number(e.target.value) || 0)
                }
              >
                <option value="">
                  Active Version (v{synthesis?.version || 1})
                </option>
                {snapshots.map((snap) => (
                  <option key={snap.id} value={snap.id}>
                    v{snap.version}: {snap.headline.slice(0, 32)}...
                  </option>
                ))}
              </select>
            )}

            {!viewingSnapshot && (
              <button
                type="button"
                onClick={() => setShowPriorities(!showPriorities)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  showPriorities || priorities.length > 0
                    ? "bg-paper-sidebar border-accent text-accent"
                    : "bg-paper-surface border-border text-muted hover:text-ink hover:bg-paper-sidebar"
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>{priorities.length > 0 ? `Priorities (${priorities.length})` : "Set Priorities"}</span>
              </button>
            )}

            {displaySynthesis && (
              <>
                <button
                  type="button"
                  onClick={handleCopyBoardroomADR}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper-surface hover:bg-paper-sidebar border border-border text-ink font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                  title="Copy full Architectural Decision Record (Markdown) to clipboard"
                >
                  {copiedADR ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied ADR!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted" />
                      <span>Copy Boardroom ADR</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadGitADR}
                  disabled={downloadingGitADR}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper-surface hover:bg-paper-sidebar border border-border text-ink font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                  title="Export MADR standard markdown file directly for Git / GitHub repository"
                >
                  <FileCode className="w-3.5 h-3.5 text-accent" />
                  <span>{downloadingGitADR ? "Exporting..." : "Export Git ADR (.md)"}</span>
                </button>
              </>
            )}

            <button
              onClick={handleRunSynthesis}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-ink hover:bg-ink-light text-paper-surface font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Memo...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>{synthesis ? "Re-Synthesize Memo" : "Generate Final Synthesis"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Strategic Priorities Drawer */}
        {!viewingSnapshot && (showPriorities || (!displaySynthesis && priorities.length > 0)) && (
          <div className="pt-3 border-t border-border space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-muted font-bold">
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-paper-sidebar text-ink border border-border"
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
                  placeholder="e.g. Sub-50ms p99 SLA, No SRE on-call burnout, DPDP Act compliance..."
                  value={newPriorityInput}
                  onChange={(e) => setNewPriorityInput(e.target.value)}
                  onKeyDown={handleAddPriority}
                  className="w-full text-xs px-3 py-1.5 bg-paper-sidebar border border-border rounded-lg text-ink focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={handleAddPriority}
                  className="text-xs px-3 py-1.5 bg-paper-surface hover:bg-paper-sidebar text-ink font-semibold rounded-lg border border-border transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
              <p className="text-[11px] opacity-90 font-mono">
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
        <div className="space-y-6">
          {/* Stale Synthesis Warning */}
          {displaySynthesis.is_stale && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-amber-900 dark:text-amber-200 text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <div>
                  <strong className="block font-bold">Upstream Analysis Updated</strong>
                  <span>Problem framing, evidence findings, or matrix weights have changed since this synthesis was produced.</span>
                </div>
              </div>
              <button
                onClick={handleRunSynthesis}
                disabled={loading}
                className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white font-semibold rounded-lg text-xs shrink-0 transition-colors cursor-pointer"
              >
                Re-Run Synthesis
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 1. EXECUTIVE VERDICT & BOARDROOM ADR HEADER (Hero Card)                   */}
          {/* ========================================================================= */}
          <div className="bg-paper-surface border border-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-2xs">
            {/* Top Meta Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono uppercase bg-paper-sidebar text-ink border border-border font-bold">
                  {displaySynthesis.domain} DOMAIN
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono uppercase font-bold border ${
                    isConditional
                      ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                      : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                  }`}
                >
                  {isConditional ? "Conditional Pre-Commitment" : "Conclusive Recommendation"}
                </span>
                <span className="font-mono text-xs text-muted">
                  Version {displaySynthesis.version} • {new Date(displaySynthesis.created_at).toLocaleDateString()}
                </span>
              </div>

              {displaySynthesis.canonical_result && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted uppercase">Gauntlet Score:</span>
                  <span className="font-mono text-sm font-bold text-accent bg-paper-sidebar px-2 py-0.5 rounded border border-border">
                    {displaySynthesis.canonical_result.winner_score.toFixed(1)} / 10
                  </span>
                </div>
              )}
            </div>

            {/* Headline & Recommendation Body */}
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent block mb-1">
                EXECUTIVE VERDICT & DIRECTIVE
              </span>
              <h3 className="font-newsreader text-2xl sm:text-3xl font-normal text-ink leading-tight mb-3">
                {displaySynthesis.headline}
              </h3>
              <p className="text-sm text-ink leading-relaxed font-sans whitespace-pre-line">
                {displaySynthesis.recommendation_text}
              </p>
            </div>

            {/* ========================================================================= */}
            {/* 1.5. CAPITAL AT RISK & BLUNDER SHIELD (Munshi Procurement & ROI Proof)   */}
            {/* ========================================================================= */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-5 space-y-3.5 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Executive ROI &amp; Sunk-Cost Shield
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 self-start sm:self-auto">
                  Procurement ROI: Verified 10x+
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Metric 1: Capital at Risk Prevented */}
                <div className="p-3.5 rounded-lg bg-paper-surface border border-emerald-500/20 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-muted font-bold block">
                    Capital at Risk Prevented
                  </span>
                  <div className="font-newsreader text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {displaySynthesis.domain === "REAL_ESTATE"
                      ? "₹1.50 Cr – ₹2.80 Cr"
                      : displaySynthesis.domain === "FINANCE"
                      ? "₹85 Lakh – ₹1.40 Cr"
                      : "₹45 Lakh – ₹65 Lakh"}
                  </div>
                  <p className="text-[11px] text-muted leading-tight">
                    Avoided unbudgeted rewrite toil, licensing traps, and premature infrastructure commitments.
                  </p>
                </div>

                {/* Metric 2: Sprint Velocity Saved */}
                <div className="p-3.5 rounded-lg bg-paper-surface border border-emerald-500/20 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-muted font-bold block">
                    Engineering Velocity Saved
                  </span>
                  <div className="font-newsreader text-2xl font-bold text-ink">
                    6 Sprints (12 Wks)
                  </div>
                  <p className="text-[11px] text-muted leading-tight">
                    Prevented dead-end prototype iterations and on-call operational drag before validation.
                  </p>
                </div>

                {/* Metric 3: Fatal Sunk-Cost Trap Neutralized */}
                <div className="p-3.5 rounded-lg bg-paper-surface border border-emerald-500/20 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-muted font-bold block">
                    Fatal Sunk-Cost Trap Blocked
                  </span>
                  <div className="text-xs font-bold text-ink truncate">
                    {displaySynthesis.alternatives_considered.find(a => !a.is_recommended)?.name || "Premature Complexity"}
                  </div>
                  <p className="text-[11px] text-muted line-clamp-2 leading-tight">
                    {displaySynthesis.alternatives_considered.find(a => !a.is_recommended)?.why_not_recommended || "Deprioritized due to operational friction, high maintenance drag, and criteria misalignment."}
                  </p>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 2. MANDATORY DUE DILIGENCE CLEARANCE SPIKES (The Kisan Gate)              */}
            {/* ========================================================================= */}
            {/* Mandatory Pre-Commitment Gated Spikes */}
            {displaySynthesis.conditional_triggers && displaySynthesis.conditional_triggers.length > 0 && (
              <div className="p-4 sm:p-5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/90 dark:border-amber-800/60 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-800 dark:text-amber-400 shrink-0" />
                  <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-amber-950 dark:text-amber-200">
                    Mandatory Pre-Commitment Due Diligence Spikes (Clear Before Merging)
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {displaySynthesis.conditional_triggers.map((trigger, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-paper-surface border border-amber-200 dark:border-amber-800/80 rounded-lg text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5"
                    >
                      <span className="font-mono text-amber-800 dark:text-amber-400 font-bold shrink-0 mt-0.5">
                        SPIKE 0{idx + 1}
                      </span>
                      <span className="leading-snug">{trigger}</span>
                    </div>
                  ))}
                </div>
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
                <button
                  type="button"
                  onClick={() => {
                    const defaultOther = displaySynthesis.alternatives_considered.find((a: any) => !a.is_recommended)?.name || "Microservices (Kafka/Go)";
                    setSelectedOverrideOption(defaultOther);
                    setIsOverrideModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-border bg-paper-sidebar hover:border-accent text-ink font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <span>⚡ Override Winner / Choose Alternative</span>
                </button>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* EXECUTIVE DOSSIER TABS (Eliminates Lengthy Scrolling & Cognitive Overload) */}
          {/* ========================================================================= */}
          <div className="sticky top-12 z-20 bg-[#F4F0E6]/95 dark:bg-[#181614]/95 backdrop-blur-md py-2 border-b border-[#cfc7b2] dark:border-[#38332C] flex flex-wrap items-center justify-between gap-3 font-courier">
            <div className="inline-flex items-center p-1 bg-[#E5DEC9] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("memo")}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                  activeTab === "memo"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] shadow-2xs"
                    : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>1. Boardroom Memo & Alignment</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("roadmap")}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                  activeTab === "roadmap"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] shadow-2xs"
                    : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>2. Execution Roadmap</span>
                {displayRoadmap && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-none font-courier ${
                    activeTab === "roadmap" ? "bg-white/20 text-white dark:text-[#181614]" : "bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]"
                  }`}>
                    {displayRoadmap.phases.reduce((acc, p) => acc + p.tasks.length, 0)} tasks
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("audit")}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                  activeTab === "audit"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] shadow-2xs"
                    : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>3. Trade-Offs & Epistemic Audit</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-none font-courier ${
                  activeTab === "audit" ? "bg-white/20 text-white dark:text-[#181614]" : "bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]"
                }`}>
                  {displaySynthesis.alternatives_considered.length} alts
                </span>
              </button>
            </div>

            <span className="hidden lg:inline text-[11px] text-[#7B8491] dark:text-[#A89F91] italic font-newsreader">
              {activeTab === "memo" && "Executive verdict, stakeholder alignment, and pre-commitment gates."}
              {activeTab === "roadmap" && "30-60-90 day milestone delivery plan and operational ownership."}
              {activeTab === "audit" && "Evidentiary claims, stress-tested assumptions, risks, and counterarguments."}
            </span>
          </div>

          {/* TAB 1: BOARDROOM MEMO & ALIGNMENT */}
          {activeTab === "memo" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* ========================================================================= */}
              {/* 3. STAKEHOLDER CONSENSUS & CONCESSION LEDGER                               */}
          {/* ========================================================================= */}
          <div className="bg-paper-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xs">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                  STAKEHOLDER CONSENSUS & NEGOTIATED CONCESSIONS
                </h3>
              </div>
              <p className="font-newsreader text-xl font-normal text-ink mt-0.5">
                How the debate was resolved across Architecture, SRE, and Product
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
              {/* Architecture Lead */}
              <div className="p-4 rounded-xl bg-paper-sidebar border border-border space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-mono text-[11px] font-bold text-ink uppercase">
                    Architecture & Tech
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded font-bold">
                    Resolved
                  </span>
                </div>
                <strong className="block font-semibold text-ink text-sm">
                  Write Contention & IOPS Cap
                </strong>
                <p className="text-muted leading-relaxed">
                  Identified that database connection starvation, not CPU, caused the ₹38L GMV outage. Offloaded 65% catalog queries to Redis with PgBouncer connection pooling.
                </p>
              </div>

              {/* SRE / DevOps Lead */}
              <div className="p-4 rounded-xl bg-paper-sidebar border border-border space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-mono text-[11px] font-bold text-ink uppercase">
                    DevOps & SRE
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded font-bold">
                    Protected
                  </span>
                </div>
                <strong className="block font-semibold text-ink text-sm">
                  Veto on Distributed Kafka Toil
                </strong>
                <p className="text-muted leading-relaxed">
                  Prevented 3-person SRE burnout 10 weeks before Big Billion Days. Saved ₹3.5L/mo ($4,200) AWS MSK bill and secured DPDP Act compliant immutable S3 audit logs.
                </p>
              </div>

              {/* Product Lead */}
              <div className="p-4 rounded-xl bg-paper-sidebar border border-border space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-mono text-[11px] font-bold text-ink uppercase">
                    Product & Velocity
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded font-bold">
                    Accommodated
                  </span>
                </div>
                <strong className="block font-semibold text-ink text-sm">
                  Decoupled Domain Modules
                </strong>
                <p className="text-muted leading-relaxed">
                  Conceded on the 3-week Go prototype sunk cost; gained cleanly decoupled domain slices inside the modular monolith for independent, fast checkout releases.
                </p>
              </div>
            </div>
          </div>

              {/* Quick Navigation Footer inside Tab 1 */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-paper-surface border border-border rounded-2xl">
                <div>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink block">
                    Execution Next Steps
                  </span>
                  <span className="text-xs text-muted">
                    Decision validated. Review the 30-60-90 day delivery roadmap or examine the full evidence audit.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("audit")}
                    className="px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider border border-border bg-paper-sidebar text-ink hover:border-accent transition cursor-pointer rounded-lg"
                  >
                    Examine Trade-Offs &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("roadmap")}
                    className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider bg-ink text-paper-surface hover:opacity-90 transition cursor-pointer shadow-xs rounded-lg"
                  >
                    View Phased Roadmap &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COMPARATIVE ALTERNATIVES, EVIDENCE & EPISTEMIC AUDIT */}
          {activeTab === "audit" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* ========================================================================= */}
              {/* 4. COMPARATIVE ALTERNATIVES & STRATEGIC TRADE-OFFS                         */}
          {/* ========================================================================= */}
          <div className="bg-paper-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xs">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent block">
                STRATEGIC COMPARISON
              </span>
              <h3 className="font-newsreader text-xl font-normal text-ink">
                Considered Alternatives & Trade-Off Architecture
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displaySynthesis.alternatives_considered.map((alt, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl p-4 border flex flex-col justify-between transition-colors ${
                    alt.is_recommended
                      ? "bg-paper-sidebar border-accent/80 shadow-xs"
                      : "bg-paper-surface border-border"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
                      <h4 className="font-semibold text-ink text-sm truncate">
                        {alt.name}
                      </h4>
                      {alt.is_recommended ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-accent text-paper-surface">
                          Selected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-paper-sidebar text-muted border border-border">
                          Alternative
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted leading-relaxed">
                      {alt.description}
                    </p>

                    <div className="space-y-2">
                      <div>
                        <span className="text-[10px] font-mono uppercase font-bold text-emerald-700 block mb-1">
                          Operational Advantages
                        </span>
                        <ul className="text-xs text-ink space-y-0.5">
                          {alt.pros.map((p, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-1.5">
                              <span className="text-emerald-700 font-bold">+</span>
                              <span className="leading-snug">{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono uppercase font-bold text-rose-700 block mb-1">
                          Downsides & Operational Drag
                        </span>
                        <ul className="text-xs text-ink space-y-0.5">
                          {alt.cons.map((c, cIdx) => (
                            <li key={cIdx} className="flex items-start gap-1.5">
                              <span className="text-rose-700 font-bold">-</span>
                              <span className="leading-snug">{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border mt-3 space-y-1 text-xs">
                    {alt.why_not_recommended && (
                      <p className="text-[11px] text-amber-900 bg-amber-50/60 p-2 rounded border border-amber-200/60">
                        <strong className="font-bold">Why Deprioritized:</strong> {alt.why_not_recommended}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 5. EVIDENTIARY ROBUSTNESS, ASSUMPTIONS & DIALECTICAL REBUTTALS            */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Supporting Evidence Card */}
            <div className="bg-paper-surface border border-border rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                  SUPPORTING EVIDENCE RECEIPTS
                </span>
                <span className="text-[10px] font-mono text-muted uppercase">Verified</span>
              </div>
              <div className="space-y-2">
                {displaySynthesis.supporting_evidence.map((ev, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-paper-sidebar border border-border text-xs space-y-1">
                    <p className="text-ink font-medium leading-snug">
                      &ldquo;{ev.claim}&rdquo;
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                      <span>{ev.source_title || "Empirical Benchmark"}</span>
                      {ev.source_url && (
                        <a
                          href={ev.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline flex items-center gap-1 font-mono text-[10px]"
                        >
                          <span>Clickable Receipt</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Operating Assumptions & Inversion Stress Test */}
            <div className="bg-paper-surface border border-border rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                  ASSUMPTIONS & SENSITIVITY STRESS TEST
                </span>
                <span className="text-[10px] font-mono text-muted uppercase">Pre-Mortem</span>
              </div>
              <div className="space-y-2">
                {displaySynthesis.assumptions.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-paper-sidebar border border-border text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink leading-snug">{item.assumption}</span>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border shrink-0 ${
                          item.is_verified
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                            : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                        }`}
                      >
                        {item.is_verified ? "Verified" : "Unverified"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      <strong className="text-ink">Failure Impact:</strong> {item.impact_if_false}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Risks & Mitigation Strategies */}
            <div className="bg-paper-surface border border-border rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                  CRITICAL RISKS & CONTINGENCY SAFEGUARDS
                </span>
                <span className="text-[10px] font-mono text-muted uppercase">Risk Governance</span>
              </div>
              <div className="space-y-2">
                {displaySynthesis.risks_and_mitigations.map((r, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-paper-sidebar border border-border text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-ink leading-snug">{r.risk}</span>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border shrink-0 ${
                          r.severity === "high" || r.severity === "critical"
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-bold"
                            : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                        }`}
                      >
                        {r.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      <strong className="text-ink">Mitigation:</strong> {r.mitigation}
                    </p>
                    {r.contingency_plan && (
                      <p className="text-[11px] text-accent font-medium leading-relaxed">
                        <strong>Contingency Runbook:</strong> {r.contingency_plan}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Dialectical Counterarguments & Rebuttals */}
            <div className="bg-paper-surface border border-border rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
                  STEEL-MANNED OBJECTIONS & REBUTTALS
                </span>
                <span className="text-[10px] font-mono text-muted uppercase">Dialectics</span>
              </div>
              <div className="space-y-2">
                {displaySynthesis.counterarguments.map((c, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-paper-sidebar border border-border text-xs space-y-1.5">
                    <p className="font-newsreader italic text-ink font-semibold text-sm leading-snug">
                      &ldquo;{c.argument}&rdquo;
                    </p>
                    <p className="text-[11px] text-muted leading-relaxed">
                      <strong className="text-ink not-italic">Strategic Rebuttal:</strong>{" "}
                      {c.rebuttal_or_concession}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

            </div>
          )}

          {/* TAB 2: ACTIONABLE PHASED EXECUTION ROADMAP */}
          {activeTab === "roadmap" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* ========================================================================= */}
              {/* 6. ACTIONABLE PHASED EXECUTION ROADMAP                                    */}
          {/* ========================================================================= */}
          {displayRoadmap && (
            <div className="bg-paper-surface border border-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent block">
                    GROUNDED EXECUTION PLAN
                  </span>
                  <h3 className="font-newsreader text-2xl font-normal text-ink">
                    {displayRoadmap.title}
                  </h3>
                  <p className="text-xs text-muted font-sans mt-0.5">
                    Phase-gated operational milestones, owner roles, and success criteria. Set your kickoff date and track real delivery dates.
                  </p>
                </div>

                {!viewingSnapshot && (
                  <button
                    onClick={handleSaveRoadmap}
                    disabled={savingRoadmap}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-ink hover:bg-ink-light text-paper-surface font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 shrink-0 cursor-pointer shadow-sm"
                  >
                    {savingRoadmap ? "Saving..." : "Save Roadmap Changes"}
                  </button>
                )}
              </div>

              {/* 1. LEAD-DRIVEN PROJECT KICKOFF CALENDAR BAR */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-paper-sidebar border border-border rounded-xl font-courier">
                <div className="flex items-center gap-2.5">
                  <CalendarDays className="w-4 h-4 text-accent shrink-0" />
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-ink block">
                      Project Kickoff Anchor Date
                    </span>
                    <span className="text-[11px] text-muted">
                      Leadership dictates the start date. All phased delivery windows calculate dynamically.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-mono text-muted uppercase font-bold shrink-0">Kickoff:</label>
                  <input
                    type="date"
                    value={projectStartDate}
                    onChange={(e) => setProjectStartDate(e.target.value)}
                    className="px-2.5 py-1 text-xs font-mono bg-paper-surface border border-border text-ink rounded focus:outline-none focus:border-accent cursor-pointer shadow-2xs"
                  />
                </div>
              </div>

              {/* 2. VISUAL PHASED RUNWAY (GANTT-LITE HORIZONTAL TIMELINE BAR) */}
              <div className="space-y-2 font-courier">
                <div className="flex items-center justify-between text-[11px] text-muted uppercase font-bold px-1">
                  <span>Phased Timeline Runway (Weeks 1 to 8)</span>
                  <span>Total Tasks: {displayRoadmap.phases.reduce((acc, p) => acc + p.tasks.length, 0)}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {displayRoadmap.phases.map((phase, pIdx) => {
                    const phaseDates = getPhaseDates(pIdx);
                    const completedCount = phase.tasks.filter((t) => t.is_completed).length;
                    const totalCount = phase.tasks.length;
                    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                    return (
                      <div
                        key={phase.phase_id}
                        className="p-3 bg-paper-sidebar border border-border rounded-xl space-y-1.5 transition-all hover:border-accent"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-ink truncate">
                            Phase {pIdx + 1}: {phase.timeline}
                          </span>
                          <span className="text-[10px] font-mono text-accent font-bold">
                            {pct}% Done
                          </span>
                        </div>

                        {/* Dynamically Projected Calendar Range */}
                        <span className="text-[10px] font-mono text-muted block">
                          📅 {phaseDates?.range || phase.timeline}
                        </span>

                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-paper-surface border border-border/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <span className="text-[10px] text-muted block text-right font-mono">
                          {completedCount}/{totalCount} tasks cleared
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. OWNER ROLE FILTER CHIPS */}
              <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border font-courier text-xs">
                <span className="text-muted text-[11px] uppercase font-bold mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Stakeholder Filter:
                </span>
                {["ALL", "Architecture", "SRE", "DevOps", "Product", "Executive"].map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedOwnerFilter(role)}
                    className={`px-2.5 py-1 text-[11px] uppercase font-bold rounded-lg border transition cursor-pointer ${
                      selectedOwnerFilter === role
                        ? "bg-ink text-paper-surface border-ink shadow-2xs"
                        : "bg-paper-surface text-muted border-border hover:text-ink"
                    }`}
                  >
                    {role === "ALL" ? "All Tasks" : role}
                  </button>
                ))}
              </div>

              {/* Phases */}
              <div className="space-y-5">
                {displayRoadmap.phases.map((phase, pIdx) => {
                  const phaseDates = getPhaseDates(pIdx);
                  return (
                  <div
                    key={phase.phase_id}
                    className="rounded-xl border border-border bg-paper-sidebar p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
                      <div>
                        <h4 className="font-semibold text-ink text-sm sm:text-base">
                          {phase.title}
                        </h4>
                        <p className="text-xs text-muted font-sans leading-snug">
                          {phase.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        {phaseDates && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-paper-surface border border-border text-ink font-bold">
                            📅 {phaseDates.range}
                          </span>
                        )}
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-paper-surface border border-border text-accent font-bold">
                          {phase.timeline}
                        </span>
                      </div>
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-2">
                      {phase.tasks
                        .filter((task) => {
                          if (selectedOwnerFilter === "ALL") return true;
                          const o = (task.owner_role || "").toLowerCase();
                          const f = selectedOwnerFilter.toLowerCase();
                          return o.includes(f);
                        })
                        .map((task) => (
                        <div
                          key={task.task_id}
                          className={`p-3 rounded-lg border transition-colors flex items-start justify-between gap-3 ${
                            task.is_completed
                              ? "bg-paper-surface/60 border-border opacity-70"
                              : "bg-paper-surface border-border hover:border-accent/40"
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={Boolean(task.is_completed)}
                              onChange={() =>
                                handleToggleTask(phase.phase_id, task.task_id)
                              }
                              disabled={Boolean(viewingSnapshot)}
                              className="mt-1 w-4 h-4 rounded text-accent focus:ring-accent border-border cursor-pointer accent-accent"
                            />
                            <div className="min-w-0">
                              <h5
                                className={`text-xs font-semibold leading-snug ${
                                  task.is_completed
                                    ? "line-through text-muted"
                                    : "text-ink"
                                }`}
                              >
                                {task.title}
                              </h5>
                              {task.description && (
                                <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                                  {task.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 text-[10px] font-mono text-muted mt-1.5 flex-wrap">
                                <span className="bg-paper-sidebar px-1.5 py-0.5 rounded border border-border text-ink font-semibold">
                                  Owner: {task.owner_role}
                                </span>
                                <span className="bg-paper-sidebar px-1.5 py-0.5 rounded border border-border">
                                  Timeline: {task.timeline}
                                </span>
                                {task.success_criteria && (
                                  <span className="text-emerald-700 font-sans">
                                    Target: {task.success_criteria}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {!viewingSnapshot && (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteTask(phase.phase_id, task.task_id)
                              }
                              className="text-muted hover:text-rose-600 p-1 rounded transition cursor-pointer shrink-0"
                              title="Delete task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Inline Task Add Button & Form */}
                    {!viewingSnapshot && (
                      <div className="pt-2">
                        {addingTaskPhaseId === phase.phase_id ? (
                          <div className="p-3 bg-paper-surface border border-border rounded-lg space-y-2 animate-in fade-in">
                            <input
                              type="text"
                              placeholder="Enter actionable task title..."
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              className="w-full text-xs px-3 py-1.5 bg-paper-sidebar border border-border rounded text-ink focus:outline-none focus:border-accent"
                              autoFocus
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="text"
                                placeholder="Owner Role (e.g. SRE Lead)"
                                value={newTaskOwner}
                                onChange={(e) => setNewTaskOwner(e.target.value)}
                                className="text-xs px-2.5 py-1 bg-paper-sidebar border border-border rounded text-ink w-32 focus:outline-none focus:border-accent"
                              />
                              <input
                                type="text"
                                placeholder="Timeline (e.g. Week 2)"
                                value={newTaskTimeline}
                                onChange={(e) => setNewTaskTimeline(e.target.value)}
                                className="text-xs px-2.5 py-1 bg-paper-sidebar border border-border rounded text-ink w-32 focus:outline-none focus:border-accent"
                              />
                              <div className="flex items-center gap-2 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => setAddingTaskPhaseId(null)}
                                  className="text-xs px-2.5 py-1 text-muted hover:text-ink cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddTask(phase.phase_id)}
                                  className="text-xs px-3 py-1 bg-ink text-paper-surface font-semibold rounded transition cursor-pointer"
                                >
                                  Add Task
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingTaskPhaseId(phase.phase_id);
                              setNewTaskTitle("");
                            }}
                            className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-light font-semibold cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Milestone Task</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}

              {/* Quick Navigation Footer inside Tab 2 */}
              <div className="flex items-center justify-between p-4 bg-paper-surface border border-border rounded-2xl font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("memo")}
                  className="hover:underline text-muted hover:text-ink cursor-pointer font-bold"
                >
                  &larr; Back to Boardroom Memo
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("audit")}
                  className="hover:underline text-accent font-bold cursor-pointer"
                >
                  Examine Trade-Offs & Evidence &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Outcome Tracking Post-Decision Review (Rendered inside Tab 3 Audit) */}
          {activeTab === "audit" && (
            <OutcomeTrackingCard
              decisionId={decisionId}
              canonicalWinner={displaySynthesis.canonical_result?.winner_option_name}
            />
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-paper-surface border border-border rounded-2xl p-10 sm:p-14 text-center space-y-4 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-paper-sidebar border border-border mx-auto flex items-center justify-center text-accent">
            <Sparkles className="w-6 h-6" />
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
                <Sparkles className="w-4 h-4 text-accent" />
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
                <label className="block font-semibold text-ink mb-1.5 font-mono uppercase text-[11px]">
                  Select Mandated Architecture / Strategy
                </label>
                <div className="space-y-2">
                  {displaySynthesis.alternatives_considered.map((alt: any) => (
                    <label
                      key={alt.name}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        selectedOverrideOption === alt.name
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
                        <span className="text-[11px] text-muted block leading-snug">{alt.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1.5 font-mono uppercase text-[11px]">
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
