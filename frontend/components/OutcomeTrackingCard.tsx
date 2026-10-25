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

      const payload: DecisionOutcomeCreate = {
        implementation_status: status,
        chosen_option: chosenOption.trim() || canonicalWinner || "Recommended Path",
        utility_rating: utilityRating,
        days_since_decision: daysElapsed,
        what_worked_well: whatWorked.trim(),
        lessons_learned: lessonsLearned.trim(),
        unexpected_challenges: challenges,
        would_recommend_tool: utilityRating >= 3,
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
          className="px-3.5 py-1.5 bg-[#2F5D8F] hover:bg-[#254b73] text-[#FCFBF8] text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 shadow-sm"
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
        <div className="p-6 bg-[#FCFBF8] border border-[#D9D2C3] rounded text-center text-xs text-[#5A6275]">
          Loading recorded outcomes...
        </div>
      ) : latest ? (
        /* Display Latest Recorded Review */
        <div className="bg-[#FCFBF8] border border-[#D9D2C3] rounded-lg p-5 shadow-sm">
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
        <div className="bg-[#FCFBF8] border border-dashed border-[#D9D2C3] rounded-lg p-6 text-center">
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
            className="px-3 py-1.5 bg-[#161E33] hover:bg-[#1e293b] text-[#FCFBF8] text-xs font-medium rounded transition-colors"
          >
            Log 30-Day Decision Outcome
          </button>
        </div>
      )}

      {/* Modal / Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-[#FCFBF8] border border-[#D9D2C3] rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
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

            <form onSubmit={handleSubmitOutcome} className="space-y-4 text-xs">
              {/* Implementation Status */}
              <div>
                <label className="block font-semibold text-[#161E33] mb-1">
                  Implementation Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "implemented_as_recommended", label: "Implemented as Recommended" },
                    { id: "pivoted_to_alternative", label: "Pivoted to Alternative" },
                    { id: "delayed", label: "In Progress / Delayed" },
                    { id: "abandoned", label: "Cancelled / Abandoned" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStatus(s.id)}
                      className={`p-2 rounded text-left border transition-all ${
                        status === s.id
                          ? "bg-[#2F5D8F] text-[#FCFBF8] border-[#2F5D8F] font-medium"
                          : "bg-[#EFEADF] text-[#161E33] border-[#D9D2C3] hover:border-[#2F5D8F]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Utility Rating */}
              <div>
                <label className="block font-semibold text-[#161E33] mb-1">
                  Decision Utility Rating: {utilityRating} / 5 Stars
                </label>
                <div className="flex items-center gap-1.5 text-2xl cursor-pointer">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setUtilityRating(star)}
                      className={`transition-transform hover:scale-110 ${
                        star <= utilityRating ? "text-amber-500" : "text-[#D9D2C3]"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="text-xs text-[#5A6275] ml-2">
                    {utilityRating === 5
                      ? "High impact / Mission critical"
                      : utilityRating >= 4
                      ? "Very useful & clarifying"
                      : utilityRating >= 3
                      ? "Moderately helpful"
                      : "Did not meet expectations"}
                  </span>
                </div>
              </div>

              {/* Chosen Option & Days Elapsed */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#161E33] mb-1">
                    Option Actually Implemented
                  </label>
                  <input
                    type="text"
                    value={chosenOption}
                    onChange={(e) => setChosenOption(e.target.value)}
                    placeholder="e.g. Supabase + PgBouncer"
                    className="w-full px-2.5 py-1.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded text-[#161E33]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#161E33] mb-1">
                    Days Post-Decision
                  </label>
                  <select
                    value={daysElapsed}
                    onChange={(e) => setDaysElapsed(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded text-[#161E33]"
                  >
                    <option value={14}>14 Days (Early Rollout)</option>
                    <option value={30}>30 Days (Pilot Check)</option>
                    <option value={60}>60 Days (Mid-Term)</option>
                    <option value={90}>90 Days (Quarterly Review)</option>
                    <option value={180}>180 Days (Long-Term Outcome)</option>
                  </select>
                </div>
              </div>

              {/* What Worked Well */}
              <div>
                <label className="block font-semibold text-[#161E33] mb-1">
                  What Succeeded in Real-World Rollout?
                </label>
                <textarea
                  rows={2}
                  value={whatWorked}
                  onChange={(e) => setWhatWorked(e.target.value)}
                  placeholder="e.g., Latency stayed under 80ms, budget targets were met without surprise invoices..."
                  className="w-full px-2.5 py-1.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded text-[#161E33]"
                />
              </div>

              {/* Lessons Learned */}
              <div>
                <label className="block font-semibold text-[#161E33] mb-1">
                  Key Lessons Learned (Stored in Folder Memory)
                </label>
                <textarea
                  rows={2}
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                  placeholder="e.g., Enable connection pooling before running load tests; set up automated alerts for burst queries..."
                  className="w-full px-2.5 py-1.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded text-[#161E33]"
                />
              </div>

              {/* Unexpected Challenges */}
              <div>
                <label className="block font-semibold text-[#161E33] mb-1">
                  Unforeseen Pitfalls or Obstacles
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
                    placeholder="Add an unexpected challenge and press Enter..."
                    className="flex-1 px-2.5 py-1.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded text-[#161E33]"
                  />
                  <button
                    type="button"
                    onClick={handleAddChallenge}
                    className="px-3 py-1 bg-[#EFEADF] border border-[#D9D2C3] rounded hover:bg-[#D9D2C3] text-[#161E33]"
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
                          className="hover:text-rose-900 font-bold"
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
                  className="px-3 py-1.5 text-[#5A6275] hover:text-[#161E33]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#2F5D8F] hover:bg-[#254b73] text-[#FCFBF8] font-medium rounded transition-colors disabled:opacity-50"
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
