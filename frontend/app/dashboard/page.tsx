"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import ModalPortal from "@/components/ModalPortal";
import {
  getFolders,
  getDecisions,
  createFolder,
  createDecision,
  Folder,
  Decision,
  User,
  getMe,
} from "@/lib/api";
import {
  Search,
  X,
  Plus,
  Compass,
  ArrowRight,
  Folder as FolderIcon,
  Layers,
} from "lucide-react";

function ActionParamWatcher({
  onOpenNewFolder,
  onOpenChallenge,
}: {
  onOpenNewFolder: () => void;
  onOpenChallenge: () => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams) return;
    const action = searchParams.get("action");
    const challenge = searchParams.get("challenge");
    if (action === "new-workspace") {
      onOpenNewFolder();
    } else if (action === "new" || challenge === "true") {
      onOpenChallenge();
    }
  }, [searchParams, onOpenNewFolder, onOpenChallenge]);

  return null;
}

export default function DashboardPage() {
  const router = useRouter();

  // Core Data
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);

  // Forms
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderDomain, setNewFolderDomain] = useState("AUTO");
  const [folderSubmitting, setFolderSubmitting] = useState(false);

  const [challengeTitle, setChallengeTitle] = useState("");
  const [challengeFolderId, setChallengeFolderId] = useState<number | "">("");
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getMe();
      setCurrentUser(user);
      if (user) {
        const [folderData, decisionData] = await Promise.all([
          getFolders().catch(() => []),
          getDecisions().catch(() => []),
        ]);
        setFolders(folderData);
        setDecisions(decisionData);
        if (folderData.length > 0 && challengeFolderId === "") {
          setChallengeFolderId(folderData[0].id);
        }
      } else {
        setFolders([]);
        setDecisions([]);
      }
    } catch {
      setCurrentUser(null);
      setFolders([]);
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }, [challengeFolderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Create Workspace
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setFolderSubmitting(true);
    setError(null);
    try {
      const created = await createFolder({
        name: newFolderName.trim(),
        description: newFolderDesc.trim(),
        domain: newFolderDomain !== "AUTO" ? newFolderDomain : undefined,
      });
      setShowCreateFolderModal(false);
      setNewFolderName("");
      setNewFolderDesc("");
      setNewFolderDomain("AUTO");
      await loadData();
      router.push(`/folders/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setFolderSubmitting(false);
    }
  };

  // Handle Create Decision (routes into workspace)
  const handleChallengeDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeTitle.trim()) return;
    setChallengeSubmitting(true);
    setError(null);
    try {
      let targetFolderId = challengeFolderId;
      if (!targetFolderId && folders.length > 0) {
        targetFolderId = folders[0].id;
      }
      if (!targetFolderId) {
        const defaultFolder = await createFolder({
          name: "General Decisions",
          description: "Default workspace",
        });
        targetFolderId = defaultFolder.id;
      }

      const created = await createDecision({
        folder_id: Number(targetFolderId),
        title: challengeTitle.trim(),
        problem_statement: challengeTitle.trim(),
        status: "evaluating",
        record_type: "decision",
      });

      setShowChallengeModal(false);
      setChallengeTitle("");
      await loadData();
      router.push(`/decisions/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create decision");
    } finally {
      setChallengeSubmitting(false);
    }
  };

  // Helper to resolve decision status
  const resolveStatus = (d: Decision): "UNDER_SCRUTINY" | "NEEDS_EVIDENCE" | "READY_TO_DECIDE" | "DECIDED" => {
    const rawGaps = d.gaps as { gaps?: unknown[] } | undefined;
    const gapCount = Array.isArray(rawGaps?.gaps) ? rawGaps.gaps.length : 0;
    if (d.status === "decided") return "DECIDED";
    if (d.status === "evaluating" && gapCount > 0) return "NEEDS_EVIDENCE";
    if (d.status === "evaluating") return "UNDER_SCRUTINY";
    if (d.status === "ready") return "READY_TO_DECIDE";
    return "UNDER_SCRUTINY";
  };

  // Metrics
  const activeFoldersCount = folders.length;
  const activeDecisionsCount = decisions.length;
  const underScrutinyCount = decisions.filter((d) => resolveStatus(d) === "UNDER_SCRUTINY").length;
  const decidedCount = decisions.filter((d) => resolveStatus(d) === "DECIDED").length;

  // Filtered workspaces
  const filteredFolders = useMemo(() => {
    return folders.filter((f) => {
      return (
        !searchQuery.trim() ||
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    });
  }, [folders, searchQuery]);

  return (
    <AppShell onRefresh={loadData}>
      <Suspense fallback={null}>
        <ActionParamWatcher
          onOpenNewFolder={() => setShowCreateFolderModal(true)}
          onOpenChallenge={() => setShowChallengeModal(true)}
        />
      </Suspense>

      {!currentUser && !loading ? (
        /* Unauthenticated State */
        <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm p-8 sm:p-12 text-center max-w-[620px] mx-auto my-12 transition-colors font-courier">
          <h2 className="font-newsreader text-[32px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1] mb-2 tracking-tight">
            Sign in
          </h2>
          <p className="text-[14px] text-[#4f4b40] dark:text-[#A89F91] leading-relaxed max-w-[460px] mx-auto mb-6">
            Sign in to access your workspaces and decisions.
          </p>
          <div>
            <Link
              href="/auth"
              className="inline-block px-6 py-2.5 bg-[#1d1d1b] hover:bg-transparent hover:text-[#1d1d1b] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-sm text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Sign in to DecisionLens
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10 font-courier text-[#1d1d1b] dark:text-[#F0EAE1]">
          {/* HEADER: Workspaces */}
          <div className="flex items-center justify-between border-b border-[#cfc7b2] dark:border-[#38332C] pb-4 transition-colors">
            <h1 className="font-newsreader text-[32px] sm:text-[38px] font-normal tracking-tight text-[#1d1d1b] dark:text-[#F0EAE1]">
              Workspaces
            </h1>

            <button
              type="button"
              onClick={() => setShowCreateFolderModal(true)}
              className="px-4 py-2 bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold font-courier uppercase tracking-wider rounded-sm transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[#EFEADF] dark:text-[#181614]" />
              <span>New Workspace</span>
            </button>
          </div>

          {/* STATS ROW: Editorial Ledger Box */}
          {activeFoldersCount > 0 && (
            <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] rounded-sm py-4 px-6 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#cfc7b2] dark:divide-[#38332C] transition-colors shadow-xs">
              <div className="py-2 sm:py-0 sm:px-4 first:pl-0">
                <div className="font-newsreader text-[32px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1] leading-tight">
                  {activeFoldersCount}
                </div>
                <div className="text-[11px] font-courier font-bold uppercase tracking-[0.1em] text-[#4f4b40] dark:text-[#A89F91] mt-0.5">
                  Workspaces
                </div>
              </div>

              <div className="py-2 sm:py-0 sm:px-4">
                <div className="font-newsreader text-[32px] font-normal text-[#2B4C8C] dark:text-[#D4AA50] leading-tight">
                  {activeDecisionsCount}
                </div>
                <div className="text-[11px] font-courier font-bold uppercase tracking-[0.1em] text-[#2B4C8C] dark:text-[#D4AA50] mt-0.5">
                  Total Decisions
                </div>
              </div>

              <div className="py-2 sm:py-0 sm:px-4">
                <div className="font-newsreader text-[32px] font-normal text-[#7a4e10] dark:text-[#e5a93c] leading-tight">
                  {underScrutinyCount}
                </div>
                <div className="text-[11px] font-courier font-bold uppercase tracking-[0.1em] text-[#7a4e10] dark:text-[#e5a93c] mt-0.5">
                  Under Scrutiny
                </div>
              </div>

              <div className="py-2 sm:py-0 sm:px-4 last:pr-0">
                <div className="font-newsreader text-[32px] font-normal text-[#1B4332] dark:text-[#52b788] leading-tight">
                  {decidedCount}
                </div>
                <div className="text-[11px] font-courier font-bold uppercase tracking-[0.1em] text-[#1B4332] dark:text-[#52b788] mt-0.5">
                  Decided
                </div>
              </div>
            </div>
          )}

          {/* SEARCH & WORKSPACES CATALOG */}
          {activeFoldersCount > 0 ? (
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-courier">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#7B8491] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search workspaces by name or description..."
                    className="w-full pl-9 pr-8 py-2 text-[13px] bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="text-xs text-[#4f4b40] dark:text-[#A89F91]">
                  Showing <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">{filteredFolders.length}</strong> of {folders.length} {folders.length === 1 ? "workspace" : "workspaces"}
                </div>
              </div>

              {/* Workspaces Grid */}
              {filteredFolders.length === 0 ? (
                <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-dashed border-[#cfc7b2] dark:border-[#38332C] rounded-sm p-8 text-center text-[#4f4b40] dark:text-[#A89F91] text-[13px] font-courier">
                  No workspaces match your search query &quot;{searchQuery}&quot;.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredFolders.map((f) => {
                    const workspaceDecisions = decisions.filter((d) => d.folder_id === f.id);
                    const count = workspaceDecisions.length;

                    return (
                      <Link
                        key={f.id}
                        href={`/folders/${f.id}`}
                        className="group bg-[#EDE7D6] dark:bg-[#221F1C] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] hover:border-[#2B4C8C] dark:hover:border-[#D4AA50] rounded-sm p-6 flex flex-col justify-between transition-all focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none shadow-xs hover:shadow-md"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1] group-hover:text-[#2B4C8C] dark:group-hover:text-[#D4AA50] transition-colors leading-tight">
                              {f.name}
                            </h2>
                            <span className="font-courier text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-sm bg-[#cfc7b2]/50 dark:bg-[#38332C]/60 text-[#7a4e10] dark:text-[#D4AA50] shrink-0 border border-[#cfc7b2] dark:border-[#38332C]">
                              {count} {count === 1 ? "DECISION" : "DECISIONS"}
                            </span>
                          </div>

                          <p className="text-[13px] font-courier text-[#4f4b40] dark:text-[#A89F91] line-clamp-2 leading-relaxed">
                            {f.description || "Workspace for strategic decisions."}
                          </p>

                          {/* Preview of decisions inside this workspace */}
                          {workspaceDecisions.length > 0 ? (
                            <div className="pt-3 border-t border-[#cfc7b2]/70 dark:border-[#38332C]/70 space-y-1.5">
                              <span className="text-[10px] font-courier font-bold uppercase tracking-[0.08em] text-[#4f4b40] dark:text-[#A89F91] block">
                                Recent decisions:
                              </span>
                              {workspaceDecisions.slice(0, 3).map((d) => (
                                <div
                                  key={d.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    router.push(`/decisions/${d.id}`);
                                  }}
                                  className="flex items-center justify-between text-xs font-courier text-[#1d1d1b] dark:text-[#F0EAE1] truncate hover:text-[#2B4C8C] dark:hover:text-[#D4AA50] transition-colors py-0.5 cursor-pointer group/item"
                                  title={`Open decision: ${d.title}`}
                                >
                                  <span className="truncate pr-2 group-hover/item:underline">• {d.title}</span>
                                  <span
                                    className={`text-[9px] uppercase px-1.5 py-0.2 rounded-xs font-bold shrink-0 ${
                                      d.status === "decided"
                                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-950/40"
                                        : "text-[#7a4e10] dark:text-[#D4AA50]"
                                    }`}
                                  >
                                    {d.status === "draft" ? "needs evidence" : d.status || "scrutiny"}
                                  </span>
                                </div>
                              ))}
                              {workspaceDecisions.length > 3 && (
                                <span className="text-[10px] font-courier text-[#7B8491] block pt-0.5">
                                  + {workspaceDecisions.length - 3} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="pt-3 border-t border-[#cfc7b2]/70 dark:border-[#38332C]/70 text-[11px] font-courier text-[#7B8491] italic">
                              No decisions recorded yet
                            </div>
                          )}
                        </div>

                        <div className="pt-4 mt-4 border-t border-[#cfc7b2] dark:border-[#38332C] text-[12px] font-courier text-[#2B4C8C] dark:text-[#D4AA50] font-bold flex items-center justify-between">
                          <span>Open workspace</span>
                          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Empty State: Prompt to create first workspace */
            <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-dashed border-[#cfc7b2] dark:border-[#38332C] rounded-sm p-12 text-center max-w-[640px] mx-auto my-8 font-courier transition-colors">
              <Compass className="w-12 h-12 text-[#7B8491] mx-auto mb-3" />
              <h2 className="font-newsreader text-3xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1] mb-2">
                No workspaces yet
              </h2>
              <p className="text-xs font-courier text-[#4f4b40] dark:text-[#A89F91] max-w-md mx-auto mb-6 leading-relaxed">
                Create a workspace to start organizing and evaluating your strategic decisions.
              </p>
              <button
                onClick={() => setShowCreateFolderModal(true)}
                className="px-6 py-3 bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-sm text-xs font-bold font-courier uppercase tracking-wider transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1.5" />
                <span>Create Workspace</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE WORKSPACE */}
      {showCreateFolderModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-courier">
            <div className="bg-[#EDE7D6] dark:bg-[#221F1C] rounded-sm border-2 border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] max-w-md w-full p-6 relative shadow-2xl text-[#1d1d1b] dark:text-[#F0EAE1]">
              <div className="flex items-center justify-between pb-3 border-b border-[#cfc7b2] dark:border-[#38332C] mb-4">
                <h3 className="font-newsreader text-[22px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                  New Workspace
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] p-1 rounded-[2px]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="mb-3 p-2.5 rounded-sm bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-courier">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateFolder} className="space-y-4 font-courier text-xs sm:text-[13px]">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Workspace name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. Infrastructure, Leadership, Product Strategy"
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Decision Domain / Focus
                  </label>
                  <select
                    value={newFolderDomain}
                    onChange={(e) => setNewFolderDomain(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="AUTO">⚡ Auto-Detect from Content (Recommended)</option>
                    <option value="SOFTWARE">💻 Software Engineering & Cloud Infrastructure</option>
                    <option value="BUSINESS">🏢 Enterprise Strategy & Corporate Deliberation</option>
                    <option value="PRODUCT">🚀 Product Strategy & Growth Experiments</option>
                    <option value="FINANCE">📈 Finance, Capital Allocation & Treasury</option>
                    <option value="REAL_ESTATE">🏛️ Real Estate, Land & Property Acquisition</option>
                    <option value="CAREER">👔 Executive Career & Leadership Hiring</option>
                    <option value="OPERATIONS">📦 Operations, Logistics & Supply Chain</option>
                    <option value="EDUCATION">🎓 Education & Academic Research</option>
                    <option value="PERSONAL">🌱 Personal Life & Habit Changes</option>
                  </select>
                  <p className="text-[11px] text-[#7B8491] dark:text-[#A89F91] mt-1 font-courier">
                    Pre-calibrates evaluation criteria and prevents technical jargon ambiguity across deliberations.
                  </p>
                </div>

                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={newFolderDesc}
                    onChange={(e) => setNewFolderDesc(e.target.value)}
                    placeholder="Brief description (optional)..."
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#cfc7b2] dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={() => setShowCreateFolderModal(false)}
                    className="px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] rounded-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={folderSubmitting}
                    className="px-5 py-2.5 bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[12px] font-bold font-courier uppercase tracking-wider rounded-sm transition-colors disabled:opacity-50"
                  >
                    {folderSubmitting ? "Creating..." : "Create workspace"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MODAL: CHALLENGE A DECISION (Target workspace selector) */}
      {showChallengeModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-courier">
            <div className="bg-[#EDE7D6] dark:bg-[#221F1C] rounded-sm border-2 border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] max-w-md w-full p-6 relative shadow-2xl text-[#1d1d1b] dark:text-[#F0EAE1]">
              <div className="flex items-center justify-between pb-3 border-b border-[#cfc7b2] dark:border-[#38332C] mb-4">
                <div>
                  <span className="font-courier text-[10px] tracking-[0.14em] font-bold text-[#2B4C8C] dark:text-[#D4AA50] uppercase block">
                    NEW DECISION SCRUTINY
                  </span>
                  <h3 className="font-newsreader text-[22px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                    Challenge a decision
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChallengeModal(false)}
                  className="text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] p-1 rounded-[2px]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="mb-3 p-2.5 rounded-sm bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-courier">
                  {error}
                </div>
              )}

              <form onSubmit={handleChallengeDecision} className="space-y-4 font-courier text-xs sm:text-[13px]">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Select Target Workspace <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={challengeFolderId}
                    onChange={(e) => setChallengeFolderId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors font-courier"
                  >
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                    {folders.length === 0 && (
                      <option value="">General Decisions (created automatically)</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    What decision are you weighing? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    autoFocus
                    required
                    rows={3}
                    value={challengeTitle}
                    onChange={(e) => setChallengeTitle(e.target.value)}
                    placeholder="e.g. Choose between Kubernetes vs Cloud Run for multi-region scale"
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors font-courier"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#cfc7b2] dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={() => setShowChallengeModal(false)}
                    className="px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] rounded-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={challengeSubmitting}
                    className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider rounded-sm transition-colors disabled:opacity-50 font-courier bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64]"
                  >
                    {challengeSubmitting ? "Starting Scrutiny..." : "Challenge Decision →"}
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
