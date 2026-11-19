"use client";

import React, { useState, useEffect } from "react";
import WorkspaceMembersPill from "@/components/WorkspaceMembersPill";
import { Sparkles, Loader2 } from "lucide-react";
import { getMe, getMeetingTakeaways, MeetingTakeawaysResponse, User } from "@/lib/api";
import MeetingTakeawaysModal from "@/components/MeetingTakeawaysModal";
import GoogleMeetBotPanel from "@/components/GoogleMeetBotPanel";

export interface SilentNote {
  id: string;
  category: "risk" | "constraint" | "alternative" | "criteria";
  content: string;
  author: string;
  isAnonymous: boolean;
  timestamp: string;
}

interface LiveMeetingRoomProps {
  decisionId: number;
  decisionTitle: string;
  onFinishMeeting: (data?: {
    notes?: SilentNote[];
    criteriaWeights?: { speed: number; cost: number; reliability: number };
    transcript?: string;
  }) => void;
  recordType?: string;
}

export default function LiveMeetingRoom({
  decisionId,
  decisionTitle,
  onFinishMeeting,
  recordType = "decision",
}: LiveMeetingRoomProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showTakeawaysModal, setShowTakeawaysModal] = useState(false);
  const [takeawaysData, setTakeawaysData] = useState<MeetingTakeawaysResponse | null>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

  useEffect(() => {
    getMe()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null));
  }, []);

  const handleGenerateTakeaways = async () => {
    setIsGeneratingTakeaways(true);
    try {
      const data = await getMeetingTakeaways(decisionId);
      setTakeawaysData(data);
      setShowTakeawaysModal(true);
    } catch (err) {
      console.warn("Could not generate meeting takeaways:", err);
      setTakeawaysData({
        decision_id: decisionId,
        meeting_title: decisionTitle,
        executive_summary: "No meeting takeaways generated yet. The meeting bot must complete recording dialogue first.",
        decisions_made: [],
        hidden_risks: [],
        action_items: [],
        unresolved_questions: [],
        slack_markdown: "No takeaways yet.",
        email_body: "No takeaways yet.",
      });
      setShowTakeawaysModal(true);
    } finally {
      setIsGeneratingTakeaways(false);
    }
  };

  return (
    <div className="bg-[#EDE7D6] dark:bg-[#221F1C] border border-l-4 border-[#cfc7b2] border-l-[#7a4e10] dark:border-[#38332C] dark:border-l-[#D4AA50] rounded-none p-5 sm:p-7 shadow-2xs space-y-6 transition-colors font-courier">
      {/* Studio Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#cfc7b2]/70 dark:border-[#38332C]/70">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-newsreader text-2xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
              Live Deliberation & Meeting Bot Studio
            </h2>
          </div>
          <p className="text-xs text-[#4f4b40] dark:text-[#A89F91]">
            Autonomous meeting bot: joins your Google Meet call, transcribes discussions with AI distraction filtering, and captures confidential stakeholder input.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <WorkspaceMembersPill decisionId={decisionId} currentUserEmail={currentUser?.email} />

          {/* Company Meeting Takeaways Trigger */}
          <button
            type="button"
            onClick={handleGenerateTakeaways}
            disabled={isGeneratingTakeaways}
            title="Generate executive meeting takeaways, action matrix, and company memos"
            className="px-3.5 py-2 rounded-none text-xs font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#F4F0E6] hover:bg-[#E5DEC9] dark:bg-[#181614] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            {isGeneratingTakeaways ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
            )}
            <span>Meeting Takeaways</span>
          </button>
        </div>
      </div>

      {/* Autonomous Google Meet Bot Panel */}
      <GoogleMeetBotPanel
        decisionId={decisionId}
        decisionTitle={decisionTitle}
        onAnalysisCompleted={(res) => {
          onFinishMeeting({
            notes: [],
            criteriaWeights: { speed: 33, cost: 33, reliability: 34 },
            transcript: res.transcript,
          });
        }}
      />

      {/* Company Meeting Takeaways Modal */}
      <MeetingTakeawaysModal
        isOpen={showTakeawaysModal}
        onClose={() => setShowTakeawaysModal(false)}
        takeaways={takeawaysData}
        loading={isGeneratingTakeaways}
      />
    </div>
  );
}
