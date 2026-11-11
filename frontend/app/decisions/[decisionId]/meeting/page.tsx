"use client";

import React, { useState, useEffect, useRef, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
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
  Users,
  Monitor,
  Share2,
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

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
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

  // Chamber Mode: Companion Mode vs In-App Live Call
  const [chamberMode, setChamberMode] = useState<"companion" | "inapp">("companion");

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
  const [copiedLink, setCopiedLink] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Native In-App WebRTC Video Call State
  const [isInCall, setIsInCall] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remotePeerConnected, setRemotePeerConnected] = useState(false);
  const [callPeerCount, setCallPeerCount] = useState(1);

  // Takeaways Modal state
  const [showTakeawaysModal, setShowTakeawaysModal] = useState(false);
  const [takeawaysData, setTakeawaysData] = useState<MeetingTakeawaysResponse | null>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  // Terms of Deliberation & Privacy Modal (DPDP Act 2023 & Liability Cap)
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Audio / WebRTC refs
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Video refs for in-app call
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const storageKey = `decisionlens_caveats_${decisionId}`;
  const roomName = `decision-${decisionId}`;

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

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveCapturedText, liveInterimText]);

  // Cleanup all media streams on unmount
  useEffect(() => {
    return () => {
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
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
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socketRef.current) {
        socketRef.current.close();
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

  // ==========================================
  // NATIVE WEBRTC IN-APP VIDEO ENGINE
  // ==========================================

  const startInAppCall = async () => {
    setCaptureError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setIsInCall(true);
      setIsCameraOn(true);
      setIsMicOn(true);

      // Start duration counter
      if (!isCapturingAudio) {
        setCaptureDuration(0);
        captureTimerRef.current = setInterval(() => {
          setCaptureDuration((prev) => prev + 1);
        }, 1000);
      }

      // Connect signaling WebSocket
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.hostname}:8000/ws/meeting/${roomName}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote track
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setRemotePeerConnected(true);
        }
      };

      // Send local ICE candidates to remote peers
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "peer-joined") {
            setCallPeerCount(msg.peerCount || 2);
            // Create offer for the new peer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "offer", sdp: offer }));
          } else if (msg.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: "answer", sdp: answer }));
          } else if (msg.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          } else if (msg.type === "candidate") {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } else if (msg.type === "peer-left") {
            setCallPeerCount(msg.peerCount || 1);
            if (msg.peerCount <= 1) {
              setRemotePeerConnected(false);
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            }
          }
        } catch (err) {
          console.warn("Signaling error:", err);
        }
      };

      // Also pipe audio to Web Speech recognition for real-time transcription
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        setupSpeechRecognition();
      }
    } catch (err: unknown) {
      setCaptureError(err instanceof Error ? err.message : "Failed to access camera or microphone.");
      setIsInCall(false);
    }
  };

  const endInAppCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsInCall(false);
    setRemotePeerConnected(false);
    setIsScreenSharing(false);
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isInCall || !peerConnectionRef.current) return;
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnectionRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          stopScreenSharing();
        };
      } else {
        stopScreenSharing();
      }
    } catch (err) {
      console.warn("Screen share cancelled:", err);
    }
  };

  const stopScreenSharing = () => {
    if (localStreamRef.current && peerConnectionRef.current) {
      const originalTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = peerConnectionRef.current
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");
      if (sender && originalTrack) {
        sender.replaceTrack(originalTrack);
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    }
  };

  // ==========================================
  // COMPANION AUDIO CAPTURE & TRANSCRIPTION
  // ==========================================

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

  const setupSpeechRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec && !speechRecognitionRef.current) {
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

  const setupAudioStreamAndRecognition = (stream: MediaStream, mode: "mic" | "tab") => {
    audioStreamRef.current = stream;
    audioChunksRef.current = [];
    setIsCapturingAudio(true);
    setAudioSourceMode(mode);
    setCaptureDuration(0);

    captureTimerRef.current = setInterval(() => {
      setCaptureDuration((prev) => prev + 1);
    }, 1000);

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

    setupSpeechRecognition();
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

  const handleCopyInviteLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
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
      if (isCapturingAudio) stopLiveAudioCapture();
      if (isInCall) endInAppCall();

      let finalTranscript = liveCapturedText.trim();

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
      {/* Topbar: Executive Navigation & Mode Switcher */}
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
          </div>
        </div>

        {/* Center: Mode Switcher (Companion Mode vs In-App Live Call) */}
        <div className="hidden md:flex items-center gap-1 bg-[#F5F1E8] dark:bg-[#181614] p-1 rounded-xl border border-[#cfc7b2] dark:border-[#38332C]">
          <button
            type="button"
            onClick={() => setChamberMode("companion")}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
              chamberMode === "companion"
                ? "bg-[#1d1d1b] text-[#F5F1E8] dark:bg-[#D4AA50] dark:text-[#181614] shadow-xs"
                : "text-[#5c5549] dark:text-[#a89f91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Companion Mode</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setChamberMode("inapp");
              if (!isInCall) startInAppCall();
            }}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
              chamberMode === "inapp"
                ? "bg-[#1d1d1b] text-[#F5F1E8] dark:bg-[#D4AA50] dark:text-[#181614] shadow-xs"
                : "text-[#5c5549] dark:text-[#a89f91] hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1]"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>In-App Live Call</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <CelestialThemeToggle theme={theme} onToggle={toggleTheme} />

          {/* Copy Meeting Link button */}
          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#F5F1E8] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] rounded-lg transition-colors cursor-pointer"
            title="Share this deliberation link with colleagues"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />}
            <span>{copiedLink ? "Link Copied" : "Invite Peers"}</span>
          </button>

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

          {/* End Deliberation Button */}
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

      {/* Main Deliberation Chamber: Live Audio/Video Feed (Left) + Silent Stakeholder Scribe (Right) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden bg-executive-grid">
        {/* Left Column: Live Audio / In-App Video & Live Transcript (7 cols) */}
        <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-[#cfc7b2] dark:border-[#38332C] bg-[#F5F1E8]/90 dark:bg-[#181614]/90 p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* IN-APP VIDEO CALL CHAMBER (When In-App Mode is Active) */}
          {chamberMode === "inapp" && (
            <div className="bg-[#181614] border border-[#38332C] rounded-2xl p-4 shadow-xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#D4AA50]">
                    In-App WebRTC Video Call
                  </span>
                  <span className="text-[11px] font-mono text-[#A89F91]">
                    ({callPeerCount} participant{callPeerCount === 1 ? "" : "s"})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#F0EAE1] tabular-nums">
                    {formatTimer(captureDuration)}
                  </span>
                </div>
              </div>

              {/* Video Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[220px]">
                {/* Local Video Tile */}
                <div className="relative bg-[#221F1C] border border-[#38332C] rounded-xl overflow-hidden aspect-video flex items-center justify-center">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`w-full h-full object-cover ${!isCameraOn ? "hidden" : ""}`}
                  />
                  {!isCameraOn && (
                    <div className="flex flex-col items-center justify-center text-[#A89F91] space-y-2">
                      <div className="w-14 h-14 rounded-full bg-[#2C2723] border border-[#38332C] flex items-center justify-center text-lg font-bold font-newsreader text-[#D4AA50]">
                        {(currentUser?.name || "H").charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-mono">Camera Off</span>
                    </div>
                  )}
                  <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono font-bold text-white uppercase backdrop-blur-xs">
                    You ({currentUser?.name || "Host"})
                  </span>
                </div>

                {/* Remote Peer Video Tile or Waiting Slot */}
                <div className="relative bg-[#221F1C] border border-[#38332C] rounded-xl overflow-hidden aspect-video flex items-center justify-center">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover ${!remotePeerConnected ? "hidden" : ""}`}
                  />
                  {!remotePeerConnected && (
                    <div className="flex flex-col items-center justify-center text-center p-4 text-[#A89F91] space-y-2.5">
                      <Users className="w-8 h-8 opacity-40 text-[#D4AA50]" />
                      <p className="text-xs font-sans max-w-[200px]">
                        Waiting for colleagues to join this room...
                      </p>
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="px-3 py-1.5 rounded-lg border border-[#38332C] bg-[#181614] hover:bg-[#2A2622] text-[#D4AA50] text-[11px] font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? "Link Copied" : "Copy Invite Link"}</span>
                      </button>
                    </div>
                  )}
                  {remotePeerConnected && (
                    <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono font-bold text-white uppercase backdrop-blur-xs">
                      Remote Colleague
                    </span>
                  )}
                </div>
              </div>

              {/* In-Call Controls Bar */}
              <div className="flex items-center justify-center gap-2.5 pt-2 border-t border-[#38332C]">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                    isMicOn
                      ? "bg-[#2A2622] border-[#38332C] text-[#F0EAE1] hover:bg-[#38332C]"
                      : "bg-rose-900/60 border-rose-700 text-rose-300"
                  }`}
                  title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                    isCameraOn
                      ? "bg-[#2A2622] border-[#38332C] text-[#F0EAE1] hover:bg-[#38332C]"
                      : "bg-rose-900/60 border-rose-700 text-rose-300"
                  }`}
                  title={isCameraOn ? "Turn Camera Off" : "Turn Camera On"}
                >
                  {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                    isScreenSharing
                      ? "bg-emerald-900/60 border-emerald-700 text-emerald-300"
                      : "bg-[#2A2622] border-[#38332C] text-[#F0EAE1] hover:bg-[#38332C]"
                  }`}
                  title={isScreenSharing ? "Stop Screen Share" : "Share Screen"}
                >
                  <Monitor className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={endInAppCall}
                  className="px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-mono text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Disconnect Video
                </button>
              </div>
            </div>
          )}

          {/* COMPANION MODE BANNER (When Companion Mode is Active) */}
          {chamberMode === "companion" && (
            <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-4 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                    Companion Deliberation Mode
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
          )}

          {/* Audio Capture Controls */}
          <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                  Audio Intelligence Engine
                </span>
                <span className="text-xs text-[#5c5549] dark:text-[#a89f91]">
                  {isCapturingAudio || isInCall
                    ? `Transcribing live speech arguments into the deliberation pool...`
                    : "Ready to capture meeting voice arguments."}
                </span>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {isCapturingAudio || isInCall ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 animate-pulse">
                    <Radio className="w-3.5 h-3.5" />
                    Transcribing
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

            {/* DPDP Act 2023 Consent & In-Memory Encryption Banner */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F1E8] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] text-[11px] font-mono">
              <div className="flex items-center gap-2 text-[#5c5549] dark:text-[#a89f91]">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  <strong>DPDP Act 2023 Compliant:</strong> Voice processed ephemeral in-memory. Zero retention of raw recordings without consent.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(true)}
                className="shrink-0 ml-3 underline hover:text-[#7a4e10] dark:hover:text-[#D4AA50] font-bold text-[#1d1d1b] dark:text-[#F0EAE1] cursor-pointer"
              >
                Privacy &amp; Terms →
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
          <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl flex flex-col flex-1 shadow-2xs overflow-hidden min-h-[300px]">
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
                    No speech recorded yet. Start live mic capture, tab audio, or in-app call to transcribe your meeting discussion.
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

      {/* Terms of Deliberation & Privacy Notice Modal (DPDP Act 2023 & Liability Cap) */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#F5F1E8] dark:bg-[#1C1A17] border border-[#cfc7b2] dark:border-[#38332C] rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#cfc7b2] dark:border-[#38332C] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#7a4e10] dark:text-[#D4AA50]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-playfair font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                    Terms of Deliberation &amp; Privacy Notice
                  </h3>
                  <p className="text-xs font-mono text-[#5c5549] dark:text-[#a89f91]">
                    DPDP Act 2023 • IT Act Section 43A • Enterprise Governance
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1.5 rounded-lg text-[#5c5549] hover:text-[#1d1d1b] dark:text-[#a89f91] dark:hover:text-[#F0EAE1] hover:bg-[#E5DEC9] dark:hover:bg-[#2C2723] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Clauses */}
            <div className="space-y-4 text-xs font-sans text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed">
              <div className="p-3.5 rounded-xl bg-[#EDE7D6] dark:bg-[#24211D] border border-[#cfc7b2] dark:border-[#38332C] space-y-1">
                <h4 className="font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>1. Audio Recording &amp; Consent (DPDP Act 2023)</span>
                </h4>
                <p>
                  By initiating or participating in audio capture or WebRTC video inside DecisionLens, participants grant express consent for ephemeral acoustic-to-text transcription. Voice streams are processed in-memory via IIT Madras IndicWhisper / Whisper models. Raw audio is purged immediately post-session unless explicitly flagged for encrypted cold audit retention.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#EDE7D6] dark:bg-[#24211D] border border-[#cfc7b2] dark:border-[#38332C] space-y-1">
                <h4 className="font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>2. Limitation of Liability (Executive Decision Aid)</span>
                </h4>
                <p>
                  DecisionLens and its AI scoring matrices (including Opportunity Cost calculations, Sunk Cost fallacies, and Bayesian priors) serve as <strong>advisory decision aids</strong>. The platform does not assume fiduciary, operational, or legal liability for boardroom resolutions. Final accountability and corporate sign-off rest exclusively with the enterprise&apos;s human executives. Total aggregate liability is strictly capped at the software fees paid in the preceding 12 months.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#EDE7D6] dark:bg-[#24211D] border border-[#cfc7b2] dark:border-[#38332C] space-y-1">
                <h4 className="font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>3. Intellectual Property &amp; Enterprise Confidentiality</span>
                </h4>
                <p>
                  All architectural decision records (ADRs), stakeholder caveats, and synthesized takeaways generated within this workspace remain <strong>100% the proprietary Intellectual Property of the customer</strong>. Customer data is never used to train public foundation models or shared across multi-tenant boundaries.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#EDE7D6] dark:bg-[#24211D] border border-[#cfc7b2] dark:border-[#38332C] space-y-1">
                <h4 className="font-mono font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>4. Cryptographic Integrity &amp; Audit Trail</span>
                </h4>
                <p>
                  Every verified ADR and caveat snapshot is cryptographically stamped with SHA-256 digests and linked to the authenticated participant ID, guaranteeing non-repudiation during ISO 27001 and SOC-2 Type II audits.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[#cfc7b2] dark:border-[#38332C] pt-4">
              <span className="text-[11px] font-mono text-[#5c5549] dark:text-[#a89f91]">
                Compliance Jurisdiction: India (DPDP Act 2023, IT Act 2000)
              </span>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#1d1d1b] hover:bg-[#2C2723] dark:bg-[#D4AA50] dark:text-[#181614] text-[#F5F1E8] transition-colors cursor-pointer shadow-sm"
              >
                Acknowledge &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
