"use client";

import React, { useState } from "react";
import {
  X,
  Copy,
  CheckCircle2,
  FileText,
  MessageSquare,
  Mail,
  AlertTriangle,
  Calendar,
  User,
  Sparkles,
  Layers,
} from "lucide-react";
import { MeetingTakeawaysResponse } from "@/lib/api";

interface MeetingTakeawaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  takeaways: MeetingTakeawaysResponse | null;
  loading?: boolean;
}

export default function MeetingTakeawaysModal({
  isOpen,
  onClose,
  takeaways,
  loading = false,
}: MeetingTakeawaysModalProps) {
  const [activeTab, setActiveTab] = useState<"memo" | "slack" | "email">("memo");
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-courier animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#EDE7D6] text-[#1d1d1b] dark:bg-[#181614] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] rounded-none shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header Strip */}
        <div className="p-5 border-b border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-between bg-[#F4F0E6] dark:bg-[#221F1C]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                Company Meeting Takeaways · Executive Memo
              </span>
            </div>
            <h3 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
              {takeaways?.meeting_title || "Deliberation Minutes"}
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Format Switcher Bar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-[#EDE7D6] dark:bg-[#181614] border-b border-[#cfc7b2] dark:border-[#38332C] text-xs font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("memo")}
              className={`px-3 py-1.5 rounded-none transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                activeTab === "memo"
                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                  : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Executive Memo</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("slack")}
              className={`px-3 py-1.5 rounded-none transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                activeTab === "slack"
                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                  : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b]"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Slack / Teams Format</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("email")}
              className={`px-3 py-1.5 rounded-none transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                activeTab === "email"
                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614]"
                  : "text-[#4f4b40] dark:text-[#A89F91] hover:text-[#1d1d1b]"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email Format</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  activeTab === "slack"
                    ? takeaways?.slack_markdown || ""
                    : activeTab === "email"
                    ? takeaways?.email_body || ""
                    : `${takeaways?.executive_summary}\n\nDecisions:\n${takeaways?.decisions_made.join("\n")}`,
                  activeTab
                )
              }
              className="px-3 py-1 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] text-[#1d1d1b] dark:text-[#F0EAE1] text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedType === activeTab ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy {activeTab.toUpperCase()}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Body View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 select-text">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <span className="w-3 h-3 rounded-full bg-[#7a4e10] dark:bg-[#D4AA50] animate-ping inline-block" />
              <p className="text-xs uppercase tracking-wider text-[#4f4b40] dark:text-[#A89F91]">
                Synthesizing meeting dialogue, authority roles, and silent caveats...
              </p>
            </div>
          ) : takeaways ? (
            activeTab === "memo" ? (
              <div className="space-y-6">
                {/* 1. Executive Summary */}
                <div className="p-4 bg-[#F4F0E6] dark:bg-[#181614] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                    1. Executive Summary
                  </span>
                  <p className="text-sm font-newsreader text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed">
                    {takeaways.executive_summary}
                  </p>
                </div>

                {/* 2. Key Decisions Made */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                    2. Key Decisions & Strategic Choices ({takeaways.decisions_made.length})
                  </span>
                  <div className="space-y-1.5">
                    {takeaways.decisions_made.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2.5 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-xs"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="text-[#1d1d1b] dark:text-[#F0EAE1]">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Silent Stakeholder Caveats (The Superpower) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                      3. Unspoken Objections & Silent Caveats ({takeaways.hidden_risks.length})
                    </span>
                    <span className="text-[10px] text-[#4f4b40] dark:text-[#A89F91] uppercase">
                      From Silent Scribe
                    </span>
                  </div>
                  {takeaways.hidden_risks.length > 0 ? (
                    <div className="space-y-1.5">
                      {takeaways.hidden_risks.map((r, i) => (
                        <div
                          key={i}
                          className="p-3 bg-[#F4F0E6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                              [{r.category}] · {r.role}
                            </span>
                            <span className="px-1.5 py-0.2 bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 font-bold uppercase rounded-none">
                              {r.severity}
                            </span>
                          </div>
                          <p className="text-[#1d1d1b] dark:text-[#F0EAE1] leading-snug">
                            {r.note}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#4f4b40] dark:text-[#A89F91] italic">
                      No critical objections were recorded in this meeting.
                    </p>
                  )}
                </div>

                {/* 4. Action Item Matrix */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                    4. Action Item Matrix ({takeaways.action_items.length})
                  </span>
                  <div className="border border-[#cfc7b2] dark:border-[#38332C] overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F4F0E6] dark:bg-[#221F1C] border-b border-[#cfc7b2] dark:border-[#38332C] text-[10px] uppercase font-bold text-[#4f4b40] dark:text-[#A89F91]">
                        <tr>
                          <th className="p-2.5">Task & Deliverable</th>
                          <th className="p-2.5">Owner</th>
                          <th className="p-2.5">Priority</th>
                          <th className="p-2.5">Target</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#cfc7b2] dark:divide-[#38332C]">
                        {takeaways.action_items.map((a, i) => (
                          <tr key={i} className="hover:bg-[#F4F0E6]/50 dark:hover:bg-[#221F1C]/50">
                            <td className="p-2.5 font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">{a.task}</td>
                            <td className="p-2.5 text-[#4f4b40] dark:text-[#A89F91]">{a.owner}</td>
                            <td className="p-2.5">
                              <span className="uppercase text-[10px] font-bold text-[#7a4e10] dark:text-[#D4AA50]">
                                {a.priority}
                              </span>
                            </td>
                            <td className="p-2.5 text-[#4f4b40] dark:text-[#A89F91]">{a.deadline}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 5. Unresolved Questions */}
                {takeaways.unresolved_questions.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] block">
                      5. Open Follow-Up Questions ({takeaways.unresolved_questions.length})
                    </span>
                    <ul className="list-disc list-inside space-y-1 text-xs text-[#4f4b40] dark:text-[#A89F91]">
                      {takeaways.unresolved_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : activeTab === "slack" ? (
              <div className="space-y-3">
                <span className="text-xs text-[#4f4b40] dark:text-[#A89F91]">
                  Copy and paste directly into Slack or Microsoft Teams channels:
                </span>
                <pre className="p-4 bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#100E0D] text-xs font-mono whitespace-pre-wrap leading-relaxed border border-[#38332C] rounded-none overflow-x-auto">
                  {takeaways.slack_markdown}
                </pre>
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-xs text-[#4f4b40] dark:text-[#A89F91]">
                  Copy and paste into your email client to send to leadership and attendees:
                </span>
                <pre className="p-4 bg-[#F4F0E6] dark:bg-[#221F1C] text-[#1d1d1b] dark:text-[#F0EAE1] text-xs font-mono whitespace-pre-wrap leading-relaxed border border-[#cfc7b2] dark:border-[#38332C] rounded-none overflow-x-auto">
                  {takeaways.email_body}
                </pre>
              </div>
            )
          ) : (
            <div className="py-12 text-center text-xs text-[#4f4b40] dark:text-[#A89F91]">
              No meeting takeaways generated yet. Click "Generate Takeaways" to synthesize.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#cfc7b2] dark:border-[#38332C] bg-[#F4F0E6] dark:bg-[#221F1C] flex items-center justify-between">
          <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
            Synced with DecisionLens Deliberation Dossier
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F4F0E6] rounded-none cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

