"use client";

import React, { useEffect } from "react";
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
  Sparkles,
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
  onOpenAutoPilot?: () => void;
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
  onOpenAutoPilot,
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
    number: string;
    label: string;
    shortDesc: string;
    icon: React.ReactNode;
    isCompleted: boolean;
  }[] = isMeeting
    ? [
        {
          id: "ingestion",
          number: "1",
          label: "Audio & Notes",
          shortDesc: "Audio & Docs",
          icon: <Mic className="w-3.5 h-3.5" />,
          isCompleted: isTranscriptReviewed || hasTranscript,
        },
        {
          id: "structuring",
          number: "2",
          label: "Discussion",
          shortDesc: "Key Points",
          icon: <Users className="w-3.5 h-3.5" />,
          isCompleted: isPointsReviewed,
        },
        {
          id: "gaps",
          number: "3",
          label: "Action Items",
          shortDesc: "Owners & Risks",
          icon: <Search className="w-3.5 h-3.5" />,
          isCompleted: hasGaps,
        },
        {
          id: "frameworks",
          number: "4",
          label: "Alignment",
          shortDesc: "Trade-offs",
          icon: <Grid className="w-3.5 h-3.5" />,
          isCompleted: hasFrameworks,
        },
        {
          id: "synthesis",
          number: "5",
          label: "Summary",
          shortDesc: "Minutes & Memo",
          icon: <Compass className="w-3.5 h-3.5" />,
          isCompleted: hasSynthesis,
        },
      ]
    : [
        {
          id: "ingestion",
          number: "1",
          label: "Input",
          shortDesc: "Docs & Audio",
          icon: <FileText className="w-3.5 h-3.5" />,
          isCompleted: isTranscriptReviewed || hasTranscript,
        },
        {
          id: "structuring",
          number: "2",
          label: "Structuring",
          shortDesc: "Key Points",
          icon: <Brain className="w-3.5 h-3.5" />,
          isCompleted: isPointsReviewed,
        },
        {
          id: "gaps",
          number: "3",
          label: "Gaps & Risks",
          shortDesc: "Deep Dive",
          icon: <Search className="w-3.5 h-3.5" />,
          isCompleted: hasGaps,
        },
        {
          id: "frameworks",
          number: "4",
          label: "Trade-offs",
          shortDesc: "Evaluation",
          icon: <Grid className="w-3.5 h-3.5" />,
          isCompleted: hasFrameworks,
        },
        {
          id: "synthesis",
          number: "5",
          label: "Synthesis",
          shortDesc: "Executive ADR",
          icon: <Compass className="w-4 h-4" />,
          isCompleted: hasSynthesis,
        },
      ];

  // Hotkey navigation: Press 1-5 to change stage quickly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (["1", "2", "3", "4", "5"].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (stages[idx]) {
          onSelectStage(stages[idx].id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stages, onSelectStage]);

  return (
    <div className="bg-[#EDE7D6] dark:bg-[#221F1C] rounded-2xl p-2.5 sm:p-3 border border-[#cfc7b2] dark:border-[#38332C] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 font-sans text-[#1d1d1b] dark:text-[#F0EAE1]">
      {/* 5-Step Segmented Rail */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 bg-[#E5DEC9] dark:bg-[#181614] p-1.5 rounded-xl border border-[#cfc7b2] dark:border-[#38332C]">
        {stages.map((stage) => {
          const isActive = currentStage === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelectStage(stage.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition cursor-pointer ${
                isActive
                  ? "bg-[#F4F0E6] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1] font-semibold shadow-xs border border-[#cfc7b2] dark:border-[#38332C]"
                  : stage.isCompleted
                  ? "text-[#1d1d1b] dark:text-[#F0EAE1] hover:text-[#2B4C8C] dark:hover:text-[#D4AA50] hover:bg-[#cfc7b2]/40"
                  : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/30"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 transition ${
                  isActive
                    ? "bg-[#1d1d1b] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614]"
                    : stage.isCompleted
                    ? "bg-[#EDE7D6] dark:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]"
                    : "bg-[#cfc7b2] dark:bg-[#38332C] text-[#4f4b40] dark:text-[#A89F91]"
                }`}
              >
                {stage.isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-[#1d1d1b] dark:text-[#D4AA50]" />
                ) : (
                  stage.number
                )}
              </span>

              <div className="truncate min-w-0">
                <span className="font-newsreader text-[15px] sm:text-[16px] truncate block leading-tight font-bold">
                  {stage.label}
                </span>
                <span className="text-[12px] sm:text-[13px] text-[#4f4b40] dark:text-[#A89F91] truncate block font-sans font-medium hidden lg:block mt-0.5">
                  {stage.shortDesc}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick Actions (Auto-Pilot + View Toggle + Export Brief) */}
      <div className="flex items-center gap-2 shrink-0 justify-end">
        {onOpenAutoPilot && (
          <button
            type="button"
            onClick={onOpenAutoPilot}
            className="inline-flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl font-semibold bg-[#1d1d1b] hover:bg-[#2C2723] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] tracking-wide shadow-xs transition cursor-pointer"
            title="Auto-run full pipeline: Structuring → Gaps → Frameworks → Synthesis"
          >
            <Sparkles className="w-4 h-4 text-[#D4AA50] dark:text-[#181614]" />
            <span>Auto-Pilot</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleViewMode}
          className="text-[13px] px-4 py-2.5 rounded-xl border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] font-semibold tracking-wide transition cursor-pointer shadow-2xs"
          title="Toggle between single stage focus or full view"
        >
          {viewMode === "step" ? "Step Mode" : "All Steps"}
        </button>

        <button
          type="button"
          onClick={onOpenExportModal}
          className="inline-flex items-center gap-1.5 text-[13px] px-4 py-2.5 rounded-xl font-semibold bg-[#EDE7D6] dark:bg-[#221F1C] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] tracking-wide shadow-2xs transition cursor-pointer"
        >
          <Share2 className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
          <span>{isMeeting ? "Export Minutes" : "Export Brief"}</span>
        </button>
      </div>
    </div>
  );
}
