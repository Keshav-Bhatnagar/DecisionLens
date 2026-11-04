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
import { AlertTriangle, ExternalLink, Check } from "lucide-react";
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

      // Fetch synthesis, snapshots, and roadmap concurrently in parallel
      const [synthRes, snapListRes, roadmapRes] = await Promise.allSettled([
        !synthesis ? getDecisionSynthesis(decisionId) : Promise.resolve(synthesis),
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
      setViewingSnapshot(null);
      setSuccessMsg(
        `Decision Synthesis generated successfully (Version ${res.version}).`
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
    displaySynthesis?.synthesis_type === "conditional_next_step";

  return (
    <div className="space-y-6">
      {/* Editorial Header & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              <h2 className="text-base font-sans font-bold text-slate-900 tracking-tight">
                Decision Recommendation & Execution Roadmap
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Synthesized from cognitive findings, resolved information gaps, and multi-criteria evaluation.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {snapshots.length > 0 && (
              <select
                className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1.5 font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                className={`text-xs px-3 py-1.5 rounded font-medium border transition-colors ${
                  showPriorities || priorities.length > 0
                    ? "bg-slate-100 border-slate-200 text-slate-900"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-[slate-100]"
                }`}
              >
                {priorities.length > 0 ? `Priorities (${priorities.length})` : "Set Priorities"}
              </button>
            )}

            <button
              onClick={handleRunSynthesis}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded transition-colors disabled:opacity-50"
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
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500">
                Strategic Priorities & Decision Weights
              </label>
              <button
                type="button"
                onClick={() => setShowPriorities(false)}
                className="text-xs text-slate-400 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {priorities.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-900 border border-slate-200"
                >
                  {p}
                  <button
                    onClick={() => handleRemovePriority(p)}
                    className="hover:text-red-600 text-slate-400 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="e.g. Capex efficiency, Execution velocity, Regulatory risk..."
                  value={newPriorityInput}
                  onChange={(e) => setNewPriorityInput(e.target.value)}
                  onKeyDown={handleAddPriority}
                  className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddPriority}
                  className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded border border-slate-200 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Directly calibrates criteria weights and threshold tolerances during strategic synthesis.
            </p>
          </div>
        )}
      </div>

      {/* Alert Notices */}
      {error && (
        <div className="p-3.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-rose-700 hover:opacity-80 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-800 hover:opacity-80 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Historical Snapshot Notice */}
      {viewingSnapshot && (
        <div className="p-4 rounded bg-amber-50/80 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold">HISTORICAL DOSSIER</span>
            <div>
              <h4 className="font-bold">
                Viewing Immutable Snapshot Version {viewingSnapshot.version}
              </h4>
              <p className="text-[11px] opacity-90">
                Recorded on {new Date(viewingSnapshot.created_at).toLocaleString()} with verified criteria and evidence at that time.
              </p>
            </div>
          </div>
          <button
            onClick={() => setViewingSnapshot(null)}
            className="px-3 py-1.5 bg-white text-amber-900 font-medium text-xs rounded border border-amber-200 hover:bg-[amber-100] transition-colors shrink-0"
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
            <div className="p-4 rounded bg-amber-50/80 border border-amber-200 flex items-center justify-between text-amber-900 text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-900 shrink-0" />
                <div>
                  <strong className="block font-bold">Upstream Analysis Updated</strong>
                  <span>Problem framing, evidence findings, or matrix weights have changed since this synthesis was produced.</span>
                </div>
              </div>
              <button
                onClick={handleRunSynthesis}
                disabled={loading}
                className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded text-xs shrink-0 transition-colors"
              >
                Re-Run Synthesis
              </button>
            </div>
          )}

          {/* Executive Mandate & Recommendation Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            {/* Top Meta Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono uppercase bg-slate-100 text-slate-900 border border-slate-200">
                  {displaySynthesis.domain}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono uppercase font-semibold border ${
                    isConditional
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {isConditional ? "Conditional Pre-Commitment" : "Conclusive Recommendation"}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Snapshot v{displaySynthesis.version} • {new Date(displaySynthesis.created_at).toLocaleDateString()}
              </span>
            </div>

            {/* Strategic Directive Alignment Box */}
            {displaySynthesis.canonical_result && (
              <div className="p-3.5 rounded bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Recommended Strategic Path:</span>
                  <strong className="text-sm font-sans font-bold text-slate-900">
                    {displaySynthesis.canonical_result.winner_option_name}
                  </strong>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] font-mono uppercase text-slate-500 block">Evaluated Score</span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {displaySynthesis.canonical_result.winner_score.toFixed(1)}/10
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono uppercase font-bold border ${
                      displaySynthesis.canonical_result.decision_status === "READY"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {displaySynthesis.canonical_result.decision_status === "READY"
                      ? "Verified & Ready"
                      : "Preconditions Active"}
                  </span>
                </div>
              </div>
            )}

            {/* Headline & Recommendation Body */}
            <div>
              <h3 className="text-lg md:text-xl font-sans font-bold text-slate-900 leading-snug mb-2">
                {displaySynthesis.headline}
              </h3>
              <p className="text-xs md:text-sm text-slate-900 leading-relaxed font-normal whitespace-pre-line">
                {displaySynthesis.recommendation_text}
              </p>
            </div>

            {/* Conditional Triggers & Due Diligence Requirements */}
            {isConditional && displaySynthesis.conditional_triggers.length > 0 && (
              <div className="mt-4 p-4 rounded bg-slate-100/50 border border-slate-200">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-900 font-bold mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[amber-700]"></span>
                  Mandatory Precedent Conditions & Due-Diligence Clearances
                </h4>
                <ul className="space-y-1.5">
                  {displaySynthesis.conditional_triggers.map((trigger, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-slate-900 flex items-start gap-2"
                    >
                      <span className="font-mono text-amber-800 font-semibold shrink-0">
                        [{idx + 1}]
                      </span>
                      <span className="leading-relaxed">{trigger}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Alternatives Evaluated & Trade-offs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="mb-4">
              <h3 className="text-base font-sans font-bold text-slate-900">
                Comparative Alternatives & Strategic Trade-Offs
              </h3>
              <p className="text-xs text-slate-500">
                Side-by-side evaluation of considered alternatives with operational justifications.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displaySynthesis.alternatives_considered.map((alt, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl p-4 border flex flex-col justify-between transition-colors ${
                    alt.is_recommended
                      ? "bg-white border-2 border-indigo-600"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200">
                      <h4 className="font-sans font-bold text-slate-900 text-sm truncate">
                        {alt.name}
                      </h4>
                      {alt.is_recommended ? (
                        <span className="px-1.5 py-0.5 rounded-lg text-[10px] font-mono uppercase font-bold bg-indigo-600 text-white">
                          Selected
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-lg text-[10px] font-mono uppercase bg-slate-100 text-slate-500 border border-slate-200">
                          Alternative
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mb-3">
                      {alt.description}
                    </p>

                    <div className="space-y-2 mb-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase font-semibold text-emerald-700 block mb-1">
                          Advantages
                        </span>
                        <ul className="text-xs text-slate-900 space-y-0.5">
                          {alt.pros.map((p, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-1.5">
                              <span className="text-emerald-700 font-bold">+</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono uppercase font-semibold text-amber-800 block mb-1">
                          Disadvantages & Costs
                        </span>
                        <ul className="text-xs text-slate-900 space-y-0.5">
                          {alt.cons.map((c, cIdx) => (
                            <li key={cIdx} className="flex items-start gap-1.5">
                              <span className="text-amber-800 font-bold">-</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200 mt-2 space-y-1 text-xs">
                    {alt.tradeoffs && (
                      <p className="text-[11px] text-slate-500">
                        <strong className="text-slate-900">Trade-off:</strong> {alt.tradeoffs}
                      </p>
                    )}
                    {alt.why_not_recommended && (
                      <p className="text-[11px] text-amber-800">
                        <strong className="font-semibold">Why Deprioritized:</strong> {alt.why_not_recommended}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence, Assumptions, Risks & Dialectical Defense Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Supporting Evidence Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <h4 className="font-sans font-bold text-slate-900 text-sm">
                    Supporting Evidentiary Findings
                  </h4>
                  <span className="text-[10px] font-mono uppercase text-slate-500">
                    Verified
                  </span>
                </div>
                <div className="space-y-2.5">
                  {displaySynthesis.supporting_evidence.map((ev, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-slate-100/40 border border-slate-200 text-xs"
                    >
                      <p className="text-slate-900 font-medium mb-1">
                        &ldquo;{ev.claim}&rdquo;
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                        <span className="font-medium">
                          {ev.source_title || "Verified Source"}
                        </span>
                        {ev.source_url ? (
                          <a
                            href={ev.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:underline flex items-center gap-1 font-mono text-[10px]"
                          >
                            <span>Source Link</span>
                            <ExternalLink className="w-2.5 h-2.5 inline" />
                          </a>
                        ) : (
                          <span className="capitalize text-slate-400">
                            {ev.evidence_type.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Assumptions & Critical Failure Modes */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <h4 className="font-sans font-bold text-slate-900 text-sm">
                    Key Operating Assumptions
                  </h4>
                  <span className="text-[10px] font-mono uppercase text-slate-500">
                    Sensitivity
                  </span>
                </div>
                <div className="space-y-2.5">
                  {displaySynthesis.assumptions.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-slate-100/40 border border-slate-200 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium text-slate-900">
                          {item.assumption}
                        </span>
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-lg border shrink-0 ${
                            item.is_verified
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {item.is_verified ? "Verified" : "Unverified"}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px]">
                        <strong className="text-slate-900">Impact if False:</strong> {item.impact_if_false}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Risks & Mitigation Strategies */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <h4 className="font-sans font-bold text-slate-900 text-sm">
                    Risks, Mitigations & Contingency Plans
                  </h4>
                  <span className="text-[10px] font-mono uppercase text-slate-500">
                    Risk Governance
                  </span>
                </div>
                <div className="space-y-2.5">
                  {displaySynthesis.risks_and_mitigations.map((r, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-slate-100/40 border border-slate-200 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-slate-900">
                          {r.risk}
                        </span>
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-lg border shrink-0 ${
                            r.severity === "high" || r.severity === "critical"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {r.severity}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] mb-1">
                        <strong className="text-slate-900">Mitigation:</strong> {r.mitigation}
                      </p>
                      {r.contingency_plan && (
                        <p className="text-indigo-600 text-[11px]">
                          <strong>Contingency:</strong> {r.contingency_plan}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dialectical Counterarguments & Rebuttals */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <h4 className="font-sans font-bold text-slate-900 text-sm">
                    Dialectical Counterarguments & Rebuttals
                  </h4>
                  <span className="text-[10px] font-mono uppercase text-slate-500">
                    Steel-Manning
                  </span>
                </div>
                <div className="space-y-2.5">
                  {displaySynthesis.counterarguments.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-slate-100/40 border border-slate-200 text-xs"
                    >
                      <p className="font-sans italic font-bold text-slate-900 mb-1">
                        &ldquo;{c.argument}&rdquo;
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        <strong className="text-slate-900 not-italic">Strategic Rebuttal:</strong>{" "}
                        {c.rebuttal_or_concession}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Confidence Assessment & Information Limitations */}
          <div className="bg-slate-100 border border-slate-200 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 block mb-0.5">
                  Confidence Rating
                </span>
                <h4 className="text-base font-sans font-bold text-slate-900">
                  Decision Confidence:{" "}
                  <span className="text-indigo-600 font-mono">
                    {(displaySynthesis.confidence_assessment.score * 100).toFixed(0)}%
                  </span>{" "}
                  <span className="text-xs uppercase font-mono font-medium text-slate-500">
                    ({displaySynthesis.confidence_assessment.level})
                  </span>
                </h4>
              </div>

              <div className="w-full md:w-56 bg-[slate-200] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(10, displaySynthesis.confidence_assessment.score * 100))}%`,
                  }}
                ></div>
              </div>
            </div>

            <p className="text-xs text-slate-900 leading-relaxed mb-3">
              {displaySynthesis.confidence_assessment.rationale}
            </p>

            {displaySynthesis.confidence_assessment.limitations.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1.5">
                  Documented Information Limitations
                </span>
                <ul className="space-y-1">
                  {displaySynthesis.confidence_assessment.limitations.map((lim, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-slate-500 flex items-start gap-2"
                    >
                      <span className="text-indigo-600 font-bold">•</span>
                      <span>{lim}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Actionable Phased Execution Roadmap */}
          {displayRoadmap && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-sans font-bold text-slate-900">
                    {displayRoadmap.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Operational milestones, owner roles, and condition triggers. Check off completed tasks to track execution.
                  </p>
                </div>

                {!viewingSnapshot && (
                  <button
                    onClick={handleSaveRoadmap}
                    disabled={savingRoadmap}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded transition-colors disabled:opacity-50 shrink-0"
                  >
                    {savingRoadmap ? "Saving..." : "Save Roadmap Changes"}
                  </button>
                )}
              </div>

              {/* Phases */}
              <div className="space-y-5">
                {displayRoadmap.phases.map((phase) => (
                  <div
                    key={phase.phase_id}
                    className="rounded border border-slate-200 bg-white p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-sans font-bold text-slate-900 text-sm">
                          {phase.title}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {phase.description}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 shrink-0">
                        {phase.timeline}
                      </span>
                    </div>

                    {/* Tasks */}
                    <div className="space-y-2">
                      {phase.tasks.map((task) => (
                        <div
                          key={task.task_id}
                          className={`p-3 rounded border flex items-start gap-3 transition-colors ${
                            task.is_completed
                              ? "bg-slate-100/60 border-slate-200 opacity-75"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(task.is_completed)}
                            disabled={Boolean(viewingSnapshot)}
                            onChange={() =>
                              handleToggleTask(phase.phase_id, task.task_id)
                            }
                            className="mt-0.5 h-3.5 w-3.5 rounded-lg border-slate-200 text-indigo-600 focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={`text-xs font-medium ${
                                  task.is_completed
                                    ? "line-through text-slate-400"
                                    : "text-slate-900"
                                }`}
                              >
                                {task.title}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-900 border border-slate-200">
                                  {task.owner_role || "Lead"}
                                </span>
                                <span className="text-[9px] font-mono text-slate-400">
                                  {task.timeline}
                                </span>
                              </div>
                            </div>
                            {task.description && (
                              <p className="text-[11px] text-slate-500 mt-1">
                                {task.description}
                              </p>
                            )}
                            {task.reason && (
                              <p className="text-[11px] text-slate-500 mt-1 italic">
                                <strong className="not-italic text-slate-900 font-medium">Why this task:</strong> {task.reason}
                              </p>
                            )}
                            {task.success_criteria && (
                              <p className="text-[10px] text-indigo-600 font-mono mt-1 flex items-center gap-1">
                                <Check className="w-2.5 h-2.5 shrink-0" />
                                <span>Exit Criteria: {task.success_criteria}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Task Control */}
                    {!viewingSnapshot && (
                      <div className="pt-1">
                        {addingTaskPhaseId === phase.phase_id ? (
                          <div className="p-3 bg-slate-100/40 rounded border border-slate-200 space-y-2">
                            <input
                              type="text"
                              placeholder="New milestone task title..."
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Owner Role (e.g. Legal, Architect)"
                                value={newTaskOwner}
                                onChange={(e) => setNewTaskOwner(e.target.value)}
                                className="text-xs px-2 py-1 bg-white border border-slate-200 rounded flex-1 text-slate-900"
                              />
                              <input
                                type="text"
                                placeholder="Timeline (e.g. Week 2)"
                                value={newTaskTimeline}
                                onChange={(e) => setNewTaskTimeline(e.target.value)}
                                className="text-xs px-2 py-1 bg-white border border-slate-200 rounded flex-1 text-slate-900"
                              />
                              <button
                                onClick={() => handleAddTask(phase.phase_id)}
                                className="text-xs px-3 py-1 bg-slate-900 text-white font-medium rounded hover:bg-slate-800"
                              >
                                Add Task
                              </button>
                              <button
                                onClick={() => setAddingTaskPhaseId(null)}
                                className="text-xs px-2 py-1 text-slate-500 hover:text-slate-900"
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
                            className="text-xs font-medium text-indigo-600 hover:underline flex items-center gap-1"
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

          {/* Stage 6: Post-Decision Outcome & Follow-up Review */}
          <OutcomeTrackingCard
            decisionId={decisionId}
            canonicalWinner={
              displaySynthesis.canonical_result?.winner_option_name ||
              displaySynthesis.headline
            }
          />
        </div>
      ) : (

        /* Empty State */
        <div className="bg-white rounded border border-dashed border-slate-200 p-12 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-900 flex items-center justify-center mx-auto mb-3 text-sm font-mono font-bold">
            05
          </div>
          <h3 className="text-base font-sans font-bold text-slate-900 mb-1">
            Decision Synthesis Ready for Generation
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
            Synthesize your structured facts, answered evidence gaps, identified risks, and multi-criteria evaluations into an executive decision memo and actionable roadmap.
          </p>
          <button
            onClick={handleRunSynthesis}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Synthesizing Decision..." : "Generate Final Decision Synthesis"}
          </button>
        </div>
      )}
    </div>
  );
}
