"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Layers,
  HelpCircle,
  Plus,
  Trash2,
  Lock,
  ChevronDown,
  ChevronUp,
  Save,
  RotateCw,
  Info,
  ShieldCheck,
  Brain,
  Scale,
  Zap,
} from "lucide-react";
import {
  analyzeDecisionInputs,
  updateStructuredFindings,
  StructuredFindings,
  PrivateTranscriptFeedback,
  StructuringResponse,
} from "@/lib/api";

interface StructuredFindingsEditorProps {
  decisionId: number;
  initialFindings?: StructuredFindings;
  isReviewed?: boolean;
  onFindingsUpdated: () => void;
}

export default function StructuredFindingsEditor({
  decisionId,
  initialFindings,
  isReviewed = false,
  onFindingsUpdated,
}: StructuredFindingsEditorProps) {
  const [findings, setFindings] = useState<StructuredFindings | null>(
    initialFindings && (initialFindings.facts?.length || initialFindings.summary)
      ? initialFindings
      : null
  );
  const [reviewed, setReviewed] = useState(isReviewed);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPrivateFeedback, setShowPrivateFeedback] = useState(false);

  // Synchronize when initial props change
  useEffect(() => {
    if (initialFindings && (initialFindings.facts?.length || initialFindings.summary)) {
      setFindings(initialFindings);
    }
    setReviewed(isReviewed);
  }, [initialFindings, isReviewed]);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await analyzeDecisionInputs(decisionId);
      setFindings(res.findings);
      setReviewed(res.points_reviewed);
      setSuccessMsg("Inputs successfully categorized into 8 cognitive categories!");
      onFindingsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to structure inputs. Ensure problem statement or transcript is present."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateItem = (
    category: keyof Omit<StructuredFindings, "private_feedback" | "summary" | "reviewed" | "reviewed_at">,
    index: number,
    newValue: string
  ) => {
    if (!findings) return;
    const list = [...(findings[category] || [])];
    list[index] = newValue;
    setFindings({
      ...findings,
      [category]: list,
    });
    // Any manual modification reverts reviewed state until approved
    if (reviewed) setReviewed(false);
  };

  const handleDeleteItem = (
    category: keyof Omit<StructuredFindings, "private_feedback" | "summary" | "reviewed" | "reviewed_at">,
    index: number
  ) => {
    if (!findings) return;
    const list = [...(findings[category] || [])];
    list.splice(index, 1);
    setFindings({
      ...findings,
      [category]: list,
    });
    if (reviewed) setReviewed(false);
  };

  const handleAddItem = (
    category: keyof Omit<StructuredFindings, "private_feedback" | "summary" | "reviewed" | "reviewed_at">
  ) => {
    if (!findings) return;
    const list = [...(findings[category] || []), ""];
    setFindings({
      ...findings,
      [category]: list,
    });
    if (reviewed) setReviewed(false);
  };

  const handleSaveAndApprove = async (approve: boolean = true) => {
    if (!findings) return;

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // Filter out empty items
      const cleanData = {
        facts: findings.facts.filter((f) => f.trim().length > 0),
        assumptions: findings.assumptions.filter((f) => f.trim().length > 0),
        feelings: findings.feelings.filter((f) => f.trim().length > 0),
        pros: findings.pros.filter((f) => f.trim().length > 0),
        cons: findings.cons.filter((f) => f.trim().length > 0),
        mixed_points: findings.mixed_points.filter((f) => f.trim().length > 0),
        contradictions: findings.contradictions.filter((f) => f.trim().length > 0),
        unknowns: findings.unknowns.filter((f) => f.trim().length > 0),
        summary: findings.summary,
        private_feedback: findings.private_feedback,
        mark_reviewed: approve,
      };

      const res = await updateStructuredFindings(decisionId, cleanData);
      setFindings(res.findings);
      setReviewed(res.points_reviewed);
      setSuccessMsg(
        approve
          ? "Findings successfully reviewed and approved! Ready for deeper analysis."
          : "Draft findings saved."
      );
      onFindingsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update structured findings."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Category Configuration for visual distinction
  const categoryConfigs: Array<{
    key: keyof Omit<StructuredFindings, "private_feedback" | "summary" | "reviewed" | "reviewed_at">;
    title: string;
    description: string;
    icon: string;
    colorClasses: {
      border: string;
      headerBg: string;
      badge: string;
      accent: string;
    };
  }> = [
    {
      key: "facts",
      title: "Facts",
      description: "Concrete verified data, constraints, and realities",
      icon: "📌",
      colorClasses: {
        border: "border-sky-200",
        headerBg: "bg-sky-50/80",
        badge: "bg-sky-100 text-sky-800",
        accent: "focus:border-sky-500",
      },
    },
    {
      key: "assumptions",
      title: "Assumptions",
      description: "Unverified hypotheses, untested premises, projections",
      icon: "💭",
      colorClasses: {
        border: "border-purple-200",
        headerBg: "bg-purple-50/80",
        badge: "bg-purple-100 text-purple-800",
        accent: "focus:border-purple-500",
      },
    },
    {
      key: "feelings",
      title: "Feelings & Sentiment",
      description: "Emotional reactions, team sentiment, gut instincts, and morale",
      icon: "❤️",
      colorClasses: {
        border: "border-rose-200",
        headerBg: "bg-rose-50/80",
        badge: "bg-rose-100 text-rose-800",
        accent: "focus:border-rose-500",
      },
    },
    {
      key: "pros",
      title: "Pros & Strengths",
      description: "Advantages, positive benefits, and favorable outcomes",
      icon: "🟢",
      colorClasses: {
        border: "border-emerald-200",
        headerBg: "bg-emerald-50/80",
        badge: "bg-emerald-100 text-emerald-800",
        accent: "focus:border-emerald-500",
      },
    },
    {
      key: "cons",
      title: "Cons & Risks",
      description: "Downsides, vulnerabilities, friction, and costs",
      icon: "🔴",
      colorClasses: {
        border: "border-red-200",
        headerBg: "bg-red-50/80",
        badge: "bg-red-100 text-red-800",
        accent: "focus:border-red-500",
      },
    },
    {
      key: "mixed_points",
      title: "Mixed Points & Trade-Offs",
      description: "Nuanced points carrying both upsides and drawbacks",
      icon: "⚖️",
      colorClasses: {
        border: "border-amber-200",
        headerBg: "bg-amber-50/80",
        badge: "bg-amber-100 text-amber-800",
        accent: "focus:border-amber-500",
      },
    },
    {
      key: "contradictions",
      title: "Contradictions",
      description: "Conflicting claims or opposing views across stakeholders",
      icon: "⚡",
      colorClasses: {
        border: "border-orange-200",
        headerBg: "bg-orange-50/80",
        badge: "bg-orange-100 text-orange-800",
        accent: "focus:border-orange-500",
      },
    },
    {
      key: "unknowns",
      title: "Unknowns & Open Questions",
      description: "Missing information, unanswered queries, and uncertainties",
      icon: "❓",
      colorClasses: {
        border: "border-indigo-200",
        headerBg: "bg-indigo-50/80",
        badge: "bg-indigo-100 text-indigo-800",
        accent: "focus:border-indigo-500",
      },
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
      {/* Module Title and Run Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Cognitive Input Structuring (8 Categories)
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              AI separates unstructured notes, transcripts, and documents into 8 distinct categories.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {findings && (
            <button
              type="button"
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
              Re-analyze
            </button>
          )}

          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {isAnalyzing
              ? "Categorizing Untrusted Input..."
              : findings
              ? "Update Structuring"
              : "Structure Inputs into 8 Categories"}
          </button>
        </div>
      </div>

      {/* Review Gate Alert Banner */}
      {findings && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
            reviewed
              ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
              : "bg-amber-50/80 border-amber-200 text-amber-900"
          }`}
        >
          <div className="flex items-start gap-3">
            {reviewed ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  {reviewed ? "Findings Reviewed & Approved" : "User Review Required"}
                </span>
                {reviewed ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Ready for Framework Analysis
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    Review Gate Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {reviewed
                  ? "You have verified these categorized findings. Downstream analysis frameworks will use these approved points."
                  : "Please review and edit the extracted points below. Ensure accuracy and click 'Approve & Save Structured Findings' before proceeding."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleSaveAndApprove(!reviewed)}
            disabled={isSaving}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
              reviewed
                ? "bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                : "bg-amber-600 border-transparent text-white hover:bg-amber-700 shadow-sm"
            }`}
          >
            {reviewed ? "Mark Unreviewed" : "Approve Findings"}
          </button>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Empty State when findings not yet generated */}
      {!findings && !isAnalyzing && (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-3">
          <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 mx-auto flex items-center justify-center text-indigo-600 shadow-xs">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">No Structured Findings Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Click &quot;Structure Inputs into 8 Categories&quot; to aggregate the problem statement, notes, transcript, and attached documents into distinct cognitive categories.
            </p>
          </div>
        </div>
      )}

      {/* Structured Content Display */}
      {findings && (
        <div className="space-y-6">
          {/* Executive Summary */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Executive Context Synthesis
            </label>
            <textarea
              rows={2}
              value={findings.summary || ""}
              onChange={(e) => {
                setFindings({ ...findings, summary: e.target.value });
                if (reviewed) setReviewed(false);
              }}
              className="w-full text-xs text-slate-800 bg-white border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="Objective synthesis of the decision context..."
            />
          </div>

          {/* 8 Category Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categoryConfigs.map((config) => {
              const items = findings[config.key] || [];

              return (
                <div
                  key={config.key}
                  className={`border rounded-xl overflow-hidden bg-white shadow-xs ${config.colorClasses.border}`}
                >
                  {/* Category Header */}
                  <div
                    className={`px-4 py-3 border-b flex items-center justify-between ${config.colorClasses.headerBg} ${config.colorClasses.border}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{config.icon}</span>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 block truncate">
                          {config.title}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          {config.description}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${config.colorClasses.badge}`}
                    >
                      {items.length}
                    </span>
                  </div>

                  {/* Items List */}
                  <div className="p-3 space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2 group">
                        <span className="text-xs text-slate-400 font-mono mt-1.5 shrink-0 select-none">
                          {idx + 1}.
                        </span>
                        <textarea
                          rows={2}
                          value={item}
                          onChange={(e) => handleUpdateItem(config.key, idx, e.target.value)}
                          className={`w-full text-xs text-slate-800 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors ${config.colorClasses.accent}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(config.key, idx)}
                          title="Remove item"
                          className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 opacity-70 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Add Item Button */}
                    <button
                      type="button"
                      onClick={() => handleAddItem(config.key)}
                      className="w-full py-1.5 border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add {config.title.split(" ")[0]}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Private Transcript Feedback Drawer (Collapsible) */}
          {findings.private_feedback && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-900 text-slate-200 shadow-sm">
              <button
                type="button"
                onClick={() => setShowPrivateFeedback(!showPrivateFeedback)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                        Private Transcript Reflection
                      </span>
                      <span className="text-[10px] bg-slate-800 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full font-mono">
                        Internal Feedback Only
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Private coaching notes on tone, potential biases, and clarity before final decision-making.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{showPrivateFeedback ? "Collapse" : "Expand Insights"}</span>
                  {showPrivateFeedback ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {showPrivateFeedback && (
                <div className="p-5 border-t border-slate-800 space-y-4 bg-slate-950/60 text-xs text-slate-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Tone Assessment */}
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Discussion Tone Observations
                      </span>
                      <p className="text-slate-200 leading-relaxed">
                        {findings.private_feedback.tone_observations || "Tone is balanced and professional."}
                      </p>
                    </div>

                    {/* Clarity Rating */}
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Problem Clarity Rating
                      </span>
                      <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">
                        {findings.private_feedback.clarity_rating || "Medium"}
                      </span>
                    </div>
                  </div>

                  {/* Potential Cognitive Biases */}
                  {findings.private_feedback.potential_biases &&
                    findings.private_feedback.potential_biases.length > 0 && (
                      <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                          Detected Cognitive Biases & Blind Spots
                        </span>
                        <ul className="space-y-1.5">
                          {findings.private_feedback.potential_biases.map((bias, i) => (
                            <li key={i} className="flex items-start gap-2 text-slate-300">
                              <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                              <span>{bias}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Coaching Notes */}
                  {findings.private_feedback.feedback_notes && (
                    <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-900/50 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">
                        Actionable Guidance for Next Phases
                      </span>
                      <p className="text-slate-200 leading-relaxed">
                        {findings.private_feedback.feedback_notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Footer: Approve & Save Findings */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleSaveAndApprove(false)}
              disabled={isSaving}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Save Draft (Keep Unreviewed)
            </button>

            <button
              type="button"
              onClick={() => handleSaveAndApprove(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSaving
                ? "Saving & Approving..."
                : reviewed
                ? "Update Approved Findings"
                : "Approve & Save Structured Findings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
