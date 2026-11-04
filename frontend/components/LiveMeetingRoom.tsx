"use client";

import WorkspaceMembersPill from "@/components/WorkspaceMembersPill";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Video,
  Mic,
  Lock,
  Send,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Radio,
  Loader2,
  Plus,
  Maximize2,
  Minimize2,
  Pin,
  Sparkles,
} from "lucide-react";
import { getMe, uploadAudio, getMeetingTakeaways, MeetingTakeawaysResponse } from "@/lib/api";
import MeetingTakeawaysModal from "@/components/MeetingTakeawaysModal";

interface LiveMeetingRoomProps {
  decisionId: number;
  decisionTitle: string;
  onFinishMeeting: (data?: {
    notes: SilentNote[];
    criteriaWeights: { speed: number; cost: number; reliability: number };
    transcript?: string;
  }) => void;
  recordType?: string;
}

export interface SilentNote {
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

export default function LiveMeetingRoom({
  decisionId,
  decisionTitle,
  onFinishMeeting,
  recordType = "decision",
}: LiveMeetingRoomProps) {
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);
  const [callProvider, setCallProvider] = useState<"custom" | "jitsi">("custom");
  const [customMeetingUrl, setCustomMeetingUrl] = useState("");
  const [isJitsiLaunched, setIsJitsiLaunched] = useState(false);
  const [category, setCategory] = useState<"risk" | "constraint" | "alternative" | "criteria">("risk");
  const [noteContent, setNoteContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);

  // Dynamic & Custom Role System
  const [authorRole, setAuthorRole] = useState<string>("DevOps / SRE");
  const [isAddingCustomRole, setIsAddingCustomRole] = useState(false);
  const [customRoleText, setCustomRoleText] = useState("");

  // Live Automated Audio Capture states
  const [isCapturingAudio, setIsCapturingAudio] = useState(false);
  const [captureDuration, setCaptureDuration] = useState(0);
  const [liveCapturedText, setLiveCapturedText] = useState("");
  const [liveInterimText, setLiveInterimText] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Meeting Takeaways state
  const [showTakeawaysModal, setShowTakeawaysModal] = useState(false);
  const [takeawaysData, setTakeawaysData] = useState<MeetingTakeawaysResponse | null>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  // Picture-in-Picture (Always-on-Top) state
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<any>(null);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  const storageKey = `decisionlens_caveats_${decisionId}`;

