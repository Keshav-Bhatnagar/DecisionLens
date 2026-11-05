"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useTheme } from "@/context/ThemeContext";
import DecisionPrismCanvas from "@/components/DecisionPrismCanvas";
import {
  getMe,
  getFolders,
  getDecisions,
  changePassword,
  clearStoredToken,
  User,
  Folder,
  Decision,
} from "@/lib/api";
import {
  User as UserIcon,
  Shield,
  KeyRound,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Sliders,
  ArrowRight,
  Eye,
  EyeOff,
  Mic,
  Brain,
  Globe,
  Download,
  Check,
  Sun,
  Moon,
  Compass,
  Sparkles,
  Zap,
  Target,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type DecisionSignature = "first_principles" | "velocity" | "risk_architect" | "contrarian";

interface SignatureOption {
  id: DecisionSignature;
  title: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const SIGNATURES: SignatureOption[] = [
  {
    id: "first_principles",
    title: "First-Principles Builder",
    tagline: "Dismantle complexity down to bedrock truths, unit economics, and physics.",
    icon: Target,
    color: "from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  {
    id: "velocity",
    title: "Velocity & Action Bias",
    tagline: "High momentum. Fast reversible experiments beat endless committee debate.",
    icon: Zap,
    color: "from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  {
    id: "risk_architect",
    title: "Risk-Weighted Architect",
    tagline: "Stress-test worst-case blast radiuses, systemic traps, and resilience.",
    icon: Shield,
    color: "from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  {
    id: "contrarian",
    title: "Long-Term Contrarian",
    tagline: "Uncover non-consensus insights with multi-year compounding payoffs.",
    icon: Compass,
    color: "from-purple-500/20 to-indigo-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // User & Data State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  // Creative Decision Signature & 3D Artifact State
  const [signature, setSignature] = useState<DecisionSignature>("first_principles");
  const [showArtifact3D, setShowArtifact3D] = useState(true);

  // Voice & Ingestion Settings (Persisted to localStorage)
  const [defaultLanguage, setDefaultLanguage] = useState<string>("en");
  const [audioEnhancement, setAudioEnhancement] = useState<boolean>(true);
  const [prefSavedMsg, setPrefSavedMsg] = useState(false);

  // Password Accordion & Form State
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

  // Load Settings from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSig = localStorage.getItem("dl_decision_signature") as DecisionSignature;
      if (savedSig && SIGNATURES.some((s) => s.id === savedSig)) {
        setSignature(savedSig);
      }

      const savedLang = localStorage.getItem("dl_pref_lang");
      if (savedLang) setDefaultLanguage(savedLang);

      const savedAudio = localStorage.getItem("dl_pref_audio");
      if (savedAudio !== null) setAudioEnhancement(savedAudio === "true");
    }
  }, []);

  const handleSelectSignature = (sigId: DecisionSignature) => {
    setSignature(sigId);
    if (typeof window !== "undefined") {
      localStorage.setItem("dl_decision_signature", sigId);
    }
    setPrefSavedMsg(true);
    setTimeout(() => setPrefSavedMsg(false), 2000);
  };

  const handleSaveAudioPrefs = (lang: string, audio: boolean) => {
    setDefaultLanguage(lang);
    setAudioEnhancement(audio);
    if (typeof window !== "undefined") {
      localStorage.setItem("dl_pref_lang", lang);
      localStorage.setItem("dl_pref_audio", String(audio));
    }
    setPrefSavedMsg(true);
    setTimeout(() => setPrefSavedMsg(false), 2000);
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

  // Password validation
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
      setPasswordSuccess(res.message || "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowPasswordSection(false), 2000);
    } catch (err: unknown) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to change password. Please verify current password."
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    router.push("/auth");
  };

  // Human-friendly Data Archive Export
  const handleExportArchive = () => {
    if (!currentUser) return;
    setExportingData(true);
    try {
      const exportPayload = {
        exported_at: new Date().toISOString(),
        profile: {
          id: currentUser.id,
          email: currentUser.email,
          display_name: currentUser.display_name || null,
          joined_at: currentUser.created_at,
          decision_philosophy: signature,
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
      const slug = currentUser.email.split("@")[0] || "user";
      link.href = url;
      link.download = `decisionlens_archive_${slug}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExportingData(false);
    }
  };

  // Metrics
  const decidedCount = decisions.filter((d) => d.status === "decided").length;
  const inProgressCount = decisions.length - decidedCount;

  // Format member joined date
  const joinedDate = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <AppShell onRefresh={loadData}>
      {loading ? (
        <div className="space-y-6 max-w-4xl mx-auto animate-pulse">
          <div className="h-44 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
          <div className="h-64 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
        </div>
      ) : !currentUser ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-10 text-center max-w-lg mx-auto my-12 border border-[var(--border)] shadow-sm space-y-4">
          <Sparkles className="w-10 h-10 text-[var(--accent)] mx-auto opacity-80" />
          <h2 className="text-xl font-serif font-bold text-[var(--ink)]">
            Welcome to DecisionLens
          </h2>
          <p className="text-xs text-[var(--ink-secondary)] max-w-sm mx-auto leading-relaxed">
            Please sign in to view your decision profile, personal style, and workspace history.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:opacity-90 text-white text-xs font-bold rounded-xl transition shadow-sm"
          >
            <span>Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-8 max-w-4xl mx-auto font-sans pb-12">
          {/* 1. Header Profile Card (Creative & Warm) */}
          <div className="relative bg-[var(--bg-surface)] rounded-3xl p-6 sm:p-8 border border-[var(--border)] shadow-xs overflow-hidden transition-colors duration-200">
            {/* Subtle decorative glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-[var(--accent)]/10 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4 sm:gap-5">
                {/* Monogram Avatar with Warm Gradient */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-[var(--accent)] to-amber-600 text-white font-serif font-bold text-2xl sm:text-3xl flex items-center justify-center shadow-md ring-4 ring-[var(--accent)]/10 shrink-0">
                  {currentUser.email.charAt(0).toUpperCase()}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-serif font-bold text-[var(--ink)] tracking-tight">
                      {currentUser.display_name || currentUser.email}
                    </h1>
                  </div>

                  <p className="text-xs text-[var(--ink-secondary)] font-mono">
                    {currentUser.email}
                  </p>

                  <div className="flex items-center gap-2 pt-1 text-xs text-[var(--ink-secondary)] flex-wrap">
                    {currentUser.oauth_provider === "google" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">
                        <svg className="w-3 h-3" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        Google Account
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-page)] text-[var(--ink-secondary)] font-medium text-[11px] border border-[var(--border)]">
                        Email &amp; Password
                      </span>
                    )}

                    <span>&bull;</span>
                    <span className="flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3 h-3 text-[var(--ink-secondary)]" />
                      Joined {joinedDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions: Theme switcher & Logout */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                {/* 1-Click Theme Switcher */}
                <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-page)] p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`p-1.5 rounded-lg transition ${
                      theme === "light"
                        ? "bg-[var(--bg-surface)] text-amber-600 shadow-2xs font-bold"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                    title="Light Parchment Theme"
                  >
                    <Sun className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`p-1.5 rounded-lg transition ${
                      theme === "dark"
                        ? "bg-[var(--bg-surface)] text-indigo-400 shadow-2xs font-bold"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                    title="Dark Charcoal Theme"
                  >
                    <Moon className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3.5 py-2 border border-rose-500/20 hover:bg-rose-500/10 text-rose-500 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                  title="Sign out of DecisionLens"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Vital Decision Metrics (Clean, Human, Punchy) */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs text-center sm:text-left transition-colors duration-200">
              <span className="text-[11px] text-[var(--ink-secondary)] font-medium block mb-1">
                Workspaces
              </span>
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[var(--ink)] tabular-nums">
                {folders.length}
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)] hidden sm:block mt-0.5">
                Collaborative hubs
              </span>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs text-center sm:text-left transition-colors duration-200">
              <span className="text-[11px] text-[var(--ink-secondary)] font-medium block mb-1">
                Decisions Shaped
              </span>
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[var(--accent)] tabular-nums">
                {decisions.length}
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)] hidden sm:block mt-0.5">
                {inProgressCount} active, {decidedCount} decided
              </span>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs text-center sm:text-left transition-colors duration-200">
              <span className="text-[11px] text-[var(--ink-secondary)] font-medium block mb-1">
                Mandates Decided
              </span>
              <span className="text-2xl sm:text-3xl font-serif font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {decidedCount}
              </span>
              <span className="text-[10px] text-[var(--ink-secondary)] hidden sm:block mt-0.5">
                Executive consensus
              </span>
            </div>
          </div>

          {/* 3. Executive Decision Artifact & 3D Cognitive Sculpture */}
          <div className="bg-[var(--bg-surface)] rounded-3xl p-6 sm:p-7 border border-[var(--border)] shadow-xs space-y-5 transition-colors duration-200">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-base font-serif font-bold text-[var(--ink)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  <span>Executive Decision Artifact</span>
                </h3>
                <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                  A generative 3D sculpture calibrated to your strategic decision posture.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {prefSavedMsg && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 animate-fadeIn">
                    Artifact Synced
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowArtifact3D(!showArtifact3D)}
                  className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink)] flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-page)]/60 transition"
                  title="Toggle 3D Sculpture View"
                >
                  <span>{showArtifact3D ? "Minimize 3D" : "Expand 3D"}</span>
                  {showArtifact3D ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {showArtifact3D && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center pt-1">
                {/* 3D Interactive Canvas Hero (5 Cols) */}
                <div className="md:col-span-5 flex flex-col items-center">
                  <DecisionPrismCanvas
                    signature={signature}
                    onSelectSignature={handleSelectSignature}
                    className="w-full h-64 sm:h-72 bg-gradient-to-b from-[var(--bg-page)]/70 to-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-inner"
                  />
                  <span className="text-[10px] text-[var(--ink-secondary)] mt-2 font-mono">
                    Drag to inspect &bull; Mouse &amp; touch responsive
                  </span>
                </div>

                {/* Tactical Philosophy Selector (7 Cols) */}
                <div className="md:col-span-7 grid grid-cols-1 gap-2.5">
                  {SIGNATURES.map((sig) => {
                    const isSelected = signature === sig.id;
                    const IconComponent = sig.icon;
                    return (
                      <button
                        key={sig.id}
                        type="button"
                        onClick={() => handleSelectSignature(sig.id)}
                        className={`text-left p-3.5 rounded-2xl border transition-all duration-150 flex items-center justify-between gap-3 ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--bg-page)] shadow-xs ring-1 ring-[var(--accent)]/30"
                            : "border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-page)]/40 hover:border-[var(--accent)]/30"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl border shrink-0 bg-gradient-to-br ${sig.color}`}>
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[var(--ink)] block truncate">
                              {sig.title}
                            </span>
                            <p className="text-[11px] text-[var(--ink-secondary)] truncate">
                              {sig.tagline}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shrink-0 shadow-xs">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. Simple Preferences & Account Essentials (Two Balanced Columns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Left Column: Google Account & Meeting Voice */}
            <div className="space-y-6">
              {/* Simple Google Account Status */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-xs space-y-3 transition-colors duration-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)]">
                  Connected Account
                </h4>

                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-page)]/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[var(--ink)] block">
                        Google Workspace
                      </span>
                      <span className="text-[11px] text-[var(--ink-secondary)]">
                        {currentUser.oauth_provider === "google"
                          ? "Signed in with Google SSO"
                          : "Google sign-in available"}
                      </span>
                    </div>
                  </div>

                  {currentUser.oauth_provider === "google" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <Check className="w-3 h-3" /> Connected
                    </span>
                  ) : (
                    <Link
                      href="/auth"
                      className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
                    >
                      Switch on login &rarr;
                    </Link>
                  )}
                </div>
              </div>

              {/* Meeting Voice & Language */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-xs space-y-4 transition-colors duration-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Meeting Audio &amp; Language</span>
                </h4>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1.5">
                      Spoken Language for Transcripts
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveAudioPrefs("en", audioEnhancement)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          defaultLanguage === "en"
                            ? "border-[var(--accent)] bg-[var(--bg-page)] text-[var(--ink)] font-bold shadow-2xs"
                            : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-page)] border border-[var(--border)]">EN</span>
                        <span>English</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveAudioPrefs("hi", audioEnhancement)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          defaultLanguage === "hi"
                            ? "border-[var(--accent)] bg-[var(--bg-page)] text-[var(--ink)] font-bold shadow-2xs"
                            : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-page)] border border-[var(--border)]">HI</span>
                        <span>Hindi (हिंदी)</span>
                      </button>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 p-3 bg-[var(--bg-page)]/60 border border-[var(--border)] rounded-xl cursor-pointer hover:border-[var(--accent)]/50 transition">
                    <input
                      type="checkbox"
                      checked={audioEnhancement}
                      onChange={(e) => handleSaveAudioPrefs(defaultLanguage, e.target.checked)}
                      className="mt-0.5 rounded text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4"
                    />
                    <div>
                      <span className="font-semibold text-[var(--ink)] block text-xs">
                        Smart Audio Clarity
                      </span>
                      <span className="text-[11px] text-[var(--ink-secondary)]">
                        Cleans up background room echo and levels volume before generating minutes.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Security & Data Archive */}
            <div className="space-y-6">
              {/* Clean Collapsible Password Section */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-xs space-y-3 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Password &amp; Access</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowPasswordSection(!showPasswordSection)}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1"
                  >
                    <span>{showPasswordSection ? "Close" : "Change Password"}</span>
                    {showPasswordSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {!showPasswordSection ? (
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Your password is secure. Click above if you need to set a new password.
                  </p>
                ) : (
                  <form onSubmit={handlePasswordSubmit} className="space-y-3 pt-2">
                    {passwordError && (
                      <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{passwordError}</span>
                      </div>
                    )}
                    {passwordSuccess && (
                      <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{passwordSuccess}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1">
                        Current Password
                      </label>
                      <input
                        type={showPasswordText ? "text" : "password"}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current password"
                        className="w-full px-3 py-2 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-xl text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1">
                          New Password
                        </label>
                        <input
                          type={showPasswordText ? "text" : "password"}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="8+ characters"
                          className="w-full px-3 py-2 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-xl text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1">
                          Confirm Password
                        </label>
                        <input
                          type={showPasswordText ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-type new password"
                          className="w-full px-3 py-2 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-xl text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => setShowPasswordText(!showPasswordText)}
                        className="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink)] flex items-center gap-1"
                      >
                        {showPasswordText ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showPasswordText ? "Hide text" : "Show text"}</span>
                      </button>

                      <button
                        type="submit"
                        disabled={passwordLoading || !isPasswordValid}
                        className="px-4 py-1.5 bg-[var(--accent)] hover:opacity-90 text-white font-bold text-xs rounded-xl transition disabled:opacity-50"
                      >
                        {passwordLoading ? "Updating..." : "Save Password"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Data Archive Download */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-xs space-y-3 transition-colors duration-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Personal Data Archive</span>
                </h4>

                <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                  Download a complete, portable backup of all your workspaces, decision histories, and notes.
                </p>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleExportArchive}
                    disabled={exportingData}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] hover:bg-[var(--border)]/60 text-[var(--ink)] text-xs font-bold transition shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>{exportingData ? "Packaging..." : "Download My Archive (.json)"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Recent Decisions Showcase */}
          {decisions.length > 0 && (
            <div className="bg-[var(--bg-surface)] rounded-3xl p-6 sm:p-7 border border-[var(--border)] shadow-xs space-y-4 transition-colors duration-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-serif font-bold text-[var(--ink)] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent)]" />
                  <span>Recent Deliberations</span>
                </h3>
                <Link
                  href="/dashboard"
                  className="text-xs text-[var(--accent)] hover:underline font-semibold"
                >
                  View All &rarr;
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {decisions.slice(0, 4).map((d) => (
                  <Link
                    key={d.id}
                    href={`/decisions/${d.id}`}
                    className="p-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-page)]/40 hover:bg-[var(--bg-page)] hover:border-[var(--accent)]/40 transition group flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] truncate">
                        {d.title}
                      </p>
                      <p className="text-[10px] text-[var(--ink-secondary)] mt-0.5">
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                        d.status === "decided"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {d.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
