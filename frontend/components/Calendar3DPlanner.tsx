"use client";

import React, { useState, useMemo } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Layers,
  Shield,
  User,
  Info,
  ChevronLeft,
  ChevronRight,
  Flag,
  Sparkles,
  Calendar as CalendarIcon,
  Sliders,
  Check,
} from "lucide-react";
import { RoadmapPhase, RoadmapTask } from "@/lib/api";

// Executive RACI Role Profiles Directory
export interface RoleProfile {
  title: string;
  shortRole: string;
  raci: "R" | "A" | "C" | "I";
  raciLabel: string;
  scope: string;
  authority: string;
  typicalPod: string;
}

export const ROLE_DIRECTORY: Record<string, RoleProfile> = {
  "Lead Technical Architect": {
    title: "Lead Technical Architect",
    shortRole: "Architecture",
    raci: "R",
    raciLabel: "Responsible (Executes Architecture)",
    scope: "Owns system boundaries, database schemas, API contracts, latency budgets, and technical feasibility spikes.",
    authority: "Veto authority on cross-service technical debt and non-functional SLA compromises.",
    typicalPod: "Core Architecture & Platform Pod",
  },
  "Staff SRE / Platform Lead": {
    title: "Staff SRE / Platform Lead",
    shortRole: "SRE",
    raci: "R",
    raciLabel: "Responsible (Deploys & Monitors)",
    scope: "Automated CI/CD pipelines, canary deployments, 5%->25%->100% traffic shifting, and rollback circuit breakers.",
    authority: "Immediate stop-the-line rollout veto if P99 latency or error budget burns exceed SLA.",
    typicalPod: "Platform Reliability Engineering",
  },
  "Head of Security / CISO": {
    title: "Head of Security / CISO",
    shortRole: "Security",
    raci: "C",
    raciLabel: "Consulted (Audits Security & Risk)",
    scope: "Threat modeling, Indian DPDP Act 2023 compliance, secret management, IAM least-privilege, and SOC-2 audit trails.",
    authority: "Mandatory security clearance gate before production cutover.",
    typicalPod: "Cybersecurity & Governance Group",
  },
  "Director of Product / Domain Lead": {
    title: "Director of Product / Domain Lead",
    shortRole: "Product",
    raci: "C",
    raciLabel: "Consulted (Validates Business KPIs)",
    scope: "Feature parity, end-to-end user journeys, regression testing, and post-launch stakeholder adoption metrics.",
    authority: "Signs off on business readiness and customer migration communication.",
    typicalPod: "Product Strategy & Operations",
  },
  "Fiduciary Sponsor / VP Eng": {
    title: "Fiduciary Sponsor / VP Eng",
    shortRole: "Executive",
    raci: "A",
    raciLabel: "Accountable (Final Board Authority)",
    scope: "Capital allocation, headcount capacity, vendor licensing approvals, and final Boardroom ADR memo sign-off.",
    authority: "Sole fiduciary authority holding ultimate accountability for financial and operational outcome.",
    typicalPod: "Executive Engineering Leadership",
  },
};

export function getRoleProfile(roleName?: string): RoleProfile {
  if (!roleName) return ROLE_DIRECTORY["Lead Technical Architect"];
  const lower = roleName.toLowerCase();
  if (lower.includes("security") || lower.includes("ciso") || lower.includes("compliance")) {
    return ROLE_DIRECTORY["Head of Security / CISO"];
  }
  if (lower.includes("sre") || lower.includes("devops") || lower.includes("platform") || lower.includes("ops")) {
    return ROLE_DIRECTORY["Staff SRE / Platform Lead"];
  }
  if (lower.includes("product") || lower.includes("business") || lower.includes("growth")) {
    return ROLE_DIRECTORY["Director of Product / Domain Lead"];
  }
  if (lower.includes("sponsor") || lower.includes("vp") || lower.includes("cto") || lower.includes("executive") || lower.includes("lead")) {
    return ROLE_DIRECTORY["Fiduciary Sponsor / VP Eng"];
  }
  return ROLE_DIRECTORY["Lead Technical Architect"];
}

interface Calendar3DPlannerProps {
  startDate: string;
  onStartDateChange: (newDate: string) => void;
  phases: RoadmapPhase[];
  onTaskToggle: (phaseId: string, taskId: string) => void;
  onTaskRoleChange?: (phaseId: string, taskId: string, newRole: string) => void;
  selectedOwnerFilter: string;
  onOwnerFilterChange: (filter: string) => void;
}

