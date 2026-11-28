"use client";

import React, { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { askDecisionQuestion } from "@/lib/api";
import AskAiAvatar3D, { AvatarMood } from "@/components/AskAiAvatar3D";

interface AskAiDrawerProps {
  decisionId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function AskAiDrawer({
  decisionId,
  isOpen,
  onClose,
}: AskAiDrawerProps) {
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaHistory, setQaHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string; sources?: string[] }>
  >([]);
  const [justAnswered, setJustAnswered] = useState(false);

  useEffect(() => {
    if (!justAnswered) return;
    const timer = setTimeout(() => setJustAnswered(false), 3000);
    return () => clearTimeout(timer);
  }, [justAnswered]);

  if (!isOpen) return null;

  async function handleAskDecision(customQuestion?: string) {
    const q = (customQuestion ?? qaQuestion).trim();
    if (q.length < 2 || qaLoading) return;
    setQaQuestion("");
    setQaError(null);
    setJustAnswered(false);
    const nextHistory = [...qaHistory, { role: "user" as const, content: q }];
    setQaHistory(nextHistory);
    setQaLoading(true);
    try {
      const res = await askDecisionQuestion(
        decisionId,
        q,
        nextHistory.map((m) => ({ role: m.role, content: m.content }))
      );
      setQaHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer,
          sources: res.grounded_sources,
        },
      ]);
      setJustAnswered(true);
    } catch (err: unknown) {
      setQaError(err instanceof Error ? err.message : "Failed to answer question.");
    } finally {
      setQaLoading(false);
    }
  }

  const avatarState: AvatarMood = qaLoading
    ? "thinking"
    : justAnswered
    ? "speaking"
    : qaQuestion.trim().length > 0
    ? "listening"
    : "idle";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[1px] animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <aside
        className="relative z-10 w-full max-w-md h-full bg-[#F4F0E6] dark:bg-[#181614] border-l border-[#cfc7b2] dark:border-[#38332C] shadow-2xl flex flex-col font-sans animate-in slide-in-from-right duration-200"
        aria-label="Ask AI Decision Assistant"
      >
        {/* Top Drawer Bar */}
        <div className="px-4 py-3 bg-[#1d1d1b] dark:bg-[#221F1C] text-[#F4F0E6] border-b border-[#cfc7b2]/30 dark:border-[#38332C] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#D4AA50]" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              Ask AI · Decision Assistant
            </span>
          </div>
          <div className="flex items-center gap-3">
            {qaHistory.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQaHistory([]);
                  setQaError(null);
                }}
                className="text-[11px] font-mono text-[#D6CFC0] hover:text-white underline cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#D6CFC0] hover:text-white cursor-pointer"
              aria-label="Close Ask AI drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive 3D Owl Studio Stage */}
        <div className="px-4 py-3 bg-[#EDE5D5] dark:bg-[#221F1C] border-b border-[#cfc7b2] dark:border-[#38332C] flex items-center gap-3.5">
          <div className="border border-[#cfc7b2] dark:border-[#38332C] bg-[radial-gradient(circle_at_50%_42%,#FCF9F2_0%,#E7DFCC_72%,#D8CCB2_100%)] dark:bg-[#181614] shrink-0">
            <AskAiAvatar3D state={avatarState} size={112} />
          </div>
          <div className="min-w-0 space-y-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
              {qaLoading
                ? "Thinking · Scanning Stages 01–03..."
                : justAnswered
                ? "Grounded Answer Ready"
                : qaQuestion.trim().length > 0
                ? "Listening..."
                : "Ollie · Decision Advisor"}
            </span>
            <h4 className="font-newsreader text-base text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug">
              Ask a question or stress-test any trade-off
            </h4>
            <p className="text-[11px] font-mono text-[#57534e] dark:text-[#A89F91]">
              Drag to spin 360° or click Ollie to pat.
            </p>
          </div>
        </div>

        {/* Thread & Starter Prompts */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {qaHistory.length === 0 && (
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#57534e] dark:text-[#A89F91] block">
                Suggested Prompts
              </span>
              {[
                "What are the top 3 risks if we proceed?",
                "What happens if our budget or timeline shrinks by 20%?",
                "Summarize the recommendation in 3 bullets for leadership.",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleAskDecision(prompt)}
                  disabled={qaLoading}
                  className="w-full text-left px-3 py-2 text-xs font-mono bg-[#EDE5D5] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#E8E2D2] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {qaHistory.map((item, idx) => (
            <div
              key={idx}
              className={`p-3 text-xs leading-relaxed ${
                item.role === "user"
                  ? "bg-[#E5DEC9] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] font-semibold"
                  : "bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] border-l-2 border-l-[#7a4e10] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#E8E2D2] whitespace-pre-line"
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block mb-1">
                {item.role === "user" ? "Your Question" : "DecisionLens Advisor"}
              </span>
              <div>{item.content}</div>
              {item.sources && item.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#cfc7b2]/50 dark:border-[#38332C] flex flex-wrap gap-1">
                  {item.sources.map((src) => (
                    <span
                      key={src}
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-[#E5DEC9] dark:bg-[#221F1C] text-[#4f4b40] dark:text-[#A89F91]"
                    >
                      {src}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {qaLoading && (
            <div className="p-3 bg-[#EDE5D5] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-mono text-[#7a4e10] dark:text-[#D4AA50] animate-pulse">
              Analyzing decision record...
            </div>
          )}

          {qaError && (
            <div className="text-xs font-mono text-red-700 dark:text-red-400">
              {qaError}
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskDecision();
          }}
          className="p-3 bg-[#EDE5D5] dark:bg-[#221F1C] border-t border-[#cfc7b2] dark:border-[#38332C] flex items-center gap-2"
        >
          <input
            type="text"
            value={qaQuestion}
            onChange={(e) => setQaQuestion(e.target.value)}
            placeholder="Ask anything about this decision..."
            disabled={qaLoading}
            className="flex-1 px-3 py-2 text-xs bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-none text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7d7567] focus:outline-none focus:border-[#7a4e10] dark:focus:border-[#D4AA50]"
          />
          <button
            type="submit"
            disabled={qaLoading || qaQuestion.trim().length < 2}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[#F4F0E6] text-xs font-semibold rounded-none transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{qaLoading ? "Asking" : "Ask"}</span>
          </button>
        </form>
      </aside>
    </div>
  );
}
