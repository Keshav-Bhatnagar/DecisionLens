"use client";

import React, { useState, useEffect, useRef, use } from "react";
import {
  Shield,
  Send,
  Lock,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
} from "lucide-react";
import {
  PublicBotInviteInfo,
  PrivateChatMessage,
  getPublicBotInviteInfo,
  sendPublicPrivateChatMessage,
  getPublicChatHistory,
} from "@/lib/api";

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
  "Founder / Exec",
];

const CATEGORIES = [
  { id: "concern", label: "Unspoken Concern", desc: "A risk or flaw you hesitate to voice out loud" },
  { id: "fact", label: "Hidden Fact / Metric", desc: "Empirical data, production outage history, or SLA" },
  { id: "opinion", label: "Dissenting Opinion", desc: "A disagreement with the meeting consensus" },
  { id: "alternative", label: "Alternative Option", desc: "Another approach or stack that should be considered" },
  { id: "constraint", label: "Real Constraint", desc: "A budget limit, skill gap, or deadline blocker" },
] as const;

export default function PublicMeetChatPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [inviteInfo, setInviteInfo] = useState<PublicBotInviteInfo | null>(null);
  const [messages, setMessages] = useState<PrivateChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [messageInput, setMessageInput] = useState("");
  const [category, setCategory] = useState<"concern" | "fact" | "opinion" | "alternative" | "constraint">("concern");
  const [authorRole, setAuthorRole] = useState("DevOps / SRE");
  const [authorName, setAuthorName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const info = await getPublicBotInviteInfo(token);
        setInviteInfo(info);
        const history = await getPublicChatHistory(token);
        setMessages(history);
      } catch (err: any) {
        console.error("Invite lookup error:", err);
        setErrorMsg("This private chat link is invalid or has expired.");
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [token]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || isSending) return;

    setIsSending(true);
    const content = messageInput.trim();
    setMessageInput("");

    try {
      const res = await sendPublicPrivateChatMessage(
        token,
        content,
        category,
        authorRole,
        isAnonymous,
        isAnonymous ? "Anonymous" : authorName.trim() || "Participant"
      );
      setMessages((prev) => [...prev, res]);
    } catch (err: any) {
      console.error("Could not send private message:", err);
      setMessageInput(content);
      setErrorMsg("Failed to deliver message to the DecisionLens bot. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#181614] flex items-center justify-center p-4 font-courier">
        <div className="flex items-center gap-3 text-[#7a4e10] dark:text-[#D4AA50]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px] font-bold uppercase tracking-wider">Connecting to DecisionLens Bot...</span>
        </div>
      </div>
    );
  }

  if (errorMsg && !inviteInfo) {
    return (
      <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#181614] flex items-center justify-center p-4 font-courier">
        <div className="max-w-md w-full bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <h2 className="font-newsreader text-xl font-bold">Link Not Available</h2>
          <p className="text-[13px] text-[#6e655a] dark:text-[#A89F91]">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F1E8] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] font-courier flex flex-col items-center justify-start py-6 px-3 sm:px-6">
      <div className="max-w-3xl w-full bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-sm shadow-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-[#EDE7D6] dark:bg-[#1C1917] border-b border-[#cfc7b2] dark:border-[#38332C] space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#7a4e10] dark:text-[#D4AA50] text-[12px] font-bold uppercase tracking-wider">
              <Shield className="w-4 h-4" />
              DecisionLens Confidential Meeting Portal
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              Encrypted & Safe
            </span>
          </div>

          <h1 className="font-newsreader text-2xl font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
            {inviteInfo?.decision_title}
          </h1>

          <p className="text-[12px] text-[#6e655a] dark:text-[#A89F91] leading-relaxed">
            You are speaking privately with the DecisionLens bot attending this call.
            Share reasons, technical facts, unmentioned constraints, or doubts you hesitated to speak about in the meeting.
            The bot will synthesize your input into the architecture trade-offs without revealing who you are.
          </p>
        </div>

        {/* Participant Settings */}
        <div className="p-4 bg-[#F5F1E8] dark:bg-[#221F1C] border-b border-[#cfc7b2] dark:border-[#38332C] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <label className="font-bold uppercase tracking-wider text-[#6e655a] dark:text-[#A89F91] block mb-1">
                Your Role:
              </label>
              <select
                value={authorRole}
                onChange={(e) => setAuthorRole(e.target.value)}
                className="w-full bg-[#FCFBF8] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] px-3 py-1.5 text-[13px] rounded-none focus:outline-none"
              >
                {PRESET_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center sm:justify-end pt-4 sm:pt-0">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded-none border-[#cfc7b2] accent-[#7a4e10] w-4 h-4"
                />
                <span className="text-[13px] font-bold text-[#7a4e10] dark:text-[#D4AA50] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Keep strictly Anonymous (Recommended)
                </span>
              </label>
            </div>
          </div>

          {/* Category Chips */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6e655a] dark:text-[#A89F91] block">
              Classification of your input:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id as any)}
                  className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors border ${
                    category === cat.id
                      ? "bg-[#1d1d1b] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] border-transparent"
                      : "bg-[#EDE7D6] dark:bg-[#181614] text-[#6e655a] dark:text-[#A89F91] border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[260px] max-h-[420px] bg-[#FCFBF8] dark:bg-[#181614]">
          {messages.length === 0 ? (
            <div className="text-center py-10 text-[#6e655a] dark:text-[#A89F91] space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-[14px] font-medium">Nothing shared yet.</p>
              <p className="text-[12px] max-w-sm mx-auto">
                Type your thoughts below. The bot will validate your concern and confirm that it will be factored into the decision analysis.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                {/* Participant message */}
                <div className="flex flex-col items-end">
                  <div className="max-w-[85%] bg-[#EDE7D6] dark:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] p-3 rounded-sm space-y-1">
                    <div className="flex items-center justify-between gap-3 text-[11px] text-[#6e655a] dark:text-[#A89F91]">
                      <span className="font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
                        {msg.category.toUpperCase()} • {msg.author_role}
                      </span>
                      <span>{msg.is_anonymous ? "(Anonymous)" : msg.author_name}</span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-[#1d1d1b] dark:text-[#F0EAE1]">
                      {msg.message}
                    </p>
                  </div>
                </div>

                {/* Bot response */}
                {msg.bot_response && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[90%] bg-[#FCFBF8] dark:bg-[#221F1C] border-l-2 border-l-[#7a4e10] dark:border-l-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] p-3 rounded-sm space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" />
                        DecisionLens Bot Reply
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

        {/* Input */}
        <form onSubmit={handleSendMessage} className="p-4 bg-[#F5F1E8] dark:bg-[#1C1917] border-t border-[#cfc7b2] dark:border-[#38332C]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={`Share your confidential ${category} with the bot...`}
              disabled={isSending}
              className="flex-1 bg-[#FCFBF8] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] px-3.5 py-2 text-[13px] rounded-none focus:outline-none placeholder:text-[#97907e]"
            />
            <button
              type="submit"
              disabled={!messageInput.trim() || isSending}
              className="px-4 py-2 bg-[#1d1d1b] hover:bg-[#443a30] text-[#F4F0E6] dark:bg-[#D4AA50] dark:text-[#181614] text-[12px] font-bold uppercase tracking-wider rounded-none disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
