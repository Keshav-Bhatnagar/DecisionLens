"use client";

import React from "react";
import {
  FileText,
  Brain,
  Search,
  Grid,
  CheckCircle2,
  Compass,
  ArrowRight,
  ArrowLeft,
  Share2,
} from "lucide-react";

export type WorkflowStage =
  | "ingestion"
  | "structuring"
  | "gaps"
  | "frameworks"
  | "synthesis";

interface WorkflowStepperProps {
  currentStage: WorkflowStage;
  onSelectStage: (stage: WorkflowStage) => void;
  viewMode: "step" | "all";
  onToggleViewMode: () => void;
  onOpenExportModal: () => void;
  hasTranscript: boolean;
  isTranscriptReviewed: boolean;
  isPointsReviewed: boolean;
  hasGaps: boolean;
  hasFrameworks: boolean;
  hasSynthesis: boolean;
}

export default function WorkflowStepper({
  currentStage,
  onSelectStage,
  viewMode,
  onToggleViewMode,
  onOpenExportModal,
  hasTranscript,
  isTranscriptReviewed,
  isPointsReviewed,
  hasGaps,
  hasFrameworks,
  hasSynthesis,
}: WorkflowStepperProps) {
  const stages: {
    id: WorkflowStage;
    label: string;
    description: string;
    icon: React.ReactNode;
    isCompleted: boolean;
  }[] = [
    {
      id: "ingestion",
      label: "1. Ingestion & Audio",
      description: "Context, Docs & Voice",
      icon: <FileText className="w-4 h-4" />,
      isCompleted: isTranscriptReviewed || hasTranscript,
    },
    {
      id: "structuring",
      label: "2. Structuring & Review",
      description: "8 Cognitive Categories",
      icon: <Brain className="w-4 h-4" />,
      isCompleted: isPointsReviewed,
    },
    {
      id: "gaps",
      label: "3. Gaps & Research",
      description: "Ask Me & Web Citations",
      icon: <Search className="w-4 h-4" />,
      isCompleted: hasGaps,
    },
    {
      id: "frameworks",
      label: "4. Thinking Frameworks",
      description: "5 Cognitive Lenses & Matrix",
      icon: <Grid className="w-4 h-4" />,
      isCompleted: hasFrameworks,
    },
    {
      id: "synthesis",
      label: "5. Synthesis & Roadmap",
      description: "Executive Recommendation",
      icon: <Compass className="w-4 h-4" />,
      isCompleted: hasSynthesis,
    },
  ];

  const currentIdx = stages.findIndex((s) => s.id === currentStage);

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Decision Intelligence Workflow Progress
          </span>
          <span className="text-xs text-slate-400 font-medium">
            (Stage {currentIdx + 1} of 5)
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleViewMode}
            className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-medium transition shadow-sm"
          >
            {viewMode === "step" ? "View Full Overview" : "Guided Step-by-Step Mode"}
          </button>

          <button
            type="button"
            onClick={onOpenExportModal}
            className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-semibold transition shadow-sm hover:shadow"
          >
            <Share2 className="w-3.5 h-3.5" />
            Export Brief
          </button>
        </div>
      </div>

      {/* Stepper Steps Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {stages.map((stage, idx) => {
          const isActive = currentStage === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelectStage(stage.id)}
              className={`text-left p-3 rounded-2xl border transition relative overflow-hidden flex flex-col justify-between ${
                isActive
                  ? "bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20 shadow-sm"
                  : stage.isCompleted
                  ? "bg-slate-50/80 border-emerald-200/90 hover:bg-slate-100/70"
                  : "bg-white border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`p-1.5 rounded-lg ${
                    isActive
                      ? "bg-indigo-600 text-white"
                      : stage.isCompleted
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {stage.icon}
                </span>

                {stage.isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <span className="font-mono text-[10px] text-slate-400 font-bold">
                    0{idx + 1}
                  </span>
                )}
              </div>

              <div>
                <h4
                  className={`text-xs font-bold truncate ${
                    isActive
                      ? "text-indigo-950 font-black"
                      : "text-slate-800"
                  }`}
                >
                  {stage.label}
                </h4>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                  {stage.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Step Mode Navigation Buttons */}
      {viewMode === "step" && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => onSelectStage(stages[currentIdx - 1].id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Previous Stage
          </button>

          <span className="text-slate-400 font-medium">
            Step {currentIdx + 1} of {stages.length}: {stages[currentIdx].label}
          </span>

          <button
            type="button"
            disabled={currentIdx === stages.length - 1}
            onClick={() => onSelectStage(stages[currentIdx + 1].id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Next Stage
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
