"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import BrandLogo from "@/components/BrandLogo";
import ApertureToggle from "@/components/ApertureToggle";
import {
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  FileText,
  Layers,
  Scale,
  BrainCircuit,
  Lock,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Copy,
  Check,
  Server,
  DollarSign,
  TrendingDown,
  Building,
} from "lucide-react";

type Stage = "ingestion" | "structuring" | "analysis" | "frameworks" | "synthesis";

const STAGES: { id: Stage; num: string; label: string; desc: string }[] = [
  { id: "ingestion", num: "01", label: "DELIBERATION INPUT", desc: "Live room debate & voice recording" },
  { id: "structuring", num: "02", label: "4-BUCKET EXTRACTION", desc: "Risks, constraints, alternatives, criteria" },
  { id: "analysis", num: "03", label: "BIAS & COGS AUDIT", desc: "Resume-hype & egress cost trap" },
  { id: "frameworks", num: "04", label: "BAYESIAN TCO MATRIX", desc: "Cloud Exit vs Managed AWS 3-Yr Model" },
  { id: "synthesis", num: "05", label: "EXECUTIVE ADR SEAL", desc: "Cryptographic SHA-256 decision record" },
];

export default function DemoDecisionPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [currentStage, setCurrentStage] = useState<Stage>("synthesis");
  const [copiedSha, setCopiedSha] = useState(false);

  const isDark = theme === "dark";

  const handleCopySha = () => {
    navigator.clipboard.writeText("7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069");
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  return (
    <div
      data-theme={theme}
      className={`min-h-screen font-courier antialiased transition-colors duration-300 flex flex-col ${
        isDark
          ? "bg-[#181614] text-[#F0EAE1]"
          : "bg-[#F4F0E6] text-[#1d1d1b]"
      }`}
    >
      {/* Top Banner: Synthetic Sandbox Disclaimer */}
      <div className="bg-[#172033] dark:bg-[#2A241C] text-[#F5F1E8] dark:text-[#D4AA50] px-6 py-2 border-b border-[#38332C] flex items-center justify-between text-[11px] font-mono tracking-wider">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>EXECUTIVE BENCHMARK DOSSIER (READ-ONLY DEMO):</strong> The 2026 Cloud Exit Dilemma — AWS Cloud vs Bare-Metal Hybrid. Zero user data.
          </span>
        </div>
        <Link
          href="/auth?redirect=/dashboard?action=new"
          className="underline font-bold hover:text-white dark:hover:text-[#F0EAE1] ml-4 shrink-0"
        >
          Challenge Your Own Decision →
        </Link>
      </div>

      {/* Masthead Header */}
      <header className="h-[58px] px-6 lg:px-16 border-b border-[#172033]/15 dark:border-[#38332C] flex items-center justify-between shrink-0 bg-transparent backdrop-blur-md">
        <div className="flex items-center gap-6">
          <BrandLogo theme={theme} />
          <span className="hidden md:inline px-2 py-0.5 rounded text-[10px] font-bold border border-[#172033]/20 dark:border-[#38332C] text-[#596474] dark:text-[#A89F91]">
            DOSSIER #CLOUD-EXIT-2026-BHARAT
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ApertureToggle theme={theme} onToggle={toggleTheme} />
          <Link
            href="/"
            className="text-[11px] font-bold tracking-[0.08em] px-3 py-1.5 border border-[#172033]/30 dark:border-[#38332C] hover:bg-[#172033] hover:text-white dark:hover:bg-[#D4AA50] dark:hover:text-[#181614] transition-colors"
          >
            ← Back to Home
          </Link>
          <Link
            href="/auth?redirect=/dashboard?action=new"
            className="text-[11px] font-bold tracking-[0.08em] px-3.5 py-1.5 border border-[#172033] bg-[#172033] text-[#F5F1E8] dark:border-[#D4AA50] dark:bg-[#D4AA50] dark:text-[#181614] hover:opacity-90 transition-opacity"
          >
            Challenge a Real Decision →
          </Link>
        </div>
      </header>

      {/* 5-Stage Interactive Workflow Stepper */}
      <div className="border-b border-[#172033]/15 dark:border-[#38332C] bg-[#EDE7D6]/60 dark:bg-[#201C18]/60 px-6 lg:px-16 py-3 overflow-x-auto">
        <div className="max-w-5xl mx-auto flex items-center justify-between min-w-[700px]">
          {STAGES.map((s, idx) => {
            const isActive = currentStage === s.id;
            return (
              <React.Fragment key={s.id}>
                <button
                  type="button"
                  onClick={() => setCurrentStage(s.id)}
                  className={`flex items-center gap-2.5 py-1.5 px-3 rounded text-left transition-all cursor-pointer ${
                    isActive
                      ? isDark
                        ? "bg-[#D4AA50] text-[#181614] shadow-xs"
                        : "bg-[#172033] text-[#F5F1E8] shadow-xs"
                      : "text-[#596474] dark:text-[#A89F91] hover:text-[#172033] dark:hover:text-[#F0EAE1]"
                  }`}
                >
                  <span className={`text-[10px] font-bold font-mono ${isActive ? "opacity-90" : "opacity-60"}`}>
                    {s.num}
                  </span>
                  <div>
                    <span className="text-[11px] font-bold tracking-wider uppercase block leading-none">
                      {s.label}
                    </span>
                    <span className={`text-[9px] opacity-75 font-sans hidden sm:block ${isActive ? "text-current" : ""}`}>
                      {s.desc.slice(0, 24)}...
                    </span>
                  </div>
                </button>
                {idx < STAGES.length - 1 && (
                  <span className="text-xs opacity-30 select-none">→</span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Dossier Stage Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 sm:p-10 space-y-8">
        {/* Title & Metadata Card */}
        <div className="space-y-2 border-b border-[#172033]/15 dark:border-[#38332C] pb-6">
          <div className="flex items-center gap-2 text-[10px] font-courier uppercase tracking-widest text-[#596474] dark:text-[#A89F91]">
            <span>CATEGORY: CLOUD EXIT &amp; INFRASTRUCTURE TCO</span>
            <span>•</span>
            <span>DECISION STATUS: AUDITED &amp; SEALED</span>
          </div>
          <h1 className="font-newsreader text-3xl sm:text-5xl font-normal text-[#172033] dark:text-[#F0EAE1] leading-tight">
            “The Cloud Exit Dilemma: Repatriate Core Workloads from AWS to Bare-Metal or Renew 3-Year Enterprise Discount?”
          </h1>
          <p className="text-xs sm:text-sm font-courier text-[#596474] dark:text-[#A89F91] max-w-3xl leading-relaxed">
            Dilemma: Following the 37signals cloud repatriation playbook, our annual AWS compute, cross-AZ egress, and managed EKS bill hit ₹64 Lakhs/year. Should we migrate database and steady-state workers to colocated bare-metal servers (saving ₹38L/yr) or accept cloud lock-in?
          </p>
        </div>

        {/* STAGE 1: INGESTION (Meeting Debate) */}
        {currentStage === "ingestion" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Raw Architectural Deliberation (Speech-to-Text)
                </h2>
              </div>
              <span className="text-[11px] text-[#596474] dark:text-[#A89F91]">
                Captured via IIT Madras IndicWhisper • 4 Participants
              </span>
            </div>

            <div className="p-5 rounded-xl border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6]/60 dark:bg-[#1E1B17]/60 space-y-4 text-xs font-courier leading-relaxed">
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:03:14] VP of Engineering:</span>
                <p className="italic">
                  “DHH saved over $3M pulling Basecamp out of AWS. Look at our cloud bill—we are paying ₹5.3 Lakhs every month to AWS. Almost 35% of that is pure egress fees between availability zones and managed RDS markup! If we buy Dell PowerEdge servers and colocate them in Mumbai (CtrlS/Sify), the hardware pays for itself in 9 months.”
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:06:50] DevOps / Lead SRE:</span>
                <p className="italic">
                  “Wait, who is going to drive to the Mumbai data center when a NVMe drive fails at 3 AM on a Sunday? In AWS, automated failover takes 30 seconds. On bare-metal, we need redundant hot spares, physical smart hands contracts, and our 2-person infra team will burn out.”
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:10:05] Chief Financial Officer (CFO):</span>
                <p className="italic">
                  “AWS offered us a 28% Enterprise Discount Plan (EDP) if we commit for 3 years today. But if we sign that 3-year agreement, we are legally locked into ₹1.4 Crores minimum spend even if our user traffic drops.”
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:14:22] Security &amp; Compliance Officer:</span>
                <p className="italic">
                  “Under the DPDP Act 2023, bare-metal colocated inside India gives us complete air-gapped physical data sovereignty. No foreign subpoenas, no shared multitenant hypervisor vulnerabilities.”
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStage("structuring")}
                className="px-5 py-2.5 rounded bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>View Extracted Points (Stage 2) →</span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 2: STRUCTURING (4-Bucket Extraction) */}
        {currentStage === "structuring" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  4-Bucket Cognitive Structuring
                </h2>
              </div>
              <span className="text-[11px] text-[#596474] dark:text-[#A89F91]">
                Isolated by Semantic Disentangler
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Risks */}
              <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400">
                  <span>[RISKS &amp; HIDDEN COSTS]</span>
                  <span>(2 IDENTIFIED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>Physical Hardware Failures: Drive/RAM degradation requires on-site replacement protocol.</li>
                  <li>3-Year AWS Contract Lock-In: ₹1.4 Crore irrevocable liability under the proposed EDP.</li>
                </ul>
              </div>

              {/* Constraints */}
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  <span>[HARD CONSTRAINTS]</span>
                  <span>(2 IDENTIFIED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>SRE Headcount Cap: Team cannot hire more than 2 dedicated infrastructure engineers.</li>
                  <li>Uptime SLA: Must maintain 99.95% API availability during payment processing peaks.</li>
                </ul>
              </div>

              {/* Alternatives */}
              <div className="p-4 rounded-xl border border-blue-300 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-400">
                  <span>[EXPLORED STRATEGIES]</span>
                  <span>(3 OPTIONS)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>Strategy A: 100% Cloud Repatriation (Colocated Dell hardware in Mumbai tier-4 DC).</li>
                  <li>Strategy B: Sign 3-Year AWS EDP with Savings Plans.</li>
                  <li>Strategy C: <strong>Hybrid Symmetrical Model (Databases on bare-metal, frontends on AWS)</strong>.</li>
                </ul>
              </div>

              {/* Evaluation Criteria */}
              <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  <span>[EVALUATION METRICS]</span>
                  <span>(WEIGHTED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>3-Year Cumulative TCO Savings (Weight: 40%).</li>
                  <li>Operational Burden on 2-person SRE Team (Weight: 35%).</li>
                  <li>Disaster Recovery &amp; Redundancy (Weight: 25%).</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setCurrentStage("ingestion")}
                className="text-xs underline font-bold"
              >
                ← Back to Deliberation
              </button>
              <button
                type="button"
                onClick={() => setCurrentStage("analysis")}
                className="px-5 py-2.5 rounded bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>Inspect Bias &amp; Cost Leaks (Stage 3) →</span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 3: ANALYSIS (Bias & COGS Stress-Test) */}
        {currentStage === "analysis" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Cognitive Biases &amp; Unvetted Financial Traps
                </h2>
              </div>
              <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                2 Critical Fallacies Flagged
              </span>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 space-y-2">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-bold font-mono">
                  <AlertTriangle className="w-4 h-4" />
                  <span>TRAP #1: DOGMATIC CLOUD CONVENIENCE BIAS (The AWS Sunk-Cost)</span>
                </div>
                <p className="text-xs font-courier text-[#172033] dark:text-[#F0EAE1] leading-relaxed">
                  <strong>The False Assumption:</strong> Leadership assumed <em>“Cloud is always cheaper because we don’t buy physical servers.”</em>  
                  <strong>The Audited Reality:</strong> AWS RDS markup charges a 4.2x multiple over raw compute. The company paid ₹22 Lakhs in 2025 purely for cross-AZ traffic and managed database tax for steady-state transactional loads that never fluctuated.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold font-mono">
                  <AlertTriangle className="w-4 h-4" />
                  <span>TRAP #2: THE FULL-EXIT SRE BURNOUT RISK (The 100% Repatriation Blind Spot)</span>
                </div>
                <p className="text-xs font-courier text-[#172033] dark:text-[#F0EAE1] leading-relaxed">
                  <strong>The False Assumption:</strong> <em>“We can just buy servers and completely turn off AWS in 3 months.”</em>  
                  <strong>The Audited Reality:</strong> Moving elastic customer-facing microservices to bare-metal requires building custom autoscaling and edge DDoS defense, requiring 2 extra SRE hires (costing ₹36 Lakhs/year in salaries), completely negating the hardware savings.
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setCurrentStage("structuring")}
                className="text-xs underline font-bold"
              >
                ← Back to Structuring
              </button>
              <button
                type="button"
                onClick={() => setCurrentStage("frameworks")}
                className="px-5 py-2.5 rounded bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>View Bayesian TCO Matrix (Stage 4) →</span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 4: FRAMEWORKS (Bayesian TCO Matrix) */}
        {currentStage === "frameworks" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Bayesian 3-Year TCO &amp; Risk Matrix
                </h2>
              </div>
              <span className="text-[11px] text-[#596474] dark:text-[#A89F91]">
                Comparing Pure Cloud vs Full Exit vs Hybrid Repatriation
              </span>
            </div>

            <div className="border border-[#cfc7b2] dark:border-[#38332C] rounded-xl overflow-hidden text-xs font-courier">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EDE7D6] dark:bg-[#201C18] border-b border-[#cfc7b2] dark:border-[#38332C]">
                    <th className="p-3 font-bold">Decision Dimension</th>
                    <th className="p-3 font-bold">Weight</th>
                    <th className="p-3 font-bold">Option 1: AWS 3-Yr EDP</th>
                    <th className="p-3 font-bold">Option 2: 100% Bare-Metal</th>
                    <th className="p-3 font-bold text-[#7a4e10] dark:text-[#D4AA50]">Option 3: Hybrid Repatriation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cfc7b2]/40 dark:divide-[#38332C]">
                  <tr>
                    <td className="p-3 font-semibold">3-Year Cumulative Cost</td>
                    <td className="p-3 opacity-75">40%</td>
                    <td className="p-3 text-rose-700 dark:text-rose-400">₹1.48 Crores</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400">₹62 Lakhs</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">₹74 Lakhs (₹74L Net Savings)</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold">SRE Operational Burden</td>
                    <td className="p-3 opacity-75">35%</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400">Low (Managed AWS)</td>
                    <td className="p-3 text-rose-700 dark:text-rose-400">Very High (Burnout)</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">Medium (Zero Headcount Bump)</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold">Contractual Flexibility</td>
                    <td className="p-3 opacity-75">25%</td>
                    <td className="p-3 text-rose-700 dark:text-rose-400">Locked 36 Months</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400">100% Owned Capex</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">High (Elastic Burst in AWS)</td>
                  </tr>
                  <tr className="bg-[#EDE7D6]/40 dark:bg-[#201C18]/40 font-bold text-sm">
                    <td className="p-3">OVERALL BAYESIAN SCORE</td>
                    <td className="p-3">100%</td>
                    <td className="p-3 text-rose-700 dark:text-rose-400">5.85 / 10</td>
                    <td className="p-3 text-amber-700 dark:text-amber-400">6.90 / 10</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">8.95 / 10 (WINNER)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setCurrentStage("analysis")}
                className="text-xs underline font-bold"
              >
                ← Back to Bias Audit
              </button>
              <button
                type="button"
                onClick={() => setCurrentStage("synthesis")}
                className="px-5 py-2.5 rounded bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>Read Boardroom ADR `#ADR-2026-EXIT` (Stage 5) →</span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 5: SYNTHESIS (Final ADR Record) */}
        {currentStage === "synthesis" && (
          <div className="space-y-6 animate-in fade-in">
            {/* Executive ADR Certificate */}
            <div className="p-6 sm:p-8 rounded-2xl border-2 border-[#172033] dark:border-[#D4AA50] bg-[#F5F1E8] dark:bg-[#1C1A17] space-y-6 shadow-xl relative">
              <div className="flex items-center justify-between border-b pb-4 border-[#172033]/20 dark:border-[#38332C]">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#7a4e10] dark:text-[#D4AA50] block">
                    ARCHITECTURAL DECISION RECORD #ADR-2026-EXIT
                  </span>
                  <h3 className="text-xl sm:text-2xl font-newsreader font-bold text-[#172033] dark:text-[#F0EAE1]">
                    Execute Hybrid Cloud Exit: Repatriate Primary Database &amp; Steady-State Workers to Indian Bare-Metal DC
                  </h3>
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-bold uppercase border border-emerald-300 dark:border-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approved Resolution
                  </span>
                </div>
              </div>

              {/* ADR Sections */}
              <div className="space-y-4 text-xs font-courier leading-relaxed">
                <div>
                  <h4 className="font-bold text-[#172033] dark:text-[#D4AA50] uppercase tracking-wider text-[11px]">
                    1. Context &amp; Problem Statement
                  </h4>
                  <p className="mt-1 opacity-90">
                    Annual AWS infrastructure spend reached ₹64 Lakhs/yr, with 35% consumed by cross-AZ data egress and managed RDS markups. The proposed 3-year AWS enterprise commitment of ₹1.4 Crores would lock capital during uncertain macro conditions.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[#172033] dark:text-[#D4AA50] uppercase tracking-wider text-[11px]">
                    2. Evaluated Options
                  </h4>
                  <p className="mt-1 opacity-90">
                    <strong>Option 1 (AWS 3-Year EDP):</strong> 28% discount, but locks ₹1.48 Crores cumulative capital.<br />
                    <strong>Option 2 (100% Bare-Metal Migration):</strong> High initial hardware savings, but overloads the 2-person SRE team with physical edge maintenance.<br />
                    <strong>Option 3 (Hybrid Repatriation): Accepted.</strong> Colocate 4 Dell PowerEdge servers in a Mumbai tier-4 data center for PostgreSQL and heavy background jobs; retain customer-facing APIs and CDN on AWS for elastic burst scaling.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[#172033] dark:text-[#D4AA50] uppercase tracking-wider text-[11px]">
                    3. Consequence &amp; Verified Financial Impact
                  </h4>
                  <p className="mt-1 opacity-90">
                    Saves ₹74 Lakhs over 36 months. Database query latency drops from 18ms to 2.1ms due to dedicated NVMe PCIe bus. Zero new SRE hires required. 100% DPDP Act 2023 compliant data residency guaranteed.
                  </p>
                </div>
              </div>

              {/* Cryptographic SHA-256 Audit Seal */}
              <div className="pt-4 border-t border-[#172033]/20 dark:border-[#38332C] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-2 text-[#5c5549] dark:text-[#a89f91]">
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Cryptographic SHA-256 Seal: <code className="text-[#172033] dark:text-[#F0EAE1]">7f83b16...9069</code>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySha}
                    className="p-1 hover:text-[#172033] dark:hover:text-[#F0EAE1] cursor-pointer"
                    title="Copy full SHA-256 hash"
                  >
                    {copiedSha ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="text-[10px] text-[#5c5549] dark:text-[#a89f91]">
                  SOC-2 Type II Certified • Non-Repudiable Boardroom Audit Digest
                </div>
              </div>
            </div>

            {/* Bottom Conversion Callout */}
            <div className="p-6 rounded-xl border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#201C18] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="font-newsreader text-lg font-bold text-[#172033] dark:text-[#F0EAE1]">
                  Ready to put your company&apos;s critical infrastructure bets under scrutiny?
                </h4>
                <p className="text-xs font-courier text-[#5c5549] dark:text-[#a89f91]">
                  Capture live meeting audio, stress-test cloud egress traps, and seal living ADRs.
                </p>
              </div>

              <Link
                href="/auth?redirect=/dashboard?action=new"
                className="px-6 py-3 rounded-lg bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-courier font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shrink-0 shadow-sm"
              >
                Challenge Your Decision →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