export default function Calendar3DPlanner({
  startDate,
  onStartDateChange,
  phases,
  onTaskToggle,
  onTaskRoleChange,
  selectedOwnerFilter,
  onOwnerFilterChange,
}: Calendar3DPlannerProps) {
  const [plannerView, setPlannerView] = useState<"calendar" | "runway">("calendar");
  const [activeRoleModal, setActiveRoleModal] = useState<RoleProfile | null>(null);
  const [editingRoleTaskId, setEditingRoleTaskId] = useState<string | null>(null);

  // Parse anchor kickoff date
  const anchorDate = useMemo(() => {
    try {
      const d = new Date(startDate);
      return isNaN(d.getTime()) ? new Date() : d;
    } catch {
      return new Date();
    }
  }, [startDate]);

  // Compute 8-week structured calendar grid
  const calendarWeeks = useMemo(() => {
    const weeks: Array<{
      weekNumber: number;
      phaseNumber: number;
      phaseTitle: string;
      phaseId: string;
      days: Array<{
        date: Date;
        dayNum: number;
        monthName: string;
        isKickoff: boolean;
        isToday: boolean;
        tasks: Array<{ task: RoadmapTask; phaseId: string }>;
      }>;
    }> = [];

    const todayStr = new Date().toISOString().split("T")[0];
    const anchorStr = anchorDate.toISOString().split("T")[0];

    // Find the Monday of the kickoff week
    const startMonday = new Date(anchorDate);
    const dayOfWeek = startMonday.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startMonday.setDate(startMonday.getDate() + diffToMonday);

    // Map all tasks with their targeted week
    const taskWeekMap: Record<number, Array<{ task: RoadmapTask; phaseId: string }>> = {};
    phases.forEach((p, pIdx) => {
      p.tasks.forEach((t, tIdx) => {
        let targetWeek = 1;
        if (pIdx === 0) targetWeek = tIdx === 0 ? 1 : 2;
        else if (pIdx === 1) targetWeek = tIdx === 0 ? 3 : tIdx === 1 ? 4 : 5;
        else targetWeek = tIdx === 0 ? 6 : tIdx === 1 ? 7 : 8;

        if (!taskWeekMap[targetWeek]) taskWeekMap[targetWeek] = [];
        taskWeekMap[targetWeek].push({ task: t, phaseId: p.phase_id });
      });
    });

    for (let w = 1; w <= 8; w++) {
      const pIdx = w <= 2 ? 0 : w <= 5 ? 1 : 2;
      const phase = phases[pIdx] || phases[0];
      const days = [];

      for (let d = 0; d < 7; d++) {
        const currentDay = new Date(startMonday);
        currentDay.setDate(startMonday.getDate() + (w - 1) * 7 + d);
        const curDateStr = currentDay.toISOString().split("T")[0];

        // Assign tasks to Wednesday and Friday of that week
        const weekTasks = taskWeekMap[w] || [];
        const dayTasks: Array<{ task: RoadmapTask; phaseId: string }> = [];

        if (d === 2 && weekTasks.length > 0) {
          dayTasks.push(weekTasks[0]);
        } else if (d === 4 && weekTasks.length > 1) {
          dayTasks.push(weekTasks[1]);
        } else if (d === 1 && weekTasks.length > 2) {
          dayTasks.push(weekTasks[2]);
        }

        days.push({
          date: currentDay,
          dayNum: currentDay.getDate(),
          monthName: currentDay.toLocaleDateString("en-US", { month: "short" }),
          isKickoff: curDateStr === anchorStr,
          isToday: curDateStr === todayStr,
          tasks: dayTasks,
        });
      }

      weeks.push({
        weekNumber: w,
        phaseNumber: pIdx + 1,
        phaseTitle: phase?.title || `Phase ${pIdx + 1}`,
        phaseId: phase?.phase_id || `phase-${pIdx + 1}`,
        days,
      });
    }

    return weeks;
  }, [anchorDate, phases]);

  // Format month span for header
  const monthSpanTitle = useMemo(() => {
    const startM = anchorDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const end = new Date(anchorDate);
    end.setDate(end.getDate() + 56);
    const endM = end.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return startM === endM ? startM : `${startM} – ${endM}`;
  }, [anchorDate]);

  return (
    <div className="space-y-5">
      {/* ========================================================================= */}
      {/* 1. TACTILE 3D DESK CALENDAR BINDER HEADER                                  */}
      {/* ========================================================================= */}
      <div className="relative rounded-2xl border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6]/70 dark:bg-[#1E1B18] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] overflow-hidden">
        
        {/* Decorative Leather Binder Holes / Spiral Effect */}
        <div className="absolute top-0 left-0 right-0 h-2.5 bg-[#cfc7b2]/40 dark:bg-[#2C2723] border-b border-[#cfc7b2] dark:border-[#38332C] flex justify-around px-8">
          {[...Array(12)].map((_, i) => (
            <span
              key={i}
              className="w-3 h-2 rounded-b-md bg-[#1d1d1b]/20 dark:bg-[#000]/40 shadow-inner -mt-0.5"
            />
          ))}
        </div>

        <div className="pt-2 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#F4F0E6] dark:bg-[#2C2723] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] shadow-2xs">
                <CalendarDays className="w-4 h-4" />
              </span>
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#7a4e10] dark:text-[#D4AA50] block">
                  3D EXECUTIVE DESK PLANNER
                </span>
                <h3 className="font-newsreader text-2xl font-bold text-ink tracking-tight">
                  {monthSpanTitle}
                </h3>
              </div>
            </div>
            <p className="text-xs text-[#5A6275] dark:text-[#A89F91] font-sans max-w-xl">
              Fixed project execution calendar. Milestones, phase gates, and RACI role owners mapped to real delivery dates.
            </p>
          </div>

          {/* Controls: Fixed Anchor Kickoff Date + View Switcher */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Fixed Kickoff Controller */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F4F0E6] dark:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] shadow-[0_2px_6px_rgba(0,0,0,0.04)]">
              <Flag className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
              <div className="flex flex-col">
                <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                  Fixed Kickoff Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="text-xs font-mono font-bold text-ink bg-transparent border-0 p-0 focus:outline-none cursor-pointer"
                  title="Click to set permanent project kickoff date"
                />
              </div>
            </div>

            {/* View Toggle */}
            <div className="flex items-center p-1 rounded-xl bg-[#E5DEC9] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-mono">
              <button
                type="button"
                onClick={() => setPlannerView("calendar")}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  plannerView === "calendar"
                    ? "bg-[#F4F0E6] dark:bg-[#2C2723] text-[#7a4e10] dark:text-[#D4AA50] shadow-xs"
                    : "text-[#5A6275] dark:text-[#A89F91] hover:text-ink"
                }`}
              >
                3D Calendar Grid
              </button>
              <button
                type="button"
                onClick={() => setPlannerView("runway")}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  plannerView === "runway"
                    ? "bg-[#F4F0E6] dark:bg-[#2C2723] text-[#7a4e10] dark:text-[#D4AA50] shadow-xs"
                    : "text-[#5A6275] dark:text-[#A89F91] hover:text-ink"
                }`}
              >
                Phased Runway
              </button>
            </div>
          </div>
        </div>

        {/* RACI Role Filter Bar & Quick Roster Legend */}
        <div className="mt-4 pt-3 border-t border-[#cfc7b2]/70 dark:border-[#38332C] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] font-bold uppercase text-[#7a4e10] dark:text-[#D4AA50] mr-1 flex items-center gap-1">
              <Sliders className="w-3 h-3" /> Filter by RACI Pod:
            </span>
            {["ALL", "Architecture", "SRE", "Security", "Product", "Executive"].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => onOwnerFilterChange(role)}
                className={`px-2.5 py-0.5 rounded-lg font-mono text-[11px] font-semibold border transition cursor-pointer ${
                  selectedOwnerFilter === role
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50] shadow-xs"
                    : "bg-[#F4F0E6] dark:bg-[#2C2723] text-[#5A6275] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:text-ink"
                }`}
              >
                {role === "ALL" ? "All Pods" : role}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setActiveRoleModal(ROLE_DIRECTORY["Lead Technical Architect"])}
            className="text-[11px] font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Info className="w-3 h-3" />
            <span>Open RACI Roles Directory</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. VIEW A: TACTILE 3D CALENDAR GRID (8 WEEKS OF CRITICAL EXECUTION)       */}
      {/* ========================================================================= */}
      {plannerView === "calendar" && (
        <div className="space-y-4">
          {/* Day of Week Header */}
          <div className="grid grid-cols-7 gap-2 px-1 text-center font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          {/* Weeks Rows with 3D Embossed Cards */}
          <div className="space-y-3">
            {calendarWeeks.map((week) => (
              <div
                key={week.weekNumber}
                className="rounded-2xl border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6]/40 dark:bg-[#181614] p-3 space-y-2 shadow-sm transition-all"
              >
                {/* Week & Phase Banner */}
                <div className="flex items-center justify-between text-xs font-mono px-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Week {week.weekNumber}
                    </span>
                    <span className="text-[#cfc7b2] dark:text-[#38332C]">•</span>
                    <span className="font-semibold text-[#7a4e10] dark:text-[#D4AA50]">
                      Phase {week.phaseNumber}: {week.phaseTitle}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#5A6275] dark:text-[#A89F91]">
                    {week.days[0].monthName} {week.days[0].dayNum} – {week.days[6].monthName} {week.days[6].dayNum}
                  </span>
                </div>

                {/* 7 Day Blocks with 3D Tactile Relief */}
                <div className="grid grid-cols-7 gap-2">
                  {week.days.map((day, dIdx) => {
                    const isWeekend = dIdx >= 5;
                    const hasTasks = day.tasks.length > 0;
                    return (
                      <div
                        key={dIdx}
                        className={`min-h-[105px] rounded-xl border p-2 flex flex-col justify-between transition-all duration-150 ${
                          day.isKickoff
                            ? "bg-[#F4F0E6] dark:bg-[#2C2723] border-2 border-[#7a4e10] dark:border-[#D4AA50] shadow-[0_4px_14px_rgba(122,78,16,0.18)]"
                            : day.isToday
                            ? "bg-[#F4F0E6] dark:bg-[#221F1C] border-2 border-accent shadow-xs"
                            : isWeekend
                            ? "bg-[#EDE7D6]/30 dark:bg-[#151311] border-[#cfc7b2]/50 dark:border-[#2C2723] opacity-60"
                            : "bg-[#F4F0E6] dark:bg-[#1E1B18] border-[#cfc7b2] dark:border-[#38332C] shadow-[0_3px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(122,78,16,0.1)]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-mono text-xs font-bold leading-none ${
                              day.isKickoff
                                ? "text-[#7a4e10] dark:text-[#D4AA50]"
                                : day.isToday
                                ? "text-accent"
                                : "text-ink"
                            }`}
                          >
                            {day.dayNum}
                          </span>

                          {day.isKickoff && (
                            <span className="text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.2 rounded bg-[#7a4e10] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] shadow-2xs">
                              Kickoff
                            </span>
                          )}
                          {day.isToday && !day.isKickoff && (
                            <span className="w-2 h-2 rounded-full bg-accent" title="Today" />
                          )}
                        </div>

                        {/* Task Chips inside Day Cell */}
                        <div className="space-y-1 mt-1.5 flex-1">
                          {day.tasks.map(({ task, phaseId }) => {
                            const roleProfile = getRoleProfile(task.owner_role);
                            const isMatchFilter =
                              selectedOwnerFilter === "ALL" ||
                              roleProfile.shortRole.toLowerCase() === selectedOwnerFilter.toLowerCase();

                            if (!isMatchFilter) return null;

                            return (
                              <div
                                key={task.task_id}
                                className={`group p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  task.is_completed
                                    ? "bg-[#E5DEC9]/50 dark:bg-[#25221F] border-[#cfc7b2] dark:border-[#38332C] opacity-75"
                                    : "bg-[#EDE7D6] dark:bg-[#2C2723] border-[#7a4e10]/30 dark:border-[#D4AA50]/40 shadow-xs hover:border-[#7a4e10]"
                                }`}
                                onClick={() => onTaskToggle(phaseId, task.task_id)}
                              >
                                <div className="flex items-start gap-1">
                                  {task.is_completed ? (
                                    <CheckCircle2 className="w-3 h-3 text-[#7a4e10] dark:text-[#D4AA50] shrink-0 mt-0.5" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-[#cfc7b2] dark:text-[#554e42] shrink-0 mt-0.5 group-hover:text-[#7a4e10]" />
                                  )}
                                  <span
                                    className={`text-[10px] font-sans font-medium line-clamp-2 leading-tight ${
                                      task.is_completed
                                        ? "line-through text-muted"
                                        : "text-ink"
                                    }`}
                                  >
                                    {task.title}
                                  </span>
                                </div>

                                {/* RACI Role Pill */}
                                <div className="mt-1 flex items-center justify-between">
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveRoleModal(roleProfile);
                                    }}
                                    className="text-[8px] font-mono uppercase font-bold px-1.5 py-0.2 rounded bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] hover:bg-[#7a4e10] hover:text-[#F4F0E6] transition-colors"
                                    title="Click to view RACI responsibility mandate"
                                  >
                                    [{roleProfile.raci}] {roleProfile.shortRole}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VIEW B: PHASED RUNWAY GANTT                                            */}
      {/* ========================================================================= */}
      {plannerView === "runway" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {phases.map((phase, pIdx) => {
            const completedCount = phase.tasks.filter((t) => t.is_completed).length;
            const totalCount = phase.tasks.length;
            const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            return (
              <div
                key={phase.phase_id}
                className="p-4 bg-[#F4F0E6] dark:bg-[#1E1B18] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                    Phase {pIdx + 1}
                  </span>
                  <span className="font-mono text-xs font-bold text-ink">{pct}% Done</span>
                </div>
                <h4 className="font-newsreader text-lg font-bold text-ink leading-tight">
                  {phase.title}
                </h4>
                <p className="text-xs text-[#5A6275] dark:text-[#A89F91] leading-relaxed">
                  {phase.description}
                </p>

                {/* Tasks List */}
                <div className="space-y-2 pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C]">
                  {phase.tasks.map((task) => {
                    const roleProfile = getRoleProfile(task.owner_role);
                    return (
                      <div
                        key={task.task_id}
                        onClick={() => onTaskToggle(phase.phase_id, task.task_id)}
                        className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition-all cursor-pointer ${
                          task.is_completed
                            ? "bg-[#E5DEC9]/40 dark:bg-[#25221F] border-[#cfc7b2] dark:border-[#38332C] opacity-75"
                            : "bg-[#EDE7D6] dark:bg-[#2C2723] border-[#7a4e10]/30 dark:border-[#D4AA50]/40 shadow-xs"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {task.is_completed ? (
                            <CheckCircle2 className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50] shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-4 h-4 text-[#cfc7b2] dark:text-[#554e42] shrink-0 mt-0.5" />
                          )}
                          <span className={`font-semibold leading-tight ${task.is_completed ? "line-through text-muted" : "text-ink"}`}>
                            {task.title}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-muted">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveRoleModal(roleProfile);
                            }}
                            className="px-2 py-0.5 rounded bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] font-bold"
                          >
                            [{roleProfile.raci}] {task.owner_role}
                          </span>
                          <span>{task.timeline}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. RACI ROLE PROFILE POPUP MODAL (Explains Who the Person Is)              */}
      {/* ========================================================================= */}
      {activeRoleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => setActiveRoleModal(null)}
        >
          <div
            className="w-full max-w-lg bg-[#F4F0E6] dark:bg-[#1E1B18] border-2 border-[#7a4e10] dark:border-[#D4AA50] rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#cfc7b2] dark:border-[#38332C] pb-3">
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                  RACI RESPONSIBILITY ROSTER • [{activeRoleModal.raci}] {activeRoleModal.raciLabel}
                </span>
                <h3 className="font-newsreader text-2xl font-bold text-ink">
                  {activeRoleModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveRoleModal(null)}
                className="text-muted hover:text-ink text-sm font-mono p-1 rounded-lg hover:bg-[#EDE7D6] dark:hover:bg-[#2C2723]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-sans">
              <div className="p-3 rounded-xl bg-[#EDE7D6] dark:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] space-y-1">
                <span className="font-mono text-[10px] uppercase font-bold text-[#7a4e10] dark:text-[#D4AA50] block">
                  Pod &amp; Operating Group
                </span>
                <p className="text-ink font-semibold">{activeRoleModal.typicalPod}</p>
              </div>

              <div className="space-y-1">
                <span className="font-mono text-[10px] uppercase font-bold text-[#7a4e10] dark:text-[#D4AA50] block">
                  Mandate &amp; Exact Responsibilities
                </span>
                <p className="text-[#5A6275] dark:text-[#A89F91] leading-relaxed">
                  {activeRoleModal.scope}
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-mono text-[10px] uppercase font-bold text-[#7a4e10] dark:text-[#D4AA50] block">
                  Authority &amp; Veto Power
                </span>
                <p className="text-[#5A6275] dark:text-[#A89F91] leading-relaxed">
                  {activeRoleModal.authority}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-between text-xs font-mono">
              <span className="text-muted text-[11px]">
                Assigned by Fiduciary Mandate
              </span>
              <button
                type="button"
                onClick={() => setActiveRoleModal(null)}
                className="px-4 py-1.5 rounded-xl bg-[#7a4e10] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] font-bold shadow-xs hover:opacity-90 cursor-pointer"
              >
                Confirm Understanding
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

