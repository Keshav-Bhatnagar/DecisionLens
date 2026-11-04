"use client";

import React, { useState, useEffect, use } from "react";
import {
  Lock,
  Send,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ExternalLink,
  Sparkles,
  Loader2,
} from "lucide-react";
import MeetingTakeawaysModal from "@/components/MeetingTakeawaysModal";
import { getMeetingTakeaways, MeetingTakeawaysResponse } from "@/lib/api";

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

export default function ScribeCompanionPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  const { decisionId: decisionIdStr } = use(params);
  const decisionId = parseInt(decisionIdStr, 10);

  const [category, setCategory] = useState<"risk" | "constraint" | "alternative" | "criteria">("risk");
  const [authorRole, setAuthorRole] = useState("DevOps / SRE");
  const [isAddingCustomRole, setIsAddingCustomRole] = useState(false);
  const [customRoleText, setCustomRoleText] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [notesList, setNotesList] = useState<SilentNote[]>([]);
  const [dispatchedSuccess, setDispatchedSuccess] = useState(false);
  const [showTakeawaysModal, setShowTakeawaysModal] = useState(false);
  const [takeawaysData, setTakeawaysData] = useState<MeetingTakeawaysResponse | null>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  const handleGenerateTakeaways = async () => {
    setIsGeneratingTakeaways(true);
    setShowTakeawaysModal(true);
    try {
      const res = await getMeetingTakeaways(decisionId, {
        notes: notesList,
      });
      setTakeawaysData(res);
    } catch (err) {
      console.warn("Could not generate meeting takeaways:", err);
    } finally {
      setIsGeneratingTakeaways(false);
    }
  };

  // Load from localStorage on mount and sync on storage events
  useEffect(() => {
    const storageKey = `decisionlens_caveats_${decisionId}`;
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
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [decisionId]);

  const handleApplyCustomRole = () => {
    if (customRoleText.trim()) {
      setAuthorRole(customRoleText.trim());
      setIsAddingCustomRole(false);
    }
  };

  const handleSubmitNote = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!noteContent.trim()) return;

    const rolePrefix = authorRole ? `[${authorRole}] ` : "";
    const newNote: SilentNote = {
      id: `note-${Date.now()}`,
      category,
      content: `${rolePrefix}${noteContent.trim()}`,
      author: isAnonymous ? `Anonymous (${authorRole})` : `Member (${authorRole})`,
      isAnonymous,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updated = [newNote, ...notesList];
    setNotesList(updated);
    setNoteContent("");
    setDispatchedSuccess(true);
    setTimeout(() => setDispatchedSuccess(false), 2000);

    const storageKey = `decisionlens_caveats_${decisionId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-[#EDE7D6] text-[#1d1d1b] dark:bg-[#181614] dark:text-[#F0EAE1] font-courier p-4 flex flex-col justify-between select-text">
      <div className="space-y-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-[#cfc7b2] dark:border-[#38332C] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Scribe Companion · #{decisionId}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleGenerateTakeaways}
            disabled={isGeneratingTakeaways}
            className="px-2 py-0.5 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9] text-[#7a4e10] dark:text-[#D4AA50] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            {isGeneratingTakeaways ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <Sparkles className="w-2.5 h-2.5" />
            )}
            <span>Takeaways</span>
          </button>
        </div>

        {/* Category Selector */}
        <div className="space-y-1">
          <span className="text-[10px] text-[#4f4b40] dark:text-[#A89F91] font-bold uppercase tracking-wider block">
            Category:
          </span>
          <div className="grid grid-cols-4 gap-1 text-[11px] font-bold uppercase tracking-wider">
            {(["risk", "constraint", "alternative", "criteria"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`py-1.5 rounded-none border text-center transition-colors cursor-pointer ${
                  category === cat
                    ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-[#1d1d1b] dark:border-[#D4AA50]"
                    : "bg-[#F4F0E6] dark:bg-[#221F1C] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Authority Role Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-[#4f4b40] dark:text-[#A89F91] font-bold uppercase tracking-wider">
            <span>Role:</span>
            <span className="text-[#7a4e10] dark:text-[#D4AA50] font-bold">
              [{authorRole}]
            </span>
          </div>

          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
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
                    : "bg-[#F4F0E6] dark:bg-[#221F1C] text-[#4f4b40] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
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
                  : "bg-[#F4F0E6] dark:bg-[#221F1C] text-[#7a4e10] dark:text-[#D4AA50] border-[#cfc7b2] dark:border-[#38332C]"
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Custom</span>
            </button>
          </div>

          {isAddingCustomRole && (
            <div className="flex gap-1 pt-1">
              <input
                type="text"
                value={customRoleText}
                onChange={(e) => setCustomRoleText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyCustomRole();
                }}
                placeholder="Type custom role..."
                className="flex-1 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-xs px-2 py-1 text-[#1d1d1b] dark:text-[#F0EAE1] focus:border-[#7a4e10] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleApplyCustomRole}
                disabled={!customRoleText.trim()}
                className="px-2 py-1 bg-[#1d1d1b] dark:bg-[#D4AA50] text-[#F4F0E6] dark:text-[#181614] text-[10px] font-bold uppercase disabled:opacity-40"
              >
                Set
              </button>
            </div>
          )}
        </div>

        {/* Note Textarea */}
        <div className="space-y-2">
          <textarea
            rows={4}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmitNote(e);
              }
            }}
            placeholder={
              category === "risk"
                ? "Type unsaid bottleneck or technical risk (Ctrl+Enter to send)..."
                : "Type objection, criteria or constraint (Ctrl+Enter to send)..."
            }
            className="w-full bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none p-3 text-xs text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none resize-none font-newsreader text-sm leading-relaxed"
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-[#4f4b40] dark:text-[#A89F91] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="accent-[#7a4e10] dark:accent-[#D4AA50] cursor-pointer"
              />
              <span className="text-[11px]">Anonymous</span>
            </label>

            <button
              type="button"
              onClick={handleSubmitNote}
              disabled={!noteContent.trim()}
              className="px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F4F0E6] transition-colors shadow-2xs disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5"
            >
              {dispatchedSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 dark:text-[#181614]" />
                  <span>Logged!</span>
                </>
              ) : (
                <>
                  <Send className="w-3 h-3" />
                  <span>Dispatch</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Caveats Feed in companion */}
        {notesList.length > 0 && (
          <div className="pt-3 border-t border-[#cfc7b2] dark:border-[#38332C] space-y-2">
            <span className="text-[10px] text-[#4f4b40] dark:text-[#A89F91] font-bold uppercase tracking-wider block">
              Dispatched Caveats ({notesList.length})
            </span>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {notesList.map((n) => (
                <div
                  key={n.id}
                  className="p-2 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[11px] space-y-0.5"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase">
                      [{n.category}]
                    </span>
                    <span className="text-[#4f4b40] dark:text-[#A89F91]">
                      {n.author} • {n.timestamp}
                    </span>
                  </div>
                  <p className="text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug">
                    {n.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 text-center border-t border-[#cfc7b2]/60 dark:border-[#38332C]/60 text-[10px] text-[#4f4b40] dark:text-[#A89F91]">
        Synced live with DecisionLens main deliberation canvas.
      </div>

      <MeetingTakeawaysModal
        isOpen={showTakeawaysModal}
        onClose={() => setShowTakeawaysModal(false)}
        takeaways={takeawaysData}
        loading={isGeneratingTakeaways}
      />
    </div>
  );
}

