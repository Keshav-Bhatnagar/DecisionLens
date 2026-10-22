"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  getFolders,
  createFolder,
  deleteFolder,
  Folder,
  User,
  getMe,
} from "@/lib/api";
import {
  FolderPlus,
  Folder as FolderIcon,
  ChevronRight,
  Trash2,
  Layers,
  FileText,
  AlertCircle,
  Plus,
} from "lucide-react";

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#4F46E5");
  const [error, setError] = useState<string | null>(null);

  const colors = [
    { name: "Indigo", hex: "#4F46E5" },
    { name: "Emerald", hex: "#10B981" },
    { name: "Amber", hex: "#F59E0B" },
    { name: "Rose", hex: "#F43F5E" },
    { name: "Sky", hex: "#0EA5E9" },
    { name: "Violet", hex: "#8B5CF6" },
  ];

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getMe();
      setCurrentUser(user);
      const data = await getFolders();
      setFolders(data);
    } catch {
      setCurrentUser(null);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await createFolder({ name, description, color });
      setShowCreateModal(false);
      setName("");
      setDescription("");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const handleDeleteFolder = async (folderId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this folder and all its decisions?")) return;
    try {
      await deleteFolder(folderId);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar onUserChange={() => loadData()} />

      <main className="max-w-6xl mx-auto px-6 py-10">
        {!currentUser && !loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto shadow-sm my-12">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to DecisionLens</h2>
            <p className="text-sm text-slate-600 mb-6">
              Sign in to manage your private workspace, organize folders, and capture structured decisions.
            </p>
            <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
              💡 Click <strong>&quot;Sign In / Switch&quot;</strong> in the top-right corner to log in or use the 1-click test user buttons to test multi-tenancy.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Your Workspaces
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  Organize problem statements, meeting discussions, and strategic decisions into folders.
                </p>
              </div>

              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
            </div>

            {/* Folder Grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 h-44 animate-pulse" />
                ))}
              </div>
            ) : folders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <FolderIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800">No folders yet</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto mb-5">
                  Create your first folder to start grouping decisions and meeting discussions together.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Folder
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {folders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all p-6 flex flex-col justify-between relative overflow-hidden"
                  >
                    {/* Top color indicator accent */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ backgroundColor: folder.color || "#4F46E5" }}
                    />

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: folder.color || "#4F46E5" }}
                        >
                          <FolderIcon className="w-5 h-5 text-white" />
                        </div>
                        <button
                          onClick={(e) => handleDeleteFolder(folder.id, e)}
                          title="Delete folder"
                          className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {folder.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {folder.description || "No description provided."}
                      </p>
                    </div>

                    <div className="pt-6 border-t border-slate-100 flex items-center justify-between mt-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span>{folder.decision_count || 0} {folder.decision_count === 1 ? "record" : "records"}</span>
                      </div>
                      <span className="text-xs text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                        Open <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Create Folder Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <h3 className="text-lg font-semibold text-slate-900">Create New Folder</h3>
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

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Folder Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q4 Product Roadmap, Marketing Strategy"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional context for this folder"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Accent Color</label>
                <div className="flex items-center gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c.hex ? "scale-110 ring-2 ring-offset-2 ring-indigo-500" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
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
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
