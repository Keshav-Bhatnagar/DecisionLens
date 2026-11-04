"use client";

import ModalPortal from "@/components/ModalPortal";
import React, { useState, useEffect } from "react";
import {
  Users,
  X,
  UserPlus,
  Shield,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  UserCheck,
} from "lucide-react";
import {
  WorkspaceMember,
  getFolderMembers,
  addFolderMember,
  removeFolderMember,
  getDecisionMembers,
} from "@/lib/api";

interface WorkspaceMembersModalProps {
  folderId?: number;
  decisionId?: number;
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string;
  onMembersChanged?: () => void;
}

export default function WorkspaceMembersModal({
  folderId,
  decisionId,
  isOpen,
  onClose,
  currentUserEmail,
  onMembersChanged,
}: WorkspaceMembersModalProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authorityRole, setAuthorityRole] = useState("DevOps / SRE");
  const [accessRole, setAccessRole] = useState("editor");

  const loadMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      let data: WorkspaceMember[] = [];
      if (folderId) {
        data = await getFolderMembers(folderId);
      } else if (decisionId) {
        data = await getDecisionMembers(decisionId);
      }
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && (folderId || decisionId)) {
      loadMembers();
    }
  }, [isOpen, folderId, decisionId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || (!folderId && !decisionId)) return;

    setAdding(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const targetFolderId = folderId || (members[0]?.folder_id);
      if (!targetFolderId) {
        throw new Error("Target workspace folder could not be determined.");
      }

      await addFolderMember(targetFolderId, {
        email: email.trim().toLowerCase(),
        display_name: displayName.trim() || undefined,
        role: accessRole,
        authority_role: authorityRole,
      });

      setEmail("");
      setDisplayName("");
      setSuccessMsg(`Access granted to ${email.trim()}!`);
      await loadMembers();
      onMembersChanged?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add collaborator");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (member.role === "owner") return;
    if (!confirm(`Revoke workspace access for ${member.display_name || member.email}?`)) return;

    setRemovingId(member.id);
    setError(null);
    try {
      const targetFolderId = folderId || member.folder_id;
      await removeFolderMember(targetFolderId, member.id);
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  if (!isOpen) return null;

  const authorityColor = (role: string) => {
    switch (role) {
      case "DevOps / SRE":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "Lead Architect":
        return "bg-indigo-50 text-indigo-800 border-indigo-200";
      case "Security & Compliance":
        return "bg-rose-50 text-rose-800 border-rose-200";
      case "Product Manager":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Allowed Collaborators & Workspace Access
                </h3>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {members.length} Allowed
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Stakeholders authorized to inspect constraints, submit risks, and vote in this workspace.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Allowed Members List */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Active Allowed Members ({members.length})
            </span>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Loading allowed collaborators...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((m) => {
                  const isCurrent =
                    currentUserEmail &&
                    m.email.toLowerCase() === currentUserEmail.toLowerCase();
                  const initials = (m.display_name || m.email)
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <div
                      key={m.id || m.email}
                      className="p-3 bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 rounded-xl flex items-center justify-between gap-3 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar with Active dot */}
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                            {initials}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                              m.status === "active" ? "bg-emerald-500" : "bg-amber-400"
                            }`}
                            title={m.status === "active" ? "Active" : "Invited"}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {m.display_name || m.email.split("@")[0]}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
                                You
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 truncate block">
                            {m.email}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Authority Role Tag */}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${authorityColor(
                            m.authority_role
                          )}`}
                        >
                          {m.authority_role}
                        </span>

                        {/* Permission Level */}
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          {m.role}
                        </span>

                        {/* Delete action if not owner */}
                        {m.role !== "owner" && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m)}
                            disabled={removingId === m.id}
                            title="Revoke access"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          >
                            {removingId === m.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invite / Add Collaborator Form */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
              Add Stakeholder / Teammate
            </span>

            <form onSubmit={handleAddMember} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Sneha Patel"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Stakeholder Authority Role
                  </label>
                  <select
                    value={authorityRole}
                    onChange={(e) => setAuthorityRole(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="DevOps / SRE">DevOps / SRE</option>
                    <option value="Lead Architect">Lead Architect</option>
                    <option value="Security & Compliance">Security & Compliance</option>
                    <option value="Product Manager">Product Manager</option>
                    <option value="General / Team">General / Team Member</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Access Permission
                  </label>
                  <select
                    value={accessRole}
                    onChange={(e) => setAccessRole(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="editor">Editor (Can submit notes & vote)</option>
                    <option value="reviewer">Reviewer (Can comment & review)</option>
                    <option value="viewer">Viewer (Read-only)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={adding || !email.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {adding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  <span>Grant Workspace Access</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

