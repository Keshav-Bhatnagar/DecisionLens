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
  Mic,
  Users,
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
  recordType?: "decision" | "meeting" | string;
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
  recordType = "decision",
}: WorkflowStepperProps) {
  const isMeeting = recordType === "meeting";

  const stages: {
    id: WorkflowStage;
    label: string;
    description: string;
    icon: React.ReactNode;
    isCompleted: boolean;
  }[] = isMeeting
    ? [
        {
          id: "ingestion",
          label: "1. Audio & Notes",
          description: "Meeting Audio, Voice & Context",
          icon: <Mic className="w-4 h-4" />,
          isCompleted: isTranscriptReviewed || hasTranscript,
        },
        {
          id: "structuring",
          label: "2. Discussion Points",
          description: "Key Takeaways & Statements",
          icon: <Users className="w-4 h-4" />,
          isCompleted: isPointsReviewed,
        },
        {
          id: "gaps",
          label: "3. Action Items & Gaps",
          description: "Owners, Tasks & Missing Info",
          icon: <Search className="w-4 h-4" />,
          isCompleted: hasGaps,
        },
        {
          id: "frameworks",
          label: "4. Decisions & Alignment",
          description: "Agreed Points vs Disagreements",
          icon: <Grid className="w-4 h-4" />,
          isCompleted: hasFrameworks,
        },
        {
          id: "synthesis",
          label: "5. Meeting Minutes",
          description: "Executive Summary & Email",
          icon: <Compass className="w-4 h-4" />,
          isCompleted: hasSynthesis,
        },
      ]
    : [
        {
          id: "ingestion",
          label: "1. Input & Dilemma",
          description: "Problem, Audio & Documents",
          icon: <FileText className="w-4 h-4" />,
          isCompleted: isTranscriptReviewed || hasTranscript,
        },
        {
          id: "structuring",
          label: "2. Cognitive Structuring",
          description: "Facts, Assumptions & Biases",
          icon: <Brain className="w-4 h-4" />,
          isCompleted: isPointsReviewed,
        },
        {
          id: "gaps",
          label: "3. Information Gaps",
          description: "Key Questions & Evidence",
          icon: <Search className="w-4 h-4" />,
          isCompleted: hasGaps,
        },
        {
          id: "frameworks",
          label: "4. Thinking Frameworks",
          description: "Option Scoring & Stress-Testing",
          icon: <Grid className="w-4 h-4" />,
          isCompleted: hasFrameworks,
        },
        {
          id: "synthesis",
          label: "5. Decision Synthesis",
          description: "Recommendation & Roadmap",
          icon: <Compass className="w-4 h-4" />,
          isCompleted: hasSynthesis,
        },
      ];

  const currentIdx = stages.findIndex((s) => s.id === currentStage);
  const completedCount = stages.filter((s) => s.isCompleted).length;
  const progressPercent = Math.round(((currentIdx + 1) / stages.length) * 100);

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 specular-edge">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse ring-4 ring-indigo-50"></span>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Stage {currentIdx + 1} of 5: {stages[currentIdx]?.label.split(". ")[1]}
            </span>
            <span className="hidden sm:inline text-xs text-slate-400 font-medium ml-2">
              ({completedCount} of 5 stages ready)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleViewMode}
            className="text-xs px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-semibold transition shadow-2xs flex items-center gap-1.5"
            title="Toggle between Step-by-Step view and Full Overview"
          >
            {viewMode === "step" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span className="font-semibold text-indigo-900">Step-by-Step</span>
                <span className="text-slate-400 font-normal">/ All</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="font-semibold text-slate-900">All Steps</span>
                <span className="text-indigo-600 font-normal">/ Switch to Step</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenExportModal}
            className={`inline-flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-xl font-semibold transition shadow-sm hover:shadow text-white ${
              isMeeting
                ? "bg-gradient-to-r from-teal-700 to-emerald-600 hover:from-teal-600 hover:to-emerald-500"
                : "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{isMeeting ? "Export Minutes" : "Export Brief"}</span>
          </button>
        </div>
      </div>

      {/* Progress Bar with smooth gradient */}
      <div className="w-full bg-slate-100/90 rounded-full h-2 overflow-hidden p-0.5">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out shadow-xs ${
            isMeeting
              ? "bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-600"
              : "bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
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
              className={`text-left p-3.5 rounded-2xl border transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                isActive
                  ? isMeeting
                    ? "bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500/20 shadow-sm -translate-y-0.5"
                    : "bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-500/20 shadow-sm -translate-y-0.5"
                  : stage.isCompleted
                  ? "bg-white/90 border-emerald-200/90 hover:bg-emerald-50/30 hover:border-emerald-300 hover:-translate-y-0.5 shadow-2xs"
                  : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-0.5 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`p-2 rounded-xl transition-colors ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-xs"
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
