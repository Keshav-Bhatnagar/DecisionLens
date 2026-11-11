"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Brain,
  HelpCircle,
  GitBranch,
  Table as TableIcon,
  Compass,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
  Zap,
  RotateCw,
  Scale,
  Award,
  Flame,
  Plus,
  Trash2,
} from "lucide-react";
import {
  FrameworkAnalysisResponse,
  evaluateFrameworks,
  getFrameworkAnalysis,
  evaluateMatrixScores,
  MatrixCriterion,
  MatrixOption,
  MatrixScoreItem,
  RecommendedTechnique,
} from "@/lib/api";
import { DecisionLensIcon } from "@/components/DecisionLensLogo";

type FrameworkKey =
  | "decision_matrix"
  | "six_hats"
  | "swot"
  | "five_whys"
  | "decision_tree";

const FRAMEWORK_DEFINITIONS = [
  {
    id: "decision_matrix" as FrameworkKey,
    label: "Weighted Decision Matrix",
    shortLabel: "Decision Matrix",
    icon: TableIcon,
    purpose: "Mathematical criteria weighting comparing quantitative scores across all options.",
  },
  {
    id: "six_hats" as FrameworkKey,
    label: "Six Thinking Hats",
    shortLabel: "Six Hats",
    icon: Brain,
    purpose: "Adversarial multi-perspective scrutiny evaluating emotional, creative, and critical risks.",
  },
  {
    id: "swot" as FrameworkKey,
    label: "SWOT Analysis",
    shortLabel: "SWOT",
    icon: Compass,
    purpose: "Mapping internal organizational capabilities against external market forces.",
  },
  {
    id: "five_whys" as FrameworkKey,
    label: "Five Whys (Root Cause)",
    shortLabel: "Five Whys",
    icon: HelpCircle,
    purpose: "Stepped causal interrogation isolating the root operational dependencies.",
  },
  {
    id: "decision_tree" as FrameworkKey,
    label: "Decision Tree",
    shortLabel: "Decision Tree",
    icon: GitBranch,
    purpose: "Sequential branching choices modeling downside payoffs and irreversible forks.",
  },
];

interface FrameworkPanelProps {
  decisionId: number;
  initialAnalysis?: any;
  onAnalysisUpdated?: () => void;
  onAdvanceToNextStage?: () => void;
}

const hasExecutedAnalysis = (data: any): boolean => {
  return Boolean(
    data &&
    typeof data === "object" &&
    Array.isArray(data.selected_frameworks) &&
    data.selected_frameworks.length > 0
  );
};

