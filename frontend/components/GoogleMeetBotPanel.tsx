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
  const [meetUrlInput, setMeetUrlInput] = useState("https://meet.google.com/xyz-tech-dec");
  const [botNameInput, setBotNameInput] = useState("DecisionLens Bot");
  const [isJoining, setIsJoining] = useState(false);
  const [activeSession, setActiveSession] = useState<GoogleMeetBotSession | null>(null);
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

  // Restore active/latest bot session on mount
  useEffect(() => {
    let cancelled = false;
    getBotSessions(decisionId)
      .then((sessions) => {
        if (cancelled || !sessions || sessions.length === 0) return;
        const active = sessions.find((s) =>
          ["active", "connecting", "transcribing"].includes(s.status)
        );
        if (active) {
          setActiveSession(active);
        } else {
          const latestWithTranscript = sessions.find((s) => Boolean(s.raw_transcript && s.raw_transcript.trim()));
          if (latestWithTranscript) {
            setActiveSession(latestWithTranscript);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [decisionId]);

  // Poll backend every 3s while bot session is running so live transcriptions & status updates appear immediately
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
        "en"
      );
      setActiveSession(session);
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
    <div className="space-y-4 pt-1">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#cfc7b2]/70 dark:border-[#38332C]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-newsreader text-lg font-semibold text-[#1d1d1b] dark:text-[#F0EAE1]">
              Google Meet Bot & Scribe
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#7a4e10]/12 text-[#7a4e10] dark:bg-[#D4AA50]/20 dark:text-[#D4AA50]">
              Live
            </span>
          </div>
          <p className="text-xs text-[#6e655a] dark:text-[#A89F91]">
            Joins your Meet call, transcribes live, filters chatter, and collects private participant notes.
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

      {/* STAGE A: Bot Dispatch Form (When not connected yet) */}
      {!activeSession ? (
        <form onSubmit={handleJoinMeet} className="space-y-4 max-w-2xl bg-[#EDE5D5] dark:bg-[#221F1C] p-5 border border-[#cfc7b2] dark:border-[#38332C] rounded-sm">
          <div className="space-y-2">
            <label className="text-[12px] font-bold uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91] block">
              Google Meet URL or Meeting Code:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={meetUrlInput}
                onChange={(e) => setMeetUrlInput(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="flex-1 bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] px-3.5 py-2 text-[14px] rounded-none focus:outline-none"
              />
              <button
                type="submit"
                disabled={!meetUrlInput.trim() || isJoining}
                className="px-5 py-2 bg-[#1d1d1b] hover:bg-[#443a30] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[13px] font-bold uppercase tracking-wider rounded-none disabled:opacity-40 transition-colors flex items-center gap-2 cursor-pointer shrink-0"
              >
                {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                Invite Bot to Meet
              </button>
            </div>
            <p className="text-[11px] text-[#6e655a] dark:text-[#A89F91]">
              Paste any Google Meet link (e.g. <code className="font-mono">https://meet.google.com/abc-defg-hij</code>).
            </p>
          </div>

          <div className="pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#6e655a] dark:text-[#A89F91]">
            <div className="flex items-center gap-2">
              <span className="font-bold">Bot Name in Call:</span>
              <input
                type="text"
                value={botNameInput}
                onChange={(e) => setBotNameInput(e.target.value)}
                className="bg-[#EDE7D6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] px-2 py-0.5 text-[12px] w-48 rounded-none"
              />
            </div>
            <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-400 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Auto-Distraction Filter Enabled
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

              {/* Live Bot Progress Ticker */}
              {activeSession.runner_note && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#EDE7D6]/80 dark:bg-[#221F1C] border border-[#cfc7b2]/60 dark:border-[#38332C] text-[12px] font-courier text-[#4f4b40] dark:text-[#A89F91]">
                  <span className="truncate">
                    <strong className="text-[#7a4e10] dark:text-[#D4AA50]">Status:</strong>{" "}
                    {activeSession.runner_note}
                  </span>
                  <span className="shrink-0 font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                    Chunks: {activeSession.audio_chunks_received ?? 0}
                  </span>
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
    </div>
  );
}
