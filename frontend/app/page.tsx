"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { getMe, User } from "@/lib/api";
import { motion } from "framer-motion";
import BrandLogo from "@/components/BrandLogo";
import ApertureToggle from "@/components/ApertureToggle";
import { useTheme } from "@/context/ThemeContext";

// Lazy-load the 3D scene with ssr: false
const TornDecisionCanvas = dynamic(
  () => import("@/components/TornDecisionCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[60vh] flex items-center justify-center font-courier text-xs tracking-widest text-[#596474]">
        Preparing reasoning canvas...
      </div>
    ),
  }
);

// Cases in action tab data
interface CaseActionData {
  id: string;
  tabLabel: string;
  category: string;
  question: string;
  flaggedAssumption: string;
  followUpQuestion: string;
  auditDetail: string;
}

const CASES_DATA: CaseActionData[] = [
  {
    id: "cloud",
    tabLabel: "Cloud",
    category: "INFRASTRUCTURE & ARCHITECTURE",
    question: "Should we migrate our core production infrastructure to the cloud?",
    flaggedAssumption:
      "“Cloud migration will directly reduce infrastructure spend within 12 months without increasing operational headcount.”",
    followUpQuestion:
      "What is the amortized cost when accounting for continuous data egress and managing dual-run cutover for 10 weeks with a 3-person SRE team?",
    auditDetail:
      "Telemetry audit shows 8,200 IOPS write bursts against GP3 limits. The true bottleneck is transactional lock contention, not server compute capacity.",
  },
  {
    id: "hire",
    tabLabel: "Hire",
    category: "TALENT & ORGANIZATIONAL DESIGN",
    question: "Which candidate best fits the technical lead role?",
    flaggedAssumption:
      "“Hiring an external enterprise lead will immediately establish engineering rigor faster than coaching our internal top performer.”",
    followUpQuestion:
      "How much execution velocity will be lost during the 4-month domain ramp-up window compared to elevating an existing engineer who already knows the legacy codebase?",
    auditDetail:
      "Historical onboarding metrics indicate domain ramp-up takes 120 days for distributed systems, introducing execution risk during the upcoming product milestone.",
  },
  {
    id: "launch",
    tabLabel: "Launch",
    category: "PRODUCT STRATEGY & GO-TO-MARKET",
    question: "Should we launch our B2B product MVP to enterprise clients this quarter?",
    flaggedAssumption:
      "“Early adopters will forgive the absence of enterprise role-based access control (RBAC) and audit logs if core workflows deliver value.”",
    followUpQuestion:
      "What percentage of targeted enterprise security officers will block vendor procurement immediately during SOC-2 compliance review?",
    auditDetail:
      "Security compliance review indicates 85% of enterprise IT departments mandate immutable audit logs before granting production database access.",
  },
  {
    id: "offer",
    tabLabel: "Offer",
    category: "EXECUTIVE COMPENSATION & CAREER",
    question: "Should I accept a high-equity Series A offer over an established tech role?",
    flaggedAssumption:
      "“A 1.5% equity grant at current valuation guarantees a superior 4-year outcome compared to higher cash compensation and liquid assets.”",
    followUpQuestion:
      "What is the net diluted value of the grant under a 3x liquidation preference and 40% future secondary dilution if an exit takes 7 years?",
    auditDetail:
      "Symmetrical financial accounting surfaces illiquid risk: the cash shortfall requires ₹14L personal reserves during the mandatory vesting cliff.",
  },
];

