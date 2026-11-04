"use client";

import React, { useState, useEffect } from "react";
import { Users, Plus } from "lucide-react";
import { WorkspaceMember, getFolderMembers, getDecisionMembers } from "@/lib/api";
import WorkspaceMembersModal from "./WorkspaceMembersModal";

interface WorkspaceMembersPillProps {
  folderId?: number;
  decisionId?: number;
  currentUserEmail?: string;
  className?: string;
}

export default function WorkspaceMembersPill({
  folderId,
  decisionId,
  currentUserEmail,
  className = "",
}: WorkspaceMembersPillProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showModal, setShowModal] = useState(false);

  const fetchMembers = async () => {
    try {
      let data: WorkspaceMember[] = [];
      if (folderId) {
        data = await getFolderMembers(folderId);
      } else if (decisionId) {
        data = await getDecisionMembers(decisionId);
      }
      setMembers(data);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (folderId || decisionId) {
      fetchMembers();
    }
  }, [folderId, decisionId]);

  if (!folderId && !decisionId) return null;

  const displayMembers = members.slice(0, 3);
  const remainingCount = Math.max(0, members.length - 3);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`group inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xs bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2A2622] border border-[#cfc7b2] dark:border-[#38332C] transition-colors cursor-pointer select-none font-courier ${className}`}
        title="View allowed workspace collaborators and manage access"
      >
        {/* Avatars Stack: Plain bordered circles with mono initials */}
        <div className="flex items-center -space-x-1 overflow-hidden">
          {displayMembers.map((m, idx) => {
            const initial = (m.display_name || m.email).charAt(0).toUpperCase();
            return (
              <div
                key={m.id || idx}
                className="w-5 h-5 rounded-full border border-[#cfc7b2] dark:border-[#38332C] bg-[#F4F0E6] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] flex items-center justify-center font-courier text-[10px] font-bold shrink-0"
                title={`${m.display_name || m.email} (${m.authority_role})`}
              >
                {initial}
              </div>
            );
          })}
          {remainingCount > 0 && (
            <div className="w-5 h-5 rounded-full border border-[#cfc7b2] dark:border-[#38332C] bg-[#DFD7C0] dark:bg-[#2A2622] text-[#4f4b40] dark:text-[#A89F91] flex items-center justify-center font-courier text-[9px] font-bold shrink-0">
              +{remainingCount}
            </div>
          )}
        </div>

        {/* Text Label & Status Dot */}
        <div className="flex items-center gap-1.5 text-[12px] font-courier font-bold uppercase tracking-[0.08em] text-[#1d1d1b] dark:text-[#F0EAE1]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1B4332] dark:bg-[#52b788]" />
          <span>
            {members.length > 0 ? `${members.length} ALLOWED` : "ADD MEMBERS"}
          </span>
        </div>
      </button>

      {/* Modal */}
      <WorkspaceMembersModal
        folderId={folderId}
        decisionId={decisionId}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        currentUserEmail={currentUserEmail}
        onMembersChanged={fetchMembers}
      />
    </>
  );
}

