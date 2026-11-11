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
} from "lucide-react";

type Stage = "ingestion" | "structuring" | "analysis" | "frameworks" | "synthesis";

const STAGES: { id: Stage; num: string; label: string; desc: string }[] = [
  { id: "ingestion", num: "01", label: "DELIBERATION INPUT", desc: "Multi-stakeholder debate & voice recording" },
  { id: "structuring", num: "02", label: "4-BUCKET EXTRACTION", desc: "Semantic cognitive categorization" },
  { id: "analysis", num: "03", label: "BIAS & GAP RESOLUTION", desc: "Sunk-cost & fallacy stress-test" },
  { id: "frameworks", num: "04", label: "TRADE-OFF MATRIX", desc: "Bayesian weighted decision scoring" },
  { id: "synthesis", num: "05", label: "EXECUTIVE ADR SEAL", desc: "Cryptographic SHA-256 decision record" },
];

export default function DemoDecisionPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [currentStage, setCurrentStage] = useState<Stage>("synthesis");
  const [copiedSha, setCopiedSha] = useState(false);

  const isDark = theme === "dark";

  const handleCopySha = () => {
    navigator.clipboard.writeText("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
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
            <strong>BENCHMARK DOSSIER (READ-ONLY DEMO):</strong> Synthetic data simulating high-stakes tech infrastructure decisions. Zero customer proprietary data.
          </span>
        </div>
        <Link
          href="/auth?redirect=/dashboard?action=new"
          className="underline font-bold hover:text-white dark:hover:text-[#F0EAE1] ml-4 shrink-0"
        >
          Create Real Decision →
        </Link>
      </div>

      {/* Masthead Header */}
      <header className="h-[58px] px-6 lg:px-16 border-b border-[#172033]/15 dark:border-[#38332C] flex items-center justify-between shrink-0 bg-transparent backdrop-blur-md">
        <div className="flex items-center gap-6">
          <BrandLogo theme={theme} />
          <span className="hidden md:inline px-2 py-0.5 rounded text-[10px] font-bold border border-[#172033]/20 dark:border-[#38332C] text-[#596474] dark:text-[#A89F91]">
            DOSSIER #BM-2026-TITAN
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
            Launch Your Decision →
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
            <span>CATEGORY: INFRASTRUCTURE &amp; VECTOR AI</span>
            <span>•</span>
            <span>DELIBERATION STATUS: SYNTHESIZED &amp; VERIFIED</span>
          </div>
          <h1 className="font-newsreader text-3xl sm:text-5xl font-normal text-[#172033] dark:text-[#F0EAE1] leading-tight">
            “Project Titan: In-House Vector Search (pgvector) vs Managed Dedicated Cloud (Pinecone)”
          </h1>
          <p className="text-xs sm:text-sm font-courier text-[#596474] dark:text-[#A89F91] max-w-3xl leading-relaxed">
            Dilemma: As AI search queries surge 14x, should we scale our existing PostgreSQL 16 cluster with pgvector HNSW indices, or offload embeddings to an external dedicated managed vector database?
          </p>
        </div>

        {/* STAGE 1: INGESTION (Meeting Debate) */}
        {currentStage === "ingestion" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Raw Stakeholder Deliberation Transcript
                </h2>
              </div>
              <span className="text-[11px] text-[#596474] dark:text-[#A89F91]">
                Captured via IIT Madras IndicWhisper • 4 Participants
              </span>
            </div>

            <div className="p-5 rounded-xl border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6]/60 dark:bg-[#1E1B17]/60 space-y-4 text-xs font-courier leading-relaxed">
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:04:12] VP of Engineering:</span>
                <p className="italic">
                  “Our engineers already know PostgreSQL inside out. If we adopt Pinecone, that’s another external vendor, another SOC-2 audit, and another monthly bill of ₹12 Lakhs as vector queries expand.”
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:06:45] Lead AI Architect:</span>
                <p className="italic">
                  “True, but pgvector HNSW indices require RAM that matches the full vector dataset. Once we cross 20 million vectors, our DB cache will be blown out, causing massive p99 latency spikes on ordinary OLTP checkout queries.”
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:09:20] Security &amp; Compliance Lead:</span>
                <p className="italic">
                  “Under the DPDP Act 2023, customer medical and banking prompts cannot leave our Indian cloud VPC without explicit consent. Does Pinecone have an AWS Mumbai / GCP Delhi region with local data guarantees?”
                </p>
              </div>
              <div className="space-y-1">
                <span className="font-bold text-[#172033] dark:text-[#D4AA50]">[00:13:02] CFO / Finance Director:</span>
                <p className="italic">
                  “We budgeted ₹25L total for AI search infra this fiscal year. If an in-house cluster requires 2 full-time DevOps engineers to babysit sharding, our operational salary cost will double that savings.”
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
                  <span>[RISKS &amp; VULNERABILITIES]</span>
                  <span>(2 IDENTIFIED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>Shared buffer cache thrashing when vector embeddings exceed available RAM.</li>
                  <li>Vendor lock-in: Pinecone proprietary API creates migration friction if pricing spikes.</li>
                </ul>
              </div>

              {/* Constraints */}
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  <span>[HARD CONSTRAINTS]</span>
                  <span>(2 IDENTIFIED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>DPDP Act 2023 Data Residency: Embeddings must remain strictly inside India (ap-south-1).</li>
                  <li>Annual Capital Cap: Total fiscal spend cannot exceed ₹25 Lakhs inclusive of egress.</li>
                </ul>
              </div>

              {/* Alternatives */}
              <div className="p-4 rounded-xl border border-blue-300 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-400">
                  <span>[EXPLORED ALTERNATIVES]</span>
                  <span>(3 OPTIONS)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>Option A: Dedicated read-replica PostgreSQL instance isolated exclusively for pgvector.</li>
                  <li>Option B: Pinecone Serverless (Multi-tenant with Indian VPC peering).</li>
                  <li>Option C: Self-hosted Qdrant on local Kubernetes cluster.</li>
                </ul>
              </div>

              {/* Evaluation Criteria */}
              <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  <span>[DECISION CRITERIA]</span>
                  <span>(WEIGHTED)</span>
                </div>
                <ul className="text-xs font-courier space-y-1.5 list-disc pl-4 text-[#172033] dark:text-[#F0EAE1]">
                  <li>p99 Query Latency under 50ms at 25M vectors (Weight: 35%).</li>
                  <li>Total Cost of Ownership (TCO) inclusive of SRE maintenance (Weight: 35%).</li>
                  <li>Regulatory Compliance &amp; Audit Trail (Weight: 30%).</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setCurrentStage("ingestion")}
                className="text-xs underline font-bold"
              >
                ← Back to Transcript
              </button>
              <button
                type="button"
                onClick={() => setCurrentStage("analysis")}
                className="px-5 py-2.5 rounded bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>Inspect Bias &amp; Gaps (Stage 3) →</span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 3: ANALYSIS (Bias & Gap Stress-Test) */}
        {currentStage === "analysis" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Cognitive Bias &amp; Reasoning Flaws Flagged
                </h2>
              </div>
              <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                2 Critical Traps Exposed
              </span>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 space-y-2">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 text-xs font-bold font-mono">
                  <AlertTriangle className="w-4 h-4" />
                  <span>TRAP #1: SUNK-COST FALLACY (Dev Familiarity Bias)</span>
                </div>
                <p className="text-xs font-courier text-[#172033] dark:text-[#F0EAE1] leading-relaxed">
                  <strong>The Flaw:</strong> Leadership argued <em>“We already mastered Postgres, so pgvector is free.”</em>  
                  <strong>The Reality:</strong> pgvector is not free when scale hits 25M vectors. Managing memory indexing requires upgrading AWS RDS Aurora to a memory-optimized `db.r6g.4xlarge` (costing ₹18.2L/yr), completely erasing the presumed cost advantage.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold font-mono">
                  <AlertTriangle className="w-4 h-4" />
                  <span>TRAP #2: SILENT REGULATORY BLIND SPOT (DPDP Act Data Residency)</span>
                </div>
                <p className="text-xs font-courier text-[#172033] dark:text-[#F0EAE1] leading-relaxed">
                  <strong>The Flaw:</strong> Proposing Pinecone without verifying Indian VPC availability.
                  <strong>The Reality:</strong> Shipping raw prompt vector embeddings to US-East violates Section 43A and DPDP Act provisions for cross-border transfer of sensitive financial identifiers.
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
                <span>View Trade-Off Matrix (Stage 4) →</span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 4: FRAMEWORKS (Trade-off Matrix) */}
        {currentStage === "frameworks" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-[#172033]/15 dark:border-[#38332C]">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Weighted Trade-Off Matrix
                </h2>
              </div>
              <span className="text-[11px] text-[#596474] dark:text-[#A89F91]">
                Scored via Bayesian Multi-Criteria Analysis
              </span>
            </div>

            <div className="border border-[#cfc7b2] dark:border-[#38332C] rounded-xl overflow-hidden text-xs font-courier">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EDE7D6] dark:bg-[#201C18] border-b border-[#cfc7b2] dark:border-[#38332C]">
                    <th className="p-3 font-bold">Criteria</th>
                    <th className="p-3 font-bold">Weight</th>
                    <th className="p-3 font-bold">Option A: pgvector (Dedicated Replica)</th>
                    <th className="p-3 font-bold">Option B: Pinecone (Managed Cloud)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cfc7b2]/40 dark:divide-[#38332C]">
                  <tr>
                    <td className="p-3 font-semibold">Latency under Scale (&lt;50ms p99)</td>
                    <td className="p-3 opacity-75">35%</td>
                    <td className="p-3 text-amber-700 dark:text-amber-400 font-bold">7.2 / 10 (RAM Bound)</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">9.4 / 10 (Fast HNSW)</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold">Total Cost of Ownership (₹25L Cap)</td>
                    <td className="p-3 opacity-75">35%</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">8.8 / 10 (₹14.2L/yr)</td>
                    <td className="p-3 text-rose-700 dark:text-rose-400 font-bold">5.5 / 10 (₹28.5L/yr at scale)</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold">DPDP Act Compliance &amp; Residency</td>
                    <td className="p-3 opacity-75">30%</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-bold">10 / 10 (In-VPC VPC)</td>
                    <td className="p-3 text-rose-700 dark:text-rose-400 font-bold">4.0 / 10 (Requires Cross-Border)</td>
                  </tr>
                  <tr className="bg-[#EDE7D6]/40 dark:bg-[#201C18]/40 font-bold text-sm">
                    <td className="p-3">OVERALL WEIGHTED SCORE</td>
                    <td className="p-3">100%</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400">8.60 / 10 (RECOMMENDED)</td>
                    <td className="p-3 text-[#596474] dark:text-[#A89F91]">6.42 / 10</td>
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
                ← Back to Bias Analysis
              </button>
              <button
                type="button"
                onClick={() => setCurrentStage("synthesis")}
                className="px-5 py-2.5 rounded bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>Read Final Executive ADR (Stage 5) →</span>
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
                    ARCHITECTURAL DECISION RECORD #ADR-0419
                  </span>
                  <h3 className="text-xl sm:text-2xl font-newsreader font-bold text-[#172033] dark:text-[#F0EAE1]">
                    Deploy Isolated pgvector Read-Replica Inside Indian Cloud VPC
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
                    1. Context &amp; Problem
                  </h4>
                  <p className="mt-1 opacity-90">
                    Vector query volume increased 14x due to conversational search features. Embedding lookups were risking primary transaction DB stability and facing DPDP Act residency constraints.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[#172033] dark:text-[#D4AA50] uppercase tracking-wider text-[11px]">
                    2. Considered Options
                  </h4>
                  <p className="mt-1 opacity-90">
                    1. Colocated pgvector on primary Aurora DB. (Rejected: buffer lock contention).<br />
                    2. Pinecone Serverless Cloud. (Rejected: fails ₹25L TCO cap and data residency).<br />
                    3. <strong>Dedicated PostgreSQL Read-Replica with pgvector HNSW indexing. (Accepted)</strong>
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[#172033] dark:text-[#D4AA50] uppercase tracking-wider text-[11px]">
                    3. Decision &amp; Consequences
                  </h4>
                  <p className="mt-1 opacity-90">
                    Provision a dedicated `db.r6g.2xlarge` read-replica purely for vector queries. Primary OLTP database remains 100% unaffected. Total annual spend locked at ₹14.2 Lakhs (saving ₹10.8L against budget), with zero external cross-border data leakage.
                  </p>
                </div>
              </div>

              {/* Cryptographic SHA-256 Audit Seal */}
              <div className="pt-4 border-t border-[#172033]/20 dark:border-[#38332C] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-mono">
                <div className="flex items-center gap-2 text-[#5c5549] dark:text-[#a89f91]">
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    SHA-256 Audit Digest: <code className="text-[#172033] dark:text-[#F0EAE1]">e3b0c44...b855</code>
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
                  SOC-2 Type II Certified • Non-Repudiable Audit Stamp
                </div>
              </div>
            </div>

            {/* Bottom Conversion Callout */}
            <div className="p-6 rounded-xl border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#201C18] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="font-newsreader text-lg font-bold text-[#172033] dark:text-[#F0EAE1]">
                  Ready to put your company&apos;s critical decisions under scrutiny?
                </h4>
                <p className="text-xs font-courier text-[#5c5549] dark:text-[#a89f91]">
                  Invite your leadership team, capture live meeting debates, and generate living ADRs.
                </p>
              </div>

              <Link
                href="/auth?redirect=/dashboard?action=new"
                className="px-6 py-3 rounded-lg bg-[#172033] text-white dark:bg-[#D4AA50] dark:text-[#181614] font-courier font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity shrink-0 shadow-sm"
              >
                Start Free Decision →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
