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
  const [activeOAuthProvider, setActiveOAuthProvider] = useState<"google" | "github" | "microsoft" | "supabase">("google");
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
  const handleTriggerOAuth = async (provider: "google" | "github" | "microsoft" | "supabase") => {
    setError(null);
    setSuccessMsg(null);
    setActiveOAuthProvider(provider);

    if (typeof window !== "undefined") {
      sessionStorage.setItem("oauth_provider", provider);
    }

    let provInfo = oauthProviders.find((p) => p.id === provider);
    if (!provInfo) {
      try {
        const fresh = await getOAuthProviders();
        setOauthProviders(fresh);
        provInfo = fresh.find((p) => p.id === provider);
      } catch {
        // fallback continues below
      }
    }

    if (provInfo?.configured && provInfo.auth_url) {
      window.location.href = provInfo.auth_url;
      return;
    }

    // Direct Google OAuth fallback if client ID is set in environment or server
    const googleClientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      provInfo?.client_id;

    if (provider === "google" && googleClientId) {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const redirectUri = encodeURIComponent(`${origin}/auth/callback`);
      const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=select_account`;
      window.location.href = googleUrl;
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
    <div className="min-h-screen bg-paper-page text-ink font-sans flex items-center justify-center p-4 sm:p-6 lg:p-10">
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Dossier Brand & Value Highlights */}
        <div className="lg:col-span-6 space-y-6 lg:pr-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 hover:opacity-90 transition group"
          >
            <div className="w-10 h-10 rounded-sm bg-ink text-paper-surface flex items-center justify-center font-serif text-lg font-bold border border-border">
              <Compass className="w-5 h-5 text-paper-surface" />
            </div>
            <div>
              <span className="text-xl font-serif font-bold tracking-tight text-ink block">
                DecisionLens
              </span>
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-accent block">
                Executive Cognitive Intelligence
              </span>
            </div>
          </Link>

          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-ink tracking-tight leading-tight">
              Structure Decisions. <br />
              <span className="text-accent italic">
                Decide with Grounded Conviction.
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-ink-secondary mt-3 leading-relaxed max-w-lg">
              DecisionLens stress-tests strategic choices by structuring inputs into 8 cognitive categories, resolving factual gaps via empirical research, and executing multi-criteria frameworks.
            </p>
          </div>

          {/* Dossier Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="bg-paper-surface rounded-md p-3.5 border border-border space-y-1">
              <div className="flex items-center gap-2 text-ink">
                <Brain className="w-4 h-4 text-accent shrink-0" />
                <span className="text-xs font-bold font-serif text-ink">Cognitive Structuring</span>
              </div>
              <p className="text-[11px] text-ink-secondary leading-snug">
                Separates objective facts from unverified assumptions and bias.
              </p>
            </div>

            <div className="bg-paper-surface rounded-md p-3.5 border border-border space-y-1">
              <div className="flex items-center gap-2 text-ink">
                <Search className="w-4 h-4 text-accent shrink-0" />
                <span className="text-xs font-bold font-serif text-ink">Empirical Due Diligence</span>
              </div>
              <p className="text-[11px] text-ink-secondary leading-snug">
                Detects critical unknowns and pulls corroborated public evidence.
              </p>
            </div>

            <div className="bg-paper-surface rounded-md p-3.5 border border-border space-y-1">
              <div className="flex items-center gap-2 text-ink">
                <Compass className="w-4 h-4 text-accent shrink-0" />
                <span className="text-xs font-bold font-serif text-ink">Multi-Model Frameworks</span>
              </div>
              <p className="text-[11px] text-ink-secondary leading-snug">
                Weighted Matrix, SWOT, Five Whys, and Decision Tree analysis.
              </p>
            </div>

            <div className="bg-paper-surface rounded-md p-3.5 border border-border space-y-1">
              <div className="flex items-center gap-2 text-ink">
                <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
                <span className="text-xs font-bold font-serif text-ink">Cross-Meeting Memory</span>
              </div>
              <p className="text-[11px] text-ink-secondary leading-snug">
                Folder continuity automatically inherits baseline facts and milestones.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2 text-[11px] text-ink-tertiary font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
            <span>Google Workspace Single Sign-On &middot; Multi-Tenant Privacy</span>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-6">
          <div className="bg-paper-surface rounded-md p-6 sm:p-8 border border-border relative">
            {/* If user is already authenticated */}
            {!checkingAuth && currentUser && (
              <div className="mb-6 p-4 rounded-md bg-paper-sidebar border border-border text-xs text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-ink">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    Currently signed in as:
                  </div>
                  <div className="font-mono text-ink-secondary mt-0.5">{currentUser.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/dashboard"
                    className="px-3 py-1.5 bg-ink hover:opacity-90 text-paper-surface font-semibold rounded-md transition text-xs"
                  >
                    Go to Workspace &rarr;
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      clearStoredToken();
                      setCurrentUser(null);
                    }}
                    className="px-2.5 py-1.5 text-ink-secondary hover:text-ink hover:bg-paper-surface rounded-md transition text-xs border border-border"
                  >
                    Switch Account
                  </button>
                </div>
              </div>
            )}

            {/* Mode Switcher Tabs */}
            <div className="flex items-center p-1 bg-paper-sidebar rounded-md border border-border mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-sm transition-all ${
                  mode === "signin"
                    ? "bg-paper-surface text-ink font-bold shadow-2xs"
                    : "text-ink-secondary hover:text-ink"
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
                className={`flex-1 py-2 text-xs font-semibold rounded-sm transition-all ${
                  mode === "signup"
                    ? "bg-paper-surface text-ink font-bold shadow-2xs"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Institutional / OAuth Providers Section */}
            <div className="space-y-2 mb-5">
              {/* Google Workspace Button */}
              <button
                type="button"
                onClick={() => handleTriggerOAuth("google")}
                className="w-full py-2.5 px-4 bg-paper-surface hover:bg-paper-sidebar border border-border rounded-md text-xs font-semibold text-ink transition flex items-center justify-center gap-3 group"
              >
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
            </div>

            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-border w-full" />
              <span className="bg-paper-surface px-3 text-[10px] font-mono font-semibold text-ink-tertiary uppercase tracking-wider absolute">
                or sign in with password
              </span>
            </div>

            {/* Error & Success Feedback Alerts */}
            {error && (
              <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50/80 text-red-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="leading-relaxed">{successMsg}</span>
              </div>
            )}

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-ink-tertiary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@organization.com"
                    className="w-full pl-10 pr-4 py-2 text-xs bg-paper-surface border border-border rounded-md text-ink placeholder-ink-tertiary focus:outline-none focus:border-accent transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-ink">
                    Password
                  </label>
                  {mode === "signin" && (
                    <span className="text-[11px] text-ink-tertiary">
                      Encrypted session
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-tertiary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2 text-xs bg-paper-surface border border-border rounded-md text-ink placeholder-ink-tertiary focus:outline-none focus:border-accent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password complexity checklist (during signup) */}
              {mode === "signup" && (
                <div className="p-3 bg-paper-sidebar border border-border rounded-md text-[11px] space-y-1.5">
                  <span className="font-semibold text-ink block text-[10px] uppercase font-mono tracking-wider">
                    Password Criteria
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                    <span className={`flex items-center gap-1.5 ${passwordChecks.minLength ? "text-emerald-700 font-semibold" : "text-ink-tertiary"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.minLength ? "bg-emerald-600" : "bg-border"}`} />
                      8+ characters
                    </span>
                    <span className={`flex items-center gap-1.5 ${passwordChecks.hasUpper ? "text-emerald-700 font-semibold" : "text-ink-tertiary"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasUpper ? "bg-emerald-600" : "bg-border"}`} />
                      Uppercase letter
                    </span>
                    <span className={`flex items-center gap-1.5 ${passwordChecks.hasLower ? "text-emerald-700 font-semibold" : "text-ink-tertiary"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasLower ? "bg-emerald-600" : "bg-border"}`} />
                      Lowercase letter
                    </span>
                    <span className={`flex items-center gap-1.5 ${passwordChecks.hasDigit ? "text-emerald-700 font-semibold" : "text-ink-tertiary"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasDigit ? "bg-emerald-600" : "bg-border"}`} />
                      Numeric digit
                    </span>
                    <span className={`flex items-center gap-1.5 col-span-2 ${passwordChecks.hasSpecial ? "text-emerald-700 font-semibold" : "text-ink-tertiary"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${passwordChecks.hasSpecial ? "bg-emerald-600" : "bg-border"}`} />
                      Special character (!@#$%^&*...)
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (mode === "signup" && !isPasswordValid)}
                className="w-full py-2.5 bg-ink hover:opacity-90 active:scale-[0.99] text-paper-surface font-semibold text-xs rounded-md transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-paper-surface/30 border-t-paper-surface rounded-full animate-spin" />
                    <span>Processing dossier access...</span>
                  </>
                ) : mode === "signup" ? (
                  <>
                    <span>Create Institutional Account</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>Enter DecisionLens Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-4 mt-5 border-t border-border flex items-center justify-between text-xs text-ink-secondary">
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-accent hover:underline font-semibold transition"
              >
                {mode === "signin" ? "Need an institutional workspace? Sign up" : "Already have an account? Sign in"}
              </button>
              <Link href="/" className="hover:text-ink transition text-ink-tertiary">
                Back to overview
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Dev / Sandbox Persona Simulation Modal (fallback if live OAuth client unconfigured) */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#FCFBF8] rounded-md border border-[#D9D2C3] p-6 max-w-md w-full shadow-2xl space-y-4 relative z-50">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-sm bg-paper-sidebar border border-border flex items-center justify-center text-accent">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-serif font-bold text-ink">
                    Sandbox: {activeOAuthProvider.toUpperCase()} Sign-In
                  </h3>
                  <span className="text-[10px] text-ink-tertiary font-mono">
                    Local Dev Simulation Mode
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="p-1 hover:bg-paper-sidebar rounded text-ink-secondary hover:text-ink transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              Your OAuth client for <strong>{activeOAuthProvider.toUpperCase()}</strong> is in local development mode. Choose a preset executive profile or enter an email to authenticate directly:
            </p>

            <div className="space-y-2">
              {activeOAuthProvider === "google" && (
                <>
                  <button
                    type="button"
                    disabled={oauthLoading}
                    onClick={() => handleExecuteOAuth("alex.lead@google.com", "Alex Lead (Google)")}
                    className="w-full p-2.5 rounded-md border border-border hover:border-accent hover:bg-paper-sidebar text-left transition flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-ink group-hover:text-accent">
                        Alex Lead (Google Workspace)
                      </div>
                      <div className="text-[10px] font-mono text-ink-secondary">alex.lead@google.com</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-ink-tertiary group-hover:text-accent transition" />
                  </button>
                  <button
                    type="button"
                    disabled={oauthLoading}
                    onClick={() => handleExecuteOAuth("sarah.director@enterprise.com", "Sarah Director (Corporate)")}
                    className="w-full p-2.5 rounded-md border border-border hover:border-accent hover:bg-paper-sidebar text-left transition flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-ink group-hover:text-accent">
                        Sarah Director (Corporate Domain)
                      </div>
                      <div className="text-[10px] font-mono text-ink-secondary">sarah.director@enterprise.com</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-ink-tertiary group-hover:text-accent transition" />
                  </button>
                </>
              )}
            </div>

            {/* Custom OAuth Account Input */}
            <div className="pt-3 border-t border-border space-y-2">
              <span className="text-[10px] font-mono font-semibold text-ink-tertiary uppercase tracking-wider block">
                Or authenticate custom address
              </span>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={customOAuthEmail}
                  onChange={(e) => setCustomOAuthEmail(e.target.value)}
                  placeholder="executive@organization.com"
                  className="flex-1 px-3 py-1.5 text-xs bg-paper-surface border border-border rounded-md text-ink placeholder-ink-tertiary focus:outline-none focus:border-accent transition"
                />
                <button
                  type="button"
                  disabled={oauthLoading || !customOAuthEmail.includes("@")}
                  onClick={() => handleExecuteOAuth(customOAuthEmail)}
                  className="px-3.5 py-1.5 bg-ink hover:opacity-90 text-paper-surface font-semibold text-xs rounded-md transition disabled:opacity-50"
                >
                  {oauthLoading ? "Signing in..." : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
