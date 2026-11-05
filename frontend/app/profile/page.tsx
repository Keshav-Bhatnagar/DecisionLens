"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getMe,
  getFolders,
  getDecisions,
  changePassword,
  getOAuthProviders,
  clearStoredToken,
  User,
  Folder,
  Decision,
  OAuthProviderInfo,
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
  Building2,
  Fingerprint,
} from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();

  // User & Data State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Deliberation & Ingestion Settings State (persisted to localStorage)
  const [defaultLanguage, setDefaultLanguage] = useState<string>("en");
  const [audioEnhancement, setAudioEnhancement] = useState<boolean>(true);
  const [defaultTrack, setDefaultTrack] = useState<"deep" | "express">("deep");
  const [prefSavedMsg, setPrefSavedMsg] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // Load Settings from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("dl_pref_lang");
      if (savedLang) setDefaultLanguage(savedLang);

      const savedAudio = localStorage.getItem("dl_pref_audio");
      if (savedAudio !== null) setAudioEnhancement(savedAudio === "true");

      const savedTrack = localStorage.getItem("dl_pref_track");
      if (savedTrack === "express" || savedTrack === "deep") setDefaultTrack(savedTrack);
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
    setTimeout(() => setPrefSavedMsg(false), 2200);
  };

  // Load Profile & Workspaces
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getMe();
      setCurrentUser(user);
      if (user) {
        const [folderList, decisionList, providersList] = await Promise.all([
          getFolders().catch(() => []),
          getDecisions().catch(() => []),
          getOAuthProviders().catch(() => []),
        ]);
        setFolders(folderList);
        setDecisions(decisionList);
        setOauthProviders(providersList);
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

  // Live password validation checklist
  const passwordChecks = useMemo(() => {
    return {
      minLength: newPassword.length >= 8,
      hasUpper: /[A-Z]/.test(newPassword),
      hasLower: /[a-z]/.test(newPassword),
      hasDigit: /\d/.test(newPassword),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>\-_=+[\]/\\`~]/.test(newPassword),
      matchesConfirm: newPassword.length > 0 && newPassword === confirmPassword,
    };
  }, [newPassword, confirmPassword]);

  const isNewPasswordValid =
    passwordChecks.minLength &&
    passwordChecks.hasUpper &&
    passwordChecks.hasLower &&
    passwordChecks.hasDigit &&
    passwordChecks.hasSpecial &&
    passwordChecks.matchesConfirm;

  // Handle Password Update
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (!isNewPasswordValid) {
      setPasswordError("Please fulfill all password complexity requirements and ensure passwords match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      setPasswordSuccess(res.message || "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to change password. Please verify current password."
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    clearStoredToken();
    router.push("/auth");
  };

  // DPDP Act 2023 Compliant Personal Data Export
  const handleExportPersonalData = () => {
    if (!currentUser) return;
    setExportingData(true);
    try {
      const exportPayload = {
        export_standard: "DPDP_ACT_2023_DATA_PORTABILITY",
        generated_at: new Date().toISOString(),
        user_identity: {
          id: currentUser.id,
          email: currentUser.email,
          display_name: currentUser.display_name || null,
          created_at: currentUser.created_at,
          auth_provider: currentUser.oauth_provider || "credentials_jwt",
        },
        workspace_inventory: folders.map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description || "",
          created_at: f.created_at,
        })),
        decision_catalog: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          folder_id: d.folder_id,
          status: d.status,
          record_type: d.record_type,
          domain: d.domain,
          created_at: d.created_at,
        })),
        privacy_statement: "DecisionLens ensures epistemic tenant isolation. All decision vectors and RAG embeddings are strictly bound to this tenant ID.",
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const slug = currentUser.email.split("@")[0] || "user";
      link.href = url;
      link.download = `decisionlens_account_data_${slug}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExportingData(false);
    }
  };

  // Real Metrics
  const underScrutinyCount = decisions.filter(
    (d) => d.status === "evaluating" || !d.points_reviewed
  ).length;
  const decidedCount = decisions.filter((d) => d.status === "decided").length;

  return (
    <AppShell onRefresh={loadData}>
      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="h-44 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
          <div className="h-96 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]" />
        </div>
      ) : !currentUser ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-10 text-center max-w-xl mx-auto my-12 border border-[var(--border)] shadow-sm space-y-4">
          <Shield className="w-12 h-12 text-[var(--accent)] mx-auto" />
          <h2 className="text-2xl font-serif font-extrabold text-[var(--ink)]">
            Sign In Required
          </h2>
          <p className="text-xs text-[var(--ink-secondary)] max-w-md mx-auto leading-relaxed">
            Please sign in to view and configure your decision profile, deliberation preferences, and security credentials.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:opacity-90 text-white text-xs font-bold rounded-xl transition shadow-sm"
          >
            <span>Proceed to Authentication</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-7 font-sans max-w-5xl mx-auto">
          {/* Header Profile Card */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 sm:p-7 shadow-xs border border-[var(--border)] relative overflow-hidden transition-colors duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] text-white font-serif font-black text-2xl flex items-center justify-center shadow-md ring-4 ring-[var(--accent)]/10 shrink-0">
                  {currentUser.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-serif font-bold text-[var(--ink)]">
                      {currentUser.display_name || currentUser.email}
                    </h1>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[var(--bg-page)] text-[var(--ink-secondary)] border border-[var(--border)]">
                      User #{currentUser.id}
                    </span>
                    {currentUser.oauth_provider ? (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 capitalize">
                        SSO: {currentUser.oauth_provider}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--bg-page)] text-[var(--ink-secondary)] border border-[var(--border)]">
                        Enterprise Credentials
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)] mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 font-mono">
                      <Fingerprint className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Tenant USR-{String(currentUser.id).padStart(4, "0")}
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Member since {new Date(currentUser.created_at).toLocaleDateString()}
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active Session (HMAC-SHA256)
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
                <Link
                  href="/dashboard"
                  className="px-4 py-2 border border-[var(--border)] hover:bg-[var(--bg-page)] bg-[var(--bg-surface)] text-[var(--ink)] text-xs font-semibold rounded-xl shadow-2xs transition"
                >
                  Workspace Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 border border-rose-500/30 hover:bg-rose-500/10 text-rose-600 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>

          {/* Real Telemetry Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 border border-[var(--border)] shadow-2xs">
              <span className="text-[11px] text-[var(--ink-secondary)] font-semibold tracking-wider uppercase block mb-1">
                Workspaces Owned
              </span>
              <span className="text-3xl font-extrabold text-[var(--ink)] tabular-nums">
                {String(folders.length).padStart(2, "0")}
              </span>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 border border-[var(--border)] shadow-2xs">
              <span className="text-[11px] text-[var(--ink-secondary)] font-semibold tracking-wider uppercase block mb-1">
                Total Decisions &amp; Dossiers
              </span>
              <span className="text-3xl font-extrabold text-[var(--ink)] tabular-nums">
                {String(decisions.length).padStart(2, "0")}
              </span>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 border border-[var(--border)] shadow-2xs">
              <span className="text-[11px] text-amber-600 font-bold tracking-wider uppercase block mb-1">
                Under Active Scrutiny
              </span>
              <span className="text-3xl font-extrabold text-amber-600 tabular-nums">
                {String(underScrutinyCount).padStart(2, "0")}
              </span>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl p-5 border border-[var(--border)] shadow-2xs">
              <span className="text-[11px] text-emerald-600 font-bold tracking-wider uppercase block mb-1">
                Resolved &amp; Decided
              </span>
              <span className="text-3xl font-extrabold text-emerald-600 tabular-nums">
                {String(decidedCount).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
            {/* Left Column: Security Credentials & Preferences (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card 1: Change Password & Security */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-6 sm:p-7 shadow-xs border border-[var(--border)] space-y-5">
                <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--border)]">
                  <div className="p-2 bg-[var(--bg-page)] text-[var(--accent)] rounded-xl border border-[var(--border)]">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold text-[var(--ink)]">
                      Security &amp; Password
                    </h3>
                    <p className="text-xs text-[var(--ink-secondary)]">
                      Update your account password with cryptographic PBKDF2/Bcrypt hashing.
                    </p>
                  </div>
                </div>

                {passwordError && (
                  <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                      Current Password
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password..."
                      className="w-full px-3.5 py-2.5 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-xl text-[var(--ink)] placeholder-[var(--ink-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password..."
                          className="w-full px-3.5 py-2.5 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-xl text-[var(--ink)] placeholder-[var(--ink-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type new password..."
                        className="w-full px-3.5 py-2.5 text-xs bg-[var(--bg-page)] border border-[var(--border)] rounded-xl text-[var(--ink)] placeholder-[var(--ink-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Password Checklist */}
                  {newPassword && (
                    <div className="p-3 bg-[var(--bg-page)] rounded-xl border border-[var(--border)] text-[11px] space-y-1.5">
                      <span className="font-semibold text-[var(--ink)] block">Password Requirements:</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <span className={`flex items-center gap-1.5 ${passwordChecks.minLength ? "text-emerald-600 font-semibold" : "text-[var(--ink-secondary)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.minLength ? "bg-emerald-500" : "bg-[var(--border)]"}`} />
                          8+ characters
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasUpper ? "text-emerald-600 font-semibold" : "text-[var(--ink-secondary)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasUpper ? "bg-emerald-500" : "bg-[var(--border)]"}`} />
                          Uppercase letter
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasLower ? "text-emerald-600 font-semibold" : "text-[var(--ink-secondary)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasLower ? "bg-emerald-500" : "bg-[var(--border)]"}`} />
                          Lowercase letter
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasDigit ? "text-emerald-600 font-semibold" : "text-[var(--ink-secondary)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasDigit ? "bg-emerald-500" : "bg-[var(--border)]"}`} />
                          At least one number
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasSpecial ? "text-emerald-600 font-semibold" : "text-[var(--ink-secondary)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasSpecial ? "bg-emerald-500" : "bg-[var(--border)]"}`} />
                          Special character
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.matchesConfirm ? "text-emerald-600 font-semibold" : "text-[var(--ink-secondary)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.matchesConfirm ? "bg-emerald-500" : "bg-[var(--border)]"}`} />
                          Passwords match
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordLoading || !isNewPasswordValid}
                      className="px-5 py-2.5 bg-[var(--accent)] hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                    >
                      {passwordLoading ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Card 2: Deliberation & Ingestion Engine Preferences */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-6 sm:p-7 shadow-xs border border-[var(--border)] space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[var(--bg-page)] text-[var(--accent)] rounded-xl border border-[var(--border)]">
                      <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-serif font-bold text-[var(--ink)]">
                        Deliberation &amp; Ingestion Preferences
                      </h3>
                      <p className="text-xs text-[var(--ink-secondary)]">
                        Customize meeting audio ingestion and default analytical depth.
                      </p>
                    </div>
                  </div>
                  {prefSavedMsg && (
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 animate-fadeIn">
                      Preferences Saved
                    </span>
                  )}
                </div>

                <div className="space-y-4 text-xs">
                  {/* Default Language */}
                  <div>
                    <label className="block font-bold text-[var(--ink)] mb-1.5 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Audio Ingestion Primary Language
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => savePreferences("en", audioEnhancement, defaultTrack)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          defaultLanguage === "en"
                            ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--ink)] font-bold shadow-2xs"
                            : "border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--bg-page)] border border-[var(--border)]">EN</span>
                        <span>English (en)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => savePreferences("hi", audioEnhancement, defaultTrack)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          defaultLanguage === "hi"
                            ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--ink)] font-bold shadow-2xs"
                            : "border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--bg-page)] border border-[var(--border)]">HI</span>
                        <span>Hindi (hi)</span>
                      </button>
                    </div>
                  </div>

                  {/* Audio Processing Pipeline */}
                  <div>
                    <label className="block font-bold text-[var(--ink)] mb-1.5 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-[var(--accent)]" />
                      FFmpeg Audio Processing Pipeline
                    </label>
                    <label className="flex items-start gap-3 p-3 bg-[var(--bg-page)] border border-[var(--border)] rounded-xl cursor-pointer hover:border-[var(--accent)] transition">
                      <input
                        type="checkbox"
                        checked={audioEnhancement}
                        onChange={(e) => savePreferences(defaultLanguage, e.target.checked, defaultTrack)}
                        className="mt-0.5 rounded text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4"
                      />
                      <div>
                        <span className="font-bold text-[var(--ink)] block">
                          EBU R128 Loudness Normalization &amp; High-Pass Filter
                        </span>
                        <span className="text-[11px] text-[var(--ink-secondary)]">
                          Level speaker volume dynamically and strip low-frequency microphone rumble (&lt;200Hz) prior to transcription.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Default Track Mode */}
                  <div>
                    <label className="block font-bold text-[var(--ink)] mb-1.5 flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Default Deliberation Track
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => savePreferences(defaultLanguage, audioEnhancement, "deep")}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-start gap-0.5 transition ${
                          defaultTrack === "deep"
                            ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--ink)] font-bold shadow-2xs"
                            : "border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="font-bold">Deep Gauntlet (Recommended)</span>
                        <span className="text-[10px] text-[var(--ink-secondary)] font-normal">Full 10-phase analysis with multi-criteria stress tests</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => savePreferences(defaultLanguage, audioEnhancement, "express")}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-start gap-0.5 transition ${
                          defaultTrack === "express"
                            ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--ink)] font-bold shadow-2xs"
                            : "border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <span className="font-bold">Express Pilot</span>
                        <span className="text-[10px] text-[var(--ink-secondary)] font-normal">Rapid structuring &amp; instant executive memo</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: DPDP Act 2023 Compliance & Data Sovereignty */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-6 sm:p-7 shadow-xs border border-[var(--border)] space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--border)]">
                  <div className="p-2 bg-[var(--bg-page)] text-emerald-600 rounded-xl border border-[var(--border)]">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold text-[var(--ink)]">
                      Data Sovereignty &amp; DPDP Act 2023
                    </h3>
                    <p className="text-xs text-[var(--ink-secondary)]">
                      Exercise full data portability and inspect cryptographic isolation boundaries.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                  Under the Digital Personal Data Protection (DPDP) Act 2023, you retain absolute ownership over your deliberation records. Your embeddings, audio transcripts, and decision matrices are isolated by tenant boundaries and never shared across external model training corpora.
                </p>

                <div className="pt-1 flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-[11px] text-[var(--ink-secondary)]">
                    <span>Export format: Structured JSON &bull; Includes workspaces &amp; decision catalog</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportPersonalData}
                    disabled={exportingData}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-page)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--ink)] text-xs font-bold transition shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>{exportingData ? "Packaging Data..." : "Export My Data (.json)"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Identity, Tenant & Recent Dossiers (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Card 4: Enterprise Identity & SSO Status */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-6 shadow-xs border border-[var(--border)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-serif font-bold text-[var(--ink)]">
                      Enterprise Identity &amp; SSO
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--ink-secondary)] bg-[var(--bg-page)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                    RFC 7519
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Google Workspace */}
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-page)]/50 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shrink-0 shadow-2xs">
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                      </div>
                      <div>
                        <span className="font-bold text-[var(--ink)] block">Google Workspace</span>
                        <span className="text-[10px] text-[var(--ink-secondary)]">Meet &amp; Drive Sync</span>
                      </div>
                    </div>
                    {currentUser.oauth_provider === "google" ? (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Active Sign-In
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--ink-secondary)] bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                        {oauthProviders.find((p) => p.id === "google")?.configured ? "SSO Available" : "Not Configured"}
                      </span>
                    )}
                  </div>

                  {/* GitHub Enterprise */}
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-page)]/50 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shrink-0 shadow-2xs">
                        <svg className="w-4 h-4 fill-current text-[var(--ink)]" viewBox="0 0 24 24">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                      </div>
                      <div>
                        <span className="font-bold text-[var(--ink)] block">GitHub Enterprise</span>
                        <span className="text-[10px] text-[var(--ink-secondary)]">Technical RFCs &amp; PRs</span>
                      </div>
                    </div>
                    {currentUser.oauth_provider === "github" ? (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Active Sign-In
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--ink-secondary)] bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                        {oauthProviders.find((p) => p.id === "github")?.configured ? "SSO Available" : "Not Configured"}
                      </span>
                    )}
                  </div>

                  {/* Microsoft Azure AD */}
                  <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-page)]/50 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shrink-0 shadow-2xs">
                        <svg className="w-4 h-4" viewBox="0 0 21 21">
                          <path fill="#f25022" d="M1 1h9v9H1z"/>
                          <path fill="#00a4ef" d="M1 11h9v9H1z"/>
                          <path fill="#7fba00" d="M11 1h9v9h-9z"/>
                          <path fill="#ffb900" d="M11 11h9v9h-9z"/>
                        </svg>
                      </div>
                      <div>
                        <span className="font-bold text-[var(--ink)] block">Azure AD / Office 365</span>
                        <span className="text-[10px] text-[var(--ink-secondary)]">Teams &amp; Corporate Identity</span>
                      </div>
                    </div>
                    {currentUser.oauth_provider === "microsoft" ? (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Active Sign-In
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--ink-secondary)] bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                        {oauthProviders.find((p) => p.id === "microsoft")?.configured ? "SSO Available" : "Not Configured"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 5: Tenant & Session Boundary */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-6 shadow-xs border border-[var(--border)] space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                  <Shield className="w-4 h-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-serif font-bold text-[var(--ink)]">
                    Tenant &amp; Session Boundary
                  </h3>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-[var(--bg-page)] rounded-xl border border-[var(--border)] space-y-1">
                    <span className="text-[10px] font-bold text-[var(--ink-secondary)] uppercase tracking-wider block">
                      Active User Identity
                    </span>
                    <span className="font-bold text-[var(--ink)] block truncate">
                      {currentUser.display_name || currentUser.email}
                    </span>
                    <span className="text-[var(--ink-secondary)] text-[11px] block truncate">
                      {currentUser.email}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 bg-[var(--bg-page)] rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--ink-secondary)] uppercase tracking-wider block">
                        Tenant ID
                      </span>
                      <span className="font-mono font-bold text-[var(--ink)]">
                        USR-{String(currentUser.id).padStart(4, "0")}
                      </span>
                    </div>

                    <div className="p-3 bg-[var(--bg-page)] rounded-xl border border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--ink-secondary)] uppercase tracking-wider block">
                        Auth Protocol
                      </span>
                      <span className="font-bold text-[var(--accent)] capitalize">
                        {currentUser.oauth_provider ? `${currentUser.oauth_provider} SSO` : "Password JWT"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-[11px] text-emerald-600 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Cryptographically isolated tenant storage &amp; pgvector workspace boundary active.</span>
                  </div>
                </div>
              </div>

              {/* Card 6: Recent Decisions */}
              <div className="bg-[var(--bg-surface)] rounded-2xl p-6 shadow-xs border border-[var(--border)] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <h3 className="text-sm font-serif font-bold text-[var(--ink)]">
                    Recent Decisions
                  </h3>
                  <Link
                    href="/dashboard"
                    className="text-xs text-[var(--accent)] hover:underline font-semibold"
                  >
                    View All &rarr;
                  </Link>
                </div>

                {decisions.length === 0 ? (
                  <p className="text-xs text-[var(--ink-secondary)] italic py-2">
                    No decisions recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {decisions.slice(0, 5).map((d) => (
                      <Link
                        key={d.id}
                        href={`/decisions/${d.id}`}
                        className="py-2.5 flex items-center justify-between gap-2 hover:bg-[var(--bg-page)] -mx-2 px-2 rounded-lg transition group"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] truncate">
                            {d.title}
                          </p>
                          <p className="text-[10px] text-[var(--ink-secondary)]">
                            {new Date(d.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                            d.status === "decided"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          }`}
                        >
                          {d.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
