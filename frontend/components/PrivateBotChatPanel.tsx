"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Shield,
  Send,
  Lock,
  Sparkles,
  User,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  MessageSquare,
} from "lucide-react";
import {
  PrivateChatMessage,
  sendPrivateChatMessage,
  getPrivateChatMessages,
} from "@/lib/api";

interface PrivateBotChatPanelProps {
  decisionId: number;
  sessionId: number;
  decisionTitle: string;
  onMessageSent?: (msg: PrivateChatMessage) => void;
}

const PRESET_ROLES = [
  "Lead Architect",
  "DevOps / SRE",
  "Backend Engineer",
  "Junior Developer",
  "Security & CISO",
  "QA & Reliability",
  "Product Manager",
  "FinOps / Finance",
  "Data Platform",
  "Executive / VP",
];

const CATEGORIES = [
  { id: "concern", label: "Unspoken Concern", desc: "Risks you hesitate to voice openly" },
  { id: "fact", label: "Hidden Fact / Metric", desc: "Telemetry or data not mentioned yet" },
  { id: "opinion", label: "Dissenting Opinion", desc: "A counter-perspective to the consensus" },
  { id: "alternative", label: "Alternative Option", desc: "Another architecture or tool to explore" },
  { id: "constraint", label: "Real Constraint", desc: "Budget, skill, or timeline roadblocks" },
] as const;

export default function PrivateBotChatPanel({
  decisionId,
  sessionId,
  decisionTitle,
  onMessageSent,
}: PrivateBotChatPanelProps) {
  const [messages, setMessages] = useState<PrivateChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [category, setCategory] = useState<"concern" | "fact" | "opinion" | "alternative" | "constraint">("concern");
  const [authorRole, setAuthorRole] = useState("DevOps / SRE");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [impactLevel, setImpactLevel] = useState<"critical" | "high" | "medium" | "low">("high");

  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Load chat history
  const loadMessages = async () => {
    try {
      const data = await getPrivateChatMessages(decisionId, sessionId);
      setMessages(data);
    } catch (err) {
      console.warn("Could not load private chat messages:", err);
    }
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 6000);
    return () => clearInterval(interval);
  }, [decisionId, sessionId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending) return;

    setIsSending(true);
    const content = inputMessage.trim();
    setInputMessage("");

    try {
      const res = await sendPrivateChatMessage(
        decisionId,
        sessionId,
        content,
        category,
        authorRole,
        isAnonymous,
        impactLevel
      );
      setMessages((prev) => [...prev, res]);
      if (onMessageSent) onMessageSent(res);
    } catch (err) {
      console.error("Failed to send private chat message:", err);
      // Restore on failure
      setInputMessage(content);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FCFBF8] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm shadow-xs font-courier">
      {/* Privacy Notice Banner */}
      <div className="p-3.5 bg-[#EDE7D6] dark:bg-[#221F1C] border-b border-[#cfc7b2] dark:border-[#38332C] flex items-start gap-2.5">
        <div className="text-[13px] leading-snug">
          <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider block">
            Psychological Safety Portal • 100% Confidential
          </span>
          <p className="text-[#6e655a] dark:text-[#A89F91] text-[12px] mt-0.5">
            Share private facts, hidden concerns, or dissenting opinions directly with the DecisionLens bot.
            The bot will weigh your input into the fault lines and risk analysis without ever revealing your identity.
          </p>
        </div>
      </div>

      {/* Role & Anonymity Controls */}
      <div className="p-3 bg-[#F5F1E8] dark:bg-[#1C1917] border-b border-[#cfc7b2] dark:border-[#38332C] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[#6e655a] dark:text-[#A89F91] uppercase tracking-wider font-bold">Your Role:</span>
            <select
              value={authorRole}
              onChange={(e) => setAuthorRole(e.target.value)}
              className="bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] px-2 py-0.5 text-[12px] rounded-none focus:outline-none"
            >
              {PRESET_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded-none border-[#cfc7b2] accent-[#7a4e10]"
            />
            <span className="text-[#7a4e10] dark:text-[#D4AA50] font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Keep strictly Anonymous
            </span>
          </label>
        </div>

        {/* Category Selector Chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id as any)}
              className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-colors border ${
                category === cat.id
                  ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-transparent"
                  : "bg-[#EDE7D6] dark:bg-[#221F1C] text-[#6e655a] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-[220px] max-h-[360px]">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-[#6e655a] dark:text-[#A89F91] space-y-1.5">
            <MessageSquare className="w-6 h-6 mx-auto opacity-40" />
            <p className="text-[13px] font-medium">No confidential messages submitted yet.</p>
            <p className="text-[11px] max-w-sm mx-auto">
              Type any concern or private reason below. The bot will review it and confirm how it will be factored into the decision analysis.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {/* Participant's Message */}
              <div className="flex flex-col items-end">
                <div className="max-w-[85%] bg-[#EDE7D6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] p-2.5 rounded-sm space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#6e655a] dark:text-[#A89F91]">
                    <span className="font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                      {msg.category.toUpperCase()} • {msg.author_role}
                    </span>
                    <span>{msg.is_anonymous ? "(Anonymous)" : msg.author_name}</span>
                  </div>
                  <p className="text-[13px] text-[#1d1d1b] dark:text-[#F0EAE1] leading-relaxed">
                    {msg.message}
                  </p>
                </div>
              </div>

              {/* Bot's Direct Reply */}
              {msg.bot_response && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[88%] bg-[#FCFBF8] dark:bg-[#1C1917] border-l-2 border-l-[#7a4e10] dark:border-l-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] p-2.5 rounded-sm space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                      DecisionLens Bot Response
                    </div>
                    <p className="text-[12px] text-[#4f4b40] dark:text-[#A89F91] leading-relaxed">
                      {msg.bot_response}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="p-3 bg-[#F5F1E8] dark:bg-[#1C1917] border-t border-[#cfc7b2] dark:border-[#38332C]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={`Privately share a ${category} with the bot...`}
            disabled={isSending}
            className="flex-1 bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] px-3 py-2 text-[13px] rounded-none focus:outline-none placeholder:text-[#97907e]"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isSending}
            className="px-3.5 py-2 bg-[#1d1d1b] hover:bg-[#443a30] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] text-[12px] font-bold uppercase tracking-wider rounded-none disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
