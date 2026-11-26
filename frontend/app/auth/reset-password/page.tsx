"use client";

import React, { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { resetPassword } from "@/lib/api";
import AmbientWaveCanvas from "@/components/AmbientWaveCanvas";
import DecisionLensLogo from "@/components/DecisionLensLogo";
import ApertureToggle from "@/components/ApertureToggle";
import { useTheme } from "@/context/ThemeContext";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const passwordChecks = useMemo(
    () => ({
      minLength: newPassword.length >= 8,
      hasUpper: /[A-Z]/.test(newPassword),
      hasLower: /[a-z]/.test(newPassword),
      hasDigit: /\d/.test(newPassword),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>\-_=+[\]/\\`~]/.test(newPassword),
    }),
    [newPassword]
  );

  const isPasswordValid =
    passwordChecks.minLength &&
    passwordChecks.hasUpper &&
    passwordChecks.hasLower &&
    passwordChecks.hasDigit &&
    passwordChecks.hasSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!token) {
      setError("Reset token is missing. Please request a new password reset link.");
      return;
    }
    if (!isPasswordValid) {
      setError("Please satisfy all password criteria below.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(token, newPassword);
      setSuccessMsg(res.message || "Password reset successfully!");
      setTimeout(() => {
        router.push("/auth");
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-paper-surface rounded-md p-6 sm:p-7 border border-border shadow-lg w-full max-w-md mx-auto">
      <div className="mb-5">
        <span className="font-courier text-xs uppercase tracking-widest text-accent font-bold block mb-1">
          Account Recovery
        </span>
        <h1 className="font-serif text-3xl font-medium text-ink">Set a new password</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md border border-rose-300 bg-rose-50/90 text-rose-900 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5 font-courier uppercase tracking-wider">
            New Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-ink-tertiary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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

        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5 font-courier uppercase tracking-wider">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-ink-tertiary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-10 pr-4 py-2.5 text-[15px] bg-paper-surface border border-border rounded-md text-ink placeholder-ink-tertiary focus:outline-none focus:border-accent transition font-mono"
            />
          </div>
        </div>

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

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-ink hover:opacity-90 text-paper-surface font-semibold text-[15px] rounded-md transition flex items-center justify-center gap-2 cursor-pointer font-courier uppercase tracking-wider disabled:opacity-50"
        >
          <span>{loading ? "Updating password..." : "Reset Password"}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="pt-4 mt-4 border-t border-border text-center text-xs font-courier">
        <Link href="/auth" className="text-accent hover:underline font-semibold">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      data-theme={theme}
      className={`min-h-screen font-sans flex flex-col justify-center p-4 sm:p-6 relative overflow-x-hidden ${
        theme === "dark" ? "dark bg-[#181614] text-[#F0EAE1]" : "bg-paper-page text-ink"
      }`}
    >
      <AmbientWaveCanvas />
      <div className="fixed top-4 right-5 z-30">
        <ApertureToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <div className="w-full max-w-md mx-auto relative z-10 space-y-6">
        <div className="flex justify-center">
          <DecisionLensLogo href="/" size={40} />
        </div>
        <Suspense fallback={<div className="text-center font-courier text-sm">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

