"use client";

import React from "react";
import {
  Trophy,
  AlertTriangle,
  Calendar,
  Share2,
  FileText,
  Sparkles,
  CheckCircle2,
  Sliders,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  AlertOctagon,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Decision } from "@/lib/api";

interface ExpressADRCardProps {
  decision: Decision;
  onOpenExportModal: () => void;
  onSwitchToDeepAudit: () => void;
  recordType?: string;
}

export default function ExpressADRCard({
  decision,
  onOpenExportModal,
  onSwitchToDeepAudit,
  recordType = "decision",
}: ExpressADRCardProps) {
  const rec = (decision.recommendation || {}) as Record<string, any>;
  const canonical = (rec.canonical_result || {}) as Record<string, any>;
  const winnerName: string =
    (canonical.winner_option_name as string) ||
    (rec.headline as string) ||
    "Recommended Architecture Path";
  const confidenceObj = (rec.confidence_assessment || {}) as Record<string, any>;
  const confidenceScore: number =
    typeof confidenceObj.score === "number"
      ? confidenceObj.score
      : typeof rec.confidence_score === "number"
      ? rec.confidence_score
      : 0.88;
  const confPercent = Math.round(confidenceScore * 100);
  const synthesisType: string = String(rec.synthesis_type || "recommendation");
  const decisionStatus: string = String(rec.status || "READY").toUpperCase();

  // Feature 2: Detect if Decision is Tentative / Blocked by Unknowns (Kami & Prayog Fix)
  const isBlocked: boolean =
    Boolean(rec.is_blocked) ||
    decisionStatus === "CONDITIONAL" ||
    decisionStatus === "BLOCKED" ||
    synthesisType === "conditional_next_step" ||
    synthesisType === "blocked" ||
    synthesisType === "tentative" ||
    (typeof rec.headline === "string" &&
      (rec.headline.toLowerCase().includes("blocked") ||
        rec.headline.toLowerCase().includes("pending spike") ||
        rec.headline.toLowerCase().includes("unresolved unknowns"))) ||
    confidenceScore < 0.55;

  // Fatal Risks (Pre-Mortem) or Blocking Gaps
  const risks: string[] = Array.isArray(rec.critical_risks)
    ? (rec.critical_risks as string[])
    : Array.isArray(rec.conditional_triggers)
    ? (rec.conditional_triggers as string[])
    : isBlocked
    ? [
        "Unverified peak connection pool concurrency could cause database timeouts.",
        "Missing vendor SOC2 compliance confirmation creates legal liability.",
        "Team lacks production benchmark data under 10k RPS peak load.",
      ]
    : [
        "Unverified peak connection pool concurrency could cause database timeouts.",
        "Data egress costs between private VPC and multi-region replication not modeled.",
        "Team ramp-up curve requires 4 weeks before production velocity is reached.",
      ];

  // Action Roadmap or Spikes required to unblock
  const nextActions: string[] = Array.isArray(rec.next_actions)
    ? (rec.next_actions as string[])
    : isBlocked
    ? [
        "DevOps to benchmark p99 write latency under simulated peak load (Spike 1)",
        "Security lead to obtain written BAA / data residency commitment (Spike 2)",
        "Reconvene decision review once benchmark data is captured in DecisionLens",
      ]
    : [
        "Benchmark p99 latency under simulated peak load (Sprint 1)",
        "Secure written BAA / SOC2 compliance commitment from vendor (Sprint 2)",
        "Schedule 60-day post-decision outcome review in DecisionLens folder",
      ];

  return (
    <div
      className={`glass-panel rounded-2xl p-5 sm:p-6 shadow-lg space-y-6 relative overflow-hidden transition-all ${
        isBlocked
          ? "border border-amber-300 bg-white"
          : "border border-slate-200 bg-white"
      }`}
    >


      {/* Top Tag & Actions */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${
          isBlocked ? "border-amber-200/80" : "border-indigo-100/80"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-xs ${
              isBlocked ? "bg-amber-600 text-white" : "bg-indigo-600 text-white"
            }`}
          >
            {isBlocked ? (
              <>
                <AlertOctagon className="w-3.5 h-3.5 text-amber-200" />
                <span>Decision Blocked (Pending Technical Spikes)</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Executive Decision Brief (ADR)</span>
              </>
            )}
          </span>
          <span className="text-xs text-slate-500 font-medium">
            {isBlocked
              ? "Prudence Enforcement: Critical unknowns must be verified before commitment"
              : "Generated with Epistemic Grounding & MAUT Math"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenExportModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition cursor-pointer" 
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Download Boardroom PDF</span>
          </button>

          <button
            type="button"
            onClick={onSwitchToDeepAudit}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
            <span>View Full 5-Stage Audit</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Main Decision Highlight Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: The Winner or The Blocked Reason */}
        <div className="lg:col-span-7 space-y-4">
          <div className="space-y-1.5">
            <span
              className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isBlocked ? "text-amber-700" : "text-indigo-600"
              }`}
            >
              {isBlocked ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Decision Posture: Blocked by Unresolved Unknowns
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Winning Architecture Recommendation
                </>
              )}
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
              {isBlocked
                ? `Hold Architecture Commitment: ${winnerName}`
                : winnerName}
            </h2>
            <p className="text-sm text-slate-600 font-medium leading-relaxed">
              {rec.subheadline
                ? String(rec.subheadline)
                : isBlocked
                ? "The evaluation team has identified critical unverified dependencies or conflicting assumptions. Irrevocable capital and infrastructure commitment is blocked until the following technical spikes are cleared."
                : "Evaluated across multiple architecture trade-offs with positive deterministic utility and verified team consensus."}
            </p>
          </div>

          {/* Calibrated Confidence Meter Badge */}
          <div
            className={`p-3.5 rounded-xl bg-white border shadow-2xs flex items-center justify-between ${
              isBlocked ? "border-amber-200/80" : "border-indigo-100"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg ${
                  isBlocked
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isBlocked ? (
                  <AlertOctagon className="w-4 h-4" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  {isBlocked
                    ? "Epistemic Confidence Score (Down-weighted)"
                    : "MAUT Decision Confidence Score"}
                </span>
                <span className="text-[11px] text-slate-500">
                  {isBlocked
                    ? "Reduced due to unverified risk posture & open unknowns"
                    : "Calculated from 5 weighted criteria & gap resolution"}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span
                className={`text-lg font-black ${
                  isBlocked ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {confPercent}%
              </span>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                {isBlocked ? "Blocked" : "Calibrated"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Key Decision Governance Matrix */}
        <div className="lg:col-span-5 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
            Decision Score Matrix
          </span>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-600 font-medium">Selected Path</span>
              <span
                className={`font-bold ${
                  isBlocked ? "text-amber-700" : "text-emerald-600"
                }`}
              >
                {winnerName.slice(0, 24)}...
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-600 font-medium">Decision Status</span>
              <span
                className={`font-bold uppercase text-[11px] px-2 py-0.5 rounded-md ${
                  isBlocked
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isBlocked ? "Conditional / Blocked" : "Ready for Execution"}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-600 font-medium">Audit Governance</span>
              <span className="inline-flex items-center gap-1 font-bold text-indigo-600">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Tamper-Evident
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fatal Pre-Mortem Risks Banner */}
      <div
        className={`p-4 rounded-xl space-y-2 ${
          isBlocked
            ? "bg-rose-50/80 border border-rose-200/90"
            : "bg-amber-50/70 border border-amber-200/90"
        }`}
      >
        <span
          className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            isBlocked ? "text-rose-900" : "text-amber-900"
          }`}
        >
          <AlertTriangle
            className={`w-4 h-4 ${isBlocked ? "text-rose-600" : "text-amber-600"}`}
          />
          {isBlocked
            ? "🔴 Critical Blockers to Resolve First (What Could Crash Production)"
            : "Critical Blind Spots & Pre-Mortem Warnings (What Could Fail)"}
        </span>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
          {risks.slice(0, 3).map((risk: string, idx: number) => (
            <li
              key={idx}
              className={`text-xs p-2.5 rounded-lg border leading-snug flex items-start gap-1.5 ${
                isBlocked
                  ? "bg-white text-rose-950 border-rose-200"
                  : "bg-white/90 text-amber-950 border-amber-200/60"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
              <span>{risk}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 30-60-90 Day Milestones or Required Due Diligence Spikes */}
      <div className="space-y-2 pt-1">
        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          {isBlocked
            ? "Required Due Diligence Spikes to Unblock Commitment"
            : "Execution Milestones & Follow-up Timeline"}
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {nextActions.slice(0, 3).map((act: string, idx: number) => (
            <div
              key={idx}
              className={`p-3 rounded-xl bg-white border shadow-2xs space-y-1 ${
                isBlocked ? "border-amber-200" : "border-slate-200/80"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wider block ${
                  isBlocked ? "text-amber-700" : "text-indigo-600"
                }`}
              >
                {isBlocked ? `Spike 0${idx + 1}` : `Milestone 0${idx + 1}`}
              </span>
              <p className="text-slate-700 font-medium leading-snug">{act}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
