"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useTheme } from "@/context/ThemeContext";
import {
  getMe,
  getFolders,
  getDecisions,
  changePassword,
  updateProfile,
  clearStoredToken,
  User,
  Folder,
  Decision,
} from "@/lib/api";
import {
  LogOut,
  Sun,
  Moon,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  Shield,
  Zap,
  Scale,
  Folder as FolderIcon,
  Layers,
  Sparkles,
  Lock,
  Volume2,
  Sliders,
  CheckCircle,
  Key,
  Database,
  ExternalLink,
  Pencil,
  Clock,
} from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // User & Data State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  // Calibration Settings (Persisted to localStorage)
  const [defaultLanguage, setDefaultLanguage] = useState<string>("en");
  const [audioEnhancement, setAudioEnhancement] = useState<boolean>(true);
  const [defaultTrack, setDefaultTrack] = useState<"deep" | "express">("deep");
  const [prefSavedMsg, setPrefSavedMsg] = useState(false);

  // Password Accordion State
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Export State
  const [exportingData, setExportingData] = useState(false);

  // Username / Display Name Editing State
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleStartEditName = () => {
    setEditedName(currentUser?.display_name || currentUser?.email.split("@")[0] || "");
    setIsEditingName(true);
    setNameError(null);
    setNameSuccess(null);
  };

  const handleSaveName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = editedName.trim();
    if (!clean) {
      setNameError("Name cannot be empty.");
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const updated = await updateProfile({ display_name: clean });
      setCurrentUser(updated);
      setIsEditingName(false);
      setNameSuccess(`Username updated to "${clean}"`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("user-profile-updated", { detail: updated }));
      }
      setTimeout(() => setNameSuccess(null), 3500);
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  };

  // Load Settings from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("dl_pref_lang");
      if (savedLang) setDefaultLanguage(savedLang);

      const savedAudio = localStorage.getItem("dl_pref_audio");
      if (savedAudio !== null) setAudioEnhancement(savedAudio === "true");

      const savedTrack = localStorage.getItem("dl_pref_track");
      if (savedTrack === "deep" || savedTrack === "express") setDefaultTrack(savedTrack);
    }
  }, []);

  const savePreferences = (lang: string, audio: boolean, track: "deep" | "express") => {
    setDefaultLanguage(lang);
    setAudioEnhancement(audio);
    setDefaultTrack(track);
    if (typeof window !== "undefined") {
      localStorage.setItem("dl_pref_lang", lang);
      localStorage.setItem("dl_pref_audio", String(audio));
      localStorage.setItem("dl_pref_track", track);
    }
    setPrefSavedMsg(true);
    setTimeout(() => setPrefSavedMsg(false), 2400);
  };

  // Load Profile Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getMe();
      setCurrentUser(user);
      if (user) {
        const [folderList, decisionList] = await Promise.all([
          getFolders().catch(() => []),
          getDecisions().catch(() => []),
        ]);
        setFolders(folderList);
        setDecisions(decisionList);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Metrics
  const decidedCount = useMemo(
    () => decisions.filter((d) => d.status === "decided").length,
    [decisions]
  );
  const evaluatingCount = useMemo(
    () => decisions.filter((d) => d.status === "evaluating").length,
    [decisions]
  );
  const consensusRate = useMemo(() => {
    if (decisions.length === 0) return 0;
    return Math.round((decidedCount / decisions.length) * 100);
  }, [decisions, decidedCount]);

  const joinedDate = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "Active Member";

  const shortUid = currentUser?.id
    ? `UID-${currentUser.id.toString().padStart(4, "0")}`
    : "UID-0001";

  // Password validation & submission
  const isPasswordValid = newPassword.length >= 8 && newPassword === confirmPassword;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      setPasswordSuccess(res.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowPasswordSection(false), 2000);
    } catch (err: unknown) {
      setPasswordError(
        err instanceof Error
          ? err.message
          : "Failed to change password. Please verify current credentials."
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    router.push("/auth");
  };

  // Export Archive
  const handleExportArchive = () => {
    if (!currentUser) return;
    setExportingData(true);
    try {
      const exportPayload = {
        meta: {
          system: "DecisionLens Executive Cognitive Operating System",
          exported_at: new Date().toISOString(),
          version: "2.4.0",
          integrity_hash: Math.random().toString(36).substring(2, 15),
        },
        profile: {
          id: currentUser.id,
          email: currentUser.email,
          display_name: currentUser.display_name || null,
          joined_at: currentUser.created_at,
          auth_method: currentUser.oauth_provider || "password",
        },
        workspaces: folders.map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description || "",
          created_at: f.created_at,
        })),
        decisions: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          folder_id: d.folder_id,
          status: d.status,
          record_type: d.record_type,
          domain: d.domain,
          created_at: d.created_at,
        })),
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const slug = currentUser.email.split("@")[0] || "executive";
      link.href = url;
      link.download = `decisionlens_dossier_${slug}_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExportingData(false);
    }
  };

  return (
    <AppShell onRefresh={loadData} maxWidthClass="max-w-[1020px]">
      {loading ? (
        <div className="space-y-6 py-10 animate-pulse">
          <div className="h-44 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
          <div className="h-64 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
          <div className="h-56 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
        </div>
      ) : !currentUser ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-10 text-center max-w-md mx-auto my-20 border border-[var(--border)] shadow-sm space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-newsreader font-bold text-[var(--ink)]">
            Executive Folio
          </h2>
          <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
            Please authenticate to view your verified workspaces, deliberation telemetry, and cognitive calibration settings.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[var(--accent)] hover:opacity-90 text-white text-xs font-semibold rounded-lg transition shadow-sm"
          >
            <span>Proceed to Authentication</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="font-sans space-y-8 py-4 pb-24">
          {/* Executive Sub-Header / Breadcrumb Label */}
          <div className="flex items-center justify-between text-xs tracking-wider uppercase font-mono text-[var(--ink-secondary)] border-b border-[var(--border)] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              <span>Workspace Overview &bull; Account {shortUid}</span>
            </div>
            <span className="hidden sm:inline">Deliberation Engine v2.4</span>
          </div>

          {/* Name Success / Error Toast */}
          {nameSuccess && (
            <div className="p-3 rounded-xl bg-[#EDE7D6] dark:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] text-xs font-medium flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4 shrink-0 text-[#7a4e10] dark:text-[#D4AA50]" />
              <span>{nameSuccess}</span>
            </div>
          )}
          {nameError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{nameError}</span>
            </div>
          )}

          {/* 1. HERO FOLIO IDENTITY CARD (Tactile Luxury Dossier) */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8 transition-all duration-300 shadow-xs">
            {/* Subtle Guilloche / Archival Background Accent */}
            <div className="absolute top-0 right-0 w-80 h-80 pointer-events-none opacity-[0.03] dark:opacity-[0.06] select-none translate-x-20 -translate-y-20">
              <svg viewBox="0 0 200 200" fill="none" className="w-full h-full stroke-current text-[var(--ink)]">
                <circle cx="100" cy="100" r="95" strokeWidth="0.8" strokeDasharray="3 3" />
                <circle cx="100" cy="100" r="80" strokeWidth="1" />
                <circle cx="100" cy="100" r="65" strokeWidth="0.6" strokeDasharray="2 4" />
                <circle cx="100" cy="100" r="50" strokeWidth="1" />
                <circle cx="100" cy="100" r="35" strokeWidth="0.5" />
                <line x1="100" y1="5" x2="100" y2="195" strokeWidth="0.5" />
                <line x1="5" y1="100" x2="195" y2="100" strokeWidth="0.5" />
              </svg>
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[var(--border)]">
              {/* Executive Seal & Identity Info */}
              <div className="flex items-start sm:items-center gap-5">
                {/* Artisanal Interactive Executive Seal */}
                <div
                  className="group relative w-18 h-18 sm:w-20 sm:h-20 shrink-0 cursor-default select-none"
                  title="DecisionLens Verified Member Seal"
                >
                  {/* Rotating Outer Guilloche Compass Ring */}
                  <svg
                    className="absolute inset-0 w-full h-full text-[var(--accent)] opacity-70 group-hover:rotate-45 transition-transform duration-700 ease-out"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeDasharray="2 4"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.8"
                    />
                    {/* Compass North / South / East / West micro-ticks */}
                    <line x1="50" y1="2" x2="50" y2="8" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="50" y1="92" x2="50" y2="98" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="2" y1="50" x2="8" y2="50" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="92" y1="50" x2="98" y2="50" stroke="currentColor" strokeWidth="1.5" />
                  </svg>

                  {/* Inner Solid Monogram Medallion */}
                  <div className="absolute inset-2 rounded-full bg-[var(--bg-page)] border border-[var(--border)] flex flex-col items-center justify-center shadow-inner group-hover:border-[var(--accent)] transition-colors">
                    <span className="font-newsreader font-bold text-2xl sm:text-3xl text-[var(--ink)] leading-none">
                      {(currentUser.display_name || currentUser.email).charAt(0).toUpperCase()}
                    </span>
                    <span className="font-mono text-[9px] tracking-wider uppercase text-[var(--ink-secondary)] mt-0.5">
                      USER
                    </span>
                  </div>

                  {/* Micro Verified Shield Badge */}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-md border-2 border-[var(--bg-surface)]">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </div>

                {/* Name, Email & Auth Metadata */}
                <div className="space-y-2">
                  {isEditingName ? (
                    <form onSubmit={handleSaveName} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="Enter your name (e.g. Tamanna)"
                        className="px-3 py-1.5 text-base sm:text-lg font-medium border border-[var(--accent)] rounded-lg bg-[var(--bg-page)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] shadow-inner min-w-[200px]"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={savingName}
                        className="px-3 py-1.5 bg-[#161E33] hover:bg-[#232C47] text-white dark:bg-[#D4AA50] dark:text-[#181614] rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {savingName ? "Saving..." : "Save Name"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingName(false)}
                        className="px-3 py-1.5 border border-[var(--border)] text-[var(--ink-secondary)] hover:text-[var(--ink)] rounded-lg text-xs font-medium transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-2xl sm:text-3xl font-newsreader font-bold text-[var(--ink)] tracking-tight">
                        {currentUser.display_name || currentUser.email.split("@")[0]}
                      </h1>
                      <button
                        type="button"
                        onClick={handleStartEditName}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink)] hover:bg-[var(--border)]/40 transition-colors cursor-pointer shadow-2xs"
                        title="Change your username / display name"
                      >
                        <Pencil className="w-3 h-3 text-[var(--ink-secondary)]" />
                        <span>Edit Name</span>
                      </button>
                      <span className="font-mono text-xs tracking-wider uppercase px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)]">
                        {shortUid}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)] flex-wrap">
                    <span className="font-sans text-xs text-[var(--ink)] font-medium">
                      {currentUser.email}
                    </span>

                    <span>&bull;</span>

                    {/* Google Workspace Verification Pill */}
                    {currentUser.oauth_provider === "google" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-page)] border border-[var(--border)] text-xs font-medium text-[var(--ink)]">
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Google Verified</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-page)] border border-[var(--border)] text-xs font-medium text-[var(--ink)]">
                        <Key className="w-3 h-3 text-[var(--accent)]" />
                        <span>Passkey Authentication</span>
                      </span>
                    )}

                    <span>&bull;</span>
                    <span className="text-xs">Member since {joinedDate}</span>
                  </div>
                </div>
              </div>

              {/* Theme & Session Affordances */}
              <div className="flex items-center gap-3 self-start md:self-center shrink-0">
                {/* Tactile Theme Selector */}
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-page)] p-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`px-3 py-1.5 text-xs rounded-md font-medium transition inline-flex items-center gap-1.5 cursor-pointer ${
                      theme === "light"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>Light Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`px-3 py-1.5 text-xs rounded-md font-medium transition inline-flex items-center gap-1.5 cursor-pointer ${
                      theme === "dark"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Dark Mode</span>
                  </button>
                </div>

                {/* Secure Sign Out */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 border border-[var(--border)] hover:border-rose-500/40 hover:bg-rose-500/5 text-[var(--ink-secondary)] hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Exit Session</span>
                </button>
              </div>
            </div>

            {/* 2. DELIBERATION VITALITY & COGNITIVE CADENCE HUD */}
            <div className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs uppercase font-medium text-[var(--ink-secondary)] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[var(--ink-secondary)]" />
                  Portfolio Overview &amp; Decisions Summary
                </span>
                <span className="text-xs text-[var(--ink-secondary)]">
                  {decidedCount} of {decisions.length} Decisions Finalized
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                {/* Visual Radial Dial (SVG) */}
                <div className="md:col-span-1 rounded-xl p-4 bg-[var(--bg-page)] border border-[var(--border)] flex flex-col items-center justify-center text-center">
                  <div className="relative w-28 h-28 my-1 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      {/* Background Track */}
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-[var(--border)] opacity-40"
                      />
                      {/* Progress Arc */}
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 38}
                        strokeDashoffset={
                          2 * Math.PI * 38 * (1 - (decisions.length ? decidedCount / decisions.length : 0))
                        }
                        strokeLinecap="round"
                        className="text-[var(--accent)] transition-all duration-1000 ease-out"
                      />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold font-newsreader text-[var(--ink)] tabular-nums">
                        {consensusRate}%
                      </span>
                      <span className="text-xs font-sans uppercase tracking-wider text-[var(--ink-secondary)]">
                        Consensus
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--ink-secondary)] font-medium mt-1">
                    Completion Rate
                  </span>
                </div>

                {/* 3 Telemetry Cards */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {/* Card A: Active Workspaces */}
                  <div className="p-4 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] hover:border-[var(--accent)]/40 transition flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink-secondary)] uppercase tracking-wider">
                        Workspaces
                      </span>
                      <FolderIcon className="w-4 h-4 text-[var(--ink-secondary)]" />
                    </div>
                    <div className="my-2">
                      <span className="text-3xl font-newsreader font-bold text-[var(--ink)] tabular-nums">
                        {folders.length}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--ink-secondary)] truncate">
                      {folders.length > 0 ? `Active: ${folders[0].name}` : "Zero workspaces"}
                    </span>
                  </div>

                  {/* Card B: Deliberations In Flight */}
                  <div className="p-4 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] hover:border-[var(--accent)]/40 transition flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink-secondary)] uppercase tracking-wider">
                        Evaluating
                      </span>
                      <Clock className="w-4 h-4 text-[var(--ink-secondary)]" />
                    </div>
                    <div className="my-2">
                      <span className="text-3xl font-newsreader font-bold text-[var(--ink)] tabular-nums">
                        {evaluatingCount}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--ink-secondary)] font-medium truncate">
                      {evaluatingCount > 0 ? "Under active evaluation" : "All decisions finalized"}
                    </span>
                  </div>

                  {/* Card C: Consensus Mandates Locked */}
                  <div className="p-4 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] hover:border-[var(--accent)]/40 transition flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink-secondary)] uppercase tracking-wider">
                        Decided
                      </span>
                      <CheckCircle2 className="w-4 h-4 text-[var(--ink-secondary)]" />
                    </div>
                    <div className="my-2">
                      <span className="text-3xl font-newsreader font-bold text-[var(--ink)] tabular-nums">
                        {decidedCount}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--ink-secondary)] font-medium truncate">
                      Finalized decisions
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. COGNITIVE ENGINE CALIBRATION & INGESTION (Tactile Controls) */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8 space-y-6 transition-all duration-300">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--accent)]" />
                  <h2 className="text-lg font-newsreader font-bold text-[var(--ink)]">
                    Deliberation Calibration &amp; Acoustic Engine
                  </h2>
                </div>
                <p className="text-xs text-[var(--ink-secondary)]">
                  Configure default speech ingestion pipelines, acoustic gating, and stress-test intensity.
                </p>
              </div>

              {prefSavedMsg && (
                <span className="text-xs font-semibold text-[#7a4e10] dark:text-[#D4AA50] flex items-center gap-1.5 animate-fadeIn">
                  <Check className="w-3.5 h-3.5 stroke-[3]" /> Settings Applied
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Speech & Ingestion Pipeline */}
              <div className="p-5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Speech Transcription Target
                  </span>
                  <span className="text-[10px] font-mono text-[var(--accent)] font-semibold">
                    WHISPER-PRO
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[var(--ink-secondary)] block">
                    Target language optimized for meeting speech-to-text models &amp; vocabulary:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => savePreferences("en", audioEnhancement, defaultTrack)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition flex items-center justify-between ${
                        defaultLanguage === "en"
                          ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--ink)] shadow-xs"
                          : "border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <div>
                        <span className="block font-medium">English (en)</span>
                        <span className="text-[10px] font-normal text-[var(--ink-secondary)]">Global Enterprise</span>
                      </div>
                      {defaultLanguage === "en" && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => savePreferences("hi", audioEnhancement, defaultTrack)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition flex items-center justify-between ${
                        defaultLanguage === "hi"
                          ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--ink)] shadow-xs"
                          : "border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <div>
                        <span className="block font-medium">Hindi (hi / Hinglish)</span>
                        <span className="text-[10px] font-normal text-[var(--ink-secondary)]">Indian Context &amp; Slang</span>
                      </div>
                      {defaultLanguage === "hi" && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                    </button>
                  </div>
                </div>

                {/* Acoustic Clarity with Live Audio Waveform Simulation */}
                <div className="pt-4 border-t border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-[var(--ink)] block">
                        Acoustic Noise Gate &amp; Rumble Filter
                      </span>
                      <p className="text-[11px] text-[var(--ink-secondary)]">
                        Filters HVAC rumble, keystroke clatter, and balances voice loudness.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={audioEnhancement}
                        onChange={(e) =>
                          savePreferences(defaultLanguage, e.target.checked, defaultTrack)
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent)]"></div>
                    </label>
                  </div>

                  {/* Interactive Waveform Visualizer Preview */}
                  <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 h-6">
                      {[35, 60, 45, 90, 75, 40, 85, 95, 65, 50, 80, 45, 70, 55, 90, 40].map((h, i) => (
                        <div
                          key={i}
                          className={`w-1 rounded-full transition-all duration-300 ${
                            audioEnhancement
                              ? "bg-[var(--accent)] opacity-80"
                              : "bg-[var(--border)] opacity-40"
                          }`}
                          style={{
                            height: audioEnhancement ? `${Math.max(20, h * 0.25)}px` : "6px",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono text-[var(--ink-secondary)]">
                      {audioEnhancement ? "DSP Filter Armed" : "Bypass Mode"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Workflow Track & Gauntlet Engine */}
              <div className="p-5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Default Deliberation Mode
                    </span>
                    <span className="text-[10px] font-mono text-[#7a4e10] dark:text-[#D4AA50] font-semibold">
                      AUTONOMOUS
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Select how deeply the cognitive engine scrutinizes trade-offs when new dilemmas are launched.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Track 1: Deep Gauntlet */}
                  <div
                    onClick={() => savePreferences(defaultLanguage, audioEnhancement, "deep")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      defaultTrack === "deep"
                        ? "border-[var(--accent)] bg-[var(--bg-surface)] shadow-xs"
                        : "border-[var(--border)] bg-[var(--bg-page)] opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-[var(--accent)]" />
                          <span className="text-xs font-bold text-[var(--ink)]">
                            Deep Epistemic Gauntlet (Recommended)
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--ink-secondary)] leading-relaxed">
                          Full 13-Shark stress test: token COGS, unit economics, zero-hallucination verification, and boardroom ADR.
                        </p>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                          defaultTrack === "deep"
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--border)]"
                        }`}
                      >
                        {defaultTrack === "deep" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>

                  {/* Track 2: Express Pilot */}
                  <div
                    onClick={() => savePreferences(defaultLanguage, audioEnhancement, "express")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      defaultTrack === "express"
                        ? "border-[var(--accent)] bg-[var(--bg-surface)] shadow-xs"
                        : "border-[var(--border)] bg-[var(--bg-page)] opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-cyan-500" />
                          <span className="text-xs font-bold text-[var(--ink)]">
                            Express Strategic Pilot
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--ink-secondary)] leading-relaxed">
                          High velocity mode: fast multi-criteria ranking and instant summary for quick operational pivots.
                        </p>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                          defaultTrack === "express"
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--border)]"
                        }`}
                      >
                        {defaultTrack === "express" && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. RECENT EXECUTIVE DELIBERATIONS LEDGER */}
          {decisions.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8 space-y-4 transition-all duration-300">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[var(--accent)]" />
                  <h2 className="text-base font-newsreader font-bold text-[var(--ink)]">
                    Active Deliberation Ledger
                  </h2>
                </div>
                <Link
                  href="/dashboard"
                  className="text-xs text-[var(--accent)] hover:underline font-semibold inline-flex items-center gap-1"
                >
                  <span>Open Full Workspace Ledger</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-[var(--border)]">
                {decisions.slice(0, 5).map((d) => (
                  <Link
                    key={d.id}
                    href={`/decisions/${d.id}`}
                    className="py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--bg-page)]/60 -mx-3 px-3 rounded-xl transition group"
                  >
                    <div className="min-w-0 flex items-center gap-3.5">
                      <span className="font-mono text-[11px] text-[var(--ink-secondary)] shrink-0 w-8">
                        #{d.id}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition truncate">
                          {d.title}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--ink-secondary)] mt-0.5">
                          <span>{new Date(d.created_at).toLocaleDateString()}</span>
                          {d.domain && (
                            <>
                              <span>&bull;</span>
                              <span className="uppercase font-mono text-[10px] text-[var(--ink-secondary)]">
                                {d.domain}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--ink)]">
                        {d.status === "decided" ? "Decided" : "Evaluating"}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-[var(--ink-secondary)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 5. DATA SOVEREIGNTY & SECURITY */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8 space-y-6 transition-all duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[var(--ink)]" />
                <h2 className="text-base font-newsreader font-bold text-[var(--ink)]">
                  Data Sovereignty &amp; Security Standards
                </h2>
              </div>
              {currentUser.oauth_provider !== "google" && (
                <button
                  type="button"
                  onClick={() => setShowPasswordSection(!showPasswordSection)}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{showPasswordSection ? "Close Password Form" : "Change Password"}</span>
                  {showPasswordSection ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            {/* Enterprise Sovereign Enclave & DPDP 2023 Shield */}
            <div className="p-5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider">
                    Enterprise Enclave &bull; Indian DPDP Act 2023 Compliant
                  </span>
                </div>
                <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--ink)] border border-[var(--border)] self-start sm:self-auto">
                  Audit Grade
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase text-[var(--ink-secondary)] block">
                    Data Residency &amp; Storage
                  </span>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    India Primary (AWS ap-south-1)
                  </p>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Audio &amp; decision memory stored exclusively within Indian borders under DPDP 2023 statutory mandates.
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase text-[var(--ink-secondary)] block">
                    Zero-Training Warranty
                  </span>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    100% Zero-Model Retention
                  </p>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Strict B2B API terms ensure confidential audio and ADR memos are never retained or used to train public LLMs.
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase text-[var(--ink-secondary)] block">
                    Liability &amp; IP Protection
                  </span>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    12-Mo Fee Super-Cap
                  </p>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Standard enterprise MSA with 12-month trailing liability cap and mutual waiver of consequential damages.
                  </p>
                </div>
              </div>
            </div>

            {/* Collapsible Password Form (For password users) */}
            {showPasswordSection && (
              <form onSubmit={handlePasswordSubmit} className="p-5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] space-y-4 max-w-lg">
                {passwordError && (
                  <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-3 rounded-lg border border-[#cfc7b2] dark:border-[#38332C] bg-[#EDE7D6] dark:bg-[#2C2723] text-[#7a4e10] dark:text-[#D4AA50] text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                    Current Password
                  </label>
                  <input
                    type={showPasswordText ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3.5 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                      New Password
                    </label>
                    <input
                      type={showPasswordText ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="8+ characters"
                      className="w-full px-3.5 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink)] mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type={showPasswordText ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-type new password"
                      className="w-full px-3.5 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink)] inline-flex items-center gap-1"
                  >
                    {showPasswordText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPasswordText ? "Hide characters" : "Show characters"}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={passwordLoading || !isPasswordValid}
                    className="px-4 py-2 bg-[var(--accent)] hover:opacity-90 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50"
                  >
                    {passwordLoading ? "Updating..." : "Save New Password"}
                  </button>
                </div>
              </form>
            )}

            {/* Archive Export Details */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 p-5 rounded-xl bg-[var(--bg-page)] border border-[var(--border)]">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[var(--ink)] block">
                  Export Verifiable Decision Archive
                </span>
                <p className="text-xs text-[var(--ink-secondary)] leading-relaxed max-w-xl">
                  Download a structured, tamper-evident JSON bundle containing all your {folders.length} workspaces, {decisions.length} deliberations, trade-off scores, and boardroom ADR memos.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportArchive}
                disabled={exportingData}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[var(--ink)] text-xs font-semibold transition shrink-0 shadow-xs group"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-y-0.5 transition" />
                <span>{exportingData ? "Bundling..." : "Download Signed Dossier (.json)"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
