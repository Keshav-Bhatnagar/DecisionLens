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
    draft: "bg-[#EDE7D6] dark:bg-[#2C2723] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C]",
    progress: "bg-[#F4F0E6] dark:bg-[#25201B] text-[#7a4e10] dark:text-[#D4AA50] border-[#7a4e10]/40 dark:border-[#D4AA50]/40 font-bold shadow-2xs",
    decided: "bg-[#1d1d1b] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50] font-bold shadow-2xs",
    archived: "bg-[#E5DEC9] dark:bg-[#1C1917] text-[#7B8491] dark:text-[#6E665B] border-[#cfc7b2] dark:border-[#38332C]",
  };
  return (
    <span className={`inline-flex items-center h-7 px-3 rounded-full border text-[13px] font-mono uppercase tracking-wider whitespace-nowrap ${cls[stage]}`}>
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
        <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-8 sm:p-12 text-center max-w-[620px] mx-auto my-10 shadow-soft">
          <div className="w-14 h-14 rounded-2xl bg-[#E5DEC9] dark:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] flex items-center justify-center mx-auto mb-5 shadow-inner">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="font-newsreader text-3xl sm:text-4xl font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] mb-3 tracking-tight">
            Welcome to DecisionLens
          </h1>
          <p className="text-[17px] sm:text-[18px] text-[#4f4b40] dark:text-[#A89F91] leading-relaxed max-w-[460px] mx-auto mb-7 font-sans">
            Sign in to see your overview, workspaces, and every high-stakes decision you&apos;re weighing.
          </p>
          <Link
            href="/auth?redirect=/overview"
            className="inline-flex items-center gap-2 h-12 px-6 bg-[#1d1d1b] hover:bg-[#2C2723] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[#F4F0E6] rounded-xl text-[16px] font-semibold transition-colors shadow-sm"
          >
            Sign in
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-10 animate-fade-up font-sans">
          {/* Greeting */}
          <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
            <div>
              <p className="text-xs sm:text-sm font-mono uppercase tracking-widest text-[#7B8491] dark:text-[#A89F91] font-bold mb-1.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#7a4e10] dark:bg-[#D4AA50]" />
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              <h1 className="font-newsreader text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-[#1d1d1b] dark:text-[#F0EAE1] leading-tight">
                {loading || !user ? "Loading…" : `${greeting()}, ${firstName(user.display_name, user.email)}`}
              </h1>
              <p className="text-sm sm:text-base text-[#4f4b40] dark:text-[#A89F91] mt-2 max-w-[620px] leading-relaxed">
                Here&apos;s where your decisions and strategic mandates stand today.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
              <Link
                href="/dashboard?view=workspaces"
                className="inline-flex items-center justify-center gap-2 h-10 px-4 border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] rounded-xl text-sm font-medium transition-colors shadow-2xs"
              >
                <FolderPlus className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                Workspaces
              </Link>
              <Link
                href="/dashboard?action=new"
                className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-[#1d1d1b] hover:bg-[#2C2723] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] text-[#F4F0E6] dark:text-[#181614] rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
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
                className="group bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-4 sm:p-5 hover:border-[#7a4e10] dark:hover:border-[#D4AA50] hover:shadow-soft transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs sm:text-[13px] font-mono uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] font-bold">
                    {label}
                  </span>
                  <Icon className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50] group-hover:scale-110 transition-transform" />
                </div>
                <div className="font-newsreader text-2xl sm:text-3xl font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] leading-none tabular-nums">
                  {loading ? <span className="inline-block w-12 h-9 rounded-lg bg-[#cfc7b2]/40 dark:bg-[#38332C] animate-pulse" /> : value}
                </div>
              </Link>
            ))}
          </section>

          {/* Progress breakdown */}
          {stats.total > 0 && (
            <section className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-5 sm:p-6 shadow-2xs">
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <h2 className="font-newsreader text-2xl sm:text-3xl font-medium text-[#1d1d1b] dark:text-[#F0EAE1] tracking-tight">
                  Decision progress
                </h2>
                <span className="text-sm font-mono font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                  {pct(stats.byStage.decided)}% decided
                </span>
              </div>
              <div className="h-3 rounded-full bg-[#E5DEC9] dark:bg-[#181614] border border-[#cfc7b2]/60 dark:border-[#38332C] overflow-hidden flex" role="img" aria-label="Decision progress breakdown">
                <div className="bg-[#1d1d1b] dark:bg-[#D4AA50] h-full transition-all" style={{ width: `${pct(stats.byStage.decided)}%` }} />
                <div className="bg-[#7a4e10] dark:bg-[#E5BE64] h-full transition-all" style={{ width: `${pct(stats.byStage.progress)}%` }} />
                <div className="bg-[#cfc7b2] dark:bg-[#4f4b40] h-full transition-all" style={{ width: `${pct(stats.byStage.draft)}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[15px] text-[#4f4b40] dark:text-[#A89F91]">
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#1d1d1b] dark:bg-[#D4AA50]" />Decided · {stats.byStage.decided}</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#7a4e10] dark:bg-[#E5BE64]" />In progress · {stats.byStage.progress}</span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#cfc7b2] dark:bg-[#4f4b40]" />Draft · {stats.byStage.draft}</span>
                {stats.byStage.archived > 0 && (
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#7B8491]" />Archived · {stats.byStage.archived}</span>
                )}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
            {/* Recent decisions */}
            <section className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl overflow-hidden shadow-2xs">
              <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-[#cfc7b2] dark:border-[#38332C]">
                <h2 className="font-newsreader text-2xl font-medium text-[#1d1d1b] dark:text-[#F0EAE1] tracking-tight">
                  Continue where you left off
                </h2>
                <Link href="/dashboard?view=ledger" className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] hover:underline whitespace-nowrap">
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="p-6 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-[#E5DEC9] dark:bg-[#181614] animate-pulse" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[17px] text-[#4f4b40] dark:text-[#A89F91] mb-5 font-sans">You haven&apos;t started any decisions yet.</p>
                  <Link
                    href="/dashboard?action=new"
                    className="inline-flex items-center gap-2 h-12 px-5 bg-[#1d1d1b] hover:bg-[#2C2723] dark:bg-[#D4AA50] dark:text-[#181614] text-[#F4F0E6] rounded-xl text-[16px] font-semibold transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Start your first decision
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-[#cfc7b2]/70 dark:divide-[#38332C]">
                  {recent.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/decisions/${d.id}`}
                        className="flex items-center gap-4 px-5 sm:px-6 py-4.5 hover:bg-[#E5DEC9]/60 dark:hover:bg-[#1E1B18] transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-newsreader text-[19px] sm:text-[20px] font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] truncate group-hover:text-[#7a4e10] dark:group-hover:text-[#D4AA50] transition-colors leading-snug">
                            {d.title}
                          </p>
                          <p className="text-[14px] text-[#4f4b40] dark:text-[#A89F91] mt-1 truncate font-sans">
                            {folderName.get(d.folder_id) ?? "Workspace"} · Updated {timeAgo(d.updated_at)}
                            {gapCount(d) > 0 && ` · ${gapCount(d)} open question${gapCount(d) === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        <StagePill stage={stageOf(d)} />
                        <ArrowRight className="w-5 h-5 text-[#7B8491] shrink-0 hidden sm:block group-hover:translate-x-0.5 group-hover:text-[#7a4e10] dark:group-hover:text-[#D4AA50] transition-all" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Workspaces */}
            <section className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl overflow-hidden shadow-2xs">
              <div className="flex items-center justify-between px-5 sm:px-6 h-16 border-b border-[#cfc7b2] dark:border-[#38332C]">
                <h2 className="font-newsreader text-2xl font-medium text-[#1d1d1b] dark:text-[#F0EAE1] tracking-tight">
                  Workspaces
                </h2>
                <Link href="/dashboard?view=workspaces" className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] hover:underline whitespace-nowrap">
                  Manage
                </Link>
              </div>
              {loading ? (
                <div className="p-6 space-y-3">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-[#E5DEC9] dark:bg-[#181614] animate-pulse" />
                  ))}
                </div>
              ) : folders.length === 0 ? (
                <div className="p-8 text-center text-[17px] text-[#4f4b40] dark:text-[#A89F91] font-sans">
                  Workspaces group related decisions so each one builds on the last.
                </div>
              ) : (
                <ul className="divide-y divide-[#cfc7b2]/70 dark:divide-[#38332C]">
                  {folders.slice(0, 6).map((f) => {
                    const count = decisionsPerFolder.get(f.id) ?? f.decision_count ?? 0;
                    return (
                      <li key={f.id}>
                        <Link href={`/folders/${f.id}`} className="flex items-center gap-4 px-5 sm:px-6 py-4.5 hover:bg-[#E5DEC9]/60 dark:hover:bg-[#1E1B18] transition-colors group">
                          <div className="w-11 h-11 rounded-xl bg-[#E5DEC9] dark:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] flex items-center justify-center shrink-0 shadow-2xs">
                            <FolderIcon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-newsreader text-[19px] sm:text-[20px] font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] truncate group-hover:text-[#7a4e10] dark:group-hover:text-[#D4AA50] transition-colors leading-snug">
                              {f.name}
                            </p>
                            <p className="text-[14px] text-[#4f4b40] dark:text-[#A89F91] mt-0.5 font-sans">
                              {count} decision{count === 1 ? "" : "s"}
                            </p>
                          </div>
                          <ArrowRight className="w-5 h-5 text-[#7B8491] shrink-0 group-hover:translate-x-0.5 group-hover:text-[#7a4e10] dark:group-hover:text-[#D4AA50] transition-all" />
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
            <h2 className="font-newsreader text-2xl sm:text-3xl font-medium text-[#1d1d1b] dark:text-[#F0EAE1] mb-4 tracking-tight">
              How DecisionLens works
            </h2>
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {STEPS.map(({ Icon, title, body }, i) => (
                <li key={title} className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-5 sm:p-6 shadow-2xs">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-9 h-9 rounded-full bg-[#E5DEC9] dark:bg-[#2A2622] text-[#7a4e10] dark:text-[#D4AA50] font-mono text-[14px] font-bold flex items-center justify-center border border-[#cfc7b2] dark:border-[#38332C]">
                      {i + 1}
                    </span>
                    <Icon className="w-5 h-5 text-[#7a4e10] dark:text-[#D4AA50]" />
                  </div>
                  <h3 className="font-newsreader text-xl font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] mb-1.5">
                    {title}
                  </h3>
                  <p className="text-[15px] sm:text-[16px] text-[#4f4b40] dark:text-[#A89F91] leading-relaxed font-sans">
                    {body}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </AppShell>
  );
}
