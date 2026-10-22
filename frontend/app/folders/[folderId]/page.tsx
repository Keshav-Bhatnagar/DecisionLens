"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import {
  getFolder,
  getDecisions,
  createDecision,
  deleteDecision,
  deleteFolder,
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
    try {
      await createDecision({
        folder_id: folderId,
        title,
        problem_statement: problemStatement,
        description,
        record_type: recordType,
        status,
      });
      setShowCreateModal(false);
      setTitle("");
      setProblemStatement("");
      setDescription("");
      await loadFolderData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create decision");
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
    <div className="min-h-screen bg-slate-50">
      <Navbar onUserChange={() => loadFolderData()} />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-6">
          <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">
            Workspaces
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-semibold">{folder?.name || "Folder"}</span>
        </div>

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

                <div className="flex items-center gap-2 self-start">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Record
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
                    className="group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${decision.record_type === "meeting"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            }`}
                        >
                          {decision.record_type === "meeting" ? "Meeting Record" : "Decision"}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {decision.status}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(decision.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {decision.title}
                      </h3>

                      {decision.problem_statement && (
                        <p className="text-xs text-slate-600 line-clamp-2">
                          <strong className="text-slate-800">Problem:</strong> {decision.problem_statement}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <button
                        onClick={(e) => handleDeleteDecision(decision.id, e)}
                        title="Delete decision"
                        className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"
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
      </main>

      {/* Create Decision/Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <h3 className="text-lg font-semibold text-slate-900">
                New Record in &quot;{folder?.name}&quot;
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
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
                    onClick={() => setRecordType("decision")}
                    className={`p-3 rounded-xl border text-left transition-all ${recordType === "decision"
                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600"
                        : "border-slate-200 hover:border-slate-300 text-slate-700"
                      }`}
                  >
                    <Compass className="w-4 h-4 mb-1 text-indigo-600" />
                    <p className="text-xs font-bold">Decision Analysis</p>
                    <p className="text-[10px] text-slate-500">Problem statement, tradeoffs, matrix</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordType("meeting")}
                    className={`p-3 rounded-xl border text-left transition-all ${recordType === "meeting"
                        ? "border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-1 ring-emerald-600"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Choose Database Architecture, Cloud Migration Strategy"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Problem Statement / Discussion Goal
                </label>
                <textarea
                  value={problemStatement}
                  onChange={(e) => setProblemStatement(e.target.value)}
                  placeholder="What is the core problem to solve or key question to answer?"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Context or Notes
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional background context, constraints, or stakeholders"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
                >
                  Create Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
