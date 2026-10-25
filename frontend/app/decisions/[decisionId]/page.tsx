"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import {
  getDecision,
  updateDecision,
  deleteDecision,
  getFolder,
  getAttachments,
  deleteAttachment,
  Decision,
  Folder,
  Attachment,
  StructuredFindings,
  DecisionSynthesis,
} from "@/lib/api";
import {
  Compass,
  Users,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles,
  Share2,
  RefreshCw,
  Mic,
  ArrowRight,
  ArrowLeft,
  Check,
} from "lucide-react";

// export default function DecisionDetailPage({
//   params,
// }: {
//   params: Promise<{ decisionId: string }>;
// }) {
//   const router = useRouter();
//   const { decisionId: decisionIdStr } = use(params);
//   const decisionId = parseInt(decisionIdStr, 10);
export default function DecisionDetailPage({
  params,
}: {
  params: { decisionId: string };
}) {
  const router = useRouter();
  const { decisionId: decisionIdStr } = params;
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
  const [ingestionTab, setIngestionTab] = useState<"voice" | "docs" | "context">("voice");
  const [stageManuallySelected, setStageManuallySelected] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const stepContentRef = useRef<HTMLDivElement>(null);

  const workflowStagesList: { id: WorkflowStage; label: string; number: string }[] = [
    { id: "ingestion", label: "Input & Audio", number: "01" },
    { id: "structuring", label: "Cognitive Structuring", number: "02" },
    { id: "gaps", label: "Gaps & Web Research", number: "03" },
    { id: "frameworks", label: "Thinking Frameworks", number: "04" },
    { id: "synthesis", label: "Synthesis & Roadmap", number: "05" },
  ];
  const currentStageIdx = workflowStagesList.findIndex((s) => s.id === workflowStage);

  const handleSelectStage = (stage: WorkflowStage) => {
    setStageManuallySelected(true);
    setWorkflowStage(stage);
    setTimeout(() => {
      stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDecision(decisionId);
      setDecision(d);
      setTitle(d.title);
      setProblemStatement(d.problem_statement || "");
      setDescription(d.description || "");
      setStatus(d.status || "draft");
      setRecordType(d.record_type || "decision");

      // Smart initial stage auto-selection if user hasn't explicitly chosen one
      if (!stageManuallySelected) {
        if (d.recommendation && typeof d.recommendation === "object" && "headline" in d.recommendation) {
          setWorkflowStage("synthesis");
        } else if (d.analysis && typeof d.analysis === "object" && Object.keys(d.analysis).length > 0) {
          setWorkflowStage("frameworks");
        } else if (
          Array.isArray(d.gaps)
            ? d.gaps.length > 0
            : Boolean(d.gaps && typeof d.gaps === "object" && Object.keys(d.gaps).length > 0)
        ) {
          setWorkflowStage("gaps");
        } else if (d.points && typeof d.points === "object" && Object.keys(d.points).length > 0) {
          setWorkflowStage("structuring");
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
      if (attsRes.status === "fulfilled") setAttachments(attsRes.value);
    } catch (err: unknown) {

      setError(err instanceof Error ? err.message : "Failed to load decision");
    } finally {
      setLoading(false);
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

  return (
    <AppShell
      activeDecisionId={decisionId}
      activeFolderId={folder?.id}
      breadcrumbs={[
        ...(folder ? [{ label: folder.name, href: `/folders/${folder.id}` }] : []),
        { label: decision?.title || "Decision Analysis", href: `/decisions/${decisionId}` },
        { label: `Step ${currentStageIdx + 1}: ${workflowStagesList[currentStageIdx]?.label}` },
      ]}
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
                className="text-xs font-semibold px-3 py-1.5 bg-white border border-red-200 rounded-lg hover:bg-red-100"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-28 bg-white rounded-2xl border border-slate-200" />
            <div className="h-96 bg-white rounded-2xl border border-slate-200" />
          </div>
        ) : decision ? (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Header & Title Card */}
            <div className="glass-panel rounded-2xl specular-edge p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100 mb-6">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${recordType === "meeting"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      }`}
                  >
                    {recordType === "meeting" ? (
                      <>
                        <Users className="w-3.5 h-3.5" /> Meeting Record
                      </>
                    ) : (
                      <>
                        <Compass className="w-3.5 h-3.5" /> Decision Analysis
                      </>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">
                    Created {new Date(decision.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {savedSuccess && (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4" /> Saved!
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl shadow-2xs transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Export Brief
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl shadow-sm transition-all disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    title="Delete record"
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full text-xl sm:text-2xl font-extrabold text-slate-900 border-0 border-b-2 border-transparent hover:border-slate-300 focus:border-indigo-600 focus:ring-0 px-0 py-1 transition-all rounded-none bg-transparent"
                    placeholder="Decision or Meeting Title"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full text-xs font-semibold border border-slate-200/90 rounded-xl px-3.5 py-2.5 bg-white/80 backdrop-blur-xs text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    >
                      <option value="draft">Draft</option>
                      <option value="evaluating">Evaluating Options</option>
                      <option value="decided">Decided</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Record Type
                    </label>
                    <select
                      value={recordType}
                      onChange={(e) => setRecordType(e.target.value)}
                      className="w-full text-xs font-semibold border border-slate-200/90 rounded-xl px-3.5 py-2.5 bg-white/80 backdrop-blur-xs text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    >
                      <option value="decision">Decision Analysis</option>
                      <option value="meeting">Meeting Discussion</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 11: End-to-End Guided Workflow Stepper */}
            <div ref={stepContentRef} className="scroll-mt-20">
              <WorkflowStepper
                currentStage={workflowStage}
                onSelectStage={(stage) => handleSelectStage(stage)}
                viewMode={viewMode}
                onToggleViewMode={() => setViewMode(viewMode === "step" ? "all" : "step")}
                onOpenExportModal={() => setShowExportModal(true)}
                hasTranscript={Boolean(decision.transcript && decision.transcript.trim().length > 0)}
                isTranscriptReviewed={Boolean(decision.transcript_reviewed)}
                isPointsReviewed={Boolean(decision.points_reviewed)}
                hasGaps={
                  Array.isArray(decision.gaps)
                    ? decision.gaps.length > 0
                    : Boolean(decision.gaps && typeof decision.gaps === "object" && Object.keys(decision.gaps).length > 0)
                }
                hasFrameworks={Boolean(decision.analysis && typeof decision.analysis === "object" && Object.keys(decision.analysis).length > 0)}
                hasSynthesis={Boolean(decision.recommendation && typeof decision.recommendation === "object" && "headline" in decision.recommendation)}
              />
            </div>

            {/* STAGE 1: Ingestion & Input (Context, Docs, Voice, Transcript) */}
            {(viewMode === "all" || workflowStage === "ingestion") && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Stage 1 Sub-Tab Selector for clean, uncluttered input */}
                {viewMode === "step" && (
                  <div className="flex flex-wrap items-center gap-2 p-1.5 glass-panel rounded-2xl specular-edge shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setIngestionTab("voice")}
                      className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
                        ingestionTab === "voice"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <Mic className="w-4 h-4" />
                      <span>1. Voice & Audio</span>
                      {Boolean(decision.transcript) && (
                        <span
                          className={`w-2 h-2 rounded-full ${
                            ingestionTab === "voice" ? "bg-emerald-300" : "bg-emerald-500"
                          }`}
                          title="Transcript recorded"
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIngestionTab("docs")}
                      className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
                        ingestionTab === "docs"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <Paperclip className="w-4 h-4" />
                      <span>2. Documents ({attachments.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIngestionTab("context")}
                      className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
                        ingestionTab === "context"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>3. Problem Statement & Notes</span>
                    </button>
                  </div>
                )}

                {/* Sub-Tab 1: Voice Recording & Editable Transcript */}
                {(viewMode === "all" || ingestionTab === "voice") && (
                  <div className="space-y-5">
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
                        await loadData();
                      }}
                    />

                    <div id="transcript-editor-section" className="scroll-mt-24">
                      <TranscriptEditor
                        decisionId={decisionId}
                        initialTranscript={decision.transcript || ""}
                        isReviewed={decision.transcript_reviewed}
                        language={decision.language || "en"}
                        onTranscriptSaved={() => loadData()}
                      />
                    </div>
                  </div>
                )}

                {/* Sub-Tab 2: Document Attachments & Extracted Text Preview */}
                {(viewMode === "all" || ingestionTab === "docs") && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                          <Paperclip className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-900">
                            Documents & Reference Files
                          </h2>
                          <p className="text-xs text-slate-500">
                            Upload reference documents (PDF, DOCX, TXT, MD) to incorporate into analysis.
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                        {attachments.length} {attachments.length === 1 ? "document" : "documents"}
                      </span>
                    </div>

                    {/* Upload Dropzone */}
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
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Uploaded Attachments
                        </h3>
                        {attachments.map((att) => {
                          const isExpanded = expandedAttachmentId === att.id;
                          const wordCount = att.extracted_text
                            ? att.extracted_text.split(/\s+/).filter(Boolean).length
                            : 0;

                          return (
                            <div
                              key={att.id}
                              className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 hover:bg-slate-50 transition-colors"
                            >
                              <div className="p-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-bold shrink-0">
                                    <FileText className="w-4 h-4 text-indigo-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 truncate">
                                      {att.original_name}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                      <span>{formatFileSize(att.file_size)}</span>
                                      <span>•</span>
                                      <span>{wordCount} words extracted</span>
                                      <span>•</span>
                                      <span>{new Date(att.created_at).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedAttachmentId(isExpanded ? null : att.id)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
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
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="p-4 bg-white border-t border-slate-200 space-y-3">
                                  <div className="flex items-center justify-between text-xs text-slate-500">
                                    <span className="font-semibold text-slate-700">
                                      Extracted Text Preview
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(att.extracted_text, att.id)}
                                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
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

                                  <div className="max-h-60 overflow-y-auto bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed select-text">
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

                {/* Sub-Tab 3: Problem Statement & Background Notes */}
                {(viewMode === "all" || ingestionTab === "context") && (
                  <div className="space-y-5">
                    {/* Problem Statement Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <Compass className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-base font-bold text-slate-900">
                          Problem Statement & Core Dilemma
                        </h2>
                      </div>
                      <p className="text-xs text-slate-500">
                        Articulate the core problem to solve, the decision question, or the central goal of this meeting discussion.
                      </p>
                      <textarea
                        value={problemStatement}
                        onChange={(e) => setProblemStatement(e.target.value)}
                        rows={4}
                        placeholder="Describe what decision needs to be made, why it matters, and what criteria are most critical..."
                        className="w-full text-sm border border-slate-200 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    {/* Description & Context Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-600" />
                        <h2 className="text-base font-bold text-slate-900">
                          Background Context & Initial Notes
                        </h2>
                      </div>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="Add initial notes, key stakeholders, constraints, or known deadlines..."
                        className="w-full text-sm border border-slate-200 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STAGE 2: 8-Category Cognitive Structuring & Private Feedback (Phase 6) */}
            {(viewMode === "all" || workflowStage === "structuring") && (
              <div className="animate-in fade-in duration-200">
                <StructuredFindingsEditor
                  decisionId={decisionId}
                  initialFindings={decision.points as unknown as StructuredFindings}
                  isReviewed={decision.points_reviewed || false}
                  onFindingsUpdated={() => loadData()}
                />
              </div>
            )}

            {/* STAGE 3: Information Gap Detection & Resolution (Phase 7 & 8) */}
            {(viewMode === "all" || workflowStage === "gaps") && (
              <div className="animate-in fade-in duration-200">
                <GapResolutionPanel
                  decisionId={decisionId}
                  initialGaps={decision.gaps}
                  onGapsUpdated={() => loadData()}
                />
              </div>
            )}

            {/* STAGE 4: Structured Thinking Frameworks (Phase 9) */}
            {(viewMode === "all" || workflowStage === "frameworks") && (
              <div className="animate-in fade-in duration-200">
                <FrameworkPanel
                  decisionId={decisionId}
                  initialAnalysis={decision.analysis}
                  onAnalysisUpdated={() => loadData()}
                />
              </div>
            )}

            {/* STAGE 5: Final Decision Synthesis & Actionable Roadmap (Phase 10) */}
            {(viewMode === "all" || workflowStage === "synthesis") && (
              <div className="animate-in fade-in duration-200">
                <SynthesisPanel
                  decisionId={decisionId}
                  initialSynthesis={
                    decision.recommendation && "headline" in decision.recommendation
                      ? (decision.recommendation as unknown as DecisionSynthesis)
                      : null
                  }
                  onSynthesisUpdated={() => loadData()}
                />
              </div>
            )}

            {/* Guided Bottom Stage Action Bar (In Step Mode) */}
            {viewMode === "step" && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:p-5 glass-panel rounded-2xl specular-edge shadow-sm mt-8">
                <button
                  type="button"
                  disabled={currentStageIdx === 0}
                  onClick={() => handleSelectStage(workflowStagesList[currentStageIdx - 1].id)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>
                    Previous: {currentStageIdx > 0 ? workflowStagesList[currentStageIdx - 1].label : "Start"}
                  </span>
                </button>

                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  <span>
                    Step {currentStageIdx + 1} of 5:{" "}
                    <strong className="text-slate-800">{workflowStagesList[currentStageIdx]?.label}</strong>
                  </span>
                </div>

                {currentStageIdx < workflowStagesList.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => handleSelectStage(workflowStagesList[currentStageIdx + 1].id)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm hover:shadow transition"
                  >
                    <span>Continue to {workflowStagesList[currentStageIdx + 1].label}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 rounded-xl shadow-sm hover:shadow transition"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Export Executive Brief</span>
                  </button>
                )}
              </div>
            )}

            {/* Pipeline Modules Status Card (shown only in All Steps view or on Stage 5) */}
            {(viewMode === "all" || workflowStage === "synthesis") && (
              <div className="bg-slate-900 text-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-2 text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    Decision Pipeline Status
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mb-6">
                  All 10 core pipeline modules active: from document/voice ingestion and structured cognitive classification, to gap research, 5 thinking frameworks, and final grounded synthesis roadmaps.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      Phase 8 <Check className="w-2.5 h-2.5" />
                    </span>
                    <span className="font-semibold text-slate-300">External Web Research</span>
                  </div>
                  <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      Phase 9 <Check className="w-2.5 h-2.5" />
                    </span>
                    <span className="font-semibold text-slate-300">5 Thinking Frameworks</span>
                  </div>
                  <div className="p-3 bg-slate-800/80 rounded-xl border border-emerald-500/50">
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      Phase 10 <Check className="w-2.5 h-2.5" />
                    </span>
                    <span className="font-semibold text-emerald-300">Recommendation & Roadmap</span>
                  </div>
                </div>
              </div>
            )}
          </form>
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
