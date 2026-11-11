"use client";

import React, { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Radio,
  Lock,
  Send,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  Loader2,
  Upload,
  Volume2,
  FileText,
  Copy,
  Trash2,
  ShieldCheck,
  Headphones,
  Check,
  AlertCircle,
  ExternalLink,
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

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  risk: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-800",
    label: "Risk / Flaw",
  },
  constraint: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
    label: "Hard Constraint",
  },
  alternative: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    label: "Alternative",
  },
  criteria: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-800",
    label: "Decision Criteria",
  },
};

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
  const [audioSourceMode, setAudioSourceMode] = useState<"mic" | "tab">("mic");
  const [captureDuration, setCaptureDuration] = useState(0);
  const [liveCapturedText, setLiveCapturedText] = useState("");
  const [liveInterimText, setLiveInterimText] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Takeaways Modal state
  const [showTakeawaysModal, setShowTakeawaysModal] = useState(false);
  const [takeawaysData, setTakeawaysData] = useState<MeetingTakeawaysResponse | null>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  // Audio refs
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const storageKey = `decisionlens_caveats_${decisionId}`;

  // Fetch Decision and User on mount
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getDecision(decisionId).catch(() => null),
      getMe().catch(() => null),
    ]).then(([dec, user]) => {
      if (!isMounted) return;
      if (dec) {
        setDecision(dec);
        // Pre-populate transcript if decision already has one
        if (dec.transcript && dec.transcript.trim()) {
          setLiveCapturedText(dec.transcript.trim());
        }
      }
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

  // Scroll transcript to bottom when text updates
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveCapturedText, liveInterimText]);

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

  const handleDeleteNote = (id: string) => {
    const updated = notesList.filter((n) => n.id !== id);
    setNotesList(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (_) {}
  };

  // Start live microphone capture (Direct user mic, no screen-share prompt needed)
  const startLiveMicCapture = async () => {
    setCaptureError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support microphone capture. Please use Chrome, Edge, or Firefox.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setupAudioStreamAndRecognition(stream, "mic");
    } catch (err: unknown) {
      setCaptureError(err instanceof Error ? err.message : "Microphone permission denied.");
      setIsCapturingAudio(false);
    }
  };

  // Start meeting tab audio capture (For Google Meet / Zoom tab in browser)
  const startMeetingTabCapture = async () => {
    setCaptureError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Your browser does not support tab audio capture. Please use Chrome or Edge.");
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTrack = displayStream.getAudioTracks()[0];
      if (!audioTrack) {
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error("No audio track detected. Make sure to toggle 'Share tab audio' in your browser prompt.");
      }

      setupAudioStreamAndRecognition(displayStream, "tab");
    } catch (err: unknown) {
      setCaptureError(err instanceof Error ? err.message : "Failed to capture meeting tab audio.");
      setIsCapturingAudio(false);
    }
  };

  const setupAudioStreamAndRecognition = (stream: MediaStream, mode: "mic" | "tab") => {
    audioStreamRef.current = stream;
    audioChunksRef.current = [];
    setIsCapturingAudio(true);
    setAudioSourceMode(mode);
    setCaptureDuration(0);

    captureTimerRef.current = setInterval(() => {
      setCaptureDuration((prev) => prev + 1);
    }, 1000);

    // Setup MediaRecorder for backend Whisper transcription
    try {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mediaRec = new MediaRecorder(stream, { mimeType });
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

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onended = () => {
        stopLiveAudioCapture();
      };
    }

    // Setup Web Speech API for immediate live text preview
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

  // Upload meeting recording file directly
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setCaptureError(null);
    try {
      const res = await uploadAudio(decisionId, file, { language: "en" });
      if (res && res.transcript) {
        setLiveCapturedText((prev) => (prev ? `${prev}\n\n${res.transcript}` : res.transcript));
      }
    } catch (err: unknown) {
      setCaptureError(err instanceof Error ? err.message : "Audio upload failed.");
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCopyTranscript = () => {
    if (!liveCapturedText.trim()) return;
    navigator.clipboard.writeText(liveCapturedText);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
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

      // If audio chunks were recorded, upload blob to Whisper backend
      if (audioChunksRef.current.length > 0) {
        try {
          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm";
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          const res = await uploadAudio(decisionId, blob, { language: "en" });
          if (res && res.transcript) {
            finalTranscript = (finalTranscript + " " + res.transcript).trim();
          }
        } catch (audioErr) {
          console.warn("Background audio upload fallback:", audioErr);
        }
      }

      // Format notes into structured markdown appendix
      const formattedNotes =
        notesList.length > 0
          ? `\n\n### Stakeholder Caveats & Objections Log:\n` +
            notesList
              .map(
                (n) =>
                  `- **[${n.category.toUpperCase()}]** (${n.author}): ${n.content}`
              )
              .join("\n")
          : "";

      const fullDeliberationRecord = `${finalTranscript}${formattedNotes}`.trim();

      if (fullDeliberationRecord) {
        await updateTranscript(decisionId, fullDeliberationRecord);
      }

      router.push(`/decisions/${decisionId}`);
    } catch (err) {
      console.error("Error finalizing deliberation:", err);
      router.push(`/decisions/${decisionId}`);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const wordCount = liveCapturedText ? liveCapturedText.trim().split(/\s+/).length : 0;

  return (
    <div
      data-theme={theme}
      className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${
        theme === "dark" ? "dark bg-[#181614] text-[#F0EAE1]" : "bg-[#F5F1E8] text-[#1d1d1b]"
      }`}
    >
      {/* Topbar: Executive Navigation & Status */}
      <header className="h-14 border-b border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#221F1C] px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs z-30">
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
            <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-[#F5F1E8] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] shrink-0 font-bold hidden md:inline">
              Deliberation Companion
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <CelestialThemeToggle theme={theme} onToggle={toggleTheme} />

          <button
            type="button"
            onClick={handleGenerateTakeaways}
            disabled={isGeneratingTakeaways}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#F5F1E8] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg transition-colors cursor-pointer"
          >
            {isGeneratingTakeaways ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
            )}
            <span>Takeaways</span>
          </button>

          {/* End Meeting & Return Button */}
          <button
            type="button"
            onClick={handleEndMeetingAndReturn}
            disabled={isFinishing}
            className="px-3.5 sm:px-4 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-[#1d1d1b] hover:bg-[#2C2723] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[#F5F1E8] shadow-sm transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
            title="End deliberation, save transcript and caveats, and return to decision workflow"
          >
            {isFinishing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>End Deliberation &amp; Return →</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Deliberation Companion: Live Audio Feed (Left) + Silent Stakeholder Scribe (Right) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden bg-executive-grid">
        {/* Left Column: Live Audio Stream, Speech-to-Text & Evidence Feed (7 cols) */}
        <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-[#cfc7b2] dark:border-[#38332C] bg-[#F5F1E8]/90 dark:bg-[#181614]/90 p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Companion Banner */}
          <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-4 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                  Deliberation Companion Mode
                </h2>
              </div>
              <p className="text-sm font-newsreader text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug">
                Runs silently alongside your <strong>Google Meet, Zoom, or Teams</strong> call to capture evidence, transcribe technical debates, and surface hidden risks.
              </p>
            </div>

            <div className="shrink-0 text-right">
              <span className="text-[11px] font-mono text-[#5c5549] dark:text-[#a89f91] block">Duration</span>
              <span className="text-lg font-mono font-bold text-[#1d1d1b] dark:text-[#F0EAE1] tabular-nums">
                {formatTimer(captureDuration)}
              </span>
            </div>
          </div>

          {/* Audio Capture Controls */}
          <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                  Audio Intelligence Engine
                </span>
                <span className="text-xs text-[#5c5549] dark:text-[#a89f91]">
                  {isCapturingAudio
                    ? `Listening via ${audioSourceMode === "mic" ? "Microphone" : "Meeting Tab"}...`
                    : "Ready to capture meeting voice arguments."}
                </span>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {isCapturingAudio ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 animate-pulse">
                    <Radio className="w-3.5 h-3.5" />
                    Live Capturing
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-[#F5F1E8] dark:bg-[#181614] text-[#5c5549] dark:text-[#a89f91] border border-[#cfc7b2] dark:border-[#38332C]">
                    Standby
                  </span>
                )}
              </div>
            </div>

            {/* Main Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Primary Mic Button */}
              <button
                type="button"
                onClick={isCapturingAudio ? stopLiveAudioCapture : startLiveMicCapture}
                className={`flex items-center justify-center gap-2.5 h-12 px-4 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm ${
                  isCapturingAudio && audioSourceMode === "mic"
                    ? "bg-rose-700 hover:bg-rose-800 text-white animate-pulse"
                    : "bg-[#1d1d1b] hover:bg-[#2C2723] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] text-[#F5F1E8] dark:text-[#181614]"
                }`}
              >
                {isCapturingAudio && audioSourceMode === "mic" ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>Pause Live Mic Capture</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-[#D4AA50] dark:text-[#181614]" />
                    <span>Start Live Mic Capture</span>
                  </>
                )}
              </button>

              {/* Secondary Tab Audio Button */}
              <button
                type="button"
                onClick={isCapturingAudio ? stopLiveAudioCapture : startMeetingTabCapture}
                className={`flex items-center justify-center gap-2 h-12 px-4 rounded-xl text-xs font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  isCapturingAudio && audioSourceMode === "tab"
                    ? "bg-rose-700 text-white border-rose-800 animate-pulse"
                    : "bg-[#F5F1E8] dark:bg-[#181614] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] border-[#cfc7b2] dark:border-[#38332C]"
                }`}
                title="Capture audio directly from a Google Meet / Zoom Chrome tab"
              >
                <Headphones className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <span>Share Meeting Tab Audio</span>
              </button>
            </div>

            {/* Upload File Fallback */}
            <div className="pt-2 border-t border-[#cfc7b2]/60 dark:border-[#38332C] flex items-center justify-between text-xs text-[#5c5549] dark:text-[#a89f91]">
              <span className="font-mono text-[11px]">Or import pre-recorded meeting audio:</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
                id="meeting-audio-upload"
              />
              <label
                htmlFor="meeting-audio-upload"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#cfc7b2] dark:border-[#38332C] bg-[#F5F1E8] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] hover:bg-[#E5DEC9] font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
              >
                {isUploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{isUploadingFile ? "Transcribing..." : "Upload Recording (.mp3, .wav)"}</span>
              </label>
            </div>

            {captureError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{captureError}</span>
              </div>
            )}
          </div>

          {/* Real-time Streaming Transcript Chamber */}
          <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl flex flex-col flex-1 shadow-2xs overflow-hidden min-h-[340px]">
            {/* Transcript Card Header */}
            <div className="flex items-center justify-between px-5 h-12 border-b border-[#cfc7b2] dark:border-[#38332C] shrink-0 bg-[#E5DEC9]/40 dark:bg-[#1A1816]/40">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1]">
                  Live Deliberation Transcript
                </span>
                <span className="text-[10px] font-mono text-[#5c5549] dark:text-[#a89f91]">
                  ({wordCount} words)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  disabled={!liveCapturedText.trim()}
                  className="px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase tracking-wider border border-[#cfc7b2] dark:border-[#38332C] bg-[#F5F1E8] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] hover:bg-[#E5DEC9] transition-colors cursor-pointer inline-flex items-center gap-1 disabled:opacity-40"
                  title="Copy full transcript"
                >
                  {copiedTranscript ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedTranscript ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            {/* Transcript Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-3 font-newsreader text-base text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed">
              {!liveCapturedText && !liveInterimText ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 text-[#5c5549] dark:text-[#a89f91] space-y-2">
                  <Volume2 className="w-8 h-8 opacity-40 text-[#7a4e10] dark:text-[#D4AA50]" />
                  <p className="font-sans text-sm max-w-sm">
                    No speech recorded yet. Start live mic capture or tab audio to transcribe your meeting discussion.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 whitespace-pre-wrap">
                  {liveCapturedText}
                  {liveInterimText && (
                    <span className="italic text-[#7a4e10] dark:text-[#D4AA50] opacity-80">
                      {" "}{liveInterimText}
                    </span>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: The Silent Stakeholder Scribe (5 cols) */}
        <div className="lg:col-span-5 bg-[#EDE7D6] dark:bg-[#221F1C] flex flex-col h-full overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Scribe Header */}
          <div className="pb-3 border-b border-[#cfc7b2] dark:border-[#38332C]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                Silent Stakeholder Scribe
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-bold">
                Anti-Seniority Bias
              </span>
            </div>
            <p className="text-xs text-[#5c5549] dark:text-[#a89f91] mt-1 font-sans">
              Drop critical tech objections, risks, or compliance constraints without fear of corporate hierarchy.
            </p>
          </div>

          {/* Scribe Submission Form */}
          <form onSubmit={handleSubmitNote} className="space-y-4 font-sans text-xs">
            {/* Category Selector */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono text-[#5c5549] dark:text-[#a89f91] font-bold uppercase tracking-wider block">
                Objection Category:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-mono font-bold uppercase tracking-wider">
                {(["risk", "constraint", "alternative", "criteria"] as const).map((cat) => {
                  const meta = CATEGORY_COLORS[cat];
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`py-2 rounded-xl text-center text-[11px] transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-[#1d1d1b] dark:bg-[#D4AA50] text-[#F5F1E8] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50] shadow-sm font-bold"
                          : "bg-[#F5F1E8] dark:bg-[#181614] text-[#5c5549] dark:text-[#a89f91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Authority Role Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#5c5549] dark:text-[#a89f91] font-bold uppercase tracking-wider">
                <span>Authority Role:</span>
                <span className="text-[#7a4e10] dark:text-[#D4AA50]">
                  [{authorRole}]
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-0.5">
                {PRESET_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setAuthorRole(r);
                      setIsAddingCustomRole(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                      authorRole === r && !isAddingCustomRole
                        ? "bg-[#7a4e10] text-white dark:bg-[#D4AA50] dark:text-[#181614] border-[#7a4e10] dark:border-[#D4AA50]"
                        : "bg-[#F5F1E8] dark:bg-[#181614] text-[#5c5549] dark:text-[#a89f91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                    }`}
                  >
                    {r}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setIsAddingCustomRole((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                    isAddingCustomRole
                      ? "bg-[#7a4e10] text-white border-[#7a4e10]"
                      : "bg-[#F5F1E8] dark:bg-[#181614] text-[#7a4e10] dark:text-[#D4AA50] border-[#cfc7b2] dark:border-[#38332C]"
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  <span>Custom Role</span>
                </button>
              </div>

              {isAddingCustomRole && (
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={customRoleText}
                    onChange={(e) => setCustomRoleText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyCustomRole();
                    }}
                    placeholder="e.g. Lead SRE, Security Auditor, DBA..."
                    className="flex-1 bg-[#F5F1E8] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-mono px-3 py-1.5 text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#7a4e10] focus:outline-none rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustomRole}
                    disabled={!customRoleText.trim()}
                    className="px-3 py-1.5 bg-[#7a4e10] dark:bg-[#D4AA50] text-[#F5F1E8] dark:text-[#181614] text-[10px] font-mono font-bold uppercase rounded-lg disabled:opacity-40"
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
                    ? "E.g. Read-replicas experience 800ms lag under peak write traffic during promotions..."
                    : category === "constraint"
                    ? "E.g. DPDP Act requires strict data residency within Mumbai cloud region..."
                    : "Add technical caveat or trade-off (Ctrl+Enter to post)..."
                }
                className="w-full bg-[#F5F1E8] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-xl p-3 text-sm text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors resize-none font-sans"
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
                <span className="text-[11px] font-mono">Post anonymously</span>
              </label>

              <button
                type="submit"
                disabled={!noteContent.trim()}
                className="px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#1d1d1b] hover:bg-[#2C2723] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F5F1E8] transition-all shadow-xs disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Add Caveat</span>
              </button>
            </div>
          </form>

          {/* Submitted Caveats Feed */}
          <div className="flex-1 space-y-3 pt-3 border-t border-[#cfc7b2] dark:border-[#38332C]">
            <div className="flex items-center justify-between text-xs font-mono text-[#5c5549] dark:text-[#a89f91] font-bold uppercase tracking-wider">
              <span>Submitted Caveats ({notesList.length})</span>
              <span className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Real-time Synced
              </span>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {notesList.length === 0 ? (
                <div className="text-center py-10 text-xs text-[#5c5549] dark:text-[#a89f91] italic font-sans border border-dashed border-[#cfc7b2] dark:border-[#38332C] rounded-xl p-6">
                  No caveats submitted yet. As participants deliberate, drop unvetted assumptions or technical risks above.
                </div>
              ) : (
                notesList.map((n) => {
                  const meta = CATEGORY_COLORS[n.category] || CATEGORY_COLORS.risk;
                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-xl border ${meta.border} ${meta.bg} text-xs space-y-1.5 shadow-2xs group relative`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className={`font-bold uppercase tracking-wider ${meta.text}`}>
                          [{n.category}]
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[#5c5549] dark:text-[#a89f91]">
                            {n.author} • {n.timestamp}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="opacity-0 group-hover:opacity-100 text-[#7B8491] hover:text-rose-600 transition-opacity p-0.5"
                            title="Delete note"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[#1d1d1b] dark:text-[#F0EAE1] text-xs leading-relaxed font-sans">
                        {n.content}
                      </p>
                    </div>
                  );
                })
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
