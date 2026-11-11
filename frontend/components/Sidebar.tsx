"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import SpeechDictationButton from "@/components/SpeechDictationButton";
import ModalPortal from "@/components/ModalPortal";
import BrandLogo from "@/components/BrandLogo";
import { DecisionLensIcon } from "@/components/DecisionLensLogo";
import { useTheme } from "@/context/ThemeContext";
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
  Users,
  Compass,
  Video,
  Sparkles,
  Briefcase,
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
import { formatDisplayName as formatDisplayNameLib } from "@/lib/userDisplay";

export function formatDisplayName(name?: string | null, email?: string): string {
  return formatDisplayNameLib(name, email);
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
  const { theme } = useTheme();

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
  const isExpanded = !collapsed || mobileOpen;

  // New folder modal state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderDomain, setNewFolderDomain] = useState("AUTO");

  // New decision/meeting modal state
  const [showNewDecisionModal, setShowNewDecisionModal] = useState(false);
  const [newDecisionTitle, setNewDecisionTitle] = useState("");
  const [newDecisionFolderId, setNewDecisionFolderId] = useState<number | "">("");
  const [newRecordType, setNewRecordType] = useState<"decision" | "meeting">("decision");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadSidebarData = useCallback(async () => {
    try {
      const currentUser = await getMe();
      setUser(currentUser);
      if (currentUser) {
        const [folderData, decisionData] = await Promise.all([
          getFolders().catch(() => []),
          getDecisions().catch(() => []),
        ]);
        setFolders(folderData);
        setDecisions(decisionData);
        if (folderData.length > 0 && newDecisionFolderId === "") {
          setNewDecisionFolderId(folderData[0].id);
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

  const toggleCollapsed = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const closeMobile = useCallback(() => {
    if (onCloseMobile) {
      onCloseMobile();
    } else {
      setInternalMobileOpen(false);
    }
  }, [onCloseMobile]);

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
    setFolders([]);
    setDecisions([]);
    closeMobile();
    onRefresh?.();
    router.push("/auth");
  };

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    return folders.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [folders, searchQuery]);

  const recentDecisions = useMemo(() => {
    return [...decisions].slice(0, 8);
  }, [decisions]);

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const created = await createFolder({
        name: newFolderName.trim(),
        description: newFolderDesc.trim(),
        domain: newFolderDomain !== "AUTO" ? newFolderDomain : undefined,
      });
      setShowNewFolderModal(false);
      setNewFolderName("");
      setNewFolderDesc("");
      setNewFolderDomain("AUTO");
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
          description: "Default workspace",
        });
        targetFolderId = defaultFolder.id;
      }

      const created = await createDecision({
        folder_id: Number(targetFolderId),
        title: newDecisionTitle.trim(),
        problem_statement: newDecisionTitle.trim(),
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
          className="lg:hidden fixed inset-0 z-[75] bg-black/50 backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container: 280px drawer on mobile, 260px (or 64px collapsed) on desktop */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-[80] flex flex-col bg-[#E5DEC9] dark:bg-[#1C1917] border-r border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] transition-transform lg:transition-all duration-200 ease-in-out font-sans shadow-2xl lg:shadow-none w-[280px] max-w-[85vw] ${
          collapsed ? "lg:w-16" : "lg:w-[260px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Header: Antique Magnifying Lens Logo + Actions */}
        <div className={`h-14 border-b border-[#cfc7b2] dark:border-[#38332C] flex items-center shrink-0 bg-[#E5DEC9] dark:bg-[#1C1917] transition-all relative ${
          collapsed ? "px-0 justify-center" : "px-4 justify-between"
        }`}>
          {collapsed ? (
            <div className="flex items-center justify-center w-full relative">
              <Link
                href="/dashboard"
                className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C]/40 transition-colors"
                title="DecisionLens - Home"
                aria-label="DecisionLens Home"
              >
                <DecisionLensIcon size={34} />
              </Link>

              {/* Desktop Floating Edge Collapse Toggle */}
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden lg:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#E5DEC9] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:scale-110 shadow-sm z-30 transition-all cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 overflow-hidden">
                <BrandLogo
                  href="/dashboard"
                  theme={theme}
                  showWordmark={true}
                  iconSizeClass="w-9 h-9"
                />
              </div>

              {/* Desktop collapse toggle */}
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/60 transition-colors cursor-pointer"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Mobile close button */}
          <button
            type="button"
            onClick={closeMobile}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/50 active:scale-95 transition-all cursor-pointer"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Button: Single Primary Action */}
        <div className="p-3 border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#E5DEC9] dark:bg-[#1C1917]">
          {!isExpanded ? (
            <button
              type="button"
              onClick={() => {
                const count = decisions.length;
                setNewDecisionTitle(`Decision ${count + 1}`);
                setShowNewDecisionModal(true);
              }}
              className="w-10 h-10 rounded-xl bg-[#1d1d1b] hover:bg-[#2C2723] text-[#F4F0E6] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] border border-[#1d1d1b] dark:border-[#D4AA50] flex items-center justify-center transition-all shadow-sm mx-auto cursor-pointer"
              title="New Decision"
            >
              <Plus className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const count = decisions.length;
                setNewDecisionTitle(`Decision ${count + 1}`);
                setShowNewDecisionModal(true);
                closeMobile();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1d1d1b] hover:bg-[#2C2723] text-[#F4F0E6] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] border border-[#1d1d1b] dark:border-[#D4AA50] font-sans font-semibold text-[14px] flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              title="Challenge a new decision"
            >
              <Plus className="w-4 h-4" />
              <span>New Decision</span>
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
          {/* Main Nav (Portfolio / Workspaces / Executive Folio) */}
          <nav className="space-y-1">
            <Link
              href="/portfolio"
              onClick={closeMobile}
              className={`flex items-center ${isExpanded ? "gap-3 px-3" : "justify-center px-0"} py-2.5 rounded-xl text-[15px] font-medium transition-all ${
                pathname === "/portfolio" || pathname === "/overview"
                  ? "text-[#1d1d1b] dark:text-[#D4AA50] font-bold bg-[#cfc7b2]/70 dark:bg-[#D4AA50]/15 border-l-3 border-l-[#7a4e10] dark:border-l-[#D4AA50] shadow-2xs"
                  : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C]/40"
              }`}
              title="Decision Portfolio & Executive Briefing"
            >
              <Briefcase className={`w-[18px] h-[18px] shrink-0 ${
                pathname === "/portfolio" || pathname === "/overview" ? "text-[#7a4e10] dark:text-[#D4AA50]" : "text-[#7B8491]"
              }`} />
              {isExpanded && <span>Portfolio</span>}
            </Link>

            <Link
              href="/dashboard"
              onClick={closeMobile}
              className={`flex items-center ${isExpanded ? "gap-3 px-3" : "justify-center px-0"} py-2.5 rounded-xl text-[15px] font-medium transition-all ${
                pathname === "/dashboard"
                  ? "text-[#1d1d1b] dark:text-[#D4AA50] font-bold bg-[#cfc7b2]/70 dark:bg-[#D4AA50]/15 border-l-3 border-l-[#7a4e10] dark:border-l-[#D4AA50] shadow-2xs"
                  : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C]/40"
              }`}
              title="Workspaces Hub"
            >
              <LayoutDashboard className={`w-[18px] h-[18px] shrink-0 ${
                pathname === "/dashboard" ? "text-[#7a4e10] dark:text-[#D4AA50]" : "text-[#7B8491]"
              }`} />
              {isExpanded && <span>Workspaces</span>}
            </Link>

            <Link
              href="/profile"
              onClick={closeMobile}
              className={`flex items-center ${isExpanded ? "gap-3 px-3" : "justify-center px-0"} py-2.5 rounded-xl text-[15px] font-medium transition-all ${
                pathname === "/profile"
                  ? "text-[#1d1d1b] dark:text-[#D4AA50] font-bold bg-[#cfc7b2]/70 dark:bg-[#D4AA50]/15 border-l-3 border-l-[#7a4e10] dark:border-l-[#D4AA50] shadow-2xs"
                  : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C]/40"
              }`}
              title="Executive Folio & System Calibration"
            >
              <UserIcon className={`w-[18px] h-[18px] shrink-0 ${
                pathname === "/profile" ? "text-[#7a4e10] dark:text-[#D4AA50]" : "text-[#7B8491]"
              }`} />
              {isExpanded && <span>Executive Folio</span>}
            </Link>
          </nav>

          {/* Workspaces Section */}
          <div className="space-y-1.5">
            {isExpanded ? (
              <div className="flex items-center justify-between px-3 mb-1 pt-2">
                <span className="font-mono text-xs font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                  Workspaces
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewFolderModal(true);
                    closeMobile();
                  }}
                  className="p-1 rounded-lg text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 transition-colors cursor-pointer"
                  title="New workspace"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex justify-center my-1 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(true)}
                  className="p-1.5 rounded-lg text-[#7B8491] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] cursor-pointer"
                  title="Workspaces"
                >
                  <FolderIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {isExpanded && (
              <div className="space-y-0.5">
                {folders.length === 0 ? (
                  <p className="text-[13px] font-sans text-[#7B8491] px-3 py-1.5">
                    No workspaces yet
                  </p>
                ) : (
                  folders.map((f) => {
                    const isActive =
                      activeFolderId === f.id || pathname === `/folders/${f.id}`;
                    const folderDecisions = decisions.filter((d) => d.folder_id === f.id);
                    const count = folderDecisions.length;
                    return (
                      <div key={f.id} className="space-y-0.5">
                        <Link
                          href={`/folders/${f.id}`}
                          onClick={closeMobile}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[14px] sm:text-[15px] transition-colors border-l-3 ${
                            isActive
                              ? "text-[#1d1d1b] dark:text-[#F0EAE1] font-bold bg-[#cfc7b2]/70 dark:bg-[#D4AA50]/15 border-l-[#7a4e10] dark:border-l-[#D4AA50]"
                              : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C]/40 border-l-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate min-w-0">
                            <svg
                              viewBox="0 0 24 24"
                              className={`w-4 h-4 shrink-0 fill-none stroke-[1.8] ${
                                isActive
                                  ? "stroke-[#2B4C8C] dark:stroke-[#93b3ee]"
                                  : "stroke-[#7B8491]"
                              }`}
                            >
                              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            </svg>
                            <span className="truncate font-sans font-medium">{f.name}</span>
                          </div>
                          {count > 0 && (
                            <span className="font-mono text-xs text-[#7a4e10] dark:text-[#D4AA50] font-bold px-1.5 py-0.5 rounded-md bg-[#cfc7b2]/50 dark:bg-[#38332C]/50 shrink-0">
                              {count}
                            </span>
                          )}
                        </Link>

                        {/* Nested Decisions & Meetings when Workspace is Active */}
                        {isActive && (
                          <div className="ml-3 pl-3 border-l-2 border-[#cfc7b2] dark:border-[#38332C] space-y-0.5 my-1">
                            {folderDecisions.length === 0 ? (
                              <p className="text-xs font-sans text-[#7B8491] py-1 px-1">
                                No records yet
                              </p>
                            ) : (
                              folderDecisions.map((d) => {
                                const isItemActive = activeDecisionId === d.id;
                                const isMeeting = d.record_type === "meeting";
                                return (
                                  <Link
                                    key={d.id}
                                    href={`/decisions/${d.id}`}
                                    onClick={closeMobile}
                                    className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm transition-colors rounded-lg border-l-2 ${
                                      isItemActive
                                        ? "font-bold text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#cfc7b2]/70 dark:bg-[#D4AA50]/20 border-l-[#7a4e10] dark:border-l-[#D4AA50]"
                                        : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/30 border-l-transparent"
                                    }`}
                                    title={d.title}
                                  >
                                    <div className="flex items-center gap-2 truncate min-w-0">
                                      {isMeeting ? (
                                        <Video className="w-3.5 h-3.5 text-[#2B4C8C] dark:text-[#93b3ee] shrink-0" />
                                      ) : (
                                        <Compass className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50] shrink-0" />
                                      )}
                                      <span className="truncate font-newsreader text-[14px] sm:text-[15px]">{d.title}</span>
                                    </div>
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        d.status === "decided"
                                          ? "bg-emerald-500"
                                          : d.status === "evaluating"
                                          ? "bg-amber-500"
                                          : "bg-[#7B8491]"
                                      }`}
                                      title={`Status: ${d.status}`}
                                    />
                                  </Link>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* RECENT Section: Up to 3 recent decisions */}
          {isExpanded && decisions.length > 0 && (
            <div className="pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 space-y-1.5">
              <div className="px-3 mb-1 pt-1">
                <span className="font-mono text-xs font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                  RECENT
                </span>
              </div>
              <div className="space-y-1">
                {decisions.slice(0, 3).map((d) => (
                  <Link
                    key={d.id}
                    href={`/decisions/${d.id}`}
                    onClick={closeMobile}
                    className={`block px-3 py-1.5 text-[15px] font-newsreader leading-snug truncate transition-colors border-l-2 rounded-r-lg ${
                      activeDecisionId === d.id
                        ? "border-l-[#7a4e10] dark:border-l-[#D4AA50] bg-[#cfc7b2]/70 dark:bg-[#D4AA50]/15 text-[#1d1d1b] dark:text-[#F0EAE1] font-semibold"
                        : "border-l-transparent text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C]/40"
                    }`}
                    title={d.title}
                  >
                    {d.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Minimal Quiet Footer */}
        <div className="relative z-20 p-3 border-t border-[#cfc7b2] dark:border-[#38332C] bg-[#DFD7C0] dark:bg-[#1C1917] shrink-0">
          {isExpanded ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                DECISIONLENS
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 px-2.5 text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C]/40 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex justify-center p-1.5 text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Modal: New Workspace */}
      {showNewFolderModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-courier">
            <div className="bg-[#EDE7D6] dark:bg-[#221F1C] rounded-sm border-2 border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] max-w-md w-full p-6 relative shadow-2xl text-[#1d1d1b] dark:text-[#F0EAE1]">
              <div className="flex items-center justify-between pb-3 border-b border-[#cfc7b2] dark:border-[#38332C] mb-4">
                <h3 className="font-newsreader text-[22px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                  New workspace
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] p-1 rounded-[2px]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="mb-3 p-2.5 rounded-sm bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-courier">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateNewFolder} className="space-y-4 font-courier text-xs sm:text-[13px]">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Workspace name
                  </label>
                  <input
                    type="text"
                    required
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. Strategic Growth, Product Strategy"
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
                    placeholder="Context or domain notes..."
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#cfc7b2] dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(false)}
                    className="px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] rounded-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-[#1d1d1b] hover:bg-transparent hover:text-[#1d1d1b] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[12px] font-bold font-courier uppercase tracking-wider rounded-sm transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating..." : "Create workspace"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal: Challenge a Decision */}
      {showNewDecisionModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-courier">
            <div className="bg-[#EDE7D6] dark:bg-[#221F1C] rounded-sm border-2 border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] max-w-md w-full p-6 relative shadow-2xl text-[#1d1d1b] dark:text-[#F0EAE1]">
              <div className="flex items-center justify-between pb-3 border-b border-[#cfc7b2] dark:border-[#38332C] mb-4">
                <div>
                  <span className="font-courier text-[10px] tracking-[0.14em] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase block">
                    REASONING SCRUTINY
                  </span>
                  <h3 className="font-newsreader text-[22px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                    Challenge a decision
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewDecisionModal(false)}
                  className="text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] p-1 rounded-[2px]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="mb-3 p-2.5 rounded-sm bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-courier">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateNewDecision} className="space-y-4 font-courier text-xs sm:text-[13px]">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Workspace
                  </label>
                  <select
                    value={newDecisionFolderId}
                    onChange={(e) => setNewDecisionFolderId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors"
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
                    What decision are you weighing?
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={newDecisionTitle}
                    onChange={(e) => setNewDecisionTitle(e.target.value)}
                    placeholder="e.g. Choose between Kubernetes vs Cloud Run for multi-region scale"
                    className="w-full px-3 py-2 text-[13px] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#2B4C8C] dark:focus:border-[#D4AA50] focus:ring-2 focus:ring-[#2B4C8C]/25 focus:outline-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#cfc7b2] dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={() => setShowNewDecisionModal(false)}
                    className="px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] rounded-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-[#1d1d1b] hover:bg-transparent hover:text-[#1d1d1b] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[12px] font-bold uppercase tracking-wider rounded-sm transition-colors disabled:opacity-50 shadow-xs"
                  >
                    {isSubmitting ? "Starting Scrutiny..." : "Challenge Decision →"}
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
