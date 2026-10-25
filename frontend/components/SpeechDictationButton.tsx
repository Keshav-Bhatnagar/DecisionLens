"use client";

import { useState, useRef, useEffect } from "react";
import { Mic } from "lucide-react";

interface SpeechDictationButtonProps {
  onTranscript: (transcript: string) => void;
  title?: string;
  className?: string;
  language?: string;
}

export default function SpeechDictationButton({
  onTranscript,
  title = "Dictate with voice",
  className = "",
  language = "en-US",
}: SpeechDictationButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRec =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        setIsSupported(false);
      }
    }
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      alert("Voice dictation is supported in Chrome, Microsoft Edge, and Safari.");
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = language;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          }
        }
        if (finalTranscript.trim()) {
          onTranscript(finalTranscript.trim());
        }
      };

      rec.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        stopListening();
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      setIsListening(false);
    }
  };

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  return (
    <button
      type="button"
      onClick={toggleListening}
      title={isListening ? "Listening... Click to stop" : title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all focus:outline-none cursor-pointer ${
        isListening
          ? "bg-red-50 text-red-600 border border-red-200 animate-pulse font-medium shadow-xs"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 bg-white shadow-2xs"
      } ${className}`}
    >
      {isListening ? (
        <>
          <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
          <Mic className="w-3.5 h-3.5 text-red-600" />
          <span className="text-[11px] font-medium text-red-600">Listening...</span>
        </>
      ) : (
        <>
          <Mic className="w-3.5 h-3.5 text-slate-500 hover:text-indigo-600" />
          <span className="text-[11px] font-medium text-slate-600">Voice mic</span>
        </>
      )}
    </button>
  );
}
