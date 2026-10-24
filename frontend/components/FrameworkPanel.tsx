"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  ChevronDown,
  Info,
  ExternalLink,
  Zap,
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

type FrameworkKey =
  | "decision_matrix"
  | "five_whys"
  | "swot"
  | "six_hats"
  | "decision_tree";

const FRAMEWORK_DEFINITIONS = [
  {
    id: "decision_matrix" as FrameworkKey,
    label: "Weighted Decision Matrix",
    shortLabel: "Decision Matrix",
    icon: TableIcon,
    purpose: "Evaluate 2+ discrete options across weighted criteria mathematically.",
    badgeReason: "Multi-option comparison detected; criteria weighting active.",
  },
  {
    id: "five_whys" as FrameworkKey,
    label: "Five Whys (Root Cause)",
    shortLabel: "Five Whys",
    icon: HelpCircle,
    purpose: "Peel back surface symptoms to isolate the fundamental operational breakdown.",
    badgeReason: "Operational bottleneck or degradation detected in context.",
  },
  {
    id: "swot" as FrameworkKey,
    label: "SWOT Analysis",
    shortLabel: "SWOT",
    icon: Compass,
    purpose: "Map internal capabilities (strengths/weaknesses) against external forces (opportunities/threats).",
    badgeReason: "Strategic positioning and architectural balance evaluation.",
  },
  {
    id: "six_hats" as FrameworkKey,
    label: "Six Thinking Hats",
    shortLabel: "Six Hats",
    icon: Brain,
    purpose: "Examine the choice through 6 distinct cognitive perspectives simultaneously.",
    badgeReason: "Multi-perspective cognitive scrutiny against emotional bias.",
  },
  {
    id: "decision_tree" as FrameworkKey,
    label: "Decision Tree",
    shortLabel: "Decision Tree",
    icon: GitBranch,
    purpose: "Model sequential branching choices and assess risks against conditional payoff outcomes.",
    badgeReason: "Sequential chance and conditional payoff branching.",
  },
];

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
  const [activeTab, setActiveTab] = useState<FrameworkKey>("decision_matrix");
  const [showInapplicableDrawer, setShowInapplicableDrawer] = useState(false);
  const [showConfigSelector, setShowConfigSelector] = useState(false);
  const [manuallyEnabledFrameworks, setManuallyEnabledFrameworks] = useState<string[]>([]);

  // Selection filters for manual configuration
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

  // Recommended techniques ensemble from intelligent reasoning engine
  const recommendedTechniques = useMemo(() => {
    return analysis?.recommended_techniques || [];
  }, [analysis]);

  const recommendedMap = useMemo(() => {
    const map = new Map<string, RecommendedTechnique>();
    for (const rec of recommendedTechniques) {
      map.set(rec.framework_id, rec);
    }
    return map;
  }, [recommendedTechniques]);

  // Audit framework applicability
  const frameworkStatuses = useMemo(() => {
    if (!analysis) return [];
    return FRAMEWORK_DEFINITIONS.map((def) => {
      const fwData = (analysis as any)?.[def.id];
      const isApplicable = fwData ? fwData.applicable !== false : true;
      const inapplicabilityReason = fwData?.inapplicability_reason || null;
      return {
        ...def,
        data: fwData,
        isApplicable,
        inapplicabilityReason,
      };
    });
  }, [analysis]);

  const validFrameworks = useMemo(() => {
    return frameworkStatuses.filter((fw) => fw.isApplicable && fw.data);
  }, [frameworkStatuses]);

  // Show ONLY the recommended N techniques (sorted by priority) + any manually enabled
  const activeTabsList = useMemo(() => {
    if (!analysis) return FRAMEWORK_DEFINITIONS;
    if (recommendedTechniques.length > 0) {
      const activeIds = new Set(recommendedTechniques.map((t) => t.framework_id));
      manuallyEnabledFrameworks.forEach((id) => activeIds.add(id));

      const filtered = FRAMEWORK_DEFINITIONS.filter((def) => activeIds.has(def.id));
      return filtered.sort((a, b) => {
        const prioA = recommendedMap.get(a.id)?.priority ?? 99;
        const prioB = recommendedMap.get(b.id)?.priority ?? 99;
        return prioA - prioB;
      });
    }
    // Fallback if no recommended_techniques: show validFrameworks
    return validFrameworks.length > 0 ? validFrameworks : FRAMEWORK_DEFINITIONS;
  }, [analysis, recommendedTechniques, manuallyEnabledFrameworks, recommendedMap, validFrameworks]);

  // Ruled-out / excluded frameworks with validation reasons
  const excludedFrameworksList = useMemo(() => {
    if (!analysis) return [];
    const activeIds = new Set(activeTabsList.map((f) => f.id));
    return FRAMEWORK_DEFINITIONS.filter((def) => !activeIds.has(def.id)).map((def) => {
      const fwData = (analysis as any)?.[def.id];
      const reason =
        fwData?.inapplicability_reason ||
        def.badgeReason ||
        "Ruled out as non-essential for this specific decision structure.";
      return {
        ...def,
        reason,
      };
    });
  }, [analysis, activeTabsList]);

  // Determine top recommended framework
  const recommendedFramework = useMemo(() => {
    if (!analysis) return null;
    if (analysis.recommended_framework) return analysis.recommended_framework as FrameworkKey;
    if (recommendedTechniques.length > 0) return recommendedTechniques[0].framework_id as FrameworkKey;
    return (activeTabsList[0]?.id as FrameworkKey) || null;
  }, [analysis, recommendedTechniques, activeTabsList]);

  // Automatically select the best valid framework when data updates
  useEffect(() => {
    if (activeTabsList.length > 0) {
      const currentIsValid = activeTabsList.some((fw) => fw.id === activeTab);
      if (!currentIsValid && recommendedFramework) {
        setActiveTab(recommendedFramework);
      }
    }
  }, [activeTabsList, recommendedFramework, activeTab]);

  return (
    <div className="glass-panel rounded-2xl specular-edge p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
            <Brain className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Strategic Thinking Frameworks
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Targeted cognitive models selected to evaluate options and stress-test trade-offs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowConfigSelector((prev) => !prev)}
            className="px-3 py-2 text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl transition"
            title="Configure available frameworks"
          >
            <Sliders className="w-3.5 h-3.5 inline mr-1 text-slate-500" />
            Config
          </button>

          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading
              ? "Evaluating Frameworks..."
              : analysis
              ? "Re-evaluate Frameworks"
              : "Run Framework Analysis"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {analysis?.is_stale && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 text-xs text-amber-900 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Upstream problem inputs or gaps have changed. Re-run analysis to synchronize criteria and scores.</span>
          </div>
          <button
            onClick={() => handleRunAnalysis()}
            disabled={loading}
            className="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition"
          >
            Re-run Analysis
          </button>
        </div>
      )}

      {/* Manual Framework Selector Drawer */}
      {showConfigSelector && (
        <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl text-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
            <span>Filter Active Evaluation Frameworks:</span>
            <span>{selectedFrameworks.length}/5 Active</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FRAMEWORK_DEFINITIONS.map((fw) => {
              const isSelected = selectedFrameworks.includes(fw.id);
              return (
                <button
                  key={fw.id}
                  type="button"
                  onClick={() => toggleFrameworkSelection(fw.id)}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  {fw.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Unified Clean Framework Tabs */}
      {analysis && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs">
            {activeTabsList.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const rec = recommendedMap.get(tab.id);
              const roleTag = rec ? rec.role_label : tab.id === recommendedFramework ? "Primary" : null;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as FrameworkKey)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition whitespace-nowrap text-xs ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.shortLabel}</span>
                  {roleTag && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                      }`}
                    >
                      {roleTag}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Subtle "+ Other Models" Drawer Toggle */}
            {excludedFrameworksList.length > 0 && (
              <button
                type="button"
                onClick={() => setShowInapplicableDrawer((prev) => !prev)}
                className="text-xs px-3 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl font-medium transition flex items-center gap-1.5 shrink-0"
              >
                <span>+ More ({excludedFrameworksList.length})</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    showInapplicableDrawer ? "rotate-180" : ""
                  }`}
                />
              </button>
            )}
          </div>

          {/* Active Model Rationale Banner */}
          {(() => {
            const activeRec = recommendedMap.get(activeTab);
            const activeDef = FRAMEWORK_DEFINITIONS.find((f) => f.id === activeTab);
            const reason = activeRec?.validation_reason || activeDef?.purpose;

            if (!reason) return null;

            return (
              <div className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-indigo-950">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    <strong>Why this model:</strong> {reason}
                  </span>
                </div>
                {activeRec?.role_label && (
                  <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    {activeRec.role_label}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Expandable Secondary Frameworks Drawer */}
          {showInapplicableDrawer && excludedFrameworksList.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                <span>Additional Frameworks (Not automatically prioritized for this problem):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {excludedFrameworksList.map((fw) => (
                  <div
                    key={fw.id}
                    className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <fw.icon className="w-3.5 h-3.5 text-slate-500" />
                        {fw.label}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        {fw.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setManuallyEnabledFrameworks((prev) =>
                          prev.includes(fw.id) ? prev : [...prev, fw.id]
                        );
                        setActiveTab(fw.id as FrameworkKey);
                        setShowInapplicableDrawer(false);
                      }}
                      className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 text-center transition"
                    >
                      + Enable {fw.shortLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State when no analysis has been run yet */}
      {!analysis && !loading && (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
            <Brain className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            No Thinking Frameworks Evaluated Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Click &ldquo;Run Framework Analysis&rdquo; above. DecisionLens will evaluate your decision context, identify the most applicable frameworks, and calculate deterministic scores.
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
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-900 text-sm">
                            Canonical Winner: {matrixWinner}
                          </span>
                          {analysis.canonical_result && (
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                analysis.canonical_result.decision_status === "READY"
                                  ? "bg-emerald-200 text-emerald-900"
                                  : "bg-amber-100 text-amber-800 border border-amber-300"
                              }`}
                            >
                              {analysis.canonical_result.decision_status}
                            </span>
                          )}
                        </div>
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
                          Rank #1 (Canonical)
                        </span>
                      </div>
                    )}
                  </div>
                  {analysis.canonical_result?.conditions_precedent &&
                    analysis.canonical_result.conditions_precedent.length > 0 && (
                      <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-900">
                        <span className="font-bold uppercase tracking-wider text-[10px] text-amber-900 block mb-1">
                          Conditions Precedent for Winner Execution:
                        </span>
                        <ul className="space-y-0.5">
                          {analysis.canonical_result.conditions_precedent.map((cond, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Zap className="w-3 h-3 text-amber-700 shrink-0 mt-0.5" />
                              <span>{cond}</span>
                            </li>
                          ))}
                        </ul>
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
                          <div className="text-slate-900 font-bold">{opt.name}</div>
                          {opt.origin === "derived" && (
                            <span className="inline-block mt-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              HYBRID / DERIVED
                            </span>
                          )}
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
    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
      <div className="flex items-center gap-2 font-semibold text-[11px] text-amber-700 tracking-wide">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>Framework Ruled Out as Inapplicable</span>
      </div>
      <p className="text-slate-600 leading-relaxed pl-6 text-xs">
        {reason || "This thinking framework was determined not applicable for the current decision context."}
      </p>
    </div>
  );
}
