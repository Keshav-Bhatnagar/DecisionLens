"use client";

import React, { useState, useEffect } from "react";
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
} from "@/lib/api";

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

  // User priority tags input
  const [priorities, setPriorities] = useState<string[]>([]);
  const [newPriorityInput, setNewPriorityInput] = useState("");
  const [showPriorities, setShowPriorities] = useState(false);

  // New task inline creation state
  const [addingTaskPhaseId, setAddingTaskPhaseId] = useState<string | null>(
    null
  );
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState("Lead");
  const [newTaskTimeline, setNewTaskTimeline] = useState("Week 1");

  // Load existing synthesis and snapshot history on mount
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch latest synthesis if not provided
      if (!synthesis) {
        try {
          const latest = await getDecisionSynthesis(decisionId);
          setSynthesis(latest);
          setActiveRoadmap(latest.roadmap);
        } catch {
          // May not be synthesized yet
        }
      }

      // 2. Fetch snapshot history
      try {
        const snapList = await getAnalysisSnapshots(decisionId);
        setSnapshots(snapList);
      } catch {
        // No snapshots yet
      }

      // 3. Fetch active editable roadmap
      try {
        const currentRoadmap = await getActiveRoadmap(decisionId);
        setActiveRoadmap(currentRoadmap);
      } catch {
        // Handled via synthesis roadmap
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Handle synthesis generation
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
      setViewingSnapshot(null); // Return to active version
      setSuccessMsg(
        `Final Decision Synthesis generated successfully (Version ${res.version})!`
      );
      if (onSynthesisUpdated) {
        onSynthesisUpdated(res);
      }
      // Refresh snapshots
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

  // Add priority tag
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

  // Toggle task completion
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

  // Add task to phase
  function handleAddTask(phaseId: string) {
    if (!newTaskTitle.trim() || !activeRoadmap) return;

    const newTask: RoadmapTask = {
      task_id: `custom-${Date.now().toString().slice(-5)}`,
      title: newTaskTitle.trim(),
      description: "",
      owner_role: newTaskOwner.trim() || "Lead",
      timeline: newTaskTimeline.trim() || "Week 1",
      dependencies: [],
      success_criteria: "",
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

    setAddingTaskPhaseId(null);
    setNewTaskTitle("");
  }

  // Save roadmap updates to backend
  async function handleSaveRoadmap() {
    if (!activeRoadmap) return;
    setSavingRoadmap(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await updateActiveRoadmap(decisionId, {
        title: activeRoadmap.title,
        phases: activeRoadmap.phases,
      });
      setActiveRoadmap(updated);
      setSuccessMsg(
        "Roadmap updated successfully! Prior analysis snapshots remain preserved."
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update roadmap";
      setError(message);
    } finally {
      setSavingRoadmap(false);
    }
  }

  // Load specific historical snapshot
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

  // Active displayed data: either from historical snapshot or live active synthesis
  const displaySynthesis: DecisionSynthesis | null = viewingSnapshot
    ? viewingSnapshot.recommendation
    : synthesis;

  const displayRoadmap: RoadmapData | null = viewingSnapshot
    ? viewingSnapshot.recommendation.roadmap
    : activeRoadmap;

  const isConditional =
    displaySynthesis?.synthesis_type === "conditional_next_step";

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header & Action Bar */}
      <div className="glass-panel rounded-2xl specular-edge p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Decision Recommendation & Roadmap
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Grounded in structured facts, answered evidence gaps, and deterministic framework scoring.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Snapshots Selector */}
            {snapshots.length > 0 && (
              <select
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    v{snap.version}: {snap.headline.slice(0, 30)}...
                  </option>
                ))}
              </select>
            )}

            {!viewingSnapshot && (
              <button
                type="button"
                onClick={() => setShowPriorities(!showPriorities)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                  showPriorities || priorities.length > 0
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {priorities.length > 0 ? `Priorities (${priorities.length})` : "Set Priorities"}
              </button>
            )}

            <button
              onClick={handleRunSynthesis}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs disabled:opacity-50 transition"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Synthesizing Decision...
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {synthesis ? "Re-Run Synthesis" : "Generate Final Synthesis"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Strategic Priorities Drawer */}
        {!viewingSnapshot && (showPriorities || (!displaySynthesis && priorities.length > 0)) && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Strategic Priorities & Weights (Optional Guidance)
              </label>
              <button
                type="button"
                onClick={() => setShowPriorities(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Collapse
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {priorities.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  {p}
                  <button
                    onClick={() => handleRemovePriority(p)}
                    className="hover:text-red-500 text-indigo-400 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="e.g. Lowest initial capex, Speed to market, High security..."
                  value={newPriorityInput}
                  onChange={(e) => setNewPriorityInput(e.target.value)}
                  onKeyDown={handleAddPriority}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddPriority}
                  className="text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Add
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Priorities guide trade-off criteria weighting and risk thresholds when synthesizing multiple framework evaluations.
            </p>
          </div>
        )}
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 font-bold"
          >
            ×
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-600 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Snapshot Viewing Notice Banner */}
      {viewingSnapshot && (
        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">📜</span>
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                Viewing Immutable Snapshot Version {viewingSnapshot.version}
              </h4>
              <p className="text-[11px] text-amber-700">
                Saved on{" "}
                {new Date(viewingSnapshot.created_at).toLocaleString()} with
                exact framework metrics, research citations, and priorities at that time.
              </p>
            </div>
          </div>
          <button
            onClick={() => setViewingSnapshot(null)}
            className="px-3 py-1.5 bg-white text-amber-900 font-semibold text-xs rounded-xl border border-amber-300 shadow-sm hover:bg-amber-100 transition"
          >
            Return to Active Version
          </button>
        </div>
      )}

      {/* Main Synthesis Presentation */}
      {displaySynthesis ? (
        <div className="space-y-8">
          {/* Upstream Stale Warning Banner */}
          {displaySynthesis.is_stale && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-between text-amber-900 text-xs shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="text-base">⚠️</span>
                <div>
                  <strong className="block font-bold">Upstream Analysis Changed (Stale Synthesis)</strong>
                  <span>Problem framing, structured findings, or gap answers have been updated since this synthesis was generated. Re-run synthesis to re-align with latest facts.</span>
                </div>
              </div>
              <button
                onClick={handleRunSynthesis}
                disabled={loading}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-xs shrink-0 transition"
              >
                Re-Run Synthesis
              </button>
            </div>
          )}

          {/* Executive Headline & Recommendation Card */}
          <div
            className={`rounded-3xl p-8 border shadow-lg transition relative overflow-hidden ${
              isConditional
                ? "bg-gradient-to-br from-amber-50/90 via-white to-orange-50/50 border-amber-200"
                : "bg-gradient-to-br from-indigo-50/90 via-white to-emerald-50/40 border-indigo-200"
            }`}
          >
            {/* Canonical Decision Framework Alignment */}
            {displaySynthesis.canonical_result && (
              <div className="mb-6 p-4 rounded-2xl bg-white/95 border border-indigo-100 shadow-2xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-slate-100 text-slate-700">
                      {displaySynthesis.canonical_result.domain}
                    </span>
                    <span className="text-xs text-slate-600">
                      Strategic Direction:{" "}
                      <strong className="text-indigo-700 font-bold">
                        {displaySynthesis.canonical_result.winner_option_name}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      Evaluated Score:{" "}
                      <strong className="text-slate-900 font-mono">
                        {displaySynthesis.canonical_result.winner_score.toFixed(1)}/10
                      </strong>
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        displaySynthesis.canonical_result.decision_status === "READY"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {displaySynthesis.canonical_result.decision_status === "READY"
                        ? "✓ Verified & Ready"
                        : "⚡ Preconditions Required"}
                    </span>
                  </div>
                </div>

                {displaySynthesis.canonical_result.conditions_precedent &&
                  displaySynthesis.canonical_result.conditions_precedent.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[11px] font-semibold text-amber-900 block mb-1">
                        Preconditions to satisfy before execution:
                      </span>
                      <ul className="text-xs text-slate-700 space-y-1">
                        {displaySynthesis.canonical_result.conditions_precedent.map(
                          (cond, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
                              <span className="leading-relaxed">{cond}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span
                className={`px-3.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                  isConditional
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                }`}
              >
                {isConditional
                  ? "⚠ Conditional Next Step (Risk-Gated)"
                  : "✓ Conclusive Strategic Recommendation"}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Snapshot v{displaySynthesis.version} •{" "}
                {new Date(displaySynthesis.created_at).toLocaleDateString()}
              </span>
            </div>

            <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
              {displaySynthesis.headline}
            </h3>
            <p className="text-slate-700 leading-relaxed text-sm md:text-base font-normal">
              {displaySynthesis.recommendation_text}
            </p>

            {/* Conditional Triggers (if applicable) */}
            {isConditional &&
              displaySynthesis.conditional_triggers.length > 0 && (
                <div className="mt-6 bg-white/90 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                    Mandatory Conditional Triggers & Boundary Benchmarks
                  </h4>
                  <ul className="space-y-2">
                    {displaySynthesis.conditional_triggers.map(
                      (trigger, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-700 flex items-start gap-2.5 font-medium"
                        >
                          <span className="font-mono text-amber-600 font-bold">
                            [{idx + 1}]
                          </span>
                          <span>{trigger}</span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
          </div>

          {/* Alternatives Evaluated & Tradeoffs */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Alternatives Evaluated & Strategic Trade-offs
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              Side-by-side comparison of considered paths with explicit reasons for selection or rejection.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {displaySynthesis.alternatives_considered.map((alt, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl p-5 border flex flex-col justify-between transition ${
                    alt.is_recommended
                      ? "bg-indigo-50/40 border-indigo-300 ring-2 ring-indigo-500/20 shadow-md"
                      : "bg-slate-50/60 border-slate-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-900 text-sm">
                        {alt.name}
                      </h4>
                      {alt.is_recommended ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Recommended
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-600">
                          Alternative
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mb-4">
                      {alt.description}
                    </p>

                    <div className="space-y-3 mb-4">
                      <div>
                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
                          Pros
                        </span>
                        <ul className="text-xs text-slate-600 space-y-1">
                          {alt.pros.map((p, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold">+</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block mb-1">
                          Cons
                        </span>
                        <ul className="text-xs text-slate-600 space-y-1">
                          {alt.cons.map((c, cIdx) => (
                            <li key={cIdx} className="flex items-start gap-1.5">
                              <span className="text-red-500 font-bold">-</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 mt-2">
                    <p className="text-[11px] text-slate-500 italic mb-2">
                      <strong className="not-italic text-slate-700 font-semibold">
                        Trade-off:
                      </strong>{" "}
                      {alt.tradeoffs}
                    </p>
                    {alt.why_not_recommended && (
                      <p className="text-[11px] text-red-700 font-medium">
                        <strong>Why Not Chosen:</strong>{" "}
                        {alt.why_not_recommended}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence, Assumptions, Risks & Counterarguments Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Supporting Evidence Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span className="text-base">🔍</span> Supporting Evidence (Zero Invented Sources)
                  </h4>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Grounded Citations
                  </span>
                </div>
                <div className="space-y-3">
                  {displaySynthesis.supporting_evidence.map((ev, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                    >
                      <p className="text-slate-800 font-medium mb-1">
                        &ldquo;{ev.claim}&rdquo;
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                        <span className="font-semibold text-indigo-700">
                          {ev.source_title || "Verified Source"}
                        </span>
                        {ev.source_url ? (
                          <a
                            href={ev.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 font-medium underline flex items-center gap-1"
                          >
                            View Source ↗
                          </a>
                        ) : (
                          <span className="text-slate-400 capitalize">
                            {ev.evidence_type.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Assumptions & Critical Failure Modes */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span className="text-base">⚖</span> Key Assumptions & Impact If False
                  </h4>
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Sensitivity
                  </span>
                </div>
                <div className="space-y-3">
                  {displaySynthesis.assumptions.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-800">
                          {item.assumption}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            item.is_verified
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.is_verified ? "Verified" : "Unverified"}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] mt-1">
                        <strong className="text-slate-700">If False:</strong>{" "}
                        {item.impact_if_false}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Risks & Mitigation Strategies */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span className="text-base">🛡</span> Risks, Mitigations & Contingency Fallbacks
                  </h4>
                  <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                    Threat Defense
                  </span>
                </div>
                <div className="space-y-3">
                  {displaySynthesis.risks_and_mitigations.map((r, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-slate-900">
                          {r.risk}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            r.severity === "high" || r.severity === "critical"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {r.severity}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] mb-1">
                        <strong className="text-slate-700">Mitigation:</strong>{" "}
                        {r.mitigation}
                      </p>
                      <p className="text-indigo-700 text-[11px] font-medium">
                        <strong>Contingency:</strong> {r.contingency_plan}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Steel-Manned Counterarguments */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span className="text-base">🥊</span> Opposing Views & Rebuttals (Steel-manning)
                  </h4>
                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                    Dialectical Rigor
                  </span>
                </div>
                <div className="space-y-3">
                  {displaySynthesis.counterarguments.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                    >
                      <p className="font-bold text-purple-900 mb-1">
                        &ldquo;{c.argument}&rdquo;
                      </p>
                      <p className="text-slate-600 text-[11px]">
                        <strong className="text-slate-700">Rebuttal:</strong>{" "}
                        {c.rebuttal_or_concession}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Confidence Assessment & Limitations Gauge */}
          <div className="bg-slate-900 text-white rounded-3xl p-7 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-1">
                  Confidence Assessment & Limitations
                </span>
                <h4 className="text-xl font-bold tracking-tight">
                  Overall Decision Confidence:{" "}
                  <span
                    className={
                      displaySynthesis.confidence_assessment.level === "high"
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }
                  >
                    {(
                      displaySynthesis.confidence_assessment.score * 100
                    ).toFixed(0)}
                    % ({displaySynthesis.confidence_assessment.level.toUpperCase()})
                  </span>
                </h4>
              </div>

              {/* Visual meter */}
              <div className="w-full md:w-64 bg-slate-800 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    displaySynthesis.confidence_assessment.level === "high"
                      ? "bg-gradient-to-r from-emerald-500 to-indigo-500"
                      : "bg-gradient-to-r from-amber-500 to-orange-500"
                  }`}
                  style={{
                    width: `${displaySynthesis.confidence_assessment.score * 100}%`,
                  }}
                ></div>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              {displaySynthesis.confidence_assessment.rationale}
            </p>

            {displaySynthesis.confidence_assessment.limitations.length > 0 && (
              <div className="pt-4 border-t border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Documented Information Limitations & Blindspots
                </span>
                <ul className="space-y-1.5">
                  {displaySynthesis.confidence_assessment.limitations.map(
                    (lim, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-slate-400 flex items-start gap-2"
                      >
                        <span className="text-amber-400 font-bold">•</span>
                        <span>{lim}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Actionable Editable Execution Roadmap */}
          {displayRoadmap && (
            <div className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🗺</span>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                      {displayRoadmap.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Editable operational execution plan. Check off completed tasks or add custom milestone requirements.
                  </p>
                </div>

                {!viewingSnapshot && (
                  <button
                    onClick={handleSaveRoadmap}
                    disabled={savingRoadmap}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow transition disabled:opacity-50"
                  >
                    {savingRoadmap ? "Saving..." : "Save Roadmap Changes"}
                  </button>
                )}
              </div>

              {/* Phases Display */}
              <div className="space-y-6">
                {displayRoadmap.phases.map((phase) => (
                  <div
                    key={phase.phase_id}
                    className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">
                          {phase.title}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {phase.description}
                        </p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
                        {phase.timeline}
                      </span>
                    </div>

                    {/* Task items */}
                    <div className="space-y-2.5">
                      {phase.tasks.map((task) => (
                        <div
                          key={task.task_id}
                          className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                            task.is_completed
                              ? "bg-emerald-50/50 border-emerald-200 opacity-80"
                              : "bg-white border-slate-200 shadow-sm"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(task.is_completed)}
                            disabled={Boolean(viewingSnapshot)}
                            onChange={() =>
                              handleToggleTask(phase.phase_id, task.task_id)
                            }
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={`text-xs font-semibold ${
                                  task.is_completed
                                    ? "line-through text-slate-500"
                                    : "text-slate-900"
                                }`}
                              >
                                {task.title}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {task.owner_role || "Lead"}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {task.timeline}
                                </span>
                              </div>
                            </div>
                            {task.description && (
                              <p className="text-[11px] text-slate-600 mt-1">
                                {task.description}
                              </p>
                            )}
                            {task.success_criteria && (
                              <span className="text-[10px] text-emerald-700 font-medium block mt-1">
                                ✓ <strong>Success Criteria:</strong>{" "}
                                {task.success_criteria}
                              </span>
                            )}
                            {task.reason && (
                              <p className="text-[11px] text-slate-600 mt-1 italic">
                                <strong className="not-italic text-slate-700 font-medium">Why this task:</strong> {task.reason}
                              </p>
                            )}
                            {(task.source_type || (task.depends_on_gap_ids && task.depends_on_gap_ids.length > 0)) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {task.source_type && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase font-semibold">
                                    Source: {task.source_type.replace(/_/g, " ")}
                                  </span>
                                )}
                                {task.depends_on_gap_ids && task.depends_on_gap_ids.length > 0 && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                    Resolves: {task.depends_on_gap_ids.join(", ")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Task Control (when not viewing historical snapshot) */}
                    {!viewingSnapshot && (
                      <div>
                        {addingTaskPhaseId === phase.phase_id ? (
                          <div className="p-3 bg-white rounded-xl border border-indigo-200 space-y-2 mt-2">
                            <input
                              type="text"
                              placeholder="New task title..."
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Owner Role (e.g. Lead, DevOps)"
                                value={newTaskOwner}
                                onChange={(e) => setNewTaskOwner(e.target.value)}
                                className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg flex-1"
                              />
                              <input
                                type="text"
                                placeholder="Timeline (e.g. Week 1)"
                                value={newTaskTimeline}
                                onChange={(e) =>
                                  setNewTaskTimeline(e.target.value)
                                }
                                className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg flex-1"
                              />
                              <button
                                onClick={() => handleAddTask(phase.phase_id)}
                                className="text-xs px-3 py-1 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700"
                              >
                                Add Task
                              </button>
                              <button
                                onClick={() => setAddingTaskPhaseId(null)}
                                className="text-xs px-2 py-1 text-slate-500 hover:text-slate-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingTaskPhaseId(phase.phase_id);
                              setNewTaskTitle("");
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition"
                          >
                            + Add Milestone Task
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-300">
          <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            ⚡
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            No Decision Synthesis Generated Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
            Synthesize all extracted facts, answered gaps, external research
            findings, and framework scores into an executive recommendation or
            conditional next step.
          </p>
          <button
            onClick={handleRunSynthesis}
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-2xl shadow-md transition disabled:opacity-50"
          >
            {loading ? "Synthesizing Decision..." : "Generate Final Decision Synthesis"}
          </button>
        </div>
      )}
    </div>
  );
}
