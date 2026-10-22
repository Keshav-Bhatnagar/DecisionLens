"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Brain,
  HelpCircle,
  GitBranch,
  Table as TableIcon,
  Compass,
  ArrowRight,
  ShieldAlert,
  Sliders,
  Check,
  ChevronRight,
} from "lucide-react";
import {
  FrameworkAnalysisResponse,
  evaluateFrameworks,
  getFrameworkAnalysis,
  evaluateMatrixScores,
  MatrixCriterion,
  MatrixOption,
  MatrixScoreItem,
} from "@/lib/api";

interface FrameworkPanelProps {
  decisionId: number;
  initialAnalysis?: any;
  onAnalysisUpdated?: () => void;
}

export default function FrameworkPanel({
  decisionId,
  initialAnalysis,
  onAnalysisUpdated,
}: FrameworkPanelProps) {
  const [analysis, setAnalysis] = useState<FrameworkAnalysisResponse | null>(
    initialAnalysis || null
  );
  const [loading, setLoading] = useState(false);
  const [evaluatingMatrix, setEvaluatingMatrix] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "six_hats" | "swot" | "decision_matrix" | "five_whys" | "decision_tree"
  >("six_hats");

  // Selection filters
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([
    "six_hats",
    "swot",
    "decision_matrix",
    "five_whys",
    "decision_tree",
  ]);

  // Matrix interactive state
  const [matrixCriteria, setMatrixCriteria] = useState<MatrixCriterion[]>([]);
  const [matrixOptions, setMatrixOptions] = useState<MatrixOption[]>([]);
  const [matrixRatings, setMatrixRatings] = useState<MatrixScoreItem[]>([]);
  const [matrixResults, setMatrixResults] = useState<any[]>([]);
  const [matrixWinner, setMatrixWinner] = useState<string | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  // Sync initial analysis
  useEffect(() => {
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
      initMatrixState(initialAnalysis);
    } else {
      // Auto-load if existing
      getFrameworkAnalysis(decisionId, false)
        .then((data) => {
          setAnalysis(data);
          initMatrixState(data);
        })
        .catch(() => {
          // No analysis yet, clean state
        });
    }
  }, [initialAnalysis, decisionId]);

  const initMatrixState = (data: any) => {
    if (data?.decision_matrix?.applicable) {
      setMatrixCriteria(data.decision_matrix.criteria || []);
      setMatrixOptions(data.decision_matrix.options || []);
      setMatrixRatings(data.decision_matrix.ratings || []);
      setMatrixResults(data.decision_matrix.results || []);
      setMatrixWinner(data.decision_matrix.winner_option_name || null);
    }
  };

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await evaluateFrameworks(decisionId, {
        selected_frameworks: selectedFrameworks,
        force_mock: false,
      });
      setAnalysis(res);
      initMatrixState(res);
      if (onAnalysisUpdated) onAnalysisUpdated();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to execute framework analysis"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRatingChange = async (
    optId: string,
    critId: string,
    newRating: number
  ) => {
    const updated = matrixRatings.map((r) =>
      r.option_id === optId && r.criterion_id === critId
        ? { ...r, rating: newRating }
        : r
    );
    setMatrixRatings(updated);

    // Run deterministic calculation
    setEvaluatingMatrix(true);
    setMatrixError(null);
    try {
      const res = await evaluateMatrixScores(decisionId, {
        criteria: matrixCriteria,
        options: matrixOptions,
        ratings: updated,
        scale_min: 1.0,
        scale_max: 10.0,
      });
      setMatrixResults(res.results);
      setMatrixWinner(res.winner_option_name || null);
    } catch (err: unknown) {
      setMatrixError(
        err instanceof Error ? err.message : "Matrix calculation error"
      );
    } finally {
      setEvaluatingMatrix(false);
    }
  };

  const toggleFrameworkSelection = (fw: string) => {
    setSelectedFrameworks((prev) =>
      prev.includes(fw)
        ? prev.length > 1
          ? prev.filter((item) => item !== fw)
          : prev
        : [...prev, fw]
    );
  };

  const totalMatrixWeight = matrixCriteria.reduce((sum, c) => sum + c.weight, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Structured Thinking Frameworks
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/50">
                Phase 9
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Multi-perspective cognitive models with deterministic scoring & validated schemas.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRunAnalysis}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold shadow-xs hover:shadow transition-all shrink-0"
        >
          <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Evaluating Frameworks..." : analysis ? "Re-evaluate Frameworks" : "Run Framework Analysis"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Framework Selector Pills */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
          <span>Active Framework Selection:</span>
          <span className="text-slate-400 font-mono">
            {selectedFrameworks.length}/5 Selected
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "six_hats", label: "Six Thinking Hats" },
            { id: "swot", label: "SWOT Analysis" },
            { id: "decision_matrix", label: "Weighted Decision Matrix" },
            { id: "five_whys", label: "Five Whys" },
            { id: "decision_tree", label: "Decision Tree" },
          ].map((fw) => {
            const isSelected = selectedFrameworks.includes(fw.id);
            return (
              <button
                key={fw.id}
                type="button"
                onClick={() => toggleFrameworkSelection(fw.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
                {fw.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-2 text-xs font-semibold">
        {[
          { id: "six_hats", label: "Six Thinking Hats", icon: Brain },
          { id: "swot", label: "SWOT Analysis", icon: Compass },
          { id: "decision_matrix", label: "Decision Matrix", icon: TableIcon },
          { id: "five_whys", label: "Five Whys", icon: HelpCircle },
          { id: "decision_tree", label: "Decision Tree", icon: GitBranch },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const fwData = (analysis as any)?.[tab.id];
          const isApplicable = fwData ? fwData.applicable !== false : true;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
                isActive
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {fwData && !isApplicable && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold">
                  N/A
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty State when no analysis has been run yet */}
      {!analysis && !loading && (
        <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <Brain className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            No Framework Analysis Generated Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Click &ldquo;Run Framework Analysis&rdquo; above to evaluate your structured findings, facts, and research across Six Thinking Hats, SWOT, Weighted Decision Matrix, Five Whys, and Decision Tree.
          </p>
        </div>
      )}

      {/* Framework 1: Six Thinking Hats */}
      {analysis && activeTab === "six_hats" && (
        <div className="space-y-4">
          {!analysis.six_hats?.applicable ? (
            <InapplicableNotice reason={analysis.six_hats?.inapplicability_reason} />
          ) : (
            <>
              {analysis.six_hats.synthesis && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs text-indigo-950 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-900 block mb-0.5">
                      Six Hats Executive Synthesis:
                    </span>
                    <p className="leading-relaxed">{analysis.six_hats.synthesis}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(analysis.six_hats.hats || {}).map((hat) => (
                  <div
                    key={hat.hat}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-3 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-slate-300"
                          style={{ backgroundColor: hat.color }}
                        />
                        <h4 className="font-bold text-xs text-slate-900">{hat.name}</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-3 italic">
                        {hat.focus}
                      </p>
                      <ul className="space-y-1.5 text-xs text-slate-700">
                        {hat.points.map((pt, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 leading-snug">
                            <span className="text-slate-400 font-bold">•</span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {hat.key_takeaway && (
                      <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 font-medium">
                        <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                          Takeaway:
                        </span>
                        {hat.key_takeaway}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Framework 2: SWOT Analysis */}
      {analysis && activeTab === "swot" && (
        <div className="space-y-4">
          {!analysis.swot?.applicable ? (
            <InapplicableNotice reason={analysis.swot?.inapplicability_reason} />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" /> Strengths (Internal Advantages)
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {analysis.swot.strengths.map((item) => (
                      <li key={item.id} className="p-2.5 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                        <p className="text-slate-800 font-medium">{item.text}</p>
                        <span className="text-[10px] text-emerald-600 font-mono mt-1 block">
                          Impact: {item.impact.toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-rose-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-rose-600" /> Weaknesses (Internal Limitations)
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {analysis.swot.weaknesses.map((item) => (
                      <li key={item.id} className="p-2.5 bg-white rounded-lg border border-rose-100 shadow-2xs">
                        <p className="text-slate-800 font-medium">{item.text}</p>
                        <span className="text-[10px] text-rose-600 font-mono mt-1 block">
                          Impact: {item.impact.toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Opportunities */}
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-blue-600" /> Opportunities (External Tailwinds)
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {analysis.swot.opportunities.map((item) => (
                      <li key={item.id} className="p-2.5 bg-white rounded-lg border border-blue-100 shadow-2xs">
                        <p className="text-slate-800 font-medium">{item.text}</p>
                        <span className="text-[10px] text-blue-600 font-mono mt-1 block">
                          Impact: {item.impact.toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Threats */}
                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-amber-600" /> Threats (External Headwinds)
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {analysis.swot.threats.map((item) => (
                      <li key={item.id} className="p-2.5 bg-white rounded-lg border border-amber-100 shadow-2xs">
                        <p className="text-slate-800 font-medium">{item.text}</p>
                        <span className="text-[10px] text-amber-600 font-mono mt-1 block">
                          Impact: {item.impact.toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Strategic Implications */}
              {analysis.swot.strategic_implications?.length > 0 && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <h4 className="font-bold text-slate-800 text-xs">
                    Cross-Quadrant Strategic Implications (TOWS Matrix):
                  </h4>
                  <ul className="space-y-1.5 text-slate-700">
                    {analysis.swot.strategic_implications.map((imp, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Framework 3: Weighted Decision Matrix */}
      {analysis && activeTab === "decision_matrix" && (
        <div className="space-y-4">
          {!analysis.decision_matrix?.applicable ? (
            <InapplicableNotice reason={analysis.decision_matrix?.inapplicability_reason} />
          ) : (
            <>
              {/* Winner Banner */}
              {matrixWinner && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-900 text-sm block">
                        Top Ranked Option: {matrixWinner}
                      </span>
                      <p className="text-emerald-700 text-xs">
                        Calculated deterministically using exact criteria weights and scale ratings.
                      </p>
                    </div>
                  </div>
                  {matrixResults.length > 0 && (
                    <div className="text-right">
                      <span className="font-mono text-base font-extrabold text-emerald-700">
                        {matrixResults[0].weighted_score.toFixed(2)}/10
                      </span>
                      <span className="text-[10px] text-emerald-600 block">
                        {matrixResults[0].normalized_score}% Match
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Weight Sum Invariant Notification */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700">
                  Weight Constraint (Strict Invariant):
                </span>
                <span
                  className={`font-mono font-bold ${
                    Math.abs(totalMatrixWeight - 100.0) < 0.1
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  Sum: {totalMatrixWeight.toFixed(1)}% / 100.0%
                </span>
              </div>

              {matrixError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{matrixError}</span>
                </div>
              )}

              {/* Interactive Matrix Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3 font-bold">Criteria & Weight</th>
                      {matrixOptions.map((opt) => (
                        <th key={opt.id} className="p-3 font-bold text-center">
                          {opt.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matrixCriteria.map((crit) => (
                      <tr key={crit.id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 block">
                            {crit.name}
                          </span>
                          <span className="text-[10px] text-indigo-600 font-mono">
                            Weight: {crit.weight}%
                          </span>
                        </td>
                        {matrixOptions.map((opt) => {
                          const currentRating =
                            matrixRatings.find(
                              (r) =>
                                r.option_id === opt.id &&
                                r.criterion_id === crit.id
                            )?.rating || 5;

                          return (
                            <td key={opt.id} className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  type="range"
                                  min="1"
                                  max="10"
                                  step="0.5"
                                  value={currentRating}
                                  onChange={(e) =>
                                    handleRatingChange(
                                      opt.id,
                                      crit.id,
                                      parseFloat(e.target.value)
                                    )
                                  }
                                  className="w-20 accent-indigo-600 cursor-pointer"
                                />
                                <span className="font-mono font-bold text-xs w-6 text-slate-800">
                                  {currentRating}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {/* Calculated Scores Row */}
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                      <td className="p-3 text-slate-900">
                        Weighted Deterministic Score:
                      </td>
                      {matrixOptions.map((opt) => {
                        const res = matrixResults.find(
                          (r) => r.option_id === opt.id
                        );
                        return (
                          <td key={opt.id} className="p-3 text-center">
                            <span className="font-mono text-sm text-indigo-600 block">
                              {res ? res.weighted_score.toFixed(2) : "—"} / 10
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Rank #{res ? res.rank : "—"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Framework 4: Five Whys */}
      {analysis && activeTab === "five_whys" && (
        <div className="space-y-4">
          {!analysis.five_whys?.applicable ? (
            <InapplicableNotice reason={analysis.five_whys?.inapplicability_reason} />
          ) : (
            <>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <span className="font-bold text-slate-600 uppercase text-[10px] block mb-1">
                  Starting Problem Symptom:
                </span>
                <p className="font-semibold text-slate-900">
                  {analysis.five_whys.problem_statement}
                </p>
              </div>

              {/* Stepped Whys Chain */}
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-indigo-100">
                {analysis.five_whys.steps.map((step) => (
                  <div
                    key={step.step_number}
                    className="relative flex items-start gap-4 p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300"
                  >
                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 z-10">
                      {step.step_number}
                    </span>
                    <div className="flex-1 text-xs space-y-1">
                      <p className="font-bold text-slate-900">
                        {step.why_question}
                      </p>
                      <p className="text-slate-700 leading-relaxed">
                        {step.answer}
                      </p>
                      <div className="flex items-center gap-2 pt-1 text-[10px]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            step.is_known_fact
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {step.is_known_fact ? "Verified Fact" : "Diagnostic Hypothesis"}
                        </span>
                        {step.evidence_reference && (
                          <span className="text-slate-400">
                            Source: {step.evidence_reference}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Root Cause Card (Strict Invariant: Never invented) */}
              {analysis.five_whys.root_cause && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-900 uppercase text-[10px]">
                      Identified Root Cause:
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        analysis.five_whys.is_root_cause_verified
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {analysis.five_whys.is_root_cause_verified
                        ? "Empirically Verified"
                        : "Hypothesis (Needs Verification)"}
                    </span>
                  </div>
                  <p className="text-slate-900 font-semibold leading-relaxed">
                    {analysis.five_whys.root_cause}
                  </p>
                </div>
              )}

              {/* Countermeasures */}
              {analysis.five_whys.countermeasures?.length > 0 && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <h4 className="font-bold text-slate-800">
                    Actionable Preventative Countermeasures:
                  </h4>
                  <ul className="space-y-1 text-slate-700">
                    {analysis.five_whys.countermeasures.map((cm, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{cm}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Framework 5: Decision Tree */}
      {analysis && activeTab === "decision_tree" && (
        <div className="space-y-4">
          {!analysis.decision_tree?.applicable ? (
            <InapplicableNotice reason={analysis.decision_tree?.inapplicability_reason} />
          ) : (
            <>
              {/* Invariant Probabilities Banner */}
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-950 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-indigo-900 block mb-0.5">
                    Probability Integrity Policy:
                  </span>
                  <p className="leading-relaxed">
                    {analysis.decision_tree.probabilities_note}
                  </p>
                </div>
              </div>

              {/* Tree Visual Representation */}
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-4">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-indigo-600" />
                  <span>{analysis.decision_tree.root_question}</span>
                </div>

                <div className="space-y-3">
                  {analysis.decision_tree.nodes[0]?.branches.map((br) => (
                    <div
                      key={br.branch_id}
                      className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">
                          {br.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {br.outcome_description}
                        </span>
                      </div>

                      {br.sub_branches && br.sub_branches.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                          {br.sub_branches.map((sub) => (
                            <div
                              key={sub.branch_id}
                              className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                            >
                              <div className="flex items-center justify-between font-semibold text-slate-800 mb-1">
                                <span>{sub.label}</span>
                                <span className="font-mono text-[10px] text-indigo-600 font-bold">
                                  {typeof sub.payoff === "number" ? `${sub.payoff} ${sub.payoff_unit || ""}` : "Unstated"}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {sub.outcome_description}
                              </p>
                              <span className="text-[10px] text-slate-400 mt-1 block">
                                Probability:{" "}
                                {typeof sub.probability === "number"
                                  ? `${(sub.probability * 100).toFixed(0)}%`
                                  : "Unspecified (not fabricated)"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InapplicableNotice({ reason }: { reason?: string | null }) {
  return (
    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
      <div className="flex items-center gap-2 font-bold text-amber-800">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>Framework Marked Not Applicable</span>
      </div>
      <p className="text-amber-800/90 leading-relaxed pl-6">
        {reason || "This thinking framework was determined not applicable for the current decision context."}
      </p>
    </div>
  );
}
