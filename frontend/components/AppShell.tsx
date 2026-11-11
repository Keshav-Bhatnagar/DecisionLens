"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar, { formatDisplayName } from "@/components/Sidebar";
import WorkspaceMembersPill from "@/components/WorkspaceMembersPill";
import CelestialThemeToggle from "@/components/CelestialThemeToggle";
import { useTheme } from "@/context/ThemeContext";

import {
  Menu,
  ChevronRight,
  LogIn,
  Sun,
  Moon,
  Pencil,
  Check,
  X,
  User as UserIcon,
  LogOut,
  ChevronDown,
} from "lucide-react";
import {
  getMe,
  updateProfile,
  clearStoredToken,
  User,
} from "@/lib/api";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface AppShellProps {
  children: React.ReactNode;
  activeFolderId?: number;
  activeDecisionId?: number;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  onRefresh?: () => void;
  maxWidthClass?: string;
}

export default function AppShell({
  children,
  activeFolderId,
  activeDecisionId,
  breadcrumbs,
  actions,
  onRefresh,
  maxWidthClass = "max-w-[1100px]",
}: AppShellProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  // Sidebar States
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // User Session State & Quick Edit
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isQuickEditingName, setIsQuickEditingName] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [savingQuickName, setSavingQuickName] = useState(false);
  const [quickNameSuccess, setQuickNameSuccess] = useState(false);
  const [quickNameError, setQuickNameError] = useState<string | null>(null);

  // Automatically close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Load saved sidebar collapse preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("decisionlens_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleToggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("decisionlens_sidebar_collapsed", String(next));
    } catch {
      // Ignore
    }
  };

  const loadUser = useCallback(async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<User>;
      if (customEvent.detail) {
        setUser(customEvent.detail);
      } else {
        loadUser();
      }
    };
    window.addEventListener("user-profile-updated", handleProfileUpdated);
    return () => {
      window.removeEventListener("user-profile-updated", handleProfileUpdated);
    };
  }, [loadUser]);

  const handleStartQuickEdit = () => {
    setQuickName(user?.display_name || user?.email.split("@")[0] || "");
    setIsQuickEditingName(true);
    setQuickNameError(null);
  };

  const handleQuickSaveName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = quickName.trim();
    if (!clean) {
      setQuickNameError("Name cannot be empty.");
      return;
    }
    setSavingQuickName(true);
    setQuickNameError(null);
    try {
      const updated = await updateProfile({ display_name: clean });
      setUser(updated);
      setIsQuickEditingName(false);
      setQuickNameSuccess(true);
      setTimeout(() => setQuickNameSuccess(false), 3000);
      window.dispatchEvent(new CustomEvent("user-profile-updated", { detail: updated }));
    } catch (err: unknown) {
      setQuickNameError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSavingQuickName(false);
    }
  };

  const handleSignOut = () => {
    clearStoredToken();
    window.location.href = "/auth";
  };

  const handleCloseMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <div
      data-theme={theme}
      className={`min-h-screen flex flex-col antialiased transition-colors duration-300 bg-executive-grid relative ${
        theme === "dark"
          ? "dark text-[#F0EAE1]"
          : "text-[#1d1d1b]"
      }`}
    >
      {/* Sidebar Component */}
      <Sidebar
        activeFolderId={activeFolderId}
        activeDecisionId={activeDecisionId}
        onRefresh={() => {
          loadUser();
          onRefresh?.();
        }}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={handleCloseMobile}
        showMobileHeader={false}
      />

      {/* Main Layout Area - shifts with sidebar width (240px desktop) */}
      <div
        className={`flex-1 flex flex-col transition-all duration-200 ease-in-out ${
          collapsed ? "lg:pl-16" : "lg:pl-[260px]"
        }`}
      >
        {/* Calm Contextual Topbar: Breadcrumbs + User Info + Aperture Theme Shutter */}
        <header className="sticky top-0 z-50 bg-[#F4F0E6]/95 dark:bg-[#181614]/95 backdrop-blur-xs border-b border-[#cfc7b2] dark:border-[#38332C] px-4 sm:px-6 h-14 flex items-center justify-between transition-colors duration-200">
          {/* Left: Mobile Menu & Breadcrumbs */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] active:bg-[#cfc7b2]/60 rounded-lg transition-colors shrink-0 shadow-2xs"
              aria-label="Open navigation sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumb Path: Context-Aware Top Navigation */}
            <nav className="flex items-center gap-2 text-[14px] sm:text-[15px] font-sans text-[#4f4b40] dark:text-[#A89F91] overflow-hidden truncate">
              {pathname === "/portfolio" || pathname === "/overview" ? (
                <span className="text-[#1d1d1b] dark:text-[#F0EAE1] font-semibold">
                  Decision Portfolio
                </span>
              ) : (
                <>
                  <Link
                    href="/dashboard"
                    className={`hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] transition-colors shrink-0 ${
                      !breadcrumbs || breadcrumbs.length === 0 ? "text-[#1d1d1b] dark:text-[#F0EAE1] font-semibold" : "font-medium"
                    }`}
                  >
                    Workspaces
                  </Link>

                  {breadcrumbs && breadcrumbs.length > 0 && breadcrumbs.map((crumb, idx) => (
                    <div key={idx} className="flex items-center gap-2 shrink-0 max-w-[280px] truncate">
                      <ChevronRight className="w-4 h-4 text-[#7B8491] shrink-0" />
                      {crumb.href ? (
                        <Link
                          href={crumb.href}
                          className="hover:text-[#2B4C8C] dark:hover:text-[#D4AA50] truncate transition-colors text-[#1d1d1b] dark:text-[#F0EAE1] font-medium"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="text-[#1d1d1b] dark:text-[#F0EAE1] font-semibold truncate">
                          {crumb.label}
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </nav>
          </div>

          {/* Right: Custom Page Actions + Workspace Members + User Avatar & Name + Aperture Toggle */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {actions}

            {(activeFolderId || activeDecisionId) && (
              <WorkspaceMembersPill
                folderId={activeFolderId}
                decisionId={activeDecisionId}
                currentUserEmail={user?.email}
              />
            )}

            {/* 3D Celestial Sun & Moon Theme Toggle (Icon Only) */}
            <div className="pl-2 sm:pl-2.5 border-l border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-center">
              <CelestialThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>

            {/* Extreme Right: User Account Profile */}
            {loadingUser ? (
              <div className="w-7 h-7 rounded-full bg-[#cfc7b2] dark:bg-[#38332C] animate-pulse" />
            ) : user ? (
              <div className="relative flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-[#cfc7b2] dark:border-[#38332C]">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer group"
                  title={`Account: ${formatDisplayName(user.display_name, user.email)} (Click to manage)`}
                >
                  <div className="w-7 h-7 rounded-full bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] font-courier font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs group-hover:border-[#7a4e10] dark:group-hover:border-[#D4AA50]">
                    {user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      (user.display_name || user.email).charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="hidden sm:inline text-xs font-courier font-bold text-[#1d1d1b] dark:text-[#F0EAE1]">
                    {formatDisplayName(user.display_name, user.email)}
                  </span>
                  <ChevronDown className="w-3 h-3 text-[#5c5549] dark:text-[#a89f91] group-hover:text-[#1d1d1b] dark:group-hover:text-[#F0EAE1] transition-transform" />
                </button>

                {/* Executive Account & Name Switcher Dropdown */}
                {isUserMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[60]"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setIsQuickEditingName(false);
                      }}
                    />
                    <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-xl bg-[#FBF9F5] dark:bg-[#1E1B18] border border-[#cfc7b2] dark:border-[#38332C] shadow-2xl z-[70] p-4 space-y-3 font-sans animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* User Header */}
                      <div className="flex items-center gap-3 pb-3 border-b border-[#cfc7b2]/70 dark:border-[#38332C]">
                        <div className="w-10 h-10 rounded-full bg-[#EDE7D6] dark:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] font-newsreader font-bold text-lg flex items-center justify-center shrink-0 shadow-inner">
                          {(user.display_name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-newsreader font-bold text-base text-[#1d1d1b] dark:text-[#F0EAE1] truncate">
                            {formatDisplayName(user.display_name, user.email)}
                          </div>
                          <div className="text-xs text-[#5c5549] dark:text-[#a89f91] truncate font-mono">
                            {user.email}
                          </div>
                        </div>
                      </div>

                      {/* Quick Username / Display Name Change Section */}
                      <div className="p-3 rounded-lg bg-[#EDE7D6]/60 dark:bg-[#221F1C] border border-[#cfc7b2]/80 dark:border-[#38332C] space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider flex items-center gap-1.5">
                            <Pencil className="w-3 h-3" /> Display Name
                          </span>
                          {!isQuickEditingName && (
                            <button
                              type="button"
                              onClick={handleStartQuickEdit}
                              className="text-[11px] font-semibold text-[#7a4e10] dark:text-[#D4AA50] hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                          )}
                        </div>

                        {isQuickEditingName ? (
                          <form onSubmit={handleQuickSaveName} className="space-y-2">
                            <input
                              type="text"
                              value={quickName}
                              onChange={(e) => setQuickName(e.target.value)}
                              placeholder="e.g. Tamanna"
                              className="w-full px-2.5 py-1.5 text-xs font-medium border border-[#7a4e10] dark:border-[#D4AA50] rounded bg-[#FBF9F5] dark:bg-[#181614] text-[#1d1d1b] dark:text-[#F0EAE1] focus:outline-none focus:ring-1 focus:ring-[#7a4e10]"
                              autoFocus
                            />
                            {quickNameError && (
                              <p className="text-[11px] text-red-600 dark:text-red-400 font-sans">
                                {quickNameError}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="submit"
                                disabled={savingQuickName}
                                className="flex-1 py-1 px-2.5 bg-[#7a4e10] text-[#F5F1E8] hover:bg-[#603e0d] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                              >
                                {savingQuickName ? "Saving..." : "Save Name"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsQuickEditingName(false)}
                                className="py-1 px-2.5 border border-[#cfc7b2] dark:border-[#38332C] text-[#5c5549] dark:text-[#a89f91] hover:text-[#1d1d1b] rounded text-xs transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="text-xs text-[#1d1d1b] dark:text-[#F0EAE1] font-medium flex items-center justify-between">
                            <span className="truncate">
                              {user.display_name || user.email.split("@")[0]}
                            </span>
                            {quickNameSuccess && (
                              <span className="text-[10px] text-[#7a4e10] dark:text-[#D4AA50] font-mono font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" /> Updated
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Navigation Actions */}
                      <div className="space-y-1 pt-1">
                        <Link
                          href="/profile"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1d1d1b] dark:text-[#F0EAE1] hover:bg-[#EDE7D6] dark:hover:bg-[#2C2723] rounded-lg transition-colors"
                        >
                          <UserIcon className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
                          <span>Executive Folio &amp; Settings</span>
                        </Link>

                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link
                href="/auth"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[#161E33] hover:bg-[#232C47] dark:bg-[#D4AA50] dark:text-[#181614] dark:hover:bg-[#E5BE64] rounded-[4px] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in</span>
              </Link>
            )}
          </div>
        </header>

        {/* Page Content Body */}
        <main className={`flex-1 w-full mx-auto px-6 sm:px-10 py-8 sm:py-10 ${maxWidthClass}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
