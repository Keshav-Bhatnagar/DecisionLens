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

  if (!isSupported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      title={isListening ? "Listening... Click to stop" : title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-courier font-bold uppercase tracking-wider rounded-none transition-colors focus:outline-none cursor-pointer ${
        isListening
          ? "bg-rose-900/10 text-rose-700 dark:text-rose-400 border border-rose-500 animate-pulse shadow-2xs"
          : "text-[#1d1d1b] dark:text-[#F0EAE1] hover:text-[#7a4e10] dark:hover:text-[#D4AA50] bg-[#F4F0E6] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] shadow-2xs"
      } ${className}`}
    >
      {isListening ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
          <Mic className="w-3 h-3 text-rose-600" />
          <span>Listening...</span>
        </>
      ) : (
        <>
          <Mic className="w-3 h-3 text-[#7a4e10] dark:text-[#D4AA50]" />
          <span>Voice Dictate</span>
        </>
      )}
    </button>
  );
}