export default function FrameworkPanel({
  decisionId,
  initialAnalysis,
  onAnalysisUpdated,
  onAdvanceToNextStage,
}: FrameworkPanelProps) {
  const [analysis, setAnalysis] = useState<FrameworkAnalysisResponse | null>(
    hasExecutedAnalysis(initialAnalysis) ? initialAnalysis : null
  );
  const [loading, setLoading] = useState(false);
  const [evaluatingMatrix, setEvaluatingMatrix] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deep-dive inspection toggle (collapsed by default to prevent cognitive overload)
  const [showUnderlyingModels, setShowUnderlyingModels] = useState(false);
  const [activeAuditTab, setActiveAuditTab] = useState<FrameworkKey>("decision_matrix");
  const [showSensitivitySliders, setShowSensitivitySliders] = useState(false);

  // Matrix interactive state
  const [matrixCriteria, setMatrixCriteria] = useState<MatrixCriterion[]>([]);
  const [matrixOptions, setMatrixOptions] = useState<MatrixOption[]>([]);
  const [matrixRatings, setMatrixRatings] = useState<MatrixScoreItem[]>([]);
  const [matrixResults, setMatrixResults] = useState<any[]>([]);
  const [matrixWinner, setMatrixWinner] = useState<string | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  // Sync initial analysis
  useEffect(() => {
    if (hasExecutedAnalysis(initialAnalysis)) {
      setAnalysis(initialAnalysis);
      initMatrixState(initialAnalysis);
    } else {
      getFrameworkAnalysis(decisionId, false)
        .then((data) => {
          if (hasExecutedAnalysis(data)) {
            setAnalysis(data);
            initMatrixState(data);
          } else {
            setAnalysis(null);
          }
        })
        .catch(() => {
          setAnalysis(null);
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
        selected_frameworks: [
          "decision_matrix",
          "six_hats",
          "swot",
          "five_whys",
          "decision_tree",
        ],
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

  const recalculateMatrix = async (
    criteriaToUse: MatrixCriterion[],
    ratingsToUse: MatrixScoreItem[]
  ) => {
    setEvaluatingMatrix(true);
    setMatrixError(null);
    try {
      const res = await evaluateMatrixScores(decisionId, {
        criteria: criteriaToUse,
        options: matrixOptions,
        ratings: ratingsToUse,
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

  const handleRatingChange = async (
    optId: string,
    critId: string,
    newRating: number
  ) => {
    const updatedRatings = matrixRatings.map((r) =>
      r.option_id === optId && r.criterion_id === critId
        ? { ...r, rating: newRating }
        : r
    );
    if (
      !updatedRatings.some(
        (r) => r.option_id === optId && r.criterion_id === critId
      )
    ) {
      updatedRatings.push({
        option_id: optId,
        criterion_id: critId,
        rating: newRating,
        notes: "Interactive user adjustment",
      });
    }
    setMatrixRatings(updatedRatings);
    await recalculateMatrix(matrixCriteria, updatedRatings);
  };

  const handleWeightChange = async (critId: string, newWeight: number) => {
    const updatedCriteria = matrixCriteria.map((c) =>
      c.id === critId ? { ...c, weight: newWeight } : c
    );
    setMatrixCriteria(updatedCriteria);
    await recalculateMatrix(updatedCriteria, matrixRatings);
  };

  const handleAddCriterion = async () => {
    const customIdx = matrixCriteria.length + 1;
    const newId = `crit_custom_${Date.now()}`;
    const newCrit: MatrixCriterion = {
      id: newId,
      name: `Strategic Criterion ${customIdx}`,
      weight: 10.0,
      description: "Custom user-defined evaluation criterion",
    };
    const updatedCriteria = [...matrixCriteria, newCrit];
    const equalWeight = parseFloat((100.0 / updatedCriteria.length).toFixed(1));
    const balanced = updatedCriteria.map((c, idx) => ({
      ...c,
      weight:
        idx === updatedCriteria.length - 1
          ? parseFloat((100.0 - equalWeight * (updatedCriteria.length - 1)).toFixed(1))
          : equalWeight,
    }));
    setMatrixCriteria(balanced);

    const newRatings: MatrixScoreItem[] = [...matrixRatings];
    for (const opt of matrixOptions) {
      if (!newRatings.some((r) => r.option_id === opt.id && r.criterion_id === newId)) {
        newRatings.push({
          option_id: opt.id,
          criterion_id: newId,
          rating: 7.0,
          notes: "Initial baseline score for custom criterion",
        });
      }
    }
    setMatrixRatings(newRatings);
    await recalculateMatrix(balanced, newRatings);
  };

  const handleRemoveCriterion = async (critId: string) => {
    if (matrixCriteria.length <= 2) {
      alert("A minimum of 2 evaluation criteria is required for trade-off evaluation.");
      return;
    }
    const filtered = matrixCriteria.filter((c) => c.id !== critId);
    const equalWeight = parseFloat((100.0 / filtered.length).toFixed(1));
    const balanced = filtered.map((c, idx) => ({
      ...c,
      weight:
        idx === filtered.length - 1
          ? parseFloat((100.0 - equalWeight * (filtered.length - 1)).toFixed(1))
          : equalWeight,
    }));
    const filteredRatings = matrixRatings.filter((r) => r.criterion_id !== critId);
    setMatrixCriteria(balanced);
    setMatrixRatings(filteredRatings);
    await recalculateMatrix(balanced, filteredRatings);
  };

  const handleRenameCriterion = async (critId: string, newName: string) => {
    const updatedCriteria = matrixCriteria.map((c) =>
      c.id === critId ? { ...c, name: newName } : c
    );
    setMatrixCriteria(updatedCriteria);
    await recalculateMatrix(updatedCriteria, matrixRatings);
  };

  const handleAutoBalanceWeights = async () => {
    if (matrixCriteria.length === 0) return;
    const currentSum = matrixCriteria.reduce((sum, c) => sum + (c.weight || 0), 0);
    if (currentSum === 0) {
      const equalWeight = parseFloat((100.0 / matrixCriteria.length).toFixed(1));
      const balanced = matrixCriteria.map((c, idx) => ({
        ...c,
        weight: idx === 0 ? 100.0 - equalWeight * (matrixCriteria.length - 1) : equalWeight,
      }));
      setMatrixCriteria(balanced);
      await recalculateMatrix(balanced, matrixRatings);
      return;
    }
    const factor = 100.0 / currentSum;
    let runningSum = 0;
    const balanced = matrixCriteria.map((c, idx) => {
      if (idx === matrixCriteria.length - 1) {
        const remaining = parseFloat((100.0 - runningSum).toFixed(1));
        return { ...c, weight: Math.max(0, remaining) };
      }
      const newW = parseFloat((c.weight * factor).toFixed(1));
      runningSum += newW;
      return { ...c, weight: newW };
    });
    setMatrixCriteria(balanced);
    await recalculateMatrix(balanced, matrixRatings);
  };

  const totalMatrixWeight = matrixCriteria.reduce((sum, c) => sum + c.weight, 0);

  // Canonical Winner details - ZERO HARDCODING DIRECTIVE
  const canonicalWinner = useMemo(() => {
    if (!hasExecutedAnalysis(analysis)) return null;

    const name =
      analysis?.canonical_result?.winner_option_name ||
      matrixWinner ||
      matrixResults[0]?.option_name;

    // Strict validation: if no dynamic option name is derived, return null
    if (!name || typeof name !== "string" || name.trim() === "") return null;

    const rawScore =
      analysis?.canonical_result?.winner_score ??
      matrixResults[0]?.weighted_score;

    // Strict validation: if no genuine score was computed, return null
    if (rawScore === undefined || rawScore === null || typeof rawScore !== "number" || isNaN(rawScore)) {
      return null;
    }

    const score = rawScore;
    const status = analysis?.canonical_result?.decision_status || "READY";
    const margin =
      analysis?.canonical_result?.margin_over_runner_up ??
      (matrixResults.length > 1 &&
      matrixResults[0]?.weighted_score !== undefined &&
      matrixResults[1]?.weighted_score !== undefined
        ? matrixResults[0].weighted_score - matrixResults[1].weighted_score
        : null);

    return {
      name,
      score,
      status,
      margin,
    };
  }, [analysis, matrixWinner, matrixResults]);

  // Adversarial Friction point (What the Red Team genuinely flagged)
  const adversarialFriction = useMemo(() => {
    if (!hasExecutedAnalysis(analysis)) return null;
    return (
      analysis?.six_hats?.hats?.black?.key_takeaway ||
      analysis?.six_hats?.hats?.black?.points?.[0] ||
      analysis?.five_whys?.root_cause ||
      null
    );
  }, [analysis]);

  // Operational Condition Precedent (How to neutralize the trap)
  const operationalCondition = useMemo(() => {
    if (!hasExecutedAnalysis(analysis)) return null;
    if (
      analysis?.canonical_result?.conditions_precedent &&
      analysis.canonical_result.conditions_precedent.length > 0
    ) {
      return analysis.canonical_result.conditions_precedent[0];
    }
    if (
      analysis?.five_whys?.countermeasures &&
      analysis.five_whys.countermeasures.length > 0
    ) {
      return analysis.five_whys.countermeasures[0];
    }
    return null;
  }, [analysis]);

  return (
    <div className="bg-paper-surface rounded-2xl border border-border p-6 sm:p-8 shadow-xs space-y-7 text-ink font-sans">
      
      {/* 1. Executive Header & Astrolabe Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/80">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <DecisionLensIcon size={32} />
            <div>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-accent block leading-none">
                STAGE 04 / DECISION GAUNTLET & ENSEMBLE
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-ink tracking-tight mt-1">
                The Decision Gauntlet & Unified Verdict
              </h2>
            </div>
          </div>
          <p className="text-xs text-ink-secondary max-w-2xl font-light leading-relaxed">
            Multi-model crash tests evaluating your alternatives. The tension between quantitative criteria and adversarial red-teaming synthesized into one clear verdict.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunAnalysis}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-ink text-paper-surface hover:opacity-90 disabled:opacity-50 text-xs font-semibold rounded-xl shadow-xs transition shrink-0 cursor-pointer"
        >
          <Sparkles className={`w-3.5 h-3.5 text-accent ${loading ? "animate-spin" : ""}`} />
          {loading
            ? "Running Crash Tests..."
            : hasExecutedAnalysis(analysis)
            ? "Re-Run Gauntlet"
            : "Run Decision Gauntlet"}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-xl flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {analysis?.is_stale && (
        <div className="p-4 bg-amber-500/10 border border-amber-300 text-xs text-amber-950 rounded-xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Upstream problem inputs or gaps have changed. Re-run gauntlet to re-synchronize criteria and rankings.</span>
          </div>
          <button
            onClick={() => handleRunAnalysis()}
            disabled={loading}
            className="px-3.5 py-1.5 bg-ink text-paper-surface text-xs font-semibold rounded-lg hover:opacity-90 transition shrink-0"
          >
            Re-run Gauntlet
          </button>
        </div>
      )}

      {/* Empty State when no analysis has been run yet */}
      {!hasExecutedAnalysis(analysis) && !loading && (
        <div className="text-center py-14 px-4 rounded-2xl border border-dashed border-border bg-paper-sidebar space-y-3">
          <Scale className="w-10 h-10 text-accent/60 mx-auto" />
          <h3 className="text-base font-serif font-bold text-ink">
            No Decision Gauntlet Run Yet
          </h3>
          <p className="text-xs text-ink-secondary max-w-md mx-auto leading-relaxed">
            Click <strong>Run Decision Gauntlet</strong> to evaluate your options through multi-criteria decision matrix scoring and adversarial crash-tests.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleRunAnalysis}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-paper-surface hover:opacity-90 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              Run Decision Gauntlet Now
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* THE EXECUTIVE GAUNTLET VERDICT (The Single Source of Truth)              */}
      {/* ========================================================================= */}
      {hasExecutedAnalysis(analysis) && canonicalWinner && (
        <div className="rounded-2xl border border-border bg-paper-surface p-6 sm:p-7 space-y-6 shadow-sm">
          
          {/* Winner Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
            <div className="flex items-start gap-3.5">
              <span className="p-2.5 rounded-xl bg-paper-sidebar text-ink border border-border shrink-0 mt-0.5">
                <Award className="w-5 h-5 text-ink" />
              </span>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-secondary">
                    Dominant Recommendation
                  </span>
                  <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full border border-border bg-paper-sidebar text-ink">
                    {canonicalWinner.status === "READY" ? "Ready for Execution" : "Due Diligence Required"}
                  </span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-serif font-bold text-ink tracking-tight">
                  {canonicalWinner.name}
                </h3>
                <p className="text-sm text-ink-secondary leading-relaxed font-sans">
                  {analysis?.canonical_result?.decision_status === "CONDITIONAL"
                    ? `Option "${canonicalWinner.name}" emerged with the highest weighted score (${canonicalWinner.score.toFixed(2)} / 10), subject to critical pre-execution conditions.`
                    : `Option "${canonicalWinner.name}" emerged as the highest ranked alternative with a verified score of ${canonicalWinner.score.toFixed(2)} / 10.`}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right bg-paper-sidebar p-4 rounded-xl border border-border shrink-0">
              <span className="font-mono text-3xl font-extrabold text-ink block leading-none">
                {canonicalWinner.score.toFixed(2)}<span className="text-xs text-ink-secondary font-normal"> / 10</span>
              </span>
              <span className="text-xs font-mono text-ink-secondary font-medium uppercase tracking-wider mt-1.5 block">
                {canonicalWinner.margin !== null && canonicalWinner.margin > 0
                  ? `+${canonicalWinner.margin.toFixed(2)} pts over runner-up`
                  : "Rank #1 Choice"}
              </span>
            </div>
          </div>

          {/* The Tension & Resolution (Rendered only when real friction or condition exists) */}
          {(adversarialFriction || operationalCondition) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* The Adversarial Trap Caught */}
              <div className="p-4 sm:p-5 rounded-xl bg-paper-sidebar border border-border space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-ink uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4 text-ink-secondary shrink-0" />
                  <span>Primary Risk Identified:</span>
                </div>
                <p className="text-sm text-ink leading-relaxed font-sans">
                  {adversarialFriction || "No critical adversarial failure modes flagged by Red-Team."}
                </p>
                <div className="pt-2 border-t border-border/60 text-xs text-ink-secondary font-mono">
                  Flagged by: <strong>Adversarial Red-Team Analysis</strong>
                </div>
              </div>

              {/* The Clear Resolution & Protection */}
              <div className="p-4 sm:p-5 rounded-xl bg-paper-sidebar border border-border space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-ink uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-ink-secondary shrink-0" />
                  <span>Safe Execution Condition:</span>
                </div>
                <p className="text-sm text-ink leading-relaxed font-sans">
                  {operationalCondition || "Standard execution verified under current criteria constraints."}
                </p>
                <div className="pt-2 border-t border-border/60 text-xs text-ink-secondary font-mono">
                  Mandated in: <strong>Executive Decision Memo &amp; ADR</strong>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* CANDIDATE OPTIONS RANKING & SENSITIVITY TUNING                            */}
      {/* ========================================================================= */}
      {analysis && matrixResults.length > 0 && (
        <div className="p-5 sm:p-6 rounded-2xl bg-paper-surface border border-border space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/70">
            <div>
              <h4 className="text-sm font-serif font-bold text-ink">
                Candidate Options Comparative Leaderboard
              </h4>
              <p className="text-xs text-ink-secondary">
                Deterministic scores based on weighted business and technical criteria.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowSensitivitySliders(!showSensitivitySliders)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-ink bg-paper-sidebar border border-border hover:bg-paper-surface transition cursor-pointer self-start sm:self-auto"
            >
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>{showSensitivitySliders ? "Hide Weight Sliders" : "Tune Criteria Weights"}</span>
              {showSensitivitySliders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Options Leaderboard Rows */}
          <div className="space-y-2">
            {matrixResults.map((res, idx) => {
              const isWinner = idx === 0;
              return (
                <div
                  key={res.option_id}
                  className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition ${
                    isWinner
                      ? "bg-paper-surface border-border shadow-xs ring-1 ring-border"
                      : "bg-paper-sidebar border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                        isWinner
                          ? "bg-ink text-paper-surface"
                          : "bg-paper-surface text-ink-secondary border border-border"
                      }`}
                    >
                      {res.rank}
                    </span>
                    <div>
                      <span className="font-semibold text-ink text-sm block">
                        {res.option_name}
                      </span>
                      <span className="text-xs text-ink-secondary font-mono">
                        {isWinner ? "Dominant Choice across all criteria" : `Rank #${res.rank} Alternative`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="font-mono text-base font-extrabold text-ink block">
                        {res.weighted_score.toFixed(2)} / 10
                      </span>
                      <span className="text-xs text-ink-secondary font-mono">
                        Weighted Score
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sensitivity Sliders Drawer */}
          {showSensitivitySliders && (
            <div className="pt-4 border-t border-border space-y-4 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-ink uppercase tracking-wider">
                  Interactive Sensitivity Sliders (Zero-Sum Budget):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddCriterion}
                    className="px-3 py-1 bg-paper-surface hover:bg-paper-sidebar border border-border rounded-lg text-xs font-semibold text-ink transition inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                    title="Add new evaluation criterion"
                  >
                    <Plus className="w-3 h-3 text-emerald-600" />
                    <span>Add Criterion</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoBalanceWeights}
                    className="px-3 py-1 bg-paper-surface hover:bg-paper-sidebar border border-border rounded-lg text-xs font-semibold text-ink transition inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Zap className="w-3 h-3 text-accent" />
                    <span>Auto-Balance 100%</span>
                  </button>
                  <span
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                      Math.abs(totalMatrixWeight - 100.0) < 0.1
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                        : "bg-rose-50 text-rose-800 border border-rose-300"
                    }`}
                  >
                    {totalMatrixWeight.toFixed(1)}% / 100%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {matrixCriteria.map((crit) => (
                  <div
                    key={crit.id}
                    className="p-3 rounded-xl bg-paper-sidebar border border-border space-y-2 text-xs group relative"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={crit.name}
                        onChange={(e) => handleRenameCriterion(crit.id, e.target.value)}
                        className="font-semibold text-ink bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-0.5 py-0 text-xs w-full transition"
                        title="Click to rename criterion"
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-accent font-bold">{crit.weight}%</span>
                        {matrixCriteria.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCriterion(crit.id)}
                            className="text-muted hover:text-rose-600 p-0.5 rounded transition cursor-pointer"
                            title="Delete criterion"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={crit.weight}
                      onChange={(e) =>
                        handleWeightChange(crit.id, parseFloat(e.target.value) || 0)
                      }
                      className="w-full accent-accent cursor-pointer h-1.5"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* UNDERLYING MATHEMATICAL MODELS & RAW DIAGRAMS (Optional Deep-Dive)        */}
      {/* ========================================================================= */}
      {analysis && (
        <div className="rounded-2xl border border-border bg-paper-sidebar p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowUnderlyingModels(!showUnderlyingModels)}
              className="flex items-center gap-2 text-left text-xs font-mono font-bold text-ink hover:text-accent transition cursor-pointer"
            >
              <span>{showUnderlyingModels ? "▼" : "▶"}</span>
              <span>Inspect Underlying Models &amp; Raw Crash Tests (Optional Audit Deep-Dive)</span>
            </button>
            <span className="text-xs font-mono text-ink-secondary">
              5 Background Models Evaluated
            </span>
          </div>

          {showUnderlyingModels && (
            <div className="pt-3 border-t border-border space-y-4 animate-in fade-in">
              {/* Tab Selector */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs">
                {FRAMEWORK_DEFINITIONS.map((def) => {
                  const Icon = def.icon;
                  const isActive = activeAuditTab === def.id;
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setActiveAuditTab(def.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition text-xs whitespace-nowrap cursor-pointer ${
                        isActive
                          ? "bg-ink text-paper-surface shadow-xs"
                          : "bg-paper-surface text-ink-secondary hover:text-ink border border-border"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{def.shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Six Hats */}
              {activeAuditTab === "six_hats" && analysis.six_hats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.values(analysis.six_hats.hats || {}).map((hat) => (
                    <div
                      key={hat.hat}
                      className="p-4 rounded-xl border border-border bg-paper-surface space-y-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full border border-border"
                          style={{ backgroundColor: hat.color }}
                        />
                        <h5 className="font-serif font-bold text-ink">{hat.name}</h5>
                      </div>
                      <p className="text-[11px] text-ink-secondary italic">{hat.focus}</p>
                      <ul className="space-y-1 text-ink">
                        {hat.points.map((pt, i) => (
                          <li key={i} className="flex items-start gap-1 leading-snug">
                            <span className="text-accent font-bold">•</span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* SWOT */}
              {activeAuditTab === "swot" && analysis.swot && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-4 bg-paper-surface rounded-xl border border-border space-y-2">
                    <span className="font-mono font-bold text-emerald-900 block uppercase text-[10px]">Strengths</span>
                    <ul className="space-y-1 text-ink">
                      {analysis.swot.strengths.map((s) => (
                        <li key={s.id}>• {s.text}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 bg-paper-surface rounded-xl border border-border space-y-2">
                    <span className="font-mono font-bold text-rose-900 block uppercase text-[10px]">Weaknesses</span>
                    <ul className="space-y-1 text-ink">
                      {analysis.swot.weaknesses.map((w) => (
                        <li key={w.id}>• {w.text}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 bg-paper-surface rounded-xl border border-border space-y-2">
                    <span className="font-mono font-bold text-sky-900 block uppercase text-[10px]">Opportunities</span>
                    <ul className="space-y-1 text-ink">
                      {analysis.swot.opportunities.map((o) => (
                        <li key={o.id}>• {o.text}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 bg-paper-surface rounded-xl border border-border space-y-2">
                    <span className="font-mono font-bold text-amber-900 block uppercase text-[10px]">Threats</span>
                    <ul className="space-y-1 text-ink">
                      {analysis.swot.threats.map((t) => (
                        <li key={t.id}>• {t.text}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Five Whys */}
              {activeAuditTab === "five_whys" && analysis.five_whys && (
                <div className="space-y-2 text-xs">
                  {analysis.five_whys.steps.map((step) => (
                    <div key={step.step_number} className="p-3 bg-paper-surface rounded-lg border border-border flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-ink text-paper-surface font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                        {step.step_number}
                      </span>
                      <div>
                        <p className="font-semibold text-ink">{step.why_question}</p>
                        <p className="text-ink-secondary">{step.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Decision Tree */}
              {activeAuditTab === "decision_tree" && analysis.decision_tree && (
                <div className="p-4 bg-paper-surface rounded-xl border border-border space-y-2 text-xs">
                  <span className="font-mono font-bold text-ink block">{analysis.decision_tree.root_question}</span>
                  <p className="text-ink-secondary text-[11px]">{analysis.decision_tree.probabilities_note}</p>
                </div>
              )}

              {/* Decision Matrix raw table */}
              {activeAuditTab === "decision_matrix" && (
                <div className="p-4 bg-paper-surface rounded-xl border border-border text-xs">
                  <span className="font-mono font-bold text-ink block mb-2">Raw Deterministic Ratings Matrix:</span>
                  <p className="text-ink-secondary">
                    All option ratings and criteria weights are audited and synchronized with Step 1 and Step 3 evidence.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. Stage 5 Readiness & Advance Gate (Bottom Action Banner)                */}
      {/* ========================================================================= */}
      {hasExecutedAnalysis(analysis) && canonicalWinner && (
        <div className="pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-mono text-ink">
              <CheckCircle2 className="w-4 h-4 text-ink-secondary shrink-0" />
              <span>
                <strong>Evaluation Complete.</strong> Strategic choice synthesized with empirical validation.
              </span>
            </div>
            <p className="text-xs text-ink-secondary pl-6">
              Option &quot;{canonicalWinner.name}&quot; ({canonicalWinner.score.toFixed(2)}/10) is ready for executive decision memo formulation.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {onAdvanceToNextStage && (
              <button
                type="button"
                onClick={onAdvanceToNextStage}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-ink text-paper-surface hover:opacity-90 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <span>Advance to Decision Synthesis &amp; ADR</span>
                <ArrowRight className="w-3.5 h-3.5 text-accent" />
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
