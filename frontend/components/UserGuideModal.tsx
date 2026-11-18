"use client";

import React, { useState } from "react";
import {
  HelpCircle,
  X,
  FileText,
  Brain,
  Search,
  Grid,
  Compass,
  Mic,
  Zap,
  CheckCircle2,
  DollarSign,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import ModalPortal from "@/components/ModalPortal";

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "steps" | "tech_rag" | "meetings">("overview");

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-courier">
        <div className="relative w-full max-w-3xl bg-[#F5F1E8] dark:bg-[#1C1917] border border-[#cfc7b2] dark:border-[#38332C] rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#221F1C]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#1d1d1b] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614] flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1] leading-none">
                  How DecisionLens Works
                </h2>
                <p className="text-xs text-[#6e655a] dark:text-[#A89F91] mt-1 font-mono uppercase tracking-wider">
                  The Decision Intelligence Platform for Engineering & Architecture
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-sm hover:bg-[#cfc7b2]/40 dark:hover:bg-[#38332C] text-[#6e655a] dark:text-[#A89F91] transition-colors"
              aria-label="Close user guide"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#F5F1E8] dark:bg-[#1C1917] px-6 text-sm">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-3 px-3 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] text-[#7a4e10] dark:text-[#D4AA50]"
                  : "border-transparent text-[#6e655a] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("steps")}
              className={`py-3 px-3 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-colors ${
                activeTab === "steps"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] text-[#7a4e10] dark:text-[#D4AA50]"
                  : "border-transparent text-[#6e655a] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
              }`}
            >
              The 5-Step Process
            </button>
            <button
              onClick={() => setActiveTab("tech_rag")}
              className={`py-3 px-3 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-colors ${
                activeTab === "tech_rag"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] text-[#7a4e10] dark:text-[#D4AA50]"
                  : "border-transparent text-[#6e655a] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
              }`}
            >
              Technical Domain RAG
            </button>
            <button
              onClick={() => setActiveTab("meetings")}
              className={`py-3 px-3 font-mono text-xs uppercase tracking-wider font-bold border-b-2 transition-colors ${
                activeTab === "meetings"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] text-[#7a4e10] dark:text-[#D4AA50]"
                  : "border-transparent text-[#6e655a] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
              }`}
            >
              Meeting Tangent Scrubber
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-[#1d1d1b] dark:text-[#F0EAE1]">
            {activeTab === "overview" && (
              <div className="space-y-5">
                <div className="p-4 bg-[#EDE7D6] dark:bg-[#221F1C] border-l-4 border-l-[#7a4e10] dark:border-l-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                  <h3 className="font-newsreader text-xl font-normal mb-1">
                    What does DecisionLens do?
                  </h3>
                  <p className="text-sm leading-relaxed text-[#4f4b40] dark:text-[#A89F91]">
                    DecisionLens is designed for engineering leaders and technical teams facing high-stakes decisions
                    (e.g., <em>“Should we rewrite in Go or keep our Modular Monolith?”</em> or <em>“PostgreSQL vs DynamoDB for multi-region scale”</em>).
                    It transforms unstructured meeting chatter, PRDs, and architecture debates into formal, evidence-backed
                    <strong> Architecture Decision Records (ADRs)</strong> with rigorous trade-off matrices.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center gap-2 mb-2 text-[#7a4e10] dark:text-[#D4AA50] font-bold text-xs uppercase tracking-wider font-mono">
                      <Zap className="w-4 h-4" />
                      1. Frame & Gather
                    </div>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                      Upload your technical docs, record voice notes, or host live audio meetings. The AI automatically transcribes and filters out distractions.
                    </p>
                  </div>

                  <div className="p-4 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center gap-2 mb-2 text-[#7a4e10] dark:text-[#D4AA50] font-bold text-xs uppercase tracking-wider font-mono">
                      <Search className="w-4 h-4" />
                      2. Audit & Ground
                    </div>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                      AI scrutinizes assumptions, surfaces unproven claims, and checks them against real AWS/GCP pricing, database pooling limits, and hardware latency.
                    </p>
                  </div>

                  <div className="p-4 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center gap-2 mb-2 text-[#7a4e10] dark:text-[#D4AA50] font-bold text-xs uppercase tracking-wider font-mono">
                      <Compass className="w-4 h-4" />
                      3. Synthesize & Act
                    </div>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                      Evaluate multi-criteria trade-offs (Cost, Latency, Team Velocity, Lock-in) and export ready-to-share executive memos or PDF/Markdown reports.
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#cfc7b2] dark:border-[#38332C] pt-4 flex items-center justify-between">
                  <span className="text-xs font-mono text-[#6e655a] dark:text-[#A89F91]">
                    Ready to see each phase in detail?
                  </span>
                  <button
                    onClick={() => setActiveTab("steps")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1d1d1b] hover:bg-[#443a30] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold uppercase tracking-wider font-mono rounded-sm transition-colors"
                  >
                    <span>View 5-Step Process</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === "steps" && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        Stage 01 • Input & Audio
                      </span>
                      <span className="text-xs font-mono text-[#6e655a] dark:text-[#A89F91]">Ingestion</span>
                    </div>
                    <h4 className="font-newsreader text-base font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Capture the raw problem statement
                    </h4>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-1 leading-relaxed">
                      Write your decision dilemma, attach technical design docs (PDF, Markdown, TXT), record speech dictation, or use the <strong>Live Meeting Room</strong>. The AI filters out banter and keeps only high-signal tech statements.
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        Stage 02 • Cognitive Structuring
                      </span>
                      <span className="text-xs font-mono text-[#6e655a] dark:text-[#A89F91]">Classification</span>
                    </div>
                    <h4 className="font-newsreader text-base font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Categorize assumptions, facts & constraints
                    </h4>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-1 leading-relaxed">
                      The AI reads everything and separates verifiable facts from subjective assumptions, hard engineering constraints (e.g. latency &lt; 50ms), and potential cognitive biases (e.g. sunk cost fallacy).
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        Stage 03 • Unknowns & Tech Gaps
                      </span>
                      <span className="text-xs font-mono text-[#6e655a] dark:text-[#A89F91]">Scrutiny & RAG</span>
                    </div>
                    <h4 className="font-newsreader text-base font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Stress-test your blindspots with Domain RAG
                    </h4>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-1 leading-relaxed">
                      The system surfaces what questions were left unanswered. You can ask questions to your uploaded documents via semantic Q&A and ground arguments against software architecture benchmarks.
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        Stage 04 • Thinking Frameworks
                      </span>
                      <span className="text-xs font-mono text-[#6e655a] dark:text-[#A89F91]">Trade-off Matrix</span>
                    </div>
                    <h4 className="font-newsreader text-base font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Multi-criteria decision analysis (MAUT)
                    </h4>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-1 leading-relaxed">
                      Applies proven mental models: Multi-Attribute Utility Theory (weighted matrix), Second-Order Thinking, Inversion (how might this fail?), and Cost of Reversibility (Type 1 vs Type 2 decisions).
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        Stage 05 • Synthesis & Roadmap
                      </span>
                      <span className="text-xs font-mono text-[#6e655a] dark:text-[#A89F91]">Recommendation</span>
                    </div>
                    <h4 className="font-newsreader text-base font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                      Final Architecture Decision Record (ADR)
                    </h4>
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-1 leading-relaxed">
                      Synthesizes a concrete verdict, risk mitigations, milestone roadmap, and allows 1-click export to Markdown, PDF, or clipboard.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "tech_rag" && (
              <div className="space-y-4">
                <div className="p-4 bg-[#EDE7D6] dark:bg-[#221F1C] border-l-4 border-l-[#7a4e10] dark:border-l-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                  <h3 className="font-newsreader text-lg font-bold mb-1">
                    Specialized Technical Domain Knowledge
                  </h3>
                  <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                    Unlike generic AI chatbots that provide surface-level advice, DecisionLens injects hard quantitative engineering standards into every evaluation:
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#7a4e10] dark:text-[#D4AA50] font-mono">
                      <DollarSign className="w-3.5 h-3.5" />
                      Cloud Cost Formulas
                    </div>
                    <p className="text-[#4f4b40] dark:text-[#A89F91]">
                      AWS Lambda break-even rules (&gt;15-20% continuous utilization favors ECS/EKS), NAT Gateway data egress rates, and managed DB markups.
                    </p>
                  </div>

                  <div className="p-3 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#7a4e10] dark:text-[#D4AA50] font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      Hardware Latency Realities
                    </div>
                    <p className="text-[#4f4b40] dark:text-[#A89F91]">
                      L1 cache (0.5ns), RAM (100ns), NVMe SSD read (100μs), cross-AZ ping (1-2ms), and cross-region WAN roundtrips (150-250ms).
                    </p>
                  </div>

                  <div className="p-3 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#7a4e10] dark:text-[#D4AA50] font-mono">
                      <Layers className="w-3.5 h-3.5" />
                      Database Concurrency
                    </div>
                    <p className="text-[#4f4b40] dark:text-[#A89F91]">
                      PostgreSQL 10MB/connection overhead, PgBouncer pooling formulas, and when to choose Redis vs DynamoDB vs Aurora.
                    </p>
                  </div>

                  <div className="p-3 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#7a4e10] dark:text-[#D4AA50] font-mono">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Zero-Downtime Patterns
                    </div>
                    <p className="text-[#4f4b40] dark:text-[#A89F91]">
                      Expand-and-Contract schema migrations, dual-write cutover validation, and Kafka vs RabbitMQ message ordering semantics.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "meetings" && (
              <div className="space-y-4">
                <div className="p-4 bg-[#EDE7D6] dark:bg-[#221F1C] border-l-4 border-l-[#7a4e10] dark:border-l-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
                  <h3 className="font-newsreader text-lg font-bold mb-1">
                    AI Meeting Distraction Scrubber
                  </h3>
                  <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                    Engineering discussions often get derailed by lunch orders, audio checks, weather talk, and tangents. DecisionLens automatically strips this out so decisions don’t get poisoned.
                  </p>
                </div>

                <div className="p-4 bg-[#EDE7D6]/60 dark:bg-[#221F1C]/60 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm space-y-2">
                  <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] flex items-center gap-2">
                    <Volume2 className="w-4 h-4" />
                    How Tangent Filtering Works
                  </div>
                  <ul className="text-xs text-[#4f4b40] dark:text-[#A89F91] space-y-2 list-disc list-inside leading-relaxed">
                    <li>
                      <strong>Audio Upload & Dictation:</strong> When you upload a meeting recording, the background classifier strips chit-chat before structuring begins.
                    </li>
                    <li>
                      <strong>Live Meeting Room:</strong> In active calls, click <em>“Scrub Tangents”</em> to purge off-topic chatter and view your <strong>Technical Signal Ratio</strong> (e.g., <em>88% Technical Signal, 4 tangents removed</em>).
                    </li>
                    <li>
                      <strong>Clean Findings:</strong> Meeting minutes, action items, and decision points are generated exclusively from verified technical context.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#221F1C] flex items-center justify-between">
            <span className="text-xs font-mono text-[#6e655a] dark:text-[#A89F91]">
              Tip: Click the <strong>How It Works</strong> button anywhere in the header to reopen this guide.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-[#1d1d1b] hover:bg-[#443a30] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-bold uppercase tracking-wider font-mono rounded-sm transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