  // Initial demo or saved notes
  const [notesList, setNotesList] = useState<SilentNote[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`decisionlens_caveats_${decisionId}`);
        if (saved) return JSON.parse(saved);
      } catch (_) {}
    }
    return [
      {
        id: "note-demo-1",
        category: "risk",
        content: "[DevOps / SRE] Cold-start latency in private VPC could breach our 200ms P99 SLA.",
        author: "Sneha (DevOps / SRE)",
        isAnonymous: false,
        timestamp: "Just now",
      },
    ];
  });

  // Sync with localStorage changes across windows/tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          setNotesList(JSON.parse(e.newValue));
        } catch (_) {}
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  // Auto-fetch user profile
  useEffect(() => {
    getMe()
      .then((user) => {
        if (user) {
          const name = user.display_name || user.email.split("@")[0];
          setCurrentUser({ name, email: user.email });
        }
      })
      .catch(() => {});
  }, []);

  // Cleanup on unmount
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
      if (pipWindowRef.current) {
        try {
          pipWindowRef.current.close();
        } catch (_) {}
      }
    };
  }, []);

  const roomName = `DecisionLens-Room-${decisionId}`;
  const displayNameParam = currentUser?.name
    ? `&userInfo.displayName=${encodeURIComponent(currentUser.name)}`
    : "";
  const emailParam = currentUser?.email
    ? `&userInfo.email=${encodeURIComponent(currentUser.email)}`
    : "";
  const jitsiUrl = `https://meet.jit.si/${roomName}#config.startWithAudioMuted=false&config.prejoinPageEnabled=false&config.disableDeepLinking=true${displayNameParam}${emailParam}`;

  const [speedWeight] = useState(40);
  const [costWeight] = useState(20);
  const [reliabilityWeight] = useState(40);

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

  // Toggle Document Picture-in-Picture (Always-on-Top Floating Scribe)
  const togglePictureInPicture = async () => {
    if (pipContainer) {
      if (pipWindowRef.current) {
        pipWindowRef.current.close();
        pipWindowRef.current = null;
      }
      setPipContainer(null);
      return;
    }

    // Check for native Document Picture-in-Picture support (Chromium/Edge)
    if (typeof window !== "undefined" && "documentPictureInPicture" in window) {
      try {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 420,
          height: 600,
        });
        pipWindowRef.current = pipWindow;

        // Copy styles
        Array.from(document.styleSheets).forEach((sheet) => {
          try {
            const rules = Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join("");
            const style = document.createElement("style");
            style.textContent = rules;
            pipWindow.document.head.appendChild(style);
          } catch (e) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = sheet.type;
            if (sheet.media?.mediaText) link.media = sheet.media.mediaText;
            if (sheet.href) link.href = sheet.href;
            pipWindow.document.head.appendChild(link);
          }
        });

        pipWindow.document.body.className =
          "bg-[#EDE7D6] text-[#1d1d1b] dark:bg-[#181614] dark:text-[#F0EAE1] font-courier p-3 m-0 overflow-y-auto";

        pipWindow.addEventListener("pagehide", () => {
          setPipContainer(null);
          pipWindowRef.current = null;
        });

        setPipContainer(pipWindow.document.body);
        return;
      } catch (err) {
        console.warn("Document Picture-in-Picture request failed, opening companion popup:", err);
      }
    }

    // Fallback: dedicated companion window popup
    window.open(
      `/decisions/${decisionId}/scribe-companion`,
      "ScribeCompanion",
      "width=420,height=600,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
    );
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
        agenda: decisionTitle,
      });
      setTakeawaysData(res);
    } catch (err) {
      console.warn("Could not generate meeting takeaways:", err);
    } finally {
      setIsGeneratingTakeaways(false);
    }
  };

  const handleFinishCall = async () => {
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

      onFinishMeeting({
        notes: notesList,
        criteriaWeights: {
          speed: speedWeight,
          cost: costWeight,
          reliability: reliabilityWeight,
        },
        transcript: finalTranscript,
      });
    } finally {
      setIsFinishing(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Reusable Scribe Form component rendered in Main Cockpit or Always-on-Top Floating PiP
  const renderScribeContent = (isFloating: boolean = false) => (
    <div className={`space-y-4 ${isFloating ? "p-1" : ""}`}>
      {/* Scribe Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
            Silent Stakeholder Scribe
          </span>
          <p className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
            Drop objections, risks, or tech constraints without seniority bias.
          </p>
        </div>

        {/* Float Always-on-Top Button */}
        {!isFloating && (
          <button
            type="button"
            onClick={togglePictureInPicture}
            title="Keep this scribe floating on top of Google Meet, Zoom, or your call without switching windows"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer shrink-0"
          >
            <Pin className="w-3 h-3 rotate-45 text-[#7a4e10] dark:text-[#D4AA50]" />
            <span>{pipContainer ? "Dock Scribe" : "Float on Call"}</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Category Pills */}
        <div className="space-y-1">
          <span className="text-[10px] text-[#4f4b40] dark:text-[#A89F91] font-bold uppercase tracking-wider block">
            Category:
          </span>
          <div className="grid grid-cols-4 gap-1.5 text-xs font-bold uppercase tracking-wider">
            {(["risk", "constraint", "alternative", "criteria"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`py-1.5 rounded-none border text-center text-xs transition-colors cursor-pointer ${
                  category === cat
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50]"
                    : "bg-[#EDE7D6] dark:bg-[#221F1C] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Extensible Role System (Presets + Custom Title Input) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-[#4f4b40] dark:text-[#A89F91] font-bold uppercase tracking-wider">
            <span>Authority Role:</span>
            <span className="text-[#7a4e10] dark:text-[#D4AA50] font-bold">
              [{authorRole}]
            </span>
          </div>

          {/* Preset Roles Cloud */}
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
            {PRESET_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setAuthorRole(r);
                  setIsAddingCustomRole(false);
                }}
                className={`px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  authorRole === r && !isAddingCustomRole
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50]"
                    : "bg-[#EDE7D6] dark:bg-[#221F1C] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                }`}
              >
                {r}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setIsAddingCustomRole((prev) => !prev)}
              className={`px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                isAddingCustomRole
                  ? "bg-[#7a4e10] text-white border-[#7a4e10]"
                  : "bg-[#EDE7D6] dark:bg-[#221F1C] text-[#7a4e10] dark:text-[#D4AA50] border-[#cfc7b2] dark:border-[#38332C]"
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Custom Role</span>
            </button>
          </div>

          {/* Custom Role Input Box */}
          {isAddingCustomRole && (
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={customRoleText}
                onChange={(e) => setCustomRoleText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyCustomRole();
                }}
                placeholder="Type title (e.g. VP Cloud, Core DBA, FinOps)..."
                className="flex-1 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-courier px-2 py-1 text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#7a4e10] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleApplyCustomRole}
                disabled={!customRoleText.trim()}
                className="px-3 py-1 bg-[#1d1d1b] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614] text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
              >
                Set
              </button>
            </div>
          )}
        </div>

        {/* Note Textarea */}
        <div className="relative">
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
                ? "E.g. Under peak p99 load, read-replicas experience 800ms replication lag..."
                : category === "constraint"
                ? "E.g. We have strict Q3 data-residency compliance in Mumbai..."
                : "Add technical note or trade-off (Press Ctrl+Enter to submit)..."
            }
            className="w-full bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-3 text-xs text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors resize-none font-newsreader text-sm"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-[#4f4b40] dark:text-[#A89F91] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="accent-[#7a4e10] dark:accent-[#D4AA50] cursor-pointer"
            />
            <span>Post anonymously</span>
          </label>

          <button
            type="button"
            onClick={handleSubmitNote}
            disabled={!noteContent.trim()}
            className="px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F4F0E6] transition-colors shadow-2xs disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Send className="w-3 h-3" />
            <span>Add Caveat</span>
          </button>
        </div>
      </div>

      {/* Submitted Notes Feed */}
      {notesList.length > 0 && (
        <div className="pt-3 border-t border-[#cfc7b2] dark:border-[#38332C] space-y-2">
          <div className="flex items-center justify-between text-[10px] text-[#4f4b40] dark:text-[#A89F91] font-bold uppercase tracking-wider">
            <span>Submitted Caveats ({notesList.length})</span>
            {isFloating && <span className="text-emerald-600 font-bold">● Live Synced</span>}
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {notesList.map((n) => (
              <div
                key={n.id}
                className="p-2.5 bg-[#EDE7D6] dark:bg-[#221F1C] rounded-none border border-[#cfc7b2] dark:border-[#38332C] text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                    [{n.category}]
                  </span>
                  <span className="text-[#4f4b40] dark:text-[#A89F91]">
                    {n.author} • {n.timestamp}
                  </span>
                </div>
                <p className="text-[#1d1d1b] dark:text-[#F0EAE1] text-[11px] leading-snug">
                  {n.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] rounded-none p-5 sm:p-7 shadow-2xs space-y-6 transition-colors">
      {/* Studio Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#cfc7b2]/70 dark:border-[#38332C]/70">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
              Live Deliberation & Silent Scribe Studio
            </h2>
          </div>
          <p className="text-xs font-courier text-[#4f4b40] dark:text-[#A89F91]">
            Side-by-side call cockpit: observe live discussion on the left, record private objections on the right with zero window switching.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap font-courier">
          <WorkspaceMembersPill decisionId={decisionId} currentUserEmail={currentUser?.email} />

          {/* Mode Switcher */}
          <div className="bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] flex text-xs font-bold uppercase tracking-wider rounded-none">
            <button
              type="button"
              onClick={() => setCallProvider("custom")}
              className={`px-3 py-1.5 transition-colors cursor-pointer rounded-none ${
                callProvider === "custom"
                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                  : "text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1]"
              }`}
            >
              Google Meet / Zoom
            </button>
            <button
              type="button"
              onClick={() => setCallProvider("jitsi")}
              className={`px-3 py-1.5 transition-colors cursor-pointer rounded-none ${
                callProvider === "jitsi"
                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                  : "text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1]"
              }`}
            >
              In-App Video Room
            </button>
          </div>

          {/* Company Meeting Takeaways Trigger */}
          <button
            type="button"
            onClick={handleGenerateTakeaways}
            disabled={isGeneratingTakeaways}
            title="Generate executive meeting takeaways, action matrix, and company memos"
            className="px-3.5 py-2 rounded-none text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            {isGeneratingTakeaways ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
            )}
            <span>Meeting Takeaways</span>
          </button>

          <button
            type="button"
            onClick={handleFinishCall}
            disabled={isFinishing}
            className="px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {isFinishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 dark:text-[#181614]" />
            )}
            <span>Save & Proceed →</span>
          </button>
        </div>
      </div>

      {/* Main Studio View: True Side-by-Side Cockpit (Left = Call, Right = Scribe) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 font-courier items-stretch">
        {/* Left Column: Call Connection, In-App Video or Google Meet Audio Sync (7 cols lg / 8 cols xl) */}
        <div className="lg:col-span-7 xl:col-span-7 space-y-4 flex flex-col justify-between">
          {callProvider === "jitsi" ? (
            isJitsiLaunched ? (
              /* Active In-Page Jitsi Video Frame (Side-by-side with scribe) */
              <div className="bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] p-3 rounded-none flex-1 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                    Video Chamber · Room: {roomName}
                  </span>
                  <div className="flex items-center gap-3">
                    <a
                      href={jitsiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#7a4e10] dark:text-[#D4AA50] font-bold uppercase inline-flex items-center gap-1 hover:underline"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Dedicated Tab</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsJitsiLaunched(false)}
                      className="text-[11px] text-rose-700 dark:text-rose-400 font-bold uppercase hover:underline cursor-pointer"
                    >
                      Close Chamber
                    </button>
                  </div>
                </div>

                {/* Video canvas fills available space side-by-side */}
                <div className="w-full flex-1 aspect-video min-h-[460px] lg:min-h-[520px] bg-black rounded-none overflow-hidden border border-[#cfc7b2] dark:border-[#38332C]">
                  <iframe
                    src={jitsiUrl}
                    allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
                    className="w-full h-full border-0"
                    title="Live Decision Video Conference"
                  />
                </div>
              </div>
            ) : (
              /* Jitsi Launch Card */
              <div className="p-6 bg-[#F4F0E6] dark:bg-[#181614] rounded-none border border-[#cfc7b2] dark:border-[#38332C] text-center space-y-4 flex-1 flex flex-col justify-center items-center">
                <div className="w-12 h-12 rounded-none bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] flex items-center justify-center mx-auto shadow-2xs">
                  <Video className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-newsreader text-xl text-[#1d1d1b] dark:text-[#F0EAE1]">
                    Private Video Room: {roomName}
                  </h4>
                  <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] max-w-md mx-auto">
                    Launch directly beside your Silent Scribe. Both remain in the same window at 100% scale so you never lose conversational context.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsJitsiLaunched(true)}
                    className="px-5 py-2.5 rounded-none bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F4F0E6] font-bold text-xs uppercase tracking-wider shadow-2xs transition-colors cursor-pointer"
                  >
                    Launch Side-by-Side Video
                  </button>
                  <a
                    href={jitsiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 rounded-none bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1] font-bold text-xs uppercase tracking-wider border border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>Open Standalone Tab</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )
          ) : (
            /* Google Meet / Zoom Tab Audio Sync */
            <div className="p-5 bg-[#F4F0E6] dark:bg-[#181614] rounded-none border border-[#cfc7b2] dark:border-[#38332C] space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
                    Connect Active Google Meet or Zoom Call
                  </span>
                  <p className="text-[11px] text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                    Paste meeting URL to launch, or use <strong>Float Scribe on Call</strong> to keep your private caveat scratchpad floating over your call window!
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customMeetingUrl}
                    onChange={(e) => setCustomMeetingUrl(e.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij or Zoom link"
                    className="flex-1 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] rounded-none px-3.5 py-2 text-xs focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                  />
                  {customMeetingUrl && (
                    <a
                      href={customMeetingUrl.startsWith("http") ? customMeetingUrl : `https://${customMeetingUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-none bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F4F0E6] font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <span>Join Call</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {/* Tab Audio Sync Trigger */}
                <div className="p-4 bg-[#EDE7D6] dark:bg-[#221F1C] rounded-none border border-[#cfc7b2] dark:border-[#38332C] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Radio className={`w-4 h-4 ${isCapturingAudio ? "text-rose-600 animate-pulse" : "text-[#7a4e10] dark:text-[#D4AA50]"}`} />
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                          Tab Audio Sync
                        </span>
                        <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
                          {isCapturingAudio
                            ? `Recording dialogue: ${formatTimer(captureDuration)}`
                            : "Captures call audio directly without meeting bot invites"}
                        </span>
                      </div>
                    </div>

                    {isCapturingAudio ? (
                      <button
                        type="button"
                        onClick={stopLiveAudioCapture}
                        className="px-4 py-2 rounded-none bg-rose-800 hover:bg-rose-900 text-[#F4F0E6] font-bold text-xs uppercase tracking-wider shadow-2xs transition-colors cursor-pointer"
                      >
                        Stop Capture
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startLiveAudioCapture}
                        className="px-4 py-2 rounded-none bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F4F0E6] font-bold text-xs uppercase tracking-wider shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>Start Tab Audio Sync</span>
                      </button>
                    )}
                  </div>

                  {captureError && (
                    <div className="p-2.5 bg-red-950/10 dark:bg-red-950/40 text-red-800 dark:text-red-300 rounded-none text-xs flex items-center gap-2 border border-red-400 dark:border-red-900">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{captureError}</span>
                    </div>
                  )}

                  {/* Live Speech Preview */}
                  <div className="p-3 bg-[#F4F0E6] dark:bg-[#181614] rounded-none border border-[#cfc7b2] dark:border-[#38332C] text-xs min-h-[60px] max-h-[120px] overflow-y-auto">
                    {liveCapturedText ? (
                      <p className="text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed font-mono text-[11px]">
                        {liveCapturedText}
                        {liveInterimText && <span className="opacity-60 italic"> {liveInterimText}</span>}
                      </p>
                    ) : isCapturingAudio ? (
                      <span className="text-[#7a4e10] dark:text-[#D4AA50] font-bold uppercase tracking-wider italic flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        Listening to meeting dialogue...
                      </span>
                    ) : (
                      <span className="text-[#4f4b40] dark:text-[#A89F91] italic">
                        Speech transcript will stream here once Tab Audio Sync starts.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Silent Scribe & Role System (Permanently Docked Side-by-Side, 5 cols lg / 5 cols xl) */}
        <div className="lg:col-span-5 xl:col-span-5 bg-[#F4F0E6] dark:bg-[#181614] p-5 rounded-none border border-[#cfc7b2] dark:border-[#38332C] flex flex-col justify-between">
          {pipContainer ? (
            <div className="p-4 text-center space-y-3 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] my-auto">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                  Scribe Floating Always-on-Top Over Your Call
                </h4>
                <p className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
                  Your private feedback scratchpad is floating directly on top of your Google Meet or Zoom window.
                </p>
              </div>
              <button
                type="button"
                onClick={togglePictureInPicture}
                className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] rounded-none cursor-pointer"
              >
                Dock Back to Canvas
              </button>
            </div>
          ) : (
            renderScribeContent(false)
          )}
        </div>
      </div>

      {/* Picture-in-Picture Portal */}
      {pipContainer && createPortal(renderScribeContent(true), pipContainer)}

      {/* Company Meeting Takeaways Modal */}
      <MeetingTakeawaysModal
        isOpen={showTakeawaysModal}
        onClose={() => setShowTakeawaysModal(false)}
        takeaways={takeawaysData}
        loading={isGeneratingTakeaways}
      />
    </div>
  );
}
