"use client";

import React, { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import FileUploader from "@/components/FileUploader";
import AudioRecorder from "@/components/AudioRecorder";
import TranscriptEditor from "@/components/TranscriptEditor";
import StructuredFindingsEditor from "@/components/StructuredFindingsEditor";
import GapResolutionPanel from "@/components/GapResolutionPanel";
import FrameworkPanel from "@/components/FrameworkPanel";
import SynthesisPanel from "@/components/SynthesisPanel";
import WorkflowStepper, { WorkflowStage } from "@/components/WorkflowStepper";
import ReportExportModal from "@/components/ReportExportModal";
import SpeechDictationButton from "@/components/SpeechDictationButton";
import LiveMeetingRoom from "@/components/LiveMeetingRoom";
import AskDocumentsPanel from "@/components/AskDocumentsPanel";
import {
  getDecision,
  updateDecision,
  updateTranscript,
  deleteDecision,
  getFolder,
  getAttachments,
  deleteAttachment,
  analyzeDecisionInputs,
  detectGaps,
  evaluateFrameworks,
  synthesizeDecision,
  Decision,
  Folder,
  Attachment,
  StructuredFindings,
  DecisionSynthesis,
} from "@/lib/api";
import {
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Copy,
  Share2,
  RefreshCw,
  Mic,
  ArrowRight,
  ArrowLeft,
  Layers,
  Download,
  Sparkles,
  Loader2,
  ChevronRight,
  Video,
} from "lucide-react";

export default function DecisionDetailPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  const router = useRouter();
  const { decisionId: decisionIdStr } = use(params);
  const decisionId = parseInt(decisionIdStr, 10);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expandedAttachmentId, setExpandedAttachmentId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [recordType, setRecordType] = useState("decision");

  // Workflow stepper & step navigation state
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>("ingestion");
  const [viewMode, setViewMode] = useState<"step" | "all">("step");
  const [viewTrack, setViewTrack] = useState<"express" | "deep">("deep");
  const [ingestionTab, setIngestionTab] = useState<"meeting" | "voice" | "docs" | "context">("meeting");
  const [showDocsDrawer, setShowDocsDrawer] = useState(false);
  const [showAudioDrawer, setShowAudioDrawer] = useState(false);
  const [stageManuallySelected, setStageManuallySelected] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showWhyBreakdown, setShowWhyBreakdown] = useState(false);
  const [whySubTab, setWhySubTab] = useState<"frameworks" | "facts">("frameworks");
  const [pipelineLoadingMessage, setPipelineLoadingMessage] = useState<string | null>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);

  const primaryStages: { id: "ingestion" | "gaps" | "synthesis"; label: string; number: string }[] = [
    { id: "ingestion", label: "Input & Evidence", number: "01" },
    { id: "gaps", label: "Unknowns & Gaps", number: "02" },
    { id: "synthesis", label: "Final Report", number: "03" },
  ];
  const currentPrimaryIdx =
    workflowStage === "ingestion"
      ? 0
      : workflowStage === "gaps"
      ? 1
      : 2;

  const scrollToActiveStage = (smooth: boolean = true) => {
    setTimeout(() => {
      const elem = document.getElementById("active-stage-viewport");
      if (elem) {
        elem.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
          block: "start",
        });
      }
    }, 80);
  };

  const isStage1Complete = Boolean(
    description.trim() || attachments.length > 0 || decision?.transcript
  );
  const isStage2Complete = Boolean(
    Array.isArray(decision?.gaps)
      ? decision.gaps.length > 0
      : decision?.gaps && Object.keys(decision.gaps).length > 0
  );
  const isStage3Complete = Boolean(
    decision?.recommendation && "headline" in decision.recommendation
  );

  const handleSelectStage = (stage: WorkflowStage, targetWhySubTab?: "frameworks" | "facts") => {
    if (stage === "gaps" && !isStage1Complete) {
      return;
    }
    if (
      (stage === "synthesis" || stage === "frameworks" || stage === "structuring") &&
      (!isStage1Complete || !isStage2Complete)
    ) {
      return;
    }
    setStageManuallySelected(true);
    if (stage === "structuring") {
      setWorkflowStage("synthesis");
      setShowWhyBreakdown(true);
      setWhySubTab("facts");
    } else if (stage === "frameworks") {
      setWorkflowStage("synthesis");
      setShowWhyBreakdown(true);
      setWhySubTab("frameworks");
    } else {
      setWorkflowStage(stage);
      if (stage === "synthesis" && targetWhySubTab) {
        setShowWhyBreakdown(true);
        setWhySubTab(targetWhySubTab);
      }
    }
    if (stage !== "ingestion") {
      setIsHeaderCollapsed(true);
    }
    scrollToActiveStage(true);
    if (stage === "synthesis" || stage === "frameworks") {
      loadData(true);
    }
  };

  // Step 1 -> Step 2: From Input to Gaps
  const handleAdvanceToGaps = async () => {
    if (!isStage1Complete) return;
    try {
      await handleSave();
      setPipelineLoadingMessage("Structuring dilemma inputs & cognitive facts...");
      await analyzeDecisionInputs(decisionId);
      setPipelineLoadingMessage("Detecting critical unknowns & information gaps...");
      await detectGaps(decisionId);
      await loadData(true);
      handleSelectStage("gaps");
    } catch (err: unknown) {
      console.error("Error advancing to gaps:", err);
      handleSelectStage("gaps");
    } finally {
      setPipelineLoadingMessage(null);
    }
  };

  // Step 2 -> Step 3: From Gaps to Final Report
  const handleAdvanceToReport = async () => {
    try {
      await handleSave();
      const hasAnalysis = Boolean(
        decision?.analysis && typeof decision.analysis === "object" && Object.keys(decision.analysis).length > 0
      );
      const hasSynthesis = Boolean(
        decision?.recommendation && typeof decision.recommendation === "object" && "headline" in decision.recommendation
      );

      if (!hasAnalysis) {
        setPipelineLoadingMessage("Evaluating trade-offs & decision frameworks...");
        await evaluateFrameworks(decisionId);
      }
      if (!hasSynthesis) {
        setPipelineLoadingMessage("Synthesizing final executive ADR & execution roadmap...");
        await synthesizeDecision(decisionId);
      }
      await loadData(true);
      setShowWhyBreakdown(false);
      handleSelectStage("synthesis");
    } catch (err: unknown) {
      console.error("Error generating final report:", err);
      setShowWhyBreakdown(false);
      handleSelectStage("synthesis");
    } finally {
      setPipelineLoadingMessage(null);
    }
  };

  const loadData = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const d = await getDecision(decisionId);
      setDecision(d);
      setTitle(d.title);
      setProblemStatement(d.problem_statement || d.title || "");
      setDescription(d.description || "");
      setStatus(d.status || "draft");
      setRecordType(d.record_type || "decision");

      // Smart initial stage auto-selection only on initial non-silent load
      if (!stageManuallySelected && !silent) {
        if (d.recommendation && typeof d.recommendation === "object" && "headline" in d.recommendation) {
          setWorkflowStage("synthesis");
          setShowWhyBreakdown(false);
        } else if (d.analysis && typeof d.analysis === "object" && Object.keys(d.analysis).length > 0) {
          setWorkflowStage("synthesis");
          setShowWhyBreakdown(true);
          setWhySubTab("frameworks");
        } else if (
          Array.isArray(d.gaps)
            ? d.gaps.length > 0
            : Boolean(d.gaps && typeof d.gaps === "object" && Object.keys(d.gaps).length > 0)
        ) {
          setWorkflowStage("gaps");
        } else if (d.points && typeof d.points === "object" && Object.keys(d.points).length > 0) {
          setWorkflowStage("gaps");
        } else {
          setWorkflowStage("ingestion");
        }
      }

      // Fetch folder and attachments concurrently in parallel
      const [folderRes, attsRes] = await Promise.allSettled([
        getFolder(d.folder_id),
        getAttachments(decisionId),
      ]);
      if (folderRes.status === "fulfilled") setFolder(folderRes.value);
      if (attsRes.status === "fulfilled") {
        setAttachments(attsRes.value);
        if (attsRes.value.length > 0 && (!d.transcript || !d.transcript.trim()) && !stageManuallySelected) {
          setIngestionTab("docs");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load decision");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [decisionId, stageManuallySelected]);

  useEffect(() => {
    if (!isNaN(decisionId)) {
      loadData();
    }
  }, [decisionId, loadData]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedSuccess(false);
    try {
      const updated = await updateDecision(decisionId, {
        title,
        problem_statement: problemStatement,
        description,
        status,
        record_type: recordType,
      });
      setDecision(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update decision");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this decision?")) return;
    try {
      await deleteDecision(decisionId);
      if (folder) {
        router.push(`/folders/${folder.id}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete decision");
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await deleteAttachment(decisionId, attachmentId);
      setAttachments(attachments.filter((a) => a.id !== attachmentId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete attachment");
    }
  };

  const handleCopyText = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const sequenceDisplay = decision?.folder_seq
    ? String(decision.folder_seq).padStart(2, "0")
    : "01";

  return (
    <AppShell
      activeDecisionId={decisionId}
      activeFolderId={folder?.id}
      breadcrumbs={[
        ...(folder ? [{ label: folder.name, href: `/folders/${folder.id}` }] : []),
        { label: decision?.title ? `#${sequenceDisplay}: ${decision.title}` : "Decision Analysis" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE5D5] hover:bg-[#EDE7D6] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] transition-colors cursor-pointer disabled:opacity-50"
            title="Save changes"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savedSuccess ? "Saved" : saving ? "Saving..." : "Save"}</span>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1.5 rounded-md border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE5D5] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:bg-[#221F1C] dark:hover:bg-rose-950/30 dark:hover:text-rose-400 text-[#6e655a] dark:text-[#A89F91] transition-colors cursor-pointer"
            title="Delete decision"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      }
      onRefresh={loadData}
      maxWidthClass="max-w-7xl"
    >
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadData()}
              className="text-xs font-semibold px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
            <Link
              href="/dashboard"
              className="text-xs font-semibold px-3 py-1.5 bg-[#EDE5D5] border border-red-200 rounded-lg hover:bg-red-100"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="h-20 bg-[#EDE5D5] rounded-2xl border border-slate-200" />
          <div className="h-96 bg-[#EDE5D5] rounded-2xl border border-slate-200" />
        </div>
      ) : decision ? (
        <div className="flex flex-col xl:flex-row items-start gap-6 pt-1">
          {/* Main Working Canvas (Center Focus) */}
          <div className="flex-1 min-w-0 w-full space-y-5">
            {/* Clean Studio Header Strip */}
            <div className="pt-1 pb-3 border-b border-[#cfc7b2] dark:border-[#38332C] space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-[2px] bg-[#7a4e10] dark:bg-[#D4AA50]" />
                  <span className="font-courier text-xs font-bold uppercase tracking-[0.1em] text-[#7a4e10] dark:text-[#D4AA50]">
                    {folder?.name ? `${folder.name} / ` : ""}#{sequenceDisplay} • {recordType === "meeting" ? "MEETING DELIBERATION" : "DECISION DELIBERATION"}
                  </span>
                </div>
              </div>

              {/* Large Inline Editable Title */}
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter decision title..."
                aria-label="Decision Title"
                className="w-full font-newsreader text-[28px] sm:text-[36px] font-normal leading-tight tracking-tight text-[#1d1d1b] dark:text-[#F0EAE1] bg-transparent border-0 border-b border-transparent hover:border-[#cfc7b2] dark:hover:border-[#38332C] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:ring-0 px-0 py-0.5 transition-colors outline-none"
              />

              {/* Core Dilemma Secondary Inline Editable Line (hidden when identical to title) */}
              {problemStatement.trim().toLowerCase() !== title.trim().toLowerCase() && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="font-courier text-[15px] uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] font-bold shrink-0">
                    Core Dilemma:
                  </span>
                  <input
                    type="text"
                    value={problemStatement}
                    onChange={(e) => setProblemStatement(e.target.value)}
                    placeholder="Refine the specific dilemma or tension..."
                    className="flex-1 font-newsreader text-sm text-[#4f4b40] dark:text-[#C5BDB0] italic bg-transparent border-0 border-b border-dashed border-transparent hover:border-[#cfc7b2] dark:hover:border-[#38332C] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:ring-0 px-0 py-0.5 transition-colors outline-none"
                  />
                </div>
              )}
            </div>



            {/* Quiet Underline Stage Bar */}
            <div
              id="deep-audit-section"
              ref={stepContentRef}
              className="sticky top-14 z-30 bg-[#F4F0E6] dark:bg-[#181614] border-b border-[#cfc7b2] dark:border-[#38332C] transition-all font-courier"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <nav className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none" aria-label="Deliberation stages">
                  {primaryStages.map((stage) => {
                    const isActive =
                      stage.id === "ingestion"
                        ? workflowStage === "ingestion"
                        : stage.id === "gaps"
                        ? workflowStage === "gaps"
                        : workflowStage === "synthesis" || workflowStage === "frameworks" || workflowStage === "structuring";

                    const isComplete =
                      stage.id === "ingestion"
                        ? isStage1Complete
                        : stage.id === "gaps"
                        ? isStage2Complete
                        : isStage3Complete;

                    const isUnlocked =
                      stage.id === "ingestion"
                        ? true
                        : stage.id === "gaps"
                        ? isStage1Complete
                        : isStage1Complete && isStage2Complete;

                    return (
                      <button
                        key={stage.id}
                        type="button"
                        disabled={!isUnlocked}
                        title={
                          !isUnlocked
                            ? stage.id === "gaps"
                              ? "Complete Stage 01 (Input & Evidence) first"
                              : "Complete Stage 01 and Stage 02 (Unknowns & Gaps) first"
                            : undefined
                        }
                        onClick={() => handleSelectStage(stage.id)}
                        className={`inline-flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                          !isUnlocked
                            ? "border-transparent opacity-45 cursor-not-allowed text-[#6e655a] dark:text-[#A89F91]"
                            : isActive
                            ? "border-[#7a4e10] dark:border-[#D4AA50] text-[#1d1d1b] dark:text-[#F0EAE1] cursor-pointer"
                            : "border-transparent text-[#6e655a] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] cursor-pointer"
                        }`}
                      >
                        <span className="text-[11px] font-mono text-[#7a4e10] dark:text-[#D4AA50]">
                          {stage.number}
                        </span>
                        <span>{stage.label}</span>
                        {isComplete && (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                </nav>

                {pipelineLoadingMessage && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold pb-2 sm:pb-0 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{pipelineLoadingMessage}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dedicated Active Stage Viewport with Auto-Focus Anchor */}
            <div id="active-stage-viewport" className="scroll-mt-24 space-y-6">
              {/* STAGE 1: Supporting Evidence & Context (Zero Duplication) */}
              {(viewMode === "all" || workflowStage === "ingestion") && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Context & Reference Data (Optional) */}
                  <div className="bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-md p-5 sm:p-6 shadow-2xs space-y-5 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                      <h2 className="font-newsreader text-xl sm:text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                        Supporting Evidence & Context{" "}
                        <span className="font-sans text-xs text-[#97907e] dark:text-[#A89F91]">
                          (Optional)
                        </span>
                      </h2>
                      <p className="text-xs text-[#6e655a] dark:text-[#A89F91]">
                        Add meeting audio, notes, or files to sharpen the analysis
                      </p>
                    </div>

                    {/* 2-Card Primary Intake Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setIngestionTab("meeting")}
                        className={`p-4 text-left rounded-md transition-all duration-200 cursor-pointer space-y-1.5 hover:-translate-y-0.5 ${
                          ingestionTab === "meeting"
                            ? "bg-[#EDE7D6] text-[#1d1d1b] dark:bg-[#24201C] dark:text-[#F0EAE1] border-2 border-[#7a4e10] dark:border-[#D4AA50] shadow-sm"
                            : "bg-[#F4F0E6]/60 text-[#1d1d1b] dark:bg-[#181614] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#EDE7D6] dark:hover:bg-[#221F1C]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            Google Meet Autonomous Bot
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                              ingestionTab === "meeting"
                                ? "bg-[#7a4e10] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                                : "bg-[#E5DEC9] text-[#7a4e10] dark:bg-[#2C2723] dark:text-[#D4AA50]"
                            }`}
                          >
                            Primary Intake
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-[#4f4b40] dark:text-[#A89F91]">
                          Joins your Google Meet call, transcribes discussions live, and captures confidential inputs.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (ingestionTab === "meeting") setIngestionTab("context");
                        }}
                        className={`p-4 text-left rounded-md transition-all duration-200 cursor-pointer space-y-1.5 hover:-translate-y-0.5 ${
                          ingestionTab !== "meeting"
                            ? "bg-[#EDE7D6] text-[#1d1d1b] dark:bg-[#24201C] dark:text-[#F0EAE1] border-2 border-[#7a4e10] dark:border-[#D4AA50] shadow-sm"
                            : "bg-[#F4F0E6]/60 text-[#1d1d1b] dark:bg-[#181614] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#EDE7D6] dark:hover:bg-[#221F1C]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            Written Notes & Context
                          </span>
                          {(description.trim() || attachments.length > 0 || decision.transcript) && (
                            <span
                              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                                ingestionTab !== "meeting"
                                  ? "bg-[#F4F0E6] text-[#181614] dark:bg-[#181614] dark:text-[#D4AA50]"
                                  : "bg-[#E5DEC9] text-[#7a4e10] dark:bg-[#2C2723] dark:text-[#D4AA50]"
                              }`}
                            >
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-[#4f4b40] dark:text-[#A89F91]">
                          Add dilemma constraints, attach specs, or record voice memos in one composer.
                        </p>
                      </button>
                    </div>

                    {/* Active Expanded Context Area */}
                    <div className="pt-2">
                      {/* Unified Notes, Docs & Voice Composer */}
                      {ingestionTab !== "meeting" && (
                        <div className="space-y-4 animate-in fade-in duration-150">
                          <div className="bg-[#EDE7D6]/80 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-md overflow-hidden">
                            <textarea
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              rows={4}
                              placeholder={
                                recordType === "meeting"
                                  ? "e.g. Participants: Product Lead, Eng Manager, Tech Lead. Pre-read: RFC #102..."
                                  : "Add background notes, constraints, budget limits, or deadlines..."
                              }
                              className="w-full text-base font-newsreader bg-transparent p-4 text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#97907e] focus:outline-none leading-relaxed resize-y"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#EDE7D6]/70 dark:bg-[#221F1C] border-t border-[#cfc7b2]/70 dark:border-[#38332C]/70 font-courier">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowDocsDrawer((v) => !v)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-md cursor-pointer transition-colors ${
                                    showDocsDrawer || ingestionTab === "docs"
                                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50]"
                                      : "bg-[#EDE5D5] dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                                  }`}
                                  title="Attach PDF, DOCX, TXT, or Markdown files"
                                >
                                  <Paperclip className="w-3.5 h-3.5" />
                                  <span>Attach docs{attachments.length > 0 ? ` (${attachments.length})` : ""}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setShowAudioDrawer((v) => !v)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border rounded-md cursor-pointer transition-colors ${
                                    showAudioDrawer || ingestionTab === "voice"
                                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50]"
                                      : "bg-[#EDE5D5] dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                                  }`}
                                  title="Record a voice memo or upload an audio file"
                                >
                                  <Mic className="w-3.5 h-3.5" />
                                  <span>Voice / Audio{decision.transcript ? " (Ready)" : ""}</span>
                                </button>
                              </div>

                              <SpeechDictationButton
                                onTranscript={(text) =>
                                  setDescription((prev) => (prev ? `${prev} ${text}` : text))
                                }
                                title="Dictate directly into notes"
                              />
                            </div>
                          </div>

                          {/* Inline Attach Docs Drawer */}
                          {(showDocsDrawer || ingestionTab === "docs" || attachments.length > 0) && (
                            <div className="space-y-4">
                              {(showDocsDrawer || ingestionTab === "docs") && (
                                <FileUploader
                                  decisionId={decisionId}
                                  onUploadSuccess={(att) => {
                                    setAttachments([att, ...attachments]);
                                    loadData();
                                  }}
                                />
                              )}

                              {attachments.length > 0 && (
                                <div className="space-y-3">
                                  <h3 className="text-xs font-courier font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                                    Attached Documents ({attachments.length})
                                  </h3>
                                  {attachments.map((att) => {
                                    const isExpanded = expandedAttachmentId === att.id;
                                    const wordCount = att.extracted_text
                                      ? att.extracted_text.split(/\s+/).filter(Boolean).length
                                      : 0;

                                    return (
                                      <div
                                        key={att.id}
                                        className="border border-[#cfc7b2] dark:border-[#38332C] rounded-none overflow-hidden bg-[#F4F0E6] dark:bg-[#181614] transition-colors"
                                      >
                                        <div className="p-3.5 flex items-center justify-between gap-4">
                                          <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-none bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-center text-[#7a4e10] dark:text-[#D4AA50] font-bold shrink-0">
                                            </div>
                                            <div className="min-w-0 font-courier">
                                              <p className="text-sm font-bold text-[#1d1d1b] dark:text-[#F0EAE1] truncate">
                                                {att.original_name}
                                              </p>
                                              <div className="flex items-center gap-2 text-xs text-[#4f4b40] dark:text-[#A89F91] mt-0.5">
                                                <span>{formatFileSize(att.file_size)}</span>
                                                <span>•</span>
                                                <span>{wordCount} words extracted</span>
                                                <span>•</span>
                                                <span>{new Date(att.created_at).toLocaleDateString()}</span>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0 font-courier">
                                            <button
                                              type="button"
                                              onClick={() => setExpandedAttachmentId(isExpanded ? null : att.id)}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] rounded-none transition-colors"
                                            >
                                              {isExpanded ? (
                                                <>
                                                  Hide Text <ChevronUp className="w-3.5 h-3.5" />
                                                </>
                                              ) : (
                                                <>
                                                  View Text <ChevronDown className="w-3.5 h-3.5" />
                                                </>
                                              )}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteAttachment(att.id)}
                                              title="Delete document"
                                              className="p-1.5 text-[#97907e] hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>

                                        {isExpanded && (
                                          <div className="p-4 bg-[#EDE7D6] dark:bg-[#221F1C] border-t border-[#cfc7b2] dark:border-[#38332C] space-y-3 font-courier">
                                            <div className="flex items-center justify-between text-xs text-[#4f4b40] dark:text-[#A89F91]">
                                              <span className="font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                                                Extracted Text Preview
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleCopyText(att.extracted_text, att.id)}
                                                className="inline-flex items-center gap-1 text-[#443a30] dark:text-[#D4AA50] font-bold uppercase tracking-wider hover:underline"
                                              >
                                                {copiedId === att.id ? (
                                                  <>
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Copied!
                                                  </>
                                                ) : (
                                                  <>
                                                    <Copy className="w-3.5 h-3.5" /> Copy Text
                                                  </>
                                                )}
                                              </button>
                                            </div>

                                            <div className="max-h-60 overflow-y-auto bg-[#F4F0E6] dark:bg-[#181614] p-3 rounded-none border border-[#cfc7b2] dark:border-[#38332C] text-xs font-mono text-[#1d1d1b] dark:text-[#F0EAE1] whitespace-pre-wrap leading-relaxed select-text">
                                              {att.extracted_text}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Always-visible RAG Grounding & Ask Documents Q&A inside Stage 1 */}
                          <div className="pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C]">
                            <AskDocumentsPanel
                              decisionId={decisionId}
                              attachmentCount={attachments.length}
                            />
                          </div>

                          {/* Inline Voice Memo & Audio Upload Drawer (plus saved TranscriptEditor whenever transcript exists) */}
                          {(showAudioDrawer || ingestionTab === "voice" || Boolean(decision.transcript)) && (
                            <div className="space-y-4 font-courier">
                              {(showAudioDrawer || ingestionTab === "voice") && (
                                <AudioRecorder
                                  decisionId={decisionId}
                                  initialLanguage={decision.language || "en"}
                                  onTranscriptionSuccess={async (res) => {
                                    if (res && res.transcript) {
                                      setDecision((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              transcript: res.transcript,
                                              language: res.language || prev.language,
                                              transcript_reviewed: res.transcript_reviewed ?? false,
                                            }
                                          : prev
                                      );
                                    }
                                    await loadData(true);
                                  }}
                                />
                              )}

                              <div id="transcript-editor-section" className="scroll-mt-24">
                                <TranscriptEditor
                                  key={`transcript-${decision.id}-${(decision.transcript || "").length}-${(decision.transcript || "").slice(0, 30)}`}
                                  decisionId={decisionId}
                                  initialTranscript={decision.transcript || ""}
                                  isReviewed={decision.transcript_reviewed}
                                  language={decision.language || "en"}
                                  onTranscriptSaved={() => loadData(true)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Active Panel: Google Meet Bot */}
                      {ingestionTab === "meeting" && (
                        <div className="space-y-4 animate-in fade-in duration-150 font-courier">
                          <LiveMeetingRoom
                              decisionId={decisionId}
                              decisionTitle={title || decision.title}
                              recordType={recordType}
                              onFinishMeeting={async (data) => {
                                if (data && data.transcript && data.transcript.trim()) {
                                  try {
                                    await updateTranscript(decisionId, data.transcript.trim(), true);
                                  } catch (err) {
                                    console.warn("Could not save live transcript:", err);
                                  }
                                }
                                if (data && data.notes && data.notes.length > 0) {
                                  const notesSummary = data.notes
                                    .map((n) => `[${n.category.toUpperCase()}] ${n.content} (${n.isAnonymous ? "Anonymous" : n.author})`)
                                    .join("\n");
                                  const updatedDesc = description
                                    ? `${description}\n\n### Anonymous Meeting Risks & Constraints:\n${notesSummary}`
                                    : `### Anonymous Meeting Risks & Constraints:\n${notesSummary}`;
                                  setDescription(updatedDesc);
                                  await updateDecision(decisionId, { description: updatedDesc });
                                }
                                await loadData(true);
                                // Stay on Stage 1 until user is ready to advance to Stage 2
                              }}
                            />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage 1 Bottom Action Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#cfc7b2] dark:border-[#38332C] mt-4 font-courier">
                    <div className="text-xs text-[#4f4b40] dark:text-[#A89F91]">
                      Stage 1 of 3 · Add optional context or jump straight to gap analysis
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(pipelineLoadingMessage) || !isStage1Complete}
                      title={!isStage1Complete ? "Add notes, attachments, or a meeting transcript in Stage 1 first" : undefined}
                      onClick={handleAdvanceToGaps}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#F4F0E6] bg-[#7a4e10] hover:bg-[#633f0d] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-md border border-[#7a4e10] dark:border-[#D4AA50] shadow-sm transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      {pipelineLoadingMessage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{pipelineLoadingMessage}</span>
                        </>
                      ) : (
                        <>
                          <span>Find gaps & unknowns</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 2: Unknowns & Information Gap Resolution */}
              {(viewMode === "all" || workflowStage === "gaps") && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <GapResolutionPanel
                    decisionId={decisionId}
                    initialGaps={decision.gaps}
                    onGapsUpdated={() => loadData()}
                  />

                  {/* Stage 2 Bottom Action Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#cfc7b2] dark:border-[#38332C] font-courier">
                    <button
                      type="button"
                      onClick={() => handleSelectStage("ingestion")}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to input</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(pipelineLoadingMessage)}
                      onClick={handleAdvanceToReport}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#F4F0E6] bg-[#7a4e10] hover:bg-[#633f0d] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-md border border-[#7a4e10] dark:border-[#D4AA50] shadow-sm transition-colors cursor-pointer"
                    >
                      {pipelineLoadingMessage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{pipelineLoadingMessage}</span>
                        </>
                      ) : (
                        <>
                          <span>Generate final report</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 3: Final Decision Synthesis (Direct Verdict) & Inspection Drawer */}
              {(viewMode === "all" || workflowStage === "synthesis" || workflowStage === "frameworks" || workflowStage === "structuring") && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Primary Final ADR Verdict */}
                  <SynthesisPanel
                    decisionId={decisionId}
                    initialSynthesis={
                      decision.recommendation && "headline" in decision.recommendation
                        ? (decision.recommendation as unknown as DecisionSynthesis)
                        : null
                    }
                    onSynthesisUpdated={() => loadData()}
                  />

                  {/* Small Why Button Directly Below the Verdict */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#cfc7b2] dark:border-[#38332C] font-courier">
                    <button
                      type="button"
                      onClick={() => setShowWhyBreakdown(!showWhyBreakdown)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] rounded-md transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      <span>{showWhyBreakdown ? "Hide decision rationale" : "Why was this decision chosen? (Frameworks & facts)"}</span>
                      <span className="text-[10px] text-[#7a4e10] dark:text-[#D4AA50]">
                        {showWhyBreakdown ? "▲" : "▼"}
                      </span>
                    </button>
                    <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
                      Deterministic multi-attribute utility & grounding facts
                    </span>
                  </div>

                  {/* Collapsible Inspection Details when toggled */}
                  {showWhyBreakdown && (
                    <div className="space-y-4 pt-2 border-t border-[#cfc7b2] dark:border-[#38332C] animate-in fade-in duration-150 font-courier">
                      <div className="flex items-center gap-1 bg-[#EDE7D6] dark:bg-[#221F1C] p-1 border border-[#cfc7b2] dark:border-[#38332C] rounded-md text-xs font-semibold w-fit">
                        <button
                          type="button"
                          onClick={() => setWhySubTab("frameworks")}
                          className={`px-3 py-1.5 transition-colors cursor-pointer ${
                            whySubTab === "frameworks"
                              ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                              : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                          }`}
                        >
                          Frameworks & Scores (MAUT)
                        </button>
                        <button
                          type="button"
                          onClick={() => setWhySubTab("facts")}
                          className={`px-3 py-1.5 transition-colors cursor-pointer ${
                            whySubTab === "facts"
                              ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                              : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                          }`}
                        >
                          Underlying Facts & Statements
                        </button>
                      </div>

                      {whySubTab === "frameworks" ? (
                        <FrameworkPanel
                          decisionId={decisionId}
                          initialAnalysis={decision.analysis}
                          onAnalysisUpdated={() => loadData()}
                        />
                      ) : (
                        <StructuredFindingsEditor
                          decisionId={decisionId}
                          initialFindings={decision.points as unknown as StructuredFindings}
                          isReviewed={decision.points_reviewed || false}
                          onFindingsUpdated={() => loadData()}
                          problemStatement={problemStatement || decision.problem_statement || ""}
                          transcript={decision.transcript || ""}
                          attachmentCount={attachments.length}
                          onAdvanceToGaps={() => handleSelectStage("gaps")}
                        />
                      )}
                    </div>
                  )}

                  {/* Quiet Stage 3 Footer Link */}
                  <div className="pt-4 border-t border-[#cfc7b2] dark:border-[#38332C] mt-6 flex items-center justify-between font-courier">
                    <button
                      type="button"
                      onClick={() => handleSelectStage("gaps")}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to unknowns & gaps</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Phase 11: Comprehensive Report Export Modal */}
      <ReportExportModal
        decisionId={decisionId}
        decisionTitle={title || decision?.title || "Decision Analysis"}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onReportSaved={() => loadData()}
      />
    </AppShell>
  );
}