export default function EditorialLandingPage() {
  const router = useRouter();

  // User auth state
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Global Shared Theme State: Light (cream) or Dark (ink-navy)
  const { theme, toggleTheme } = useTheme();

  // Scroll offset for wordmark parallax
  const [scrollY, setScrollY] = useState(0);

  // Cases in action active tab
  const [activeCaseTab, setActiveCaseTab] = useState<string>("cloud");

  // 3D Pointer Tilt State for Case Card
  const [cardTilt, setCardTilt] = useState({ rx: 0, ry: 0 });
  const caseCardRef = useRef<HTMLDivElement>(null);

  // Check user authentication
  useEffect(() => {
    async function checkAuth() {
      try {
        const u = await getMe();
        setUser(u);
      } catch {
        setUser(null);
      } finally {
        setLoadingUser(false);
      }
    }
    checkAuth();
  }, []);

  // Scroll listener for hero wordmark parallax
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const CTA_ROUTE = user
    ? "/dashboard?action=new"
    : "/auth?redirect=/dashboard?action=new";

  const handlePointerMoveCard = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!caseCardRef.current) return;
    const rect = caseCardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Max 14deg Y, 12deg X
    const ry = ((x - centerX) / centerX) * 14;
    const rx = -((y - centerY) / centerY) * 12;
    setCardTilt({ rx, ry });
  };

  const handlePointerLeaveCard = () => {
    setCardTilt({ rx: 0, ry: 0 });
  };

  const currentCase =
    CASES_DATA.find((c) => c.id === activeCaseTab) || CASES_DATA[0];

  const isScrolled = scrollY > 10;

  return (
    <div
      data-theme={theme}
      className={`min-h-screen font-courier antialiased transition-colors duration-300 ${
        theme === "dark"
          ? "dark bg-[#181614] text-[#F0EAE1] selection:bg-[#D4AA50] selection:text-[#181614]"
          : "bg-[#F4F0E6] text-[#1d1d1b] selection:bg-[#2B4C8C] selection:text-[#F4F0E6]"
      }`}
    >
      {/* ==================================================
          FIRST SECTION: NAVIGATION (Fixed 58px)
          Fully Theme-Aware Masthead (Cream / Ink-Navy)
          ================================================== */}
      <nav
        className={`fixed top-0 left-0 right-0 h-[58px] z-40 px-6 lg:px-16 flex items-center justify-between transition-all duration-300 bg-transparent backdrop-blur-md border-b ${
          theme === "dark"
            ? "border-[#38332C] text-[#F0EAE1]"
            : "border-[#172033]/15 text-[#172033]"
        }`}
      >
        {/* Left Brand Identity: Antique Magnifying Lens Logo + Sleek Serif Wordmark */}
        <BrandLogo theme={theme} />

        {/* Right Section: Actions + Theme Shutter Dial + Extreme Right User Profile */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          {loadingUser ? (
            <span
              className={`text-[11px] tracking-[0.08em] ${
                theme === "dark" ? "text-[#A89F91]" : "text-[#7B8491]"
              }`}
            >
              VERIFYING...
            </span>
          ) : user ? (
            <div className="flex items-center">
              <Link
                href="/dashboard"
                className={`text-[11px] font-bold tracking-[0.08em] px-3.5 py-1.5 border transition-colors ${
                  theme === "dark"
                    ? "border-[#D4AA50] bg-[#D4AA50] text-[#181614] hover:bg-[#E5BE64] hover:text-[#181614]"
                    : "border-[#172033] bg-[#172033] text-[#F5F1E8] hover:bg-transparent hover:text-[#172033]"
                }`}
                title="Open active reasoning dashboard & workspaces"
              >
                DASHBOARD →
              </Link>
            </div>
          ) : (
            <div className="flex items-center space-x-2 sm:space-x-2.5">
              <Link
                href="/auth"
                className={`text-[11px] font-bold tracking-[0.08em] px-2.5 py-1 transition-colors ${
                  theme === "dark"
                    ? "text-[#A89F91] hover:text-[#D4AA50]"
                    : "text-[#596474] hover:text-[#315C8A]"
                }`}
              >
                SIGN IN
              </Link>
              <Link
                href="/auth?redirect=/dashboard?action=new"
                className={`text-[11px] font-bold tracking-[0.08em] px-3.5 py-1.5 border transition-colors ${
                  theme === "dark"
                    ? "border-[#D4AA50] bg-[#D4AA50] text-[#181614] hover:bg-[#E5BE64] hover:text-[#181614]"
                    : "border-[#172033] bg-[#172033] text-[#F5F1E8] hover:bg-transparent hover:text-[#172033]"
                }`}
              >
                CHALLENGE A DECISION
              </Link>
            </div>
          )}

          {/* Optical Aperture Shutter Dial (f/1.4 Lux <-> f/16 Nox) */}
          <div className="pl-2 sm:pl-3 border-l border-[#172033]/15 dark:border-[#38332C] flex items-center">
            <ApertureToggle theme={theme} onToggle={toggleTheme} />
          </div>

          {/* Extreme Right: User Account Profile Avatar & Badge */}
          {user && (
            <div className="pl-2 sm:pl-3 border-l border-[#172033]/15 dark:border-[#38332C] flex items-center">
              <Link
                href="/profile"
                className="group flex items-center gap-2 hover:opacity-85 transition-opacity"
                title={`Signed in as ${user.display_name || user.email} (View Profile)`}
              >
                <div className="w-7 h-7 rounded-full bg-[#161E33] dark:bg-[#D4AA50] text-[#F5F1E8] dark:text-[#181614] font-bold text-xs flex items-center justify-center uppercase shadow-2xs group-hover:scale-105 transition-transform">
                  {(user.display_name || user.email)[0]}
                </div>
                <span
                  className={`hidden sm:inline text-[11px] tracking-[0.08em] font-semibold transition-colors ${
                    theme === "dark"
                      ? "text-[#F0EAE1] group-hover:text-[#D4AA50]"
                      : "text-[#161E33] group-hover:text-[#2F5D8F]"
                  }`}
                >
                  {user.display_name || user.email.split("@")[0]}
                </span>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Authenticated User Status Bar */}
      {user && (
        <div
          className={`pt-[58px] border-b px-6 py-2 text-[11px] tracking-[0.08em] flex items-center justify-between transition-colors duration-300 ${
            theme === "dark"
              ? "bg-[#221F1C] border-[#38332C] text-[#A89F91]"
              : "bg-[#E9E3D7] border-[#172033]/15 text-[#596474]"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 ${
                theme === "dark" ? "bg-[#D4AA50]" : "bg-[#315C8A]"
              }`}
            />
            <span>
              AUTHENTICATED DOSSIER WORKSPACE:{" "}
              <strong
                className={
                  theme === "dark" ? "text-[#F0EAE1]" : "text-[#172033]"
                }
              >
                {user.email}
              </strong>
              . READY FOR REASONING SCRUTINY.
            </span>
          </div>
        </div>
      )}

      {/* ==================================================
          HERO SECTION (Theme-Aware Light & Dark)
          ================================================== */}
      <section
        className={`relative ${
          user ? "pt-10" : "pt-20"
        } pb-16 sm:pb-24 px-6 sm:px-12 lg:px-20 border-b overflow-hidden transition-colors duration-300 ${
          theme === "dark"
            ? "bg-[#221F1C] border-[#38332C]"
            : "bg-[#E9E3D7] border-[#172033]/15"
        }`}
      >
        <div className="max-w-4xl mx-auto relative z-10">
          {/* Kicker */}
          <div className="flex items-center gap-3 mb-6">
            <span
              className={`text-[11px] font-courier tracking-[0.1em] font-bold ${
                theme === "dark" ? "text-[#D4AA50]" : "text-[#315C8A]"
              }`}
            >
              DECISION INTELLIGENCE / 01
            </span>
            <span
              className={`w-6 h-[1px] ${
                theme === "dark" ? "bg-[#D4AA50]/40" : "bg-[#315C8A]/40"
              }`}
            />
            <span
              className={`text-[11px] font-courier tracking-[0.08em] ${
                theme === "dark" ? "text-[#A89F91]" : "text-[#7B8491]"
              }`}
            >
              REASONING SCRUTINY ENGINE
            </span>
          </div>

          {/* Headline */}
          <h1
            className={`font-newsreader text-4xl sm:text-6xl lg:text-7xl font-normal tracking-[-0.02em] leading-[1.05] mb-6 ${
              theme === "dark" ? "text-[#F0EAE1]" : "text-[#172033]"
            }`}
          >
            Kill costly blind spots{" "}
            <span
              className={`italic font-normal block sm:inline ${
                theme === "dark" ? "text-[#D4AA50]" : "text-[#172033]"
              }`}
            >
              before you commit capital, code, or headcount.
            </span>
          </h1>

          {/* Supporting Copy */}
          <p
            className={`font-courier text-xs sm:text-sm leading-[1.9] max-w-2xl mb-7 ${
              theme === "dark" ? "text-[#A89F91]" : "text-[#596474]"
            }`}
          >
            DecisionLens puts contentious boardroom debates, hiring dilemmas, and architectural bets under rigorous scrutiny.
            Expose unvetted assumptions, calculate hidden sunk costs, and align leadership with auditable Decision Records (ADRs).
          </p>

          {/* Primary & Secondary CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-7">
            <Link
              href={CTA_ROUTE}
              className={`px-7 py-3.5 border font-courier text-xs tracking-[0.08em] uppercase font-bold transition-all text-center inline-flex items-center justify-center gap-2 shadow-sm ${
                theme === "dark"
                  ? "border-[#D4AA50] bg-[#D4AA50] text-[#181614] hover:bg-[#E5BE64] hover:text-[#181614]"
                  : "border-[#172033] bg-[#172033] text-[#F5F1E8] hover:bg-[#2C2723] hover:text-[#F5F1E8]"
              }`}
            >
              <span>Challenge a Decision →</span>
            </Link>
            <a
              href="#the-flow"
              className={`px-5 py-3.5 border font-courier text-xs tracking-[0.08em] uppercase transition-colors text-center ${
                theme === "dark"
                  ? "border-[#38332C] bg-transparent text-[#F0EAE1] hover:border-[#D4AA50]"
                  : "border-[#172033]/30 bg-transparent text-[#172033] hover:border-[#172033]"
              }`}
            >
              See How It Works ↓
            </a>
          </div>

          {/* Trust & Enterprise Assurance Strip (Monochrome Industrial Minimal) */}
          <div
            className={`flex flex-wrap items-center gap-y-2 gap-x-4 py-2 px-3.5 rounded border text-[11px] font-courier mb-8 ${
              theme === "dark"
                ? "bg-[#181614] border-[#38332C] text-[#A89F91]"
                : "bg-[#F5F1E8] border-[#172033]/20 text-[#172033]"
            }`}
          >
            <span className="font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              DPDP ACT 2023 COMPLIANT
            </span>
            <span className="opacity-30">/</span>
            <span>IN-MEMORY AUDIO ENCRYPTION</span>
            <span className="opacity-30">/</span>
            <span>ZERO CLOUD TRAINING</span>
            <span className="opacity-30">/</span>
            <span className="font-bold">SOC-2 TYPE II AUDIT READY</span>
          </div>

          {/* Interactive Multi-Disciplinary Scrutiny Dossier Card (Bold Cerebras Industrial Style) */}
          <div
            className={`p-5 sm:p-6 rounded-lg border shadow-xl space-y-4 mb-8 transition-all ${
              theme === "dark"
                ? "bg-[#181614] border-[#38332C]"
                : "bg-[#F5F1E8] border-[#172033]"
            }`}
          >
            {/* Header: Dossier Badge + Domain Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5 font-courier text-xs">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span className="font-bold tracking-widest uppercase text-[#172033] dark:text-[#F0EAE1]">
                  REASONING AUDIT DOSSIER
                </span>
              </div>

              {/* Multi-Domain Interactive Switcher */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: "cloud", label: "01 ARCHITECTURE" },
                  { id: "hire", label: "02 TALENT & ORG" },
                  { id: "launch", label: "03 GTM STRATEGY" },
                  { id: "offer", label: "04 CAPITAL & M&A" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCaseTab(tab.id)}
                    className={`px-2.5 py-1 text-[10px] tracking-wider uppercase font-bold transition-all cursor-pointer rounded-xs ${
                      activeCaseTab === tab.id
                        ? theme === "dark"
                          ? "bg-[#D4AA50] text-[#181614]"
                          : "bg-[#172033] text-[#F5F1E8]"
                        : "text-[#596474] dark:text-[#A89F91] hover:text-[#172033] dark:hover:text-[#F0EAE1]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Central Subject Dilemma */}
            <div className="space-y-1">
              <span className="text-[10px] font-courier uppercase tracking-widest text-[#596474] dark:text-[#A89F91] block">
                DELIBERATION SUBJECT:
              </span>
              <p className="font-newsreader text-xl sm:text-2xl font-normal leading-snug text-[#172033] dark:text-[#F0EAE1]">
                “{currentCase.question}”
              </p>
            </div>

            {/* 3 Bold Analytical Scrutiny Panels (Monochrome High Contrast) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Panel 1: Blindspot / Unvetted Assumption */}
              <div
                className={`p-3.5 rounded border text-xs font-courier space-y-1.5 ${
                  theme === "dark"
                    ? "bg-[#141210] border-[#38332C]"
                    : "bg-[#EDE7D6] border-[#172033]/25"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#172033] dark:text-[#F0EAE1]">
                  <span>[01 BLIND SPOT]</span>
                  <span className="text-[10px] font-mono tracking-wider opacity-60">UNVETTED</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#172033] dark:text-[#F0EAE1]">
                  {currentCase.flaggedAssumption}
                </p>
              </div>

              {/* Panel 2: The Socratic Stress-Test */}
              <div
                className={`p-3.5 rounded border text-xs font-courier space-y-1.5 ${
                  theme === "dark"
                    ? "bg-[#141210] border-[#38332C]"
                    : "bg-[#EDE7D6] border-[#172033]/25"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#172033] dark:text-[#F0EAE1]">
                  <span>[02 STRESS TEST]</span>
                  <span className="text-[10px] font-mono tracking-wider opacity-60">SOCRATIC</span>
                </div>
                <p className="text-[11px] leading-relaxed italic text-[#172033] dark:text-[#F0EAE1]">
                  “{currentCase.followUpQuestion}”
                </p>
              </div>

              {/* Panel 3: Evidence & Synthesis */}
              <div
                className={`p-3.5 rounded border text-xs font-courier space-y-1.5 ${
                  theme === "dark"
                    ? "bg-[#141210] border-[#38332C]"
                    : "bg-[#EDE7D6] border-[#172033]/25"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#172033] dark:text-[#F0EAE1]">
                  <span>[03 ADR VERDICT]</span>
                  <span className="text-[10px] font-mono tracking-wider opacity-60">ACTIONABLE</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#172033] dark:text-[#F0EAE1]">
                  {currentCase.auditDetail}
                </p>
              </div>
            </div>
          </div>

          {/* Process Index Strip */}
          <div
            className={`pt-6 border-t grid grid-cols-2 sm:grid-cols-6 gap-2 text-[10px] font-courier tracking-[0.08em] ${
              theme === "dark"
                ? "border-[#38332C] text-[#A89F91]"
                : "border-[#172033]/15 text-[#596474]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`font-bold ${
                  theme === "dark" ? "text-[#D4AA50]" : "text-[#315C8A]"
                }`}
              >
                01
              </span>
              <span
                className={`font-bold ${
                  theme === "dark" ? "text-[#F0EAE1]" : "text-[#172033]"
                }`}
              >
                DECISION
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  theme === "dark" ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                }
              >
                →
              </span>
              <span>ASSUMPTIONS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  theme === "dark" ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                }
              >
                →
              </span>
              <span>EVIDENCE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  theme === "dark" ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                }
              >
                →
              </span>
              <span>BIAS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  theme === "dark" ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                }
              >
                →
              </span>
              <span>TRADE-OFFS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  theme === "dark" ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                }
              >
                →
              </span>
              <span>RISKS</span>
            </div>
          </div>
        </div>

        {/* Oversized Faded DECISION Wordmark */}
        <div
          className="absolute -bottom-8 left-0 right-0 pointer-events-none select-none overflow-hidden opacity-[0.04] transition-transform duration-100 ease-out"
          style={{
            transform: `translateY(${Math.min(scrollY * 0.08, 30)}px) scale(${1 + Math.min(scrollY * 0.0003, 0.05)})`,
          }}
        >
          <p
            className={`font-newsreader font-bold text-[22vw] leading-none tracking-tighter text-center whitespace-nowrap ${
              theme === "dark" ? "text-[#F0EAE1]" : "text-[#161E33]"
            }`}
          >
            DECISION
          </p>
        </div>
      </section>

      {/* ==================================================
          TORN-PAPER ZIGZAG DIVIDER (Between Hero & Flow)
          ================================================== */}
      <div
        className="w-full h-4 overflow-hidden select-none pointer-events-none -mt-2 relative z-20"
        style={{
          backgroundColor: theme === "dark" ? "#181614" : "#EDE7D6",
          clipPath:
            "polygon(0% 0%, 2% 100%, 4% 0%, 6% 100%, 8% 0%, 10% 100%, 12% 0%, 14% 100%, 16% 0%, 18% 100%, 20% 0%, 22% 100%, 24% 0%, 26% 100%, 28% 0%, 30% 100%, 32% 0%, 34% 100%, 36% 0%, 38% 100%, 40% 0%, 42% 100%, 44% 0%, 46% 100%, 48% 0%, 50% 100%, 52% 0%, 54% 100%, 56% 0%, 58% 100%, 60% 0%, 62% 100%, 64% 0%, 66% 100%, 68% 0%, 70% 100%, 72% 0%, 74% 100%, 76% 0%, 78% 100%, 80% 0%, 82% 100%, 84% 0%, 86% 100%, 88% 0%, 90% 100%, 92% 0%, 94% 100%, 96% 0%, 98% 100%, 100% 0%, 100% 100%, 0% 100%)",
        }}
      />

      {/* ==================================================
          DECONSTRUCTION CANVAS
          (Pinned ~260vh tall with sticky 100vh 3D Three.js stage)
          ================================================== */}
      <section id="the-flow" className="relative">
        <TornDecisionCanvas
          theme={theme}
          onChallengeClick={() => router.push(CTA_ROUTE)}
        />
      </section>

      {/* ==================================================
          CASES IN ACTION
          ================================================== */}
      <section
        id="cases-in-action"
        className={`py-20 sm:py-28 px-4 sm:px-8 lg:px-16 border-b transition-colors duration-300 ${
          theme === "dark"
            ? "bg-[#181614] border-[#38332C]"
            : "bg-[#F4F0E6] border-[#cfc7b2]"
        }`}
      >
        <div className="max-w-4xl mx-auto">
          {/* Section Kicker */}
          <div className="mb-8">
            <span
              className={`text-xs font-courier tracking-[0.14em] uppercase font-bold block mb-2 ${
                theme === "dark" ? "text-[#D4AA50]" : "text-[#2B4C8C]"
              }`}
            >
              CASES IN ACTION
            </span>
            <h2
              className={`font-newsreader text-3xl sm:text-5xl font-normal leading-tight ${
                theme === "dark" ? "text-[#F0EAE1]" : "text-[#1d1d1b]"
              }`}
            >
              Assumptions, exposed before commitment.
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Question & Tabs (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Category Pill */}
              <span
                className={`text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded border font-courier ${
                  theme === "dark"
                    ? "bg-[#221F1C] text-[#D4AA50] border-[#38332C]"
                    : "bg-[#EDE7D6] text-[#2B4C8C] border-[#cfc7b2]"
                }`}
              >
                {currentCase.category}
              </span>

              {/* Central Question */}
              <h3
                className={`font-newsreader text-2xl sm:text-3xl font-normal leading-snug ${
                  theme === "dark" ? "text-[#F0EAE1]" : "text-[#1d1d1b]"
                }`}
              >
                “{currentCase.question}”
              </h3>

              {/* Tabs (Cloud, Hire, Launch, Offer) */}
              <div
                className={`p-1.5 border rounded-sm grid grid-cols-4 gap-1 font-courier text-xs ${
                  theme === "dark"
                    ? "bg-[#221F1C] border-[#38332C]"
                    : "bg-[#EDE7D6] border-[#cfc7b2]"
                }`}
              >
                {CASES_DATA.map((c) => {
                  const isActive = activeCaseTab === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCaseTab(c.id)}
                      className={`py-2 px-1 text-center font-bold tracking-wider transition-all cursor-pointer ${
                        isActive
                          ? theme === "dark"
                            ? "bg-[#D4AA50] text-[#181614] shadow-sm"
                            : "bg-[#1d1d1b] text-[#F4F0E6] shadow-sm"
                          : theme === "dark"
                            ? "text-[#A89F91] hover:text-[#F0EAE1]"
                            : "text-[#4f4b40] hover:text-[#1d1d1b]"
                      }`}
                    >
                      {c.tabLabel}
                    </button>
                  );
                })}
              </div>

              {/* Analytical Telemetry Note */}
              <p
                className={`text-xs sm:text-sm font-courier leading-relaxed ${
                  theme === "dark" ? "text-[#A89F91]" : "text-[#4f4b40]"
                }`}
              >
                {currentCase.auditDetail}
              </p>

              {/* Action Button */}
              <Link
                href={CTA_ROUTE}
                className={`inline-block text-xs font-bold font-courier uppercase tracking-wider py-2.5 px-4 border transition ${
                  theme === "dark"
                    ? "bg-[#D4AA50] text-[#181614] border-[#D4AA50] hover:bg-[#E5BE64] hover:text-[#181614]"
                    : "bg-[#1e2a44] text-[#F4F0E6] border-[#1e2a44] hover:bg-transparent hover:text-[#1e2a44]"
                }`}
              >
                Challenge This Archetype →
              </Link>
            </div>

            {/* Right Column: "Assumption Flagged" Card with Amber Border & 3D Tilt (7 Cols) */}
            <div
              className="lg:col-span-7"
              style={{ perspective: "1000px" }}
              onPointerMove={handlePointerMoveCard}
              onPointerLeave={handlePointerLeaveCard}
            >
              <motion.div
                ref={caseCardRef}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`p-6 sm:p-8 border border-l-4 transition-all shadow-md font-courier space-y-5 ${
                  theme === "dark"
                    ? "bg-[#221F1C] border-[#38332C] border-l-[#D4AA50] text-[#F0EAE1]"
                    : "bg-[#EDE7D6] border-[#cfc7b2] border-l-[#7a4e10] text-[#1d1d1b]"
                }`}
                style={{
                  transform: `rotateX(${cardTilt.rx}deg) rotateY(${cardTilt.ry}deg)`,
                  transformStyle: "preserve-3d",
                  clipPath:
                    "polygon(0% 0%, 98% 1.5%, 100% 98.5%, 1.5% 100%)",
                }}
              >
                {/* Header Stamp */}
                <div className="flex items-center justify-between pb-3 border-current/15 border-b">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        theme === "dark" ? "bg-[#D4AA50]" : "bg-[#7a4e10]"
                      } animate-pulse`}
                    />
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${
                        theme === "dark" ? "text-[#D4AA50]" : "text-[#7a4e10]"
                      }`}
                    >
                      ASSUMPTION FLAGGED
                    </span>
                  </div>
                </div>

                {/* Flagged Assumption Quote with translateZ depth */}
                <div style={{ transform: "translateZ(20px)" }}>
                  <p className="font-newsreader text-xl sm:text-2xl font-normal leading-relaxed italic">
                    {currentCase.flaggedAssumption}
                  </p>
                </div>

                {/* Challenging Follow-up Question */}
                <div
                  className={`p-4 border text-xs sm:text-sm space-y-1.5 ${
                    theme === "dark"
                      ? "bg-[#181614]/80 border-[#38332C] text-[#D4AA50]"
                      : "bg-[#F4F0E6] border-[#cfc7b2] text-[#2B4C8C]"
                  }`}
                  style={{ transform: "translateZ(12px)" }}
                >
                  <span className="font-bold text-[11px] uppercase tracking-wider block opacity-90">
                    THE CHALLENGING QUESTION:
                  </span>
                  <p className="italic font-newsreader text-base sm:text-lg leading-snug">
                    “{currentCase.followUpQuestion}”
                  </p>
                </div>

                {/* Footer Note */}
                <div className="text-[11px] opacity-75 pt-2 flex items-center justify-between">
                  <span>Audited via DecisionLens Cognitive Structuring</span>
                  <span>Fault Category: {currentCase.category.split(" ")[0]}</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          TORN-PAPER ZIGZAG DIVIDER (Above Philosophy Band)
          ================================================== */}
      <div
        className="w-full h-4 overflow-hidden select-none pointer-events-none -mt-2 relative z-20"
        style={{
          backgroundColor: theme === "dark" ? "#181614" : "#EDE7D6",
          clipPath:
            "polygon(0% 0%, 2% 100%, 4% 0%, 6% 100%, 8% 0%, 10% 100%, 12% 0%, 14% 100%, 16% 0%, 18% 100%, 20% 0%, 22% 100%, 24% 0%, 26% 100%, 28% 0%, 30% 100%, 32% 0%, 34% 100%, 36% 0%, 38% 100%, 40% 0%, 42% 100%, 44% 0%, 46% 100%, 48% 0%, 50% 100%, 52% 0%, 54% 100%, 56% 0%, 58% 100%, 60% 0%, 62% 100%, 64% 0%, 66% 100%, 68% 0%, 70% 100%, 72% 0%, 74% 100%, 76% 0%, 78% 100%, 80% 0%, 82% 100%, 84% 0%, 86% 100%, 88% 0%, 90% 100%, 92% 0%, 94% 100%, 96% 0%, 98% 100%, 100% 0%, 100% 100%, 0% 100%)",
        }}
      />

      {/* ==================================================
          EPISTEMIC RIGOR PHILOSOPHY
          ================================================== */}
      <section
        id="philosophy"
        className={`py-24 sm:py-32 px-4 sm:px-8 lg:px-16 border-b transition-colors duration-300 relative ${
          theme === "dark"
            ? "bg-[#221F1C] border-[#38332C]"
            : "bg-[#EDE7D6] border-[#cfc7b2]"
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl mx-auto text-center space-y-6 font-courier"
        >
          <span
            className={`text-xs tracking-[0.14em] uppercase font-bold block ${
              theme === "dark" ? "text-[#D4AA50]" : "text-[#2B4C8C]"
            }`}
          >
            EPISTEMIC RIGOR
          </span>

          <h2
            className={`font-newsreader text-4xl sm:text-6xl font-normal leading-[1.12] ${
              theme === "dark" ? "text-[#F0EAE1]" : "text-[#1d1d1b]"
            }`}
          >
            DecisionLens doesn&apos;t choose for you.
          </h2>

          <p
            className={`font-newsreader text-3xl sm:text-5xl italic font-normal ${
              theme === "dark" ? "text-[#D4AA50]" : "text-[#2B4C8C]"
            }`}
          >
            It makes the reasoning harder to ignore.
          </p>

          <p
            className={`text-base sm:text-lg max-w-xl mx-auto leading-relaxed pt-2 ${
              theme === "dark" ? "text-[#A89F91]" : "text-[#4f4b40]"
            }`}
          >
            It doesn&apos;t tell leadership what to do. It isolates what you are taking for granted,
            exposes where evidence is missing, and maps your true trade-offs before execution begins.
          </p>
        </motion.div>
      </section>

      {/* ==================================================
          FINAL CTA & FOOTER (Theme-Aware Light & Dark)
          ================================================== */}
      <section
        className={`py-16 sm:py-24 px-6 sm:px-12 lg:px-20 relative overflow-hidden transition-colors duration-300 ${
          theme === "dark"
            ? "bg-[#181614] text-[#F0EAE1]"
            : "bg-[#F5F1E8] text-[#172033]"
        }`}
      >
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <h2
            className={`font-newsreader text-3xl sm:text-5xl font-normal leading-[1.1] ${
              theme === "dark" ? "text-[#F0EAE1]" : "text-[#172033]"
            }`}
          >
            Before you commit,{" "}
            <span
              className={`italic block sm:inline ${
                theme === "dark" ? "text-[#D4AA50]" : "text-[#315C8A]"
              }`}
            >
              challenge the decision.
            </span>
          </h2>

          <p
            className={`font-courier text-xs sm:text-sm leading-[1.8] max-w-lg mx-auto ${
              theme === "dark" ? "text-[#A89F91]" : "text-[#596474]"
            }`}
          >
            Bring the decision you&apos;re already considering. Put the reasoning under scrutiny. Find what is missing. Examine the trade-offs. Then decide.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href={CTA_ROUTE}
              className={`w-full sm:w-auto px-7 py-3.5 border font-courier text-xs tracking-[0.08em] uppercase font-bold transition-colors text-center inline-block ${
                theme === "dark"
                  ? "border-[#D4AA50] bg-[#D4AA50] text-[#181614] hover:bg-[#E5BE64] hover:text-[#181614]"
                  : "border-[#172033] bg-[#172033] text-[#F5F1E8] hover:bg-transparent hover:text-[#172033]"
              }`}
            >
              Challenge a Decision →
            </Link>
            <a
              href="#the-flow"
              className={`w-full sm:w-auto px-7 py-3.5 border bg-transparent font-courier text-xs tracking-[0.08em] uppercase transition-colors ${
                theme === "dark"
                  ? "border-[#38332C] text-[#F0EAE1] hover:border-[#D4AA50]"
                  : "border-[#172033]/30 text-[#172033] hover:border-[#172033]"
              }`}
            >
              Explore the Method
            </a>
          </div>

          {/* Minimal Footer */}
          <div
            className={`pt-14 border-t flex flex-col sm:flex-row items-center justify-between text-[11px] font-courier gap-4 ${
              theme === "dark"
                ? "border-[#38332C] text-[#A89F91]"
                : "border-[#172033]/15 text-[#7B8491]"
            }`}
          >
            <div className="text-[10px] font-courier tracking-[0.12em] uppercase opacity-65">
              <span>EPISTEMIC REASONING & DECISION SCRUTINY ARCHIVE</span>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/softly"
                className={`transition-colors ${
                  theme === "dark"
                    ? "hover:text-[#F0EAE1]"
                    : "hover:text-[#172033]"
                }`}
              >
                Softly Room
              </Link>
              <Link
                href="/dashboard"
                className={`font-bold hover:underline ${
                  theme === "dark" ? "text-[#D4AA50]" : "text-[#315C8A]"
                }`}
              >
                DASHBOARD →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
