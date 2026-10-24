"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getMe,
  User,
} from "@/lib/api";

type LensType =
  | "ASSUMPTIONS"
  | "PROS / CONS"
  | "BIAS"
  | "GAPS"
  | "RISK"
  | "DECISION TREE";

export default function EditorialLandingPage() {
  const router = useRouter();

  // User auth state
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Single Travelling Decision Artifact State (0 to 8)
  const [artifactStage, setArtifactStage] = useState(0);

  // Interactive Demonstration state
  const [activeLens, setActiveLens] = useState<LensType>("ASSUMPTIONS");

  // SVG Drawing states
  const [hasDrawnTree, setHasDrawnTree] = useState(false);
  const treeRef = useRef<SVGSVGElement>(null);

  // Scroll offset for subtle wordmark spread
  const [scrollY, setScrollY] = useState(0);

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

  // Scroll listener for subtle parallax & wordmark spread
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Intersection observer for SVG path drawing
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target === treeRef.current) {
            setHasDrawnTree(true);
          }
        });
      },
      { threshold: 0.2 }
    );

    if (treeRef.current) observer.observe(treeRef.current);
    return () => observer.disconnect();
  }, [activeLens]);



  const handlePrimaryCta = () => {
    if (user) {
      router.push("/dashboard?action=new");
    } else {
      router.push("/auth?redirect=/dashboard?action=new");
    }
  };

  // 9 Progressive Interrogation Layers for the Single Travelling Decision Artifact
  const artifactLayers = [
    {
      num: "01",
      layer: "DECISION",
      title: "CLOUD MIGRATION",
      question: "Should we migrate our production infrastructure to the cloud?",
      options: "AWS / AZURE / STAY CURRENT",
      status: "UNDER REVIEW",
      note: "Initial decision captured with explicit constraints and declared alternatives.",
    },
    {
      num: "02",
      layer: "ASSUMPTIONS",
      title: "PREMISE EXPOSURE",
      question: "“Cloud migration will directly reduce infrastructure spend within 12 months.”",
      options: "STATUS: UNTESTED",
      status: "NEEDS EVIDENCE",
      note: "Egress volume, snapshot storage, and dual-run overhead are taken as zero-cost.",
    },
    {
      num: "03",
      layer: "EVIDENCE",
      title: "EMPIRICAL LEDGER",
      question: "Fact: On-premise infrastructure costs $X/yr. Claim: Cloud hosting saves 25%.",
      options: "BENCHMARK SKEW: VENDOR-SOURCED",
      status: "AUDIT REQUIRED",
      note: "Historical internal capacity data is missing; only promotional benchmarks provided.",
    },
    {
      num: "04",
      layer: "GAPS",
      title: "UNRESOLVED DEPENDENCIES",
      question: "3-year cumulative operating model and cutover rollback protocol unestablished.",
      options: "GAPS IDENTIFIED: 03 CRITICAL",
      status: "NEEDS EVIDENCE",
      note: "Committing before establishing a rollback protocol introduces systemic operational risk.",
    },
    {
      num: "05",
      layer: "BIAS",
      title: "HEURISTIC AUDIT",
      question: "Status Quo Bias (comfort with known) vs. Confirmation Bias (ignoring repatriation).",
      options: "DIAGNOSIS: NONE (SIGNAL ONLY)",
      status: "EXAMINE PATTERN",
      note: "Surfaces cognitive heuristics to examine without claiming psychological certainty.",
    },
    {
      num: "06",
      layer: "TRADE-OFFS",
      title: "SYMMETRICAL ACCOUNTING",
      question: "Gain elastic burst scalability; give up predictable monthly hardware capex.",
      options: "SYMMETRY: BALANCED",
      status: "EXPLICIT COSTS",
      note: "Ensures every gain is paired with its required compromise before capital is committed.",
    },
    {
      num: "07",
      layer: "RISKS",
      title: "CONTINGENCY MATRIX",
      question: "Risk: Cutover downtime during quarterly release. Likelihood: Med. Impact: High.",
      options: "ROLLBACK READINESS: INCOMPLETE",
      status: "HIGH EXPOSURE",
      note: "Transforms unexamined anxiety into concrete, categorical contingency criteria.",
    },
    {
      num: "08",
      layer: "ALTERNATIVES",
      title: "REFRAMING OPTIONS",
      question: "Option C: Migrate incrementally. Option D: Run a containerized pilot on-prem first.",
      options: "EXPANDED SPECTRUM: 4 PATHS",
      status: "FRAMEWORK EXPANDED",
      note: "Breaks the false binary between immediate massive cutover and complete inaction.",
    },
    {
      num: "09",
      layer: "CHALLENGE",
      title: "SCRUTINIZED DOSSIER",
      question: "The decision has been interrogated through nine distinct analytical dimensions.",
      options: "READY FOR HUMAN JUDGMENT",
      status: "TESTED",
      note: "The decision stays yours. The reasoning is now thoroughly tested and harder to ignore.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F1E8] text-[#172033] font-courier antialiased selection:bg-[#315C8A] selection:text-[#F5F1E8]">
      {/* ==================================================
          04 — NAVIGATION (Fixed 58px)
          ================================================== */}
      <nav className="fixed top-0 left-0 right-0 h-[58px] z-40 bg-[#F5F1E8]/92 backdrop-blur-md border-b border-[#172033]/15 px-6 lg:px-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link
            href="/"
            className="font-newsreader text-2xl tracking-tight text-[#172033] font-medium"
          >
            DecisionLens<span className="text-[#315C8A]">.</span>
          </Link>

          <div className="hidden md:flex items-center space-x-6 text-[11px] font-courier tracking-[0.09em] uppercase text-[#596474]">
            <a href="#the-flow" className="hover:text-[#315C8A] transition-colors">
              THE FLOW
            </a>
            <a href="#lenses-in-action" className="hover:text-[#315C8A] transition-colors">
              LENSES IN ACTION
            </a>
            <a href="#epistemic-rigor" className="hover:text-[#315C8A] transition-colors">
              EPISTEMIC RIGOR
            </a>
            <a href="#domains" className="hover:text-[#315C8A] transition-colors">
              DOMAINS
            </a>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {loadingUser ? (
            <span className="text-[11px] text-[#7B8491] tracking-[0.08em]">VERIFYING...</span>
          ) : user ? (
            <div className="flex items-center space-x-3">
              <span className="hidden sm:inline text-[11px] text-[#315C8A] tracking-[0.08em] font-semibold">
                {user.display_name || user.email.split("@")[0]}
              </span>
              <Link
                href="/dashboard?action=new"
                className="text-[11px] font-bold tracking-[0.08em] px-3.5 py-1.5 border border-[#172033] bg-[#172033] text-[#F5F1E8] hover:bg-transparent hover:text-[#172033] transition-colors"
              >
                CHALLENGE A DECISION
              </Link>
              <Link
                href="/dashboard"
                className="text-[11px] font-bold tracking-[0.08em] px-3 py-1.5 border border-[#172033]/30 text-[#172033] hover:border-[#172033] hover:bg-[#172033]/5 transition-colors"
              >
                DASHBOARD →
              </Link>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Link
                href="/auth"
                className="text-[11px] font-bold tracking-[0.08em] text-[#596474] hover:text-[#315C8A] px-2.5 py-1 transition-colors"
              >
                SIGN IN
              </Link>
              <Link
                href="/auth?redirect=/dashboard?action=new"
                className="text-[11px] font-bold tracking-[0.08em] px-3.5 py-1.5 border border-[#172033] bg-[#172033] text-[#F5F1E8] hover:bg-transparent hover:text-[#172033] transition-colors"
              >
                CHALLENGE A DECISION
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Authenticated User Status Bar */}
      {user && (
        <div className="pt-[58px] bg-[#E9E3D7] border-b border-[#172033]/15 px-6 py-2 text-[11px] text-[#596474] tracking-[0.08em] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#315C8A]" />
            <span>
              AUTHENTICATED DOSSIER WORKSPACE: <strong className="text-[#172033]">{user.email}</strong>. READY FOR REASONING SCRUTINY.
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-[#315C8A] font-bold hover:underline tracking-widest uppercase ml-4"
          >
            ENTER WORKSPACE →
          </Link>
        </div>
      )}

      {/* ==================================================
          05 — HERO
          ================================================== */}
      <section
        className={`relative ${
          user ? "pt-10" : "pt-20"
        } pb-16 sm:pb-24 px-6 sm:px-12 lg:px-20 bg-[#E9E3D7] border-b border-[#172033]/15 overflow-hidden`}
      >
        <div className="max-w-4xl mx-auto relative z-10">
          {/* Kicker */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[11px] font-courier tracking-[0.1em] text-[#315C8A] font-bold">
              DECISION INTELLIGENCE / 01
            </span>
            <span className="w-6 h-[1px] bg-[#315C8A]/40" />
            <span className="text-[11px] font-courier tracking-[0.08em] text-[#7B8491]">
              REASONING SCRUTINY ENGINE
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-newsreader text-4xl sm:text-6xl lg:text-7xl text-[#172033] font-normal tracking-[-0.02em] leading-[1.08] mb-6">
            Don&apos;t just make the decision.{" "}
            <span className="italic text-[#315C8A] font-normal block sm:inline">
              Challenge it.
            </span>
          </h1>

          {/* Supporting Copy */}
          <p className="font-courier text-xs sm:text-sm text-[#596474] leading-[1.9] max-w-2xl mb-8">
            DecisionLens puts your decisions under scrutiny. Explore trade-offs, test assumptions,
            uncover gaps, and see how your reasoning holds up from multiple perspectives — before you commit.
          </p>

          {/* Primary & Secondary CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-10">
            <Link
              href={user ? "/dashboard?action=new" : "/auth?redirect=/dashboard?action=new"}
              className="px-6 py-3.5 border border-[#172033] bg-[#172033] text-[#F5F1E8] font-courier text-xs tracking-[0.08em] uppercase font-bold hover:bg-transparent hover:text-[#172033] transition-colors text-center inline-block"
            >
              Challenge a Decision →
            </Link>
            <a
              href="#the-problem"
              className="px-6 py-3.5 border border-[#172033]/30 bg-transparent text-[#172033] font-courier text-xs tracking-[0.08em] uppercase hover:border-[#172033] transition-colors text-center"
            >
              See How It Works ↓
            </a>
          </div>

          {/* Process Index Strip */}
          <div className="pt-6 border-t border-[#172033]/15 grid grid-cols-2 sm:grid-cols-6 gap-2 text-[10px] font-courier tracking-[0.08em] text-[#596474]">
            <div className="flex items-center gap-1.5">
              <span className="text-[#315C8A] font-bold">01</span>
              <span className="text-[#172033] font-bold">DECISION</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#315C8A]">→</span>
              <span>ASSUMPTIONS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#315C8A]">→</span>
              <span>EVIDENCE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#315C8A]">→</span>
              <span>BIAS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#315C8A]">→</span>
              <span>TRADE-OFFS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#315C8A]">→</span>
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
          <p className="font-newsreader font-bold text-[22vw] leading-none tracking-tighter text-[#172033] text-center whitespace-nowrap">
            DECISION
          </p>
        </div>
      </section>

      {/* ==================================================
          06 — SECTION: THE PROBLEM (THE STRUCTURAL FLAW)
          ================================================== */}
      <section id="the-problem" className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              The Structural Flaw
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-[1.14] mb-4">
              A decision can look reasonable until you examine what it assumes.
            </h2>
            <p className="font-courier text-xs sm:text-sm text-[#596474] leading-[1.85] max-w-2xl">
              Most decisions arrive with reasons already attached. We tend to collect evidence that supports
              what we want, overlook what is missing, and underestimate the assumptions underneath the conclusion.
            </p>
          </div>

          <div className="divide-y divide-[#172033]/15 border-t border-b border-[#172033]/15 font-courier">
            <div className="py-4 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-start">
              <div className="sm:col-span-4">
                <span className="text-[10px] text-[#315C8A] font-bold tracking-widest block">01</span>
                <span className="text-xs font-bold text-[#172033] uppercase">ASSUMPTIONS</span>
              </div>
              <p className="sm:col-span-8 text-xs text-[#596474] leading-[1.8]">
                Every decision rests on things we believe to be true. Some are supported. Others simply go unquestioned.
              </p>
            </div>

            <div className="py-4 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-start">
              <div className="sm:col-span-4">
                <span className="text-[10px] text-[#315C8A] font-bold tracking-widest block">02</span>
                <span className="text-xs font-bold text-[#172033] uppercase">BLIND SPOTS</span>
              </div>
              <p className="sm:col-span-8 text-xs text-[#596474] leading-[1.8]">
                The information we never think to ask for can matter as much as the information we already have.
              </p>
            </div>

            <div className="py-4 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-start">
              <div className="sm:col-span-4">
                <span className="text-[10px] text-[#315C8A] font-bold tracking-widest block">03</span>
                <span className="text-xs font-bold text-[#172033] uppercase">TRADE-OFFS</span>
              </div>
              <p className="sm:col-span-8 text-xs text-[#596474] leading-[1.8]">
                Choosing one path always means giving something else up. Those costs are easy to underestimate when they remain implicit.
              </p>
            </div>

            <div className="py-4 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-start">
              <div className="sm:col-span-4">
                <span className="text-[10px] text-[#315C8A] font-bold tracking-widest block">04</span>
                <span className="text-xs font-bold text-[#172033] uppercase">BIAS</span>
              </div>
              <p className="sm:col-span-8 text-xs text-[#596474] leading-[1.8]">
                The way a question is framed can influence the answer before the analysis even begins.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          07 — SECTION: WHAT DECISIONLENS ACTUALLY DOES (THE FLOW)
          ================================================== */}
      <section id="the-flow" className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              The Flow
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-[1.14] mb-3">
              Turn a decision into something you can examine.
            </h2>
            <p className="font-courier text-xs sm:text-sm text-[#596474] leading-[1.85] max-w-xl">
              DecisionLens takes a messy decision and makes the reasoning around it inspectable.
            </p>
          </div>

          <div className="divide-y divide-[#172033]/15 border-t border-b border-[#172033]/15 font-courier">
            <div className="py-4 flex items-start gap-4">
              <span className="text-xs font-bold text-[#315C8A] shrink-0 w-24">01 — FRAME</span>
              <p className="text-xs text-[#596474] leading-[1.8]">
                Define the decision, options, objectives and constraints.
              </p>
            </div>

            <div className="py-4 flex items-start gap-4">
              <span className="text-xs font-bold text-[#315C8A] shrink-0 w-24">02 — EXAMINE</span>
              <p className="text-xs text-[#596474] leading-[1.8]">
                Separate facts, claims, assumptions and things that still need evidence.
              </p>
            </div>

            <div className="py-4 flex items-start gap-4">
              <span className="text-xs font-bold text-[#315C8A] shrink-0 w-24">03 — CHALLENGE</span>
              <p className="text-xs text-[#596474] leading-[1.8]">
                Apply different decision-making techniques to test the reasoning.
              </p>
            </div>

            <div className="py-4 flex items-start gap-4">
              <span className="text-xs font-bold text-[#315C8A] shrink-0 w-24">04 — EXPOSE</span>
              <p className="text-xs text-[#596474] leading-[1.8]">
                Surface gaps, potential bias, risks, contradictions and overlooked alternatives.
              </p>
            </div>

            <div className="py-4 flex items-start gap-4">
              <span className="text-xs font-bold text-[#315C8A] shrink-0 w-24">05 — REVIEW</span>
              <p className="text-xs text-[#596474] leading-[1.8]">
                See the trade-offs and unresolved questions before deciding what to do.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          08 & 09 — THE CENTRAL STORY & TRAVELLING DECISION ARTIFACT
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              Lenses in Action / 01
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-3">
              Let&apos;s put a decision under pressure.
            </h2>
            <p className="font-courier text-xs sm:text-sm text-[#596474] max-w-xl leading-relaxed">
              Below is one real decision. Follow its evolution as DecisionLens progressively interrogates
              what is taken for granted, what is missing, and what could fail.
            </p>
          </div>

          {/* Dossier Scrubber Index */}
          <div className="flex flex-wrap gap-1.5 mb-4 border-b border-[#172033]/15 pb-3">
            {artifactLayers.map((l, idx) => (
              <button
                key={l.num}
                type="button"
                onClick={() => setArtifactStage(idx)}
                className={`px-2.5 py-1 text-[10px] font-courier tracking-[0.08em] transition-colors border ${
                  artifactStage === idx
                    ? "border-[#315C8A] bg-[#315C8A] text-[#F5F1E8] font-bold"
                    : "border-[#172033]/15 bg-[#E9E3D7] text-[#596474] hover:border-[#172033]"
                }`}
              >
                {l.num} {l.layer}
              </button>
            ))}
          </div>

          {/* The Single Travelling Decision Dossier */}
          <div className="border border-[#172033] bg-[#E9E3D7] p-6 sm:p-8 transition-all duration-200">
            <div className="flex items-center justify-between border-b border-[#172033]/15 pb-3 mb-4 text-[10px] font-courier">
              <span className="text-[#315C8A] font-bold tracking-widest uppercase">
                DECISION / 014 • STAGE {artifactLayers[artifactStage].num}: {artifactLayers[artifactStage].layer}
              </span>
              <span className="text-[#172033] font-bold border border-[#172033]/20 px-2 py-0.5 bg-[#F5F1E8]">
                STATUS: {artifactLayers[artifactStage].status}
              </span>
            </div>

            <div className="space-y-3 mb-6">
              <span className="text-[10px] text-[#7B8491] uppercase tracking-wider block">
                {artifactLayers[artifactStage].title}
              </span>
              <h3 className="font-newsreader text-2xl sm:text-3xl text-[#172033] leading-snug">
                {artifactLayers[artifactStage].question}
              </h3>
              <div className="text-xs font-courier text-[#596474] pt-1">
                <strong>FRAMEWORK EVALUATION:</strong> {artifactLayers[artifactStage].options}
              </div>
            </div>

            <div className="pt-3 border-t border-[#172033]/15 flex items-start gap-3 text-xs font-courier">
              <span className="text-[#315C8A] font-bold text-[10px] tracking-wider shrink-0 mt-0.5">
                EXPOSURE:
              </span>
              <p className="text-[#172033] text-[11px] leading-relaxed">
                {artifactLayers[artifactStage].note}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          10 — SECTION: ASSUMPTIONS (01 / ASSUMPTIONS)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              01 / Assumptions
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              Start with what you&apos;re taking for granted.
            </h2>
            <p className="font-courier text-xs text-[#596474]">
              DecisionLens isolates premises to confirm whether they are substantiated by evidence.
            </p>
          </div>

          <div className="divide-y divide-[#172033]/15 border-t border-b border-[#172033]/15 font-courier text-xs">
            <div className="py-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#7B8491] uppercase">ASSUMPTION 01</span>
                <span className="text-[10px] text-[#B4874B] font-bold">STATUS: NEEDS EVIDENCE</span>
              </div>
              <p className="text-sm text-[#172033] font-bold">
                &ldquo;Migration will reduce long-term infrastructure cost.&rdquo;
              </p>
              <p className="text-xs text-[#596474]">
                <strong>QUESTION:</strong> &ldquo;What costs are actually included?&rdquo;
              </p>
            </div>

            <div className="py-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#7B8491] uppercase">ASSUMPTION 02</span>
                <span className="text-[10px] text-[#B4874B] font-bold">STATUS: NEEDS EVIDENCE</span>
              </div>
              <p className="text-sm text-[#172033] font-bold">
                &ldquo;The team can absorb the migration workload.&rdquo;
              </p>
              <p className="text-xs text-[#596474]">
                <strong>QUESTION:</strong> &ldquo;What existing capacity supports that assumption?&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          11 — SECTION: EVIDENCE (02 / EVIDENCE)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              02 / Evidence
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              An argument is only as strong as what supports it.
            </h2>
            <p className="font-courier text-xs text-[#596474]">
              An empirical ledger separating documented records from unverified claims.
            </p>
          </div>

          <div className="border border-[#172033] bg-[#E9E3D7] divide-y divide-[#172033]/15 font-courier text-xs">
            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-[#315C8A] font-bold block">[FACT]</span>
                <span className="text-[#172033]">Current infrastructure costs $X per year (audited run rate).</span>
              </div>
              <span className="text-[10px] text-[#596474]">VERIFIED RECORD</span>
            </div>

            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-[#315C8A] font-bold block">[CLAIM]</span>
                <span className="text-[#172033]">Cloud migration will reduce operating cost.</span>
              </div>
              <span className="text-[10px] text-[#596474]">ASSERTION TO TEST</span>
            </div>

            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-[#B4874B] font-bold block">[ASSUMPTION]</span>
                <span className="text-[#172033]">The migration can be completed without significant disruption.</span>
              </div>
              <span className="text-[10px] text-[#B4874B] font-bold">UNTESTED</span>
            </div>

            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-[#B4874B] font-bold block">[NEEDS PROOF]</span>
                <span className="text-[#172033]">Three-year total cost comparison under peak load.</span>
              </div>
              <span className="text-[10px] text-[#B4874B] font-bold">MISSING EVIDENCE</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          12 — SECTION: GAPS (03 / GAPS)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              03 / Gaps
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              What you don&apos;t know can change the decision.
            </h2>
          </div>

          <div className="divide-y divide-[#172033]/15 border-t border-b border-[#172033]/15 font-courier text-xs">
            <div className="py-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#7B8491] block">EVIDENCE GAP</span>
                <span className="text-[#172033] font-bold">Migration cost over three years</span>
              </div>
              <span className="text-[10px] text-[#B4874B] font-bold border border-[#B4874B]/40 px-2 py-0.5 bg-[#F5F1E8]">
                NEEDS EVIDENCE
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#7B8491] block">EVIDENCE GAP</span>
                <span className="text-[#172033] font-bold">Expected operational impact</span>
              </div>
              <span className="text-[10px] text-[#B4874B] font-bold border border-[#B4874B]/40 px-2 py-0.5 bg-[#F5F1E8]">
                NEEDS EVIDENCE
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#7B8491] block">UNRESOLVED</span>
                <span className="text-[#172033] font-bold">Rollback strategy</span>
              </div>
              <span className="text-[10px] text-[#B4874B] font-bold border border-[#B4874B]/40 px-2 py-0.5 bg-[#F5F1E8]">
                NOT ESTABLISHED
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#7B8491] block">MISSING CONTEXT</span>
                <span className="text-[#172033] font-bold">Team migration capacity</span>
              </div>
              <span className="text-[10px] text-[#B4874B] font-bold border border-[#B4874B]/40 px-2 py-0.5 bg-[#F5F1E8]">
                NEEDS EVIDENCE
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          13 — SECTION: BIAS (04 / BIAS)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              04 / Bias
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              Sometimes the reasoning is the problem.
            </h2>
            <p className="font-courier text-xs text-[#596474] max-w-xl">
              DecisionLens does not diagnose bias. It surfaces patterns worth examining.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-courier text-xs">
            <div className="border border-[#172033] bg-[#E9E3D7] p-5 space-y-2">
              <span className="text-[10px] text-[#315C8A] font-bold tracking-widest block uppercase">
                POTENTIAL BIAS
              </span>
              <h3 className="font-newsreader text-xl text-[#172033]">STATUS QUO BIAS</h3>
              <p className="text-xs text-[#596474] leading-[1.8]">
                &ldquo;The current system may feel safer simply because the team already knows it.&rdquo;
              </p>
            </div>

            <div className="border border-[#172033] bg-[#E9E3D7] p-5 space-y-2">
              <span className="text-[10px] text-[#315C8A] font-bold tracking-widest block uppercase">
                POTENTIAL BIAS
              </span>
              <h3 className="font-newsreader text-xl text-[#172033]">CONFIRMATION BIAS</h3>
              <p className="text-xs text-[#596474] leading-[1.8]">
                &ldquo;Evidence supporting migration may receive more attention than evidence against it.&rdquo;
              </p>
            </div>
          </div>

          <div className="mt-4 p-4 border border-[#172033]/15 bg-[#F5F1E8] font-courier text-xs">
            <strong className="text-[#315C8A] block mb-1">SCRUTINY QUESTION:</strong>
            <p className="text-[#172033]">
              &ldquo;What evidence would change our current preference?&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ==================================================
          14 — SECTION: TRADE-OFFS (05 / TRADE-OFFS)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              05 / Trade-Offs
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              Every choice closes another door.
            </h2>
            <p className="font-courier text-xs text-[#596474]">
              A balanced editorial comparison. Pros and cons remain visually neutral.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-courier text-xs">
            {/* MIGRATE */}
            <div className="border border-[#172033] bg-[#F5F1E8] p-5 space-y-3">
              <span className="text-xs font-bold text-[#172033] tracking-wider block border-b border-[#172033]/15 pb-1">
                PATH A: MIGRATE
              </span>
              <div>
                <span className="text-[10px] text-[#7B8491] uppercase block mb-1">Potential advantages:</span>
                <p className="text-[11px] text-[#596474] leading-relaxed">
                  • Scalability<br />
                  • Operational flexibility<br />
                  • New infrastructure capabilities
                </p>
              </div>
              <div className="pt-2 border-t border-[#172033]/10">
                <span className="text-[10px] text-[#7B8491] uppercase block mb-1">Potential costs:</span>
                <p className="text-[11px] text-[#596474] leading-relaxed">
                  • Migration complexity<br />
                  • Transition effort<br />
                  • Operational disruption
                </p>
              </div>
            </div>

            {/* STAY */}
            <div className="border border-[#172033] bg-[#F5F1E8] p-5 space-y-3">
              <span className="text-xs font-bold text-[#172033] tracking-wider block border-b border-[#172033]/15 pb-1">
                PATH B: STAY
              </span>
              <div>
                <span className="text-[10px] text-[#7B8491] uppercase block mb-1">Potential advantages:</span>
                <p className="text-[11px] text-[#596474] leading-relaxed">
                  • Known environment<br />
                  • Lower immediate disruption
                </p>
              </div>
              <div className="pt-2 border-t border-[#172033]/10">
                <span className="text-[10px] text-[#7B8491] uppercase block mb-1">Potential costs:</span>
                <p className="text-[11px] text-[#596474] leading-relaxed">
                  • Existing limitations remain<br />
                  • Future migration may become harder
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          15 — SECTION: RISK (06 / RISK)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              06 / Risk
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              Ask what could make the decision fail.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-courier text-xs">
            <div className="border border-[#172033] bg-[#E9E3D7] p-5 space-y-2">
              <span className="text-[10px] text-[#7B8491] uppercase">RISK</span>
              <h3 className="font-newsreader text-xl text-[#172033]">Migration downtime</h3>
              <div className="flex gap-4 text-[10px] text-[#596474]">
                <span>LIKELIHOOD: <strong>Medium</strong></span>
                <span>•</span>
                <span>IMPACT: <strong>High</strong></span>
              </div>
              <p className="pt-2 border-t border-[#172033]/10 text-[11px] text-[#172033]">
                <strong>QUESTION:</strong> &ldquo;What rollback capability exists?&rdquo;
              </p>
            </div>

            <div className="border border-[#172033] bg-[#E9E3D7] p-5 space-y-2">
              <span className="text-[10px] text-[#7B8491] uppercase">RISK</span>
              <h3 className="font-newsreader text-xl text-[#172033]">Unexpected migration cost</h3>
              <div className="flex gap-4 text-[10px] text-[#596474]">
                <span>LIKELIHOOD: <strong>Unknown</strong></span>
                <span>•</span>
                <span>IMPACT: <strong>High</strong></span>
              </div>
              <p className="pt-2 border-t border-[#172033]/10 text-[11px] text-[#172033]">
                <strong>QUESTION:</strong> &ldquo;What evidence would reduce this uncertainty?&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          16 — SECTION: ALTERNATIVES (07 / ALTERNATIVES)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              07 / Alternatives
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              Are these really the only options?
            </h2>
            <p className="font-courier text-xs text-[#596474]">
              DecisionLens challenges the framing of the decision itself to discover overlooked paths.
            </p>
          </div>

          <div className="divide-y divide-[#172033]/15 border-t border-b border-[#172033]/15 font-courier text-xs">
            <div className="py-3 flex items-center justify-between">
              <span className="text-[10px] text-[#315C8A] font-bold">OPTION A</span>
              <span className="text-[#172033] font-bold">Migrate now</span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-[10px] text-[#315C8A] font-bold">OPTION B</span>
              <span className="text-[#172033] font-bold">Stay with current infrastructure</span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-[10px] text-[#315C8A] font-bold">OPTION C</span>
              <span className="text-[#172033] font-bold">Migrate incrementally</span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-[10px] text-[#315C8A] font-bold">OPTION D</span>
              <span className="text-[#172033] font-bold">Run a limited pilot first</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          17 — FIVE DECISION LENSES
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              Lenses in Action
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              One decision. Different ways to think about it.
            </h2>
            <p className="font-courier text-xs text-[#596474]">
              No single framework sees everything. DecisionLens applies five disciplined techniques.
            </p>
          </div>

          <div className="divide-y divide-[#172033]/15 border-t border-b border-[#172033]/15 font-courier">
            <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
              <span className="sm:col-span-4 text-xs font-bold text-[#172033]">SIX THINKING HATS</span>
              <p className="sm:col-span-8 text-xs text-[#596474]">Look at the decision through different modes of thinking.</p>
            </div>
            <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
              <span className="sm:col-span-4 text-xs font-bold text-[#172033]">DECISION MATRIX</span>
              <p className="sm:col-span-8 text-xs text-[#596474]">Compare options against the factors that actually matter.</p>
            </div>
            <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
              <span className="sm:col-span-4 text-xs font-bold text-[#172033]">5 WHYS</span>
              <p className="sm:col-span-8 text-xs text-[#596474]">Follow the reasoning deeper to uncover assumptions and underlying causes.</p>
            </div>
            <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
              <span className="sm:col-span-4 text-xs font-bold text-[#172033]">RISK ANALYSIS</span>
              <p className="sm:col-span-8 text-xs text-[#596474]">Explore what could go wrong and what would reduce the exposure.</p>
            </div>
            <div className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
              <span className="sm:col-span-4 text-xs font-bold text-[#172033]">DECISION TREE</span>
              <p className="sm:col-span-8 text-xs text-[#596474]">Map choices, consequences and alternative paths.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          18 & 19 — INTERACTIVE LENS DEMONSTRATION & DECISION TREE
          ================================================== */}
      <section id="lenses-in-action" className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-1 font-bold uppercase">
              Interactive Scrutiny
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight">
              Change the lens. Watch the reasoning change.
            </h2>
            <p className="font-courier text-xs text-[#596474] mt-1.5">
              Select a lens below to view the exact same decision through a different analytical frame:
            </p>
          </div>

          {/* Underline Controls */}
          <div className="flex flex-wrap gap-2 mb-4 border-b border-[#172033]/15 pb-2">
            {(
              [
                "ASSUMPTIONS",
                "PROS / CONS",
                "BIAS",
                "GAPS",
                "RISK",
                "DECISION TREE",
              ] as LensType[]
            ).map((lens) => (
              <button
                key={lens}
                type="button"
                aria-pressed={activeLens === lens}
                onClick={() => setActiveLens(lens)}
                className={`px-3 py-1 text-xs font-courier tracking-[0.08em] transition-colors ${
                  activeLens === lens
                    ? "text-[#315C8A] font-bold border-b-2 border-[#315C8A] underline underline-offset-4"
                    : "text-[#596474] hover:text-[#172033]"
                }`}
              >
                [{lens}]
              </button>
            ))}
          </div>

          {/* Interactive Output Sheet */}
          <div className="border border-[#172033] bg-[#F5F1E8] p-6 sm:p-8 min-h-[260px]">
            {activeLens === "ASSUMPTIONS" && (
              <div className="space-y-3 font-courier text-xs">
                <span className="text-[10px] text-[#7B8491] uppercase block">ACTIVE LENS: ASSUMPTIONS</span>
                <p className="font-newsreader text-lg text-[#172033] italic">
                  &ldquo;Migration will reduce long-term infrastructure cost.&rdquo;
                </p>
                <div className="pt-2 border-t border-[#172033]/15 flex items-center justify-between text-[11px]">
                  <span className="text-[#B4874B] font-bold">STATUS: NEEDS EVIDENCE</span>
                  <span className="text-[#596474]">QUESTION: &ldquo;What costs are actually included?&rdquo;</span>
                </div>
              </div>
            )}

            {activeLens === "PROS / CONS" && (
              <div className="space-y-3 font-courier text-xs">
                <span className="text-[10px] text-[#7B8491] uppercase block">ACTIVE LENS: BALANCED COMPARISON (NEUTRAL)</span>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border border-[#172033]/15 bg-[#E9E3D7]">
                    <strong className="block text-[#172033] mb-1">PROS:</strong>
                    <span className="text-[11px] text-[#596474]">Scalability, Operational flexibility, Potential control.</span>
                  </div>
                  <div className="p-3 border border-[#172033]/15 bg-[#E9E3D7]">
                    <strong className="block text-[#172033] mb-1">CONS:</strong>
                    <span className="text-[11px] text-[#596474]">Migration complexity, Transition cost, Disruption.</span>
                  </div>
                </div>
              </div>
            )}

            {activeLens === "BIAS" && (
              <div className="space-y-3 font-courier text-xs">
                <span className="text-[10px] text-[#7B8491] uppercase block">ACTIVE LENS: POTENTIAL BIAS</span>
                <p className="text-[#172033] italic">
                  &ldquo;The current system may feel safer simply because the team already knows it.&rdquo; (Status Quo Bias)
                </p>
                <p className="text-[11px] text-[#596474]">
                  DecisionLens surfaces heuristics to examine rather than personal diagnoses.
                </p>
              </div>
            )}

            {activeLens === "GAPS" && (
              <div className="space-y-2 font-courier text-xs">
                <span className="text-[10px] text-[#7B8491] uppercase block">ACTIVE LENS: EVIDENCE GAPS</span>
                <div className="p-2 border border-[#172033]/15 flex justify-between">
                  <span>Migration cost over 3 years</span>
                  <span className="text-[#B4874B] font-bold">NEEDS EVIDENCE</span>
                </div>
                <div className="p-2 border border-[#172033]/15 flex justify-between">
                  <span>Documented rollback strategy</span>
                  <span className="text-[#B4874B] font-bold">NOT ESTABLISHED</span>
                </div>
              </div>
            )}

            {activeLens === "RISK" && (
              <div className="space-y-2 font-courier text-xs">
                <span className="text-[10px] text-[#7B8491] uppercase block">ACTIVE LENS: RISK ANALYSIS</span>
                <h4 className="font-newsreader text-base text-[#172033]">Migration Downtime</h4>
                <div className="flex gap-4 text-[11px] text-[#596474]">
                  <span>LIKELIHOOD: Medium</span>
                  <span>•</span>
                  <span>IMPACT: High</span>
                </div>
                <p className="text-[11px] text-[#172033]">
                  <strong>QUESTION:</strong> &ldquo;What rollback capability exists?&rdquo;
                </p>
              </div>
            )}

            {/* 19 — DECISION TREE VISUAL */}
            {activeLens === "DECISION TREE" && (
              <div className="space-y-2 font-courier text-xs">
                <span className="text-[10px] text-[#7B8491] uppercase block">ACTIVE LENS: EDITORIAL SVG DECISION TREE</span>
                <div className="overflow-x-auto py-2">
                  <svg
                    ref={treeRef}
                    viewBox="0 0 540 180"
                    className="w-full max-w-[540px] h-auto font-courier text-[10px]"
                  >
                    <path
                      d="M 50 90 L 140 90"
                      stroke="#172033"
                      strokeWidth="1.5"
                      fill="none"
                      style={{
                        strokeDasharray: 90,
                        strokeDashoffset: hasDrawnTree ? 0 : 90,
                        transition: "stroke-dashoffset 1.5s ease-in-out",
                      }}
                    />
                    <path
                      d="M 140 90 L 140 45 L 230 45"
                      stroke="#172033"
                      strokeWidth="1.5"
                      fill="none"
                      style={{
                        strokeDasharray: 140,
                        strokeDashoffset: hasDrawnTree ? 0 : 140,
                        transition: "stroke-dashoffset 1.5s ease-in-out 0.2s",
                      }}
                    />
                    <path
                      d="M 140 90 L 140 135 L 230 135"
                      stroke="#172033"
                      strokeWidth="1.5"
                      fill="none"
                      style={{
                        strokeDasharray: 140,
                        strokeDashoffset: hasDrawnTree ? 0 : 140,
                        transition: "stroke-dashoffset 1.5s ease-in-out 0.2s",
                      }}
                    />

                    {/* Migrate Branches */}
                    <path
                      d="M 310 45 L 370 25"
                      stroke="#315C8A"
                      strokeWidth="1.5"
                      fill="none"
                      style={{
                        strokeDasharray: 80,
                        strokeDashoffset: hasDrawnTree ? 0 : 80,
                        transition: "stroke-dashoffset 1.5s ease-in-out 0.4s",
                      }}
                    />
                    <path
                      d="M 310 45 L 370 65"
                      stroke="#172033"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      fill="none"
                    />

                    {/* Stay Branches */}
                    <path
                      d="M 310 135 L 370 115"
                      stroke="#172033"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      d="M 310 135 L 370 155"
                      stroke="#172033"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      fill="none"
                    />

                    <text x="10" y="94" fill="#172033" fontWeight="bold">START</text>
                    <text x="235" y="49" fill="#315C8A" fontWeight="bold">MIGRATE</text>
                    <text x="375" y="29" fill="#172033">• SUCCESS</text>
                    <text x="375" y="69" fill="#7B8491">• DISRUPTION</text>
                    <text x="235" y="139" fill="#172033" fontWeight="bold">STAY</text>
                    <text x="375" y="119" fill="#172033">• STABLE</text>
                    <text x="375" y="159" fill="#7B8491">• LIMITATIONS CONTINUE</text>
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================================================
          20 — EPISTEMIC RIGOR
          ================================================== */}
      <section id="epistemic-rigor" className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              Epistemic Rigor
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight mb-2">
              Not every statement deserves equal weight.
            </h2>
            <p className="font-courier text-xs text-[#596474] max-w-xl">
              Good decisions depend on knowing the difference between what you know, what you believe,
              and what you still need to establish.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 font-courier text-xs">
            <div className="border border-[#172033] bg-[#E9E3D7] p-3.5 space-y-1">
              <span className="text-[10px] text-[#315C8A] font-bold block">[FACT]</span>
              <p className="text-[11px] text-[#596474]">Supported by evidence.</p>
            </div>

            <div className="border border-[#172033] bg-[#E9E3D7] p-3.5 space-y-1">
              <span className="text-[10px] text-[#315C8A] font-bold block">[CLAIM]</span>
              <p className="text-[11px] text-[#596474]">A statement that should be examined.</p>
            </div>

            <div className="border border-[#172033] bg-[#E9E3D7] p-3.5 space-y-1">
              <span className="text-[10px] text-[#B4874B] font-bold block">[ASSUMPTION]</span>
              <p className="text-[11px] text-[#596474]">Something being taken as true.</p>
            </div>

            <div className="border border-[#172033] bg-[#E9E3D7] p-3.5 space-y-1">
              <span className="text-[10px] text-[#B4874B] font-bold block">[NEEDS PROOF]</span>
              <p className="text-[11px] text-[#596474]">Important information that is missing.</p>
            </div>

            <div className="border border-[#172033] bg-[#E9E3D7] p-3.5 space-y-1">
              <span className="text-[10px] text-[#172033] font-bold block">[CONTRADICTION]</span>
              <p className="text-[11px] text-[#596474]">Two pieces of reasoning that do not comfortably coexist.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          21 — THE PHILOSOPHY (Quiet Visual Peak)
          ================================================== */}
      <section className="py-20 sm:py-28 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7] text-center">
        <div className="max-w-3xl mx-auto space-y-4">
          <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] font-bold uppercase block">
            Core Philosophy
          </span>
          <h2 className="font-newsreader text-4xl sm:text-6xl text-[#172033] font-normal leading-[1.12]">
            DecisionLens doesn&apos;t choose for you.
          </h2>
          <p className="font-newsreader text-3xl sm:text-5xl text-[#172033] font-normal">
            It makes the reasoning{" "}
            <span className="italic text-[#315C8A] underline decoration-[#315C8A]/40 underline-offset-8">
              harder to ignore.
            </span>
          </p>
          <p className="font-courier text-xs sm:text-sm text-[#596474] pt-4 max-w-xl mx-auto leading-relaxed">
            The final decision remains yours. DecisionLens helps you understand what supports it,
            what challenges it, and what you may still need to know.
          </p>
        </div>
      </section>

      {/* ==================================================
          22 — WHEN TO USE DECISIONLENS (DOMAINS)
          ================================================== */}
      <section id="domains" className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#F5F1E8]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] block mb-2 font-bold uppercase">
              Domains
            </span>
            <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight">
              Useful when the decision actually matters.
            </h2>
          </div>

          <div className="divide-y divide-[#172033]/15 border-t border-b border-[#172033]/15 font-courier">
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[CAREER]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Should I accept this offer?</span>
            </div>
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[BUSINESS]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Should we launch this product?</span>
            </div>
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[TECHNOLOGY]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Should we migrate our infrastructure?</span>
            </div>
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[HIRING]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Which candidate best fits the role?</span>
            </div>
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[PURCHASING]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Which vendor should we choose?</span>
            </div>
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[PRODUCT]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Should we build this feature?</span>
            </div>
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[INVESTMENT]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Which option best fits our objectives?</span>
            </div>
            <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-[#315C8A] tracking-wider sm:w-36">[PERSONAL]</span>
              <span className="text-xs sm:text-sm text-[#172033] flex-1">Which path makes the most sense long term?</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          23 — THE OUTCOME (AFTER SCRUTINY)
          ================================================== */}
      <section className="py-14 sm:py-20 px-6 sm:px-12 lg:px-20 border-b border-[#172033]/15 bg-[#E9E3D7]">
        <div className="max-w-3xl mx-auto space-y-3">
          <span className="text-[10px] font-courier tracking-[0.1em] text-[#315C8A] font-bold uppercase block">
            After Scrutiny
          </span>
          <h2 className="font-newsreader text-3xl sm:text-4xl text-[#172033] font-normal leading-tight">
            The goal isn&apos;t certainty.
          </h2>
          <p className="font-newsreader text-2xl sm:text-3xl text-[#315C8A] italic">
            It&apos;s clarity about what you know — and what you don&apos;t.
          </p>
          <p className="font-courier text-xs sm:text-sm text-[#596474] pt-2 leading-[1.85]">
            A challenged decision may still be difficult. It may even lead you to choose the same option.
            The difference is that you now understand the assumptions, evidence, trade-offs and unresolved questions behind it.
          </p>
        </div>
      </section>

      {/* ==================================================
          24 & 25 — FINAL CTA & FOOTER
          ================================================== */}
      <section className="py-16 sm:py-24 px-6 sm:px-12 lg:px-20 bg-[#F5F1E8] relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <h2 className="font-newsreader text-3xl sm:text-5xl text-[#172033] font-normal leading-[1.1]">
            Before you commit,{" "}
            <span className="italic text-[#315C8A] block sm:inline">
              challenge the decision.
            </span>
          </h2>

          <p className="font-courier text-xs sm:text-sm text-[#596474] leading-[1.8] max-w-lg mx-auto">
            Bring the decision you&apos;re already considering. Put the reasoning under scrutiny. Find what is missing. Examine the trade-offs. Then decide.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href={user ? "/dashboard?action=new" : "/auth?redirect=/dashboard?action=new"}
              className="w-full sm:w-auto px-7 py-3.5 border border-[#172033] bg-[#172033] text-[#F5F1E8] font-courier text-xs tracking-[0.08em] uppercase font-bold hover:bg-transparent hover:text-[#172033] transition-colors text-center inline-block"
            >
              Challenge a Decision →
            </Link>
            <a
              href="#the-flow"
              className="w-full sm:w-auto px-7 py-3.5 border border-[#172033]/30 bg-transparent text-[#172033] font-courier text-xs tracking-[0.08em] uppercase hover:border-[#172033] transition-colors"
            >
              Explore the Method
            </a>
          </div>

          {/* Minimal 25 Footer */}
          <div className="pt-14 border-t border-[#172033]/15 flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#7B8491] font-courier gap-4">
            <div className="flex items-center space-x-6">
              <span className="font-newsreader text-lg text-[#172033] font-medium">
                DecisionLens<span className="text-[#315C8A]">.</span>
              </span>
              <a href="#the-flow" className="hover:text-[#172033]">THE FLOW</a>
              <a href="#lenses-in-action" className="hover:text-[#172033]">LENSES IN ACTION</a>
              <a href="#epistemic-rigor" className="hover:text-[#172033]">EPISTEMIC RIGOR</a>
              <a href="#domains" className="hover:text-[#172033]">DOMAINS</a>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/softly" className="hover:text-[#172033] transition-colors">
                [SOFTLY ROOM]
              </Link>
              <Link href="/dashboard" className="text-[#315C8A] font-bold hover:underline">
                DASHBOARD →
              </Link>
            </div>
          </div>
        </div>

        {/* Oversized DECISIONLENS Wordmark Cropped by Bottom Edge */}
        <div className="w-full pointer-events-none select-none overflow-hidden opacity-[0.06] mt-8">
          <p className="font-newsreader font-bold text-[18vw] leading-[0.7] tracking-tighter text-[#172033] text-center whitespace-nowrap translate-y-4">
            DECISIONLENS
          </p>
        </div>
      </section>


    </div>
  );
}
