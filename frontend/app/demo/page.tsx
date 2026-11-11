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
  Key,
} from "lucide-react";

type Stage = "ingestion" | "structuring" | "analysis" | "frameworks" | "synthesis";
type DilemmaId = "cloud-exit" | "redis-license";

const STAGES: { id: Stage; num: string; label: string; desc: string }[] = [
  { id: "ingestion", num: "01", label: "DELIBERATION INPUT", desc: "Live room debate & voice recording" },
  { id: "structuring", num: "02", label: "4-BUCKET EXTRACTION", desc: "Risks, constraints, alternatives, criteria" },
  { id: "analysis", num: "03", label: "BIAS & COGS AUDIT", desc: "Resume-hype & egress/licensing trap" },
  { id: "frameworks", num: "04", label: "BAYESIAN TCO MATRIX", desc: "Weighted evaluation of 3 paths" },
  { id: "synthesis", num: "05", label: "EXECUTIVE ADR SEAL", desc: "Cryptographic SHA-256 decision record" },
];

interface ScenarioData {
  id: DilemmaId;
  tabLabel: string;
  dossierCode: string;
  category: string;
  title: string;
  dilemmaSummary: string;
  transcript: { time: string; speaker: string; text: string }[];
  risks: string[];
  constraints: string[];
  alternatives: string[];
  criteria: string[];
  traps: { title: string; assumption: string; reality: string }[];
  matrixHeaders: [string, string, string];
  matrixRows: { metric: string; weight: string; opt1: string; opt2: string; opt3: string }[];
  matrixWinner: [string, string, string];
  adrNumber: string;
  adrTitle: string;
  adrProblem: string;
  adrOptions: string;
  adrConsequence: string;
  sha: string;
}

