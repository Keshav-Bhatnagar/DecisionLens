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
  ExternalLink,
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
      setPasswordSuccess(res.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowPasswordSection(false), 2000);
    } catch (err: unknown) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to change password. Please verify current credentials."
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
  const evaluatingCount = decisions.filter((d) => d.status === "evaluating").length;

  const joinedDate = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <AppShell onRefresh={loadData} maxWidthClass="max-w-[920px]">
      {loading ? (
        <div className="space-y-8 py-8 animate-pulse">
          <div className="h-28 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
          <div className="h-44 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
        </div>
      ) : !currentUser ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-10 text-center max-w-md mx-auto my-16 border border-[var(--border)] shadow-sm space-y-4">
          <h2 className="text-xl font-newsreader font-bold text-[var(--ink)]">
            DecisionLens Account
          </h2>
          <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
            Please authenticate to view your executive records, workspaces, and preferences.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:opacity-90 text-white text-xs font-semibold rounded-lg transition"
          >
            <span>Proceed to Authentication</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="font-sans space-y-10 py-6 pb-20">
          {/* Executive Folio Header */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-7 sm:p-8 border border-[var(--border)] transition-colors duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-7 border-b border-[var(--border)]">
              <div className="flex items-center gap-5">
                {/* Editorial Seal Monogram */}
                <div className="relative w-16 h-16 rounded-full bg-[var(--bg-page)] border-2 border-[var(--border)] flex items-center justify-center shrink-0 shadow-inner">
                  <span className="font-newsreader font-bold text-2xl text-[var(--ink)] select-none">
                    {currentUser.email.charAt(0).toUpperCase()}
                  </span>
                  <div className="absolute inset-1 rounded-full border border-[var(--border)] pointer-events-none opacity-60" />
                </div>

                <div className="space-y-1.5">
                  <h1 className="text-2xl font-newsreader font-bold text-[var(--ink)] tracking-tight">
                    {currentUser.display_name || currentUser.email}
                  </h1>

                  <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)] flex-wrap">
                    <span className="font-mono text-[11px] text-[var(--ink-secondary)]">
                      {currentUser.email}
                    </span>
                    <span>&bull;</span>
                    {currentUser.oauth_provider === "google" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink)]">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        Google Workspace SSO
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-[var(--ink)]">
                        Enterprise Credentials
                      </span>
                    )}
                    <span>&bull;</span>
                    <span className="text-[11px]">Joined {joinedDate}</span>
                  </div>
                </div>
              </div>

              {/* Theme & Session Affordances */}
              <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-page)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition inline-flex items-center gap-1.5 ${
                      theme === "light"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-2xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-600" />
                    <span>Parchment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition inline-flex items-center gap-1.5 ${
                      theme === "dark"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-2xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Obsidian</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 border border-[var(--border)] hover:bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-rose-600 text-xs font-medium rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>

            {/* Integrated Typographic Scope Band (Quiet & Restrained) */}
            <div className="grid grid-cols-3 gap-6 pt-6">
              <div>
                <span className="font-newsreader font-bold text-3xl sm:text-4xl text-[var(--ink)] tabular-nums block">
                  {folders.length}
                </span>
                <span className="text-xs text-[var(--ink-secondary)] font-medium mt-1 block">
                  Active Workspaces
                </span>
              </div>

              <div>
                <span className="font-newsreader font-bold text-3xl sm:text-4xl text-[var(--ink)] tabular-nums block">
                  {decisions.length}
                </span>
                <span className="text-xs text-[var(--ink-secondary)] font-medium mt-1 block">
                  Total Deliberations ({evaluatingCount} in review)
                </span>
              </div>

              <div>
                <span className="font-newsreader font-bold text-3xl sm:text-4xl text-[var(--ink)] tabular-nums block">
                  {decidedCount}
                </span>
                <span className="text-xs text-[var(--ink-secondary)] font-medium mt-1 block">
                  Consensus Mandates Locked
                </span>
              </div>
            </div>
          </div>

          {/* Section: Ingestion & Deliberation Calibration */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-7 sm:p-8 border border-[var(--border)] space-y-6 transition-colors duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-newsreader font-bold text-[var(--ink)]">
                Deliberation Calibration
              </h2>
              {prefSavedMsg && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Preferences Saved
                </span>
              )}
            </div>

            <div className="divide-y divide-[var(--border)]">
              {/* Row 1: Transcription Language */}
              <div className="py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[var(--ink)] block">
                    Meeting Transcription Language
                  </span>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Target language optimized for meeting speech-to-text models and vocabulary.
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-page)] p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => savePreferences("en", audioEnhancement, defaultTrack)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition ${
                      defaultLanguage === "en"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-2xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    English (en)
                  </button>
                  <button
                    type="button"
                    onClick={() => savePreferences("hi", audioEnhancement, defaultTrack)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition ${
                      defaultLanguage === "hi"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-2xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Hindi (hi)
                  </button>
                </div>
              </div>

              {/* Row 2: Acoustic Clarity */}
              <div className="py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5 max-w-md">
                  <span className="text-xs font-semibold text-[var(--ink)] block">
                    Acoustic Clarity &amp; Noise Reduction
                  </span>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Dynamically filters low-frequency room rumble and levels participant loudness before structuring.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={audioEnhancement}
                    onChange={(e) => savePreferences(defaultLanguage, e.target.checked, defaultTrack)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[var(--bg-page)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]"></div>
                </label>
              </div>

              {/* Row 3: Deliberation Default Track */}
              <div className="py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[var(--ink)] block">
                    Default Workflow Track
                  </span>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Deep Gauntlet runs full multi-criteria stress tests; Express Pilot produces instant executive synthesis.
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-page)] p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => savePreferences(defaultLanguage, audioEnhancement, "deep")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition ${
                      defaultTrack === "deep"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-2xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Deep Gauntlet
                  </button>
                  <button
                    type="button"
                    onClick={() => savePreferences(defaultLanguage, audioEnhancement, "express")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition ${
                      defaultTrack === "express"
                        ? "bg-[var(--bg-surface)] text-[var(--ink)] font-semibold shadow-2xs"
                        : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Express Pilot
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Security, Credentials & Data Sovereignty */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-7 sm:p-8 border border-[var(--border)] space-y-6 transition-colors duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-newsreader font-bold text-[var(--ink)]">
                Security &amp; Data Sovereignty
              </h2>
              <button
                type="button"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
                className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
              >
                <span>{showPasswordSection ? "Close" : "Change Password"}</span>
                {showPasswordSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Collapsible Password Form */}
            {showPasswordSection && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-1 max-w-lg">
                {passwordError && (
                  <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 text-xs flex items-center gap-2">
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
                    className="w-full px-3.5 py-2 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-lg text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
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
                      className="w-full px-3.5 py-2 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-lg text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
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
                      className="w-full px-3.5 py-2 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-lg text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]"
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

            {/* Data Export Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <div>
                <span className="text-xs font-semibold text-[var(--ink)] block">
                  Export Decision Archive
                </span>
                <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                  Download a structured, portable JSON bundle of all your workspaces, decisions, and outcomes.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportArchive}
                disabled={exportingData}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] hover:bg-[var(--border)]/50 text-[var(--ink)] text-xs font-semibold transition shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{exportingData ? "Packaging..." : "Download Archive (.json)"}</span>
              </button>
            </div>
          </div>

          {/* Section: Recent Deliberation Ledger */}
          {decisions.length > 0 && (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-7 sm:p-8 border border-[var(--border)] space-y-4 transition-colors duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <h2 className="text-base font-newsreader font-bold text-[var(--ink)]">
                  Recent Deliberations
                </h2>
                <Link
                  href="/dashboard"
                  className="text-xs text-[var(--accent)] hover:underline font-semibold"
                >
                  View All in Dashboard &rarr;
                </Link>
              </div>

              <div className="divide-y divide-[var(--border)]">
                {decisions.slice(0, 5).map((d) => (
                  <Link
                    key={d.id}
                    href={`/decisions/${d.id}`}
                    className="py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--bg-page)]/40 -mx-3 px-3 rounded-xl transition group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition truncate">
                        {d.title}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--ink-secondary)] mt-0.5">
                        <span className="font-mono">#{d.id}</span>
                        <span>&bull;</span>
                        <span>{new Date(d.created_at).toLocaleDateString()}</span>
                        {d.domain && (
                          <>
                            <span>&bull;</span>
                            <span className="uppercase">{d.domain}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full shrink-0 ${
                        d.status === "decided"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
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
