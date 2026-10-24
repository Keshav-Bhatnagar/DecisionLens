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
  Lock,
  Mail,
  Calendar,
  Layers,
  Compass,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Sliders,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
  Mic,
  Brain,
  Globe,
  Users,
  Link2,
  ExternalLink,
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

  // Voice Ingestion Settings State (persisted to localStorage)
  const [defaultLanguage, setDefaultLanguage] = useState<string>("en");
  const [audioEnhancement, setAudioEnhancement] = useState<boolean>(true);
  const [prefSavedMsg, setPrefSavedMsg] = useState(false);

  // Load Voice Settings from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("dl_pref_lang");
      if (savedLang) setDefaultLanguage(savedLang);

      const savedAudio = localStorage.getItem("dl_pref_audio");
      if (savedAudio !== null) setAudioEnhancement(savedAudio === "true");
    }
  }, []);

  const savePreferences = (lang: string, audio: boolean) => {
    setDefaultLanguage(lang);
    setAudioEnhancement(audio);
    if (typeof window !== "undefined") {
      localStorage.setItem("dl_pref_lang", lang);
      localStorage.setItem("dl_pref_audio", String(audio));
    }
    setPrefSavedMsg(true);
    setTimeout(() => setPrefSavedMsg(false), 2500);
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



  // Metrics
  const underScrutinyCount = decisions.filter(
    (d) => d.status === "evaluating" || !d.points_reviewed
  ).length;
  const decidedCount = decisions.filter((d) => d.status === "decided").length;

  return (
    <AppShell onRefresh={loadData}>
      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="h-44 bg-white rounded-2xl border border-slate-200" />
          <div className="h-96 bg-white rounded-2xl border border-slate-200" />
        </div>
      ) : !currentUser ? (
        <div className="glass-panel rounded-2xl specular-edge p-10 text-center max-w-xl mx-auto my-12 shadow-sm space-y-4">
          <Shield className="w-12 h-12 text-indigo-600 mx-auto" />
          <h2 className="text-2xl font-extrabold text-slate-900">
            Sign In Required
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Please sign in to view and configure your decision profile, scrutiny preferences, and credentials.
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
          >
            <span>Proceed to Authentication</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-8 font-sans max-w-5xl mx-auto">
          {/* Header Profile Card */}
          <div className="glass-panel rounded-3xl specular-edge p-6 sm:p-8 shadow-sm border border-slate-200/90 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white font-black text-2xl flex items-center justify-center shadow-lg ring-4 ring-indigo-50 shrink-0">
                  {currentUser.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-950">
                      {currentUser.email}
                    </h1>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Decision Intelligence Lead
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 font-mono">
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      User #{currentUser.id}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Member since {new Date(currentUser.created_at).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active JWT Session
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <Link
                  href="/dashboard"
                  className="px-4 py-2 border border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:text-slate-900 text-xs font-semibold rounded-xl shadow-2xs transition"
                >
                  Workspace Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>

          {/* Telemetry Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card glass-card-hover rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-semibold tracking-wider uppercase block mb-1">
                Workspaces Owned
              </span>
              <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                {String(folders.length).padStart(2, "0")}
              </span>
            </div>

            <div className="glass-card glass-card-hover rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-semibold tracking-wider uppercase block mb-1">
                Total Decisions & Dossiers
              </span>
              <span className="text-3xl font-extrabold text-slate-900 tabular-nums">
                {String(decisions.length).padStart(2, "0")}
              </span>
            </div>

            <div className="glass-card glass-card-hover rounded-2xl p-5 border border-indigo-200/70 bg-gradient-to-br from-white/90 to-indigo-50/30 shadow-2xs">
              <span className="text-[11px] text-indigo-600 font-bold tracking-wider uppercase block mb-1">
                Under Active Scrutiny
              </span>
              <span className="text-3xl font-extrabold text-indigo-600 tabular-nums">
                {String(underScrutinyCount).padStart(2, "0")}
              </span>
            </div>

            <div className="glass-card glass-card-hover rounded-2xl p-5 border border-emerald-200/70 bg-gradient-to-br from-white/90 to-emerald-50/30 shadow-2xs">
              <span className="text-[11px] text-emerald-700 font-bold tracking-wider uppercase block mb-1">
                Resolved & Decided
              </span>
              <span className="text-3xl font-extrabold text-emerald-600 tabular-nums">
                {String(decidedCount).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Security Credentials & Preferences (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Card 1: Change Password & Security */}
              <div className="glass-panel rounded-2xl specular-edge p-6 sm:p-7 shadow-xs border border-slate-200/90 space-y-5">
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Security &amp; Password
                    </h3>
                    <p className="text-xs text-slate-500">
                      Update your account password with cryptographic hashing.
                    </p>
                  </div>
                </div>

                {passwordError && (
                  <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Current Password
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password..."
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password..."
                          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type new password..."
                        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Password Checklist */}
                  {newPassword && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1.5">
                      <span className="font-semibold text-slate-600 block">Password Requirements:</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <span className={`flex items-center gap-1.5 ${passwordChecks.minLength ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.minLength ? "bg-emerald-500" : "bg-slate-300"}`} />
                          8+ characters
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasUpper ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasUpper ? "bg-emerald-500" : "bg-slate-300"}`} />
                          Uppercase letter
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasLower ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasLower ? "bg-emerald-500" : "bg-slate-300"}`} />
                          Lowercase letter
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasDigit ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasDigit ? "bg-emerald-500" : "bg-slate-300"}`} />
                          At least one number
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.hasSpecial ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasSpecial ? "bg-emerald-500" : "bg-slate-300"}`} />
                          Special character
                        </span>
                        <span className={`flex items-center gap-1.5 ${passwordChecks.matchesConfirm ? "text-emerald-600 font-semibold" : "text-slate-400"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.matchesConfirm ? "bg-emerald-500" : "bg-slate-300"}`} />
                          Passwords match
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordLoading || !isNewPasswordValid}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      {passwordLoading ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Card 2: Enterprise Identity & Connected Accounts */}
              <div className="glass-panel rounded-2xl specular-edge p-6 sm:p-7 shadow-xs border border-slate-200/90 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Enterprise Identity &amp; Connected Accounts
                      </h3>
                      <p className="text-xs text-slate-500">
                        Federated OAuth providers for meeting recordings, RFC sync, and Single Sign-On.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    RFC 7519 JWT
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Google Workspace */}
                  <div className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                    currentUser.oauth_provider === "google"
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-slate-200 bg-white hover:bg-slate-50/60"
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">Google Workspace</h4>
                          {currentUser.oauth_provider === "google" && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                              Active Provider
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          Sync Google Meet transcripts, audio recordings &amp; Drive RFC docs
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {currentUser.oauth_provider === "google" ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-100/80 px-3 py-1.5 rounded-xl border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Connected</span>
                        </div>
                      ) : (
                        <Link
                          href="/auth"
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-2xs"
                        >
                          <span>Connect</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* GitHub */}
                  <div className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                    currentUser.oauth_provider === "github"
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-slate-200 bg-white hover:bg-slate-50/60"
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">GitHub Enterprise</h4>
                          {currentUser.oauth_provider === "github" && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                              Active Provider
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          Link technical RFC architecture discussions &amp; pull request decisions
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {currentUser.oauth_provider === "github" ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-100/80 px-3 py-1.5 rounded-xl border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Connected</span>
                        </div>
                      ) : (
                        <Link
                          href="/auth"
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-2xs"
                        >
                          <span>Connect</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Microsoft Azure AD */}
                  <div className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                    currentUser.oauth_provider === "microsoft"
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-slate-200 bg-white hover:bg-slate-50/60"
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                        <svg className="w-5 h-5" viewBox="0 0 21 21">
                          <path fill="#f25022" d="M1 1h9v9H1z" />
                          <path fill="#00a4ef" d="M1 11h9v9H1z" />
                          <path fill="#7fba00" d="M11 1h9v9h-9z" />
                          <path fill="#ffb900" d="M11 11h9v9h-9z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">Microsoft Azure AD / Office 365</h4>
                          {currentUser.oauth_provider === "microsoft" && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                              Active Provider
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          Microsoft Teams meeting audio &amp; Office 365 corporate identity
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {currentUser.oauth_provider === "microsoft" ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-100/80 px-3 py-1.5 rounded-xl border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Connected</span>
                        </div>
                      ) : (
                        <Link
                          href="/auth"
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-2xs"
                        >
                          <span>Connect</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500 text-[11px]">
                    Need to link a different enterprise organization?
                  </span>
                  <Link
                    href="/auth"
                    className="font-bold text-indigo-600 hover:text-indigo-800 text-xs flex items-center gap-1"
                  >
                    <span>OAuth Switcher</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* Card 3: Autonomous Cognitive Intelligence & Ingestion */}
              <div className="glass-panel rounded-2xl specular-edge p-6 sm:p-7 shadow-xs border border-slate-200/90 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                      <Brain className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Autonomous Cognitive Engine
                      </h3>
                      <p className="text-xs text-slate-500">
                        Intelligent multi-framework reasoning without manual preference bias.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Adaptive Intelligence
                  </span>
                </div>

                {/* Intelligent Dynamic Scrutiny Banner */}
                <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/50 rounded-xl border border-indigo-100/90 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-indigo-950">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Dynamic Context-Driven Model Selection</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    DecisionLens does not use static user preferences. The cognitive engine autonomously analyzes the meeting context, speaker tension, trade-offs, and risk factors to activate the optimal analytical model dynamically:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div className="p-2 bg-white/90 rounded-lg border border-indigo-100 flex items-start gap-2 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">Weighted Decision Matrix</span>
                        <span className="text-slate-500 text-[10px]">Autonomously active when competing vendor/architecture options are compared.</span>
                      </div>
                    </div>
                    <div className="p-2 bg-white/90 rounded-lg border border-indigo-100 flex items-start gap-2 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 mt-1.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">Five Whys (Root Cause)</span>
                        <span className="text-slate-500 text-[10px]">Autonomously active when debugging outages, regressions, or process failures.</span>
                      </div>
                    </div>
                    <div className="p-2 bg-white/90 rounded-lg border border-indigo-100 flex items-start gap-2 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">SWOT Strategic Scrutiny</span>
                        <span className="text-slate-500 text-[10px]">Autonomously active when long-term product vision, threats, and market moves are evaluated.</span>
                      </div>
                    </div>
                    <div className="p-2 bg-white/90 rounded-lg border border-indigo-100 flex items-start gap-2 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                      <div>
                        <span className="font-bold text-slate-800 block">Six Thinking Hats</span>
                        <span className="text-slate-500 text-[10px]">Autonomously active for cross-functional debate (optimism, risk, emotion, and logic).</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 text-xs pt-1">
                  {/* Language */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-600" />
                      Audio Ingestion Primary Language
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => savePreferences("en", audioEnhancement)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          defaultLanguage === "en"
                            ? "border-[#2F5D8F] bg-[#FCFBF8] text-[#161E33] font-bold shadow-2xs"
                            : "border-[#D9D2C3] bg-[#EFEADF]/40 text-[#5A6275] hover:bg-white"
                        }`}
                      >
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#EFEADF] text-[#161E33] border border-[#D9D2C3]">EN</span>
                        <span>English (en)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => savePreferences("hi", audioEnhancement)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                          defaultLanguage === "hi"
                            ? "border-[#2F5D8F] bg-[#FCFBF8] text-[#161E33] font-bold shadow-2xs"
                            : "border-[#D9D2C3] bg-[#EFEADF]/40 text-[#5A6275] hover:bg-white"
                        }`}
                      >
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#EFEADF] text-[#161E33] border border-[#D9D2C3]">HI</span>
                        <span>Hindi (hi)</span>
                      </button>
                    </div>
                  </div>

                  {/* Audio Enhancement */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-indigo-600" />
                      FFmpeg Audio Processing Pipeline
                    </label>
                    <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition">
                      <input
                        type="checkbox"
                        checked={audioEnhancement}
                        onChange={(e) => savePreferences(defaultLanguage, e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <div>
                        <span className="font-bold text-slate-900 block">
                          EBU R128 Loudness Normalization &amp; High-Pass Filter
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Automatically level audio volume and strip low-frequency rumble (&lt;200Hz) before transcription.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Persona Switcher & Recent Dossiers (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Tenant & Session Overview Card */}
              <div className="glass-panel rounded-2xl specular-edge p-6 shadow-xs border border-slate-200/90 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Tenant &amp; Session Boundary
                  </h3>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Active User Identity
                    </span>
                    <span className="font-bold text-slate-900 block truncate">
                      {currentUser.display_name || currentUser.email}
                    </span>
                    <span className="text-slate-500 text-[11px] block truncate">
                      {currentUser.email}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Tenant ID
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        USR-{String(currentUser.id).padStart(4, "0")}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Auth Provider
                      </span>
                      <span className="font-bold text-indigo-600 capitalize">
                        {currentUser.oauth_provider || "Credentials"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Cryptographically isolated tenant storage &amp; workspace boundary active.</span>
                  </div>
                </div>
              </div>

              {/* Recent Dossiers Card */}
              <div className="glass-panel rounded-2xl specular-edge p-6 shadow-xs border border-slate-200/90 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">
                    Recent Decisions
                  </h3>
                  <Link
                    href="/dashboard"
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    View All →
                  </Link>
                </div>

                {decisions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No decisions recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {decisions.slice(0, 5).map((d) => (
                      <Link
                        key={d.id}
                        href={`/decisions/${d.id}`}
                        className="py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50/80 -mx-2 px-2 rounded-lg transition group"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 truncate">
                            {d.title}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(d.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                            d.status === "decided"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-indigo-50 text-indigo-700 border border-indigo-200"
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
