
"use client";

import React, { useState, useEffect, useRef } from "react";
import ModalPortal from "@/components/ModalPortal";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ArrowRight,
  ShieldAlert,
  Brain,
  Search,
  Grid,
  Compass,
} from "lucide-react";
import {
  analyzeDecisionInputs,
  detectGaps,
  evaluateFrameworks,
  synthesizeDecision,
} from "@/lib/api";

interface AutoPilotModalProps {
  decisionId: number;
  decisionTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type StepStatus = "pending" | "running" | "completed" | "error";

interface AutoPilotStep {
  id: number;
  num: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  status: StepStatus;
  detailMsg?: string;
}

export default function AutoPilotModal({
  decisionId,
  decisionTitle,
  isOpen,
  onClose,
  onComplete,
}: AutoPilotModalProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allCompleted, setAllCompleted] = useState(false);
  const cancelledRef = useRef(false);

  const initialSteps: AutoPilotStep[] = [
    {
      id: 1,
      num: "01",
      title: "Cognitive Structuring & RAG Ingestion",
      subtitle: "Parsing PRD, audio transcript & vector-indexed docs",
      icon: <Brain className="w-4 h-4" />,
      status: "pending",
    },
    {
      id: 2,
      num: "02",
      title: "Information Gaps & Blindspots",
      subtitle: "Detecting unstated premises & critical missing facts",
      icon: <Search className="w-4 h-4" />,
      status: "pending",
    },
    {
      id: 3,
      num: "03",
      title: "Thinking Frameworks & MAUT Matrix",
      subtitle: "Evaluating 5 mental models & multi-attribute utilities",
      icon: <Grid className="w-4 h-4" />,
      status: "pending",
    },
    {
      id: 4,
      num: "04",
      title: "Executive ADR Recommendation & Roadmap",
      subtitle: "Grounding synthesis in evidence, counterarguments & phases",
      icon: <Compass className="w-4 h-4" />,
      status: "pending",
    },
  ];

  const [steps, setSteps] = useState<AutoPilotStep[]>(initialSteps);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  const updateStepStatus = (index: number, status: StepStatus, detailMsg?: string) => {
    setSteps((prev) =>
      prev.map((step, idx) =>
        idx === index ? { ...step, status, detailMsg } : step
      )
    );
  };

  const runAutoPilot = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    setAllCompleted(false);
    cancelledRef.current = false;
    setLogs([]);

    addLog(`Initiating DecisionLens Auto-Pilot for: "${decisionTitle}"`);

