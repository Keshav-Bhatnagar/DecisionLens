"use client";

import React from "react";

interface CelestialThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
  className?: string;
}

export default function CelestialThemeToggle({
  theme,
  onToggle,
  className = "",
}: CelestialThemeToggleProps) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group relative w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#7a4e10] dark:focus-visible:ring-[#D4AA50] ${
        isDark
          ? "bg-[#221F1C] border border-[#38332C] hover:border-[#D4AA50]/60 shadow-[0_2px_10px_rgba(212,170,80,0.15)] hover:shadow-[0_2px_14px_rgba(212,170,80,0.3)]"
          : "bg-[#EDE7D6] border border-[#cfc7b2] hover:border-[#7a4e10]/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_12px_rgba(122,78,16,0.18)]"
      } ${className}`}
      title={isDark ? "Switch to Light Mode (Sun)" : "Switch to Dark Mode (Moon)"}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <div className="relative w-6 h-6 flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 active:scale-95">
        {isDark ? (
          /* ========================================================================= */
          /* 3D REALISTIC LUMINOUS GOLDEN SUN (When in Dark Mode -> click for Light)    */
          /* ========================================================================= */
          <svg
            viewBox="0 0 32 32"
            className="w-full h-full overflow-visible transition-transform duration-700 group-hover:rotate-45"
          >
            <defs>
              {/* Outer Solar Atmosphere / Corona Glow */}
              <radialGradient id="sunCoronaGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#F59E0B" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#D97706" stopOpacity="0" />
              </radialGradient>

              {/* 3D Spherical Radial Gradient (Luminance highlight at 32% top-left) */}
              <radialGradient id="sunSphere3D" cx="34%" cy="32%" r="68%">
                <stop offset="0%" stopColor="#FFFDF0" />
                <stop offset="18%" stopColor="#FEF08A" />
                <stop offset="48%" stopColor="#F59E0B" />
                <stop offset="82%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#92400E" />
              </radialGradient>

              {/* Specular Glint Highlight */}
              <radialGradient id="sunSpecularGlint" cx="30%" cy="28%" r="35%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#FFFDF0" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#FEF08A" stopOpacity="0" />
              </radialGradient>

              {/* Ray Gradient */}
              <linearGradient id="sunRayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FDE047" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>

              {/* Soft Drop Shadow for Depth */}
              <filter id="sunDepthShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#78350F" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Atmosphere Halo Ring */}
            <circle cx="16" cy="16" r="14" fill="url(#sunCoronaGlow)" />

            {/* Tactile 3D Solar Rays (8 Rays) */}
            <g stroke="url(#sunRayGrad)" strokeWidth="1.75" strokeLinecap="round">
              <line x1="16" y1="2" x2="16" y2="4.5" />
              <line x1="16" y1="27.5" x2="16" y2="30" />
              <line x1="2" y1="16" x2="4.5" y2="16" />
              <line x1="27.5" y1="16" x2="30" y2="16" />
              <line x1="6.1" y1="6.1" x2="7.8" y2="7.8" />
              <line x1="24.2" y1="24.2" x2="25.9" y2="25.9" />
              <line x1="6.1" y1="25.9" x2="7.8" y2="24.2" />
              <line x1="24.2" y1="7.8" x2="25.9" y2="6.1" />
            </g>

            {/* 3D Solar Sphere Body */}
            <circle
              cx="16"
              cy="16"
              r="8"
              fill="url(#sunSphere3D)"
              filter="url(#sunDepthShadow)"
            />

            {/* Spherical Specular Sheen (Curved highlight on top-left) */}
            <ellipse
              cx="13.8"
              cy="13.2"
              rx="4"
              ry="2.6"
              transform="rotate(-25 13.8 13.2)"
              fill="url(#sunSpecularGlint)"
            />
          </svg>
        ) : (
          /* ========================================================================= */
          /* 3D REALISTIC CRATERED CELESTIAL MOON (When in Light Mode -> click for Dark) */
          /* ========================================================================= */
          <svg
            viewBox="0 0 32 32"
            className="w-full h-full overflow-visible transition-transform duration-700 group-hover:-rotate-12"
          >
            <defs>
              {/* Lunar Pearlescent Aura Glow */}
              <radialGradient id="moonAtmosphereGlow" cx="42%" cy="40%" r="55%">
                <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.3" />
                <stop offset="65%" stopColor="#64748B" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#334155" stopOpacity="0" />
              </radialGradient>

              {/* 3D Luminous Lunar Body Gradient (Light coming from top-left) */}
              <radialGradient id="moonLitSurface" cx="30%" cy="28%" r="65%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="25%" stopColor="#F1F5F9" />
                <stop offset="55%" stopColor="#CBD5E1" />
                <stop offset="85%" stopColor="#94A3B8" />
                <stop offset="100%" stopColor="#64748B" />
              </radialGradient>

              {/* Crater 3D Shadow Gradient (Depth illusion) */}
              <radialGradient id="craterDeepShadow" cx="40%" cy="38%" r="60%">
                <stop offset="0%" stopColor="#475569" stopOpacity="0.8" />
                <stop offset="70%" stopColor="#64748B" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#94A3B8" stopOpacity="0" />
              </radialGradient>

              {/* Specular Lunar Rim Gradient */}
              <linearGradient id="moonCrescentRim" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="60%" stopColor="#E2E8F0" />
                <stop offset="100%" stopColor="#94A3B8" />
              </linearGradient>

              {/* Soft Drop Shadow for Moon Depth */}
              <filter id="moonDepthShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="-0.5" dy="1.5" stdDeviation="1.8" floodColor="#0F172A" floodOpacity="0.35" />
              </filter>
            </defs>

            {/* Soft Ambient Lunar Halo */}
            <circle cx="16" cy="16" r="14" fill="url(#moonAtmosphereGlow)" />

            {/* 3D Crescent Moon Body (Curved organic arc with depth) */}
            <path
              d="M23.5 16.5 C23.5 21.7 19.3 26 14.1 26 C11.2 26 8.6 24.7 6.8 22.6 C9.4 23.3 12.3 22.8 14.8 21.1 C18.2 18.7 19.4 14.1 17.6 10.3 C17.1 9.3 16.5 8.4 15.6 7.6 C20.1 8.2 23.5 12 23.5 16.5 Z"
              fill="url(#moonLitSurface)"
              filter="url(#moonDepthShadow)"
            />

            {/* Realistic Micro-Craters with Inner Depth & Highlights */}
            {/* Crater 1 (Upper) */}
            <circle cx="18.5" cy="13.2" r="1.35" fill="url(#craterDeepShadow)" />
            <circle cx="18.3" cy="13" r="1.1" stroke="#E2E8F0" strokeWidth="0.3" fill="none" opacity="0.6" />

            {/* Crater 2 (Center) */}
            <circle cx="17.2" cy="17.8" r="1.8" fill="url(#craterDeepShadow)" />
            <circle cx="17" cy="17.6" r="1.5" stroke="#FFFFFF" strokeWidth="0.35" fill="none" opacity="0.75" />

            {/* Crater 3 (Lower micro-crater) */}
            <circle cx="13.8" cy="22" r="1.1" fill="url(#craterDeepShadow)" />
            <circle cx="13.6" cy="21.9" r="0.85" stroke="#E2E8F0" strokeWidth="0.25" fill="none" opacity="0.5" />

            {/* Bright Lunar Edge Rim Specular Highlight */}
            <path
              d="M23.2 14.8 C23.2 18 21 21.2 18 23"
              stroke="url(#moonCrescentRim)"
              strokeWidth="0.8"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
          </svg>
        )}
      </div>
    </button>
  );
}

