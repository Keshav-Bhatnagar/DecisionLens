"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import SpeechDictationButton from "@/components/SpeechDictationButton";
import ModalPortal from "@/components/ModalPortal";
import {
  getFolder,
  getDecisions,
  createDecision,
  deleteDecision,
  deleteFolder,
  uploadAttachment,
  Folder,
  Decision,
} from "@/lib/api";
import {
  Folder as FolderIcon,
  Plus,
  ArrowLeft,
  Calendar,
  FileText,
  Users,
  Compass,
  Trash2,
  AlertCircle,
  Filter,
  X,
  Paperclip,
  Upload,
  Loader2,
} from "lucide-react";

export default function FolderDetailPage({
  params,
}: {
  params: { folderId: string };
}) {
  const router = useRouter();
  const { folderId: folderIdStr } = params;
  const folderId = parseInt(folderIdStr, 10);

  const [folder, setFolder] = useState<Folder | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [recordType, setRecordType] = useState("decision");
  const [problemStatement, setProblemStatement] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getNextTitle = useCallback(
    (type: string) => {
      if (type === "meeting") {
        const count = decisions.filter((d) => d.record_type === "meeting").length;
        return `Meeting ${count + 1}`;
      } else {
        const count = decisions.filter((d) => d.record_type !== "meeting").length;
        return `Discussion ${count + 1}`;
      }
    },
    [decisions]
  );

  const handleOpenCreateModal = (type: "decision" | "meeting" = "decision") => {
    setRecordType(type);
    setTitle(getNextTitle(type));
    setProblemStatement("");
    setDescription("");
    setSelectedFiles([]);
    setError(null);
    setShowCreateModal(true);
  };

  const handleSwitchRecordType = (newType: string) => {
    setRecordType(newType);
    if (!title.trim() || title.startsWith("Meeting") || title.startsWith("Discussion")) {
      setTitle(getNextTitle(newType));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const loadFolderData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f = await getFolder(folderId);
      setFolder(f);
      const d = await getDecisions(folderId);
      setDecisions(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load folder");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    if (!isNaN(folderId)) {
      loadFolderData();
    }
  }, [folderId, loadFolderData]);

  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await createDecision({
        folder_id: folderId,
        title,
        problem_statement: problemStatement,
        description,
        record_type: recordType,
        status,
      });

      // Upload any attached files to this decision
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            await uploadAttachment(created.id, file);
          } catch (uploadErr) {
            console.error("Failed to upload file:", file.name, uploadErr);
          }
        }
      }

      setShowCreateModal(false);
      setTitle("");
      setProblemStatement("");
      setDescription("");
      setSelectedFiles([]);
      router.push(`/decisions/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create record");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDecision = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await deleteDecision(id);
      await loadFolderData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete decision");
    }
  };

  const handleDeleteFolder = async () => {
    if (!confirm("Delete this entire folder and all contained decisions?")) return;
    try {
      await deleteFolder(folderId);
      router.push("/dashboard");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  };

  const filteredDecisions = decisions.filter((d) => {
    if (filterType === "all") return true;
    return d.record_type === filterType;
  });

  return (
    <AppShell
      activeFolderId={folderId}
      breadcrumbs={folder ? [{ label: folder.name }] : undefined}
      onRefresh={loadFolderData}
    >

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <Link
              href="/dashboard"
              className="text-xs font-semibold px-3 py-1.5 bg-white border border-red-200 rounded-lg hover:bg-red-100"
            >
              Back to Dashboard
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-32 bg-white rounded-2xl border border-slate-200" />
            <div className="h-64 bg-white rounded-2xl border border-slate-200" />
          </div>
        ) : folder ? (
          <>
            {/* Folder Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-8 shadow-sm relative overflow-hidden">
              <div
                className="absolute top-0 left-0 right-0 h-2"
                style={{ backgroundColor: folder.color || "#4F46E5" }}
              />

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 mt-1"
                    style={{ backgroundColor: folder.color || "#4F46E5" }}
                  >
                    <FolderIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                      {folder.name}
                    </h1>
                    <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                      {folder.description || "No description for this folder."}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-3 font-medium">
                      <span>{decisions.length} {decisions.length === 1 ? "record" : "records"}</span>
                      <span>•</span>
                      <span>Created {new Date(folder.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start flex-wrap">
                  <button
                    onClick={() => handleOpenCreateModal("decision")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
                    title="Start new decision analysis"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Decision</span>
                  </button>
                  <button
                    onClick={() => handleOpenCreateModal("meeting")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"
                    title="Record meeting discussion"
                  >
                    <Users className="w-4 h-4" />
                    <span>Meeting</span>
                  </button>
                  <button
                    onClick={handleDeleteFolder}
                    title="Delete folder"
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterType("all")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterType === "all"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                    }`}
                >
                  All Records ({decisions.length})
                </button>
                <button
                  onClick={() => setFilterType("decision")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterType === "decision"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                    }`}
                >
                  Decisions ({decisions.filter((d) => d.record_type === "decision").length})
                </button>
                <button
                  onClick={() => setFilterType("meeting")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterType === "meeting"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                    }`}
                >
                  Meeting Discussions ({decisions.filter((d) => d.record_type === "meeting").length})
                </button>
              </div>
            </div>

            {/* Decision Cards List */}
            {filteredDecisions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800">
                  {filterType === "all" ? "No records in this folder yet" : `No ${filterType}s found`}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto mb-5">
                  Create a structured decision problem or capture a meeting discussion in this folder.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add First Record
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredDecisions.map((decision) => (
                  <Link
                    key={decision.id}
                    href={`/decisions/${decision.id}`}
                    className="group glass-card glass-card-hover rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 relative overflow-hidden"
                  >
                    {/* Top Specular Edge */}
                    <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent pointer-events-none" />

                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            decision.record_type === "meeting"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                              : "bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                          }`}
                        >
                          {decision.record_type === "meeting" ? "Meeting Record" : "Decision"}
                        </span>

                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            decision.status === "decided"
                              ? "bg-emerald-100/70 text-emerald-800 border border-emerald-300/60"
                              : decision.status === "evaluating"
                              ? "bg-amber-100/70 text-amber-800 border border-amber-300/60"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {decision.status}
                        </span>

                        <span className="text-xs text-slate-400 font-medium">
                          {new Date(decision.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {decision.title}
                      </h3>

                      {decision.problem_statement && (
                        <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">
                          <strong className="text-slate-800 font-semibold">Problem:</strong>{" "}
                          {decision.problem_statement}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform hidden sm:inline-flex items-center gap-1">
                        Open Workspace →
                      </span>
                      <button
                        onClick={(e) => handleDeleteDecision(decision.id, e)}
                        title="Delete decision"
                        className="text-slate-300 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : null}

      {/* Create Decision/Meeting Modal */}
      {showCreateModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <h3 className="text-lg font-semibold text-slate-900">
                New Record in &quot;{folder?.name}&quot;
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateDecision} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Record Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSwitchRecordType("decision")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      recordType === "decision"
                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600 shadow-2xs font-semibold"
                        : "border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <Compass className="w-4 h-4 mb-1 text-indigo-600" />
                    <p className="text-xs font-bold">Decision Analysis</p>
                    <p className="text-[10px] text-slate-500">Problem statement, tradeoffs, matrix</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchRecordType("meeting")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      recordType === "meeting"
                        ? "border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-1 ring-emerald-600 shadow-2xs font-semibold"
                        : "border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <Users className="w-4 h-4 mb-1 text-emerald-600" />
                    <p className="text-xs font-bold">Meeting Record</p>
                    <p className="text-[10px] text-slate-500">Discussion notes, transcripts, takeaways</p>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <SpeechDictationButton
                    onTranscript={(text) => setTitle((prev) => (prev ? `${prev} ${text}` : text))}
                    title="Dictate title"
                  />
                </div>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    recordType === "meeting"
                      ? "e.g. Meeting 1, Sprint Architecture Sync"
                      : "e.g. Discussion 1, Cloud Migration Strategy"
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    {recordType === "meeting"
                      ? "Discussion Goals & Agenda"
                      : "Problem Statement / Discussion Goal"}
                  </label>
                  <SpeechDictationButton
                    onTranscript={(text) =>
                      setProblemStatement((prev) => (prev ? `${prev} ${text}` : text))
                    }
                    title="Dictate problem statement or goals"
                  />
                </div>
                <textarea
                  value={problemStatement}
                  onChange={(e) => setProblemStatement(e.target.value)}
                  placeholder={
                    recordType === "meeting"
                      ? "What is the meeting agenda, core dilemmas, or alignment objectives?"
                      : "What is the core problem to solve or key question to answer?"
                  }
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    {recordType === "meeting"
                      ? "Attendees & Meeting Notes"
                      : "Initial Context or Notes"}
                  </label>
                  <SpeechDictationButton
                    onTranscript={(text) =>
                      setDescription((prev) => (prev ? `${prev} ${text}` : text))
                    }
                    title="Dictate notes and context"
                  />
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    recordType === "meeting"
                      ? "Participants, pre-reads, constraints, or background notes..."
                      : "Additional background context, constraints, or stakeholders..."
                  }
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Reference Documents & File Upload Option */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Attach Reference Documents (optional)
                  </label>
                  <span className="text-[11px] text-slate-500">PDF, Audio, DOCX, TXT</span>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-3 bg-slate-50/70 hover:bg-slate-50 transition-colors cursor-pointer text-center"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md,.mp3,.wav,.m4a,.webm"
                  />
                  <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-medium">
                    <Paperclip className="w-4 h-4" />
                    <span>Click to attach files</span>
                    <span className="text-slate-400 font-normal">or drag & drop</span>
                  </div>
                </div>

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {selectedFiles.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate text-slate-800 font-medium">{f.name}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            ({(f.size / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(i)}
                          className="text-slate-400 hover:text-red-500 p-0.5 ml-2 transition-colors"
                          title="Remove file"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                    recordType === "meeting"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {isSubmitting
                      ? selectedFiles.length > 0
                        ? "Creating & Uploading..."
                        : "Creating..."
                      : recordType === "meeting"
                      ? "Create Meeting"
                      : "Create Decision"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
      )}
    </AppShell>
  );
}
