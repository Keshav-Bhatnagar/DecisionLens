"use client";

import { useEffect, useState, useCallback, useMemo, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import ModalPortal from "@/components/ModalPortal";
import {
  getFolder,
  getDecisions,
  createDecision,
  updateDecision,
  deleteFolder,
  Folder,
  Decision,
} from "@/lib/api";
import {
  Plus,
  Trash2,
  AlertCircle,
  X,
  Loader2,
  ArrowRight,
  Search,
} from "lucide-react";

const FAULT_LINE_NAMES = [
  "Assumptions",
  "Evidence",
  "Blind spots",
  "Bias",
  "Trade-offs",
  "Alternatives",
] as const;

type FaultLineName = (typeof FAULT_LINE_NAMES)[number];

// Default fault line levels (0 = OPEN, 1 = STARTED, 2 = EXAMINED)
function getDecisionFaultLines(d: Decision): Record<FaultLineName, number> {
  const stored = (d.fault_lines || {}) as Record<string, number>;
  return {
    Assumptions: typeof stored["Assumptions"] === "number" ? stored["Assumptions"] : 0,
    Evidence: typeof stored["Evidence"] === "number" ? stored["Evidence"] : 0,
    "Blind spots": typeof stored["Blind spots"] === "number" ? stored["Blind spots"] : 0,
    Bias: typeof stored["Bias"] === "number" ? stored["Bias"] : 0,
    "Trade-offs": typeof stored["Trade-offs"] === "number" ? stored["Trade-offs"] : 0,
    Alternatives: typeof stored["Alternatives"] === "number" ? stored["Alternatives"] : 0,
  };
}

// Single Source of Truth for Status
// Status rule: DECIDED when marked decided; NEEDS EVIDENCE when any fault line started/examined but Evidence is open; otherwise UNDER SCRUTINY
function deriveDecisionStatus(d: Decision, levels?: Record<FaultLineName, number>): "decided" | "evidence" | "scrutiny" {
  if (d.status === "decided") return "decided";
  const fl = levels || getDecisionFaultLines(d);
  const anyStarted = Object.values(fl).some((v) => v > 0);
  const evidenceOpen = fl["Evidence"] === 0;
  if (anyStarted && evidenceOpen) return "evidence";
  return "scrutiny";
}

function countExamined(fl: Record<FaultLineName, number>): number {
  return Object.values(fl).filter((v) => v === 2).length;
}

// Animated Radar Hexagon Component
function HexagonRadar({
  levels,
}: {
  levels: Record<FaultLineName, number>;
}) {
  const center = { x: 150, y: 145 };
  const maxR = 80;

  // 6 angles clockwise from top (-PI/2)
  const angles = useMemo(() => {
    return [
      -Math.PI / 2, // Assumptions (top)
      -Math.PI / 6, // Evidence (top-right)
      Math.PI / 6,  // Blind spots (bottom-right)
      Math.PI / 2,  // Bias (bottom)
      (5 * Math.PI) / 6, // Trade-offs (bottom-left)
      (7 * Math.PI) / 6, // Alternatives (top-left)
    ];
  }, []);

  // Compute radius per fault line (0 = tiny 7px for visibility, 1 = 44px, 2 = 80px)
  const targetRadii = useMemo(() => {
    return FAULT_LINE_NAMES.map((name) => {
      const lvl = levels[name] ?? 0;
      if (lvl === 0) return 7;
      if (lvl === 1) return 44;
      return maxR;
    });
  }, [levels, maxR]);

  // Smooth interpolation tween
  const [animatedRadii, setAnimatedRadii] = useState<number[]>(targetRadii);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setAnimatedRadii(targetRadii);
      return;
    }

    const startRadii = [...animatedRadii];
    const duration = 300; // ms
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out quad
      const ease = 1 - (1 - progress) * (1 - progress);

      const next = startRadii.map((start, i) => {
        const target = targetRadii[i];
        return start + (target - start) * ease;
      });

      setAnimatedRadii(next);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };

    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [targetRadii]);

  const polygonPoints = useMemo(() => {
    return animatedRadii
      .map((r, i) => {
        const a = angles[i];
        const x = center.x + r * Math.cos(a);
        const y = center.y + r * Math.sin(a);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [animatedRadii, angles, center]);

  const outerGridPoints = useMemo(() => {
    return angles
      .map((a) => {
        const x = center.x + maxR * Math.cos(a);
        const y = center.y + maxR * Math.sin(a);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [angles, center, maxR]);

  const midGridPoints = useMemo(() => {
    const midR = maxR * 0.5;
    return angles
      .map((a) => {
        const x = center.x + midR * Math.cos(a);
        const y = center.y + midR * Math.sin(a);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [angles, center, maxR]);

  // Label configuration with anchor positioning
  const labelsMeta: Array<{
    text: string;
    x: number;
    y: number;
    anchor: "middle" | "start" | "end";
  }> = [
    { text: "ASSUMPTIONS", x: 150, y: 48, anchor: "middle" },
    { text: "EVIDENCE", x: 236, y: 98, anchor: "start" },
    { text: "BLIND SPOTS", x: 236, y: 196, anchor: "start" },
    { text: "BIAS", x: 150, y: 244, anchor: "middle" },
    { text: "TRADE-OFFS", x: 64, y: 196, anchor: "end" },
    { text: "ALTERNATIVES", x: 64, y: 98, anchor: "end" },
  ];

  return (
    <div className="w-full flex items-center justify-center py-2 select-none">
      <svg
        viewBox="-60 6 420 288"
        className="w-full max-w-[380px] h-auto overflow-visible"
        aria-hidden="true"
      >
        {/* 100% outer grid ring */}
        <polygon
          points={outerGridPoints}
          className="fill-none stroke-[#cfc7b2] dark:stroke-[#38332C]"
          strokeWidth="1"
        />

        {/* 50% mid grid ring */}
        <polygon
          points={midGridPoints}
          className="fill-none stroke-[#cfc7b2]/70 dark:stroke-[#38332C]/70"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* 6 Radial Axes */}
        {angles.map((a, i) => {
          const x2 = center.x + maxR * Math.cos(a);
          const y2 = center.y + maxR * Math.sin(a);
          return (
            <line
              key={i}
              x1={center.x}
              y1={center.y}
              x2={x2}
              y2={y2}
              className="stroke-[#cfc7b2] dark:stroke-[#38332C]"
              strokeWidth="1"
            />
          );
        })}

        {/* Blue polygon radar shape */}
        <polygon
          points={polygonPoints}
          className="fill-[#2B4C8C]/22 dark:fill-[#D4AA50]/25 stroke-[#2B4C8C] dark:stroke-[#D4AA50]"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />

        {/* Radar vertices dots */}
        {animatedRadii.map((r, i) => {
          const a = angles[i];
          const x = center.x + r * Math.cos(a);
          const y = center.y + r * Math.sin(a);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3.5"
              className="fill-[#2B4C8C] dark:fill-[#D4AA50]"
            />
          );
        })}

        {/* Labels outside axes */}
        {labelsMeta.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={lbl.y}
            textAnchor={lbl.anchor}
            className="font-courier text-[12px] font-bold fill-[#4f4b40] dark:fill-[#A89F91] tracking-[0.08em]"
          >
            {lbl.text}
          </text>
        ))}
      </svg>
    </div>
  );
}

// 6-Segment Status Bar Component
function SixSegmentBar({
  levels,
}: {
  levels: Record<FaultLineName, number>;
}) {
  const examined = countExamined(levels);
  return (
    <div className="flex items-center gap-1.5" title="Fault lines progress">
      <div className="flex items-center gap-1">
        {FAULT_LINE_NAMES.map((name) => {
          const lvl = levels[name] ?? 0;
          return (
            <span
              key={name}
              title={`${name}: ${lvl === 2 ? "EXAMINED" : lvl === 1 ? "STARTED" : "OPEN"}`}
              className={`inline-block w-[26px] h-[8px] rounded-none shrink-0 ${
                lvl === 2
                  ? "bg-[#2B4C8C] dark:bg-[#D4AA50] border border-[#2B4C8C] dark:border-[#D4AA50]"
                  : lvl === 1
                  ? "bg-[linear-gradient(to_right,#2B4C8C_50%,transparent_50%)] dark:bg-[linear-gradient(to_right,#D4AA50_50%,transparent_50%)] border border-[#2B4C8C] dark:border-[#D4AA50]"
                  : "bg-transparent border border-[#cfc7b2] dark:border-[#524B40]"
              }`}
            />
          );
        })}
      </div>
      <span className="font-courier text-xs font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] ml-1">
        {examined}/6
      </span>
    </div>
  );
}

export default function FolderDetailPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const router = useRouter();
  const { folderId: folderIdStr } = use(params);
  const folderId = parseInt(folderIdStr, 10);

  const [folder, setFolder] = useState<Folder | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDecisionId, setSelectedDecisionId] = useState<number | null>(null);

  // Filter & View State
  const [statusFilter, setStatusFilter] = useState<"all" | "scrutiny" | "evidence" | "decided">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"index" | "board">("index");

  // New Decision Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadFolderData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fData, dData] = await Promise.all([
        getFolder(folderId),
        getDecisions(folderId),
      ]);
      setFolder(fData);
      setDecisions(dData);
      if (dData.length > 0 && selectedDecisionId === null) {
        setSelectedDecisionId(dData[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [folderId, selectedDecisionId]);

  useEffect(() => {
    loadFolderData();
  }, [loadFolderData]);

  // Selected Decision helper
  const selectedDecision = useMemo(() => {
    if (!decisions.length) return null;
    return decisions.find((d) => d.id === selectedDecisionId) || decisions[0];
  }, [decisions, selectedDecisionId]);

  // Open Modal Handler
  const handleOpenCreateModal = useCallback(() => {
    setTitle("");
    setError(null);
    setShowCreateModal(true);
  }, []);

  // Keyboard shortcut 'N' to open modal, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleOpenCreateModal();
      } else if (e.key === "Escape" && showCreateModal) {
        setShowCreateModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCreateModal, handleOpenCreateModal]);

  // Create Decision Handler
  const handleCreateDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please specify the decision you are facing");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const initialFaultLines: Record<FaultLineName, number> = {
        Assumptions: 0,
        Evidence: 0,
        "Blind spots": 0,
        Bias: 0,
        "Trade-offs": 0,
        Alternatives: 0,
      };

      const newD = await createDecision({
        title: title.trim(),
        problem_statement: title.trim(),
        status: "draft",
        folder_id: folderId,
        record_type: "decision",
      });

      // Update local state: prepend to list, select it, trigger fade-in
      const withFaultLines: Decision = {
        ...newD,
        fault_lines: initialFaultLines,
      };
      setDecisions((prev) => [withFaultLines, ...prev]);
      setSelectedDecisionId(newD.id);
      setNewlyCreatedId(newD.id);
      setShowCreateModal(false);
      setTitle("");
      router.push(`/decisions/${newD.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create decision");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Fault Line Level: 0 -> 1 -> 2 -> 0
  const handleCycleFaultLine = async (name: FaultLineName) => {
    if (!selectedDecision) return;

    const currentLevels = getDecisionFaultLines(selectedDecision);
    const nextLevel = ((currentLevels[name] ?? 0) + 1) % 3;
    const nextFaultLines = {
      ...currentLevels,
      [name]: nextLevel,
    };

    const nextStatusCategory = deriveDecisionStatus(selectedDecision, nextFaultLines);
    // Keep decided if already decided unless re-opened
    const targetStatus = selectedDecision.status === "decided" ? "decided" : nextStatusCategory === "evidence" ? "draft" : "evaluating";

    // Optimistic update
    const updated: Decision = {
      ...selectedDecision,
      fault_lines: nextFaultLines,
      status: targetStatus,
    };

    setDecisions((prev) => prev.map((d) => (d.id === selectedDecision.id ? updated : d)));

    try {
      await updateDecision(selectedDecision.id, {
        fault_lines: nextFaultLines,
        status: targetStatus,
      });
    } catch {
      // Revert if error
      setDecisions((prev) => prev.map((d) => (d.id === selectedDecision.id ? selectedDecision : d)));
    }
  };

  // Toggle Decided status
  const handleToggleDecided = async () => {
    if (!selectedDecision) return;
    const isCurrentlyDecided = selectedDecision.status === "decided";
    const nextStatus = isCurrentlyDecided ? "evaluating" : "decided";

    const updated: Decision = {
      ...selectedDecision,
      status: nextStatus,
    };

    setDecisions((prev) => prev.map((d) => (d.id === selectedDecision.id ? updated : d)));

    try {
      await updateDecision(selectedDecision.id, {
        status: nextStatus,
      });
    } catch {
      setDecisions((prev) => prev.map((d) => (d.id === selectedDecision.id ? selectedDecision : d)));
    }
  };

  const handleDeleteFolder = async () => {
    if (!confirm(`Are you sure you want to delete workspace "${folder?.name}" and all records inside it?`)) {
      return;
    }
    try {
      await deleteFolder(folderId);
      router.push("/dashboard");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete workspace");
    }
  };

  // Counts based on Single Source of Truth
  const counts = useMemo(() => {
    let scrutiny = 0;
    let evidence = 0;
    let decided = 0;
    decisions.forEach((d) => {
      const cat = deriveDecisionStatus(d);
      if (cat === "decided") decided++;
      else if (cat === "evidence") evidence++;
      else scrutiny++;
    });
    return { all: decisions.length, scrutiny, evidence, decided };
  }, [decisions]);

  // Filtered decisions list
  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      const cat = deriveDecisionStatus(d);
      const matchesStatus = statusFilter === "all" || cat === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        (d.problem_statement && d.problem_statement.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [decisions, statusFilter, searchQuery]);

  // Board columns
  const boardColumns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filterQuery = (list: Decision[]) =>
      list.filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          (d.problem_statement && d.problem_statement.toLowerCase().includes(q))
      );

    return {
      scrutiny: filterQuery(decisions.filter((d) => deriveDecisionStatus(d) === "scrutiny")),
      evidence: filterQuery(decisions.filter((d) => deriveDecisionStatus(d) === "evidence")),
      decided: filterQuery(decisions.filter((d) => deriveDecisionStatus(d) === "decided")),
    };
  }, [decisions, searchQuery]);

  // Selected decision fault lines and hint
  const selectedLevels = selectedDecision ? getDecisionFaultLines(selectedDecision) : null;
  const inspectorHint = useMemo(() => {
    if (!selectedLevels) return "";
    const allOpen = Object.values(selectedLevels).every((lvl) => lvl === 0);
    if (allOpen) return "Nothing has been challenged yet. Start with the assumptions.";
    const firstOpen = FAULT_LINE_NAMES.find((name) => selectedLevels[name] === 0);
    if (firstOpen) return `Next, look at ${firstOpen.toLowerCase()}.`;
    return "All six fault lines examined. Ready to review and commit.";
  }, [selectedLevels]);

  return (
    <AppShell
      activeFolderId={folderId}
      breadcrumbs={[
        { label: folder?.name || "Workspace", href: `/folders/${folderId}` },
      ]}
      onRefresh={loadFolderData}
      maxWidthClass="max-w-[1330px]"
    >
      <div className="space-y-6 font-courier text-[#1d1d1b] dark:text-[#F0EAE1]">
        {error && !folder ? (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-none p-6 text-red-700 dark:text-red-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <Link
              href="/dashboard"
              className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1]"
            >
              Back to Workspaces
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-40 bg-[#EDE7D6] dark:bg-[#221F1C] rounded-none border border-[#cfc7b2] dark:border-[#38332C]" />
            <div className="h-96 bg-[#EDE7D6] dark:bg-[#221F1C] rounded-none border border-[#cfc7b2] dark:border-[#38332C]" />
          </div>
        ) : folder ? (
          <>
            {/* A) MASTHEAD (Full-bleed typographic header with faint watermark) */}
            <div className="relative overflow-hidden pt-2 pb-6 border-b border-[#cfc7b2] dark:border-[#38332C]">
              {/* Giant faint DECISIONS watermark behind right side */}
              <div
                aria-hidden="true"
                className="absolute right-0 bottom-[-20px] text-[#1d1d1b]/[0.035] dark:text-[#F0EAE1]/[0.035] font-newsreader font-bold text-[100px] sm:text-[150px] lg:text-[200px] leading-none select-none pointer-events-none -z-0 tracking-tight"
              >
                DECISIONS
              </div>

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="space-y-3 max-w-4xl">
                  {/* Small amber eyebrow */}
                  <div className="flex items-center gap-2.5">
                    <span className="w-[34px] h-[3px] bg-[#7a4e10] dark:bg-[#D4AA50] inline-block" />
                    <span className="font-courier text-xs font-bold uppercase tracking-[0.1em] text-[#7a4e10] dark:text-[#D4AA50]">
                      WORKSPACE
                    </span>
                  </div>

                  {/* Huge Serif Workspace Name */}
                  <h1 className="font-newsreader text-[56px] sm:text-[76px] lg:text-[96px] xl:text-[112px] font-normal leading-[0.92] tracking-tight text-[#1d1d1b] dark:text-[#F0EAE1]">
                    {folder.name}
                  </h1>

                  {/* Description: Italic serif */}
                  {folder.description && folder.description.trim() ? (
                    <p className="font-newsreader italic text-[17px] sm:text-[19px] text-[#4f4b40] dark:text-[#A89F91] leading-relaxed max-w-3xl">
                      {folder.description}
                    </p>
                  ) : (
                    <p className="font-newsreader italic text-[17px] sm:text-[19px] text-[#7B8491] dark:text-[#8E867B] leading-relaxed max-w-3xl">
                      No description for this workspace.
                    </p>
                  )}

                  {/* Meta line in mono uppercase */}
                  <div className="flex items-center gap-2 text-xs font-courier font-bold uppercase tracking-[0.08em] text-[#4f4b40] dark:text-[#A89F91] pt-1">
                    <span>{decisions.length} {decisions.length === 1 ? "DECISION" : "DECISIONS"}</span>
                    <span>•</span>
                    <span>CREATED {new Date(folder.created_at).toLocaleDateString("en-US")}</span>
                  </div>
                </div>

                {/* Right side: ONE primary + NEW DECISION button and delete button */}
                <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-end">
                  <button
                    type="button"
                    onClick={handleOpenCreateModal}
                    className="px-5 py-3 bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold font-courier uppercase tracking-wider rounded-none transition-colors flex items-center gap-2"
                    title="Start challenging a new decision (Shortcut: N)"
                  >
                    <span>＋</span>
                    <span>NEW DECISION</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteFolder}
                    title="Delete workspace"
                    className="p-3 text-[#7B8491] hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* B) TOOLBAR (1px dark top rule, 1px light bottom rule) */}
            <div className="border-t border-[#1d1d1b]/70 dark:border-[#38332C] border-b border-[#cfc7b2] dark:border-[#38332C]/70 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 font-courier">
              {/* Left: Filter tabs (Active = black with cream text; inactive = plain mono text without box) */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none ${
                    statusFilter === "all"
                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                      : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                  }`}
                >
                  ALL ({counts.all})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "scrutiny"}
                  onClick={() => setStatusFilter("scrutiny")}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none ${
                    statusFilter === "scrutiny"
                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                      : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                  }`}
                >
                  UNDER SCRUTINY ({counts.scrutiny})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "evidence"}
                  onClick={() => setStatusFilter("evidence")}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none ${
                    statusFilter === "evidence"
                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                      : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                  }`}
                >
                  NEEDS EVIDENCE ({counts.evidence})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === "decided"}
                  onClick={() => setStatusFilter("decided")}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-none ${
                    statusFilter === "decided"
                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                      : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                  }`}
                >
                  DECIDED ({counts.decided})
                </button>
              </div>

              {/* Right: Search input & INDEX / BOARD toggle */}
              <div className="flex items-center gap-3 self-end md:self-auto">
                <div className="relative w-48 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-[#7B8491] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="SEARCH"
                    aria-label="Search decisions by title"
                    className="w-full pl-8 pr-7 py-1.5 text-xs font-courier uppercase tracking-wider bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center border border-[#cfc7b2] dark:border-[#38332C]">
                  <button
                    type="button"
                    onClick={() => setViewMode("index")}
                    className={`px-3 py-1.5 text-xs font-courier font-bold uppercase tracking-wider transition-colors ${
                      viewMode === "index"
                        ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                        : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C]"
                    }`}
                  >
                    INDEX
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("board")}
                    className={`px-3 py-1.5 text-xs font-courier font-bold uppercase tracking-wider transition-colors ${
                      viewMode === "board"
                        ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                        : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C]"
                    }`}
                  >
                    BOARD
                  </button>
                </div>
              </div>
            </div>

            {/* C) FULL-WIDTH BODY: Direct Navigation List or Board */}
            <div className="w-full pt-2">
              {viewMode === "index" ? (
                /* D) INDEX VIEW: Full-width clickable rows */
                filteredDecisions.length === 0 ? (
                  <div className="bg-[#EDE7D6] dark:bg-[#221F1C] rounded-none border border-dashed border-[#cfc7b2] dark:border-[#38332C] p-10 text-center transition-colors">
                    <p className="font-newsreader italic text-[18px] text-[#4f4b40] dark:text-[#A89F91]">
                      No decisions here yet. Bring the one you are about to make.
                    </p>
                  </div>
                ) : (
                  <div className="border-t border-[#cfc7b2] dark:border-[#38332C]">
                    {filteredDecisions.map((decision, index) => {
                      const levels = getDecisionFaultLines(decision);
                      const statusCat = deriveDecisionStatus(decision, levels);
                      const isDecided = statusCat === "decided";
                      const isEvidence = statusCat === "evidence";
                      const isNewlyCreated = decision.id === newlyCreatedId;
                      const numStr = String(index + 1).padStart(2, "0");

                      return (
                        <Link
                          key={decision.id}
                          href={`/decisions/${decision.id}`}
                          className={`group flex items-center justify-between gap-4 py-4 px-3 sm:px-5 border-b border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer select-none border-l-[5px] border-l-transparent hover:border-l-[#7a4e10] dark:hover:border-l-[#D4AA50] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] ${
                            isNewlyCreated ? "animate-fadeIn" : ""
                          }`}
                        >
                          {/* Col 1: Number */}
                          <span className="font-courier text-xs font-bold text-[#7a4e10] dark:text-[#D4AA50] w-6 shrink-0 pt-0.5">
                            {numStr}
                          </span>

                          {/* Col 2: Content */}
                          <div className="flex-1 min-w-0 space-y-2">
                            {/* Row 1: Status badge + date */}
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`font-courier text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-none ${
                                  isDecided
                                    ? "text-[#1B4332] dark:text-[#52b788] bg-[#E4EFE7] dark:bg-[#142d22]"
                                    : isEvidence
                                    ? "text-[#8F2D2D] dark:text-[#E57373] border border-[#8F2D2D] dark:border-[#E57373] bg-transparent"
                                    : "text-[#7a4e10] dark:text-[#D4AA50] border border-[#7a4e10] dark:border-[#D4AA50] bg-transparent"
                                }`}
                              >
                                {isDecided
                                  ? "DECIDED"
                                  : isEvidence
                                  ? "NEEDS EVIDENCE"
                                  : "UNDER SCRUTINY"}
                              </span>

                              <span className="font-courier text-xs text-[#7B8491] uppercase tracking-wider">
                                {new Date(decision.created_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            </div>

                            {/* Row 2: Title in Serif */}
                            <h2 className="font-newsreader text-[24px] sm:text-[32px] font-normal text-[#1d1d1b] dark:text-[#F0EAE1] leading-tight group-hover:text-[#2B4C8C] dark:group-hover:text-[#D4AA50] transition-colors truncate">
                              {decision.title}
                            </h2>

                            {/* Row 3: Six-segment bar + n/6 */}
                            <SixSegmentBar levels={levels} />
                          </div>

                          {/* Col 3: Direct Open Action */}
                          <div className="flex items-center gap-2 text-xs font-courier font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                            <span className="hidden sm:inline">OPEN</span>
                            <ArrowRight className="w-5 h-5 text-[#7a4e10] dark:text-[#D4AA50] transition-transform duration-200 ease-out group-hover:translate-x-1.5 motion-reduce:transform-none" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )
              ) : (
                /* E) BOARD VIEW: Three flat columns inside one 1px bordered grid */
                <div className="grid grid-cols-1 md:grid-cols-3 border border-[#cfc7b2] dark:border-[#38332C] divide-y md:divide-y-0 md:divide-x divide-[#cfc7b2] dark:divide-[#38332C] bg-[#F4F0E6] dark:bg-[#181614]">
                  {/* Column 1: Under Scrutiny */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[#cfc7b2] dark:border-[#38332C]">
                      <span className="font-courier text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        UNDER SCRUTINY
                      </span>
                      <span className="font-courier text-xs font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                        {boardColumns.scrutiny.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {boardColumns.scrutiny.map((d) => (
                        <Link
                          key={d.id}
                          href={`/decisions/${d.id}`}
                          className="block p-4 border border-[#cfc7b2] dark:border-[#38332C] border-l-4 border-l-[#7a4e10] dark:border-l-[#D4AA50] bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 hover:bg-[#EDE7D6] dark:hover:bg-[#221F1C] hover:border-[#2B4C8C] dark:hover:border-[#D4AA50] transition-all cursor-pointer shadow-2xs group"
                        >
                          <h3 className="font-newsreader text-[20px] font-normal leading-snug line-clamp-2 text-[#1d1d1b] dark:text-[#F0EAE1] group-hover:text-[#2B4C8C] dark:group-hover:text-[#D4AA50] mb-3 transition-colors">
                            {d.title}
                          </h3>
                          <SixSegmentBar levels={getDecisionFaultLines(d)} />
                          <div className="pt-3 mt-3 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 flex items-center justify-between text-[11px] font-courier font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                            <span>OPEN</span>
                            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* Column 2: Needs Evidence */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[#cfc7b2] dark:border-[#38332C]">
                      <span className="font-courier text-xs font-bold uppercase tracking-wider text-[#8F2D2D] dark:text-[#E57373]">
                        NEEDS EVIDENCE
                      </span>
                      <span className="font-courier text-xs font-bold text-[#8F2D2D] dark:text-[#E57373]">
                        {boardColumns.evidence.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {boardColumns.evidence.map((d) => (
                        <Link
                          key={d.id}
                          href={`/decisions/${d.id}`}
                          className="block p-4 border border-[#cfc7b2] dark:border-[#38332C] border-l-4 border-l-[#8F2D2D] dark:border-l-[#E57373] bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 hover:bg-[#EDE7D6] dark:hover:bg-[#221F1C] hover:border-[#2B4C8C] dark:hover:border-[#D4AA50] transition-all cursor-pointer shadow-2xs group"
                        >
                          <h3 className="font-newsreader text-[20px] font-normal leading-snug line-clamp-2 text-[#1d1d1b] dark:text-[#F0EAE1] group-hover:text-[#2B4C8C] dark:group-hover:text-[#D4AA50] mb-3 transition-colors">
                            {d.title}
                          </h3>
                          <SixSegmentBar levels={getDecisionFaultLines(d)} />
                          <div className="pt-3 mt-3 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 flex items-center justify-between text-[11px] font-courier font-bold text-[#8F2D2D] dark:text-[#E57373] uppercase tracking-wider">
                            <span>OPEN</span>
                            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* Column 3: Decided */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[#cfc7b2] dark:border-[#38332C]">
                      <span className="font-courier text-xs font-bold uppercase tracking-wider text-[#1B4332] dark:text-[#52b788]">
                        DECIDED
                      </span>
                      <span className="font-courier text-xs font-bold text-[#1B4332] dark:text-[#52b788]">
                        {boardColumns.decided.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {boardColumns.decided.map((d) => (
                        <Link
                          key={d.id}
                          href={`/decisions/${d.id}`}
                          className="block p-4 border border-[#cfc7b2] dark:border-[#38332C] border-l-4 border-l-[#1B4332] dark:border-l-[#52b788] bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 hover:bg-[#EDE7D6] dark:hover:bg-[#221F1C] hover:border-[#2B4C8C] dark:hover:border-[#D4AA50] transition-all cursor-pointer shadow-2xs group"
                        >
                          <h3 className="font-newsreader text-[20px] font-normal leading-snug line-clamp-2 text-[#1d1d1b] dark:text-[#F0EAE1] group-hover:text-[#2B4C8C] dark:group-hover:text-[#D4AA50] mb-3 transition-colors">
                            {d.title}
                          </h3>
                          <SixSegmentBar levels={getDecisionFaultLines(d)} />
                          <div className="pt-3 mt-3 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 flex items-center justify-between text-[11px] font-courier font-bold text-[#1B4332] dark:text-[#52b788] uppercase tracking-wider">
                            <span>OPEN</span>
                            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* I) NEW DECISION MODAL */}
        {showCreateModal && (
          <ModalPortal>
            <div
              className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-courier"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowCreateModal(false);
              }}
            >
              <div className="bg-[#EDE7D6] dark:bg-[#221F1C] rounded-none shadow-2xl border-2 border-l-5 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] max-w-lg w-full p-6 text-[#1d1d1b] dark:text-[#F0EAE1]">
                <div className="flex items-center justify-between pb-3 border-b border-[#cfc7b2] dark:border-[#38332C] mb-4">
                  <div>
                    <span className="font-courier text-xs font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-[0.1em] block">
                      NEW DECISION
                    </span>
                    <h3 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                      What decision are you facing?
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="text-[#7B8491] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] transition p-1 rounded-none"
                    aria-label="Close dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs rounded-none border border-red-200 dark:border-red-900 flex items-center gap-2 font-courier">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleCreateDecision} className="space-y-4 font-courier text-xs sm:text-[13px]">
                  <div>
                    <label className="block text-xs font-bold text-[#1d1d1b] dark:text-[#F0EAE1] font-courier uppercase tracking-wider mb-1.5">
                      Decision Question or Dilemma <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      autoFocus
                      rows={3}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Should we migrate our production infrastructure to the cloud?"
                      className="w-full px-3 py-2 text-base font-newsreader bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                    />
                    <p className="mt-1.5 text-[11px] font-courier text-[#7B8491] dark:text-[#A89F91]">
                      Sets your core problem statement and frames deliberation.
                    </p>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#cfc7b2] dark:border-[#38332C]">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 font-courier text-xs font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] rounded-none transition-colors"
                    >
                      CANCEL
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2.5 font-courier text-xs font-bold uppercase tracking-wider rounded-none transition-colors flex items-center gap-1.5 disabled:opacity-50 bg-[#1d1d1b] hover:bg-[#2B4C8C] text-[#F4F0E6] border border-[#1d1d1b] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64]"
                    >
                      {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isSubmitting ? "INITIALIZING..." : "START DELIBERATION →"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </ModalPortal>
        )}
      </div>
    </AppShell>
  );
}
