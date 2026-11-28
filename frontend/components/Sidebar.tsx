"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import ModalPortal from "@/components/ModalPortal";
import BrandLogo from "@/components/BrandLogo";
import { DecisionLensIcon } from "@/components/DecisionLensLogo";
import { useTheme } from "@/context/ThemeContext";
import {
  LayoutDashboard,
  User as UserIcon,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  LogOut,
  X,
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
  const raw = name && name.trim() ? name.trim() : email?.split("@")[0] || "User";
  return raw.replace(/\s*\([^)]*\)$/, "").trim();
}

function getStatusDotColor(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s === "decided") return "#0F9D68";
  if (s === "evaluating" || s === "conditional" || s === "in_review") return "#D97706";
  return "#6E6759";
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
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();

  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  // Collapse / mobile / interactive drawers
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [showCollapsedFolio, setShowCollapsedFolio] = useState(false);
  const [showQuickJump, setShowQuickJump] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const collapsed =
    controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const mobileOpen =
    controlledMobileOpen !== undefined ? controlledMobileOpen : internalMobileOpen;
  const isExpanded = !collapsed || mobileOpen;

  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderDomain, setNewFolderDomain] = useState("AUTO");

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
        if (folderData.length > 0) {
          setNewDecisionFolderId((prev) =>
            prev === "" ? folderData[0].id : prev
          );
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
  }, []);

  useEffect(() => {
    loadSidebarData();
  }, [loadSidebarData]);

  // Keep currently active folder expanded automatically
  useEffect(() => {
    if (activeFolderId) {
      setExpandedFolders((prev) => ({ ...prev, [activeFolderId]: true }));
    } else if (activeDecisionId && decisions.length > 0) {
      const activeDec = decisions.find((d) => d.id === activeDecisionId);
      if (activeDec?.folder_id) {
        setExpandedFolders((prev) => ({ ...prev, [activeDec.folder_id]: true }));
      }
    }
  }, [activeFolderId, activeDecisionId, decisions]);

  // Close collapsed flyout whenever sidebar expands
  useEffect(() => {
    if (isExpanded) {
      setShowCollapsedFolio(false);
    }
  }, [isExpanded]);

  // Cmd+K / Ctrl+K & Escape keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowQuickJump((prev) => !prev);
      } else if (e.key === "Escape") {
        setShowQuickJump(false);
        setShowCollapsedFolio(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (showQuickJump) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    } else {
      setSearchQuery("");
    }
  }, [showQuickJump]);

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

  const toggleFolderOpen = (folderId: number) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const openNewDecisionForFolder = (folderId?: number) => {
    if (folderId) {
      setNewDecisionFolderId(folderId);
    } else if (activeFolderId) {
      setNewDecisionFolderId(activeFolderId);
    } else if (folders.length > 0) {
      setNewDecisionFolderId(folders[0].id);
    }
    setModalError(null);
    setShowNewDecisionModal(true);
    closeMobile();
  };

  const filteredQuickResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchedFolders = q
      ? folders.filter((f) => f.name.toLowerCase().includes(q))
      : folders.slice(0, 4);
    const matchedDecisions = q
      ? decisions.filter((d) => (d.title || "").toLowerCase().includes(q))
      : decisions.slice(0, 6);
    return { matchedFolders, matchedDecisions };
  }, [folders, decisions, searchQuery]);

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
      setModalError(
        err instanceof Error ? err.message : "Failed to create workspace"
      );
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
      setModalError(
        err instanceof Error ? err.message : `Failed to create ${newRecordType}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayName = formatDisplayName(user?.display_name, user?.email);
  const avatarInitial = (displayName[0] || "U").toUpperCase();

  const primaryNav = [
    {
      href: "/dashboard",
      label: "Overview",
      title: "Overview Hub",
      icon: LayoutDashboard,
      isActive: pathname === "/dashboard",
    },
    {
      href: "/portfolio",
      label: "3D Portfolio",
      title: "Decision Portfolio (3D Constellation)",
      icon: Compass,
      isActive: pathname === "/portfolio",
    },
    {
      href: "/profile",
      label: "Executive Folio",
      title: "Executive Folio & System Calibration",
      icon: UserIcon,
      isActive: pathname === "/profile",
    },
  ];

  // Folder shown inside collapsed pull-out folio drawer
  const focusedFolder = useMemo(() => {
    if (activeFolderId) {
      return folders.find((f) => f.id === activeFolderId) || folders[0];
    }
    if (activeDecisionId) {
      const dec = decisions.find((d) => d.id === activeDecisionId);
      if (dec) return folders.find((f) => f.id === dec.folder_id) || folders[0];
    }
    return folders[0];
  }, [folders, decisions, activeFolderId, activeDecisionId]);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Full-Height Concave Paper Sidebar: 214px curved on desktop / 56px collapsed */}
      <aside
        className={`dl-sidebar fixed top-0 bottom-0 left-0 z-50 flex flex-col text-[#1d1d1b] dark:text-[#F0EAE1] transition-transform lg:transition-all duration-200 ease-out shadow-2xl lg:shadow-none w-[272px] max-w-[85vw] ${
          collapsed
            ? "lg:w-14 bg-[#E5DEC9] dark:bg-[#1C1917] border-r border-[#cfc7b2] dark:border-[#38332C]"
            : "lg:w-[214px] bg-[#E5DEC9] dark:bg-[#1C1917] lg:bg-transparent dark:lg:bg-transparent border-r lg:border-r-0 border-[#cfc7b2] dark:border-[#38332C] lg:drop-shadow-[4px_0_12px_rgba(29,29,27,0.08)]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Full Viewport-Height Concave SVG Paper Silhouette (Desktop Expanded Only) */}
        {!collapsed && (
          <svg
            className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none z-0"
            viewBox="0 0 214 900"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="dlSidebarCurveLight" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#EAE2CE" />
                <stop offset="50%" stopColor="#E4DBC4" />
                <stop offset="100%" stopColor="#DDD2B6" />
              </linearGradient>
              <linearGradient id="dlSidebarCurveDark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#211D1A" />
                <stop offset="50%" stopColor="#1C1917" />
                <stop offset="100%" stopColor="#171412" />
              </linearGradient>
            </defs>
            <path
              d="M 0 0 L 213 0 Q 178 450 213 900 L 0 900 Z"
              fill={
                theme === "dark"
                  ? "url(#dlSidebarCurveDark)"
                  : "url(#dlSidebarCurveLight)"
              }
            />
            <path
              d="M 213 0 Q 178 450 213 900"
              fill="none"
              stroke={theme === "dark" ? "#38332C" : "#C2B598"}
              strokeWidth="1.25"
            />
          </svg>
        )}

        {/* 1. HEADER: 56px matching main topbar */}
        <div
          className={`relative z-10 h-14 flex items-center shrink-0 ${
            !isExpanded
              ? "justify-center px-0 border-b border-[#cfc7b2] dark:border-[#38332C]"
              : "justify-between px-3 lg:px-0 lg:mx-3 border-b border-[#cfc7b2]/75 dark:border-[#38332C]/80"
          }`}
        >
          {isExpanded ? (
            <div className="min-w-0 flex items-center">
              <BrandLogo
                href="/dashboard"
                theme={theme}
                showWordmark={true}
                iconSizeClass="w-7 h-7"
                className="gap-1.5 [&_span]:text-[18px]"
              />
            </div>
          ) : (
            <Link
              href="/dashboard"
              className="flex items-center justify-center w-9 h-9 rounded-[2px] hover:bg-[#cfc7b2]/45 dark:hover:bg-[#38332C]/50 transition-colors"
              aria-label="DecisionLens Home"
              title="DecisionLens Home"
            >
              <DecisionLensIcon size={24} />
            </Link>
          )}

          {isExpanded && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden lg:flex items-center justify-center w-7 h-7 rounded-[2px] text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/60 transition-colors shrink-0 cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={closeMobile}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-[2px] text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/50 cursor-pointer"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. COLLAPSED QUICK CONTROLS (Expand + Quick Jump) */}
        {!isExpanded && (
          <div className="border-b border-[#cfc7b2] dark:border-[#38332C] shrink-0 py-2 flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden lg:flex items-center justify-center w-9 h-8 rounded-[2px] text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/60 transition-colors cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowQuickJump(true)}
              className="h-8 w-9 bg-[#FAF7EF] dark:bg-[#26221E] border border-[#cfc7b2] dark:border-[#38332C] text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:border-[#7a4e10] dark:hover:border-[#D4AA50] rounded-[2px] flex items-center justify-center transition-colors cursor-pointer"
              title="Quick Jump (Ctrl+K)"
              aria-label="Search workspaces and decisions"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 3. PINNED PRIMARY NAVIGATION (Always reachable, Hick's Law: strictly 3 destinations) */}
        <nav
          aria-label="Primary navigation"
          className={`relative z-10 shrink-0 py-2 space-y-0.5 ${
            !isExpanded
              ? "flex flex-col items-center border-b border-[#cfc7b2]/70 dark:border-[#38332C]/70"
              : "lg:ml-3 lg:mr-6 border-b border-[#cfc7b2]/65 dark:border-[#38332C]/65"
          }`}
        >
          {primaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                title={item.title}
                aria-label={item.label}
                className={`flex items-center transition-colors font-newsreader whitespace-nowrap ${
                  !isExpanded
                    ? "w-9 h-9 justify-center rounded-[2px]"
                    : "h-9 px-3 lg:px-1.5 gap-2.5 border-l border-l-transparent"
                } ${
                  item.isActive
                    ? !isExpanded
                      ? "bg-[#FAF7EF] dark:bg-[#26221E] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C]"
                      : "bg-[#FAF7EF] dark:bg-[#26221E] text-[#1d1d1b] dark:text-[#F0EAE1] font-medium border-l-[#7a4e10] dark:border-l-[#D4AA50]"
                    : "text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#FAF7EF]/50 dark:hover:bg-[#38332C]/40"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    item.isActive
                      ? "text-[#7a4e10] dark:text-[#D4AA50]"
                      : "text-[#423D33] dark:text-[#B8B0A2]"
                  }`}
                />
                {isExpanded && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* 4. SCROLLABLE WORKSPACES TREE (Expanded) OR PULL-OUT FOLIO TRIGGER (Collapsed) */}
        <div
          className={`relative z-10 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-2 space-y-1.5 ${
            isExpanded ? "lg:pr-6" : ""
          }`}
        >
          {isExpanded ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="dl-sidebar-kicker font-courier font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-[0.08em]">
                  Workspaces
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowQuickJump(true)}
                    className="p-1 rounded-[2px] text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/60 transition-colors cursor-pointer"
                    title="Quick Jump (Ctrl+K)"
                    aria-label="Search workspaces and decisions"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewFolderModal(true);
                      closeMobile();
                    }}
                    className="p-1 rounded-[2px] text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/50 dark:hover:bg-[#38332C]/60 transition-colors cursor-pointer"
                    title="New workspace"
                    aria-label="New workspace"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {loading && folders.length === 0 ? (
                <div className="space-y-1.5 px-3 py-1 animate-pulse">
                  <div className="h-4 w-3/4 bg-[#EDE7D6] dark:bg-[#221F1C] rounded-[2px]" />
                  <div className="h-4 w-1/2 bg-[#EDE7D6] dark:bg-[#221F1C] rounded-[2px]" />
                </div>
              ) : folders.length === 0 ? (
                <p className="font-courier text-xs text-[#423D33] dark:text-[#B8B0A2] px-3 py-1">
                  No workspaces yet
                </p>
              ) : (
                folders.map((f) => {
                  const isFolderRoute =
                    activeFolderId === f.id || pathname === `/folders/${f.id}`;
                  const isFolderOpen = Boolean(expandedFolders[f.id] || isFolderRoute);
                  const folderDecisions = decisions.filter(
                    (d) => d.folder_id === f.id
                  );

                  return (
                    <div key={f.id} className="space-y-0.5">
                      <div
                        className={`group flex items-center justify-between gap-1 px-2 h-8 transition-colors border-l border-l-transparent ${
                          isFolderRoute
                            ? "text-[#7a4e10] dark:text-[#D4AA50] border-l-[#7a4e10] dark:border-l-[#D4AA50] font-medium"
                            : "text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#FAF7EF]/45 dark:hover:bg-[#38332C]/40"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleFolderOpen(f.id)}
                          className="p-0.5 text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] shrink-0 cursor-pointer"
                          aria-label={
                            isFolderOpen
                              ? `Collapse ${f.name}`
                              : `Expand ${f.name}`
                          }
                          aria-expanded={isFolderOpen}
                        >
                          {isFolderOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <Link
                          href={`/folders/${f.id}`}
                          onClick={closeMobile}
                          className="flex-1 min-w-0 font-newsreader text-sm truncate py-1"
                          title={f.name}
                        >
                          {f.name}
                        </Link>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openNewDecisionForFolder(f.id)}
                            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 p-0.5 text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] transition-opacity cursor-pointer"
                            title={`Add decision to ${f.name}`}
                            aria-label={`Add decision to ${f.name}`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          {folderDecisions.length > 0 && (
                            <span className="font-courier text-[11px] tabular-nums text-[#423D33] dark:text-[#B8B0A2] pr-0.5">
                              {folderDecisions.length}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Indented Decisions + Pulled Paper-Slip Affordance on Active Item */}
                      {isFolderOpen && (
                        <div className="ml-4 pl-2 border-l border-[#cfc7b2] dark:border-[#38332C] space-y-1 my-0.5">
                          {folderDecisions.length === 0 ? (
                            <p className="font-courier text-[11px] text-[#423D33] dark:text-[#B8B0A2] py-1 px-1">
                              Empty workspace
                            </p>
                          ) : (
                            folderDecisions.map((d) => {
                              const isItemActive = activeDecisionId === d.id;
                              return (
                                <Link
                                  key={d.id}
                                  href={`/decisions/${d.id}`}
                                  onClick={closeMobile}
                                  title={`${d.title} (${d.status})`}
                                  className={`dl-sidebar-pull dl-sidebar-doc flex items-center justify-between gap-1.5 px-2 h-7 font-newsreader transition-all ${
                                    isItemActive
                                      ? "mr-1.5 bg-[#FAF7EF] dark:bg-[#26221E] text-[#1d1d1b] dark:text-[#F0EAE1] font-medium border border-[#cfc7b2] dark:border-[#38332C] border-l-[#7a4e10] dark:border-l-[#D4AA50] shadow-[2px_2px_6px_rgba(29,29,27,0.07)]"
                                      : "mr-1.5 text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#FAF7EF]/60 dark:hover:bg-[#38332C]/40"
                                  }`}
                                >
                                  <span className="truncate min-w-0">{d.title}</span>
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: getStatusDotColor(d.status) }}
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
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowCollapsedFolio((prev) => !prev)}
                className={`w-9 h-9 rounded-[2px] flex items-center justify-center transition-colors cursor-pointer ${
                  showCollapsedFolio
                    ? "bg-[#FAF7EF] dark:bg-[#26221E] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C]"
                    : "text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#FAF7EF]/50 dark:hover:bg-[#38332C]/40"
                }`}
                title="Pull out Workspaces Folio"
                aria-label="Pull out workspaces folio"
              >
                <FolderIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(true)}
                className="w-9 h-8 rounded-[2px] flex items-center justify-center text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#FAF7EF]/50 dark:hover:bg-[#38332C]/40 transition-colors cursor-pointer"
                title="New workspace"
                aria-label="New workspace"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* 5. HIGH-CONTRAST QUIET FOOTER (WCAG >= 6.8:1) */}
        <div
          className={`relative z-20 shrink-0 ${
            !isExpanded
              ? "p-2.5 border-t border-[#cfc7b2] dark:border-[#38332C] bg-[#DDD4BC] dark:bg-[#161412] flex flex-col items-center gap-2"
              : "p-2.5 lg:px-0 lg:mx-3 lg:pr-1 border-t border-[#cfc7b2]/75 dark:border-[#38332C]/80 bg-[#DDD4BC] dark:bg-[#161412] lg:bg-transparent dark:lg:bg-transparent flex items-center justify-between gap-2"
          }`}
        >
          <Link
            href="/profile"
            onClick={closeMobile}
            className="flex items-center gap-2 min-w-0 group"
            title={`${displayName} — Executive Folio`}
          >
            <span className="w-6 h-6 rounded-[2px] bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] font-courier text-[11px] font-bold flex items-center justify-center shrink-0">
              {avatarInitial}
            </span>
            {isExpanded && (
              <span className="text-xs font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] truncate group-hover:underline">
                {displayName}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 rounded-[2px] text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/55 dark:hover:bg-[#38332C]/50 transition-colors cursor-pointer shrink-0"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* AUTHORED COLLAPSED PULL-OUT FOLIO DRAWER (Desktop 56px Collapsed Mode) */}
      {!isExpanded && showCollapsedFolio && (
        <div className="hidden lg:flex fixed top-14 bottom-0 left-14 z-40 w-[216px] bg-[#FAF7EF] dark:bg-[#221F1C] border-r border-l border-[#cfc7b2] dark:border-[#38332C] border-l-[#7a4e10] dark:border-l-[#D4AA50] shadow-xl flex-col p-3.5 animate-in slide-in-from-left-3 duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#cfc7b2] dark:border-[#38332C] mb-2.5">
            <span className="dl-sidebar-kicker font-courier font-bold uppercase tracking-[0.08em] text-[#7a4e10] dark:text-[#D4AA50] truncate">
              {focusedFolder ? focusedFolder.name : "Workspaces"}
            </span>
            <button
              type="button"
              onClick={() => setShowCollapsedFolio(false)}
              className="p-1 text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] cursor-pointer"
              aria-label="Close workspace folio"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none space-y-1">
            {focusedFolder &&
              decisions
                .filter((d) => d.folder_id === focusedFolder.id)
                .map((d) => {
                  const isItemActive = activeDecisionId === d.id;
                  return (
                    <Link
                      key={d.id}
                      href={`/decisions/${d.id}`}
                      onClick={() => setShowCollapsedFolio(false)}
                      className={`dl-sidebar-doc flex items-center justify-between gap-2 px-2 py-1.5 font-newsreader transition-colors border-l ${
                        isItemActive
                          ? "bg-[#EDE5D5] dark:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] font-medium border-l-[#7a4e10] dark:border-l-[#D4AA50]"
                          : "border-l-transparent text-[#423D33] dark:text-[#B8B0A2] hover:bg-[#EDE7D6]/60 dark:hover:bg-[#38332C]/40"
                      }`}
                    >
                      <span className="truncate">{d.title}</span>
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: getStatusDotColor(d.status) }}
                      />
                    </Link>
                  );
                })}
          </div>

          <div className="pt-2.5 border-t border-[#cfc7b2] dark:border-[#38332C] mt-2 space-y-1">
            <span className="dl-sidebar-kicker font-courier font-bold uppercase tracking-[0.08em] text-[#423D33] dark:text-[#B8B0A2] block mb-1">
              All Workspaces
            </span>
            {folders.map((f) => (
              <Link
                key={f.id}
                href={`/folders/${f.id}`}
                onClick={() => setShowCollapsedFolio(false)}
                className="flex items-center justify-between px-1.5 py-1 font-newsreader text-xs text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
              >
                <span className="truncate">{f.name}</span>
                <span className="font-courier text-[11px] tabular-nums">
                  {decisions.filter((d) => d.folder_id === f.id).length}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CMD+K QUICK JUMP PALETTE */}
      {showQuickJump && (
        <ModalPortal>
          <div
            onClick={() => setShowQuickJump(false)}
            className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-[1px] flex items-start justify-center pt-20 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#FAF7EF] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] border-t-2 border-t-[#7a4e10] dark:border-t-[#D4AA50] shadow-2xl p-4 space-y-3"
              role="dialog"
              aria-label="Quick jump search"
            >
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#cfc7b2] dark:border-[#38332C]">
                <Search className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50] shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Jump to workspace or decision..."
                  className="flex-1 bg-transparent text-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#6e655a] dark:placeholder-[#A89F91] focus:outline-none"
                />
                <span className="font-courier text-[10px] px-1.5 py-0.5 border border-[#cfc7b2] dark:border-[#38332C] text-[#423D33] dark:text-[#B8B0A2]">
                  ESC
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-3">
                {filteredQuickResults.matchedFolders.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-courier text-[10px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                      Workspaces
                    </span>
                    {filteredQuickResults.matchedFolders.map((f) => (
                      <Link
                        key={f.id}
                        href={`/folders/${f.id}`}
                        onClick={() => setShowQuickJump(false)}
                        className="flex items-center justify-between px-2 py-1.5 text-sm font-newsreader text-[#1d1d1b] dark:text-[#F0EAE1] hover:bg-[#EDE5D5] dark:hover:bg-[#2A2622]"
                      >
                        <span className="truncate">{f.name}</span>
                        <span className="font-courier text-xs text-[#423D33] dark:text-[#B8B0A2]">
                          Workspace
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {filteredQuickResults.matchedDecisions.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-courier text-[10px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                      Decisions
                    </span>
                    {filteredQuickResults.matchedDecisions.map((d) => (
                      <Link
                        key={d.id}
                        href={`/decisions/${d.id}`}
                        onClick={() => setShowQuickJump(false)}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm font-newsreader text-[#1d1d1b] dark:text-[#F0EAE1] hover:bg-[#EDE5D5] dark:hover:bg-[#2A2622]"
                      >
                        <span className="truncate">{d.title}</span>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getStatusDotColor(d.status) }}
                        />
                      </Link>
                    ))}
                  </div>
                )}

                {filteredQuickResults.matchedFolders.length === 0 &&
                  filteredQuickResults.matchedDecisions.length === 0 && (
                    <p className="text-xs font-courier text-[#423D33] dark:text-[#B8B0A2] py-4 text-center">
                      No matching workspaces or decisions.
                    </p>
                  )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

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
                  className="text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] p-1 rounded-[2px] cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="mb-3 p-2.5 rounded-sm bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-courier">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateNewFolder} className="space-y-4 font-courier text-xs">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Workspace name
                  </label>
                  <input
                    type="text"
                    required
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. Strategic Growth, Product Strategy"
                    className="w-full px-3 py-2 text-sm bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#6e655a] focus:border-[#443a30] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Decision Domain / Focus
                  </label>
                  <select
                    value={newFolderDomain}
                    onChange={(e) => setNewFolderDomain(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#443a30] dark:focus:border-[#D4AA50] focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="AUTO">Auto-Detect from Content (Recommended)</option>
                    <option value="SOFTWARE">Software Engineering &amp; Cloud Infrastructure</option>
                    <option value="BUSINESS">Enterprise Strategy &amp; Corporate Deliberation</option>
                    <option value="PRODUCT">Product Strategy &amp; Growth Experiments</option>
                    <option value="FINANCE">Finance, Capital Allocation &amp; Treasury</option>
                    <option value="REAL_ESTATE">Real Estate, Land &amp; Property Acquisition</option>
                    <option value="CAREER">Executive Career &amp; Leadership Hiring</option>
                    <option value="OPERATIONS">Operations, Logistics &amp; Supply Chain</option>
                    <option value="EDUCATION">Education &amp; Academic Research</option>
                    <option value="PERSONAL">Personal Life &amp; Habit Changes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={newFolderDesc}
                    onChange={(e) => setNewFolderDesc(e.target.value)}
                    placeholder="Context or domain notes..."
                    className="w-full px-3 py-2 text-sm bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#6e655a] focus:border-[#443a30] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#cfc7b2] dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(false)}
                    className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#1d1d1b] hover:bg-transparent hover:text-[#1d1d1b] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold uppercase tracking-wider rounded-sm transition-colors disabled:opacity-50 cursor-pointer"
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
                  <span className="font-courier text-xs tracking-[0.14em] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase block">
                    Reasoning Scrutiny
                  </span>
                  <h3 className="font-newsreader text-[22px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                    Challenge a decision
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewDecisionModal(false)}
                  className="text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] p-1 rounded-[2px] cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="mb-3 p-2.5 rounded-sm bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-courier">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateNewDecision} className="space-y-4 font-courier text-xs">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    Workspace
                  </label>
                  <select
                    value={newDecisionFolderId}
                    onChange={(e) => setNewDecisionFolderId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#443a30] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1">
                    What decision are you weighing?
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={newDecisionTitle}
                    onChange={(e) => setNewDecisionTitle(e.target.value)}
                    placeholder="e.g. Choose between Kubernetes vs Cloud Run for multi-region scale"
                    className="w-full px-3 py-2 text-sm bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#6e655a] focus:border-[#443a30] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#cfc7b2] dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={() => setShowNewDecisionModal(false)}
                    className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#423D33] dark:text-[#B8B0A2] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-[#1d1d1b] hover:bg-transparent hover:text-[#1d1d1b] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold uppercase tracking-wider rounded-sm transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
                  >
                    {isSubmitting ? "Starting Scrutiny..." : "Challenge Decision"}
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
