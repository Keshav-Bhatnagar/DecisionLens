"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  Lock,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Brain,
  Search,
  Sparkles,
  Layers,
  Users,
  X,
  ExternalLink,
} from "lucide-react";
import {
  loginUser,
  registerUser,
  getMe,
  clearStoredToken,
  authenticateOAuth,
  getOAuthProviders,
  OAuthProviderInfo,
  User,
} from "@/lib/api";

export default function AuthPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // OAuth Provider and Dialog State
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderInfo[]>([]);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [activeOAuthProvider, setActiveOAuthProvider] = useState<"google" | "github" | "microsoft">("google");
  const [customOAuthEmail, setCustomOAuthEmail] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);

  // Destination URL from query parameter
  const getDestinationUrl = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const redir = params.get("redirect");
      if (redir && redir.startsWith("/")) return redir;
    }
    return "/dashboard";
  };

  // Check if user is already authenticated and load OAuth providers
  useEffect(() => {
    async function initAuth() {
      try {
        const [u, providers] = await Promise.all([
          getMe().catch(() => null),
          getOAuthProviders().catch(() => []),
        ]);
        if (u) {
          router.push(getDestinationUrl());
          return;
        }
        setCurrentUser(u);
        setOauthProviders(providers);
      } catch {
        setCurrentUser(null);
      } finally {
        setCheckingAuth(false);
      }
    }
    initAuth();
  }, [router]);

  // Live password validation checklist for Registration
  const passwordChecks = useMemo(() => {
    return {
      minLength: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasDigit: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>\-_=+[\]/\\`~]/.test(password),
    };
  }, [password]);

  const isPasswordValid =
    passwordChecks.minLength &&
    passwordChecks.hasUpper &&
    passwordChecks.hasLower &&
    passwordChecks.hasDigit &&
    passwordChecks.hasSpecial;

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please provide a valid email address.");
      return;
    }

    if (mode === "signup" && !isPasswordValid) {
      setError("Please ensure your password meets all complexity requirements below.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        await registerUser(cleanEmail, password);
        setSuccessMsg("Account created successfully! Redirecting to Workspace...");
      } else {
        await loginUser(cleanEmail, password);
        setSuccessMsg("Signed in successfully! Redirecting...");
      }

      setTimeout(() => {
        router.push(getDestinationUrl());
      }, 700);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Authentication failed. Please verify your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  // Check mode from URL query parameters (e.g. /auth?mode=signup)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlMode = params.get("mode");
      if (urlMode === "signup" || urlMode === "signin") {
        setMode(urlMode);
      }
    }
  }, []);

  // Open OAuth Dialog or Direct Redirect
  const handleTriggerOAuth = (provider: "google" | "github" | "microsoft") => {
    setError(null);
    setSuccessMsg(null);
    setActiveOAuthProvider(provider);

    const provInfo = oauthProviders.find((p) => p.id === provider);
    if (provInfo?.configured && provInfo.auth_url) {
      // Production mode with real OAuth client credentials
      window.location.href = provInfo.auth_url;
      return;
    }

    // Sandbox / Instant Dev simulation dialog
    setShowOAuthModal(true);
  };

  // Execute OAuth authentication with selected or custom email
  const handleExecuteOAuth = async (selectedEmail: string, displayName?: string) => {
    setOauthLoading(true);
    setError(null);
    try {
      await authenticateOAuth({
        provider: activeOAuthProvider,
        email: selectedEmail,
        display_name: displayName,
      });
      setShowOAuthModal(false);
      setSuccessMsg(`Successfully authenticated via ${activeOAuthProvider.toUpperCase()}! Redirecting...`);
      setTimeout(() => {
        router.push(getDestinationUrl());
      }, 650);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OAuth authentication failed.");
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans relative flex items-center justify-center p-4 sm:p-6 lg:p-8 overflow-hidden">
      {/* Ambient background meshes */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
        {/* Left Column: Brand Showcase & Value Proposition */}
        <div className="lg:col-span-6 space-y-6 lg:pr-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 hover:opacity-90 transition group"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-lg shadow-lg ring-1 ring-white/30 group-hover:scale-105 transition-transform">
              DL
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-950 block">
                DecisionLens
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 block">
                Cognitive Intelligence
              </span>
            </div>
          </Link>

          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight leading-tight">
              Structure Decisions. <br />
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 bg-clip-text text-transparent">
                Decide with Conviction.
              </span>
            </h1>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-lg">
              DecisionLens stress-tests strategic choices by mapping claims into 8 cognitive dimensions, detecting evidence gaps, and executing deterministic decision frameworks.
            </p>
          </div>

          {/* Value Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="glass-card rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-indigo-600">
                <Brain className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold text-slate-900">Cognitive Structuring</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Sorts inputs into Facts, Feelings, Assumptions & Constraints.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-purple-600">
                <Search className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold text-slate-900">Live Gap Research</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Detects critical unknowns and pulls corroborated empirical evidence.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-indigo-600">
                <Compass className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold text-slate-900">Multi-Model Frameworks</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Weighted Matrix, SWOT, Five Whys & Decision Tree calculations.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-emerald-600">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold text-slate-900">Immutable Snapshots</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Version-controlled decision dossiers with roadmap tracking.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3 text-xs text-slate-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Google Workspace • GitHub • Azure AD • Multi-Tenant Isolation</span>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-6">
          <div className="glass-panel rounded-3xl specular-edge p-6 sm:p-9 shadow-xl border border-slate-200/90 relative">
            {/* If user is already authenticated */}
            {!checkingAuth && currentUser && (
              <div className="mb-6 p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Currently signed in as:
                  </div>
                  <div className="font-mono text-slate-700 mt-0.5">{currentUser.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/dashboard"
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition text-xs shadow-2xs"
                  >
                    Go to Workspace →
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      clearStoredToken();
                      setCurrentUser(null);
                    }}
                    className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl transition text-xs border border-slate-200"
                  >
                    Switch Account
                  </button>
                </div>
              </div>
            )}

            {/* Mode Switcher Tabs */}
            <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200/80 mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                  mode === "signin"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                  mode === "signup"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* High-Fidelity Social / OAuth Providers Section */}
            <div className="space-y-2.5 mb-5">
              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={() => handleTriggerOAuth("google")}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-800 transition-all flex items-center justify-center gap-3 shadow-2xs hover:shadow-xs group"
              >
                {/* Official Google G Logo */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                <span>Continue with Google Workspace</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {/* GitHub OAuth Button */}
                <button
                  type="button"
                  onClick={() => handleTriggerOAuth("github")}
                  className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-800 transition-all flex items-center justify-center gap-2 shadow-2xs"
                >
                  <svg className="w-4 h-4 fill-slate-900 shrink-0" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>GitHub</span>
                </button>

                {/* Microsoft OAuth Button */}
                <button
                  type="button"
                  onClick={() => handleTriggerOAuth("microsoft")}
                  className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-800 transition-all flex items-center justify-center gap-2 shadow-2xs"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  <span>Microsoft</span>
                </button>
              </div>
            </div>

            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider absolute">
                or continue with email
              </span>
            </div>

            {/* Error & Success Feedback Alerts */}
            {error && (
              <div className="mb-4 p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="leading-relaxed">{successMsg}</span>
              </div>
            )}

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Password Complexity Checklist for Sign Up */}
              {mode === "signup" && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
                  <span className="font-bold text-slate-600 block mb-1">
                    Password Complexity Checklist:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordChecks.minLength ? "text-emerald-600 font-semibold" : "text-slate-400"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.minLength ? "bg-emerald-500" : "bg-slate-300"}`} />
                      8+ characters
                    </span>
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordChecks.hasUpper ? "text-emerald-600 font-semibold" : "text-slate-400"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasUpper ? "bg-emerald-500" : "bg-slate-300"}`} />
                      Uppercase letter
                    </span>
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordChecks.hasLower ? "text-emerald-600 font-semibold" : "text-slate-400"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasLower ? "bg-emerald-500" : "bg-slate-300"}`} />
                      Lowercase letter
                    </span>
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordChecks.hasDigit ? "text-emerald-600 font-semibold" : "text-slate-400"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasDigit ? "bg-emerald-500" : "bg-slate-300"}`} />
                      At least one number
                    </span>
                    <span
                      className={`flex items-center gap-1.5 col-span-2 ${
                        passwordChecks.hasSpecial ? "text-emerald-600 font-semibold" : "text-slate-400"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasSpecial ? "bg-emerald-500" : "bg-slate-300"}`} />
                      Special character (!@#$%^&*...)
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (mode === "signup" && !isPasswordValid)}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : mode === "signup" ? (
                  <>
                    <span>Create Free Workspace Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span>Sign In to DecisionLens</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-indigo-600 hover:text-indigo-800 font-semibold transition"
              >
                {mode === "signin"
                  ? "Don't have an account? Sign up"
                  : "Already registered? Sign in"}
              </button>

              <Link
                href="/"
                className="hover:text-slate-800 transition font-medium"
              >
                ← Return to Home
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive OAuth Consent Modal (Google / GitHub / Microsoft) */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 sm:p-7 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                {activeOAuthProvider === "google" && (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                {activeOAuthProvider === "github" && (
                  <svg className="w-5 h-5 fill-slate-900 shrink-0" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                )}
                {activeOAuthProvider === "microsoft" && (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                )}
                <div>
                  <h3 className="text-base font-bold text-slate-900 capitalize">
                    {activeOAuthProvider === "google"
                      ? "Google Workspace"
                      : activeOAuthProvider === "github"
                      ? "GitHub SSO"
                      : "Microsoft / Office 365"}
                  </h3>
                  <span className="text-[11px] text-slate-500">Choose an identity to continue to DecisionLens</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated Verified Account Options */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Select an account
              </span>

              {activeOAuthProvider === "google" && (
                <>
                  <button
                    type="button"
                    disabled={oauthLoading}
                    onClick={() => handleExecuteOAuth("alex.lead@google.com", "Alex (Google Lead)")}
                    className="w-full p-3 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-left transition flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                        A
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">
                          Alex Lead (Google Workspace)
                        </div>
                        <div className="text-[11px] text-slate-500">alex.lead@google.com</div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition" />
                  </button>

                  <button
                    type="button"
                    disabled={oauthLoading}
                    onClick={() => handleExecuteOAuth("sarah.director@enterprise.com", "Sarah (Strategy Director)")}
                    className="w-full p-3 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-left transition flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs">
                        S
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">
                          Sarah Director (Corporate Domain)
                        </div>
                        <div className="text-[11px] text-slate-500">sarah.director@enterprise.com</div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition" />
                  </button>
                </>
              )}

              {activeOAuthProvider === "github" && (
                <button
                  type="button"
                  disabled={oauthLoading}
                  onClick={() => handleExecuteOAuth("architect.lead@github.com", "Lead Architect (GitHub)")}
                  className="w-full p-3 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-left transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-xs">
                      GH
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">
                        Technical Architect (GitHub)
                      </div>
                      <div className="text-[11px] text-slate-500">architect.lead@github.com</div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition" />
                </button>
              )}

              {activeOAuthProvider === "microsoft" && (
                <button
                  type="button"
                  disabled={oauthLoading}
                  onClick={() => handleExecuteOAuth("executive.board@microsoft.com", "Board Executive (Azure AD)")}
                  className="w-full p-3 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-left transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center text-xs">
                      MS
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600">
                        Executive Board (Azure AD)
                      </div>
                      <div className="text-[11px] text-slate-500">executive.board@microsoft.com</div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition" />
                </button>
              )}
            </div>

            {/* Custom OAuth Account Input */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Or enter another account
              </span>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={customOAuthEmail}
                  onChange={(e) => setCustomOAuthEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  disabled={oauthLoading || !customOAuthEmail.includes("@")}
                  onClick={() => handleExecuteOAuth(customOAuthEmail)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs transition disabled:opacity-50"
                >
                  {oauthLoading ? "Signing in..." : "Continue"}
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center pt-2">
              To use your own live Google/GitHub OAuth client, set <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">GOOGLE_CLIENT_ID</code> in <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">.env</code>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