const SCENARIOS: Record<DilemmaId, ScenarioData> = {
  "cloud-exit": {
    id: "cloud-exit",
    tabLabel: "Dilemma 01: 37signals Cloud Exit",
    dossierCode: "DOSSIER #CLOUD-EXIT-2026-BHARAT",
    category: "CLOUD REPATRIATION & TCO (2026 SCENARIO)",
    title: "“The Cloud Exit Dilemma: Repatriate Core Workloads from AWS to Bare-Metal or Renew 3-Year Enterprise Discount?”",
    dilemmaSummary:
      "Following the 37signals cloud repatriation playbook, our annual AWS compute, cross-AZ egress, and managed RDS bill hit ₹64 Lakhs/yr. Should we migrate database and steady-state workers to colocated bare-metal servers in Mumbai (saving ₹38L/yr) or accept cloud lock-in?",
    transcript: [
      {
        time: "00:03:14",
        speaker: "VP of Engineering",
        text: "“DHH saved over $3M pulling Basecamp out of AWS. Look at our cloud bill—we are paying ₹5.3 Lakhs every month to AWS. Almost 35% of that is pure egress fees between availability zones and managed RDS markup! If we buy Dell PowerEdge servers and colocate them in Mumbai (CtrlS/Sify), the hardware pays for itself in 9 months.”",
      },
      {
        time: "00:06:50",
        speaker: "DevOps / Lead SRE",
        text: "“Wait, who is going to drive to the Mumbai data center when a NVMe drive fails at 3 AM on a Sunday? In AWS, automated failover takes 30 seconds. On bare-metal, we need redundant hot spares, physical smart hands contracts, and our 2-person infra team will burn out.”",
      },
      {
        time: "00:10:05",
        speaker: "Chief Financial Officer (CFO)",
        text: "“AWS offered us a 28% Enterprise Discount Plan (EDP) if we commit for 3 years today. But if we sign that 3-year agreement, we are legally locked into ₹1.4 Crores minimum spend even if our user traffic drops.”",
      },
      {
        time: "00:14:22",
        speaker: "Security & Compliance Officer",
        text: "“Under the DPDP Act 2023, bare-metal colocated inside India gives us complete air-gapped physical data sovereignty. No foreign subpoenas, no shared multitenant hypervisor vulnerabilities.”",
      },
    ],
    risks: [
      "Physical Hardware Failures: Drive/RAM degradation requires on-site replacement protocol.",
      "3-Year AWS Contract Lock-In: ₹1.4 Crore irrevocable liability under the proposed EDP.",
    ],
    constraints: [
      "SRE Headcount Cap: Team cannot hire more than 2 dedicated infrastructure engineers.",
      "Uptime SLA: Must maintain 99.95% API availability during payment processing peaks.",
    ],
    alternatives: [
      "Strategy A: 100% Cloud Repatriation (Colocated Dell hardware in Mumbai tier-4 DC).",
      "Strategy B: Sign 3-Year AWS EDP with Savings Plans.",
      "Strategy C: Hybrid Symmetrical Model (Databases on bare-metal, frontends on AWS).",
    ],
    criteria: [
      "3-Year Cumulative TCO Savings (Weight: 40%).",
      "Operational Burden on 2-person SRE Team (Weight: 35%).",
      "Disaster Recovery & Redundancy (Weight: 25%).",
    ],
    traps: [
      {
        title: "TRAP #1: DOGMATIC CLOUD CONVENIENCE BIAS (The AWS Sunk-Cost)",
        assumption: "Leadership assumed “Cloud is always cheaper because we don’t buy physical servers.”",
        reality:
          "AWS RDS markup charges a 4.2x multiple over raw compute. The company paid ₹22 Lakhs in 2025 purely for cross-AZ traffic and managed database tax for steady-state transactional loads that never fluctuated.",
      },
      {
        title: "TRAP #2: THE FULL-EXIT SRE BURNOUT RISK (The 100% Repatriation Blind Spot)",
        assumption: "“We can just buy servers and completely turn off AWS in 3 months.”",
        reality:
          "Moving elastic customer-facing microservices to bare-metal requires building custom autoscaling and edge DDoS defense, requiring 2 extra SRE hires (costing ₹36 Lakhs/year in salaries), completely negating the hardware savings.",
      },
    ],
    matrixHeaders: ["Option 1: AWS 3-Yr EDP", "Option 2: 100% Bare-Metal", "Option 3: Hybrid Repatriation"],
    matrixRows: [
      {
        metric: "3-Year Cumulative Cost",
        weight: "40%",
        opt1: "₹1.48 Crores",
        opt2: "₹62 Lakhs",
        opt3: "₹74 Lakhs (₹74L Net Savings)",
      },
      {
        metric: "SRE Operational Burden",
        weight: "35%",
        opt1: "Low (Managed AWS)",
        opt2: "Very High (Burnout)",
        opt3: "Medium (Zero Headcount Bump)",
      },
      {
        metric: "Contractual Flexibility",
        weight: "25%",
        opt1: "Locked 36 Months",
        opt2: "100% Owned Capex",
        opt3: "High (Elastic Burst in AWS)",
      },
    ],
    matrixWinner: ["5.85 / 10", "6.90 / 10", "8.95 / 10 (WINNER)"],
    adrNumber: "#ADR-2026-EXIT",
    adrTitle: "Execute Hybrid Cloud Exit: Repatriate Primary Database & Steady-State Workers to Indian Bare-Metal DC",
    adrProblem:
      "Annual AWS spend reached ₹64 Lakhs/yr, with 35% consumed by cross-AZ data egress and managed RDS markups. The proposed 3-year AWS enterprise commitment would lock ₹1.4 Crores in capital.",
    adrOptions:
      "1. AWS 3-Year EDP: 28% discount, but locks ₹1.48 Crores.\n2. 100% Bare-Metal Migration: High savings, but overloads 2-person SRE team.\n3. Hybrid Repatriation: Accepted. Colocate 4 Dell PowerEdge servers in Mumbai for PostgreSQL and heavy background jobs; retain customer-facing APIs on AWS for elastic burst scaling.",
    adrConsequence:
      "Saves ₹74 Lakhs over 36 months. Database query latency drops from 18ms to 2.1ms due to dedicated NVMe PCIe bus. Zero new SRE hires required. 100% DPDP Act 2023 compliant data residency guaranteed.",
    sha: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  },
  "redis-license": {
    id: "redis-license",
    tabLabel: "Dilemma 02: Redis / Open-Source License Revolt",
    dossierCode: "DOSSIER #LICENSE-REVOLT-2026-VALKEY",
    category: "IP & SOFTWARE LICENSING LIABILITY",
    title: "“The Open-Source License Shock: Pay Commercial Redis Enterprise Fees vs Execute Rapid Migration to Valkey”",
    dilemmaSummary:
      "Following Redis Ltd's transition from open-source BSD to commercial RSALv2/SSPL, our enterprise production clusters face legal compliance audit exposure. Should we pay ₹28 Lakhs/yr in commercial licenses or execute an immediate hot cutover to the Linux Foundation fork (Valkey)?",
    transcript: [
      {
        time: "00:02:40",
        speaker: "Chief Legal Counsel",
        text: "“Redis changed their license from BSD to RSALv2. Under our current enterprise SaaS terms, embedding Redis as a managed service creates immediate copyright exposure. We must either sign their $35k/year enterprise contract or remove Redis binary dependencies before our next SOC-2 audit in 60 days.”",
      },
      {
        time: "00:05:15",
        speaker: "Principal Backend Architect",
        text: "“The Linux Foundation, AWS, Google, and Ericsson already created Valkey 7.2 as a 100% drop-in BSD fork. The C API and Redis serialization protocol (RESP3) are identical. We don't need to pay Redis a single rupee if we swap the client connection endpoint.”",
      },
      {
        time: "00:08:30",
        speaker: "VP of Product",
        text: "“Wait, if we migrate to Valkey right now, does that pull 3 senior engineers off our Q2 product roadmap? If this migration introduces caching cache-stampede bugs on our checkout pipeline, the business losses will exceed that license fee.”",
      },
      {
        time: "00:12:10",
        speaker: "Security & SRE Lead",
        text: "“Valkey has zero upstream CVE backports from Redis Ltd anymore. If a zero-day memory corruption bug hits Valkey, who provides the 24/7 SLA patch? Are we betting production uptime on open-source volunteers?”",
      },
    ],
    risks: [
      "Legal Copyright Liability: Unlicensed Redis 7.4+ binaries violate SOC-2 and enterprise vendor contracts.",
      "Roadmap Delay: Pulling 3 senior backend engineers to test Valkey cutover delays Q2 feature revenue.",
    ],
    constraints: [
      "Audit Deadline: 60-day hard window before enterprise ISO 27001 / SOC-2 license compliance audit.",
      "Zero Downtime: Caching cutover cannot trigger cache stampedes on active session tokens.",
    ],
    alternatives: [
      "Path 1: Pay Redis Ltd ₹28L/yr Enterprise License (Guaranteed SLAs & CVE patches).",
      "Path 2: Full Valkey 7.2 Cutover (100% Open-Source BSD, zero licensing cost).",
      "Path 3: Staged Dual-Run (Migrate read-only session caches to Valkey first; hold critical ledgers).",
    ],
    criteria: [
      "Legal Non-Infringement & Compliance (Weight: 45%).",
      "Total Annual Cost & Engineering Overhead (Weight: 35%).",
      "Zero-Downtime Reliability & CVE Support (Weight: 20%).",
    ],
    traps: [
      {
        title: "TRAP #1: THE 'OPEN-SOURCE IS FOREVER FREE' FALLACY",
        assumption: "Engineering assumed dependencies like Redis, Docker, and Terraform remain free forever.",
        reality:
          "Single-vendor open-source software (Open-Core) carries catastrophic rug-pull risk. Caching infrastructure chosen solely for developer familiarity created ₹28L unbudgeted annual recurring liability.",
      },
      {
        title: "TRAP #2: THE RE-WRITE PANIC BIAS",
        assumption: "“We must immediately rewrite all caching wrappers to another database.”",
        reality:
          "Valkey maintains 100% wire-protocol compatibility. Rewriting application client code was an overreaction; the issue was purely binary infrastructure configuration, not application logic.",
      },
    ],
    matrixHeaders: ["Option 1: Pay Redis Ltd", "Option 2: 100% Valkey Cutover", "Option 3: Staged Dual-Run"],
    matrixRows: [
      {
        metric: "Annual Licensing Cost",
        weight: "45%",
        opt1: "₹28 Lakhs / year",
        opt2: "₹0 (Zero License Fees)",
        opt3: "₹0 (Zero License Fees)",
      },
      {
        metric: "Roadmap Disruption",
        weight: "35%",
        opt1: "0 Days (Contract Sign)",
        opt2: "18 Days (High Risk)",
        opt3: "4 Days (Low Risk Canary)",
      },
      {
        metric: "Audit Compliance & CVE",
        weight: "20%",
        opt1: "Certified",
        opt2: "Linux Foundation Support",
        opt3: "Linux Foundation Support",
      },
    ],
    matrixWinner: ["6.20 / 10", "7.40 / 10", "9.15 / 10 (WINNER)"],
    adrNumber: "#ADR-2026-VALKEY",
    adrTitle: "Canary Migration to Valkey 7.2: Eliminate Licensing Liability without Roadmap Disruption",
    adrProblem:
      "Redis transition to commercial RSALv2 created ₹28 Lakhs annual exposure and legal audit risk across production clusters.",
    adrOptions:
      "1. Pay Redis Ltd: Safe but burns ₹28L/yr.\n2. Instant 100% Valkey Cutover: Free, but risks session cache stampede.\n3. Staged Canary Dual-Run: Accepted. Cut over stateless session tiers to Valkey in Week 1; validate latency for 14 days before cutting over primary transaction caches.",
    adrConsequence:
      "Saves ₹28 Lakhs annually. Zero legal liability in upcoming SOC-2 audit. Wire-level RESP3 compatibility confirmed with 0.4ms p99 latency parity.",
    sha: "4e9b72a819c961e05d214bf3428989f6d7a18e0018f237890cd123456789abcd",
  },
};

