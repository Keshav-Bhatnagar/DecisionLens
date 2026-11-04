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
  Radio,
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
  const [lastTranscribedText, setLastTranscribedText] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState<boolean>(false);

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
    setLiveSpeechText("");
    setLiveInterimText("");
    liveTranscriptRef.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Start live web speech recognition if supported
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognizer = new SpeechRecognition();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = language === "hi" ? "hi-IN" : "en-US";

          recognizer.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                liveTranscriptRef.current += event.results[i][0].transcript + " ";
                setLiveSpeechText(liveTranscriptRef.current);
              } else {
                interim += event.results[i][0].transcript;
              }
            }
            setLiveInterimText(interim);
          };

          recognizer.onerror = () => {
            // SpeechRecognition warning handled silently
          };

          recognizer.start();
          speechRecognitionRef.current = recognizer;
        } catch (_) {}
      }
    } catch (err: unknown) {
      setError(
        "Microphone access denied or unavailable. Check browser audio permissions."
      );
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (_) {}
      }
    }
  };

  const resetRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingDuration(0);
    setIsRecording(false);
    setIsPaused(false);
    setLiveSpeechText("");
    setLiveInterimText("");
    liveTranscriptRef.current = "";
    setError(null);
    setSuccessMsg(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMsg(null);
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const maxBytes = 25 * 1024 * 1024;
      if (file.size > maxBytes) {
        setError(`Audio file size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 25MB.`);
        return;
      }
      setSelectedFile(file);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  const handleTranscribe = async () => {
    setError(null);
    setSuccessMsg(null);
    setLastTranscribedText(null);

    let fileToUpload: File | null = null;

    if (activeTab === "record") {
      if (!audioBlob) {
        setError("Please record audio before initiating transcription.");
        return;
      }
      const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
      fileToUpload = new File([audioBlob], `recorded_memo_${Date.now()}.${extension}`, {
        type: audioBlob.type,
      });
    } else {
      if (!selectedFile) {
        setError("Please select an audio file to transcribe.");
        return;
      }
      fileToUpload = selectedFile;
    }

    setIsProcessing(true);

    try {
      const res = await uploadAudio(decisionId, fileToUpload, {
        language,
        applyEnhancement,
      });
      const wordCount = res.transcript
        ? res.transcript.split(/\s+/).filter(Boolean).length
        : 0;
      setSuccessMsg(
        `Transcription complete: ${wordCount} words transcribed successfully.`
      );
      setLastTranscribedText(res.transcript);
      onTranscriptionSuccess(res);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Transcription failed. Please retry or adjust audio settings."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] rounded-none p-6 sm:p-8 shadow-2xs space-y-6 transition-colors">
      {/* Header with Title and Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#cfc7b2]/70 dark:border-[#38332C]/70">
        <div className="flex items-center gap-2.5">
          <Mic className="w-5 h-5 text-[#7a4e10] dark:text-[#D4AA50]" />
          <div>
            <h2 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
              Voice Recording & Speech-to-Text
            </h2>
            <p className="text-xs font-courier text-[#4f4b40] dark:text-[#A89F91]">
              Record deliberation dialogue or ingest audio memos with FFmpeg EBU R128 normalization.
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center border border-[#cfc7b2] dark:border-[#38332C] bg-[#F4F0E6] dark:bg-[#181614] rounded-none font-courier text-xs font-bold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => {
              setActiveTab("record");
              setError(null);
            }}
            className={`px-3.5 py-1.5 transition-colors flex items-center gap-1.5 cursor-pointer rounded-none ${
              activeTab === "record"
                ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                : "text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1]"
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
            className={`px-3.5 py-1.5 transition-colors flex items-center gap-1.5 cursor-pointer rounded-none ${
              activeTab === "upload"
                ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                : "text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1]"
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Ingest Audio File
          </button>
        </div>
      </div>

      {/* Language Controls & FFmpeg Enhancement Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#F4F0E6] dark:bg-[#181614] p-4 border border-[#cfc7b2] dark:border-[#38332C] text-xs font-courier">
        {/* Language Selection */}
        <div>
          <label className="block font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] mb-2">
            Spoken Language (Restricted)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`flex items-center justify-center gap-2 p-2 border font-bold uppercase tracking-wider transition-colors cursor-pointer rounded-none ${
                language === "en"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] bg-[#EDE7D6] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1]"
                  : "border-[#cfc7b2] dark:border-[#38332C] text-[#4f4b40] dark:text-[#A89F91] hover:bg-[#EDE7D6]/50"
              }`}
            >
              <span className="font-mono text-[11px] px-1 py-0.2 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]">
                EN
              </span>
              <span>English (en)</span>
            </button>
            <button
              type="button"
              onClick={() => setLanguage("hi")}
              className={`flex items-center justify-center gap-2 p-2 border font-bold uppercase tracking-wider transition-colors cursor-pointer rounded-none ${
                language === "hi"
                  ? "border-[#7a4e10] dark:border-[#D4AA50] bg-[#EDE7D6] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1]"
                  : "border-[#cfc7b2] dark:border-[#38332C] text-[#4f4b40] dark:text-[#A89F91] hover:bg-[#EDE7D6]/50"
              }`}
            >
              <span className="font-mono text-[11px] px-1 py-0.2 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]">
                HI
              </span>
              <span>Hindi (hi)</span>
            </button>
          </div>
        </div>

        {/* FFmpeg Enhancement Toggle */}
        <div>
          <label className="block font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] mb-2 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" />
            Audio Enhancement Pipeline
          </label>
          <label className="flex items-start gap-2.5 p-2 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] cursor-pointer hover:border-[#7a4e10] dark:hover:border-[#D4AA50] transition-colors rounded-none">
            <input
              type="checkbox"
              checked={applyEnhancement}
              onChange={(e) => setApplyEnhancement(e.target.checked)}
              className="mt-0.5 accent-[#7a4e10] dark:accent-[#D4AA50] w-4 h-4 cursor-pointer"
            />
            <div className="leading-tight">
              <span className="font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                FFmpeg Normalization & High-Pass Filter
              </span>
              <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
                EBU R128 volume leveling + 200Hz rumble reduction.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Mode 1: Live Browser Recording Console */}
      {activeTab === "record" && (
        <div className="border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-6 bg-[#F4F0E6] dark:bg-[#181614] space-y-5">
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            {/* Visual Pulsing Recording Indicator */}
            {isRecording && (
              <div className="flex items-center gap-2 font-courier text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 animate-pulse">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 dark:bg-rose-500" />
                <span>
                  {isPaused ? "Recording Suspended" : "Live Deliberation Ingest Active..."}
                </span>
              </div>
            )}

            {/* Timer Display */}
            <div className="text-4xl sm:text-5xl font-mono font-bold text-[#1d1d1b] dark:text-[#F0EAE1] tracking-widest">
              {formatTime(recordingDuration)}
            </div>

            {/* Simulated Analog Audio Level Meter Bars */}
            {isRecording && !isPaused && (
              <div className="flex items-center gap-1.5 h-9 px-4 py-1.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C]">
                {[35, 65, 95, 50, 80, 40, 90, 70, 85, 45, 100, 60, 75, 40, 60, 30].map(
                  (height, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-[#7a4e10] dark:bg-[#D4AA50] transition-all duration-75"
                      style={{
                        height: `${height}%`,
                        opacity: height > 80 ? 1 : 0.6,
                      }}
                    />
                  )
                )}
              </div>
            )}

            {/* Live Streaming Speech Preview */}
            {(liveSpeechText || liveInterimText) && (
              <div className="w-full max-w-xl p-3 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-courier text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed max-h-28 overflow-y-auto">
                <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block mb-1">
                  Live Verbatim Stream:
                </span>
                <span>{liveSpeechText}</span>
                <span className="italic opacity-60"> {liveInterimText}</span>
              </div>
            )}

            {/* Controls Bar */}
            <div className="flex items-center gap-3 pt-2 font-courier">
              {!isRecording && !audioUrl && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] rounded-none shadow-2xs transition-colors cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping mr-0.5" />
                  <span>Start Recording</span>
                </button>
              )}

              {isRecording ? (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      onClick={resumeRecording}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" /> Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={pauseRecording}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer"
                    >
                      <Pause className="w-3.5 h-3.5" /> Pause
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-rose-800 hover:bg-rose-900 rounded-none shadow-2xs transition-colors cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" /> Stop & Review
                  </button>
                </>
              ) : (
                audioUrl && (
                  <button
                    type="button"
                    onClick={resetRecording}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset & Re-Record
                  </button>
                )
              )}
            </div>
          </div>

          {/* Audio Preview Player */}
          {audioUrl && !isRecording && (
            <div className="p-4 bg-[#EDE7D6] dark:bg-[#221F1C] rounded-none border border-[#cfc7b2] dark:border-[#38332C] space-y-2 font-courier">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1]">
                <span className="flex items-center gap-1.5 text-[#7a4e10] dark:text-[#D4AA50]">
                  <Volume2 className="w-4 h-4" /> Recorded Audio Master
                </span>
                <span className="text-[#4f4b40] dark:text-[#A89F91]">
                  Duration: {formatTime(recordingDuration)}
                </span>
              </div>
              <audio src={audioUrl} controls className="w-full h-10 rounded-none accent-[#7a4e10]" />
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Audio File Upload */}
      {activeTab === "upload" && (
        <div className="border-2 border-dashed border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50] rounded-none p-8 text-center bg-[#F4F0E6] dark:bg-[#181614] transition-colors space-y-3 font-courier">
          <div className="w-12 h-12 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] mx-auto flex items-center justify-center text-[#7a4e10] dark:text-[#D4AA50] shadow-2xs rounded-none">
            <FileAudio className="w-6 h-6" />
          </div>
          <div>
            <p className="font-newsreader text-lg text-[#1d1d1b] dark:text-[#F0EAE1]">
              Select or drop an audio recording
            </p>
            <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] mt-0.5">
              Formats: .wav, .mp3, .m4a, .webm, .ogg · Maximum 25MB
            </p>
          </div>

          <label className="inline-block mt-2">
            <span className="px-4 py-2 bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] text-xs font-bold uppercase tracking-wider shadow-2xs cursor-pointer inline-flex items-center gap-1.5 rounded-none">
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
            <div className="mt-4 p-3 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] max-w-md mx-auto flex items-center justify-between text-xs rounded-none">
              <div className="flex items-center gap-2 truncate">
                <FileAudio className="w-4 h-4 text-[#7a4e10] dark:text-[#D4AA50] shrink-0" />
                <span className="font-bold text-[#1d1d1b] dark:text-[#F0EAE1] truncate">
                  {selectedFile.name}
                </span>
                <span className="text-[#4f4b40] dark:text-[#A89F91]">
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
                className="text-rose-700 dark:text-rose-400 hover:underline font-bold uppercase ml-2 text-[11px]"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
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

      {/* Verbatim Speech Transcript Preview */}
      {lastTranscribedText && (
        <div className="p-5 bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] space-y-3 font-courier rounded-none">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1]">
            <span className="flex items-center gap-1.5 text-[#7a4e10] dark:text-[#D4AA50]">
              <CheckCircle2 className="w-4 h-4" />
              Verbatim Speech Transcript ({lastTranscribedText.split(/\s+/).filter(Boolean).length} words)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(lastTranscribedText);
                  setCopiedTranscript(true);
                  setTimeout(() => setCopiedTranscript(false), 2000);
                }}
                className="text-xs text-[#1d1d1b] dark:text-[#F0EAE1] hover:underline font-bold uppercase px-2 py-0.5 bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer"
              >
                {copiedTranscript ? "Copied!" : "Copy"}
              </button>
              <span className="text-[11px] font-bold uppercase px-2 py-0.5 bg-[#E5DEC9] dark:bg-[#2C2723] text-[#7a4e10] dark:text-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C]">
                Synced to Editor
              </span>
            </div>
          </div>
          <div className="bg-[#EDE7D6] dark:bg-[#221F1C] p-4 border border-[#cfc7b2] dark:border-[#38332C] text-xs text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-text font-mono">
            {lastTranscribedText}
          </div>
        </div>
      )}

      {/* Transcribe Action Button */}
      <div className="flex items-center justify-end gap-3 pt-2 font-courier">
        <button
          type="button"
          disabled={
            isProcessing ||
            isRecording ||
            (activeTab === "record" && !audioBlob) ||
            (activeTab === "upload" && !selectedFile)
          }
          onClick={handleTranscribe}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F4F0E6] bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] rounded-none shadow-2xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {processingStep === 1
                  ? `Ingesting Audio (${processingElapsed}s)...`
                  : processingStep === 2
                  ? `FFmpeg Normalization (${processingElapsed}s)...`
                  : `Transcribing (${processingElapsed}s)...`}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-[#D4AA50] dark:text-[#181614]" />
              <span>Transcribe Voice Audio</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
