"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar, { formatDisplayName } from "@/components/Sidebar";
import WorkspaceMembersPill from "@/components/WorkspaceMembersPill";
import ApertureToggle from "@/components/ApertureToggle";
import { useTheme } from "@/context/ThemeContext";

import {
  Menu,
  ChevronRight,
  LogIn,
} from "lucide-react";
import {
  getMe,
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

  // User Session State
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

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
  }, [loadUser]);

  const handleCloseMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <div
      data-theme={theme}
      className={`min-h-screen flex flex-col antialiased transition-colors duration-300 ${
        theme === "dark"
          ? "dark bg-[#181614] text-[#F0EAE1]"
          : "bg-[#F4F0E6] text-[#1d1d1b]"
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
          collapsed ? "lg:pl-16" : "lg:pl-[240px]"
        }`}
      >
        {/* Calm Contextual Topbar: Breadcrumbs + User Info + Aperture Theme Shutter */}
        <header className="sticky top-0 z-30 bg-[#F4F0E6]/95 dark:bg-[#181614]/95 backdrop-blur-xs border-b border-[#cfc7b2] dark:border-[#38332C] px-4 sm:px-6 h-14 flex items-center justify-between transition-colors duration-200">
          {/* Left: Mobile Menu & Breadcrumbs */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] hover:bg-[#E5DEC9] dark:hover:bg-[#2A2622] active:bg-[#cfc7b2]/60 rounded-[4px] transition-colors shrink-0 shadow-2xs"
              aria-label="Open navigation sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumb Path: Breadcrumb only (Workspaces / Overview) */}
            <nav className="flex items-center gap-1.5 text-[13px] font-courier text-[#4f4b40] dark:text-[#A89F91] overflow-hidden truncate">
              <Link
                href="/dashboard"
                className="hover:text-[#1d1d1b] dark:hover:text-[#F0EAE1] transition-colors shrink-0"
              >
                Workspaces
              </Link>

              {breadcrumbs && breadcrumbs.length > 0 ? (
                breadcrumbs.map((crumb, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 shrink-0 max-w-[240px] truncate">
                    <ChevronRight className="w-3.5 h-3.5 text-[#7B8491] shrink-0" />
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="hover:text-[#2B4C8C] dark:hover:text-[#D4AA50] truncate transition-colors text-[#1d1d1b] dark:text-[#F0EAE1]"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-[#1d1d1b] dark:text-[#F0EAE1] font-bold truncate">
                        {crumb.label}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-[#7B8491] shrink-0" />
                  <span className="text-[#1d1d1b] dark:text-[#F0EAE1] font-bold">Overview</span>
                </div>
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

            {/* Aperture Theme Shutter Dial (f/1.4 Lux <-> f/16 Nox) */}
            <div className="pl-2.5 sm:pl-3 border-l border-[#cfc7b2] dark:border-[#38332C] flex items-center justify-center">
              <ApertureToggle theme={theme} onToggle={toggleTheme} />
            </div>

            {/* Extreme Right: User Account Profile */}
            {loadingUser ? (
              <div className="w-7 h-7 rounded-full bg-[#cfc7b2] dark:bg-[#38332C] animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-[#cfc7b2] dark:border-[#38332C]">
                <Link
                  href="/profile"
                  className="flex items-center gap-2 hover:opacity-85 transition-opacity"
                  title={`Signed in as ${formatDisplayName(user.display_name, user.email)} (Profile & settings)`}
                >
                  <div className="w-7 h-7 rounded-full bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#1d1d1b] dark:text-[#F0EAE1] font-courier font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
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
                </Link>
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
