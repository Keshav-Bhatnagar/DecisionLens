"use client";

import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, RotateCw, ArrowRight } from "lucide-react";
import PointCircularGallery, { CategoryTheme, ZoomMode } from "./PointCircularGallery";
import {
  analyzeDecisionInputs,
  getStructuredFindings,
  updateStructuredFindings,
  StructuredFindings,
} from "@/lib/api";

interface StructuredFindingsEditorProps {
  decisionId: number;
  initialFindings?: StructuredFindings;
  isReviewed?: boolean;
  onFindingsUpdated: () => void;
  problemStatement?: string;
  transcript?: string;
  attachmentCount?: number;
  onAdvanceToGaps?: () => void;
}

export default function StructuredFindingsEditor({
  decisionId,
  initialFindings,
  isReviewed = false,
  onFindingsUpdated,
  problemStatement = "",
  transcript = "",
  attachmentCount = 0,
  onAdvanceToGaps,
}: StructuredFindingsEditorProps) {
  const [findings, setFindings] = useState<StructuredFindings | null>(
    initialFindings && (initialFindings.facts?.length || initialFindings.assumptions?.length || initialFindings.summary)
      ? initialFindings
      : null
  );
  const [reviewed, setReviewed] = useState(isReviewed);
  const [sourceSummary, setSourceSummary] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active slide index in the 4-category executive briefing deck
  const [activeSlide, setActiveSlide] = useState<number>(0);

  // 3D Circular Gallery zoom mode
  const [galleryZoom, setGalleryZoom] = useState<ZoomMode>("spacious");

  // Synchronize when initial props change
  useEffect(() => {
    if (initialFindings && (initialFindings.facts?.length || initialFindings.assumptions?.length || initialFindings.summary)) {
      setFindings(initialFindings);
    }
    setReviewed(isReviewed);
  }, [initialFindings, isReviewed]);

  // Fetch initial source summary on mount
  useEffect(() => {
    let isMounted = true;
    getStructuredFindings(decisionId)
      .then((res) => {
        if (isMounted && res.source_summary) {
          setSourceSummary(res.source_summary);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [decisionId]);

  // Keyboard navigation across the 4 slides: Shift+ArrowLeft / Shift+ArrowRight
  // (Plain ArrowLeft / ArrowRight are reserved for spinning the 3D circular carousel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.shiftKey && e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveSlide((prev) => Math.max(0, prev - 1));
      } else if (e.shiftKey && e.key === "ArrowRight") {
        e.preventDefault();
        setActiveSlide((prev) => Math.min(3, prev + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await analyzeDecisionInputs(decisionId);
      setFindings(res.findings);
      setReviewed(res.points_reviewed);
      if (res.source_summary) {
        setSourceSummary(res.source_summary);
      }
      setSuccessMsg("Evidence structured into the 3D circular orbit.");
      onFindingsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to structure inputs. Ensure problem statement or transcript is present."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveAndApprove = async (approve: boolean = true) => {
    if (!findings) return;

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const cleanData = {
        facts: (findings.facts || []).filter((f) => f.trim().length > 0),
        assumptions: (findings.assumptions || []).filter((f) => f.trim().length > 0),
        feelings: (findings.feelings || []).filter((f) => f.trim().length > 0),
        pros: (findings.pros || []).filter((f) => f.trim().length > 0),
        cons: (findings.cons || []).filter((f) => f.trim().length > 0),
        mixed_points: (findings.mixed_points || []).filter((f) => f.trim().length > 0),
        contradictions: (findings.contradictions || []).filter((f) => f.trim().length > 0),
        unknowns: (findings.unknowns || []).filter((f) => f.trim().length > 0),
        summary: findings.summary || "",
        private_feedback: findings.private_feedback,
        mark_reviewed: approve,
      };

      const res = await updateStructuredFindings(decisionId, cleanData);
      setFindings(res.findings);
      setReviewed(res.points_reviewed);
      setSuccessMsg(
        approve
          ? "Ground truth locked for framework analysis."
          : "Evidence draft saved."
      );
      onFindingsUpdated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update structured findings."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Structured Lists for the 4 Slides
  const factsList = findings?.facts || [];
  const prosList = findings?.pros || [];
  const groundTruthCombined = [...factsList, ...prosList];

  const assumptionsList = findings?.assumptions || [];

  const contradictionsList = findings?.contradictions || [];
  const feelingsList = findings?.feelings || [];
  const biasesCombined = [...contradictionsList, ...feelingsList];

  const consList = findings?.cons || [];
  const privateBiases = findings?.private_feedback?.potential_biases || [];
  const feedbackNotes = findings?.private_feedback?.feedback_notes ? [findings.private_feedback.feedback_notes] : [];
  const caveatsCombined = [...consList, ...privateBiases, ...feedbackNotes];

  // Handlers for Slide 0: The Ground Truth (Facts + Assets)
  const handleUpdateGroundTruth = (index: number, newValue: string) => {
    if (!findings) return;
    if (index < factsList.length) {
      const list = [...factsList];
      list[index] = newValue;
      setFindings({ ...findings, facts: list });
    } else {
      const proIdx = index - factsList.length;
      const list = [...prosList];
      list[proIdx] = newValue;
      setFindings({ ...findings, pros: list });
    }
    if (reviewed) setReviewed(false);
  };

  const handleDeleteGroundTruth = (index: number) => {
    if (!findings) return;
    if (index < factsList.length) {
      const list = [...factsList];
      list.splice(index, 1);
      setFindings({ ...findings, facts: list });
    } else {
      const proIdx = index - factsList.length;
      const list = [...prosList];
      list.splice(proIdx, 1);
      setFindings({ ...findings, pros: list });
    }
    if (reviewed) setReviewed(false);
  };

  const handleAddGroundTruth = () => {
    if (!findings) return;
    setFindings({ ...findings, facts: [...factsList, ""] });
    if (reviewed) setReviewed(false);
  };

  // Handlers for Slide 1: Unverified Assumptions
  const handleUpdateAssumption = (index: number, newValue: string) => {
    if (!findings) return;
    const list = [...assumptionsList];
    list[index] = newValue;
    setFindings({ ...findings, assumptions: list });
    if (reviewed) setReviewed(false);
  };

  const handleDeleteAssumption = (index: number) => {
    if (!findings) return;
    const list = [...assumptionsList];
    list.splice(index, 1);
    setFindings({ ...findings, assumptions: list });
    if (reviewed) setReviewed(false);
  };

  const handleAddAssumption = () => {
    if (!findings) return;
    setFindings({ ...findings, assumptions: [...assumptionsList, ""] });
    if (reviewed) setReviewed(false);
  };

  // Handlers for Slide 2: Biases & Blindspots
  const handleUpdateBias = (index: number, newValue: string) => {
    if (!findings) return;
    if (index < contradictionsList.length) {
      const list = [...contradictionsList];
      list[index] = newValue;
      setFindings({ ...findings, contradictions: list });
    } else {
      const feelingIdx = index - contradictionsList.length;
      const list = [...feelingsList];
      list[feelingIdx] = newValue;
      setFindings({ ...findings, feelings: list });
    }
    if (reviewed) setReviewed(false);
  };

  const handleDeleteBias = (index: number) => {
    if (!findings) return;
    if (index < contradictionsList.length) {
      const list = [...contradictionsList];
      list.splice(index, 1);
      setFindings({ ...findings, contradictions: list });
    } else {
      const feelingIdx = index - contradictionsList.length;
      const list = [...feelingsList];
      list.splice(feelingIdx, 1);
      setFindings({ ...findings, feelings: list });
    }
    if (reviewed) setReviewed(false);
  };

  const handleAddBias = () => {
    if (!findings) return;
    setFindings({ ...findings, contradictions: [...contradictionsList, ""] });
    if (reviewed) setReviewed(false);
  };

  // Handlers for Slide 3: Meeting Caveats & Friction
  const handleUpdateCaveat = (index: number, newValue: string) => {
    if (!findings) return;
    if (index < consList.length) {
      const list = [...consList];
      list[index] = newValue;
      setFindings({ ...findings, cons: list });
    } else if (index < consList.length + privateBiases.length) {
      const bIdx = index - consList.length;
      const list = [...privateBiases];
      list[bIdx] = newValue;
      const currentPrivate = findings.private_feedback || {
        tone_observations: "",
        potential_biases: [],
        clarity_rating: "",
        feedback_notes: "",
      };
      setFindings({
        ...findings,
        private_feedback: { ...currentPrivate, potential_biases: list },
      });
    } else {
      const currentPrivate = findings.private_feedback || {
        tone_observations: "",
        potential_biases: [],
        clarity_rating: "",
        feedback_notes: "",
      };
      setFindings({
        ...findings,
        private_feedback: { ...currentPrivate, feedback_notes: newValue },
      });
    }
    if (reviewed) setReviewed(false);
  };

  const handleDeleteCaveat = (index: number) => {
    if (!findings) return;
    if (index < consList.length) {
      const list = [...consList];
      list.splice(index, 1);
      setFindings({ ...findings, cons: list });
    }
    if (reviewed) setReviewed(false);
  };

  const handleAddCaveat = () => {
    if (!findings) return;
    setFindings({ ...findings, cons: [...consList, ""] });
    if (reviewed) setReviewed(false);
  };

  const wordCount = transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;

  // Dynamic Epistemic Justification Resolver: Evaluates specific sentence metrics, constraints, and logic
  const resolveEpistemicWhy = (
    category: "facts" | "assumptions" | "biases" | "caveats",
    index: number,
    text: string
  ): string => {
    // 1. Check if backend / LLM provided item-level why_classified in grounded_items
    const groundedList = findings?.grounded_items?.[category === "biases" ? "contradictions" : category === "caveats" ? "cons" : category];
    if (groundedList && groundedList[index]?.why_classified) {
      return groundedList[index].why_classified!;
    }

    const t = text.toLowerCase();

    // 2. Dynamic heuristic classification based on concrete content:
    if (category === "facts") {
      if (t.includes("p99") || t.includes("iops") || t.includes("latency") || t.includes("cpu") || t.includes("gmv") || /\d+ms|\d+%|₹\d+/.test(text)) {
        return "Direct Telemetry Metric: Contains empirical APM measurements, hardware limits, or financial metrics recorded in historical production.";
      }
      if (t.includes("[security constraint]") || t.includes("dpdp") || t.includes("rbi") || t.includes("compliance") || t.includes("mumbai") || t.includes("statutory")) {
        return "Statutory Legal Constraint: Mandatory regulatory or data localization directive (RBI/DPDP) with zero architectural discretion.";
      }
      if (t.includes("[devops") || t.includes("sre") || t.includes("kubernetes") || t.includes("production experience") || t.includes("team of")) {
        return "Hard Operational Capacity: Concrete team staffing boundary and production expertise baseline that cannot be bypassed.";
      }
      if (t.includes("week") || t.includes("month") || t.includes("deadline") || t.includes("sale") || /\d+\s*weeks/.test(t)) {
        return "Fixed Calendar Deadline: Firm business deadline with zero margin for unbudgeted migration delay.";
      }
      if (index >= (findings?.facts?.length || 0)) {
        return "Validated Baseline Strength: Demonstrated core organizational or architectural asset confirmed by team history.";
      }
      return "Direct Ground Reality: Explicitly verified metric, team constraint, or baseline agreement documented in source records.";
    }

    if (category === "assumptions") {
      if (/\d+[\s,]*users|\d+k|\d+m/.test(t)) {
        return "Unverified Capacity Target: Projected user scaling volume without concurrent load benchmarks or database sizing models.";
      }
      if (t.includes("faster") || t.includes("better") || t.includes("easier") || t.includes("latency") || t.includes("throughput")) {
        return "Untested Performance Premise: Performance advantage assumed without staging load tests or comparative profiling.";
      }
      if (t.includes("will") || t.includes("expect") || t.includes("assume") || t.includes("eventually") || t.includes("may")) {
        return "Forward Projection: Stated future expectation that lacks empirical verification under real production workloads.";
      }
      return "Unverified Working Hypothesis: Stated premise requiring empirical verification in Stage 3 Web Research before architectural lock.";
    }

    if (category === "biases") {
      if (t.includes("3 weeks") || t.includes("already spent") || t.includes("spent") || t.includes("prototyp") || t.includes("invested")) {
        return "Sunk Cost Fallacy: Past prototype time or sunk effort is cited to justify architecture adoption, despite severe operational mismatches.";
      }
      if (t.includes("prefer") || t.includes("feels") || t.includes("like") || t.includes("favorite") || t.includes("gut")) {
        return "Preference / Status Quo Bias: Subjective developer preference prioritizing comfort over verified system requirements.";
      }
      if (t.includes("conflict") || t.includes("simultaneously") || t.includes("opposing")) {
        return "Direct Logical Contradiction: Two mutually exclusive propositions asserted simultaneously that cannot both be satisfied.";
      }
      return "Decision Trap & Logic Risk: Cognitive blindspot or planning optimism where commitment precedes empirical verification.";
    }

    if (category === "caveats") {
      if (t.includes("experience") || t.includes("zero") || t.includes("sre") || t.includes("toil") || t.includes("overhead")) {
        return "Execution & Toil Risk: Severe operational friction caused by team skill deficit and maintenance toil under tight timeline.";
      }
      if (t.includes("hesitat") || t.includes("concern") || t.includes("reluctan") || t.includes("worr") || t.includes("anxious")) {
        return "Recorded Stakeholder Friction: Team anxiety or reluctance regarding system complexity noted during meeting.";
      }
      return "Operational Guardrail: Real-world organizational constraint or recorded dissent that must be protected in Stage 5.";
    }

    return "Epistemic Justification: Verified against source statements and decision context.";
  };

  // 4 Core Briefing Dimensions
  const slides = [
    {
      id: "ground_truth",
      number: "01",
      title: "The Ground Truth",
      subtitle: `Direct facts (${factsList.length}) and validated realities (${prosList.length})`,
      count: groundTruthCombined.length,
      colorTheme: {
        border: "border-[#cfc7b2] dark:border-[#38332C]",
        badge: "bg-[#161E33] text-[#F5F1E8] dark:bg-[#D4AA50] dark:text-[#181614]",
        accent: "border-[#7a4e10] dark:border-[#D4AA50]",
      },
    },
    {
      id: "assumptions",
      number: "02",
      title: "Working Assumptions",
      subtitle: "Hypotheses that require validation in Stage 3 Web Research",
      count: assumptionsList.length,
      colorTheme: {
        border: "border-[#cfc7b2] dark:border-[#38332C]",
        badge: "bg-[#2F5D8F]/15 text-[#2F5D8F] dark:bg-[#2F5D8F]/30 dark:text-[#93B4D7]",
        accent: "border-[#2F5D8F]",
      },
    },
    {
      id: "biases",
      number: "03",
      title: "Decision Traps & Blindspots",
      subtitle: "Sunk costs, planning fallacies, and structural logic risks",
      count: biasesCombined.length,
      colorTheme: {
        border: "border-[#cfc7b2] dark:border-[#38332C]",
        badge: "bg-[#B4874B]/15 text-[#7a4e10] dark:bg-[#D4AA50]/20 dark:text-[#D4AA50]",
        accent: "border-[#B4874B]",
      },
    },
    {
      id: "caveats",
      number: "04",
      title: "Meeting Caveats & Friction",
      subtitle: "Recorded dissent, operational constraints, and scribe notes",
      count: caveatsCombined.length,
      colorTheme: {
        border: "border-[#cfc7b2] dark:border-[#38332C]",
        badge: "bg-[#5A6275]/15 text-[#5A6275] dark:bg-[#5A6275]/30 dark:text-[#C5CBD8]",
        accent: "border-[#5A6275]",
      },
    },
  ];

  const currentSlide = slides[activeSlide];

  return (
    <div className="bg-[#FCFBF8] dark:bg-[#181614] rounded-xl border border-[#D9D2C3] dark:border-[#38332C] p-6 sm:p-8 space-y-6 font-sans">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#D9D2C3]/60 dark:border-[#38332C]">
        <div>
          <span className="text-xs font-mono font-bold tracking-wider text-[#7a4e10] dark:text-[#D4AA50] uppercase">
            Stage 02 • Evidence &amp; Cognitive Triage
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-[#161E33] dark:text-[#F0EAE1] tracking-tight mt-1">
            The Evidence Orbit
          </h2>
          <p className="text-xs sm:text-sm text-[#5A6275] dark:text-[#A89F91] mt-1 max-w-2xl leading-relaxed">
            Review direct facts, untested assumptions, and unspoken friction in a 3D rotating stage before committing to a decision.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {findings && (
            <button
              type="button"
              onClick={() => handleSaveAndApprove(!reviewed)}
              disabled={isSaving}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                reviewed
                  ? "bg-[#EDE7D6] text-[#7a4e10] border-[#cfc7b2] dark:bg-[#221F1C] dark:text-[#D4AA50] dark:border-[#38332C]"
                  : "bg-[#F5F1E8] text-[#5A6275] border-[#D9D2C3] dark:bg-[#1A1815] dark:text-[#A89F91] dark:border-[#38332C]"
              }`}
            >
              {reviewed ? "Ground Truth Locked" : "Lock Ground Truth"}
            </button>
          )}

          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#F5F1E8] bg-[#161E33] hover:bg-[#232C47] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isAnalyzing && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
            <span>
              {isAnalyzing
                ? "Analyzing Evidence..."
                : findings
                ? "Re-evaluate Evidence"
                : "Analyze Evidence"}
            </span>
          </button>
        </div>
      </div>

      {/* Ingestion Sources Summary */}
      {sourceSummary && sourceSummary !== "None" && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#EDE7D6]/50 dark:bg-[#1E1B18] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg text-xs text-[#5A6275] dark:text-[#A89F91]">
          <span>
            Context Sources: <strong className="font-bold text-[#161E33] dark:text-[#F0EAE1]">{sourceSummary}</strong>
          </span>
          {sourceSummary.includes("Folder Memory") && (
            <span className="font-mono text-[11px] text-[#7a4e10] dark:text-[#D4AA50]">
              [Linked to Prior Folder Decisions]
            </span>
          )}
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg text-xs text-[#161E33] dark:text-[#D4AA50]">
          {successMsg}
        </div>
      )}

      {/* COLD START: Signal Readiness Audit (When No Findings Yet) */}
      {!findings && !isAnalyzing && (
        <div className="p-6 sm:p-8 bg-[#F5F1E8]/70 dark:bg-[#1A1815] border border-dashed border-[#cfc7b2] dark:border-[#38332C] rounded-xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#161E33] dark:text-[#F0EAE1]">
                Input Signal Readiness Audit
              </h3>
              <p className="text-xs text-[#5A6275] dark:text-[#A89F91] mt-0.5">
                Aggregates your problem statement, meeting scribe, and dossier into 4 structured dimensions.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-[#EDE7D6] dark:bg-[#221F1C] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] rounded-md">
              Ready to Structure
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="p-4 bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#D9D2C3] dark:border-[#38332C] rounded-lg space-y-1">
              <span className="text-[11px] font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
                Problem Statement
              </span>
              <p className="text-xs sm:text-sm text-[#161E33] dark:text-[#F0EAE1] line-clamp-2">
                {problemStatement ? problemStatement : "Pending framing in Stage 1"}
              </p>
              <span className="text-[11px] text-[#5A6275] dark:text-[#A89F91] block font-mono">
                {problemStatement ? `${problemStatement.split(/\s+/).length} words framed` : "0 words"}
              </span>
            </div>

            <div className="p-4 bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#D9D2C3] dark:border-[#38332C] rounded-lg space-y-1">
              <span className="text-[11px] font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
                Meeting Scribe &amp; Audio
              </span>
              <p className="text-xs sm:text-sm text-[#161E33] dark:text-[#F0EAE1]">
                {wordCount > 0 ? `${wordCount} words transcribed` : "No voice recording uploaded"}
              </p>
              <span className="text-[11px] text-[#5A6275] dark:text-[#A89F91] block font-mono">
                {wordCount > 0 ? "IIT Madras / IndicReady" : "Optional input"}
              </span>
            </div>

            <div className="p-4 bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#D9D2C3] dark:border-[#38332C] rounded-lg space-y-1">
              <span className="text-[11px] font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
                Document Dossier
              </span>
              <p className="text-xs sm:text-sm text-[#161E33] dark:text-[#F0EAE1]">
                {attachmentCount > 0 ? `${attachmentCount} attachment(s) parsed` : "No attachments parsed"}
              </p>
              <span className="text-[11px] text-[#5A6275] dark:text-[#A89F91] block font-mono">
                PDF, DOCX, TXT Evidence
              </span>
            </div>
          </div>

          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#D9D2C3]/60 dark:border-[#38332C]">
            <p className="text-xs text-[#5A6275] dark:text-[#A89F91]">
              Click below to initiate the 3D rotating evidence carousel.
            </p>
            <button
              type="button"
              onClick={handleRunAnalysis}
              className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-[#F5F1E8] bg-[#161E33] hover:bg-[#232C47] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-lg transition-colors cursor-pointer"
            >
              Launch Evidence Orbit
            </button>
          </div>
        </div>
      )}

      {/* THE 3D EVIDENCE ORBIT DECK */}
      {findings && (
        <div className="space-y-4">
          {/* Top 4 Dimension Tabs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {slides.map((s, idx) => {
              const isActive = activeSlide === idx;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? "bg-[#EDE7D6] dark:bg-[#221F1C] border-2 border-[#7a4e10] dark:border-[#D4AA50] shadow-xs"
                      : "bg-[#F5F1E8]/70 dark:bg-[#1A1815] border-[#D9D2C3] dark:border-[#38332C] hover:bg-[#EDE7D6]/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                      {s.number}
                    </span>
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                        isActive
                          ? "bg-[#161E33] text-[#F5F1E8] dark:bg-[#D4AA50] dark:text-[#181614]"
                          : "bg-[#D9D2C3]/70 dark:bg-[#2C2722] text-[#5A6275] dark:text-[#A89F91]"
                      }`}
                    >
                      {s.count} items
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-[#161E33] dark:text-[#F0EAE1] truncate mt-1.5">
                    {s.title}
                  </div>
                  <div className="text-[11px] text-[#5A6275] dark:text-[#A89F91] truncate mt-0.5">
                    {s.subtitle}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Dimension Orbit Stage */}
          <div className="rounded-xl border border-[#D9D2C3] dark:border-[#38332C] bg-[#FCFBF8] dark:bg-[#1A1815] p-5 sm:p-6 space-y-4">
            {/* Header: Title & Stepper */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D9D2C3]/60 dark:border-[#38332C]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-[#161E33] dark:text-[#F0EAE1]">
                    {currentSlide.title}
                  </h3>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[#EDE7D6] dark:bg-[#221F1C] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C]">
                    {currentSlide.count} items
                  </span>
                </div>
                <p className="text-xs text-[#5A6275] dark:text-[#A89F91] mt-0.5">
                  {currentSlide.subtitle}
                </p>
              </div>

              {/* Stepper Controls */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  disabled={activeSlide === 0}
                  onClick={() => setActiveSlide((prev) => Math.max(0, prev - 1))}
                  className="w-8 h-8 rounded-lg bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#161E33] dark:text-[#F0EAE1] hover:bg-[#E5DEC9] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center justify-center cursor-pointer"
                  title="Previous Category (Shift + ArrowLeft)"
                  aria-label="Previous Category"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-bold text-[#5A6275] dark:text-[#A89F91] px-1">
                  Category {activeSlide + 1} of 4
                </span>
                <button
                  type="button"
                  disabled={activeSlide === 3}
                  onClick={() => setActiveSlide((prev) => Math.min(3, prev + 1))}
                  className="w-8 h-8 rounded-lg bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#161E33] dark:text-[#F0EAE1] hover:bg-[#E5DEC9] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center justify-center cursor-pointer"
                  title="Next Category (Shift + ArrowRight)"
                  aria-label="Next Category"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 3D CIRCULAR GALLERY */}
            <div className="pt-1">
              {activeSlide === 0 && (
                <div className="space-y-3">
                  <PointCircularGallery
                    categoryKey="facts"
                    title="Ground Truth"
                    description="Direct facts and validated realities anchoring your decision"
                    colorClasses={currentSlide.colorTheme}
                    items={groundTruthCombined}
                    zoomLevel={galleryZoom}
                    onZoomChange={setGalleryZoom}
                    onUpdateItem={handleUpdateGroundTruth}
                    onDeleteItem={handleDeleteGroundTruth}
                    onAddItem={handleAddGroundTruth}
                    whyClassified="Direct empirical baseline: verified system telemetry, legal compliance mandate, or immutable organizational constraint that cannot be disputed."
                    getItemWhyClassified={(idx, text) => resolveEpistemicWhy("facts", idx, text)}
                    downstreamDestination="Moves to Stage 4 & 5 as hard boundary conditions. Any architecture violating these is penalized."
                  />

                  <div className="p-3 bg-[#EDE7D6]/70 dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg text-xs text-[#161E33] dark:text-[#F0EAE1]">
                    <span className="font-bold font-mono text-[10px] text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
                      Stage 4 &amp; 5 Pipeline Destination
                    </span>
                    <span>
                      These {groundTruthCombined.length} verified facts move to <strong>Stage 4 Multi-Criteria Scoring</strong> and <strong>Stage 5 Architecture Decision Record (ADR)</strong> as immutable boundary conditions. Architectural options that violate these facts are automatically penalized.
                    </span>
                  </div>
                </div>
              )}

              {activeSlide === 1 && (
                <div className="space-y-3">
                  <PointCircularGallery
                    categoryKey="assumptions"
                    title="Working Assumption"
                    description="Untested hypotheses to verify in Stage 3 Web Research"
                    colorClasses={currentSlide.colorTheme}
                    items={assumptionsList}
                    zoomLevel={galleryZoom}
                    onZoomChange={setGalleryZoom}
                    onUpdateItem={handleUpdateAssumption}
                    onDeleteItem={handleDeleteAssumption}
                    onAddItem={handleAddAssumption}
                    whyClassified="Unverified forward projection: an expectation, performance goal, or capacity target not yet proven under real production load."
                    getItemWhyClassified={(idx, text) => resolveEpistemicWhy("assumptions", idx, text)}
                    downstreamDestination="Moves to Stage 3 Web Research to retrieve benchmarks & empirical proof."
                  />

                  <div className="p-3 bg-[#EDE7D6]/70 dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg flex items-center justify-between gap-3 text-xs text-[#161E33] dark:text-[#F0EAE1]">
                    <div>
                      <span className="font-bold font-mono text-[10px] text-[#2F5D8F] dark:text-[#93B4D7] uppercase tracking-wider block">
                        Stage 3 Pipeline Destination
                      </span>
                      <span>
                        These {assumptionsList.length} unverified assumptions move to <strong>Stage 3 Web Research</strong>, where targeted queries are automatically formulated to retrieve external benchmarks and real-world case studies before committing.
                      </span>
                    </div>
                    {onAdvanceToGaps && assumptionsList.length > 0 && (
                      <button
                        type="button"
                        onClick={onAdvanceToGaps}
                        className="px-3 py-1.5 bg-[#2F5D8F] hover:bg-[#244870] text-white font-bold rounded-md transition-colors shrink-0 cursor-pointer"
                      >
                        Validate in Stage 3 →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeSlide === 2 && (
                <div className="space-y-3">
                  <PointCircularGallery
                    categoryKey="contradictions"
                    title="Decision Trap"
                    description="Sunk costs, planning fallacies, and structural logic risks"
                    colorClasses={currentSlide.colorTheme}
                    items={biasesCombined}
                    zoomLevel={galleryZoom}
                    onZoomChange={setGalleryZoom}
                    onUpdateItem={handleUpdateBias}
                    onDeleteItem={handleDeleteBias}
                    onAddItem={handleAddBias}
                    whyClassified="Structural logic fallacy: potential sunk-cost trap, planning overconfidence, or conflict between stated deadlines and team capacity."
                    getItemWhyClassified={(idx, text) => resolveEpistemicWhy("biases", idx, text)}
                    downstreamDestination="Moves to Stage 4 Pre-Mortem & Inversion analysis to stress-test your team."
                  />

                  <div className="p-3 bg-[#EDE7D6]/70 dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg text-xs text-[#161E33] dark:text-[#F0EAE1]">
                    <span className="font-bold font-mono text-[10px] text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
                      Stage 4 Pipeline Destination
                    </span>
                    <span>
                      These {biasesCombined.length} logical blindspots move to <strong>Stage 4 Pre-Mortem &amp; Inversion Analysis</strong>, where the Shark Panel actively stress-tests your plan against Sunk Cost traps and premature commitment.
                    </span>
                  </div>
                </div>
              )}

              {activeSlide === 3 && (
                <div className="space-y-3">
                  <PointCircularGallery
                    categoryKey="cons"
                    title="Meeting Caveat"
                    description="Recorded dissent, operational friction points, and confidential scribe notes"
                    colorClasses={currentSlide.colorTheme}
                    items={caveatsCombined}
                    zoomLevel={galleryZoom}
                    onZoomChange={setGalleryZoom}
                    onUpdateItem={handleUpdateCaveat}
                    onDeleteItem={handleDeleteCaveat}
                    onAddItem={handleAddCaveat}
                    whyClassified="Organizational & team friction: recorded dissent, operational toil limits, or unspoken developer hesitation."
                    getItemWhyClassified={(idx, text) => resolveEpistemicWhy("caveats", idx, text)}
                    downstreamDestination="Moves to Stage 5 Risk Register to enforce SRE safeguards & rollback criteria."
                  />

                  <div className="p-3 bg-[#EDE7D6]/70 dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg text-xs text-[#161E33] dark:text-[#F0EAE1]">
                    <span className="font-bold font-mono text-[10px] text-[#5A6275] dark:text-[#A89F91] uppercase tracking-wider block">
                      Stage 5 Pipeline Destination
                    </span>
                    <span>
                      These {caveatsCombined.length} confidential friction notes move to <strong>Stage 5 Risk Mitigation &amp; Operational Safeguards</strong>, defining SRE toil caps, rollback criteria, and organizational governance guards.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-[#D9D2C3]/60 dark:border-[#38332C] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-[#5A6275] dark:text-[#A89F91]">
                Use <kbd className="px-1.5 py-0.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded text-[11px] font-mono text-[#161E33] dark:text-[#F0EAE1]">←</kbd> and <kbd className="px-1.5 py-0.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded text-[11px] font-mono text-[#161E33] dark:text-[#F0EAE1]">→</kbd> to rotate points. Press <kbd className="px-1.5 py-0.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded text-[11px] font-mono text-[#161E33] dark:text-[#F0EAE1]">Shift + ← / →</kbd> to switch categories.
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleSaveAndApprove(true)}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-[#161E33] dark:text-[#F0EAE1] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg transition-colors cursor-pointer"
                >
                  {isSaving ? "Saving..." : "Save Findings"}
                </button>

                {onAdvanceToGaps && (
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveAndApprove(true);
                      onAdvanceToGaps();
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-[#F5F1E8] bg-[#161E33] hover:bg-[#232C47] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Advance to Stage 3 Research</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
