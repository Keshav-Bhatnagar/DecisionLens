"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  updateTranscript,
  retryOriginalAudio,
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

  useEffect(() => {
    setTranscript(initialTranscript || "");
    setReviewed(isReviewed);
  }, [initialTranscript, isReviewed]);

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
      const res = await updateTranscript(decisionId, transcript, true);
      setReviewed(true);
      setSuccessMsg("Transcript successfully reviewed and saved!");
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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header and Status Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Meeting Transcript & Voice Notes
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Review and edit the speech-to-text output before structuring into decision categories.
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700">
            <Languages className="w-3.5 h-3.5 text-slate-500" />
            {language === "hi" ? "Hindi (hi)" : "English (en)"}
          </span>

          {reviewed ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified & Reviewed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-3.5 h-3.5" /> AI Generated (Unreviewed)
            </span>
          )}
        </div>
      </div>

      {/* Transcript Textarea */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold text-slate-700">Editable Transcript</span>
          <div className="flex items-center gap-3">
            <span>{wordCount} words</span>
            <span>•</span>
            <span>{transcript.length} characters</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium ml-2"
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
            // If text was modified after being reviewed, flag as pending re-review
            if (reviewed) setReviewed(false);
          }}
          placeholder="Recorded audio transcript will appear here. You can also write or paste conversation transcripts directly..."
          className="w-full text-sm font-sans text-slate-800 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors leading-relaxed"
        />
      </div>

      {/* Notification Alerts */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        {/* Retry unenhanced original audio button */}
        <button
          type="button"
          onClick={handleRetryOriginal}
          disabled={isRetrying || isSaving}
          title="Retry speech-to-text using the original unenhanced audio"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          {isRetrying
            ? "Re-transcribing Original..."
            : "Retry with Original Audio"}
        </button>

        {/* Save and Review Explicit Action */}
        <button
          type="button"
          onClick={handleSaveReviewed}
          disabled={isSaving || isRetrying || !transcript.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving Review..." : "Mark as Reviewed & Save"}
        </button>
      </div>
    </div>
  );
}
