"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { getMe, clearStoredToken, User, loginUser, registerUser } from "@/lib/api";
import { Folder, User as UserIcon, LogOut, LogIn, Sparkles, Layers } from "lucide-react";

export default function Navbar({ onUserChange }: { onUserChange?: (user: User | null) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const u = await getMe();
      setUser(u);
      onUserChange?.(u);
    } catch {
      setUser(null);
      onUserChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [onUserChange]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
    onUserChange?.(null);
  };

  const handleQuickDemoLogin = async (email: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      try {
        await loginUser(email, "Password123!");
      } catch {
        await registerUser(email, "Password123!");
      }
      await loadUser();
      setShowAuthModal(false);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isRegister) {
        await registerUser(authEmail, authPassword);
      } else {
        await loginUser(authEmail, authPassword);
      }
      await loadUser();
      setShowAuthModal(false);
      setAuthEmail("");
      setAuthPassword("");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Auth failed");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-slate-900 text-lg tracking-tight hover:opacity-90">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                DL
              </div>
              <span>DecisionLens</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-1 text-sm font-medium text-slate-600">
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1.5"
              >
                <Layers className="w-4 h-4 text-slate-500" />
                Workspaces
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-24 bg-slate-100 rounded-lg animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-900">{user.email}</span>
                  <span className="text-[10px] text-slate-500 font-mono">User #{user.id}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200">
                  {user.email[0].toUpperCase()}
                </div>
                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In / Switch
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal for Easy Local Verification */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <h3 className="text-lg font-semibold text-slate-900">
                {isRegister ? "Create Account" : "Sign In to DecisionLens"}
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
                {authError}
              </div>
            )}

            {/* Quick Demo Logins for Testing Cross-User Isolation */}
            <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                One-Click Multi-Tenancy Testing:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin("alice@decisionlens.ai")}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 text-slate-800 rounded-lg text-xs font-medium text-left transition-colors"
                >
                  👤 User A (Alice)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemoLogin("bob@decisionlens.ai")}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 text-slate-800 rounded-lg text-xs font-medium text-left transition-colors"
                >
                  👤 User B (Bob)
                </button>
              </div>
            </div>

            <form onSubmit={handleManualAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors"
              >
                {isRegister ? "Register" : "Sign In"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {isRegister ? "Already have an account? Sign In" : "Don't have an account? Register"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
