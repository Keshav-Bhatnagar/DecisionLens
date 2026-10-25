"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import SpeechDictationButton from "@/components/SpeechDictationButton";
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
  Users,
  Compass,
} from "lucide-react";

type ViewMode = "LEDGER" | "WORKSPACES";
type StatusFilter = "ALL" | "UNDER_SCRUTINY" | "NEEDS_EVIDENCE" | "READY_TO_DECIDE" | "DECIDED";
type RecordTypeFilter = "ALL" | "decision" | "meeting";

export default function DashboardPage() {
  const router = useRouter();

  // Core Data
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI States
  const [viewMode, setViewMode] = useState<ViewMode>("LEDGER");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<RecordTypeFilter>("ALL");
  const [challengeRecordType, setChallengeRecordType] = useState<"decision" | "meeting">("decision");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);

  // Forms
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
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

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "new" || params.get("challenge") === "true") {
        setShowChallengeModal(true);
      }
      if (params.get("view") === "ledger") {
        setViewMode("LEDGER");
      }
    }
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
      });
      setShowCreateFolderModal(false);
      setNewFolderName("");
      setNewFolderDesc("");
      await loadData();
      router.push(`/folders/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setFolderSubmitting(false);
    }
  };

  // Handle Challenge Decision
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
        status: "evaluating",
        record_type: challengeRecordType,
      });

      setShowChallengeModal(false);
      setChallengeTitle("");
      await loadData();
      router.push(`/decisions/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to create ${challengeRecordType}`);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  // Pre-fill and open challenge modal from example
  const handleSelectExample = (exampleText: string) => {
    setChallengeTitle(exampleText);
    setChallengeRecordType("decision");
    setShowChallengeModal(true);
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

  const countOpenItems = (d: Decision): number => {
    const rawGaps = d.gaps as { gaps?: unknown[] } | undefined;
    return Array.isArray(rawGaps?.gaps) ? rawGaps.gaps.length : 0;
  };

  // Stats
  const activeDecisionsCount = decisions.filter((d) => d.record_type !== "meeting").length;
  const activeMeetingsCount = decisions.filter((d) => d.record_type === "meeting").length;
  const underScrutinyCount = decisions.filter((d) => resolveStatus(d) === "UNDER_SCRUTINY").length;
  const needsEvidenceCount = decisions.filter((d) => resolveStatus(d) === "NEEDS_EVIDENCE").length;
  const totalOpenQuestionsCount = decisions.reduce((acc, d) => acc + countOpenItems(d), 0);

  const hasAnyDecisions = decisions.length > 0;

  // Filtered decisions for the ledger
  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      const matchesSearch =
        !searchQuery.trim() ||
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.problem_statement &&
          d.problem_statement.toLowerCase().includes(searchQuery.toLowerCase()));

      const status = resolveStatus(d);
      const matchesStatus =
        statusFilter === "ALL" || status === statusFilter;

      const dType = d.record_type || "decision";
      const matchesType =
        typeFilter === "ALL" || dType === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [decisions, searchQuery, statusFilter, typeFilter]);

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
      {!currentUser && !loading ? (
        /* Calm Unauthenticated State */
        <div className="bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] p-8 sm:p-12 text-center max-w-[620px] mx-auto my-12">
          <h2 className="font-newsreader text-[32px] font-medium text-[#161E33] mb-3 tracking-tight">
            Sign in to your decisions
          </h2>
          <p className="text-[14px] text-[#5A6275] leading-relaxed max-w-[460px] mx-auto mb-6">
            Review decisions you are weighing, surface critical assumptions, and evaluate evidence before committing strategy.
          </p>
          <div>
            <Link
              href="/auth"
              className="inline-block px-5 py-2.5 bg-[#161E33] hover:bg-[#232C47] text-white rounded-[4px] text-[14px] font-medium transition-colors focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
            >
              Sign in to DecisionLens
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10 font-ui text-[#161E33]">
          {/* HEADER: Serif headline "Your decisions", subtitle, and right-aligned buttons */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#D9D2C3] pb-6">
            <div>
              <h1 className="font-newsreader text-[36px] sm:text-[40px] font-medium tracking-tight text-[#161E33] leading-tight">
                Your decisions
              </h1>
              <p className="text-[14px] sm:text-[15px] text-[#5A6275] mt-1.5 leading-normal">
                Track what you&apos;re weighing, and see where your reasoning needs work.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2.5 shrink-0 pt-2 sm:pt-0">
              <button
                type="button"
                onClick={() => setShowCreateFolderModal(true)}
                className="px-3.5 py-2 bg-[#FCFBF8] border border-[#161E33] hover:bg-[#F5F1E8] text-[#161E33] text-[14px] font-medium rounded-[4px] transition-colors focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
              >
                New workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeRecordType("meeting");
                  const count = decisions.filter((d) => d.record_type === "meeting").length;
                  setChallengeTitle(`Meeting ${count + 1}`);
                  setShowChallengeModal(true);
                }}
                className="px-3.5 py-2 bg-[#FCFBF8] border border-[#2D6A4F] hover:bg-[#E8F3EE] text-[#1B4332] text-[14px] font-medium rounded-[4px] transition-colors focus:ring-2 focus:ring-[#2D6A4F]/25 focus:outline-none flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-[#2D6A4F]" />
                <span>Record meeting</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeRecordType("decision");
                  const count = decisions.filter((d) => d.record_type !== "meeting").length;
                  setChallengeTitle(`Discussion ${count + 1}`);
                  setShowChallengeModal(true);
                }}
                className="px-4 py-2 bg-[#161E33] hover:bg-[#232C47] text-white text-[14px] font-medium rounded-[4px] transition-colors shadow-none focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 text-[#EFEADF]" />
                <span>New decision</span>
              </button>
            </div>
          </div>

          {/* STATS ROW: Single slim row of inline stats inside one bordered container.
              Hidden entirely if all values are 0 or no decisions exist. */}
          {hasAnyDecisions && (activeDecisionsCount > 0 || activeMeetingsCount > 0) && (
            <div className="bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] py-4 px-6 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#D9D2C3]">
              <div className="py-2 sm:py-0 sm:px-4 first:pl-0">
                <div className="font-newsreader text-[28px] font-normal text-[#161E33] leading-tight">
                  {activeDecisionsCount}
                </div>
                <div className="text-[13px] text-[#5A6275] mt-0.5">
                  Decisions
                </div>
              </div>

              <div className="py-2 sm:py-0 sm:px-4">
                <div className="font-newsreader text-[28px] font-normal text-[#1B4332] leading-tight">
                  {activeMeetingsCount}
                </div>
                <div className="text-[13px] text-[#5A6275] mt-0.5">
                  Meeting records
                </div>
              </div>

              <div className="py-2 sm:py-0 sm:px-4">
                <div className="font-newsreader text-[28px] font-normal text-[#161E33] leading-tight">
                  {needsEvidenceCount}
                </div>
                <div className="text-[13px] text-[#5A6275] mt-0.5">
                  Needs evidence
                </div>
              </div>

              <div className="py-2 sm:py-0 sm:px-4 last:pr-0">
                <div className="font-newsreader text-[28px] font-normal text-[#161E33] leading-tight">
                  {totalOpenQuestionsCount}
                </div>
                <div className="text-[13px] text-[#5A6275] mt-0.5">
                  Open questions
                </div>
              </div>
            </div>
          )}

          {/* EMPTY STATE (when no decisions exist) */}
          {!loading && !hasAnyDecisions && (
            <div className="max-w-[720px] mx-auto text-center py-6 sm:py-10 space-y-8">
              {/* 1. Serif heading & 2. Short paragraph */}
              <div className="space-y-2.5">
                <h2 className="font-newsreader text-[32px] sm:text-[38px] font-medium text-[#161E33] tracking-tight leading-snug">
                  Start with a decision you&apos;re weighing
                </h2>
                <p className="text-[15px] text-[#5A6275] max-w-[540px] mx-auto leading-relaxed">
                  Describe it in a few sentences. DecisionLens will surface the assumptions behind it, ask what&apos;s missing, and help you decide with evidence.
                </p>
              </div>

              {/* 3. Primary button */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowChallengeModal(true)}
                  className="px-5 py-2.5 bg-[#161E33] hover:bg-[#232C47] text-white text-[14px] font-medium rounded-[4px] transition-colors shadow-none focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
                >
                  Challenge a decision
                </button>
              </div>

              {/* 4. "How it works" row with 3 simple numbered steps */}
              <div className="pt-6 border-t border-[#D9D2C3]">
                <div className="font-courier text-[11px] font-medium text-[#5A6275] uppercase tracking-[0.08em] mb-4">
                  How it works
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                  <div className="p-3.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px]">
                    <div className="font-courier text-[12px] font-medium text-[#2F5D8F] mb-1">
                      01
                    </div>
                    <div className="text-[14px] font-medium text-[#161E33]">
                      Describe the decision
                    </div>
                    <div className="text-[12px] text-[#5A6275] mt-1 leading-normal">
                      Share your current direction, alternatives, and background context.
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px]">
                    <div className="font-courier text-[12px] font-medium text-[#2F5D8F] mb-1">
                      02
                    </div>
                    <div className="text-[14px] font-medium text-[#161E33]">
                      Review assumptions and gaps
                    </div>
                    <div className="text-[12px] text-[#5A6275] mt-1 leading-normal">
                      Identify blind spots, hidden risks, and questions that need verification.
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px]">
                    <div className="font-courier text-[12px] font-medium text-[#2F5D8F] mb-1">
                      03
                    </div>
                    <div className="text-[14px] font-medium text-[#161E33]">
                      Decide with evidence
                    </div>
                    <div className="text-[12px] text-[#5A6275] mt-1 leading-normal">
                      Formulate a tested recommendation backed by empirical facts.
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. "Or try an example" with 3 clickable example cards */}
              <div className="pt-4 text-left">
                <div className="font-courier text-[11px] font-medium text-[#5A6275] uppercase tracking-[0.08em] mb-3">
                  Or try an example
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectExample("Should we enter a new regional market this year?")}
                    className="p-4 bg-[#FCFBF8] border border-[#D9D2C3] hover:border-[#2F5D8F] rounded-[4px] text-left transition-colors group focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
                  >
                    <span className="text-[14px] text-[#161E33] font-medium group-hover:text-[#2F5D8F] transition-colors leading-snug block">
                      Should we enter a new regional market this year?
                    </span>
                    <span className="font-courier text-[11px] uppercase tracking-[0.08em] text-[#8B909C] mt-2 block">
                      Strategic expansion
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectExample("Hire an internal leader or bring in an external one?")}
                    className="p-4 bg-[#FCFBF8] border border-[#D9D2C3] hover:border-[#2F5D8F] rounded-[4px] text-left transition-colors group focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
                  >
                    <span className="text-[14px] text-[#161E33] font-medium group-hover:text-[#2F5D8F] transition-colors leading-snug block">
                      Hire an internal leader or bring in an external one?
                    </span>
                    <span className="font-courier text-[11px] uppercase tracking-[0.08em] text-[#8B909C] mt-2 block">
                      Leadership &amp; talent
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectExample("Build this capability in-house or buy it?")}
                    className="p-4 bg-[#FCFBF8] border border-[#D9D2C3] hover:border-[#2F5D8F] rounded-[4px] text-left transition-colors group focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
                  >
                    <span className="text-[14px] text-[#161E33] font-medium group-hover:text-[#2F5D8F] transition-colors leading-snug block">
                      Build this capability in-house or buy it?
                    </span>
                    <span className="font-courier text-[11px] uppercase tracking-[0.08em] text-[#8B909C] mt-2 block">
                      Capital allocation
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FILTERS & LISTS (Only render when there is at least one decision) */}
          {hasAnyDecisions && (
            <div className="space-y-6">
              {/* Top Filter Bar: Search + View Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 text-[#8B909C] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search decisions or workspaces..."
                    className="w-full pl-8 pr-8 py-1.5 text-[13px] bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[#161E33] placeholder-[#8B909C] focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B909C] hover:text-[#161E33]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* View Switcher: All decisions vs Workspaces */}
                <div className="flex items-center gap-1 border border-[#D9D2C3] rounded-[4px] p-0.5 bg-[#FCFBF8] text-[13px]">
                  <button
                    type="button"
                    onClick={() => setViewMode("LEDGER")}
                    className={`px-3 py-1 rounded-[4px] transition-colors ${
                      viewMode === "LEDGER"
                        ? "bg-[#F5F1E8] text-[#161E33] font-medium"
                        : "text-[#5A6275] hover:text-[#161E33]"
                    }`}
                  >
                    All decisions
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("WORKSPACES")}
                    className={`px-3 py-1 rounded-[4px] transition-colors ${
                      viewMode === "WORKSPACES"
                        ? "bg-[#F5F1E8] text-[#161E33] font-medium"
                        : "text-[#5A6275] hover:text-[#161E33]"
                    }`}
                  >
                    Workspaces
                  </button>
                </div>
              </div>

              {/* Record Type and Status Tab Bars */}
              {viewMode === "LEDGER" && (
                <div className="space-y-3 border-b border-[#D9D2C3] pb-3">
                  {/* Row 1: Record Type Filter (All, Decisions, Meetings) */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTypeFilter("ALL")}
                      className={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                        typeFilter === "ALL"
                          ? "bg-[#161E33] text-white"
                          : "bg-[#FCFBF8] border border-[#D9D2C3] text-[#5A6275] hover:text-[#161E33]"
                      }`}
                    >
                      All records ({decisions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter("decision")}
                      className={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors flex items-center gap-1.5 ${
                        typeFilter === "decision"
                          ? "bg-[#2F5D8F] text-white"
                          : "bg-[#FCFBF8] border border-[#D9D2C3] text-[#5A6275] hover:text-[#161E33]"
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Decisions ({decisions.filter((d) => d.record_type !== "meeting").length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypeFilter("meeting")}
                      className={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors flex items-center gap-1.5 ${
                        typeFilter === "meeting"
                          ? "bg-[#1B4332] text-white"
                          : "bg-[#FCFBF8] border border-[#D9D2C3] text-[#5A6275] hover:text-[#161E33]"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5 text-[#2D6A4F]" />
                      <span>Meetings ({decisions.filter((d) => d.record_type === "meeting").length})</span>
                    </button>
                  </div>

                  {/* Row 2: Status Tab Bar */}
                  <div className="flex items-center gap-6 text-[13px] overflow-x-auto scrollbar-none pt-1">
                    {(
                      [
                        { key: "ALL", label: "All statuses" },
                        { key: "UNDER_SCRUTINY", label: "Under scrutiny" },
                        { key: "NEEDS_EVIDENCE", label: "Needs evidence" },
                        { key: "READY_TO_DECIDE", label: "Ready to decide" },
                        { key: "DECIDED", label: "Decided" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStatusFilter(tab.key)}
                        className={`pb-1 transition-colors relative whitespace-nowrap ${
                          statusFilter === tab.key
                            ? "text-[#2F5D8F] font-medium border-b-2 border-[#2F5D8F] -mb-[1px]"
                            : "text-[#5A6275] hover:text-[#161E33]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* LEDGER VIEW */}
              {viewMode === "LEDGER" && (
                <div className="bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] overflow-hidden">
                  {filteredDecisions.length === 0 ? (
                    <div className="p-8 text-center text-[#5A6275] text-[13px]">
                      No records match your search or filter.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-[#D9D2C3] font-courier text-[11px] text-[#5A6275] font-medium uppercase tracking-[0.08em]">
                          <th className="py-3 px-4 font-medium">RECORD</th>
                          <th className="py-3 px-4 font-medium">TYPE</th>
                          <th className="py-3 px-4 font-medium">WORKSPACE</th>
                          <th className="py-3 px-4 font-medium">STATUS</th>
                          <th className="py-3 px-4 font-medium text-right">DATE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D9D2C3]">
                        {filteredDecisions.map((d) => {
                          const parentFolder = folders.find((f) => f.id === d.folder_id);
                          const status = resolveStatus(d);
                          const isMeeting = d.record_type === "meeting";
                          const formattedDate = new Date(d.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });

                          return (
                            <tr
                              key={d.id}
                              onClick={() => router.push(`/decisions/${d.id}`)}
                              className="hover:bg-[#F5F1E8] cursor-pointer transition-colors group"
                            >
                              {/* Title & Problem */}
                              <td className="py-3 px-4 max-w-md">
                                <span className="font-medium text-[#161E33] group-hover:text-[#2F5D8F] transition-colors block leading-snug">
                                  {d.title}
                                </span>
                                {d.problem_statement && (
                                  <span className="text-[12px] text-[#5A6275] line-clamp-1 mt-0.5">
                                    {d.problem_statement}
                                  </span>
                                )}
                              </td>

                              {/* Type Badge */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                    isMeeting
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300/60"
                                      : "bg-[#2F5D8F]/10 text-[#2F5D8F] border border-[#2F5D8F]/20"
                                  }`}
                                >
                                  {isMeeting ? "Meeting" : "Decision"}
                                </span>
                              </td>

                              {/* Workspace */}
                              <td className="py-3 px-4 text-[#5A6275] whitespace-nowrap">
                                {parentFolder?.name || "General"}
                              </td>

                              {/* Status Badge: square-ish (2px radius), mono 11px uppercase, muted tones with 1px border */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center font-courier text-[11px] font-medium uppercase tracking-[0.08em] px-2 py-0.5 rounded-[2px] border ${
                                    status === "DECIDED"
                                      ? "text-[#2F6B4F] bg-[#E6EFE9] border-[#C5DACD]"
                                      : status === "UNDER_SCRUTINY"
                                      ? "text-[#2F5D8F] bg-[#E6EDF5] border-[#C5D4E6]"
                                      : status === "NEEDS_EVIDENCE"
                                      ? "text-[#8A5A14] bg-[#F4ECDC] border-[#E3D3AE]"
                                      : "text-[#161E33] bg-[#EAE6DB] border-[#D3CDBD]"
                                  }`}
                                >
                                  {status === "UNDER_SCRUTINY" && "Under scrutiny"}
                                  {status === "NEEDS_EVIDENCE" && "Needs evidence"}
                                  {status === "READY_TO_DECIDE" && "Ready to decide"}
                                  {status === "DECIDED" && "Decided"}
                                </span>
                              </td>

                              {/* Date: monospace uppercase label */}
                              <td className="py-3 px-4 text-right font-courier text-[11px] text-[#5A6275] uppercase tracking-[0.08em] whitespace-nowrap">
                                {formattedDate}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* WORKSPACES VIEW */}
              {viewMode === "WORKSPACES" && (
                <div className="space-y-4">
                  {filteredFolders.length === 0 ? (
                    <div className="bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] p-8 text-center text-[#5A6275] text-[13px]">
                      No workspaces found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredFolders.map((f) => {
                        const count = decisions.filter((d) => d.folder_id === f.id).length;
                        return (
                          <Link
                            key={f.id}
                            href={`/folders/${f.id}`}
                            className="bg-[#FCFBF8] border border-[#D9D2C3] hover:border-[#2F5D8F] rounded-[4px] p-4 flex flex-col justify-between transition-colors group focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[14px] font-medium text-[#161E33] group-hover:text-[#2F5D8F] transition-colors">
                                  {f.name}
                                </span>
                                <span className="font-courier text-[11px] uppercase tracking-[0.08em] text-[#8B909C]">
                                  {count} {count === 1 ? "DECISION" : "DECISIONS"}
                                </span>
                              </div>
                              <p className="text-[12px] text-[#5A6275] line-clamp-2 leading-relaxed">
                                {f.description || "Active decision domain."}
                              </p>
                            </div>
                            <div className="pt-3 mt-3 border-t border-[#D9D2C3] text-[12px] text-[#2F5D8F] font-medium">
                              Open workspace
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE WORKSPACE */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-ui">
          <div className="bg-[#FCFBF8] rounded-[4px] border border-[#D9D2C3] max-w-md w-full p-6 relative shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9D2C3] mb-4">
              <h3 className="text-[17px] font-medium text-[#161E33]">
                New workspace
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateFolderModal(false)}
                className="text-[#8B909C] hover:text-[#161E33] p-1 rounded-[2px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="mb-3 p-2.5 rounded-[4px] bg-red-50 border border-red-200 text-red-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#161E33] mb-1">
                  Workspace name
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Product Strategy, Leadership, Expansion"
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
                  placeholder="Brief context or domain notes..."
                  className="w-full px-3 py-2 text-[13px] bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[#161E33] placeholder-[#8B909C] focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#D9D2C3]">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="px-3.5 py-1.5 text-[13px] font-medium text-[#5A6275] hover:text-[#161E33] rounded-[4px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={folderSubmitting}
                  className="px-4 py-1.5 bg-[#161E33] hover:bg-[#232C47] text-white text-[13px] font-medium rounded-[4px] transition-colors disabled:opacity-50"
                >
                  {folderSubmitting ? "Creating..." : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHALLENGE A DECISION OR RECORD A MEETING */}
      {showChallengeModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-ui">
          <div className="bg-[#FCFBF8] rounded-[4px] border border-[#D9D2C3] max-w-md w-full p-6 relative shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9D2C3] mb-4">
              <h3 className="text-[17px] font-medium text-[#161E33]">
                {challengeRecordType === "meeting" ? "Record new meeting" : "Challenge a decision"}
              </h3>
              <button
                type="button"
                onClick={() => setShowChallengeModal(false)}
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
                  setChallengeRecordType("decision");
                  if (!challengeTitle.trim() || challengeTitle.startsWith("Meeting") || challengeTitle.startsWith("Discussion")) {
                    setChallengeTitle(`Discussion ${decisions.filter((d) => d.record_type !== "meeting").length + 1}`);
                  }
                }}
                className={`py-1.5 px-3 rounded-[3px] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  challengeRecordType === "decision"
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
                  setChallengeRecordType("meeting");
                  if (!challengeTitle.trim() || challengeTitle.startsWith("Meeting") || challengeTitle.startsWith("Discussion")) {
                    setChallengeTitle(`Meeting ${decisions.filter((d) => d.record_type === "meeting").length + 1}`);
                  }
                }}
                className={`py-1.5 px-3 rounded-[3px] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  challengeRecordType === "meeting"
                    ? "bg-[#FCFBF8] text-[#1B4332] shadow-2xs font-semibold"
                    : "text-[#5A6275] hover:text-[#161E33]"
                }`}
              >
                <Users className="w-3.5 h-3.5 text-[#2D6A4F]" />
                <span>Meeting</span>
              </button>
            </div>

            {error && (
              <div className="mb-3 p-2.5 rounded-[4px] bg-red-50 border border-red-200 text-red-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleChallengeDecision} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#161E33] mb-1">
                  Workspace
                </label>
                <select
                  value={challengeFolderId}
                  onChange={(e) => setChallengeFolderId(Number(e.target.value))}
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
                    {challengeRecordType === "meeting" ? "Meeting title or subject" : "What decision are you weighing?"}
                  </label>
                  <SpeechDictationButton
                    onTranscript={(text) =>
                      setChallengeTitle((prev) => (prev ? `${prev} ${text}` : text))
                    }
                    title="Dictate title"
                  />
                </div>
                <textarea
                  required
                  rows={3}
                  value={challengeTitle}
                  onChange={(e) => setChallengeTitle(e.target.value)}
                  placeholder={
                    challengeRecordType === "meeting"
                      ? "e.g. Sprint Architecture Sync, Vendor Security Review"
                      : "e.g. Choose between Kubernetes vs Cloud Run for multi-region scale"
                  }
                  className="w-full px-3 py-2 text-[13px] bg-[#FCFBF8] border border-[#D9D2C3] rounded-[4px] text-[#161E33] placeholder-[#8B909C] focus:border-[#2F5D8F] focus:ring-2 focus:ring-[#2F5D8F]/25 focus:outline-none transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#D9D2C3]">
                <button
                  type="button"
                  onClick={() => setShowChallengeModal(false)}
                  className="px-3.5 py-1.5 text-[13px] font-medium text-[#5A6275] hover:text-[#161E33] rounded-[4px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={challengeSubmitting}
                  className={`px-4 py-1.5 text-white text-[13px] font-medium rounded-[4px] transition-colors disabled:opacity-50 ${
                    challengeRecordType === "meeting"
                      ? "bg-[#1B4332] hover:bg-[#2D6A4F]"
                      : "bg-[#161E33] hover:bg-[#232C47]"
                  }`}
                >
                  {challengeSubmitting
                    ? "Creating..."
                    : challengeRecordType === "meeting"
                    ? "Record meeting"
                    : "Start decision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
