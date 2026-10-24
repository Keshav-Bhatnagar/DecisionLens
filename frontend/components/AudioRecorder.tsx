"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  RotateCcw,
  Upload,
  Volume2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Sliders,
  FileAudio,
  Loader2,
  Check,
} from "lucide-react";
import { uploadAudio, TranscriptionResponse } from "@/lib/api";

interface AudioRecorderProps {
  decisionId: number;
  initialLanguage?: string;
  onTranscriptionSuccess: (data: TranscriptionResponse) => void;
}

export default function AudioRecorder({
  decisionId,
  initialLanguage = "en",
  onTranscriptionSuccess,
}: AudioRecorderProps) {
  const [activeTab, setActiveTab] = useState<"record" | "upload">("record");
  const [language, setLanguage] = useState<string>(
    initialLanguage === "hi" ? "hi" : "en"
  );
  const [applyEnhancement, setApplyEnhancement] = useState<boolean>(true);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Live real-time speech recognition states
  const [liveSpeechText, setLiveSpeechText] = useState<string>("");
  const [liveInterimText, setLiveInterimText] = useState<string>("");
  const liveTranscriptRef = useRef<string>("");
  const speechRecognitionRef = useRef<any>(null);

  // Upload file state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Submission & status
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [processingStep, setProcessingStep] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, [audioUrl]);

  // Track elapsed time and pipeline step during transcription
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isProcessing) {
      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        setProcessingElapsed(elapsedSec);
        if (elapsedSec < 1) {
          setProcessingStep(1);
        } else if (elapsedSec < 3) {
          setProcessingStep(2);
        } else {
          setProcessingStep(3);
        }
      }, 500);
    } else {
      setProcessingElapsed(0);
      setProcessingStep(1);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing]);

  // Format seconds to mm:ss
  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    setError(null);
    setSuccessMsg(null);
    setAudioBlob(null);
    setLiveSpeechText("");
    setLiveInterimText("");
    liveTranscriptRef.current = "";
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Microphone access is not supported by your browser or is blocked in this context."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Determine supported mimeType
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const selectedMime =
        mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || "";

      const options = selectedMime ? { mimeType: selectedMime } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mime = selectedMime || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Stop all audio tracks in media stream
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);

      // Start browser SpeechRecognition in parallel if supported (Chrome/Safari/Edge)
      const SpeechRec =
        typeof window !== "undefined" &&
        ((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition);

      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = language === "hi" ? "hi-IN" : "en-US";
          let transcriptAccumulator = "";

          rec.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const text = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                transcriptAccumulator = (
                  transcriptAccumulator +
                  " " +
                  text
                ).trim();
              } else {
                interim += " " + text;
              }
            }
            setLiveSpeechText(transcriptAccumulator);
            setLiveInterimText(interim);
            liveTranscriptRef.current = (
              transcriptAccumulator +
              " " +
              interim
            ).trim();
          };

          rec.onerror = (event: any) => {
            console.warn("Browser SpeechRecognition notice:", event?.error);
          };

          rec.start();
          speechRecognitionRef.current = rec;
        } catch (e) {
          console.warn("Could not start Web Speech Recognition:", e);
        }
      }

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not access microphone. Please check browser permissions.";
      setError(msg);
      setIsRecording(false);
    }
  };

  const pauseRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
    }
  };

  const resumeRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "paused"
    ) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.start();
      } catch (_) {}
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
    }
    setIsRecording(false);
    setIsPaused(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const resetRecording = () => {
    stopRecording();
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }
    setLiveSpeechText("");
    setLiveInterimText("");
    liveTranscriptRef.current = "";
    setRecordingDuration(0);
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validExts = [".wav", ".mp3", ".m4a", ".webm", ".ogg"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!validExts.includes(ext)) {
      setError(
        `Unsupported audio extension '${ext}'. Allowed: .wav, .mp3, .m4a, .webm, .ogg`
      );
      setSelectedFile(null);
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 25MB limit.`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
  };

  const handleTranscribe = async () => {
    const payload = activeTab === "record" ? audioBlob : selectedFile;
    if (!payload) {
      setError("Please record audio or select an audio file first.");
      return;
    }

    setIsProcessing(true);
    setProcessingElapsed(0);
    setProcessingStep(1);
    setError(null);
    setSuccessMsg(null);

    try {
      const filename =
        activeTab === "record"
          ? `mic_recording_${Date.now()}.webm`
          : selectedFile?.name || "audio_upload.wav";

      const clientCapturedText =
        (liveTranscriptRef.current || liveSpeechText || "").trim();

      const res = await uploadAudio(decisionId, payload, {
        language,
        applyEnhancement,
        filename,
        clientTranscript: clientCapturedText || undefined,
      });

      setSuccessMsg("Audio successfully transcribed & updated in Meeting Transcript below!");
      onTranscriptionSuccess(res);

      // Clean up after successful transcription
      if (activeTab === "record") {
        setAudioBlob(null);
      } else {
        setSelectedFile(null);
      }

      // Smooth scroll to Meeting Transcript & Voice Notes section
      setTimeout(() => {
        const transcriptSection = document.getElementById("transcript-editor-section");
        if (transcriptSection) {
          transcriptSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 300);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Audio transcription failed."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl specular-edge p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Voice Recording & Speech-to-Text
            </h2>
            <p className="text-xs text-slate-500">
              Record meeting notes or upload voice memos with FFmpeg normalization.
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab("record");
              setError(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === "record"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Mic className="w-3.5 h-3.5" /> Live Microphone
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("upload");
              setError(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === "upload"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Upload Audio File
          </button>
        </div>
      </div>

      {/* Language Controls & FFmpeg Enhancement Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
        {/* Language Selection */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Spoken Language (Strictly Restricted)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`flex items-center justify-center gap-2 p-2 rounded-lg border font-medium transition-all ${
                language === "en"
                  ? "border-indigo-600 bg-white text-indigo-600 font-bold shadow-xs"
                  : "border-slate-200 bg-slate-100/50 text-slate-600 hover:bg-white"
              }`}
            >
              <span className="text-base">🇺🇸</span>
              <span>English (en)</span>
            </button>
            <button
              type="button"
              onClick={() => setLanguage("hi")}
              className={`flex items-center justify-center gap-2 p-2 rounded-lg border font-medium transition-all ${
                language === "hi"
                  ? "border-indigo-600 bg-white text-indigo-600 font-bold shadow-xs"
                  : "border-slate-200 bg-slate-100/50 text-slate-600 hover:bg-white"
              }`}
            >
              <span className="text-base">🇮🇳</span>
              <span>Hindi (hi)</span>
            </button>
          </div>
        </div>

        {/* FFmpeg Enhancement Toggle */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            Audio Enhancement Pipeline
          </label>
          <label className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-indigo-300 transition-colors">
            <input
              type="checkbox"
              checked={applyEnhancement}
              onChange={(e) => setApplyEnhancement(e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
            />
            <div className="leading-tight">
              <span className="font-semibold text-slate-800 block">
                FFmpeg Normalization & High-Pass Filter
              </span>
              <span className="text-[11px] text-slate-500">
                EBU R128 volume leveling + 200Hz rumble reduction.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Mode 1: Live Browser Recording */}
      {activeTab === "record" && (
        <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/50 space-y-5">
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            {/* Visual Pulsing Recording Indicator */}
            {isRecording && (
              <div className="flex items-center gap-2 text-xs font-semibold text-red-600 animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                <span>
                  {isPaused ? "Recording Paused" : "Recording Audio Live..."}
                </span>
              </div>
            )}

            {/* Timer Display */}
            <div className="text-3xl font-mono font-extrabold text-slate-900 tracking-wider">
              {formatTime(recordingDuration)}
            </div>

            {/* Simulated Animated Waveform Bars */}
            {isRecording && !isPaused && (
              <div className="flex items-center gap-1 h-8">
                {[40, 70, 95, 60, 85, 30, 90, 65, 80, 45, 100, 55, 75, 40].map(
                  (height, i) => (
                    <div
                      key={i}
                      className="w-1 bg-indigo-500 rounded-full animate-pulse"
                      style={{
                        height: `${height}%`,
                        animationDelay: `${(i % 5) * 150}ms`,
                      }}
                    />
                  )
                )}
              </div>
            )}

            {/* Live Real-time Speech Captioning */}
            {(liveSpeechText || liveInterimText) && (
              <div className="w-full max-w-md mx-auto bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-950 flex items-start gap-2.5 shadow-xs">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-indigo-800 text-[11px] uppercase tracking-wider mb-0.5">
                    Live Speech Detected ({language === "hi" ? "Hindi" : "English"})
                  </div>
                  <p className="text-slate-800 font-medium break-words leading-relaxed">
                    <span>{liveSpeechText}</span>
                    <span className="text-indigo-600/70 font-normal">{liveInterimText}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Control Buttons */}
            <div className="flex items-center gap-3 pt-2">
              {!isRecording && !audioBlob ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-full shadow-sm hover:shadow transition-all"
                >
                  <Mic className="w-4 h-4" /> Start Recording
                </button>
              ) : isRecording ? (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      onClick={resumeRecording}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-full shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5" /> Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={pauseRecording}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-full shadow-xs"
                    >
                      <Pause className="w-3.5 h-3.5" /> Pause
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-full shadow-xs"
                  >
                    <Square className="w-3.5 h-3.5" /> Stop & Review
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={resetRecording}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset & Record Again
                </button>
              )}
            </div>
          </div>

          {/* Audio Preview Player */}
          {audioUrl && !isRecording && (
            <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-indigo-600" /> Recorded Audio Preview
                </span>
                <span className="text-slate-400 font-mono">
                  {formatTime(recordingDuration)}
                </span>
              </div>
              <audio src={audioUrl} controls className="w-full h-10" />
            </div>
          )}
        </div>
      )}

      {/* Mode 2: File Upload */}
      {activeTab === "upload" && (
        <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-8 text-center bg-slate-50/50 transition-colors space-y-3">
          <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 mx-auto flex items-center justify-center text-indigo-600 shadow-xs">
            <FileAudio className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Select or drop an audio file
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Supported formats: .wav, .mp3, .m4a, .webm, .ogg (Max: 25MB)
            </p>
          </div>

          <label className="inline-block mt-2">
            <span className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Browse Audio File
            </span>
            <input
              type="file"
              accept=".wav,.mp3,.m4a,.webm,.ogg,audio/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {selectedFile && (
            <div className="mt-4 p-3 bg-white rounded-xl border border-indigo-200 max-w-md mx-auto flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <FileAudio className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="font-semibold text-slate-800 truncate">
                  {selectedFile.name}
                </span>
                <span className="text-slate-400">
                  ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                    setAudioUrl(null);
                  }
                }}
                className="text-slate-400 hover:text-red-600 ml-2"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Transcribe Action Button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          disabled={
            isProcessing ||
            isRecording ||
            (activeTab === "record" && !audioBlob) ||
            (activeTab === "upload" && !selectedFile)
          }
          onClick={handleTranscribe}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" />
          {isProcessing
            ? "Processing & Transcribing..."
            : "Transcribe Voice Audio"}
        </button>
      </div>

      {/* Interactive Transcription Loading Window Modal */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 sm:p-8 space-y-6 text-center relative overflow-hidden">
            {/* Top decorative gradient bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 animate-pulse" />

            {/* Glowing Pulsing Icon */}
            <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
              <div className="absolute inset-1 rounded-full bg-indigo-500/10 animate-pulse" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                <Mic className="w-8 h-8 animate-bounce" />
              </div>
            </div>

            {/* Title and Status Badge */}
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>AI Speech-to-Text Pipeline</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                Transcribing Voice Recording
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Running neural speech recognition in{" "}
                <span className="font-semibold text-slate-700">
                  {language === "hi" ? "Hindi (hi-IN)" : "English (en-US)"}
                </span>
                .
              </p>
            </div>

            {/* Step-by-Step Progress Pipeline */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pb-1 border-b border-slate-200/60">
                <span>PIPELINE PROGRESS</span>
                <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  {processingElapsed}s elapsed
                </span>
              </div>

              {/* Step 1 */}
              <div className="flex items-center gap-3 text-xs">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                    processingStep > 1
                      ? "bg-emerald-500 text-white"
                      : processingStep === 1
                      ? "bg-indigo-600 text-white animate-pulse"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {processingStep > 1 ? <Check className="w-3.5 h-3.5" /> : "1"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">
                    Audio Leveling & FFmpeg Noise Gate
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {processingStep > 1 ? "Completed" : "Optimizing loudness & frequencies..."}
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-center gap-3 text-xs">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                    processingStep > 2
                      ? "bg-emerald-500 text-white"
                      : processingStep === 2
                      ? "bg-indigo-600 text-white animate-pulse"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {processingStep > 2 ? <Check className="w-3.5 h-3.5" /> : "2"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">
                    Multimodal AI Transcription
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {processingStep > 2
                      ? "Completed"
                      : processingStep === 2
                      ? "Extracting verbatim speech into text..."
                      : "Waiting for audio preprocessing"}
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-center gap-3 text-xs">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                    processingStep === 3
                      ? "bg-indigo-600 text-white animate-pulse"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  3
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">
                    Sync to Meeting Transcript & Voice Notes
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Populating editable editor below...
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Guidance */}
            <div className="bg-indigo-50/70 border border-indigo-100/80 rounded-xl p-3 text-xs text-indigo-900 flex items-center gap-2 text-left">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Speech output will appear immediately in <strong>Meeting Transcript & Voice Notes</strong> below for your review before structuring.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
