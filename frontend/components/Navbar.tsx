"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { getMe, clearStoredToken, User } from "@/lib/api";
import { LogOut, LogIn, Layers } from "lucide-react";

export default function Navbar({ onUserChange }: { onUserChange?: (user: User | null) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const onUserChangeRef = useRef(onUserChange);
  useEffect(() => {
    onUserChangeRef.current = onUserChange;
  }, [onUserChange]);

  const loadUser = useCallback(async (notify = false) => {
    try {
      const u = await getMe();
      setUser(u);
      if (notify) {
        onUserChangeRef.current?.(u);
      }
    } catch {
      setUser(null);
      if (notify) {
        onUserChangeRef.current?.(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser(false);
  }, [loadUser]);

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
    onUserChangeRef.current?.(null);
  };

  return (
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
              <Link
                href="/profile"
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                title="Manage Account Profile"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200">
                  {user.email[0].toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-900">{user.email}</span>
                  <span className="text-[10px] text-slate-500 font-mono">User #{user.id}</span>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                title="Log out"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
