"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  CheckCircle2,
  Clock,
  RotateCcw,
  Copy,
  Save,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Languages,
  Users,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import {
  updateTranscript,
  retryOriginalAudio,
  getTranscriptionDetails,
  TranscriptionResponse,
} from "@/lib/api";

interface TranscriptEditorProps {
  decisionId: number;
  initialTranscript: string;
  isReviewed: boolean;
  language: string;
  onTranscriptSaved: (res: TranscriptionResponse) => void;
}

export default function TranscriptEditor({
  decisionId,
  initialTranscript,
  isReviewed,
  language,
  onTranscriptSaved,
}: TranscriptEditorProps) {
  const [transcript, setTranscript] = useState(initialTranscript || "");
  const [reviewed, setReviewed] = useState(isReviewed);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [speakerRoles, setSpeakerRoles] = useState<Record<string, string>>({});

  // Audio Playback & Timestamp Sync state
  const [audioId, setAudioId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Fetch audio stream details if available
  useEffect(() => {
    getTranscriptionDetails(decisionId)
      .then((data) => {
        if (data.audio_id) {
          setAudioId(data.audio_id);
        }
      })
      .catch(() => {
        // Audio stream not yet uploaded
      });
  }, [decisionId]);

  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (newTime: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleRateChange = (rate: number) => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const formatAudioTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleJumpToTimestamp = (timestampStr: string) => {
    if (!audioRef.current) return;
    const clean = timestampStr.replace(/[\[\]]/g, "");
    const parts = clean.split(":").map(Number);
    let seconds = 0;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    }
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
    audioRef.current.play();
    setIsPlaying(true);
  };

  // Extract clickable timestamps from transcript text
  const detectedTimestamps = useMemo(() => {
    if (!transcript) return [];
    const matches = transcript.match(/(?:\[|\b)(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\]|\b)/g);
    if (!matches) return [];
    return Array.from(new Set(matches)).slice(0, 8);
  }, [transcript]);

  useEffect(() => {
    setTranscript(initialTranscript || "");
    setReviewed(isReviewed);
  }, [initialTranscript, isReviewed]);

  // Auto-detect unique speakers from transcript lines (e.g. "Rahul Sharma:", "DevOps:")
  const detectedSpeakers = useMemo(() => {
    if (!transcript) return [];
    const lines = transcript.split("\n");
    const counts: Record<string, number> = {};
    const pattern = /^([A-Za-z0-9_\-\.\s]{2,30}):\s+/;
    for (const l of lines) {
      const match = l.match(pattern);
      if (match) {
        const name = match[1].trim();
        if (!["http", "https", "note", "timestamp", "cue"].includes(name.toLowerCase())) {
          counts[name] = (counts[name] || 0) + 1;
        }
      }
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [transcript]);

  // Pre-seed default roles based on speaker names if available
  useEffect(() => {
    if (detectedSpeakers.length > 0) {
      setSpeakerRoles((prev) => {
        const updated = { ...prev };
        detectedSpeakers.forEach(({ name }) => {
          if (!updated[name]) {
            const lower = name.toLowerCase();
            if (lower.includes("devops") || lower.includes("infra") || lower.includes("sre")) {
              updated[name] = "DevOps / Cloud SRE";
            } else if (lower.includes("security") || lower.includes("ciso") || lower.includes("audit")) {
              updated[name] = "Security & Compliance";
            } else if (lower.includes("product") || lower.includes("pm") || lower.includes("owner")) {
              updated[name] = "Product Manager";
            } else if (lower.includes("qa") || lower.includes("test")) {
              updated[name] = "QA / Reliability";
            } else {
              updated[name] = "Lead Architect";
            }
          }
        });
        return updated;
      });
    }
  }, [detectedSpeakers]);

  const wordCount = transcript
    ? transcript.split(/\s+/).filter(Boolean).length
    : 0;

  const handleCopy = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveReviewed = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // Append authority mapping header if speakers were tagged
      let finalTranscript = transcript.trim();
      const roleKeys = Object.keys(speakerRoles);
      if (roleKeys.length > 0 && !finalTranscript.includes("[Speaker Authority Mapping:")) {
        const authorityHeader =
          "### [Speaker Authority Mapping:\n" +
          roleKeys.map((name) => `• ${name}: ${speakerRoles[name]}`).join("\n") +
          "\n]\n\n";
        finalTranscript = authorityHeader + finalTranscript;
        setTranscript(finalTranscript);
      }

      const res = await updateTranscript(decisionId, finalTranscript, true);
      setReviewed(true);
      setSuccessMsg("Transcript & Speaker Authority Roles successfully saved!");
      onTranscriptSaved(res);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save reviewed transcript."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetryOriginal = async () => {
    if (
      !confirm(
        "Rerun speech-to-text using the unenhanced original audio file? This will replace the current raw transcript."
      )
    ) {
      return;
    }

    setIsRetrying(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await retryOriginalAudio(decisionId);
      setTranscript(res.transcript);
      setReviewed(false);
      setSuccessMsg("Re-transcribed using unenhanced original audio!");
      onTranscriptSaved(res);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to retry transcription with original audio."
      );
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] rounded-none p-6 sm:p-8 shadow-2xs space-y-6 transition-colors">
      {/* Header and Status Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#cfc7b2]/70 dark:border-[#38332C]/70">
        <div className="flex items-center gap-2.5">
          <FileText className="w-5 h-5 text-[#7a4e10] dark:text-[#D4AA50]" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                Meeting Transcript & Voice Notes
              </h2>
            </div>
            <p className="text-xs font-courier text-[#4f4b40] dark:text-[#A89F91]">
              Review dialogue and map participant authority before cognitive structuring.
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 flex-wrap font-courier text-xs font-bold uppercase tracking-wider">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]">
            <Languages className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
            {language === "hi" ? "Hindi (hi)" : "English (en)"}
          </span>

          {reviewed ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-[#E5DEC9] dark:bg-[#2C2723] text-[#7a4e10] dark:text-[#D4AA50] border border-[#7a4e10]/40 dark:border-[#D4AA50]/40">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified & Reviewed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-[#F4F0E6] dark:bg-[#181614] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C]">
              <Clock className="w-3.5 h-3.5" /> Automated Transcript (Unreviewed)
            </span>
          )}
        </div>
      </div>

      {/* Speaker Role & Authority Tagging Panel */}
      {detectedSpeakers.length > 0 && (
        <div className="p-4 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-3 font-courier rounded-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50]" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                  Participant Authority & Role Mapping
                </span>
                <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
                  Weights objections & constraints by domain authority (e.g. Security vs. DevOps)
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] bg-[#EDE7D6] dark:bg-[#221F1C] px-2.5 py-0.5 border border-[#cfc7b2] dark:border-[#38332C]">
              {detectedSpeakers.length} Speakers Detected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {detectedSpeakers.map(({ name, count }) => (
              <div
                key={name}
                className="bg-[#EDE7D6] dark:bg-[#221F1C] p-3 border border-[#cfc7b2] dark:border-[#38332C] flex flex-col gap-1.5 rounded-none"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1d1d1b] dark:text-[#F0EAE1] truncate" title={name}>
                    {name}
                  </span>
                  <span className="text-[10px] text-[#4f4b40] dark:text-[#A89F91] bg-[#F4F0E6] dark:bg-[#181614] font-bold uppercase px-2 py-0.5 border border-[#cfc7b2] dark:border-[#38332C]">
                    {count} {count === 1 ? "turn" : "turns"}
                  </span>
                </div>

                <select
                  value={speakerRoles[name] || "Lead Architect"}
                  onChange={(e) =>
                    setSpeakerRoles((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                  className="w-full text-xs font-courier font-bold bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none py-1.5 px-2 text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                >
                  <option value="Lead Architect">🏛️ Lead Architect / Tech Lead</option>
                  <option value="DevOps / Cloud SRE">⚙️ DevOps / Cloud SRE</option>
                  <option value="Security & Compliance">🔒 Security & Compliance</option>
                  <option value="Product Manager">💼 Product Manager / Business</option>
                  <option value="Backend Engineer">💻 Backend Engineer</option>
                  <option value="Frontend Engineer">🎨 Frontend / Mobile Lead</option>
                  <option value="QA / Reliability">🧪 QA / Reliability Lead</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript Textarea */}
      <div className="space-y-2 font-courier">
        <div className="flex items-center justify-between text-xs text-[#4f4b40] dark:text-[#A89F91]">
          <span className="font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1]">
            Editable Transcript
          </span>
          <div className="flex items-center gap-3">
            <span>{wordCount} words</span>
            <span>•</span>
            <span>{transcript.length} characters</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[#7a4e10] dark:text-[#D4AA50] font-bold uppercase tracking-wider hover:underline ml-2 cursor-pointer"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </>
              )}
            </button>
          </div>
        </div>

        <textarea
          rows={8}
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            if (reviewed) setReviewed(false);
          }}
          placeholder="Recorded audio transcript will appear here. You can also write or paste conversation transcripts directly..."
          className="w-full text-sm font-newsreader text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-4 placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:ring-1 focus:ring-[#7a4e10] focus:outline-none transition-colors leading-relaxed"
        />
      </div>

      {/* Notification Alerts */}
      {error && (
        <div className="p-3.5 bg-red-950/10 dark:bg-red-950/40 border border-red-400 dark:border-red-900 text-xs font-courier text-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-[#E5DEC9] dark:bg-[#2C2723] border border-[#7a4e10]/40 dark:border-[#D4AA50]/40 text-xs font-courier text-[#7a4e10] dark:text-[#D4AA50] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-bold">{successMsg}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 font-courier">
        <button
          type="button"
          onClick={handleRetryOriginal}
          disabled={isRetrying || isSaving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] transition-colors disabled:opacity-40 cursor-pointer"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
          <span>{isRetrying ? "Reprocessing..." : "Retry Unenhanced Audio"}</span>
        </button>

        <button
          type="button"
          onClick={handleSaveReviewed}
          disabled={isSaving || isRetrying || !transcript.trim()}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-none text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] shadow-2xs transition-colors disabled:opacity-40 cursor-pointer"
        >
          {isSaving ? (
            <>
              <Save className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verify & Save Transcript</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
