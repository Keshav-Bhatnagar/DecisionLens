"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
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

  // Workflow stepper & export state (Phase 11)
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>("ingestion");
  const [viewMode, setViewMode] = useState<"step" | "all">("all");
  const [showExportModal, setShowExportModal] = useState(false);

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

      try {
        const f = await getFolder(d.folder_id);
        setFolder(f);
      } catch {
        // Folder might be inaccessible
      }

      try {
        const atts = await getAttachments(decisionId);
        setAttachments(atts);
      } catch {
        setAttachments([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load decision");
    } finally {
      setLoading(false);
    }
  }, [decisionId]);

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
    <div className="min-h-screen bg-slate-50">
      <Navbar onUserChange={() => loadData()} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-6">
          <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">
            Workspaces
          </Link>
          <span>/</span>
          {folder ? (
            <>
              <Link href={`/folders/${folder.id}`} className="hover:text-indigo-600 transition-colors">
                {folder.name}
              </Link>
              <span>/</span>
            </>
          ) : null}
          <span className="text-slate-900 font-semibold truncate max-w-xs">
            {decision?.title || "Decision"}
          </span>
        </div>

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
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl shadow-sm transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Export Brief
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
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
                    className="w-full text-xl sm:text-2xl font-extrabold text-slate-900 border-0 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:ring-0 px-0 py-1 transition-colors"
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
                      className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="decision">Decision Analysis</option>
                      <option value="meeting">Meeting Discussion</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 11: End-to-End Workflow Stepper */}
            <WorkflowStepper
              currentStage={workflowStage}
              onSelectStage={(stage) => setWorkflowStage(stage)}
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

            {/* STAGE 1: Ingestion & Input (Context, Docs, Voice, Transcript) */}
            {(viewMode === "all" || workflowStage === "ingestion") && (
              <div className="space-y-6">
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

                {/* Document Attachments & Extracted Text Preview (Phase 4) */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Paperclip className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Documents & Extracted Text
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
                            {/* Summary Bar */}
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

                            {/* Collapsible Extracted Text Preview Drawer */}
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

                {/* Voice Recording & Speech-to-Text (Phase 5) */}
                <AudioRecorder
                  decisionId={decisionId}
                  initialLanguage={decision.language || "en"}
                  onTranscriptionSuccess={() => loadData()}
                />

                {/* Editable Transcript & Explicit Review Action (Phase 5) */}
                <TranscriptEditor
                  decisionId={decisionId}
                  initialTranscript={decision.transcript || ""}
                  isReviewed={decision.transcript_reviewed}
                  language={decision.language || "en"}
                  onTranscriptSaved={() => loadData()}
                />

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

            {/* STAGE 2: 8-Category Cognitive Structuring & Private Feedback (Phase 6) */}
            {(viewMode === "all" || workflowStage === "structuring") && (
              <StructuredFindingsEditor
                decisionId={decisionId}
                initialFindings={decision.points as unknown as StructuredFindings}
                isReviewed={decision.points_reviewed || false}
                onFindingsUpdated={() => loadData()}
              />
            )}

            {/* STAGE 3: Information Gap Detection & Resolution (Phase 7 & 8) */}
            {(viewMode === "all" || workflowStage === "gaps") && (
              <GapResolutionPanel
                decisionId={decisionId}
                initialGaps={decision.gaps}
                onGapsUpdated={() => loadData()}
              />
            )}

            {/* STAGE 4: Structured Thinking Frameworks (Phase 9) */}
            {(viewMode === "all" || workflowStage === "frameworks") && (
              <FrameworkPanel
                decisionId={decisionId}
                initialAnalysis={decision.analysis}
                onAnalysisUpdated={() => loadData()}
              />
            )}

            {/* STAGE 5: Final Decision Synthesis & Actionable Roadmap (Phase 10) */}
            {(viewMode === "all" || workflowStage === "synthesis") && (
              <SynthesisPanel
                decisionId={decisionId}
                initialSynthesis={
                  decision.recommendation && "headline" in decision.recommendation
                    ? (decision.recommendation as unknown as DecisionSynthesis)
                    : null
                }
                onSynthesisUpdated={() => loadData()}
              />
            )}

            {/* Pipeline Modules Status Card */}
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
                  <span className="text-[10px] text-emerald-400 font-mono block">Phase 8 ✓</span>
                  <span className="font-semibold text-slate-300">External Web Research</span>
                </div>
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-emerald-400 font-mono block">Phase 9 ✓</span>
                  <span className="font-semibold text-slate-300">5 Thinking Frameworks</span>
                </div>
                <div className="p-3 bg-slate-800/80 rounded-xl border border-emerald-500/50">
                  <span className="text-[10px] text-emerald-400 font-mono block">Phase 10 ✓</span>
                  <span className="font-semibold text-emerald-300">Recommendation & Roadmap</span>
                </div>
              </div>
            </div>
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
      </main>
    </div>
  );
}
