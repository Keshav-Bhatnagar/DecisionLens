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
      className={`rounded-xl bg-[#181614] p-1 flex items-center justify-center shrink-0 border border-[#D4AA50]/60 shadow-sm relative group overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Subtle top edge illumination glint */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4AA50]/40 to-transparent pointer-events-none" />

      <svg
        viewBox="0 0 96 96"
        className="w-full h-full overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="dlIconGold" x1="16" y1="16" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#D4AA50" />
            <stop offset="100%" stopColor="#9A7026" />
          </linearGradient>
        </defs>

        {/* 3 Converging Input Rays (Meeting, Docs, Notes) */}
        <path
          d="M14 29 L33 41"
          stroke="#D4AA50"
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-85 transition-opacity duration-300 group-hover:opacity-100"
        />
        <path
          d="M12 48 L31 48"
          stroke="#F4F0E6"
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-90 transition-opacity duration-300 group-hover:opacity-100"
        />
        <path
          d="M14 67 L33 55"
          stroke="#D4AA50"
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-85 transition-opacity duration-300 group-hover:opacity-100"
        />

        {/* Precision Optical Lens Ring (rotates subtly on hover) */}
        <g className="origin-[48px_48px] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:rotate-45 group-hover:scale-[1.03]">
          <circle cx="48" cy="48" r="23" stroke="url(#dlIconGold)" strokeWidth="3.2" />
          <path
            d="M48 20 V27 M48 69 V76 M76 48 H69"
            stroke="#F4F0E6"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>

        {/* Central Focal Diamond (Refracted Clarity) */}
        <g className="origin-[48px_48px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.14]">
          <polygon points="48,35 61,48 48,61 35,48" fill="url(#dlIconGold)" />
          <circle cx="48" cy="48" r="3.8" fill="#FFF8E7" />
        </g>

        {/* Single Output Decision Beam */}
        <path
          d="M65 48 L84 48"
          stroke="#D4AA50"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="transition-all duration-300 group-hover:translate-x-0.5"
        />
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
        <span className="text-2xl font-serif font-bold tracking-tight text-ink block leading-none whitespace-nowrap">
          DecisionLens
        </span>
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