export default function DemoDecisionPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [selectedDilemma, setSelectedDilemma] = useState<DilemmaId>("cloud-exit");
  const [currentStage, setCurrentStage] = useState<Stage>("synthesis");
  const [copiedSha, setCopiedSha] = useState(false);

  const isDark = theme === "dark";
  const scenario = SCENARIOS[selectedDilemma];

  const handleCopySha = () => {
    navigator.clipboard.writeText(scenario.sha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  return (
    <div
      data-theme={theme}
      className={`min-h-screen font-courier antialiased transition-colors duration-300 flex flex-col ${
        isDark ? "bg-[#181614] text-[#F0EAE1]" : "bg-[#F4F0E6] text-[#1d1d1b]"
      }`}
    >
      {/* Top Banner: Synthetic Sandbox Disclaimer */}
      <div className="bg-[#172033] dark:bg-[#2A241C] text-[#F5F1E8] dark:text-[#D4AA50] px-6 py-2 border-b border-[#38332C] flex items-center justify-between text-[11px] font-mono tracking-wider">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>EXECUTIVE BENCHMARK DOSSIER (READ-ONLY DEMO):</strong> Live Simulation of 2026 Tech &amp; Cloud Dilemmas. Zero real user data.
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
            {scenario.dossierCode}
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

      {/* Scenario Switcher Tabs: Cloud Exit vs Redis License */}
      <div className="bg-[#E5DEC9] dark:bg-[#151311] border-b border-[#172033]/15 dark:border-[#38332C] px-6 lg:px-16 py-2.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2 text-xs font-courier">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[10px] uppercase tracking-wider text-[#596474] dark:text-[#A89F91]">
              SELECT 2026 ARCHETYPE:
            </span>
            <div className="flex items-center gap-1.5">
              {(["cloud-exit", "redis-license"] as DilemmaId[]).map((key) => {
                const s = SCENARIOS[key];
                const isSelected = selectedDilemma === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDilemma(key)}
                    className={`px-3 py-1 rounded text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      isSelected
                        ? isDark
                          ? "bg-[#D4AA50] text-[#181614] shadow-xs"
                          : "bg-[#172033] text-[#F5F1E8] shadow-xs"
                        : "bg-transparent text-[#596474] dark:text-[#A89F91] hover:text-[#172033] dark:hover:text-[#F0EAE1]"
                    }`}
                  >
                    {s.tabLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <span className="text-[10px] text-[#596474] dark:text-[#A89F91] hidden sm:inline">
            Active: <strong>{scenario.category}</strong>
          </span>
        </div>
      </div>

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
            <span>CATEGORY: {scenario.category}</span>
            <span>•</span>
            <span>DECISION STATUS: AUDITED &amp; SEALED</span>
          </div>
          <h1 className="font-newsreader text-3xl sm:text-5xl font-normal text-[#172033] dark:text-[#F0EAE1] leading-tight">
            {scenario.title}
          </h1>
          <p className="text-xs sm:text-sm font-courier text-[#596474] dark:text-[#A89F91] max-w-3xl leading-relaxed">
            {scenario.dilemmaSummary}
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
              {scenario.transcript.map((t, idx) => (
                <div key={idx} className="space-y-1">
                  <span className="font-bold text-[#172033] dark:text-[#D4AA50]">
                    [{t.time}] {t.speaker}:
                  </span>
                  <p className="italic">{t.text}</p>
                </div>
              ))}
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
                  <span>[RISKS &amp; HIDDEN EXPOSURE]</span>
                  <span>({scenario.risks.length} IDENTIFIED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  {scenario.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              {/* Constraints */}
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  <span>[HARD CONSTRAINTS]</span>
                  <span>({scenario.constraints.length} IDENTIFIED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  {scenario.constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              {/* Alternatives */}
              <div className="p-4 rounded-xl border border-blue-300 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-400">
                  <span>[EXPLORED ALTERNATIVES]</span>
                  <span>({scenario.alternatives.length} OPTIONS)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  {scenario.alternatives.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>

              {/* Evaluation Criteria */}
              <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  <span>[EVALUATION METRICS]</span>
                  <span>(WEIGHTED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  {scenario.criteria.map((cr, i) => (
                    <li key={i}>{cr}</li>
                  ))}
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
                {scenario.traps.length} Critical Fallacies Flagged
              </span>
            </div>

            <div className="space-y-4">
              {scenario.traps.map((tr, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border space-y-2 ${
                    idx === 0
                      ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20"
                      : "border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20"
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 text-xs font-bold font-mono ${
                      idx === 0 ? "text-rose-700 dark:text-rose-400" : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>{tr.title}</span>
                  </div>
                  <p className="text-xs font-courier text-[#172033] dark:text-[#F0EAE1] leading-relaxed">
                    <strong>The False Assumption:</strong> {tr.assumption}
                    <br />
                    <strong>The Audited Reality:</strong> {tr.reality}
                  </p>
                </div>
              ))}
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
                <span>View Bayesian Decision Matrix (Stage 4) →</span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 4: FRAMEWORKS (Bayesian Decision Matrix) */}
        {currentStage === "frameworks" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Bayesian Multi-Criteria Matrix
                </h2>
              </div>
              <span className="text-[11px] text-[#596474] dark:text-[#A89F91]">
                Weighted Evaluation of 3 Paths
              </span>
            </div>

            <div className="border border-[#cfc7b2] dark:border-[#38332C] rounded-xl overflow-hidden text-xs font-courier">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EDE7D6] dark:bg-[#201C18] border-b border-[#cfc7b2] dark:border-[#38332C]">
                    <th className="p-3 font-bold">Decision Dimension</th>
                    <th className="p-3 font-bold">Weight</th>
                    <th className="p-3 font-bold">{scenario.matrixHeaders[0]}</th>
                    <th className="p-3 font-bold">{scenario.matrixHeaders[1]}</th>
                    <th className="p-3 font-bold text-[#7a4e10] dark:text-[#D4AA50]">{scenario.matrixHeaders[2]}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cfc7b2]/40 dark:divide-[#38332C]">
                  {scenario.matrixRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-semibold">{row.metric}</td>
                      <td className="p-3 opacity-75">{row.weight}</td>
                      <td className="p-3 text-rose-700 dark:text-rose-400">{row.opt1}</td>
                      <td className="p-3 text-amber-700 dark:text-amber-400">{row.opt2}</td>
                      <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">{row.opt3}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#EDE7D6]/40 dark:bg-[#201C18]/40 font-bold text-sm">
                    <td className="p-3">OVERALL BAYESIAN SCORE</td>
                    <td className="p-3">100%</td>
                    <td className="p-3 text-rose-700 dark:text-rose-400">{scenario.matrixWinner[0]}</td>
                    <td className="p-3 text-amber-700 dark:text-amber-400">{scenario.matrixWinner[1]}</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">{scenario.matrixWinner[2]}</td>
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
                <span>Read Boardroom ADR `{scenario.adrNumber}` (Stage 5) →</span>
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
                    ARCHITECTURAL DECISION RECORD {scenario.adrNumber}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-newsreader font-bold text-[#172033] dark:text-[#F0EAE1]">
                    {scenario.adrTitle}
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
                  <p className="mt-1 opacity-90">{scenario.adrProblem}</p>
                </div>

                <div>
                  <h4 className="font-bold text-[#172033] dark:text-[#D4AA50] uppercase tracking-wider text-[11px]">
                    2. Evaluated Options &amp; Reasoning
                  </h4>
                  <p className="mt-1 opacity-90 whitespace-pre-line">{scenario.adrOptions}</p>
                </div>

                <div>
                  <h4 className="font-bold text-[#172033] dark:text-[#D4AA50] uppercase tracking-wider text-[11px]">
                    3. Consequence &amp; Verified Financial Impact
                  </h4>
                  <p className="mt-1 opacity-90">{scenario.adrConsequence}</p>
                </div>
              </div>

              {/* Cryptographic SHA-256 Audit Seal */}
              <div className="pt-4 border-t border-[#172033]/20 dark:border-[#38332C] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-2 text-[#5c5549] dark:text-[#a89f91]">
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Cryptographic SHA-256 Seal: <code className="text-[#172033] dark:text-[#F0EAE1]">{scenario.sha.slice(0, 10)}...{scenario.sha.slice(-6)}</code>
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
                  Capture live meeting audio, stress-test licensing/cloud traps, and seal living ADRs.
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
