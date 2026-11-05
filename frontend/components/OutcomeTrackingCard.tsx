"use client";

import React, { useState, useEffect } from "react";
import {
  DecisionOutcome,
  DecisionOutcomeCreate,
  getDecisionOutcomes,
  createDecisionOutcome,
  deleteDecisionOutcome,
} from "@/lib/api";

interface OutcomeTrackingCardProps {
  decisionId: number;
  canonicalWinner?: string;
}

export default function OutcomeTrackingCard({
  decisionId,
  canonicalWinner,
}: OutcomeTrackingCardProps) {
  const [outcomes, setOutcomes] = useState<DecisionOutcome[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [status, setStatus] = useState<string>("implemented_as_recommended");
  const [chosenOption, setChosenOption] = useState<string>(canonicalWinner || "");
  const [utilityRating, setUtilityRating] = useState<number>(5);
  const [daysElapsed, setDaysElapsed] = useState<number>(30);
  const [whatWorked, setWhatWorked] = useState<string>("");
  const [lessonsLearned, setLessonsLearned] = useState<string>("");
  const [challenges, setChallenges] = useState<string[]>([]);
  const [newChallenge, setNewChallenge] = useState<string>("");
  const [targetMetrics, setTargetMetrics] = useState({
    slaMet: true,
    budgetHeld: true,
    sreLoadManageable: true,
  });

  useEffect(() => {
    loadOutcomes();
  }, [decisionId]);

  useEffect(() => {
    if (canonicalWinner && !chosenOption) {
      setChosenOption(canonicalWinner);
    }
  }, [canonicalWinner]);

  async function loadOutcomes() {
    try {
      setLoading(true);
      const res = await getDecisionOutcomes(decisionId);
      setOutcomes(res || []);
    } catch (err: unknown) {
      console.warn("Could not load outcomes:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleAddChallenge() {
    if (!newChallenge.trim()) return;
    if (!challenges.includes(newChallenge.trim())) {
      setChallenges([...challenges, newChallenge.trim()]);
    }
    setNewChallenge("");
  }

  function handleRemoveChallenge(item: string) {
    setChallenges(challenges.filter((c) => c !== item));
  }

  async function handleSubmitOutcome(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);

      const finalChosen =
        status === "implemented_as_recommended"
          ? canonicalWinner || "Recommended Path"
          : chosenOption.trim() || "Alternative Path";

      const metricsSummary = [
        targetMetrics.slaMet ? "✓ Performance SLA Met" : "⚠ Performance SLA Missed",
        targetMetrics.budgetHeld ? "✓ Budget & Cost Target Maintained" : "⚠ Cloud Budget Overrun",
        targetMetrics.sreLoadManageable ? "✓ SRE/Team Load Manageable" : "⚠ Elevated Operational Drag",
      ].join(" • ");

      const retroText = lessonsLearned.trim() || whatWorked.trim();
      const combinedWhatWorked = `${metricsSummary}${retroText ? `\n\n${retroText}` : ""}`;

      const payload: DecisionOutcomeCreate = {
        implementation_status: status,
        chosen_option: finalChosen,
        utility_rating: utilityRating,
        days_since_decision: daysElapsed,
        what_worked_well: combinedWhatWorked,
        lessons_learned: retroText || metricsSummary,
        unexpected_challenges: challenges,
        would_recommend_tool: utilityRating >= 3,
        predicted_vs_actual: {
          sla_met: targetMetrics.slaMet,
          budget_held: targetMetrics.budgetHeld,
          sre_load_manageable: targetMetrics.sreLoadManageable,
        },
      };

      const res = await createDecisionOutcome(decisionId, payload);
      setOutcomes([res, ...outcomes.filter((o) => o.id !== res.id)]);
      setIsModalOpen(false);
      setSuccessMsg("Real-world decision outcome recorded successfully! This has been saved to your organizational memory.");
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save outcome";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to remove this outcome review?")) return;
    try {
      await deleteDecisionOutcome(decisionId, id);
      setOutcomes(outcomes.filter((o) => o.id !== id));
    } catch (err: unknown) {
      alert("Failed to delete review");
    }
  }

  const latest = outcomes.length > 0 ? outcomes[0] : null;

  return (
    <div className="mt-8 pt-8 border-t border-[#D9D2C3]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#5A6275] block mb-1">
            Stage 6 • Closed-Loop Accountability
          </span>
          <h3 className="text-lg font-serif font-bold text-[#161E33]">
            Real-World Follow-Up & Outcome Tracking
          </h3>
          <p className="text-xs text-[#5A6275]">
            Close the decision loop. Measure whether the implemented recommendation delivered expected value and train folder memory.
          </p>
        </div>

        <button
          onClick={() => {
            setError(null);
            setIsModalOpen(true);
          }}
          className="px-3.5 py-1.5 bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] text-xs font-bold uppercase tracking-wider rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-xs"
        >
          <span>★</span>
          <span>{latest ? "Log Follow-Up Check-in" : "Log Decision Outcome"}</span>
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="p-6 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-center text-xs text-[#4f4b40] dark:text-[#A89F91]">
          Loading recorded outcomes...
        </div>
      ) : latest ? (
        /* Display Latest Recorded Review */
        <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D9D2C3]">
            <div className="flex items-center gap-3">
              <div className="flex text-amber-500 text-sm">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span key={star}>
                    {star <= latest.utility_rating ? "★" : "☆"}
                  </span>
                ))}
              </div>
              <span className="text-xs font-bold text-[#161E33]">
                {latest.utility_rating}/5 Utility Rating
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EFEADF] text-[#5A6275]">
                {latest.days_since_decision} Days Post-Decision
              </span>
            </div>

            <span
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border font-medium ${
                latest.implementation_status === "implemented_as_recommended"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : latest.implementation_status === "pivoted_to_alternative"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              {latest.implementation_status.replace(/_/g, " ")}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-xs">
            <div>
              <span className="text-[10px] font-mono uppercase text-[#5A6275] block mb-0.5">
                Adopted Choice
              </span>
              <p className="font-semibold text-[#161E33]">{latest.chosen_option}</p>
            </div>

            {latest.what_worked_well && (
              <div>
                <span className="text-[10px] font-mono uppercase text-[#5A6275] block mb-0.5">
                  What Succeeded
                </span>
                <p className="text-[#161E33] leading-relaxed">{latest.what_worked_well}</p>
              </div>
            )}
          </div>

          {latest.lessons_learned && (
            <div className="mt-3 p-3 bg-[#EFEADF] rounded border border-[#D9D2C3] text-xs">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A6275] block mb-1">
                Lessons Learned (Injected into Folder Memory)
              </span>
              <p className="text-[#161E33] italic">&ldquo;{latest.lessons_learned}&rdquo;</p>
            </div>
          )}


          {latest.unexpected_challenges && latest.unexpected_challenges.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A6275] block mb-1">
                Production Challenges Encountered
              </span>
              <div className="flex flex-wrap gap-1.5">
                {latest.unexpected_challenges.map((c, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded"
                  >
                    ⚠ {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-[#D9D2C3] flex items-center justify-between text-[10px] text-[#5A6275]">
            <span>
              Recorded on {new Date(latest.created_at).toLocaleDateString()}
            </span>
            <button
              onClick={() => handleDelete(latest.id)}
              className="text-rose-600 hover:underline"
            >
              Delete Review
            </button>
          </div>
        </div>
      ) : (
        /* Empty Prompt Banner */
        <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-dashed border-[#cfc7b2] dark:border-[#38332C] rounded-sm p-6 text-center">
          <div className="w-8 h-8 rounded-full bg-[#EFEADF] text-[#2F5D8F] flex items-center justify-center mx-auto mb-2 text-sm font-bold">
            ★
          </div>
          <h4 className="text-sm font-bold text-[#161E33] mb-1">
            No Real-World Outcome Recorded Yet
          </h4>
          <p className="text-xs text-[#5A6275] max-w-md mx-auto mb-3">
            Did you follow the recommendation? Check in at 30, 60, or 90 days to log whether this decision solved the problem, stay accountable, and help your team learn from past results.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-[#1d1d1b] hover:bg-transparent hover:text-[#1d1d1b] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold uppercase tracking-wider rounded-sm transition-colors shadow-xs"
          >
            Log 30-Day Decision Outcome
          </button>
        </div>
      )}

      {/* Modal / Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border-2 border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] rounded-sm shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 text-[#1d1d1b] dark:text-[#F0EAE1]">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9D2C3] mb-4">
              <div>
                <h3 className="text-base font-serif font-bold text-[#161E33]">
                  Post-Decision Outcome Review
                </h3>
                <span className="text-[10px] text-[#5A6275]">
                  Evaluate decision effectiveness and log organizational lessons.
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#5A6275] hover:text-[#161E33] text-lg font-bold"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmitOutcome} className="space-y-4 text-xs font-sans">
              {/* 1. Implementation Status */}
              <div>
                <label className="block font-semibold text-[#161E33] mb-1 font-mono uppercase text-[11px]">
                  1. Implementation Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "implemented_as_recommended", label: "✓ Implemented as Recommended" },
                    { id: "pivoted_to_alternative", label: "⇄ Pivoted to Alternative" },
                    { id: "delayed", label: "⏳ In Progress / Delayed" },
                    { id: "abandoned", label: "✕ Cancelled / Abandoned" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStatus(s.id)}
                      className={`p-2.5 rounded text-left border transition-all cursor-pointer ${
                        status === s.id
                          ? "bg-[#2F5D8F] dark:bg-[#D4AA50] text-[#FCFBF8] dark:text-[#181614] border-[#2F5D8F] dark:border-[#D4AA50] font-bold shadow-xs"
                          : "bg-[#EFEADF] dark:bg-[#1C1917] text-[#161E33] dark:text-[#F0EAE1] border-[#D9D2C3] dark:border-[#38332C] hover:border-[#2F5D8F] dark:hover:border-[#D4AA50]"
                      }`}
                    >
                      <span className="block text-xs">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Dynamic Adopted Path (No redundant input if recommended) */}
              {status === "implemented_as_recommended" ? (
                <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">
                      Confirmed Production Path
                    </span>
                    <span className="font-semibold text-[#161E33] dark:text-[#F0EAE1]">{canonicalWinner || "Recommended Architecture"}</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-bold">
                    Standard Mandate
                  </span>
                </div>
              ) : status === "pivoted_to_alternative" ? (
                <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded space-y-1.5">
                  <label className="block font-semibold text-amber-900 dark:text-amber-200 font-mono text-[10px] uppercase">
                    Pivoted Alternative Deployed
                  </label>
                  <input
                    type="text"
                    value={chosenOption}
                    onChange={(e) => setChosenOption(e.target.value)}
                    placeholder="e.g., Microservices (Kafka/Go) or Managed In-Memory Redis"
                    className="w-full px-2.5 py-1.5 bg-[#FCFBF8] dark:bg-[#181614] border border-amber-300 dark:border-amber-700 rounded text-[#161E33] dark:text-[#F0EAE1] focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                    required
                  />
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                    Specify the alternate architecture or vendor adopted by leadership.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-stone-100 dark:bg-stone-900/60 border border-stone-300 dark:border-stone-700 rounded space-y-1.5">
                  <label className="block font-semibold text-stone-800 dark:text-stone-200 font-mono text-[10px] uppercase">
                    Delay or Cancellation Rationale
                  </label>
                  <input
                    type="text"
                    value={chosenOption}
                    onChange={(e) => setChosenOption(e.target.value)}
                    placeholder="e.g., Priority shifted to compliance audit; cloud budget frozen"
                    className="w-full px-2.5 py-1.5 bg-[#FCFBF8] dark:bg-[#181614] border border-stone-300 dark:border-stone-700 rounded text-[#161E33] dark:text-[#F0EAE1]"
                  />
                </div>
              )}

              {/* 3. Audit Horizon Chips (Replaces clunky dropdown) */}
              <div>
                <label className="block font-semibold text-[#161E33] dark:text-[#F0EAE1] mb-1 font-mono uppercase text-[11px]">
                  2. Review Horizon Milestone
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { days: 14, label: "⚡ 14d Spike Check" },
                    { days: 30, label: "📅 30d Pilot Check" },
                    { days: 60, label: "📊 60d Mid-Term" },
                    { days: 90, label: "🏛️ 90d Quarterly Audit" },
                    { days: 180, label: "🗓️ 180d Long-Term" },
                  ].map((h) => (
                    <button
                      key={h.days}
                      type="button"
                      onClick={() => setDaysElapsed(h.days)}
                      className={`px-2.5 py-1 text-xs rounded border transition cursor-pointer font-mono font-medium ${
                        daysElapsed === h.days
                          ? "bg-[#161E33] dark:bg-[#D4AA50] text-[#FCFBF8] dark:text-[#181614] border-[#161E33] dark:border-[#D4AA50] shadow-xs"
                          : "bg-[#EFEADF] dark:bg-[#1C1917] text-[#161E33] dark:text-[#F0EAE1] border-[#D9D2C3] dark:border-[#38332C] hover:border-[#161E33] dark:hover:border-[#D4AA50]"
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Executive Outcome Health & Verdict (Replaces consumer stars) */}
              <div>
                <label className="block font-semibold text-[#161E33] dark:text-[#F0EAE1] mb-1 font-mono uppercase text-[11px]">
                  3. Executive Decision Health Verdict
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { rating: 5, label: "🎯 Exceeded Targets", desc: "Outperformed SLAs & cost goals" },
                    { rating: 4, label: "✅ Met Expectations", desc: "Core planned objectives achieved" },
                    { rating: 3, label: "⚠️ Mixed / Partial", desc: "Worked, but created technical drag" },
                    { rating: 2, label: "❌ Underperformed", desc: "Missed targets or caused outages" },
                  ].map((v) => (
                    <button
                      key={v.rating}
                      type="button"
                      onClick={() => setUtilityRating(v.rating)}
                      className={`p-2 rounded text-left border transition cursor-pointer ${
                        utilityRating === v.rating
                          ? "bg-amber-50 dark:bg-amber-950/50 border-amber-600 dark:border-[#D4AA50] ring-1 ring-amber-600 dark:ring-[#D4AA50] text-amber-950 dark:text-amber-200 font-bold"
                          : "bg-[#EFEADF] dark:bg-[#1C1917] text-[#161E33] dark:text-[#F0EAE1] border-[#D9D2C3] dark:border-[#38332C] hover:border-amber-400 dark:hover:border-[#D4AA50]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs">{v.label}</span>
                        <span className="text-[10px] font-mono text-[#5A6275] dark:text-[#A89F91]">{v.rating}/5</span>
                      </div>
                      <span className="text-[10px] text-[#5A6275] dark:text-[#A89F91] block font-normal mt-0.5 leading-tight">
                        {v.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Target Variance Verification (1-Click Toggles) */}
              <div>
                <label className="block font-semibold text-[#161E33] dark:text-[#F0EAE1] mb-1 font-mono uppercase text-[11px]">
                  4. Production Target Verification
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetMetrics({ ...targetMetrics, slaMet: !targetMetrics.slaMet })}
                    className={`p-2 rounded border text-left cursor-pointer transition ${
                      targetMetrics.slaMet
                        ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold"
                        : "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    <span className="text-xs block">{targetMetrics.slaMet ? "✓ Latency SLA Met" : "✕ Latency SLA Missed"}</span>
                    <span className="text-[9px] font-mono opacity-80">sub-50ms p99 Target</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetMetrics({ ...targetMetrics, budgetHeld: !targetMetrics.budgetHeld })}
                    className={`p-2 rounded border text-left cursor-pointer transition ${
                      targetMetrics.budgetHeld
                        ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold"
                        : "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    <span className="text-xs block">{targetMetrics.budgetHeld ? "✓ Cloud Budget Held" : "✕ Budget Overrun"}</span>
                    <span className="text-[9px] font-mono opacity-80">Zero Infra Surprise</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetMetrics({ ...targetMetrics, sreLoadManageable: !targetMetrics.sreLoadManageable })}
                    className={`p-2 rounded border text-left cursor-pointer transition ${
                      targetMetrics.sreLoadManageable
                        ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold"
                        : "bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    <span className="text-xs block">{targetMetrics.sreLoadManageable ? "✓ SRE Load Safe" : "✕ High SRE Fatigue"}</span>
                    <span className="text-[9px] font-mono opacity-80">3-Person SRE Team</span>
                  </button>
                </div>
              </div>

              {/* 6. Consolidated Retrospective Field (Replaces 2 repetitive essays) */}
              <div>
                <label className="block font-semibold text-[#161E33] dark:text-[#F0EAE1] mb-1 font-mono uppercase text-[11px]">
                  5. Retrospective Learnings (Stored in Folder Memory)
                </label>
                <textarea
                  rows={3}
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                  placeholder="Summarize production results: What succeeded? Did PgBouncer hold connection load? Any runbook surprises or tuning tips that subsequent decisions in this workspace must remember?"
                  className="w-full px-2.5 py-1.5 bg-[#FCFBF8] dark:bg-[#181614] border border-[#D9D2C3] dark:border-[#38332C] rounded text-[#161E33] dark:text-[#F0EAE1] leading-relaxed text-xs focus:ring-1 focus:ring-[#2F5D8F] dark:focus:ring-[#D4AA50] focus:outline-hidden"
                />
              </div>

              {/* 7. Unforeseen Challenges (Optional Tags) */}
              <div>
                <label className="block font-semibold text-[#161E33] dark:text-[#F0EAE1] mb-1 font-mono uppercase text-[11px]">
                  6. Production Obstacles & Outages (Optional Tags)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newChallenge}
                    onChange={(e) => setNewChallenge(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddChallenge();
                      }
                    }}
                    placeholder="Add an unexpected incident/pitfall and press Enter..."
                    className="flex-1 px-2.5 py-1.5 bg-[#FCFBF8] dark:bg-[#181614] border border-[#D9D2C3] dark:border-[#38332C] rounded text-[#161E33] dark:text-[#F0EAE1]"
                  />
                  <button
                    type="button"
                    onClick={handleAddChallenge}
                    className="px-3 py-1 bg-[#EFEADF] dark:bg-[#1C1917] border border-[#D9D2C3] dark:border-[#38332C] rounded hover:bg-[#D9D2C3] dark:hover:bg-[#2C2824] text-[#161E33] dark:text-[#F0EAE1] font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {challenges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {challenges.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[10px]"
                      >
                        <span>{c}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveChallenge(c)}
                          className="hover:text-rose-900 font-bold cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#D9D2C3]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-[#5A6275] hover:text-[#161E33] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#2F5D8F] hover:bg-[#254b73] text-[#FCFBF8] font-bold rounded transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {submitting ? "Saving Outcome..." : "Save Outcome Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
