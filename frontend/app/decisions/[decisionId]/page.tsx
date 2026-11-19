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
import AutoPilotModal from "@/components/AutoPilotModal";
import DecisionInspector from "@/components/DecisionInspector";
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
  const [ingestionTab, setIngestionTab] = useState<"meeting" | "voice" | "docs" | "context">("context");
  const [stageManuallySelected, setStageManuallySelected] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAutoPilotModal, setShowAutoPilotModal] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
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

  const handleSelectStage = (stage: WorkflowStage, targetWhySubTab?: "frameworks" | "facts") => {
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
    try {
      await handleSave();
      const hasPoints =
        decision?.points && typeof decision.points === "object" && Object.keys(decision.points).length > 0;
      const hasGaps = Array.isArray(decision?.gaps)
        ? decision.gaps.length > 0
        : Boolean(decision?.gaps && typeof decision.gaps === "object" && Object.keys(decision.gaps).length > 0);

      if (!hasPoints) {
        setPipelineLoadingMessage("Structuring dilemma inputs & cognitive facts...");
        await analyzeDecisionInputs(decisionId);
      }
      if (!hasGaps) {
        setPipelineLoadingMessage("Detecting critical unknowns & information gaps...");
        await detectGaps(decisionId);
      }
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

  // Keyboard shortcut 'I' to toggle inspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.key === "i" || e.key === "I") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setInspectorOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        { label: decision?.title ? `#${sequenceDisplay}: ${decision.title}` : "Decision Analysis", href: `/decisions/${decisionId}` },
        { label: currentPrimaryIdx === 0 ? "Stage 1: Input & Evidence" : currentPrimaryIdx === 1 ? "Stage 2: Unknowns & Gaps" : "Stage 3: Final Report" },
      ]}
      actions={
        <button
          type="button"
          onClick={() => setInspectorOpen((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-courier font-bold uppercase tracking-wider rounded-none border transition-colors cursor-pointer ${
            inspectorOpen
              ? "bg-[#7a4e10] text-[#F4F0E6] border-[#7a4e10] dark:bg-[#D4AA50] dark:text-[#181614] dark:border-[#D4AA50]"
              : "bg-[#EDE7D6] hover:bg-[#E5DEC9] text-[#1d1d1b] border-[#cfc7b2] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] dark:text-[#F0EAE1] dark:border-[#38332C]"
          }`}
          title="Toggle Deliberation Dossier Inspector [I]"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Inspector</span>
        </button>
      }
      onRefresh={loadData}
      maxWidthClass="max-w-[1560px]"
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
              className="text-xs font-semibold px-3 py-1.5 bg-white border border-red-200 rounded-lg hover:bg-red-100"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="h-20 bg-white rounded-2xl border border-slate-200" />
          <div className="h-96 bg-white rounded-2xl border border-slate-200" />
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

                {/* Mobile / Tablet Quick Inspector Toggle */}
                <button
                  type="button"
                  onClick={() => setInspectorOpen((prev) => !prev)}
                  className="xl:hidden inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-courier font-bold uppercase tracking-wider rounded-none border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1]"
                >
                  <Layers className="w-3 h-3" />
                  <span>{inspectorOpen ? "Hide Details" : "Details"}</span>
                </button>
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

              {/* Core Dilemma Secondary Inline Editable Line */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="font-courier text-[15px] uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] font-bold shrink-0">
                  Core Dilemma:
                </span>
                <input
                  type="text"
                  value={problemStatement}
                  onChange={(e) => setProblemStatement(e.target.value)}
                  placeholder="Refine specific technical dilemma or architectural tension..."
                  className="flex-1 font-newsreader text-sm text-[#4f4b40] dark:text-[#C5BDB0] italic bg-transparent border-0 border-b border-dashed border-transparent hover:border-[#cfc7b2] dark:hover:border-[#38332C] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:ring-0 px-0 py-0.5 transition-colors outline-none"
                />
              </div>
            </div>



            {/* 3-Milestone Streamlined Workflow Navigation (No Hectic Stepper) */}
            <div
              id="deep-audit-section"
              ref={stepContentRef}
              className="sticky top-0 z-30 bg-[#F4F0E6]/95 dark:bg-[#181614]/95 backdrop-blur-md pt-2 pb-2 -mx-2 px-2 sm:-mx-4 sm:px-4 border-b border-[#cfc7b2] dark:border-[#38332C] shadow-2xs transition-all font-courier"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C]">
                <nav className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto" aria-label="Deliberation stages">
                  {primaryStages.map((stage, idx) => {
                    const isActive =
                      stage.id === "ingestion"
                        ? workflowStage === "ingestion"
                        : stage.id === "gaps"
                        ? workflowStage === "gaps"
                        : workflowStage === "synthesis" || workflowStage === "frameworks" || workflowStage === "structuring";

                    const isComplete =
                      stage.id === "ingestion"
                        ? Boolean(description.trim() || attachments.length > 0 || decision?.transcript)
                        : stage.id === "gaps"
                        ? Boolean(
                            Array.isArray(decision?.gaps)
                              ? decision.gaps.length > 0
                              : decision?.gaps && Object.keys(decision.gaps).length > 0
                          )
                        : Boolean(decision?.recommendation && "headline" in decision.recommendation);

                    return (
                      <React.Fragment key={stage.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectStage(stage.id)}
                          className={`flex-1 sm:flex-initial inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#1d1d1b] text-[#F4F0E6] border-[#1d1d1b] dark:bg-[#D4AA50] dark:text-[#181614] dark:border-[#D4AA50] shadow-2xs"
                              : "bg-[#F4F0E6] text-[#4f4b40] dark:bg-[#181614] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                          }`}
                        >
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-none font-mono ${
                              isActive
                                ? "bg-[#38332C] text-[#F4F0E6] dark:bg-[#181614] dark:text-[#D4AA50]"
                                : "bg-[#E5DEC9] text-[#7a4e10] dark:bg-[#2C2723] dark:text-[#D4AA50]"
                            }`}
                          >
                            {stage.number}
                          </span>
                          <span>{stage.label}</span>
                          {isComplete && (
                            <CheckCircle2
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isActive ? "text-emerald-400 dark:text-emerald-900" : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            />
                          )}
                        </button>
                        {idx < primaryStages.length - 1 && (
                          <ChevronRight className="w-3.5 h-3.5 text-[#97907e] hidden sm:inline shrink-0" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </nav>

                <div className="flex items-center gap-2 text-[11px] text-[#4f4b40] dark:text-[#A89F91] self-end sm:self-center">
                  {pipelineLoadingMessage ? (
                    <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{pipelineLoadingMessage}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#7a4e10] dark:bg-[#D4AA50] animate-pulse" />
                      <span>
                        {workflowStage === "ingestion"
                          ? "Stage 1: Input & Evidence"
                          : workflowStage === "gaps"
                          ? "Stage 2: Unknowns & Gaps"
                          : "Stage 3: Final Report & Insights"}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Dedicated Active Stage Viewport with Auto-Focus Anchor */}
            <div id="active-stage-viewport" className="scroll-mt-24 space-y-6">
              {/* STAGE 1: Supporting Evidence & Context (Zero Duplication) */}
              {(viewMode === "all" || workflowStage === "ingestion") && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Context & Reference Data (Optional) */}
                  <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] rounded-none p-6 sm:p-7 shadow-2xs space-y-5 transition-colors">
                    <div>
                      <div className="flex items-center justify-between">
                        <h2 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                          Supporting Evidence & Context{" "}
                          <span className="font-courier text-xs text-[#97907e] dark:text-[#A89F91] uppercase tracking-wider">
                            (Optional)
                          </span>
                        </h2>
                      </div>
                      <p className="text-xs font-courier text-[#4f4b40] dark:text-[#A89F91] mt-1">
                        Your decision dilemma is framed above. Choose any source below to provide technical specifications, constraints, or meeting audio:
                      </p>
                    </div>

                    {/* 3 Clear, Mutually-Exclusive Modality Selector Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-courier">
                      {/* Option 1: Written Notes */}
                      <button
                        type="button"
                        onClick={() => setIngestionTab("context")}
                        className={`p-4 text-left border rounded-none transition-all cursor-pointer ${
                          ingestionTab === "context"
                            ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50] shadow-sm"
                            : "bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            Written Notes
                          </span>
                          {description.trim() ? (
                            <span
                              className={`text-[14px] font-bold uppercase px-1.5 py-0.2 rounded-none ${
                                ingestionTab === "context"
                                  ? "bg-[#F4F0E6] text-[#181614] dark:bg-[#181614] dark:text-[#D4AA50]"
                                  : "bg-[#E5DEC9] text-[#7a4e10] dark:bg-[#2C2723] dark:text-[#D4AA50]"
                              }`}
                            >
                              Filled
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[15px] opacity-75 leading-snug">
                          Add stakeholders, deadlines, budget limits, or known constraints.
                        </p>
                      </button>

                      {/* Option 2: Attach Specs */}
                      <button
                        type="button"
                        onClick={() => setIngestionTab("docs")}
                        className={`p-4 text-left border rounded-none transition-all cursor-pointer ${
                          ingestionTab === "docs"
                            ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50] shadow-sm"
                            : "bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5" />
                            Attach Specs
                          </span>
                          {attachments.length > 0 ? (
                            <span
                              className={`text-[14px] font-bold uppercase px-1.5 py-0.2 rounded-none ${
                                ingestionTab === "docs"
                                  ? "bg-[#F4F0E6] text-[#181614] dark:bg-[#181614] dark:text-[#D4AA50]"
                                  : "bg-[#E5DEC9] text-[#7a4e10] dark:bg-[#2C2723] dark:text-[#D4AA50]"
                              }`}
                            >
                              {attachments.length} {attachments.length === 1 ? "doc" : "docs"}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[15px] opacity-75 leading-snug">
                          Upload architectural diagrams, PRDs, RFCs, or benchmark data.
                        </p>
                      </button>

                      {/* Option 3: Voice & Call Sync */}
                      <button
                        type="button"
                        onClick={() => setIngestionTab("voice")}
                        className={`p-4 text-left border rounded-none transition-all cursor-pointer ${
                          ingestionTab === "voice" || ingestionTab === "meeting"
                            ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50] shadow-sm"
                            : "bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Mic className="w-3.5 h-3.5" />
                            Voice & Meetings
                          </span>
                          {Boolean(decision.transcript) ? (
                            <span
                              className={`text-[14px] font-bold uppercase px-1.5 py-0.2 rounded-none ${
                                ingestionTab === "voice" || ingestionTab === "meeting"
                                  ? "bg-[#F4F0E6] text-[#181614] dark:bg-[#181614] dark:text-[#D4AA50]"
                                  : "bg-[#E5DEC9] text-[#7a4e10] dark:bg-[#2C2723] dark:text-[#D4AA50]"
                              }`}
                            >
                              Transcribed
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[15px] opacity-75 leading-snug">
                          Record spoken notes, upload an audio file, or sync a live meeting call.
                        </p>
                      </button>
                    </div>

                    {/* Active Expanded Context Area */}
                    <div className="pt-2">
                      {/* Active Panel 1: Written Notes */}
                      {ingestionTab === "context" && (
                        <div className="space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <label className="font-courier text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1]">
                              Background Notes, Constraints & Deadlines:
                            </label>
                            <SpeechDictationButton
                              onTranscript={(text) =>
                                setDescription((prev) => (prev ? `${prev} ${text}` : text))
                              }
                              title="Dictate background notes"
                            />
                          </div>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            placeholder={
                              recordType === "meeting"
                                ? "e.g. Participants: Product Lead, Eng Manager, Tech Lead. Pre-read: RFC #102..."
                                : "Add initial notes, key stakeholders, technical constraints, budget limits, or known deadlines..."
                            }
                            className="w-full text-base font-newsreader bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-4 text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#97907e] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:ring-1 focus:ring-[#7a4e10] focus:outline-none transition-colors leading-relaxed"
                          />
                        </div>
                      )}

                      {/* Active Panel 2: Reference Docs */}
                      {ingestionTab === "docs" && (
                        <div className="space-y-5 animate-in fade-in duration-150">
                          <FileUploader
                            decisionId={decisionId}
                            onUploadSuccess={(att) => {
                              setAttachments([att, ...attachments]);
                              loadData();
                            }}
                          />

                          {/* Attachments List with Extracted Text Preview */}
                          {attachments.length > 0 && (
                            <div className="space-y-3 pt-2">
                              <h3 className="text-xs font-courier font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                                Uploaded Attachments ({attachments.length})
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
                                    <div className="p-4 flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-none bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-center text-[#7a4e10] dark:text-[#D4AA50] font-bold shrink-0">
                                          <FileText className="w-4 h-4" />
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
                                              View Extracted Text <ChevronDown className="w-3.5 h-3.5" />
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

                      {/* Active Panel 3: Voice & Call Sync */}
                      {(ingestionTab === "voice" || ingestionTab === "meeting") && (
                        <div className="space-y-4 animate-in fade-in duration-150 font-courier">
                          <div className="flex items-center gap-2 border-b border-[#cfc7b2] dark:border-[#38332C] pb-3">
                            <button
                              type="button"
                              onClick={() => setIngestionTab("voice")}
                              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer transition-colors ${
                                ingestionTab === "voice"
                                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                                  : "text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C]"
                              }`}
                            >
                              Voice Memo & Audio Upload
                            </button>
                            <button
                              type="button"
                              onClick={() => setIngestionTab("meeting")}
                              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer transition-colors ${
                                ingestionTab === "meeting"
                                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                                  : "text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C]"
                              }`}
                            >
                              Live Call & Anonymous Scribe
                            </button>
                          </div>

                          {ingestionTab === "voice" ? (
                            <div className="space-y-4">
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
                          ) : (
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
                                setWorkflowStage("structuring");
                                setStageManuallySelected(true);
                                setTimeout(() => {
                                  const elem = document.getElementById("deep-audit-section");
                                  if (elem) elem.scrollIntoView({ behavior: "smooth", block: "start" });
                                }, 150);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage 1 Bottom Action Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none shadow-2xs mt-6 font-courier">
                    <div className="text-xs text-[#4f4b40] dark:text-[#A89F91]">
                      Stage 1 of 3: Provide dilemma context, reference specs, or meeting recording
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(pipelineLoadingMessage)}
                      onClick={handleAdvanceToGaps}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-[#7a4e10] hover:bg-[#633f0d] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-none border border-[#7a4e10] dark:border-[#D4AA50] shadow-sm transition-colors cursor-pointer"
                    >
                      {pipelineLoadingMessage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{pipelineLoadingMessage}</span>
                        </>
                      ) : (
                        <>
                          <span>Find Gaps & Unknowns</span>
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
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none shadow-2xs font-courier">
                    <button
                      type="button"
                      onClick={() => handleSelectStage("ingestion")}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to Input</span>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(pipelineLoadingMessage)}
                      onClick={handleAdvanceToReport}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-[#7a4e10] hover:bg-[#633f0d] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-none border border-[#7a4e10] dark:border-[#D4AA50] shadow-sm transition-colors cursor-pointer"
                    >
                      {pipelineLoadingMessage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{pipelineLoadingMessage}</span>
                        </>
                      ) : (
                        <>
                          <span>Generate Final Report</span>
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
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      <span>{showWhyBreakdown ? "Hide Decision Rationale" : "Why was this decision chosen? (View Frameworks & Facts)"}</span>
                      <span className="text-[10px] text-[#7a4e10] dark:text-[#D4AA50]">
                        {showWhyBreakdown ? "▲" : "▼"}
                      </span>
                    </button>
                    <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
                      Deterministic Multi-Attribute Utility & Grounding Facts
                    </span>
                  </div>

                  {/* Collapsible Inspection Details when toggled */}
                  {showWhyBreakdown && (
                    <div className="space-y-4 pt-2 border-t border-[#cfc7b2] dark:border-[#38332C] animate-in fade-in duration-150 font-courier">
                      <div className="flex items-center gap-1 bg-[#EDE7D6] dark:bg-[#221F1C] p-1 border border-[#cfc7b2] dark:border-[#38332C] text-xs font-bold uppercase tracking-wider w-fit">
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

                  {/* Single Unified Stage 3 Action Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none shadow-2xs mt-8 font-courier">
                    <button
                      type="button"
                      onClick={() => handleSelectStage("gaps")}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to Unknowns & Gaps</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowExportModal(true)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-[#7a4e10] hover:bg-[#633f0d] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-none border border-[#7a4e10] dark:border-[#D4AA50] shadow-sm transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Meeting Takeaways</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Deliberation Dossier (Inspector Panel) */}
          <DecisionInspector
            decision={decision}
            folder={folder}
            status={status}
            setStatus={setStatus}
            recordType={recordType}
            setRecordType={setRecordType}
            attachments={attachments}
            saving={saving}
            savedSuccess={savedSuccess}
            onSave={handleSave}
            onDelete={handleDelete}
            onOpenAutoPilot={() => setShowAutoPilotModal(true)}
            onOpenExport={() => setShowExportModal(true)}
            isOpen={inspectorOpen}
            onToggle={() => setInspectorOpen(false)}
            currentStage={workflowStage}
            onSelectStage={handleSelectStage}
            onSelectIngestionTab={setIngestionTab}
          />
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

      {/* Autonomous Sequential Pipeline: Auto-Pilot Modal */}
      <AutoPilotModal
        decisionId={decisionId}
        decisionTitle={title || decision?.title || "Decision Analysis"}
        isOpen={showAutoPilotModal}
        onClose={() => setShowAutoPilotModal(false)}
        onComplete={async () => {
          await loadData(true);
          setWorkflowStage("synthesis");
          setStageManuallySelected(true);
        }}
      />
    </AppShell>
  );
}
