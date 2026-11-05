"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useTheme } from "@/context/ThemeContext";
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
  Calendar,
  KeyRound,
  LogOut,
  Sun,
  Moon,
  Mic,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  ArrowRight,
} from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // User & Data State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  // Audio Ingestion Settings (Persisted to localStorage)
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
      const savedLang = localStorage.getItem("dl_pref_lang");
      if (savedLang) setDefaultLanguage(savedLang);

      const savedAudio = localStorage.getItem("dl_pref_audio");
      if (savedAudio !== null) setAudioEnhancement(savedAudio === "true");
    }
  }, []);

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
      setPasswordSuccess(res.message || "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowPasswordSection(false), 2000);
    } catch (err: unknown) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to change password. Please verify your current password."
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
        exported_at: new Date().toISOString(),
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
      const slug = currentUser.email.split("@")[0] || "user";
      link.href = url;
      link.download = `decisionlens_data_${slug}.json`;
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

  const joinedDate = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <AppShell onRefresh={loadData}>
      {loading ? (
        <div className="space-y-6 max-w-3xl mx-auto animate-pulse py-4">
          <div className="h-36 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
          <div className="h-24 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
          <div className="h-48 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
        </div>
      ) : !currentUser ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 sm:p-10 text-center max-w-md mx-auto my-12 border border-[var(--border)] shadow-xs space-y-4">
          <h2 className="text-xl font-serif font-bold text-[var(--ink)]">
            DecisionLens Account
          </h2>
          <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
            Please sign in to view your account details, workspace records, and preferences.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:opacity-90 text-white text-xs font-bold rounded-xl transition shadow-xs"
          >
            <span>Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6 max-w-3xl mx-auto font-sans pb-16 pt-2">
          {/* 1. Profile Header Card */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 sm:p-7 border border-[var(--border)] shadow-2xs transition-colors duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                {/* Clean Editorial Monogram */}
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg-page)] border border-[var(--border)] text-[var(--ink)] font-serif font-bold text-2xl flex items-center justify-center shadow-2xs shrink-0">
                  {currentUser.email.charAt(0).toUpperCase()}
                </div>

                <div className="space-y-1">
                  <h1 className="text-lg sm:text-xl font-serif font-bold text-[var(--ink)] tracking-tight">
                    {currentUser.display_name || currentUser.email}
                  </h1>
                  <p className="text-xs text-[var(--ink-secondary)] font-mono">
                    {currentUser.email}
                  </p>

                  <div className="flex items-center gap-2 pt-0.5 text-xs text-[var(--ink-secondary)] flex-wrap">
                    {currentUser.oauth_provider === "google" ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-page)] text-[var(--ink)] text-[11px] font-medium border border-[var(--border)]">
                        <svg className="w-3 h-3" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        Google Account
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-page)] text-[var(--ink-secondary)] text-[11px] font-medium border border-[var(--border)]">
                        Password Sign-in
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

              {/* Theme toggle & Sign out */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg-page)] p-1">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`p-1.5 rounded-lg transition ${
                      theme === "light"
                        ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-2xs font-bold"
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
                        ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-2xs font-bold"
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
                  className="px-3.5 py-1.5 border border-[var(--border)] hover:bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-rose-500 text-xs font-medium rounded-xl transition flex items-center gap-1.5"
                  title="Sign out of DecisionLens"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Workspace Overview (3 Quiet Numbers) */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs">
              <span className="text-[11px] text-[var(--ink-secondary)] uppercase tracking-wider block mb-1">
                Workspaces
              </span>
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[var(--ink)] tabular-nums">
                {folders.length}
              </span>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs">
              <span className="text-[11px] text-[var(--ink-secondary)] uppercase tracking-wider block mb-1">
                Decisions
              </span>
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[var(--ink)] tabular-nums">
                {decisions.length}
              </span>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-2xs">
              <span className="text-[11px] text-[var(--ink-secondary)] uppercase tracking-wider block mb-1">
                Resolved
              </span>
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[var(--ink)] tabular-nums">
                {decidedCount}
              </span>
            </div>
          </div>

          {/* 3. Account & Preferences */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border)] shadow-2xs space-y-5 transition-colors duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-serif font-bold text-[var(--ink)]">
                Preferences &amp; Ingestion
              </h2>
              {prefSavedMsg && (
                <span className="text-[11px] font-medium text-[var(--accent)] animate-fadeIn">
                  Saved
                </span>
              )}
            </div>

            <div className="space-y-4 text-xs">
              {/* Connected Account */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 bg-[var(--bg-page)]/50 rounded-xl border border-[var(--border)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)] block">
                      Google Account
                    </span>
                    <span className="text-[11px] text-[var(--ink-secondary)]">
                      {currentUser.oauth_provider === "google"
                        ? `Connected as ${currentUser.email}`
                        : "Sign in with Google available"}
                    </span>
                  </div>
                </div>

                {currentUser.oauth_provider === "google" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium">
                    <Check className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <Link
                    href="/auth"
                    className="text-[11px] font-medium text-[var(--accent)] hover:underline"
                  >
                    Switch account &rarr;
                  </Link>
                )}
              </div>

              {/* Spoken Language */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1.5 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Transcription Language</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveAudioPrefs("en", audioEnhancement)}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition ${
                      defaultLanguage === "en"
                        ? "border-[var(--accent)] bg-[var(--bg-page)] text-[var(--ink)] font-bold shadow-2xs"
                        : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-page)] border border-[var(--border)]">EN</span>
                    <span>English</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveAudioPrefs("hi", audioEnhancement)}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition ${
                      defaultLanguage === "hi"
                        ? "border-[var(--accent)] bg-[var(--bg-page)] text-[var(--ink)] font-bold shadow-2xs"
                        : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-page)] border border-[var(--border)]">HI</span>
                    <span>Hindi (हिंदी)</span>
                  </button>
                </div>
              </div>

              {/* Audio Clarity */}
              <label className="flex items-start gap-3 p-3 bg-[var(--bg-page)]/40 border border-[var(--border)] rounded-xl cursor-pointer hover:border-[var(--accent)]/40 transition">
                <input
                  type="checkbox"
                  checked={audioEnhancement}
                  onChange={(e) => handleSaveAudioPrefs(defaultLanguage, e.target.checked)}
                  className="mt-0.5 rounded text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4"
                />
                <div>
                  <span className="font-semibold text-[var(--ink)] block">
                    Audio Clarity &amp; Noise Reduction
                  </span>
                  <span className="text-[11px] text-[var(--ink-secondary)]">
                    Normalizes microphone volume and cleans room echo during voice meetings.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 4. Security & Data Management */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border)] shadow-2xs space-y-4 transition-colors duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-serif font-bold text-[var(--ink)]">
                Security &amp; Data
              </h2>
              <button
                type="button"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
                className="text-xs font-medium text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                <span>{showPasswordSection ? "Close" : "Change Password"}</span>
                {showPasswordSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Collapsible Password Form */}
            {showPasswordSection && (
              <form onSubmit={handlePasswordSubmit} className="space-y-3 pt-1">
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
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-xl text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                      Confirm New Password
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
                    {showPasswordText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPasswordText ? "Hide" : "Show"}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={passwordLoading || !isPasswordValid}
                    className="px-4 py-1.5 bg-[var(--accent)] hover:opacity-90 text-white font-medium text-xs rounded-xl transition disabled:opacity-50"
                  >
                    {passwordLoading ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </form>
            )}

            {/* Export Account Data */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <div>
                <span className="text-xs font-semibold text-[var(--ink)] block">
                  Export Workspaces &amp; Decisions
                </span>
                <span className="text-[11px] text-[var(--ink-secondary)]">
                  Download a JSON copy of all your decision records.
                </span>
              </div>
              <button
                type="button"
                onClick={handleExportArchive}
                disabled={exportingData}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-page)] hover:bg-[var(--border)]/60 text-[var(--ink)] text-xs font-medium transition"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{exportingData ? "Exporting..." : "Export Data"}</span>
              </button>
            </div>
          </div>

          {/* 5. Recent Decisions */}
          {decisions.length > 0 && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border)] shadow-2xs space-y-3 transition-colors duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <h2 className="text-sm font-serif font-bold text-[var(--ink)] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent)]" />
                  <span>Recent Decisions</span>
                </h2>
                <Link
                  href="/dashboard"
                  className="text-xs text-[var(--accent)] hover:underline font-medium"
                >
                  View All &rarr;
                </Link>
              </div>

              <div className="divide-y divide-[var(--border)]">
                {decisions.slice(0, 4).map((d) => (
                  <Link
                    key={d.id}
                    href={`/decisions/${d.id}`}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-page)]/40 -mx-2 px-2 rounded-lg transition group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--ink)] group-hover:text-[var(--accent)] truncate">
                        {d.title}
                      </p>
                      <p className="text-[10px] text-[var(--ink-secondary)]">
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-full shrink-0 ${
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
