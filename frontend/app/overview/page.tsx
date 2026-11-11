"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { getDecisions, getFolders, getMe, Decision, Folder, User } from "@/lib/api";
import { firstName, greeting, PROFILE_UPDATED_EVENT } from "@/lib/userDisplay";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  HelpCircle,
  Layers,
  Mic,
  Plus,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";

function gapCount(d: Decision): number {
  const raw = d.gaps as { gaps?: unknown[] } | undefined;
  return Array.isArray(raw?.gaps) ? raw.gaps.length : 0;
}

type Stage = "draft" | "progress" | "decided" | "archived";

function stageOf(d: Decision): Stage {
  if (d.status === "decided") return "decided";
  if (d.status === "archived") return "archived";
  if (d.status === "draft") return "draft";
  return "progress";
}

const STAGE_LABEL: Record<Stage, string> = {
  draft: "Draft",
  progress: "In progress",
  decided: "Decided",
  archived: "Archived",
};

function StagePill({ stage }: { stage: Stage }) {
  const cls: Record<Stage, string> = {
    draft: "bg-subtle text-ink-2 border-line",
    progress: "bg-accent-50 text-accent-700 border-accent-200",
    decided: "bg-ink text-on-ink border-ink",
    archived: "bg-subtle text-ink-3 border-line",
  };
  return (
    <span className={`inline-flex items-center h-7 px-3 rounded-full border text-[13px] font-medium whitespace-nowrap ${cls[stage]}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

const STEPS = [
  { Icon: Mic, title: "Capture", body: "Type your thinking, record a meeting or upload documents." },
  { Icon: Layers, title: "Structure", body: "Facts, assumptions, pros and cons are separated for you." },
  { Icon: Search, title: "Fill the gaps", body: "Answer open questions or let web research fill them in." },
  { Icon: Scale, title: "Decide", body: "Compare options with a transparent scoring matrix and roadmap." },
];

export default function OverviewPage() {
  const [user, setUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getMe();
      setUser(u);
      if (u) {
        const [f, d] = await Promise.all([getFolders().catch(() => []), getDecisions().catch(() => [])]);
        setFolders(f);
        setDecisions(d);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onProfile = () => setTick((n) => n + 1);
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfile);
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfile);
  }, []);

  const stats = useMemo(() => {
    const byStage = { draft: 0, progress: 0, decided: 0, archived: 0 } as Record<Stage, number>;
    decisions.forEach((d) => byStage[stageOf(d)]++);
    const openQuestions = decisions.reduce((acc, d) => acc + gapCount(d), 0);
    return { byStage, openQuestions, total: decisions.length };
  }, [decisions]);

  const recent = useMemo(
    () =>
      [...decisions]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 6),
    [decisions]
  );

  const folderName = useMemo(() => {
    const map = new Map<number, string>();
    folders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [folders]);

  const decisionsPerFolder = useMemo(() => {
    const map = new Map<number, number>();
    decisions.forEach((d) => map.set(d.folder_id, (map.get(d.folder_id) ?? 0) + 1));
    return map;
  }, [decisions]);

  const statCards = [
    { label: "Total decisions", value: stats.total, Icon: FileText, href: "/dashboard?view=ledger" },
    { label: "In progress", value: stats.byStage.progress + stats.byStage.draft, Icon: CircleDashed, href: "/dashboard?view=ledger" },
    { label: "Decided", value: stats.byStage.decided, Icon: CheckCircle2, href: "/dashboard?view=ledger" },
    { label: "Open questions", value: stats.openQuestions, Icon: HelpCircle, href: "/dashboard?view=ledger" },
  ];

  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  return (
    <AppShell onRefresh={load}>
      {!loading && !user ? (
        <div className="bg-surface border border-line rounded-[16px] p-8 sm:p-12 text-center max-w-[620px] mx-auto my-10 shadow-soft">
          <div className="w-14 h-14 rounded-[14px] bg-accent-50 text-accent flex items-center justify-center mx-auto mb-5">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-[30px] font-semibold text-ink mb-3">Welcome to DecisionLens</h1>
          <p className="text-[17px] text-ink-2 leading-relaxed max-w-[460px] mx-auto mb-7">
            Sign in to see your overview, workspaces and every decision you&apos;re weighing.
          </p>
          <Link
            href="/auth?redirect=/overview"
            className="inline-flex items-center gap-2 h-12 px-6 bg-ink hover:bg-ink-hover text-on-ink rounded-[12px] text-[16px] font-semibold transition-colors"
          >
            Sign in
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-10 animate-fade-up">
          {/* Greeting */}
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <p className="text-[16px] text-ink-3 font-medium mb-1">
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-tight text-ink leading-tight">
                {loading || !user ? "Loading…" : `${greeting()}, ${firstName(user.display_name, user.email)}`}
              </h1>
              <p className="text-[17px] sm:text-[18px] text-ink-2 mt-2 max-w-[560px]">
                Here&apos;s where your decisions stand today.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href="/dashboard?view=workspaces"
                className="inline-flex items-center justify-center gap-2 h-12 px-5 border border-line bg-surface hover:bg-subtle text-ink rounded-[12px] text-[16px] font-medium transition-colors"
              >
                <FolderPlus className="w-5 h-5" />
                Workspaces
              </Link>
              <Link
                href="/dashboard?action=new"
                className="inline-flex items-center justify-center gap-2 h-12 px-5 bg-ink hover:bg-ink-hover text-on-ink rounded-[12px] text-[16px] font-semibold transition-colors"
              >
                <Plus className="w-5 h-5" />
                New decision
              </Link>
            </div>
          </section>

          {/* Stats */}
          <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statCards.map(({ label, value, Icon, href }) => (
              <Link
                key={label}
                href={href}
                className="group bg-surface border border-line rounded-[16px] p-5 sm:p-6 hover:border-ink-3/50 hover:shadow-soft transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[15px] sm:text-[16px] font-medium text-ink-2">{label}</span>
                  <Icon className="w-5 h-5 text-ink-3 group-hover:text-accent transition-colors" />
                </div>
                <div className="text-[34px] sm:text-[40px] font-semibold text-ink leading-none tabular-nums">
                  {loading ? <span className="inline-block w-12 h-9 rounded-[8px] bg-subtle animate-pulse" /> : value}
                </div>
              </Link>
            ))}
          </section>

          {/* Progress breakdown */}
          {stats.total > 0 && (
            <section className="bg-surface border border-line rounded-[16px] p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <h2 className="text-[20px] font-semibold text-ink">Decision progress</h2>
                <span className="text-[15px] text-ink-3">{pct(stats.byStage.decided)}% decided</span>
              </div>
              <div className="h-3 rounded-full bg-subtle overflow-hidden flex" role="img" aria-label="Decision progress breakdown">
                <div className="bg-ink h-full transition-all" style={{ width: `${pct(stats.byStage.decided)}%` }} />
                <div className="bg-accent h-full transition-all" style={{ width: `${pct(stats.byStage.progress)}%` }} />
                <div className="bg-accent-200 h-full transition-all" style={{ width: `${pct(stats.byStage.draft)}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[15px] text-ink-2">
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-ink" />Decided · {stats.byStage.decided}</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-accent" />In progress · {stats.byStage.progress}</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-accent-200" />Draft · {stats.byStage.draft}</span>
                {stats.byStage.archived > 0 && (
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-line" />Archived · {stats.byStage.archived}</span>
                )}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
            {/* Recent decisions */}
            <section className="bg-surface border border-line rounded-[16px] overflow-hidden">
              <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-line">
                <h2 className="text-[20px] font-semibold text-ink">Continue where you left off</h2>
                <Link href="/dashboard?view=ledger" className="text-[15px] font-medium text-accent hover:underline whitespace-nowrap">
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="p-6 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-[10px] bg-subtle animate-pulse" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[17px] text-ink-2 mb-5">You haven&apos;t started any decisions yet.</p>
                  <Link
                    href="/dashboard?action=new"
                    className="inline-flex items-center gap-2 h-12 px-5 bg-ink hover:bg-ink-hover text-on-ink rounded-[12px] text-[16px] font-semibold transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Start your first decision
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/decisions/${d.id}`}
                        className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-subtle/60 transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[17px] font-medium text-ink truncate group-hover:text-accent transition-colors">{d.title}</p>
                          <p className="text-[14px] text-ink-3 mt-1 truncate">
                            {folderName.get(d.folder_id) ?? "Workspace"} · Updated {timeAgo(d.updated_at)}
                            {gapCount(d) > 0 && ` · ${gapCount(d)} open question${gapCount(d) === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        <StagePill stage={stageOf(d)} />
                        <ArrowRight className="w-5 h-5 text-ink-3 shrink-0 hidden sm:block group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Workspaces */}
            <section className="bg-surface border border-line rounded-[16px] overflow-hidden">
              <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-line">
                <h2 className="text-[20px] font-semibold text-ink">Workspaces</h2>
                <Link href="/dashboard?view=workspaces" className="text-[15px] font-medium text-accent hover:underline whitespace-nowrap">
                  Manage
                </Link>
              </div>
              {loading ? (
                <div className="p-6 space-y-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-14 rounded-[10px] bg-subtle animate-pulse" />
                  ))}
                </div>
              ) : folders.length === 0 ? (
                <div className="p-8 text-center text-[17px] text-ink-2">
                  Workspaces group related decisions so each one builds on the last.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {folders.slice(0, 6).map((f) => {
                    const count = decisionsPerFolder.get(f.id) ?? f.decision_count ?? 0;
                    return (
                      <li key={f.id}>
                        <Link href={`/folders/${f.id}`} className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-subtle/60 transition-colors">
                          <div className="w-11 h-11 rounded-[12px] bg-accent-50 text-accent flex items-center justify-center shrink-0">
                            <FolderIcon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[17px] font-medium text-ink truncate">{f.name}</p>
                            <p className="text-[14px] text-ink-3 mt-0.5">
                              {count} decision{count === 1 ? "" : "s"}
                            </p>
                          </div>
                          <ArrowRight className="w-5 h-5 text-ink-3 shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* How it works */}
          <section>
            <h2 className="text-[20px] font-semibold text-ink mb-4">How DecisionLens works</h2>
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {STEPS.map(({ Icon, title, body }, i) => (
                <li key={title} className="bg-surface border border-line rounded-[16px] p-5 sm:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-9 h-9 rounded-full bg-subtle text-ink-2 text-[15px] font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-[18px] font-semibold text-ink mb-1">{title}</h3>
                  <p className="text-[16px] text-ink-2 leading-relaxed">{body}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </AppShell>
  );
}
