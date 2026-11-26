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
  Sparkles,
  Users,
  X,
  ExternalLink,
  Zap,
} from "lucide-react";
import {
  loginUser,
  registerUser,
  getMe,
  clearStoredToken,
  authenticateOAuth,
  getOAuthProviders,
  forgotPassword,
  OAuthProviderInfo,
  User,
} from "@/lib/api";
import AmbientWaveCanvas from "@/components/AmbientWaveCanvas";
import DecisionLensLogo, { DecisionLensIcon } from "@/components/DecisionLensLogo";
import ApertureToggle from "@/components/ApertureToggle";
import { useTheme } from "@/context/ThemeContext";

export default function AuthPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // OAuth Provider State (Google)
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderInfo[]>([]);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Destination URL from query parameter
  const getDestinationUrl = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const redir = params.get("redirect");
      if (redir && redir.startsWith("/") && !redir.startsWith("//")) return redir;
    }
    return "/dashboard";
  };

  // Check if user is already authenticated and load OAuth providers
  useEffect(() => {
    async function initAuth() {
      try {
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2500));
        const authPromise = Promise.all([
          getMe().catch(() => null),
          getOAuthProviders().catch(() => []),
        ]);
        const res = (await Promise.race([
          authPromise,
          timeoutPromise.then(() => [null, []]),
        ])) as [User | null, OAuthProviderInfo[]];
        const [u, providers] = res || [null, []];
        if (u) {
          window.location.href = getDestinationUrl();
          return;
        }
        setCurrentUser(u);
        if (providers && providers.length > 0) {
          setOauthProviders(providers);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setCheckingAuth(false);
      }
    }
    initAuth();
  }, []);

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
    setDevResetUrl(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }

    if (mode === "forgot") {
      setLoading(true);
      try {
        const res = await forgotPassword(cleanEmail);
        setSuccessMsg(res.message);
        if (res.reset_url) {
          setDevResetUrl(res.reset_url);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to generate reset link.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "signup" && !isPasswordValid) {
      const missing = [];
      if (!passwordChecks.minLength) missing.push("at least 8 characters");
      if (!passwordChecks.hasUpper) missing.push("an uppercase letter");
      if (!passwordChecks.hasLower) missing.push("a lowercase letter");
      if (!passwordChecks.hasDigit) missing.push("a digit");
      if (!passwordChecks.hasSpecial) missing.push("a special character (!@#$...)");
      setError(`Password must include: ${missing.join(", ")}.`);
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        await registerUser(cleanEmail, password);
        setSuccessMsg("Account created successfully! Loading your workspace...");
      } else {
        await loginUser(cleanEmail, password);
        setSuccessMsg("Signed in successfully! Loading your workspace...");
      }

      // Hard navigation to bootstrap clean session & reload all components
      setTimeout(() => {
        window.location.href = getDestinationUrl();
      }, 500);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : "Authentication failed.";
      if (rawMsg.includes("already exists")) {
        setError("An account with this email already exists. Switch to Sign In above to access it.");
      } else if (rawMsg.includes("Incorrect email or password")) {
        setError("Incorrect email or password. Please recheck your credentials or use the 1-click Demo Login below.");
      } else {
        setError(rawMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Execute 1-click OAuth authentication or simulation
  const handleExecuteOAuth = async (selectedEmail: string, displayName?: string) => {
    setOauthLoading(true);
    setError(null);
    try {
      await authenticateOAuth({
        provider: "google",
        email: selectedEmail,
        display_name: displayName,
      });
      setSuccessMsg(`Authenticated as ${selectedEmail}! Loading workspace...`);
      setTimeout(() => {
        window.location.href = getDestinationUrl();
      }, 500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OAuth authentication failed.");
    } finally {
      setOauthLoading(false);
    }
  };

  // Redirect to Google OAuth
  const googleProvider = useMemo(
    () => oauthProviders.find((p) => p.id === "google"),
    [oauthProviders]
  );

  const handleGoogleSignIn = () => {
    setError(null);
    if (!googleProvider?.auth_url) {
      setError("Google Sign-In is currently unavailable. Please check backend OAuth configuration or use email/password.");
      return;
    }
    setOauthLoading(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("oauth_provider", "google");
    }
    window.location.href = googleProvider.auth_url;
  };

  return (
    <div
      data-theme={theme}
      className={`min-h-screen font-sans flex flex-col justify-center p-4 sm:p-6 lg:px-12 lg:py-6 relative overflow-x-hidden overflow-y-auto transition-colors duration-300 ${
        theme === "dark"
          ? "dark bg-[#181614] text-[#F0EAE1]"
          : "bg-paper-page text-ink"
      }`}
    >
      <AmbientWaveCanvas />

      {/* Top-right theme aperture toggle */}
      <div className="fixed top-4 right-5 z-30">
        <ApertureToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div className="w-full max-w-6xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10 py-2">
        {/* Left Column: Brand & Value Highlights */}
        <div className="lg:col-span-7 space-y-8 pr-0 lg:pr-6 flex flex-col justify-center">
          <DecisionLensLogo href="/" size={44} />

          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-medium text-ink tracking-tight leading-[1.1] mb-4">
              Structure Decisions. <br />
              <span className="text-accent italic font-normal">
                Decide with Grounded Conviction.
              </span>
            </h1>
            <p className="text-[15px] sm:text-base text-ink-secondary leading-relaxed max-w-xl font-courier">
              The Decision Intelligence Platform for engineering leaders, founders, and high-stakes teams.
              Filter meeting banter, ground choices in real benchmarks and live research, and generate verified Decision Records.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-courier text-[15px] text-ink-secondary max-w-xl">
            <div className="p-4 bg-paper-surface/80 border border-border rounded-sm space-y-1.5">
              <span className="font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 text-accent">
                <Brain className="w-4 h-4 shrink-0" />
                Technical Domain RAG
              </span>
              <p className="leading-snug text-[14px]">
                Verified against AWS pricing formulas, hardware latency limits, and database pooling rules.
              </p>
            </div>
            <div className="p-4 bg-paper-surface/80 border border-border rounded-sm space-y-1.5">
              <span className="font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 text-accent">
                Google Meet Autonomous Bot
              </span>
              <p className="leading-snug text-[14px]">
                Joins meetings, auto-scrubs chit-chat, and captures confidential participant inputs.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-5">
          <div className="bg-paper-surface rounded-md p-5 sm:p-6 border border-border relative shadow-lg">
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
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = getDestinationUrl();
                    }}
                    className="px-3 py-1.5 bg-ink hover:opacity-90 text-paper-surface font-semibold rounded-md transition text-xs"
                  >
                    Go to Workspace &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearStoredToken();
                      setCurrentUser(null);
                    }}
                    className="px-2.5 py-1.5 text-ink-secondary hover:text-ink hover:bg-paper-surface rounded-md transition text-xs border border-border"
                  >
                    Switch
                  </button>
                </div>
              </div>
            )}

            {/* Mode Switcher Tabs */}
            <div className="flex items-center p-1 bg-paper-sidebar rounded-md border border-border mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-2 text-[15px] font-semibold rounded-sm transition-all cursor-pointer ${
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
                className={`flex-1 py-2 text-[15px] font-semibold rounded-sm transition-all cursor-pointer ${
                  mode === "signup"
                    ? "bg-paper-surface text-ink font-bold shadow-2xs"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Error & Success Feedback Alerts */}
            {error && (
              <div className="mb-4 p-3 rounded-md border border-rose-300 bg-rose-50/90 text-rose-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  {error}
                  {error.includes("already exists") && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setError(null);
                      }}
                      className="block mt-1 font-bold underline text-rose-950"
                    >
                      Click here to switch to Sign In &rarr;
                    </button>
                  )}
                </div>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="leading-relaxed font-medium">{successMsg}</span>
                </div>
                {devResetUrl && (
                  <Link
                    href={devResetUrl.replace(/^https?:\/\/[^/]+/, "")}
                    className="inline-flex items-center gap-1.5 font-courier font-bold text-emerald-950 underline hover:opacity-80"
                  >
                    <span>Open Dev Reset Password Link</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            )}

            {/* Google OAuth Button */}
            <button
              type="button"
              disabled={oauthLoading || loading}
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 bg-paper-sidebar hover:bg-paper-surface border border-border hover:border-accent text-ink font-semibold text-[15px] rounded-md transition flex items-center justify-center gap-2.5 cursor-pointer font-courier uppercase tracking-wider disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>{oauthLoading ? "Connecting to Google..." : "Continue with Google"}</span>
            </button>

            <div className="relative my-3.5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase font-courier">
                <span className="bg-paper-surface px-2.5 text-ink-tertiary tracking-widest">
                  or continue with email
                </span>
              </div>
            </div>

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5 font-courier uppercase tracking-wider">
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
                    className="w-full pl-10 pr-4 py-2.5 text-[15px] bg-paper-surface border border-border rounded-md text-ink placeholder-ink-tertiary focus:outline-none focus:border-accent transition font-mono"
                  />
                </div>
              </div>

              {mode !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-ink font-courier uppercase tracking-wider">
                      Password
                    </label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setError(null);
                          setSuccessMsg(null);
                          setDevResetUrl(null);
                        }}
                        className="text-[12px] text-accent hover:underline font-semibold font-courier cursor-pointer"
                      >
                        Forgot password?
                      </button>
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
                      className="w-full pl-10 pr-10 py-2.5 text-[15px] bg-paper-surface border border-border rounded-md text-ink placeholder-ink-tertiary focus:outline-none focus:border-accent transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink transition cursor-pointer p-1"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Password complexity checklist (during signup) */}
              {mode === "signup" && (
                <div className="p-3 bg-paper-sidebar border border-border rounded-md text-xs space-y-1.5 font-courier">
                  <span className="font-semibold text-ink block text-[12px] uppercase tracking-wider">
                    Password Criteria
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-[12px]">
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
                disabled={loading}
                className="w-full py-2.5 bg-ink hover:opacity-90 active:scale-[0.99] text-paper-surface font-semibold text-[15px] rounded-md transition flex items-center justify-center gap-2 cursor-pointer font-courier uppercase tracking-wider disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-paper-surface/30 border-t-paper-surface rounded-full animate-spin" />
                    <span>Processing authentication...</span>
                  </>
                ) : mode === "forgot" ? (
                  <>
                    <span>Generate Reset Link</span>
                    <ArrowRight className="w-3.5 h-3.5" />
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

            {/* Quick 1-Click Demo Profiles */}
            <div className="pt-4 mt-4 border-t border-border space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-secondary font-courier">
                <span className="font-bold uppercase tracking-wider flex items-center gap-1 text-accent">
                  1-Click Test Access
                </span>
                <span className="text-[11px] text-ink-tertiary">No password required</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-courier">
                <button
                  type="button"
                  disabled={oauthLoading}
                  onClick={() => handleExecuteOAuth("alex.lead@google.com", "Alex Lead (Lead Architect)")}
                  className="p-2.5 bg-paper-sidebar hover:bg-paper-surface border border-border hover:border-accent rounded-sm text-left transition group cursor-pointer"
                >
                  <div className="text-xs font-bold text-ink group-hover:text-accent">
                    Alex Lead
                  </div>
                  <div className="text-[11px] text-ink-secondary truncate">
                    Lead Architect
                  </div>
                </button>

                <button
                  type="button"
                  disabled={oauthLoading}
                  onClick={() => handleExecuteOAuth("sarah.director@enterprise.com", "Sarah Director (VP Eng)")}
                  className="p-2.5 bg-paper-sidebar hover:bg-paper-surface border border-border hover:border-accent rounded-sm text-left transition group cursor-pointer"
                >
                  <div className="text-xs font-bold text-ink group-hover:text-accent">
                    Sarah Director
                  </div>
                  <div className="text-[11px] text-ink-secondary truncate">
                    VP of Engineering
                  </div>
                </button>
              </div>
            </div>

            <div className="pt-3.5 mt-4 border-t border-border flex items-center justify-end gap-2 text-xs text-ink-secondary font-courier">
              <Link href="/" className="hover:text-ink transition text-ink-tertiary whitespace-nowrap">
                Back to overview
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
