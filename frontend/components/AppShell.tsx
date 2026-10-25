"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar, { formatDisplayName } from "@/components/Sidebar";
import {
  Menu,
  ChevronRight,
  LogIn,
  LogOut,
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

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
    onRefresh?.();
  };

  const handleCloseMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F1E8] text-[#161E33] flex flex-col antialiased font-ui">
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
        {/* Calm Contextual Topbar: Breadcrumbs + User Info */}
        <header className="sticky top-0 z-30 bg-[#F5F1E8]/95 backdrop-blur-xs border-b border-[#D9D2C3] px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Left: Mobile Menu & Breadcrumbs */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center text-[#161E33] bg-[#FCFBF8] border border-[#D9D2C3] hover:bg-[#EFEADF] active:bg-[#D9D2C3]/60 rounded-[4px] transition-colors shrink-0 shadow-2xs"
              aria-label="Open navigation sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumb Path: Breadcrumb only (Workspaces / Overview) in the normal UI font */}
            <nav className="flex items-center gap-1.5 text-[13px] text-[#5A6275] overflow-hidden truncate">
              <Link
                href="/dashboard"
                className="hover:text-[#161E33] transition-colors shrink-0"
              >
                Workspaces
              </Link>

              {breadcrumbs && breadcrumbs.length > 0 ? (
                breadcrumbs.map((crumb, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 shrink-0 max-w-[240px] truncate">
                    <ChevronRight className="w-3.5 h-3.5 text-[#8B909C] shrink-0" />
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="hover:text-[#161E33] truncate transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-[#161E33] font-medium truncate">
                        {crumb.label}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-[#8B909C] shrink-0" />
                  <span className="text-[#161E33] font-medium">Overview</span>
                </div>
              )}
            </nav>
          </div>

          {/* Right: Custom Page Actions + User Avatar & Name */}
          <div className="flex items-center gap-3 shrink-0">
            {actions}

            {/* User Account */}
            {loadingUser ? (
              <div className="w-7 h-7 rounded-full bg-[#D9D2C3] animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-2.5 pl-2">
                <Link
                  href="/profile"
                  className="flex items-center gap-2 hover:opacity-85 transition-opacity"
                  title="Profile & settings"
                >
                  <div className="w-7 h-7 rounded-full bg-[#FCFBF8] border border-[#D9D2C3] text-[#161E33] font-medium text-xs flex items-center justify-center shrink-0">
                    {user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      (user.display_name || user.email).charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="hidden sm:inline text-[13px] font-medium text-[#161E33]">
                    {formatDisplayName(user.display_name, user.email)}
                  </span>
                </Link>
              </div>
            ) : (
              <Link
                href="/auth"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[#161E33] hover:bg-[#232C47] rounded-[4px] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in</span>
              </Link>
            )}
          </div>
        </header>

        {/* Page Content Body: Content max-width 1100px with 40px page padding */}
        <main className={`flex-1 w-full mx-auto px-6 sm:px-10 py-8 sm:py-10 ${maxWidthClass}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
