"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  X,
  Sparkles,
  Share2,
  Save,
  Trash2,
  CheckCircle2,
  Paperclip,
  Compass,
  Video,
  ShieldCheck,
  Zap,
  Clock,
  Layers,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Decision, Folder, Attachment } from "@/lib/api";
import { WorkflowStage } from "@/components/WorkflowStepper";

interface DecisionInspectorProps {
  decision: Decision;
  folder: Folder | null;
  status: string;
  setStatus: (s: string) => void;
  recordType: string;
  setRecordType: (t: string) => void;
  attachments: Attachment[];
  saving: boolean;
  savedSuccess: boolean;
  onSave: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onOpenAutoPilot: () => void;
  onOpenExport: () => void;
  isOpen: boolean;
  onToggle: () => void;
  currentStage: WorkflowStage;
  onSelectStage: (stage: WorkflowStage) => void;
  onSelectIngestionTab?: (tab: "meeting" | "voice" | "docs" | "context") => void;
}

export default function DecisionInspector({
  decision,
  folder,
  status,
  setStatus,
  recordType,
  setRecordType,
  attachments,
  saving,
  savedSuccess,
  onSave,
  onDelete,
  onOpenAutoPilot,
  onOpenExport,
  isOpen,
  onToggle,
  currentStage,
  onSelectStage,
  onSelectIngestionTab,
}: DecisionInspectorProps) {
  // Epistemic Rigor calculation
  const rigorData = useMemo(() => {
    if (decision.recommendation && typeof decision.recommendation === "object" && "headline" in decision.recommendation) {
      return { percent: 92, label: "Fully Scrutinized", level: "high", color: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-600 dark:bg-emerald-400" };
    }
    if (decision.analysis && typeof decision.analysis === "object" && Object.keys(decision.analysis).length > 0) {
      return { percent: 75, label: "Trade-offs Balanced", level: "med-high", color: "text-[#2B4C8C] dark:text-[#93b3ee]", bar: "bg-[#2B4C8C] dark:bg-[#93b3ee]" };
    }
    const hasGaps = Array.isArray(decision.gaps) ? decision.gaps.length > 0 : Boolean(decision.gaps && typeof decision.gaps === "object" && Object.keys(decision.gaps).length > 0);
    if (hasGaps) {
      return { percent: 50, label: "Gaps Audited", level: "mid", color: "text-amber-700 dark:text-amber-400", bar: "bg-amber-600 dark:bg-amber-400" };
    }
    const hasPoints = decision.points && typeof decision.points === "object" && Object.keys(decision.points).length > 0;
    if (hasPoints) {
      return { percent: 35, label: "Cognitive Map Ready", level: "early", color: "text-amber-800 dark:text-amber-300", bar: "bg-amber-700 dark:bg-amber-400" };
    }
    return { percent: 25, label: "In Progress", level: "draft", color: "text-[#7a4e10] dark:text-[#D4AA50]", bar: "bg-[#7a4e10] dark:bg-[#D4AA50]" };
  }, [decision]);

  const createdFormatted = useMemo(() => {
    try {
      return new Date(decision.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Nov 2026";
    }
  }, [decision.created_at]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className="w-full xl:w-[320px] 2xl:w-[360px] shrink-0 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none shadow-2xs font-courier flex flex-col transition-all duration-200"
      aria-label="Deliberation Inspector"
    >
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between p-3.5 border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#E5DEC9] dark:bg-[#1C1917]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#1d1d1b] dark:text-[#F0EAE1]">
            Deliberation Dossier
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="p-1 text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/50 rounded-none transition-colors"
          title="Close Inspector"
          aria-label="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)]">
        {/* 2. Primary Actions Group */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
              Executive Actions
            </span>
            {savedSuccess && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenAutoPilot}
              className="px-3 py-2.5 bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold uppercase tracking-wider rounded-none transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              title="Run end-to-end deliberation pipeline autonomously"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 dark:text-[#181614]" />
              <span>Auto-Pilot</span>
            </button>

            <button
              type="button"
              onClick={onOpenExport}
              className="px-3 py-2.5 bg-[#F4F0E6] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-bold uppercase tracking-wider rounded-none transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              title="Export Executive ADR Brief"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onSave()}
              disabled={saving}
              className="flex-1 py-2 px-3 bg-[#7a4e10] hover:bg-[#633f0d] text-[#F4F0E6] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-xs font-bold uppercase tracking-wider rounded-none transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : "Save Record"}</span>
            </button>

            <button
              type="button"
              onClick={() => onDelete()}
              title="Delete record"
              className="p-2 text-[#7B8491] hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. Epistemic Rigor & Diagnostics Telemetry */}
        <div className="p-3.5 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Epistemic Rigor
            </span>
            <span className={`font-bold ${rigorData.color}`}>{rigorData.percent}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-[#E5DEC9] dark:bg-[#2C2723] rounded-none overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${rigorData.bar}`}
              style={{ width: `${rigorData.percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
            <span>{rigorData.label}</span>
            <span>Step {currentStage === "ingestion" ? "1" : currentStage === "structuring" ? "2" : currentStage === "gaps" ? "3" : currentStage === "frameworks" ? "4" : "5"} of 5</span>
          </div>
        </div>

        {/* 4. Metadata Attributes Group */}
        <div className="space-y-3 pt-1 border-t border-[#cfc7b2]/70 dark:border-[#38332C]/70">
          <span className="text-[11px] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
            Dossier Properties
          </span>

          {/* Status Field */}
          <div className="space-y-1">
            <label className="text-[11px] text-[#4f4b40] dark:text-[#A89F91] uppercase tracking-wider font-bold block">
              Deliberation Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none px-2.5 py-1.5 text-xs font-courier font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] focus:outline-none focus:border-[#7a4e10] dark:focus:border-[#D4AA50]"
            >
              <option value="draft">Needs Evidence (Draft)</option>
              <option value="evaluating">Under Scrutiny (Evaluating)</option>
              <option value="decided">Decided (Consensus)</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Record Type Field */}
          <div className="space-y-1">
            <label className="text-[11px] text-[#4f4b40] dark:text-[#A89F91] uppercase tracking-wider font-bold block">
              Record Modality
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setRecordType("decision")}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold uppercase tracking-wider rounded-none border transition-colors cursor-pointer ${
                  recordType === "decision"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50]"
                    : "bg-[#F4F0E6] dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C]"
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Decision</span>
              </button>

              <button
                type="button"
                onClick={() => setRecordType("meeting")}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold uppercase tracking-wider rounded-none border transition-colors cursor-pointer ${
                  recordType === "meeting"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50]"
                    : "bg-[#F4F0E6] dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C]"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Meeting</span>
              </button>
            </div>
          </div>

          {/* Workspace Parent Link */}
          {folder && (
            <div className="space-y-1">
              <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91] uppercase tracking-wider font-bold block">
                Parent Workspace
              </span>
              <Link
                href={`/folders/${folder.id}`}
                className="flex items-center justify-between p-2 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs text-[#1d1d1b] dark:text-[#F0EAE1] hover:border-[#7a4e10] dark:hover:border-[#D4AA50] transition-colors"
              >
                <span className="truncate font-bold">{folder.name}</span>
                <ExternalLink className="w-3 h-3 text-[#7B8491]" />
              </Link>
            </div>
          )}

          {/* Creation Date & ID */}
          <div className="flex items-center justify-between text-[11px] text-[#7B8491] pt-1">
            <span>RECORD ID #{decision.id}</span>
            <span>CREATED {createdFormatted}</span>
          </div>
        </div>

        {/* 5. RAG Documents & Grounding Index */}
        <div className="space-y-2 pt-1 border-t border-[#cfc7b2]/70 dark:border-[#38332C]/70">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
              RAG Grounding ({attachments.length})
            </span>
            {onSelectIngestionTab && (
              <button
                type="button"
                onClick={() => {
                  onSelectStage("ingestion");
                  onSelectIngestionTab("docs");
                }}
                className="text-[11px] font-bold text-[#2B4C8C] dark:text-[#D4AA50] hover:underline"
              >
                + Attach
              </button>
            )}
          </div>

          {attachments.length === 0 ? (
            <div className="p-2.5 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[11px] text-[#7B8491]">
              0 reference documents attached. Upload RFCs, specs or benchmarks to ground AI checks.
            </div>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-1.5 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs"
                >
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    <Paperclip className="w-3 h-3 text-[#7a4e10] dark:text-[#D4AA50] shrink-0" />
                    <span className="truncate text-[11px] font-bold">{att.original_name}</span>
                  </div>
                  <span className="text-[10px] text-[#7B8491] shrink-0 ml-1">
                    {(att.file_size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. Hotkey Quick Reference */}
        <div className="p-2.5 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[11px] text-[#4f4b40] dark:text-[#A89F91] space-y-1">
          <div className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider text-[10px]">
            Navigation Shortcuts
          </div>
          <div className="flex items-center justify-between">
            <span>Hop Workflow Stages</span>
            <span className="font-bold font-mono">1 – 5</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Toggle Inspector Pane</span>
            <span className="font-bold font-mono">I / Cmd + .</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

