"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Portfolio3DCanvas from "@/components/Portfolio3DCanvas";
import { getDecisions, getFolders, Decision, Folder } from "@/lib/api";
import {
  Compass,
  LayoutGrid,
  Sparkles,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  ChevronRight,
  X,
  ExternalLink,
  Target,
  Shield,
  Zap,
} from "lucide-react";

export default function PortfolioPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedDomain, setSelectedDomain] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"3d" | "ledger">("3d");

  // Selected Decision for Inspector
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);

  const loadPortfolioData = useCallback(async () => {
    setLoading(true);
    try {
      const [decList, folderList] = await Promise.all([
        getDecisions().catch(() => []),
        getFolders().catch(() => []),
      ]);
      setDecisions(decList);
      setFolders(folderList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  // Extract all unique domains dynamically
  const domainsList = useMemo(() => {
    const set = new Set<string>();
    decisions.forEach((d) => {
      if (d.domain) set.add(d.domain.toUpperCase());
    });
    return ["ALL", ...Array.from(set)];
  }, [decisions]);

  // Filtered decisions
  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      const matchDomain =
        selectedDomain === "ALL" || (d.domain && d.domain.toUpperCase() === selectedDomain);
      const matchStatus =
        selectedStatus === "ALL" || d.status.toLowerCase() === selectedStatus.toLowerCase();
      return matchDomain && matchStatus;
    });
  }, [decisions, selectedDomain, selectedStatus]);

  // Metrics
  const decidedCount = decisions.filter((d) => d.status === "decided").length;
  const evaluatingCount = decisions.filter((d) => d.status === "evaluating").length;
  const draftCount = decisions.filter((d) => d.status === "draft").length;

  return (
    <AppShell
      breadcrumbs={[{ label: "Decision Portfolio" }]}
      onRefresh={loadPortfolioData}
      maxWidthClass="max-w-[1240px]"
    >
      <div className="space-y-6 font-sans pb-16">
        {/* Header Hero */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--accent)] border border-[var(--border)] shadow-2xs">
                <Compass className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-[var(--ink)] tracking-tight">
                Strategic Decision Portfolio
              </h1>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mt-1 max-w-xl leading-relaxed">
              Spatial multi-domain intelligence across all organizational bets, risks, and consensus mandates.
            </p>
          </div>

          {/* View Mode Toggle: 3D Constellation vs Ledger */}
          <div className="flex items-center gap-2 self-start md:self-center">
            <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1 shadow-2xs text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 ${
                  viewMode === "3d"
                    ? "bg-[var(--accent)] text-white font-bold shadow-xs"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>3D Constellation</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("ledger")}
                className={`px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 ${
                  viewMode === "ledger"
                    ? "bg-[var(--accent)] text-white font-bold shadow-xs"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Executive Ledger</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 Quiet Strategic Vital Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs transition-colors">
            <span className="text-[11px] text-[var(--ink-secondary)] font-medium uppercase tracking-wider block mb-1">
              Total Deliberations
            </span>
            <span className="text-2xl sm:text-3xl font-serif font-bold text-[var(--ink)] tabular-nums">
              {decisions.length}
            </span>
            <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
              Across {folders.length} workspaces
            </span>
          </div>

          <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs transition-colors">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider block mb-1">
              Consensus Mandates
            </span>
            <span className="text-2xl sm:text-3xl font-serif font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {decidedCount}
            </span>
            <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
              Executed &amp; locked
            </span>
          </div>

          <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs transition-colors">
            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider block mb-1">
              Under Gauntlet Scrutiny
            </span>
            <span className="text-2xl sm:text-3xl font-serif font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {evaluatingCount}
            </span>
            <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
              Multi-criteria stress testing
            </span>
          </div>

          <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs transition-colors">
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider block mb-1">
              Early Stage Drafts
            </span>
            <span className="text-2xl sm:text-3xl font-serif font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {draftCount}
            </span>
            <span className="text-[10px] text-[var(--ink-secondary)] block mt-0.5">
              Forming problem statement
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--ink-secondary)] font-medium px-2 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Domain:
            </span>
            {domainsList.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDomain(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedDomain === d
                    ? "bg-[var(--accent)] text-white font-bold shadow-2xs"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:bg-[var(--bg-page)]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--ink-secondary)] font-medium px-2">
              Status:
            </span>
            {[
              { id: "ALL", label: "All" },
              { id: "decided", label: "Decided" },
              { id: "evaluating", label: "Scrutiny" },
              { id: "draft", label: "Draft" },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatus(st.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedStatus === st.id
                    ? "bg-[var(--accent)] text-white font-bold shadow-2xs"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:bg-[var(--bg-page)]"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Workspace Stage */}
        {loading ? (
          <div className="h-[520px] bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] animate-pulse flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="animate-spin w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full mx-auto" />
              <p className="text-xs text-[var(--ink-secondary)]">
                Constructing 3D Strategic Decision Constellation...
              </p>
            </div>
          </div>
        ) : filteredDecisions.length === 0 ? (
          <div className="p-12 text-center bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] space-y-3">
            <Compass className="w-10 h-10 text-[var(--ink-secondary)] mx-auto opacity-50" />
            <h3 className="text-base font-serif font-bold text-[var(--ink)]">
              No matching decisions found
            </h3>
            <p className="text-xs text-[var(--ink-secondary)] max-w-sm mx-auto">
              Try adjusting your domain or status filters to explore other strategic choices.
            </p>
            <button
              onClick={() => {
                setSelectedDomain("ALL");
                setSelectedStatus("ALL");
              }}
              className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-xl"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === "3d" ? (
          /* 3D Spatial Constellation Canvas Stage */
          <div className="relative">
            <Portfolio3DCanvas
              decisions={filteredDecisions}
              selectedDecisionId={selectedDecision?.id}
              onSelectDecision={(d) => setSelectedDecision(d)}
              className="w-full h-[560px] sm:h-[620px] bg-[var(--bg-surface)] border border-[var(--border)] shadow-xs rounded-3xl"
            />

            {/* Quick Peek Drawer for Clicked Node */}
            {selectedDecision && (
              <div className="absolute top-4 right-4 max-w-sm w-full z-40 bg-[var(--bg-surface)] text-[var(--ink)] border border-[var(--border)] shadow-2xl rounded-2xl p-5 animate-fadeIn backdrop-blur-md">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase text-[var(--ink-secondary)]">
                      Decision #{selectedDecision.id}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        selectedDecision.status === "decided"
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                      }`}
                    >
                      {selectedDecision.status}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedDecision(null)}
                    className="p-1 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:bg-[var(--bg-page)]"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 py-3">
                  <h3 className="text-sm font-serif font-bold text-[var(--ink)] leading-snug">
                    {selectedDecision.title}
                  </h3>

                  {selectedDecision.problem_statement && (
                    <p className="text-xs text-[var(--ink-secondary)] leading-relaxed line-clamp-3">
                      {selectedDecision.problem_statement}
                    </p>
                  )}

                  {selectedDecision.domain && (
                    <div className="flex items-center gap-2 text-[11px] text-[var(--ink-secondary)]">
                      <span className="font-semibold text-[var(--ink)]">Domain:</span>
                      <span className="px-2 py-0.5 rounded bg-[var(--bg-page)] border border-[var(--border)] font-mono text-[10px]">
                        {selectedDecision.domain}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
                  <span className="text-[10px] text-[var(--ink-secondary)]">
                    Created {new Date(selectedDecision.created_at).toLocaleDateString()}
                  </span>
                  <Link
                    href={`/decisions/${selectedDecision.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:opacity-90 text-white text-xs font-bold transition shadow-xs"
                  >
                    <span>Open Dossier</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Executive Ledger Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDecisions.map((dec) => {
              const isDecided = dec.status === "decided";
              const isEvaluating = dec.status === "evaluating";
              return (
                <Link
                  key={dec.id}
                  href={`/decisions/${dec.id}`}
                  className="bg-[var(--bg-surface)] hover:bg-[var(--bg-page)]/60 rounded-2xl p-5 border border-[var(--border)] shadow-2xs hover:shadow-xs transition group flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-[var(--ink-secondary)] uppercase">
                        {dec.domain || "GENERAL"} &bull; #{dec.id}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isDecided
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : isEvaluating
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {dec.status}
                      </span>
                    </div>

                    <h3 className="text-sm font-serif font-bold text-[var(--ink)] group-hover:text-[var(--accent)] transition leading-snug line-clamp-2">
                      {dec.title}
                    </h3>

                    {dec.problem_statement && (
                      <p className="text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                        {dec.problem_statement}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--ink-secondary)]">
                    <span>{new Date(dec.created_at).toLocaleDateString()}</span>
                    <span className="text-[var(--accent)] font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition">
                      View Memos &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

