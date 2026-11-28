"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  Bot,
  Radio,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Send,
  MessageSquare,
  Shield,
  Sparkles,
  Loader2,
  ExternalLink,
  Volume2,
  Trash2,
  Maximize2,
  Play,
  Check,
  History,
  Clock,
} from "lucide-react";
import {
  GoogleMeetBotSession,
  joinGoogleMeetBot,
  getBotSession,
  getBotSessions,
  sendBotSpeechStream,
  finishBotMeetingAndAnalyze,
  BotFinishAndAnalyzeResponse,
} from "@/lib/api";
import PrivateBotChatPanel from "@/components/PrivateBotChatPanel";

interface GoogleMeetBotPanelProps {
  decisionId: number;
  decisionTitle: string;
  onAnalysisCompleted?: (res: BotFinishAndAnalyzeResponse) => void;
  extraHeaderAction?: React.ReactNode;
}

export default function GoogleMeetBotPanel({
  decisionId,
  decisionTitle,
  onAnalysisCompleted,
  extraHeaderAction,
}: GoogleMeetBotPanelProps) {
  const [meetUrlInput, setMeetUrlInput] = useState("");
  const [botNameInput, setBotNameInput] = useState("DecisionLens Bot");
  const [isJoining, setIsJoining] = useState(false);
  const [activeSession, setActiveSession] = useState<GoogleMeetBotSession | null>(null);
  const userDismissedActiveRef = useRef(false);
  const [sessionsList, setSessionsList] = useState<GoogleMeetBotSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [panelMode, setPanelMode] = useState<"live" | "conducted">("live");
  const [expandedConductedId, setExpandedConductedId] = useState<number | null>(null);
  const [analyzingConductedId, setAnalyzingConductedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"speech" | "private_chat">("speech");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Live Speech Streaming state
  const [speechSpeaker, setSpeechSpeaker] = useState("Speaker");
  const [speechTextInput, setSpeechTextInput] = useState("");
  const [isSendingSpeech, setIsSendingSpeech] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Finishing & Analyzing
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishResult, setFinishResult] = useState<BotFinishAndAnalyzeResponse | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (transcriptBoxRef.current && activeSession?.raw_transcript) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [activeSession?.raw_transcript]);

  // Call duration counter
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (activeSession && (activeSession.status === "active" || activeSession.status === "connecting" || activeSession.status === "transcribing")) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeSession?.id, activeSession?.status]);

  const refreshSessions = async () => {
    try {
      const sessions = await getBotSessions(decisionId);
      setSessionsList(sessions || []);
    } catch {
      // Ignore refresh errors
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Restore active bot session on mount & populate conducted history
  useEffect(() => {
    let cancelled = false;
    const syncSessions = () => {
      getBotSessions(decisionId)
        .then((sessions) => {
          if (cancelled || !sessions) return;
          setSessionsList(sessions);
          const active = sessions.find((s) =>
            ["active", "connecting", "transcribing"].includes(s.status)
          );
          if (active && !userDismissedActiveRef.current) {
            setActiveSession((prev) =>
              !prev || prev.id === active.id || prev.status === "completed" || prev.status === "failed"
                ? active
                : prev
            );
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsLoadingSessions(false);
        });
    };
    syncSessions();
    const onFocus = () => syncSessions();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [decisionId]);

  // Poll backend every 2s while bot session is running so live transcriptions & status updates appear immediately
  useEffect(() => {
    if (
      !activeSession ||
      !["active", "connecting", "transcribing"].includes(activeSession.status)
    ) {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const latest = await getBotSession(decisionId, activeSession.id);
        setActiveSession(latest);
        if (latest.status === "completed" || latest.status === "failed") {
          refreshSessions();
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [decisionId, activeSession?.id, activeSession?.status]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleJoinMeet = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!meetUrlInput.trim()) return;

    setIsJoining(true);
    setErrorMsg(null);

    try {
      const session = await joinGoogleMeetBot(
        decisionId,
        meetUrlInput.trim(),
        botNameInput.trim() || "DecisionLens Bot",
        "en",
        true
      );
      userDismissedActiveRef.current = false;
      setFinishResult(null);
      setCallDuration(0);
      setSpeechTextInput("");
      setActiveSession(session);
      setPanelMode("live");
      refreshSessions();
    } catch (err: any) {
      console.error("Could not dispatch bot to Google Meet:", err);
      setErrorMsg(err.message || "Could not dispatch bot. Please check the Google Meet URL.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopyInviteLink = () => {
    if (!activeSession) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/meet-chat/${activeSession.private_chat_token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSendSpeechChunk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!speechTextInput.trim() || !activeSession || isSendingSpeech) return;

    setIsSendingSpeech(true);
    const text = speechTextInput.trim();
    setSpeechTextInput("");

    try {
      const updated = await sendBotSpeechStream(
        decisionId,
        activeSession.id,
        text,
        speechSpeaker,
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      setActiveSession(updated);
    } catch (err) {
      console.warn("Could not stream speech chunk:", err);
      setSpeechTextInput(text);
    } finally {
      setIsSendingSpeech(false);
    }
  };

  const handleSimulateMeetingDiscussion = async () => {
    if (!activeSession) return;
    const sampleExchanges = [
      { speaker: "Alex (Lead Architect)", text: "We need to evaluate moving from our MySQL monolithic instance to Aurora PostgreSQL or DynamoDB." },
      { speaker: "Dan (Product Manager)", text: "Hey team, did anyone order burgers for lunch or should I get pizza?" }, // Distraction tangent
      { speaker: "Sarah (DevOps / SRE)", text: "Our peak IOPS on PostgreSQL hit 8,500 during last week's flash sale. Connection pooling via PgBouncer is mandatory." },
      { speaker: "David (Backend)", text: "DynamoDB charges per WCU/RCU; at 15% traffic utilization, Aurora serverless v2 is roughly 40% cheaper." },
      { speaker: "Dan (Product Manager)", text: "Wait, can everyone hear my mic or is there an echo?" }, // Distraction tangent
      { speaker: "Alex (Lead Architect)", text: "Our target SLA is p99 under 50ms for the checkout query path." },
    ];

    for (const exchange of sampleExchanges) {
      try {
        const updated = await sendBotSpeechStream(
          decisionId,
          activeSession.id,
          exchange.text,
          exchange.speaker,
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
        setActiveSession(updated);
      } catch (err) {
        console.warn("Simulate stream error:", err);
      }
    }
  };

  const handleFinishAndAnalyze = async () => {
    if (!activeSession || isFinishing) return;
    setIsFinishing(true);
    setErrorMsg(null);

    try {
      const res = await finishBotMeetingAndAnalyze(decisionId, activeSession.id);
      setFinishResult(res);
      setActiveSession(res.session);
      refreshSessions();
      if (onAnalysisCompleted) {
        onAnalysisCompleted(res);
      }
    } catch (err: any) {
      console.error("Finish & Analyze failed:", err);
      setErrorMsg(err.message || "Failed to analyze meeting and private inputs.");
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="space-y-4 pt-1 font-sans">
      {/* Clear Plain-English Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#cfc7b2]/70 dark:border-[#38332C]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-newsreader text-xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
              Send AI Note-Taker to Google Meet
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider bg-[#E5DEC9] text-[#7a4e10] border border-[#cfc7b2] dark:bg-[#D4AA50]/20 dark:text-[#D4AA50] dark:border-[#38332C]">
              Live
            </span>
          </div>
          <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-0.5">
            Paste a Google Meet link below — the bot joins your call, transcribes live, and captures notes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {extraHeaderAction}
          {activeSession && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs">
              {activeSession.status === "completed" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="font-semibold text-[#4f4b40] dark:text-[#A89F91]">
                    Call Ended ({formatTimer(callDuration)})
                  </span>
                </>
              ) : activeSession.status === "failed" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                    Bot Stopped
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                    {activeSession.status === "connecting" ? "Connecting" : "Bot Active"} · {formatTimer(callDuration)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-[13px] flex items-center gap-2 rounded-sm">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Primary Mode Switcher: Live Transcriptions vs Conducted Transcriptions */}
      {(() => {
        const conductedSessions = sessionsList.filter(
          (s) => s.status === "completed" || s.status === "failed"
        );
        const isLiveRunning =
          activeSession &&
          ["active", "connecting", "transcribing"].includes(activeSession.status);

        return (
          <>
            <div className="flex items-center gap-2 border-b border-[#cfc7b2] dark:border-[#38332C] pb-2">
              <button
                type="button"
                onClick={() => setPanelMode("live")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  panelMode === "live"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] border-[#1d1d1b] dark:bg-[#D4AA50] dark:text-[#181614] dark:border-[#D4AA50]"
                    : "bg-[#E5DEC9]/70 dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                }`}
              >
                <Radio className={`w-3.5 h-3.5 ${isLiveRunning ? "text-[#D4AA50] animate-pulse" : ""}`} />
                Live Session
              </button>
              <button
                type="button"
                onClick={() => {
                  setPanelMode("conducted");
                  refreshSessions();
                }}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  panelMode === "conducted"
                    ? "bg-[#1d1d1b] text-[#F4F0E6] border-[#1d1d1b] dark:bg-[#D4AA50] dark:text-[#181614] dark:border-[#D4AA50]"
                    : "bg-[#E5DEC9]/70 dark:bg-[#181614] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Past Meetings {isLoadingSessions ? (
                  <Loader2 className="w-3 h-3 animate-spin inline ml-1" />
                ) : (
                  `(${conductedSessions.length})`
                )}
              </button>
            </div>

            {panelMode === "conducted" ? (
              <div className="space-y-3">
                {isLoadingSessions && conductedSessions.length === 0 ? (
                  <div className="p-8 text-center bg-[#EDE5D5]/60 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-xs text-[#6e655a] dark:text-[#A89F91] flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading past meetings...
                  </div>
                ) : conductedSessions.length === 0 ? (
                  <div className="p-8 text-center bg-[#EDE5D5]/60 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm text-xs text-[#6e655a] dark:text-[#A89F91]">
                    No past meetings recorded yet for this decision.
                  </div>
                ) : (
                  conductedSessions.map((sess) => {
                    const transcriptText = (sess.cleaned_transcript || sess.raw_transcript || "").trim();
                    const isExpanded = expandedConductedId === sess.id;
                    const isAnalyzingThis = analyzingConductedId === sess.id;
                    return (
                      <div
                        key={sess.id}
                        className="p-4 bg-[#EDE5D5]/80 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm ${
                                sess.status === "completed"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                              }`}
                            >
                              {sess.status === "completed" ? "Conducted" : "Stopped / Disrupted"}
                            </span>
                            <a
                              href={sess.meet_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs font-semibold text-[#7a4e10] dark:text-[#D4AA50] hover:underline flex items-center gap-1"
                            >
                              {sess.meet_url.replace("https://", "")}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <span className="text-[11px] text-[#6e655a] dark:text-[#A89F91] flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(sess.started_at || sess.created_at).toLocaleString()}
                            </span>
                            <span className="text-[11px] font-mono text-[#6e655a] dark:text-[#A89F91]">
                              · Chunks: {sess.audio_chunks_received ?? 0}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setMeetUrlInput(sess.meet_url);
                                setActiveSession(null);
                                userDismissedActiveRef.current = false;
      setFinishResult(null);
                                setCallDuration(0);
                                setPanelMode("live");
                              }}
                              className="px-2.5 py-1 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[11px] font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] hover:bg-[#EDE7D6] rounded-sm cursor-pointer"
                            >
                              New Live Call Here
                            </button>
                            {transcriptText && (
                              <button
                                type="button"
                                disabled={isAnalyzingThis}
                                onClick={async () => {
                                  setAnalyzingConductedId(sess.id);
                                  setErrorMsg(null);
                                  try {
                                    const res = await finishBotMeetingAndAnalyze(decisionId, sess.id);
                                    setFinishResult(res);
                                    refreshSessions();
                                    if (onAnalysisCompleted) onAnalysisCompleted(res);
                                  } catch (err: any) {
                                    setErrorMsg(err.message || "Failed to analyze conducted transcript.");
                                  } finally {
                                    setAnalyzingConductedId(null);
                                  }
                                }}
                                className="px-2.5 py-1 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] text-[11px] font-semibold rounded-sm disabled:opacity-40 cursor-pointer flex items-center gap-1"
                              >
                                {isAnalyzingThis && <Loader2 className="w-3 h-3 animate-spin" />}
                                Analyze
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedConductedId(isExpanded ? null : sess.id)
                              }
                              className="px-2.5 py-1 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[11px] font-semibold text-[#7a4e10] dark:text-[#D4AA50] rounded-sm cursor-pointer"
                            >
                              {isExpanded ? "Hide" : "View Transcript"}
                            </button>
                          </div>
                        </div>

                        {sess.runner_note && (
                          <div className="text-[11px] font-mono text-[#6e655a] dark:text-[#A89F91] truncate">
                            {sess.runner_note}
                          </div>
                        )}

                        {isExpanded && (
                          <div className="max-h-[260px] overflow-y-auto p-3 bg-[#F5F1E8] dark:bg-[#1C1917] border border-[#cfc7b2]/50 dark:border-[#38332C] text-[12px] font-mono leading-relaxed space-y-1">
                            {transcriptText ? (
                              transcriptText.split("\n").filter(Boolean).map((line, i) => (
                                <div key={i}>{line}</div>
                              ))
                            ) : (
                              <div className="text-[#6e655a] dark:text-[#A89F91]">
                                No speech was captured in this session.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : !activeSession ? (
        <form onSubmit={handleJoinMeet} className="space-y-4 bg-[#E5DEC9]/75 dark:bg-[#181614] p-5 border border-[#cfc7b2] dark:border-[#38332C] rounded-md">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] block">
              Paste your Google Meet link
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                value={meetUrlInput}
                onChange={(e) => setMeetUrlInput(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="flex-1 bg-[#F4F0E6] dark:bg-[#221F1C] border-2 border-[#b8af99] dark:border-[#38332C] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] px-3.5 py-2.5 text-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7d7567] rounded-md focus:outline-none font-sans"
              />
              <button
                type="submit"
                disabled={!meetUrlInput.trim() || isJoining}
                className="px-5 py-2.5 bg-[#1d1d1b] hover:bg-[#33302b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-sm font-semibold rounded-md disabled:opacity-45 transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                <span>{isJoining ? "Sending..." : "Send Bot"}</span>
              </button>
            </div>
            <p className="text-xs text-[#4f4b40] dark:text-[#A89F91]">
              Example: <span className="font-mono">https://meet.google.com/abc-defg-hij</span> or just the meeting code <span className="font-mono">abc-defg-hij</span>
            </p>
          </div>

          <div className="pt-3 border-t border-[#cfc7b2]/70 dark:border-[#38332C]/60 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4f4b40] dark:text-[#A89F91]">
            <div className="flex items-center gap-2">
              <span className="font-medium">Bot display name:</span>
              <input
                type="text"
                value={botNameInput}
                onChange={(e) => setBotNameInput(e.target.value)}
                className="bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] px-2.5 py-1 text-xs text-[#1d1d1b] dark:text-[#F0EAE1] w-44 rounded-md"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[#7a4e10] dark:text-[#D4AA50] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Auto-filters small talk &amp; filler</span>
            </div>
          </div>
        </form>
      ) : (
        /* STAGE B: Active Bot Management & Speech Feed */
        <div className="space-y-5">
          {/* Active Call Controls Bar */}
          <div className="p-3.5 bg-[#F4F0E6]/80 dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#6e655a] dark:text-[#A89F91]">
                  Meeting:
                </span>
                <a
                  href={activeSession.meet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs font-semibold text-[#7a4e10] dark:text-[#D4AA50] hover:underline flex items-center gap-1"
                >
                  {activeSession.meet_url.replace("https://", "")}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Private Participant Invite Link Button */}
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EDE5D5] dark:bg-[#221F1C] hover:bg-[#EDE7D6] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-semibold text-[#7a4e10] dark:text-[#D4AA50] rounded-md transition-colors cursor-pointer"
                title="Copy shareable link for participants to send private feedback to the bot"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? "Link Copied" : "Share Private Chat Link"}
              </button>
            </div>

            {/* Complete & Analyze CTA */}
            <div className="flex items-center gap-2">
              {(activeSession.status === "completed" || activeSession.status === "failed") && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSession(null);
                    userDismissedActiveRef.current = false;
      setFinishResult(null);
                    setCallDuration(0);
                    setErrorMsg(null);
                  }}
                  className="px-3.5 py-1.5 bg-[#EDE5D5] hover:bg-[#EDE7D6] text-[#1d1d1b] dark:bg-[#2A2622] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-semibold rounded-md transition-colors cursor-pointer"
                >
                  New Meeting
                </button>
              )}
              {(activeSession.status !== "completed" && activeSession.status !== "failed") || activeSession.raw_transcript ? (
                <button
                  type="button"
                  onClick={handleFinishAndAnalyze}
                  disabled={isFinishing}
                  className="px-4 py-1.5 bg-[#1d1d1b] hover:bg-[#443a30] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-xs font-semibold rounded-md disabled:opacity-40 transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  {isFinishing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {activeSession.status === "completed" || activeSession.status === "failed"
                    ? "Analyze Call Transcript"
                    : "End Call & Analyze"}
                </button>
              ) : null}
            </div>
          </div>

          {/* Tab Switcher: Live Speech vs Private Participant Chat */}
          <div className="flex gap-1 border-b border-[#cfc7b2] dark:border-[#38332C]">
            <button
              type="button"
              onClick={() => setActiveTab("speech")}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === "speech"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] text-[#7a4e10] dark:text-[#D4AA50]"
                  : "border-transparent text-[#6e655a] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
              }`}
            >
              Live Transcript
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("private_chat")}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === "private_chat"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] text-[#7a4e10] dark:text-[#D4AA50]"
                  : "border-transparent text-[#6e655a] dark:text-[#A89F91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
              }`}
            >
              Confidential Chat
            </button>
          </div>

          {/* TAB 1: Live Speech Diarization Feed (Full Width) */}
          {activeTab === "speech" && (
            <div className="bg-[#EDE5D5] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#cfc7b2]/60 dark:border-[#38332C]/60 pb-2">
                <div className="text-[12px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                  Live Meeting Transcript
                </div>
                <button
                  type="button"
                  onClick={handleSimulateMeetingDiscussion}
                  className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Load Sample Tech Discussion
                </button>
              </div>

              {/* Live Bot Progress Ticker + Pending Chunks Bar */}
              {(activeSession.runner_note || (activeSession.pending_chunks ?? 0) > 0 || (activeSession.audio_chunks_received ?? 0) > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-1.5 bg-[#EDE7D6]/80 dark:bg-[#221F1C] border border-[#cfc7b2]/60 dark:border-[#38332C] text-[12px] font-courier text-[#4f4b40] dark:text-[#A89F91]">
                  <span className="truncate min-w-0 flex-1">
                    <strong className="text-[#7a4e10] dark:text-[#D4AA50]">Status:</strong>{" "}
                    {activeSession.runner_note || "Listening for meeting audio..."}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                      Transcribed: {activeSession.audio_chunks_received ?? 0}
                    </span>
                    {(() => {
                      const pending = activeSession.pending_chunks ?? 0;
                      const bufSec = activeSession.buffered_seconds ?? 0;
                      const pct = Math.min(100, Math.round((bufSec / 120) * 100));
                      if (pending === 0 && bufSec === 0) {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-emerald-100/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Pending: 0 · Synced
                          </span>
                        );
                      }
                      return (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-800 dark:text-amber-300 text-[11px]">
                            Pending: {pending} ({bufSec}s/120s)
                          </span>
                          <div className="w-20 h-2 bg-[#cfc7b2]/70 dark:bg-[#38332C] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-600 dark:bg-[#D4AA50] transition-all duration-500"
                              style={{ width: `${Math.max(8, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div
                ref={transcriptBoxRef}
                className="min-h-[240px] max-h-[360px] overflow-y-auto space-y-1.5 p-2.5 bg-[#F5F1E8] dark:bg-[#1C1917] border border-[#cfc7b2]/40 dark:border-[#38332C]/40 text-[13px] font-mono leading-relaxed"
              >
                {!activeSession.raw_transcript ? (
                  <div className="text-center py-12 text-[#6e655a] dark:text-[#A89F91] space-y-2">
                    <p>{activeSession.runner_note || "Listening for speech in Google Meet..."}</p>
                    <p className="text-[11px]">
                      Participants speaking (or shared tab audio) in the call will appear here every 3 seconds.
                    </p>
                  </div>
                ) : (
                  activeSession.raw_transcript.split("\n").filter(Boolean).map((line, idx) => (
                    <div key={idx} className="p-1.5 rounded-sm hover:bg-[#EDE7D6] dark:hover:bg-[#2A2622] transition-colors">
                      {line}
                    </div>
                  ))
                )}
              </div>

              {/* Input to inject manual speech stream */}
              <form onSubmit={handleSendSpeechChunk} className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60">
                <input
                  type="text"
                  value={speechSpeaker}
                  onChange={(e) => setSpeechSpeaker(e.target.value)}
                  placeholder="Speaker"
                  className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] px-2.5 py-1.5 text-[12px] w-36 rounded-none"
                />
                <input
                  type="text"
                  value={speechTextInput}
                  onChange={(e) => setSpeechTextInput(e.target.value)}
                  placeholder="Add or dictate spoken argument in Google Meet..."
                  className="flex-1 min-w-[200px] bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] px-3 py-1.5 text-[13px] rounded-none focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!speechTextInput.trim() || isSendingSpeech}
                  className="px-3.5 py-1.5 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] text-[12px] font-bold uppercase tracking-wider rounded-none disabled:opacity-40 cursor-pointer"
                >
                  Stream
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: Confidential Participant Chat Panel */}
          {activeTab === "private_chat" && (
            <div className="max-w-4xl mx-auto">
              <PrivateBotChatPanel
                decisionId={decisionId}
                sessionId={activeSession.id}
                decisionTitle={decisionTitle}
              />
            </div>
          )}

          {/* Post-Call Analysis Summary Card */}
          {finishResult && (
            <div className="p-5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-sm space-y-3">
              <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-300 text-[14px]">
                <CheckCircle2 className="w-5 h-5" />
                Google Meet Session Finished & Analyzed Successfully
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                <div className="p-3 bg-[#EDE5D5] dark:bg-[#181614] border border-emerald-200 dark:border-emerald-900 rounded-sm">
                  <span className="text-[#6e655a] dark:text-[#A89F91] block">Chit-Chat Tangents Scrubbed:</span>
                  <span className="font-bold text-lg text-emerald-800 dark:text-emerald-400">
                    {finishResult.tangents_filtered_count}
                  </span>
                </div>
                <div className="p-3 bg-[#EDE5D5] dark:bg-[#181614] border border-emerald-200 dark:border-emerald-900 rounded-sm">
                  <span className="text-[#6e655a] dark:text-[#A89F91] block">Technical Signal Ratio:</span>
                  <span className="font-bold text-lg text-emerald-800 dark:text-emerald-400">
                    {Math.round(finishResult.signal_ratio * 100)}%
                  </span>
                </div>
                <div className="p-3 bg-[#EDE5D5] dark:bg-[#181614] border border-emerald-200 dark:border-emerald-900 rounded-sm">
                  <span className="text-[#6e655a] dark:text-[#A89F91] block">Confidential Inputs Factored:</span>
                  <span className="font-bold text-lg text-[#7a4e10] dark:text-[#D4AA50]">
                    {finishResult.private_inputs_count}
                  </span>
                </div>
              </div>
              <p className="text-[12px] text-emerald-900 dark:text-emerald-300">
                DecisionLens structured findings have been updated below with all verified points and private participant disclosures.
              </p>
            </div>
          )}
        </div>
      )}
          </>
        );
      })()}
    </div>
  );
}