    // Step 1: Cognitive Structuring
    try {
      setCurrentStepIndex(0);
      updateStepStatus(0, "running", "Analyzing raw inputs & indexed attachments...");
      addLog("Phase 1: Executing Cognitive Structuring & Evidence Indexing...");
      
      await analyzeDecisionInputs(decisionId);
      
      if (cancelledRef.current) return;
      updateStepStatus(0, "completed", "Facts, biases & assumptions extracted");
      addLog("✓ Cognitive findings and domain standards indexed successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Cognitive Structuring failed";
      updateStepStatus(0, "error", msg);
      setErrorMsg(msg);
      addLog(`✖ Error in Step 1: ${msg}`);
      setIsRunning(false);
      return;
    }

    // Step 2: Information Gaps
    try {
      setCurrentStepIndex(1);
      updateStepStatus(1, "running", "Auditing dependencies and missing facts...");
      addLog("Phase 2: Auditing unstated premises & critical information gaps...");
      
      await detectGaps(decisionId);
      
      if (cancelledRef.current) return;
      updateStepStatus(1, "completed", "Gaps prioritized and queued");
      addLog("✓ Critical blindspots and resolution actions surfaced");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gap Detection failed";
      updateStepStatus(1, "error", msg);
      setErrorMsg(msg);
      addLog(`✖ Error in Step 2: ${msg}`);
      setIsRunning(false);
      return;
    }

    // Step 3: Thinking Frameworks (MAUT)
    try {
      setCurrentStepIndex(2);
      updateStepStatus(2, "running", "Computing 5 structured frameworks...");
      addLog("Phase 3: Evaluating Multi-Attribute Matrices & Reasoning Models...");
      
      await evaluateFrameworks(decisionId);
      
      if (cancelledRef.current) return;
      updateStepStatus(2, "completed", "MAUT matrix & 5 frameworks computed");
      addLog("✓ Multi-Attribute Utility and mental models aligned");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Framework Evaluation failed";
      updateStepStatus(2, "error", msg);
      setErrorMsg(msg);
      addLog(`✖ Error in Step 3: ${msg}`);
      setIsRunning(false);
      return;
    }

    // Step 4: Final Synthesis & Roadmap
    try {
      setCurrentStepIndex(3);
      updateStepStatus(3, "running", "Synthesizing ADR memo and execution roadmap...");
      addLog("Phase 4: Synthesizing Executive Memo & Phased Roadmap...");
      
      await synthesizeDecision(decisionId);
      
      if (cancelledRef.current) return;
      updateStepStatus(3, "completed", "Executive brief and roadmap ready");
      addLog("✓ Comprehensive Executive Synthesis & Phased Roadmap generated");
      
      setAllCompleted(true);
      setIsRunning(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Decision Synthesis failed";
      updateStepStatus(3, "error", msg);
      setErrorMsg(msg);
      addLog(`✖ Error in Step 4: ${msg}`);
      setIsRunning(false);
      return;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSteps(initialSteps);
      setLogs([]);
      setErrorMsg(null);
      setAllCompleted(false);
      setIsRunning(false);
      setCurrentStepIndex(0);
    } else {
      cancelledRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-[#161E33]/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-2xl bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans text-[#1d1d1b] dark:text-[#F0EAE1]">
          {/* Modal Header */}
          <div className="px-6 py-5 border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#E5DEC9] dark:bg-[#221F1C] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#161E33] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614] flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4 text-[#F4F0E6] dark:text-[#181614]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold tracking-tight text-[#161E33] dark:text-[#F0EAE1]">
                    Auto-Pilot Decision Dossier Run
                  </h3>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#161E33]/10 dark:bg-[#D4AA50]/20 text-[#161E33] dark:text-[#D4AA50] font-bold">
                    Sequential Orchestration
                  </span>
                </div>
                <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] truncate max-w-md mt-0.5 font-mono">
                  Target: {decisionTitle || "Untitled Decision"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                cancelledRef.current = true;
                onClose();
              }}
              disabled={isRunning}
              className="p-1.5 rounded-lg text-[#5A6275] hover:text-[#161E33] hover:bg-[#D9D2C3]/50 transition cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Explanatory Banner */}
            <div className="p-4 rounded-xl border border-[#D9D2C3] bg-[#F5F1E8]/70 text-xs text-[#5A6275] leading-relaxed flex items-start gap-3">
              <div className="p-1.5 bg-[#FCFBF8] border border-[#D9D2C3] rounded-md shrink-0 text-[#161E33]">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="font-semibold text-[#161E33] mb-0.5">
                  Full 4-Stage Autonomous Pipeline
                </p>
                <p>
                  Runs Cognitive Structuring with RAG semantic indexing, blindspot gap detection, 5 thinking frameworks (MAUT), and executive ADR synthesis in one coordinated sequence.
                </p>
              </div>
            </div>

            {/* Steps Progress Checklist */}
            <div className="space-y-3">
              {steps.map((step, idx) => {
                const isCurrent = isRunning && currentStepIndex === idx;
                return (
                  <div
                    key={step.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-start gap-3.5 ${
                      step.status === "completed"
                        ? "bg-[#F4F0E6] dark:bg-[#221F1C] border-[#cfc7b2] dark:border-[#38332C]"
                        : step.status === "running"
                        ? "bg-[#E5DEC9] dark:bg-[#2C2723] border-[#7a4e10] dark:border-[#D4AA50] shadow-sm ring-1 ring-[#7a4e10]/20"
                        : step.status === "error"
                        ? "bg-red-50/50 dark:bg-red-950/40 border-red-300 dark:border-red-800"
                        : "bg-[#E5DEC9]/40 dark:bg-[#1A1815] border-[#cfc7b2]/70 dark:border-[#38332C] opacity-75"
                    }`}
                  >
                    {/* Status Icon */}
                    <div className="mt-0.5 shrink-0">
                      {step.status === "completed" ? (
                        <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                      ) : step.status === "running" ? (
                        <div className="w-6 h-6 rounded-md bg-[#161E33] text-white flex items-center justify-center">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        </div>
                      ) : step.status === "error" ? (
                        <div className="w-6 h-6 rounded-md bg-red-100 text-red-700 flex items-center justify-center">
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-md bg-[#D9D2C3] text-[#5A6275] flex items-center justify-center text-[10px] font-mono font-bold">
                          {step.num}
                        </div>
                      )}
                    </div>

                    {/* Step Title & Subtitle */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#161E33] flex items-center gap-1.5">
                          <span>{step.title}</span>
                        </span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#F5F1E8] border border-[#D9D2C3] text-[#5A6275]">
                          {step.status === "completed"
                            ? "DONE"
                            : step.status === "running"
                            ? "PROCESSING..."
                            : step.status === "error"
                            ? "FAILED"
                            : "PENDING"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5A6275] mt-0.5 truncate">
                        {step.subtitle}
                      </p>
                      {step.detailMsg && (
                        <p
                          className={`text-[11px] font-mono mt-1 ${
                            step.status === "error"
                              ? "text-red-700 font-semibold"
                              : "text-emerald-700"
                          }`}
                        >
                          → {step.detailMsg}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Real-time Execution Logs */}
            {logs.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#5A6275] font-semibold">
                  Execution Telemetry:
                </span>
                <div className="bg-[#161E33] text-[#FCFBF8] p-3.5 rounded-xl font-mono text-[11px] max-h-36 overflow-y-auto space-y-1 select-text">
                  {logs.map((log, i) => (
                    <div key={i} className="leading-relaxed opacity-90">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Success Banner */}
            {allCompleted && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold">Autonomous Dossier Synthesis Complete!</p>
                    <p className="text-emerald-700 text-[11px]">
                      All cognitive layers, framework trade-offs, and ADR recommendations are ready.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 bg-[#E5DEC9] dark:bg-[#221F1C] border-t border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                cancelledRef.current = true;
                onClose();
              }}
              disabled={isRunning}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] hover:bg-[#cfc7b2]/40 transition disabled:opacity-40"
            >
              {allCompleted ? "Close" : "Cancel"}
            </button>

            {allCompleted ? (
              <button
                type="button"
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#161E33] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614] hover:opacity-90 shadow-sm transition cursor-pointer"
              >
                <span>View Finalized Dossier</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : isRunning ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#161E33]/70 dark:bg-[#D4AA50]/70 text-[#F4F0E6] dark:text-[#181614] cursor-not-allowed"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Synthesizing Dossier...</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={runAutoPilot}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#161E33] text-[#FCFBF8] hover:bg-[#253252] shadow-sm transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Start Auto-Pilot Pipeline</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
