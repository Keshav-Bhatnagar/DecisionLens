"use client";

import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { getMeetingTakeaways, MeetingTakeawaysResponse } from "@/lib/api";
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
  const [showTakeawaysModal, setShowTakeawaysModal] = useState(false);
  const [takeawaysData, setTakeawaysData] = useState<MeetingTakeawaysResponse | null>(null);
  const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);

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
    <div className="space-y-4">
      {/* Autonomous Google Meet Bot Panel */}
      <GoogleMeetBotPanel
        decisionId={decisionId}
        decisionTitle={decisionTitle}
        extraHeaderAction={
          <button
            type="button"
            onClick={handleGenerateTakeaways}
            disabled={isGeneratingTakeaways}
            title="Generate executive summary, risks, and action items from this meeting's transcript"
            className="px-3 py-1.5 rounded-none text-xs font-semibold text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#E5DEC9] hover:bg-[#DDD4BC] dark:bg-[#181614] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            {isGeneratingTakeaways && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            <span>Summarize Meeting</span>
          </button>
        }
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
