"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import SpeechDictationButton from "@/components/SpeechDictationButton";
import ModalPortal from "@/components/ModalPortal";
import {
  LayoutDashboard,
  FileText,
  User as UserIcon,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Folder as FolderIcon,
  LogOut,
  LogIn,
  X,
  Menu,
  Users,
  Compass,
} from "lucide-react";
import {
  getFolders,
  getDecisions,
  createFolder,
  createDecision,
  getMe,
  clearStoredToken,
  Folder,
  Decision,
  User,
} from "@/lib/api";

export function formatDisplayName(name?: string | null, email?: string): string {
  if (!name && !email) return "User";
  const raw = name && name.trim() ? name.trim() : (email?.split("@")[0] || "User");
  return raw.replace(/\s*\([^)]*\)$/, "").trim();
}

interface SidebarProps {
  activeFolderId?: number;
  activeDecisionId?: number;
  onRefresh?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  showMobileHeader?: boolean;
}

export default function Sidebar({
  activeFolderId,
  activeDecisionId,
  onRefresh,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  mobileOpen: controlledMobileOpen,
  onCloseMobile,
  showMobileHeader = true,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  // Collapse / mobile state
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const mobileOpen = controlledMobileOpen !== undefined ? controlledMobileOpen : internalMobileOpen;
  // On mobile (when drawer is open), always display fully expanded view.
  // On desktop, follow the collapsed state.
  const isExpanded = !collapsed || mobileOpen;

  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showNewDecisionModal, setShowNewDecisionModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newDecisionTitle, setNewDecisionTitle] = useState("");
  const [newDecisionFolderId, setNewDecisionFolderId] = useState<number | "">("");
  const [newRecordType, setNewRecordType] = useState<"decision" | "meeting">("decision");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    if (controlledCollapsed === undefined) {
      try {
        const saved = localStorage.getItem("decisionlens_sidebar_collapsed");
        if (saved !== null) {
          setInternalCollapsed(saved === "true");
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [controlledCollapsed]);

  const toggleCollapsed = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      const next = !internalCollapsed;
      setInternalCollapsed(next);
      try {
        localStorage.setItem("decisionlens_sidebar_collapsed", String(next));
      } catch {
        // Ignore
      }
    }
  };

  const onCloseMobileRef = useRef(onCloseMobile);
  onCloseMobileRef.current = onCloseMobile;

  const closeMobile = useCallback(() => {
    if (onCloseMobileRef.current) {
      onCloseMobileRef.current();
    } else {
      setInternalMobileOpen(false);
    }
  }, []);

  // Lock body scroll and listen for Escape key when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeMobile();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [mobileOpen, closeMobile]);

  const loadSidebarData = useCallback(async () => {
    try {
      const u = await getMe();
      setUser(u);
      if (u) {
        const [folderList, decisionList] = await Promise.all([
          getFolders().catch(() => []),
          getDecisions().catch(() => []),
        ]);
        setFolders(folderList);
        setDecisions(decisionList);
        if (folderList.length > 0 && newDecisionFolderId === "") {
          setNewDecisionFolderId(folderList[0].id);
        }
      } else {
        setFolders([]);
        setDecisions([]);
      }
    } catch {
      setUser(null);
      setFolders([]);
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }, [newDecisionFolderId]);

  useEffect(() => {
    loadSidebarData();
  }, [loadSidebarData]);

  const handleLogout = () => {
    closeMobile();
    clearStoredToken();
    setUser(null);
    router.push("/auth");
  };

  // Filtered lists
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    return folders.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [folders, searchQuery]);

  const recentDecisions = useMemo(() => {
    const sorted = [...decisions].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    if (!searchQuery.trim()) return sorted.slice(0, 5);
    return sorted
      .filter((d) => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 5);
  }, [decisions, searchQuery]);

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const created = await createFolder({
        name: newFolderName.trim(),
        description: newFolderDesc.trim(),
      });
      setShowNewFolderModal(false);
      setNewFolderName("");
      setNewFolderDesc("");
      await loadSidebarData();
      onRefresh?.();
      router.push(`/folders/${created.id}`);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNewDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDecisionTitle.trim()) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      let targetFolderId = newDecisionFolderId;
      if (!targetFolderId && folders.length > 0) {
        targetFolderId = folders[0].id;
      }
      if (!targetFolderId) {
        const defaultFolder = await createFolder({
          name: "General Decisions",
          description: "Primary workspace",
        });
        targetFolderId = defaultFolder.id;
      }

      const created = await createDecision({
        folder_id: Number(targetFolderId),
        title: newDecisionTitle.trim(),
        status: "evaluating",
        record_type: newRecordType,
      });

      setShowNewDecisionModal(false);
      setNewDecisionTitle("");
      await loadSidebarData();
      onRefresh?.();
      router.push(`/decisions/${created.id}`);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : `Failed to create ${newRecordType}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container: 280px drawer on mobile, 240px (or 64px collapsed) on desktop */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-[#EFEADF] border-r border-[#D9D2C3] text-[#161E33] transition-transform lg:transition-all duration-200 ease-in-out font-ui shadow-2xl lg:shadow-none w-[280px] max-w-[85vw] ${
          collapsed ? "lg:w-16" : "lg:w-[240px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Header: Logo + Name + Actions */}
        <div className="h-14 px-4 border-b border-[#D9D2C3] flex items-center justify-between shrink-0">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="flex items-center gap-2.5 overflow-hidden group"
          >
            <div className="w-6 h-6 rounded-[4px] bg-[#161E33] text-white flex items-center justify-center font-semibold text-xs shrink-0">
              DL
            </div>
            {isExpanded && (
              <span className="font-medium text-[15px] tracking-tight text-[#161E33]">
                DecisionLens
              </span>
            )}
          </Link>

          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-[4px] text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/40 transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={closeMobile}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-[4px] text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/50 active:scale-95 transition-all"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Buttons: Split Decision and Meeting buttons */}
        <div className="p-3 border-b border-[#D9D2C3]">
          {!isExpanded ? (
            <div className="flex flex-col gap-1.5 items-center">
              <button
                type="button"
                onClick={() => {
                  setNewRecordType("decision");
                  setShowNewDecisionModal(true);
                }}
                className="w-10 h-10 rounded-[4px] bg-[#FCFBF8] border border-[#161E33] hover:bg-[#F5F1E8] text-[#161E33] flex items-center justify-center transition-colors focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
                title="New Decision"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewRecordType("meeting");
                  setShowNewDecisionModal(true);
                }}
                className="w-10 h-10 rounded-[4px] bg-[#FCFBF8] border border-[#2D6A4F] hover:bg-[#E8F3EE] text-[#1B4332] flex items-center justify-center transition-colors focus:ring-2 focus:ring-[#2D6A4F]/25 focus:outline-none"
                title="New Meeting"
              >
                <Users className="w-4 h-4 text-[#2D6A4F]" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const defaultTitle = `Discussion ${recentDecisions.filter((d) => d.record_type !== "meeting").length + 1}`;
                  setNewRecordType("decision");
                  setNewDecisionTitle(defaultTitle);
                  setShowNewDecisionModal(true);
                  closeMobile();
                }}
                className="w-full py-2 px-2 rounded-[4px] bg-[#FCFBF8] border border-[#161E33] hover:bg-[#F5F1E8] text-[#161E33] font-medium text-[12px] flex items-center justify-center gap-1.5 transition-colors focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none shadow-2xs"
                title="Start Decision Analysis"
              >
                <Plus className="w-3.5 h-3.5 text-[#2F5D8F]" />
                <span>Decision</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaultTitle = `Meeting ${recentDecisions.filter((d) => d.record_type === "meeting").length + 1}`;
                  setNewRecordType("meeting");
                  setNewDecisionTitle(defaultTitle);
                  setShowNewDecisionModal(true);
                  closeMobile();
                }}
                className="w-full py-2 px-2 rounded-[4px] bg-[#FCFBF8] border border-[#2D6A4F] hover:bg-[#E8F3EE] text-[#1B4332] font-medium text-[12px] flex items-center justify-center gap-1.5 transition-colors focus:ring-2 focus:ring-[#2D6A4F]/25 focus:outline-none shadow-2xs"
                title="Record Meeting Discussion"
              >
                <Users className="w-3.5 h-3.5 text-[#2D6A4F]" />
                <span>Meeting</span>
              </button>
            </div>
          )}
        </div>

        {/* Search input (expanded only) */}
        {isExpanded && (
          <div className="px-3 pt-3 pb-1 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B909C]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[13px] text-[#161E33] placeholder-[#8B909C] pl-8 pr-2.5 py-1.5 focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
              />
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
          {/* Main Nav (Dashboard, Decision ledger, Profile & settings) */}
          <nav className="space-y-0.5">
            <Link
              href="/dashboard"
              onClick={closeMobile}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${
                pathname === "/dashboard" && !pathname.includes("ledger")
                  ? "text-[#2F5D8F] font-medium bg-[#2F5D8F]/[0.08]"
                  : "text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/40"
              }`}
              title="Dashboard"
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${
                pathname === "/dashboard" && !pathname.includes("ledger") ? "text-[#2F5D8F]" : "text-[#5A6275]"
              }`} />
              {isExpanded && <span>Dashboard</span>}
            </Link>

            <Link
              href="/dashboard?view=ledger"
              onClick={closeMobile}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${
                pathname === "/dashboard" && pathname.includes("ledger")
                  ? "text-[#2F5D8F] font-medium bg-[#2F5D8F]/[0.08]"
                  : "text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/40"
              }`}
              title="Decision ledger"
            >
              <FileText className={`w-4 h-4 shrink-0 ${
                pathname === "/dashboard" && pathname.includes("ledger") ? "text-[#2F5D8F]" : "text-[#5A6275]"
              }`} />
              {isExpanded && <span>Decision ledger</span>}
            </Link>

            <Link
              href="/profile"
              onClick={closeMobile}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${
                pathname === "/profile"
                  ? "text-[#2F5D8F] font-medium bg-[#2F5D8F]/[0.08]"
                  : "text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/40"
              }`}
              title="Profile & settings"
            >
              <UserIcon className={`w-4 h-4 shrink-0 ${
                pathname === "/profile" ? "text-[#2F5D8F]" : "text-[#5A6275]"
              }`} />
              {isExpanded && <span>Profile &amp; settings</span>}
            </Link>
          </nav>

          {/* Workspaces Section */}
          <div className="space-y-1">
            {isExpanded ? (
              <div className="flex items-center justify-between px-2.5 mb-1">
                <span className="font-courier text-[11px] font-medium text-[#5A6275] uppercase tracking-[0.08em]">
                  Workspaces
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewFolderModal(true);
                    closeMobile();
                  }}
                  className="p-1 rounded-[2px] text-[#8B909C] hover:text-[#161E33] transition-colors"
                  title="New workspace"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex justify-center my-1">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(true)}
                  className="p-1 rounded-[4px] text-[#5A6275] hover:text-[#161E33]"
                  title="Workspaces"
                >
                  <FolderIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {isExpanded && (
              <div className="space-y-0.5">
                {filteredFolders.length === 0 ? (
                  <p className="text-[12px] text-[#8B909C] px-2.5 py-1">
                    No workspaces yet
                  </p>
                ) : (
                  filteredFolders.map((f) => {
                    const isActive =
                      activeFolderId === f.id || pathname === `/folders/${f.id}`;
                    return (
                      <Link
                        key={f.id}
                        href={`/folders/${f.id}`}
                        onClick={closeMobile}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${
                          isActive
                            ? "text-[#2F5D8F] font-medium bg-[#2F5D8F]/[0.08]"
                            : "text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/40"
                        }`}
                      >
                        <FolderIcon className="w-3.5 h-3.5 shrink-0 text-[#8B909C]" />
                        <span className="truncate">{f.name}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Recent Records Section */}
          <div className="space-y-1">
            {isExpanded && (
              <div className="px-2.5 mb-1">
                <span className="font-courier text-[11px] font-medium text-[#5A6275] uppercase tracking-[0.08em]">
                  Recent records
                </span>
              </div>
            )}

            {isExpanded && (
              <div className="space-y-0.5">
                {recentDecisions.length === 0 ? (
                  <p className="text-[12px] text-[#8B909C] px-2.5 py-1">
                    No recent records
                  </p>
                ) : (
                  recentDecisions.map((d) => {
                    const isActive =
                      activeDecisionId === d.id || pathname === `/decisions/${d.id}`;
                    const isMeeting = d.record_type === "meeting";
                    return (
                      <Link
                        key={d.id}
                        href={`/decisions/${d.id}`}
                        onClick={closeMobile}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-[13px] transition-colors ${
                          isActive
                            ? isMeeting
                              ? "text-[#1B4332] font-medium bg-[#2D6A4F]/[0.08]"
                              : "text-[#2F5D8F] font-medium bg-[#2F5D8F]/[0.08]"
                            : "text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/40"
                        }`}
                        title={d.title}
                      >
                        <span
                          className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold shrink-0 ${
                            isMeeting
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300/60"
                              : "bg-[#2F5D8F]/10 text-[#2F5D8F] border border-[#2F5D8F]/20"
                          }`}
                        >
                          {isMeeting ? "MTG" : "DEC"}
                        </span>
                        <span className="truncate flex-1">{d.title}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* User's name/email row at the bottom with avatar and quiet logout icon */}
        <div className="p-3 border-t border-[#D9D2C3] bg-[#EFEADF] shrink-0">
          {user ? (
            <div className="flex items-center justify-between gap-2">
              <Link
                href="/profile"
                onClick={closeMobile}
                className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-85 transition-opacity"
                title="Profile & settings"
              >
                <div className="w-7 h-7 rounded-full bg-[#FCFBF8] border border-[#D9D2C3] text-[#161E33] font-medium text-xs flex items-center justify-center shrink-0">
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    (user.display_name || user.email).charAt(0).toUpperCase()
                  )}
                </div>
                {isExpanded && (
                  <div className="min-w-0 text-left">
                    <p className="text-[13px] font-medium text-[#161E33] truncate leading-tight block">
                      {formatDisplayName(user.display_name, user.email)}
                    </p>
                    <p className="text-[12px] text-[#8B909C] truncate leading-tight mt-0.5 block">
                      {user.email}
                    </p>
                  </div>
                )}
              </Link>
              {isExpanded && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-1.5 text-[#8B909C] hover:text-[#161E33] rounded-[4px] transition-colors shrink-0"
                  title="Log out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            isExpanded && (
              <Link
                href="/auth"
                onClick={closeMobile}
                className="w-full py-1.5 px-3 rounded-[4px] border border-[#161E33] bg-[#FCFBF8] hover:bg-[#F5F1E8] text-[13px] font-medium text-[#161E33] transition-colors flex items-center justify-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5 text-[#5A6275]" />
                <span>Sign in</span>
              </Link>
            )
          )}
        </div>
      </aside>

      {/* Modal: New Workspace */}
      {showNewFolderModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-ui">
            <div className="bg-[#FCFBF8] rounded-[4px] border border-[#D9D2C3] max-w-md w-full p-6 relative shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9D2C3] mb-4">
              <h3 className="text-[17px] font-medium text-[#161E33]">
                New workspace
              </h3>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="text-[#8B909C] hover:text-[#161E33] p-1 rounded-[2px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="mb-3 p-2.5 rounded-[4px] bg-red-50 border border-red-200 text-red-700 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateNewFolder} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#161E33] mb-1">
                  Workspace name
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Strategic Growth, Product Strategy"
                  className="w-full px-3 py-2 text-[13px] bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[#161E33] placeholder-[#8B909C] focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#161E33] mb-1">
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={newFolderDesc}
                  onChange={(e) => setNewFolderDesc(e.target.value)}
                  placeholder="Context or domain notes..."
                  className="w-full px-3 py-2 text-[13px] bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[#161E33] placeholder-[#8B909C] focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#D9D2C3]">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-3 py-1.5 text-[13px] font-medium text-[#5A6275] hover:text-[#161E33] rounded-[4px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#161E33] hover:bg-[#232C47] text-white text-[13px] font-medium rounded-[4px] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
      )}

      {/* Modal: New Decision or Meeting */}
      {showNewDecisionModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-ui">
            <div className="bg-[#FCFBF8] rounded-[4px] border border-[#D9D2C3] max-w-md w-full p-6 relative shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9D2C3] mb-4">
              <h3 className="text-[17px] font-medium text-[#161E33]">
                {newRecordType === "meeting" ? "Record new meeting" : "New decision analysis"}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewDecisionModal(false)}
                className="text-[#8B909C] hover:text-[#161E33] p-1 rounded-[2px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Type selector toggle */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#EFEADF] rounded-[4px] mb-4">
              <button
                type="button"
                onClick={() => {
                  setNewRecordType("decision");
                  if (!newDecisionTitle.trim() || newDecisionTitle.startsWith("Meeting") || newDecisionTitle.startsWith("Discussion")) {
                    setNewDecisionTitle(`Discussion ${recentDecisions.filter((d) => d.record_type !== "meeting").length + 1}`);
                  }
                }}
                className={`py-1.5 px-3 rounded-[3px] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  newRecordType === "decision"
                    ? "bg-[#FCFBF8] text-[#161E33] shadow-2xs font-semibold"
                    : "text-[#5A6275] hover:text-[#161E33]"
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-[#2F5D8F]" />
                <span>Decision</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewRecordType("meeting");
                  if (!newDecisionTitle.trim() || newDecisionTitle.startsWith("Meeting") || newDecisionTitle.startsWith("Discussion")) {
                    setNewDecisionTitle(`Meeting ${recentDecisions.filter((d) => d.record_type === "meeting").length + 1}`);
                  }
                }}
                className={`py-1.5 px-3 rounded-[3px] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  newRecordType === "meeting"
                    ? "bg-[#FCFBF8] text-[#1B4332] shadow-2xs font-semibold"
                    : "text-[#5A6275] hover:text-[#161E33]"
                }`}
              >
                <Users className="w-3.5 h-3.5 text-[#2D6A4F]" />
                <span>Meeting</span>
              </button>
            </div>

            {modalError && (
              <div className="mb-3 p-2.5 rounded-[4px] bg-red-50 border border-red-200 text-red-700 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateNewDecision} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#161E33] mb-1">
                  Workspace
                </label>
                <select
                  value={newDecisionFolderId}
                  onChange={(e) => setNewDecisionFolderId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-[13px] bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[#161E33] focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[13px] font-medium text-[#161E33]">
                    {newRecordType === "meeting" ? "Meeting title or subject" : "What decision are you weighing?"}
                  </label>
                  <SpeechDictationButton
                    onTranscript={(text) =>
                      setNewDecisionTitle((prev) => (prev ? `${prev} ${text}` : text))
                    }
                    title="Dictate title"
                  />
                </div>
                <textarea
                  rows={3}
                  required
                  value={newDecisionTitle}
                  onChange={(e) => setNewDecisionTitle(e.target.value)}
                  placeholder={
                    newRecordType === "meeting"
                      ? "e.g. Weekly Strategy Sync, Vendor Evaluation Call"
                      : "e.g. Choose between Kubernetes vs Cloud Run for multi-region scale"
                  }
                  className="w-full px-3 py-2 text-[13px] bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[#161E33] placeholder-[#8B909C] focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#D9D2C3]">
                <button
                  type="button"
                  onClick={() => setShowNewDecisionModal(false)}
                  className="px-3 py-1.5 text-[13px] font-medium text-[#5A6275] hover:text-[#161E33] rounded-[4px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-4 py-1.5 text-white text-[13px] font-medium rounded-[4px] transition-colors disabled:opacity-50 ${
                    newRecordType === "meeting"
                      ? "bg-[#1B4332] hover:bg-[#2D6A4F]"
                      : "bg-[#161E33] hover:bg-[#232C47]"
                  }`}
                >
                  {isSubmitting
                    ? "Creating..."
                    : newRecordType === "meeting"
                    ? "Record meeting"
                    : "Start decision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
      )}
    </>
  );
}
