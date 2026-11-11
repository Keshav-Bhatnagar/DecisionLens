"use client";

import React, { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Video,
  Lock,
  Send,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  Loader2,
  Radio,
  ExternalLink,
  Mic,
  Maximize2,
  Users,
} from "lucide-react";
import {
  getDecision,
  updateDecision,
  updateTranscript,
  getMe,
  uploadAudio,
  getMeetingTakeaways,
  Decision,
  MeetingTakeawaysResponse,
} from "@/lib/api";
import MeetingTakeawaysModal from "@/components/MeetingTakeawaysModal";
import CelestialThemeToggle from "@/components/CelestialThemeToggle";
import { useTheme } from "@/context/ThemeContext";

interface SilentNote {
  id: string;
  category: "risk" | "constraint" | "alternative" | "criteria";
  content: string;
  author: string;
  isAnonymous: boolean;
  timestamp: string;
}

const PRESET_ROLES = [
  "Lead Architect",
  "DevOps / SRE",
  "Security & CISO",
  "Product Lead",
  "Backend Lead",
  "Data Platform",
  "FinOps / Finance",
  "QA & Reliability",
  "Legal & Compliance",
  "Founder / Exec",
];

export default function StandaloneMeetingPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { decisionId: decisionIdStr } = use(params);
  const decisionId = parseInt(decisionIdStr, 10);

  const [decision, setDecision] = useState<Decision | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Scribe State
  const [category, setCategory] = useState<"risk" | "constraint" | "alternative" | "criteria">("risk");
  const [authorRole, setAuthorRole] = useState("DevOps / SRE");
  const [isAddingCustomRole, setIsAddingCustomRole] = useState(false);
  const [customRoleText, setCustomRoleText] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [notesList, setNotesList] = useState<SilentNote[]>([]);

  // Audio capture & transcription state
  const [isCapturingAudio, setIsCapturingAudio] = useState(false);
  const [captureDuration, setCaptureDuration] = useState(0);
  const [liveCapturedText, setLiveCapturedText] = useState("");
  const [liveInterimText, setLiveInterimText] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Takeaways Modal state
  const [showTakeawaysModal, setShowTakeawaysModal] = useState(false);
  const [takeawaysData, setTakeawaysData] = useState<MeetingTakeawaysResponse | null>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  const storageKey = `decisionlens_caveats_${decisionId}`;

  // Fetch Decision and User on mount
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getDecision(decisionId).catch(() => null),
      getMe().catch(() => null),
    ]).then(([dec, user]) => {
      if (!isMounted) return;
      if (dec) setDecision(dec);
      if (user) {
        const name = user.display_name || user.email.split("@")[0];
        setCurrentUser({ name, email: user.email });
      }
      setLoading(false);
    });

    // Load notes from localStorage
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setNotesList(JSON.parse(stored));
      }
    } catch (_) {}

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          setNotesList(JSON.parse(e.newValue));
        } catch (_) {}
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [decisionId, storageKey]);

  // Handle postMessage from Jitsi (auto-redirect when call ends)
  useEffect(() => {
    const handleJitsiMessage = (event: MessageEvent) => {
      if (typeof event.data === "object" && event.data !== null) {
        if (
          event.data.eventName === "readyToClose" ||
          event.data.eventName === "videoConferenceLeft"
        ) {
          handleEndMeetingAndReturn();
        }
      }
    };
    window.addEventListener("message", handleJitsiMessage);
    return () => window.removeEventListener("message", handleJitsiMessage);
  }, [decisionId, notesList, liveCapturedText]);

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch (_) {}
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  const handleApplyCustomRole = () => {
    if (customRoleText.trim()) {
      setAuthorRole(customRoleText.trim());
      setIsAddingCustomRole(false);
    }
  };

  const handleSubmitNote = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!noteContent.trim()) return;

    const authorName = currentUser?.name || "Team Member";
    const rolePrefix = authorRole ? `[${authorRole}] ` : "";
    const newNote: SilentNote = {
      id: `note-${Date.now()}`,
      category,
      content: `${rolePrefix}${noteContent.trim()}`,
      author: isAnonymous ? `Anonymous (${authorRole})` : `${authorName} (${authorRole})`,
      isAnonymous,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updated = [newNote, ...notesList];
    setNotesList(updated);
    setNoteContent("");

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (_) {}
  };

  const startLiveAudioCapture = async () => {
    setCaptureError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Your browser does not support tab audio capture. Please use Chrome, Edge, or Brave.");
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTrack = displayStream.getAudioTracks()[0];
      if (!audioTrack) {
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error("No audio track detected. Make sure to check 'Share tab audio' in your browser prompt.");
      }

      audioStreamRef.current = displayStream;
      audioChunksRef.current = [];
      setIsCapturingAudio(true);
      setCaptureDuration(0);

      captureTimerRef.current = setInterval(() => {
        setCaptureDuration((prev) => prev + 1);
      }, 1000);

      try {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const mediaRec = new MediaRecorder(new MediaStream([audioTrack]), { mimeType });
        mediaRec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        mediaRec.start(1000);
        mediaRecorderRef.current = mediaRec;
      } catch (recErr) {
        console.warn("MediaRecorder setup notice:", recErr);
      }

      audioTrack.onended = () => {
        stopLiveAudioCapture();
      };

      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = "en-US";
          let transcriptBuffer = liveCapturedText;

          rec.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const text = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                transcriptBuffer = (transcriptBuffer + " " + text).trim();
              } else {
                interim += " " + text;
              }
            }
            setLiveCapturedText(transcriptBuffer);
            setLiveInterimText(interim);
          };

          rec.onerror = (e: any) => {
            console.warn("Speech recognition notice:", e?.error);
          };

          rec.start();
          speechRecognitionRef.current = rec;
        } catch (e) {
          console.warn("Web Speech API init:", e);
        }
      }
    } catch (err: unknown) {
      setCaptureError(err instanceof Error ? err.message : "Failed to start tab audio capture.");
      setIsCapturingAudio(false);
    }
  };

  const stopLiveAudioCapture = () => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }
    setIsCapturingAudio(false);
  };

  const handleGenerateTakeaways = async () => {
    setIsGeneratingTakeaways(true);
    setShowTakeawaysModal(true);
    try {
      const res = await getMeetingTakeaways(decisionId, {
        notes: notesList,
        transcript: liveCapturedText.trim() || undefined,
        agenda: decision?.title || `Decision #${decisionId}`,
      });
      setTakeawaysData(res);
    } catch (err) {
      console.warn("Could not generate meeting takeaways:", err);
    } finally {
      setIsGeneratingTakeaways(false);
    }
  };

  const handleEndMeetingAndReturn = async () => {
    setIsFinishing(true);
    try {
      if (isCapturingAudio) {
        stopLiveAudioCapture();
      }

      let finalTranscript = liveCapturedText.trim();

      if (audioChunksRef.current.length > 0) {
        try {
          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm";
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          const res = await uploadAudio(decisionId, blob, {
            language: "en",
            clientTranscript: liveCapturedText.trim() || undefined,
          });
          if (res && res.transcript && res.transcript.trim()) {
            finalTranscript = res.transcript.trim();
          }
        } catch (uploadErr) {
          console.warn("Audio upload fallback to client transcript:", uploadErr);
        }
      }

      // Save transcript to decision
      if (finalTranscript) {
        try {
          await updateTranscript(decisionId, finalTranscript, true);
        } catch (e) {
          console.warn("Failed to update transcript:", e);
        }
      }

      // Append submitted caveats to decision description
      if (notesList.length > 0) {
        try {
          const notesSummary = notesList
            .map((n) => `[${n.category.toUpperCase()}] ${n.content} (${n.isAnonymous ? "Anonymous" : n.author})`)
            .join("\n");
          const existingDesc = decision?.description || "";
          const updatedDesc = existingDesc
            ? `${existingDesc}\n\n### Anonymous Meeting Risks & Constraints:\n${notesSummary}`
            : `### Anonymous Meeting Risks & Constraints:\n${notesSummary}`;
          await updateDecision(decisionId, { description: updatedDesc });
        } catch (e) {
          console.warn("Failed to update decision description:", e);
        }
      }

      // Redirect back to the decision page
      window.location.href = `/decisions/${decisionId}`;
    } catch (err) {
      console.error("Error ending meeting:", err);
      window.location.href = `/decisions/${decisionId}`;
    } finally {
      setIsFinishing(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const roomName = `DecisionLens-Room-${decisionId}`;
  const displayNameParam = currentUser?.name
    ? `&userInfo.displayName=${encodeURIComponent(currentUser.name)}`
    : "";
  const emailParam = currentUser?.email
    ? `&userInfo.email=${encodeURIComponent(currentUser.email)}`
    : "";
  const jitsiUrl = `https://meet.jit.si/${roomName}#config.startWithAudioMuted=false&config.prejoinPageEnabled=false&config.disableDeepLinking=true&config.enableClosePage=false${displayNameParam}${emailParam}`;

  return (
    <div
      data-theme={theme}
      className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${
        theme === "dark" ? "dark bg-[#181614] text-[#F0EAE1]" : "bg-[#F4F0E6] text-[#1d1d1b]"
      }`}
    >
      {/* Executive Boardroom Topbar */}
      <header className="h-14 border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#221F1C] px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/decisions/${decisionId}`}
            className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-[#7a4e10] dark:text-[#D4AA50] hover:underline shrink-0"
            title="Return to Decision Workspace"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Decision</span>
          </Link>

          <span className="text-[#cfc7b2] dark:text-[#38332C] hidden sm:inline">|</span>

          <div className="flex items-center gap-2 min-w-0 truncate">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-newsreader font-bold text-base sm:text-lg text-[#1d1d1b] dark:text-[#F0EAE1] truncate">
              {decision?.title || `Decision #${decisionId}`}
            </span>
            <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[#5c5549] dark:text-[#a89f91] shrink-0 hidden md:inline">
              Room: {roomName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <CelestialThemeToggle theme={theme} onToggle={toggleTheme} />

          <button
            type="button"
            onClick={handleGenerateTakeaways}
            disabled={isGeneratingTakeaways}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#F4F0E6] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg transition-colors cursor-pointer"
          >
            {isGeneratingTakeaways ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
            )}
            <span>Takeaways</span>
          </button>

          {/* Prominent End Meeting & Return Button */}
          <button
            type="button"
            onClick={handleEndMeetingAndReturn}
            disabled={isFinishing}
            className="px-3.5 sm:px-4 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
            title="End meeting, save notes and transcript, and redirect back to decision"
          >
            {isFinishing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving &amp; Returning...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>End Meeting &amp; Return →</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Boardroom Grid: Video Chamber (Left) + Silent Stakeholder Scribe (Right) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left Video Chamber (8 cols on lg / 8 cols on xl) */}
        <div className="lg:col-span-8 flex flex-col bg-black min-h-[500px] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-[#cfc7b2] dark:border-[#38332C] relative">
          <iframe
            src={jitsiUrl}
            allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
            className="w-full h-full min-h-[520px] flex-1 border-0"
            title="Live Boardroom Video Conference"
          />
        </div>

        {/* Right Silent Stakeholder Scribe Sidebar (4 cols) */}
        <div className="lg:col-span-4 bg-[#EDE7D6] dark:bg-[#221F1C] flex flex-col h-full overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Scribe Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#cfc7b2]/70 dark:border-[#38332C]/70">
            <div className="space-y-0.5">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
                Silent Stakeholder Scribe
              </span>
              <p className="text-[11px] text-[#5c5549] dark:text-[#a89f91]">
                Drop objections, risks, or tech constraints without seniority bias.
              </p>
            </div>

            <button
              type="button"
              onClick={isCapturingAudio ? stopLiveAudioCapture : startLiveAudioCapture}
              className={`p-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer inline-flex items-center gap-1 ${
                isCapturingAudio
                  ? "bg-rose-600 text-white border-rose-700 animate-pulse"
                  : "bg-[#F4F0E6] text-[#7a4e10] dark:bg-[#181614] dark:text-[#D4AA50] border-[#cfc7b2] dark:border-[#38332C]"
              }`}
              title={isCapturingAudio ? "Stop Audio Capture" : "Capture Tab Audio & Transcribe"}
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase">
                {isCapturingAudio ? formatTimer(captureDuration) : "Sync Audio"}
              </span>
            </button>
          </div>

          {/* Category Selector */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-[#5c5549] dark:text-[#a89f91] font-bold uppercase tracking-wider block">
              Category:
            </span>
            <div className="grid grid-cols-4 gap-1.5 text-xs font-mono font-bold uppercase tracking-wider">
              {(["risk", "constraint", "alternative", "criteria"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`py-1 rounded text-center text-[11px] transition-colors cursor-pointer border ${
                    category === cat
                      ? "bg-[#7a4e10] text-[#F5F1E8] dark:bg-[#D4AA50] dark:text-[#181614] border-[#7a4e10] dark:border-[#D4AA50]"
                      : "bg-[#F4F0E6] dark:bg-[#181614] text-[#5c5549] dark:text-[#a89f91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Authority Role Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#5c5549] dark:text-[#a89f91] font-bold uppercase tracking-wider">
              <span>Authority Role:</span>
              <span className="text-[#7a4e10] dark:text-[#D4AA50] font-bold">
                [{authorRole}]
              </span>
            </div>

            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
              {PRESET_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setAuthorRole(r);
                    setIsAddingCustomRole(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                    authorRole === r && !isAddingCustomRole
                      ? "bg-[#7a4e10] text-white dark:bg-[#D4AA50] dark:text-[#181614] border-[#7a4e10] dark:border-[#D4AA50]"
                      : "bg-[#F4F0E6] dark:bg-[#181614] text-[#5c5549] dark:text-[#a89f91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                  }`}
                >
                  {r}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setIsAddingCustomRole((prev) => !prev)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                  isAddingCustomRole
                    ? "bg-[#7a4e10] text-white border-[#7a4e10]"
                    : "bg-[#F4F0E6] dark:bg-[#181614] text-[#7a4e10] dark:text-[#D4AA50] border-[#cfc7b2] dark:border-[#38332C]"
                }`}
              >
                <Plus className="w-3 h-3" />
                <span>Custom</span>
              </button>
            </div>

            {isAddingCustomRole && (
              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  value={customRoleText}
                  onChange={(e) => setCustomRoleText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleApplyCustomRole();
                  }}
                  placeholder="e.g. VP Cloud, Core DBA..."
                  className="flex-1 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-mono px-2 py-1 text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#7a4e10] focus:outline-none rounded"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomRole}
                  disabled={!customRoleText.trim()}
                  className="px-2.5 py-1 bg-[#7a4e10] dark:bg-[#D4AA50] text-[#F5F1E8] dark:text-[#181614] text-[10px] font-mono font-bold uppercase rounded disabled:opacity-40"
                >
                  Set
                </button>
              </div>
            )}
          </div>

          {/* Caveat Textarea */}
          <div className="space-y-1">
            <textarea
              rows={3}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSubmitNote(e);
                }
              }}
              placeholder={
                category === "risk"
                  ? "E.g. Read-replicas have 800ms replication lag under peak traffic..."
                  : category === "constraint"
                  ? "E.g. We have strict Q3 data-residency compliance in Mumbai..."
                  : "Add technical note or trade-off (Ctrl+Enter to post)..."
              }
              className="w-full bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg p-2.5 text-xs text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors resize-none font-sans"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-[#5c5549] dark:text-[#a89f91] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="accent-[#7a4e10] dark:accent-[#D4AA50] cursor-pointer"
              />
              <span className="text-[11px]">Post anonymously</span>
            </label>

            <button
              type="button"
              onClick={handleSubmitNote}
              disabled={!noteContent.trim()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-[#7a4e10] hover:bg-[#603e0d] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F5F1E8] transition-colors shadow-2xs disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Send className="w-3 h-3" />
              <span>Add Caveat</span>
            </button>
          </div>

          {/* Live Transcript Stream Preview (if recording) */}
          {liveCapturedText && (
            <div className="p-2.5 rounded-lg bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-1">
              <span className="text-[10px] font-mono text-[#7a4e10] dark:text-[#D4AA50] font-bold uppercase flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" /> Live Meeting Transcript Stream:
              </span>
              <p className="text-xs font-sans text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed max-h-24 overflow-y-auto">
                {liveCapturedText}
                {liveInterimText && (
                  <span className="italic text-[#5c5549] dark:text-[#a89f91]"> {liveInterimText}</span>
                )}
              </p>
            </div>
          )}

          {/* Submitted Caveats Feed */}
          <div className="flex-1 space-y-2 pt-2 border-t border-[#cfc7b2]/70 dark:border-[#38332C]/70">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#5c5549] dark:text-[#a89f91] font-bold uppercase tracking-wider">
              <span>Submitted Caveats ({notesList.length})</span>
              <span className="text-[#7a4e10] dark:text-[#D4AA50] font-bold">● Live Synced</span>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {notesList.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#5c5549] dark:text-[#a89f91] italic font-sans">
                  No caveats submitted yet. As participants speak, drop unvetted assumptions or technical risks above.
                </div>
              ) : (
                notesList.map((n) => (
                  <div
                    key={n.id}
                    className="p-2.5 bg-[#F4F0E6] dark:bg-[#181614] rounded-lg border border-[#cfc7b2] dark:border-[#38332C] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                        [{n.category}]
                      </span>
                      <span className="text-[#5c5549] dark:text-[#a89f91]">
                        {n.author} • {n.timestamp}
                      </span>
                    </div>
                    <p className="text-[#1d1d1b] dark:text-[#F0EAE1] text-[11px] leading-snug font-sans">
                      {n.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Meeting Takeaways Modal */}
      {showTakeawaysModal && (
        <MeetingTakeawaysModal
          isOpen={showTakeawaysModal}
          onClose={() => setShowTakeawaysModal(false)}
          takeaways={takeawaysData}
          loading={isGeneratingTakeaways}
        />
      )}
    </div>
  );
}
