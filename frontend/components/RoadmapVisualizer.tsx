"use client";

import React, { useState, useMemo } from "react";
import {
  RoadmapData,
  RoadmapPhase,
  RoadmapTask,
} from "@/lib/api";
import {
  Check,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  Calendar,
  User,
  Filter,
  Search,
  ArrowRight,
  ChevronRight,
  X,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
  Layers,
  GitBranch,
  AlertCircle,
  AlertTriangle,
  CalendarDays,
} from "lucide-react";

interface RoadmapVisualizerProps {
  roadmap: RoadmapData;
  onUpdateRoadmap: (updated: RoadmapData) => void;
  onSaveRoadmap: () => Promise<void>;
  isSaving: boolean;
  isReadOnly?: boolean;
}

export default function RoadmapVisualizer({
  roadmap,
  onUpdateRoadmap,
  onSaveRoadmap,
  isSaving,
  isReadOnly = false,
}: RoadmapVisualizerProps) {
  // View mode: Visual Interactive Graph (roadmap.sh track) vs Sprint Checklist
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");

  // Selected task for the detail drawer / modal inspector
  const [selectedTask, setSelectedTask] = useState<{
    phaseId: string;
    task: RoadmapTask;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");

  // Project Kickoff Date
  const [kickoffDate, setKickoffDate] = useState<string>(() => {
    return roadmap.start_date || roadmap.kickoff_date || new Date().toISOString().split("T")[0];
  });

  // Adding task inline under a phase
  const [addingTaskPhaseId, setAddingTaskPhaseId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState("");
  const [newTaskTimeline, setNewTaskTimeline] = useState("");

  // Map of all tasks by ID for fast lookup and dependency resolution
  const taskMap = useMemo(() => {
    const map = new Map<string, { phase: RoadmapPhase; task: RoadmapTask }>();
    roadmap.phases.forEach((phase) => {
      phase.tasks.forEach((task) => {
        map.set(task.task_id, { phase, task });
      });
    });
    return map;
  }, [roadmap]);

  // Dynamically extract all available roles across all tasks (NO hardcoding)
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    roadmap.phases.forEach((phase) => {
      phase.tasks.forEach((task) => {
        if (task.owner_role && task.owner_role.trim()) {
          roles.add(task.owner_role.trim());
        }
      });
    });
    return ["ALL", ...Array.from(roles)];
  }, [roadmap]);

  // Overall progress statistics
  const stats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let gapsAddressed = 0;

    roadmap.phases.forEach((phase) => {
      phase.tasks.forEach((task) => {
        total += 1;
        if (task.is_completed) completed += 1;
        if (task.source_type === "gap" || (task.depends_on_gap_ids && task.depends_on_gap_ids.length > 0)) {
          gapsAddressed += 1;
        }
      });
    });

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending: total - completed, percent, gapsAddressed };
  }, [roadmap]);

  // Detect if roadmap is for personal/travel/short horizon
  const isDayBased = useMemo(() => {
    const titleLower = (roadmap.title || "").toLowerCase();
    const isPersonalTitle =
      titleLower.includes("trip") ||
      titleLower.includes("travel") ||
      titleLower.includes("vacation") ||
      titleLower.includes("holiday") ||
      titleLower.includes("manali") ||
      titleLower.includes("personal");

    return (
      isPersonalTitle ||
      roadmap.phases.some(
        (p) =>
          (p.timeline || "").toLowerCase().includes("day") ||
          p.tasks.some((t) => (t.timeline || "").toLowerCase().includes("day"))
      )
    );
  }, [roadmap]);

  // Dynamic regex parser to extract calculated offsets and units from any timeline span
  function parseTimelineSpan(timeline: string, pIdx: number): { offsetDaysStart: number; offsetDaysEnd: number } {
    const lower = (timeline || "").toLowerCase();

    // Day-based match: "days 1-2", "days 3–4", "day 5"
    const dayMatch = lower.match(/days?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/);
    if (dayMatch) {
      const startDay = parseInt(dayMatch[1], 10) - 1;
      const endDay = dayMatch[2] ? parseInt(dayMatch[2], 10) : startDay + 1;
      return { offsetDaysStart: Math.max(0, startDay), offsetDaysEnd: Math.max(startDay + 1, endDay) };
    }

    // Week-based match: "weeks 1-2", "weeks 3–4", "week 2"
    const weekMatch = lower.match(/weeks?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/);
    if (weekMatch) {
      const startWeek = parseInt(weekMatch[1], 10) - 1;
      const endWeek = weekMatch[2] ? parseInt(weekMatch[2], 10) : startWeek + 1;
      return { offsetDaysStart: Math.max(0, startWeek * 7), offsetDaysEnd: Math.max(startWeek + 1, endWeek) * 7 };
    }

    // Month-based match: "month 1", "months 2–3"
    const monthMatch = lower.match(/months?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/);
    if (monthMatch) {
      const startMonth = parseInt(monthMatch[1], 10) - 1;
      const endMonth = monthMatch[2] ? parseInt(monthMatch[2], 10) : startMonth + 1;
      return { offsetDaysStart: Math.max(0, startMonth * 30), offsetDaysEnd: Math.max(startMonth + 1, endMonth) * 30 };
    }

    // Dynamic sequential fallback
    if (isDayBased) {
      if (pIdx === 0) return { offsetDaysStart: 0, offsetDaysEnd: 2 };
      if (pIdx === 1) return { offsetDaysStart: 2, offsetDaysEnd: 5 };
      return { offsetDaysStart: 5, offsetDaysEnd: 8 };
    }
    if (pIdx === 0) return { offsetDaysStart: 0, offsetDaysEnd: 14 };
    if (pIdx === 1) return { offsetDaysStart: 14, offsetDaysEnd: 35 };
    return { offsetDaysStart: 35, offsetDaysEnd: 56 };
  }

  // Dynamic Phase Calendar Dates helper based on Kickoff Anchor
  function getPhaseDates(phaseIdx: number): { start: string; end: string; range: string } {
    try {
      const base = new Date(kickoffDate);
      if (isNaN(base.getTime())) return { start: "TBD", end: "TBD", range: "TBD" };

      const phase = roadmap.phases[phaseIdx];
      const { offsetDaysStart, offsetDaysEnd } = parseTimelineSpan(phase?.timeline || "", phaseIdx);

      const s = new Date(base.getTime() + offsetDaysStart * 86400000);
      const e = new Date(base.getTime() + offsetDaysEnd * 86400000);

      const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return {
        start: fmt(s),
        end: fmt(e),
        range: `${fmt(s)} – ${fmt(e)}`,
      };
    } catch {
      return { start: "TBD", end: "TBD", range: "TBD" };
    }
  }

  // Smart Contextual Display Helpers (Presents calculated values directly without static overrides)
  function getPhaseDisplay(phase: RoadmapPhase, pIdx: number) {
    const title = phase.title || `Phase ${pIdx + 1}: Execution Milestone`;
    const timeline = phase.timeline || (isDayBased ? `Days ${pIdx * 2 + 1}–${(pIdx + 1) * 2}` : `Weeks ${pIdx * 2 + 1}–${(pIdx + 1) * 2}`);
    return { title, timeline };
  }

  function getTaskTimelineDisplay(taskTimeline: string | undefined, pIdx: number) {
    return taskTimeline || (isDayBased ? `Day ${pIdx + 1}` : `Week ${pIdx + 1}`);
  }

  // Check if a task is blocked by incomplete prerequisite dependencies
  function getDependencyStatus(task: RoadmapTask): {
    isBlocked: boolean;
    unmetDeps: string[];
  } {
    if (!task.dependencies || task.dependencies.length === 0) {
      return { isBlocked: false, unmetDeps: [] };
    }

    const unmet: string[] = [];
    task.dependencies.forEach((depId) => {
      const depInfo = taskMap.get(depId);
      if (depInfo && !depInfo.task.is_completed) {
        unmet.push(depInfo.task.title || depId);
      }
    });

    return {
      isBlocked: unmet.length > 0,
      unmetDeps: unmet,
    };
  }

  // Toggle Task Completion
  function handleToggleTask(phaseId: string, taskId: string) {
    if (isReadOnly) return;

    const updatedPhases = roadmap.phases.map((phase) => {
      if (phase.phase_id !== phaseId) return phase;
      return {
        ...phase,
        tasks: phase.tasks.map((task) => {
          if (task.task_id !== taskId) return task;
          const nextState = !task.is_completed;
          return { ...task, is_completed: nextState };
        }),
      };
    });

    const updatedRoadmap = { ...roadmap, phases: updatedPhases };
    onUpdateRoadmap(updatedRoadmap);

    // Keep active drawer in sync
    if (selectedTask && selectedTask.task.task_id === taskId) {
      setSelectedTask({
        phaseId,
        task: { ...selectedTask.task, is_completed: !selectedTask.task.is_completed },
      });
    }
  }

  // Add Task
  function handleAddTask(phaseId: string) {
    if (isReadOnly || !newTaskTitle.trim()) return;

    const newTask: RoadmapTask = {
      task_id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      description: "Direct strategic action item",
      owner_role: newTaskOwner.trim() || "Lead",
      timeline: newTaskTimeline.trim() || "Week 1",
      dependencies: [],
      success_criteria: "Execution verified by stakeholders",
      is_completed: false,
      source_type: "decision_requirement",
      reason: "User customized execution milestone",
    };

    const updatedPhases = roadmap.phases.map((phase) => {
      if (phase.phase_id !== phaseId) return phase;
      return {
        ...phase,
        tasks: [...phase.tasks, newTask],
      };
    });

    onUpdateRoadmap({ ...roadmap, phases: updatedPhases });
    setNewTaskTitle("");
    setNewTaskOwner("");
    setNewTaskTimeline("");
    setAddingTaskPhaseId(null);
  }

  // Delete Task
  function handleDeleteTask(phaseId: string, taskId: string) {
    if (isReadOnly) return;

    const updatedPhases = roadmap.phases.map((phase) => {
      if (phase.phase_id !== phaseId) return phase;
      return {
        ...phase,
        tasks: phase.tasks.filter((t) => t.task_id !== taskId),
      };
    });

    onUpdateRoadmap({ ...roadmap, phases: updatedPhases });
    if (selectedTask && selectedTask.task.task_id === taskId) {
      setSelectedTask(null);
    }
  }

  // Filter tasks based on search, role, and status
  function filterTask(task: RoadmapTask): boolean {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = (task.description || "").toLowerCase().includes(q);
      const matchRole = (task.owner_role || "").toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchRole) return false;
    }

    if (roleFilter !== "ALL") {
      if (task.owner_role?.trim() !== roleFilter) return false;
    }

    if (statusFilter === "completed" && !task.is_completed) return false;
    if (statusFilter === "active" && task.is_completed) return false;

    return true;
  }

  return (
    <div className="space-y-6 font-courier">
      {/* 1. ROADMAP HEADER & PROGRESS BANNER */}
      <div className="bg-[#F4F0E6] dark:bg-[#1f1d1a] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#cfc7b2]/70 dark:border-[#38332C]/70">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] px-2 py-0.5 bg-[#EDE7D6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C]">
                Interactive Roadmap (roadmap.sh)
              </span>
              <span className="text-xs text-[#57534e] dark:text-[#A89F91]">
                • {stats.total} Milestones Total
              </span>
            </div>
            <h3 className="font-newsreader text-2xl sm:text-3xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
              {roadmap.title}
            </h3>
            <p className="text-xs text-[#57534e] dark:text-[#A89F91] mt-1 max-w-2xl font-sans leading-relaxed">
              Phase-gated execution path with dependency graph, verification criteria, and stakeholder assignment. Tap any milestone to inspect details.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* View Mode Switcher */}
            <div className="inline-flex border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#181614] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("graph")}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "graph"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                    : "text-[#57534e] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                }`}
                title="Interactive Node Graph (roadmap.sh track)"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Visual Graph</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "list"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                    : "text-[#57534e] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
                }`}
                title="Sprint Checklist View"
              >
                <span>Sprint List</span>
              </button>
            </div>

            {!isReadOnly && (
              <button
                type="button"
                onClick={onSaveRoadmap}
                disabled={isSaving}
                className="px-4 py-1.5 bg-[#1d1d1b] hover:bg-[#38332c] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#e0b85c] text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isSaving ? "Saving..." : "Save Roadmap"}
              </button>
            )}
          </div>
        </div>

        {/* 2. PROGRESS METRICS & KICKOFF CALENDAR */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Progress Bar Metric */}
          <div className="p-3 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-[#57534e] dark:text-[#A89F91] uppercase tracking-wider">
                Progress
              </span>
              <span className="text-[#7a4e10] dark:text-[#D4AA50] font-mono">
                {stats.percent}% ({stats.completed}/{stats.total})
              </span>
            </div>
            <div className="w-full h-2 bg-[#F4F0E6] dark:bg-[#2A2622] border border-[#cfc7b2]/70 dark:border-[#38332C] overflow-hidden">
              <div
                className="h-full bg-[#7a4e10] dark:bg-[#D4AA50] transition-all duration-300"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
          </div>

          {/* Pending Tasks */}
          <div className="p-3 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#57534e] dark:text-[#A89F91] uppercase tracking-wider block">
                Pending Actions
              </span>
              <span className="text-xl font-bold text-[#1d1d1b] dark:text-[#F0EAE1] font-mono">
                {stats.pending}
              </span>
            </div>
          </div>

          {/* Gaps Addressed */}
          <div className="p-3 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[#57534e] dark:text-[#A89F91] uppercase tracking-wider block">
                Gaps Addressed
              </span>
              <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                {stats.gapsAddressed}
              </span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>

          {/* Kickoff Anchor Date */}
          <div className="p-3 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-1">
            <span className="text-[11px] text-[#57534e] dark:text-[#A89F91] uppercase tracking-wider block flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
              Kickoff Date
            </span>
            <input
              type="date"
              value={kickoffDate}
              onChange={(e) => setKickoffDate(e.target.value)}
              disabled={isReadOnly}
              className="w-full text-xs font-mono bg-[#F4F0E6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] px-2 py-0.5 focus:outline-none focus:border-[#7a4e10] cursor-pointer"
            />
          </div>
        </div>

        {/* 3. DYNAMIC FILTER BAR */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 text-xs">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#78716c]" />
            <input
              type="text"
              placeholder="Filter roadmap milestones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] text-xs focus:outline-none focus:border-[#7a4e10]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#78716c] hover:text-[#1d1d1b]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#181614] p-0.5">
              {(["all", "active", "completed"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    statusFilter === st
                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                      : "text-[#57534e] dark:text-[#A89F91] hover:text-[#1d1d1b]"
                  }`}
                >
                  {st === "all" ? "All" : st === "active" ? "Active" : "Done"}
                </button>
              ))}
            </div>

            {/* Dynamic Role Filter Dropdown (shown only when multiple organizational teams are present) */}
            {!isDayBased && availableRoles.filter((r) => r.toLowerCase() !== "you" && r !== "ALL").length > 1 && (
              <div className="flex items-center gap-1.5 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] px-2.5 py-1">
                <Filter className="w-3 h-3 text-[#7a4e10] dark:text-[#D4AA50]" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-transparent text-xs text-[#1d1d1b] dark:text-[#F0EAE1] font-mono focus:outline-none cursor-pointer"
                >
                  {availableRoles.map((role) => (
                    <option key={role} value={role} className="bg-[#F4F0E6] dark:bg-[#1f1d1a] text-[#1d1d1b] dark:text-[#F0EAE1]">
                      {role === "ALL" ? "All Roles" : role}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. MAIN ROADMAP CANVAS */}
      {viewMode === "graph" ? (
        /* ========================================================================= */
        /* ROADMAP.SH INTERACTIVE NODE GRAPH VIEW                                    */
        /* ========================================================================= */
        <div className="space-y-8 relative pl-2 sm:pl-6">
          {/* Continuous vertical guide line running behind the phases */}
          <div className="absolute left-6 sm:left-10 top-6 bottom-6 w-0.5 bg-[#cfc7b2] dark:bg-[#38332C] z-0" />

          {roadmap.phases.map((phase, pIdx) => {
            const phaseDates = getPhaseDates(pIdx);
            const { title: phaseTitle, timeline: phaseTimeline } = getPhaseDisplay(phase, pIdx);
            const filteredTasks = phase.tasks.filter(filterTask);
            const completedCount = phase.tasks.filter((t) => t.is_completed).length;
            const isPhaseDone = phase.tasks.length > 0 && completedCount === phase.tasks.length;

            return (
              <div key={phase.phase_id} className="relative z-10 space-y-4">
                {/* PHASE HEADER NODE */}
                <div className="flex items-start gap-4">
                  {/* Phase Marker Dot */}
                  <div
                    className={`w-9 h-9 shrink-0 rounded-none flex items-center justify-center font-bold text-xs border shadow-xs transition-colors ${
                      isPhaseDone
                        ? "bg-emerald-700 text-[#F4F0E6] border-emerald-800"
                        : "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b]"
                    }`}
                  >
                    {isPhaseDone ? <Check className="w-4 h-4" /> : `0${pIdx + 1}`}
                  </div>

                  {/* Phase Title Card */}
                  <div className="flex-1 bg-[#F4F0E6] dark:bg-[#1f1d1a] border border-[#cfc7b2] dark:border-[#38332C] p-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#cfc7b2]/60 dark:border-[#38332C]/60 pb-2">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                          Phase {pIdx + 1} • {phaseTimeline}
                        </span>
                        <h4 className="font-newsreader text-xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                          {phaseTitle}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono px-2 py-0.5 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] font-bold">
                          {phaseDates.range}
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] font-bold">
                          {completedCount}/{phase.tasks.length} Done
                        </span>
                      </div>
                    </div>
                    {phase.description && (
                      <p className="text-xs text-[#57534e] dark:text-[#A89F91] mt-2 font-sans leading-relaxed">
                        {phase.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* TASKS FLOW / CONNECTED NODES */}
                <div className="ml-4 sm:ml-9 pl-6 sm:pl-8 space-y-3 border-l-2 border-dashed border-[#cfc7b2] dark:border-[#38332C]">
                  {filteredTasks.length === 0 ? (
                    <div className="p-3 bg-[#EDE7D6]/50 dark:bg-[#181614]/50 border border-dashed border-[#cfc7b2] dark:border-[#38332C] text-xs text-[#78716c] italic">
                      No milestones match current filters.
                    </div>
                  ) : (
                    filteredTasks.map((task, tIdx) => {
                      const { isBlocked, unmetDeps } = getDependencyStatus(task);
                      const isSelected = selectedTask?.task.task_id === task.task_id;

                      return (
                        <div
                          key={task.task_id}
                          className={`group relative p-4 bg-[#F4F0E6] dark:bg-[#1f1d1a] border transition-all cursor-pointer shadow-xs ${
                            isSelected
                              ? "border-[#7a4e10] dark:border-[#D4AA50] ring-1 ring-[#7a4e10] dark:ring-[#D4AA50]"
                              : task.is_completed
                              ? "border-[#cfc7b2]/70 dark:border-[#38332C]/70 opacity-80 bg-[#EDE7D6]/40"
                              : isBlocked
                              ? "border-amber-400 dark:border-amber-600/60 bg-amber-50/20"
                              : "border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50]"
                          }`}
                          onClick={() => setSelectedTask({ phaseId: phase.phase_id, task })}
                        >
                          {/* Horizontal connector line linking from the dotted track */}
                          <div className="absolute -left-6 sm:-left-8 top-6 w-6 sm:w-8 h-0.5 bg-[#cfc7b2] dark:bg-[#38332C]" />

                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {/* Completion Toggle Checkbox */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleTask(phase.phase_id, task.task_id);
                                }}
                                disabled={isReadOnly}
                                className={`mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center border transition-colors cursor-pointer ${
                                  task.is_completed
                                    ? "bg-emerald-700 text-white border-emerald-800"
                                    : isBlocked
                                    ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                                    : "bg-[#EDE7D6] dark:bg-[#181614] border-[#cfc7b2] hover:border-[#7a4e10]"
                                }`}
                                title={task.is_completed ? "Mark Incomplete" : isBlocked ? "Prerequisites Incomplete" : "Mark Complete"}
                              >
                                {task.is_completed ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : isBlocked ? (
                                  <Lock className="w-3 h-3" />
                                ) : null}
                              </button>

                              <div className="min-w-0 flex-1 space-y-1.5">
                                {/* Badges & Category Header */}
                                <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                                  {task.source_type && (
                                    <span
                                      className={`px-1.5 py-0.2 rounded-none font-bold uppercase tracking-wider border ${
                                        task.source_type === "gap"
                                          ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300"
                                          : task.source_type === "risk"
                                          ? "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300"
                                          : task.source_type === "condition"
                                          ? "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-300"
                                          : "bg-[#EDE7D6] text-[#57534e] border-[#cfc7b2]"
                                      }`}
                                    >
                                      {task.source_type === "gap"
                                        ? "Gap Clearance"
                                        : task.source_type === "risk"
                                        ? "Risk Shield"
                                        : task.source_type === "condition"
                                        ? "Pre-Condition"
                                        : "Core Milestone"}
                                    </span>
                                  )}

                                  <span className="text-[#57534e] dark:text-[#A89F91]">
                                    Timeline: <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">{getTaskTimelineDisplay(task.timeline, pIdx)}</strong>
                                  </span>

                                  {task.owner_role && task.owner_role.toLowerCase() !== "you" && !isDayBased && (
                                    <span className="text-[#57534e] dark:text-[#A89F91]">
                                      Owner: <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">{task.owner_role}</strong>
                                    </span>
                                  )}
                                </div>

                                {/* Title */}
                                <h5
                                  className={`text-sm font-bold leading-snug ${
                                    task.is_completed
                                      ? "line-through text-[#78716c]"
                                      : "text-[#1d1d1b] dark:text-[#F0EAE1]"
                                  }`}
                                >
                                  {task.title}
                                </h5>

                                {/* Description Preview */}
                                {task.description && (
                                  <p className="text-xs text-[#57534e] dark:text-[#A89F91] font-sans leading-relaxed line-clamp-2">
                                    {task.description}
                                  </p>
                                )}

                                {/* Prerequisites / Dependencies Alert Tag */}
                                {task.dependencies && task.dependencies.length > 0 && (
                                  <div className="flex items-center gap-1.5 text-[11px] font-mono mt-1 flex-wrap">
                                    <span className="text-[#78716c] flex items-center gap-1">
                                      <GitBranch className="w-3 h-3" /> Depends on:
                                    </span>
                                    {task.dependencies.map((depId) => {
                                      const depInfo = taskMap.get(depId);
                                      const isDepDone = depInfo?.task.is_completed;
                                      return (
                                        <span
                                          key={depId}
                                          className={`px-1.5 py-0.2 border text-[10px] font-bold ${
                                            isDepDone
                                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-300"
                                              : "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300"
                                          }`}
                                        >
                                          {isDepDone ? "✓ " : "⏳ "}
                                          {depInfo?.task.title ? depInfo.task.title.slice(0, 24) + "..." : depId}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right Arrow / Inspector Trigger */}
                            <div className="flex items-center gap-1 text-[#78716c] group-hover:text-[#7a4e10] dark:group-hover:text-[#D4AA50] text-xs shrink-0 self-center">
                              <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-wider">Inspect</span>
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Inline Add Task under Phase */}
                  {!isReadOnly && (
                    <div className="pt-2">
                      {addingTaskPhaseId === phase.phase_id ? (
                        <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-2.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                            Add New Milestone to Phase {pIdx + 1}
                          </span>
                          <input
                            type="text"
                            placeholder="Milestone title (e.g. Audit supplier SLA commitments)..."
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            className="w-full text-xs px-3 py-1.5 bg-[#F4F0E6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] focus:outline-none focus:border-[#7a4e10]"
                            autoFocus
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="text"
                              placeholder="Owner Role (e.g. Legal Counsel)"
                              value={newTaskOwner}
                              onChange={(e) => setNewTaskOwner(e.target.value)}
                              className="text-xs px-2.5 py-1 bg-[#F4F0E6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] focus:outline-none focus:border-[#7a4e10] w-48"
                            />
                            <input
                              type="text"
                              placeholder="Timeline (e.g. Days 1-3, Week 2)"
                              value={newTaskTimeline}
                              onChange={(e) => setNewTaskTimeline(e.target.value)}
                              className="text-xs px-2.5 py-1 bg-[#F4F0E6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] focus:outline-none focus:border-[#7a4e10] w-40"
                            />
                            <div className="flex items-center gap-2 ml-auto">
                              <button
                                type="button"
                                onClick={() => setAddingTaskPhaseId(null)}
                                className="text-xs px-3 py-1 text-[#57534e] hover:text-[#1d1d1b] cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddTask(phase.phase_id)}
                                className="text-xs px-3.5 py-1 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] font-bold uppercase tracking-wider cursor-pointer"
                              >
                                Add Milestone
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingTaskPhaseId(phase.phase_id);
                            setNewTaskTitle("");
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-[#7a4e10] dark:text-[#D4AA50] hover:underline font-bold uppercase tracking-wider cursor-pointer py-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Milestone to Phase {pIdx + 1}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ========================================================================= */
        /* SPRINT CHECKLIST (TABLE VIEW)                                            */
        /* ========================================================================= */
        <div className="space-y-6">
          {roadmap.phases.map((phase, pIdx) => {
            const { title: phaseTitle, timeline: phaseTimeline } = getPhaseDisplay(phase, pIdx);
            const filteredTasks = phase.tasks.filter(filterTask);
            return (
              <div key={phase.phase_id} className="bg-[#F4F0E6] dark:bg-[#1f1d1a] border border-[#cfc7b2] dark:border-[#38332C] p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#cfc7b2]/60 dark:border-[#38332C]/60">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                      Phase {pIdx + 1} • {phaseTimeline}
                    </span>
                    <h4 className="font-newsreader text-lg font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                      {phaseTitle}
                    </h4>
                  </div>
                  <span className="text-xs font-mono text-[#57534e]">
                    {filteredTasks.length} Milestones
                  </span>
                </div>

                <div className="divide-y divide-[#cfc7b2]/40 dark:divide-[#38332C]/40">
                  {filteredTasks.map((task) => (
                    <div
                      key={task.task_id}
                      className="py-2.5 flex items-start justify-between gap-3 hover:bg-[#EDE7D6]/50 px-2 transition-colors cursor-pointer"
                      onClick={() => setSelectedTask({ phaseId: phase.phase_id, task })}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTask(phase.phase_id, task.task_id);
                          }}
                          disabled={isReadOnly}
                          className={`mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center border ${
                            task.is_completed
                              ? "bg-emerald-700 text-white border-emerald-800"
                              : "bg-[#EDE7D6] dark:bg-[#181614] border-[#cfc7b2]"
                          }`}
                        >
                          {task.is_completed && <Check className="w-3 h-3" />}
                        </button>
                        <div>
                          <span
                            className={`text-xs font-bold ${
                              task.is_completed ? "line-through text-[#78716c]" : "text-[#1d1d1b] dark:text-[#F0EAE1]"
                            }`}
                          >
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-[#57534e] mt-0.5">
                            {task.owner_role && task.owner_role.toLowerCase() !== "you" && !isDayBased && (
                              <>
                                <span>Owner: {task.owner_role}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{getTaskTimelineDisplay(task.timeline, pIdx)}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#78716c] shrink-0 self-center" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ROADMAP.SH DETAIL INSPECTOR DRAWER / MODAL                            */}
      {/* ========================================================================= */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end bg-black/50 backdrop-blur-xs p-4 sm:p-0 animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg h-full max-h-[92vh] sm:max-h-full bg-[#F4F0E6] dark:bg-[#1f1d1a] border-l border-[#cfc7b2] dark:border-[#38332C] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#181614] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                    MILESTONE INSPECTOR
                  </span>
                  <span className="text-xs font-mono text-[#78716c]">
                    #{selectedTask.task.task_id}
                  </span>
                </div>
                <h4 className="font-newsreader text-xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                  {selectedTask.task.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="p-1 text-[#78716c] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs font-courier">
              {/* Status Switcher */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#57534e] dark:text-[#A89F91]">
                  Execution Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedTask.task.is_completed) {
                        handleToggleTask(selectedTask.phaseId, selectedTask.task.task_id);
                      }
                    }}
                    disabled={isReadOnly}
                    className={`p-2.5 border text-center font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      selectedTask.task.is_completed
                        ? "bg-emerald-700 text-white border-emerald-800"
                        : "bg-[#EDE7D6] dark:bg-[#181614] text-[#57534e] border-[#cfc7b2]"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Completed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTask.task.is_completed) {
                        handleToggleTask(selectedTask.phaseId, selectedTask.task.task_id);
                      }
                    }}
                    disabled={isReadOnly}
                    className={`p-2.5 border text-center font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      !selectedTask.task.is_completed
                        ? "bg-[#1d1d1b] text-white dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b]"
                        : "bg-[#EDE7D6] dark:bg-[#181614] text-[#57534e] border-[#cfc7b2]"
                    }`}
                  >
                    <span>In Progress / Todo</span>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#57534e] dark:text-[#A89F91]">
                  Actionable Requirements
                </label>
                <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-sans leading-relaxed text-[#1d1d1b] dark:text-[#F0EAE1]">
                  {selectedTask.task.description || "No specific detailed instructions provided."}
                </div>
              </div>

              {/* Success Criteria */}
              {selectedTask.task.success_criteria && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Done Definition / Verification Target
                  </label>
                  <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 text-xs font-sans leading-relaxed text-emerald-900 dark:text-emerald-200">
                    {selectedTask.task.success_criteria}
                  </div>
                </div>
              )}

              {/* Dependencies / Prerequisites Section */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#57534e] dark:text-[#A89F91] flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5" /> Prerequisite Dependencies
                </label>
                {selectedTask.task.dependencies && selectedTask.task.dependencies.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTask.task.dependencies.map((depId) => {
                      const depInfo = taskMap.get(depId);
                      return (
                        <div
                          key={depId}
                          onClick={() => {
                            if (depInfo) {
                              setSelectedTask({ phaseId: depInfo.phase.phase_id, task: depInfo.task });
                            }
                          }}
                          className={`p-2.5 border transition cursor-pointer flex items-center justify-between gap-2 ${
                            depInfo?.task.is_completed
                              ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 text-emerald-900 dark:text-emerald-300"
                              : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 text-amber-900 dark:text-amber-300"
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold block truncate">
                              {depInfo ? depInfo.task.title : depId}
                            </span>
                            <span className="text-[10px] font-mono opacity-80">
                              Phase: {depInfo?.phase.title || "Pre-phase"} • Owner: {depInfo?.task.owner_role || "Lead"}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 border">
                            {depInfo?.task.is_completed ? "RESOLVED" : "PENDING"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs text-[#78716c] italic">
                    Independent milestone. No prior tasks required to start execution.
                  </div>
                )}
              </div>

              {/* Rationale & Source Origin */}
              {selectedTask.task.reason && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#57534e] dark:text-[#A89F91]">
                    Governance Justification (Why this exists)
                  </label>
                  <div className="p-3 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-sans leading-relaxed text-[#57534e] dark:text-[#A89F91]">
                    {selectedTask.task.reason}
                  </div>
                </div>
              )}

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 text-xs font-mono">
                {!isDayBased && selectedTask.task.owner_role && selectedTask.task.owner_role.toLowerCase() !== "you" ? (
                  <div>
                    <span className="text-[10px] uppercase text-[#78716c] block">Responsible Owner</span>
                    <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">{selectedTask.task.owner_role}</strong>
                  </div>
                ) : (
                  <div>
                    <span className="text-[10px] uppercase text-[#78716c] block">Execution Responsibility</span>
                    <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">You (Individual Action)</strong>
                  </div>
                )}
                <div>
                  <span className="text-[10px] uppercase text-[#78716c] block">Target Timeline</span>
                  <strong className="text-[#1d1d1b] dark:text-[#F0EAE1]">{getTaskTimelineDisplay(selectedTask.task.timeline, 0)}</strong>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#181614] flex items-center justify-between gap-3">
              {!isReadOnly ? (
                <button
                  type="button"
                  onClick={() => handleDeleteTask(selectedTask.phaseId, selectedTask.task.task_id)}
                  className="px-3 py-1.5 text-xs text-rose-700 hover:text-rose-900 border border-rose-300 bg-rose-50/50 hover:bg-rose-100 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-300 transition-colors font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Milestone</span>
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="px-5 py-1.5 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

