"use client";

import React from "react";
import Link from "next/link";

interface DecisionLensLogoProps {
  className?: string;
  size?: number; // size in px of the icon badge (e.g. 40, 44, 48)
  showWordmark?: boolean;
  href?: string;
}

export function DecisionLensIcon({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`rounded-xl bg-[#141824] p-1.5 flex items-center justify-center shrink-0 border border-stone-800 shadow-sm relative group overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Subtle top edge illumination glint */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      <svg
        viewBox="0 0 44 44"
        className="w-full h-full drop-shadow-xs transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Burnished Gold to Amber Metallic Gradient */}
          <linearGradient id="dlIconGold" x1="6" y1="6" x2="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="45%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>

          {/* Frosted Lens Interior Glow */}
          <linearGradient id="dlLensGlow" x1="22" y1="8" x2="22" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#D97706" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#92400E" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Outer Optical Calibration Reticle */}
        <circle cx="22" cy="22" r="17" stroke="#374151" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.8" />

        {/* Cardinal Optical Ticks (Precision Axis) */}
        <line x1="22" y1="3" x2="22" y2="6.5" stroke="#D97706" strokeWidth="1.25" strokeLinecap="round" />
        <line x1="22" y1="37.5" x2="22" y2="41" stroke="#D97706" strokeWidth="1.25" strokeLinecap="round" />
        <line x1="3" y1="22" x2="6.5" y2="22" stroke="#D97706" strokeWidth="1.25" strokeLinecap="round" />
        <line x1="37.5" y1="22" x2="41" y2="22" stroke="#D97706" strokeWidth="1.25" strokeLinecap="round" />

        {/* Transverse Focal Alignment Line */}
        <line x1="9" y1="22" x2="35" y2="22" stroke="#9CA3AF" strokeWidth="0.75" strokeDasharray="1.5 2.5" opacity="0.5" />

        {/* Biconvex Optical Lens Element */}
        <path
          d="M 22 9 C 31.5 16, 31.5 28, 22 35 C 12.5 28, 12.5 16, 22 9 Z"
          fill="url(#dlLensGlow)"
          stroke="url(#dlIconGold)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Epistemic Core Aperture Ring */}
        <circle cx="22" cy="22" r="4.2" stroke="url(#dlIconGold)" strokeWidth="1.2" fill="#141824" />

        {/* Radiant Focal Jewel */}
        <circle cx="22" cy="22" r="2.1" fill="#F59E0B" />

        {/* Specular Glint Reflection */}
        <circle cx="21.1" cy="21.1" r="0.75" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export default function DecisionLensLogo({
  className = "",
  size = 42,
  showWordmark = true,
  href = "/",
}: DecisionLensLogoProps) {
  const content = (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <DecisionLensIcon size={size} />
      {showWordmark && (
        <div>
          <span className="text-2xl font-serif font-bold tracking-tight text-ink block leading-none">
            DecisionLens
          </span>
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-accent block mt-1">
            Executive Cognitive Intelligence
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="hover:opacity-90 transition group w-fit">
        {content}
      </Link>
    );
  }

  return content;
}

