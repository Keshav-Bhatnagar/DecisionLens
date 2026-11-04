"use client";

import React from "react";

interface ApertureToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
  className?: string;
}

export default function ApertureToggle({
  theme,
  onToggle,
  className = "",
}: ApertureToggleProps) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group relative flex items-center justify-center p-1.5 rounded-full transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#2B4C8C] ${
        isDark ? "hover:bg-white/5" : "hover:bg-black/5"
      } ${className}`}
      title={
        isDark
          ? "Step up optical aperture to f/1.4 (Light Mode)"
          : "Step down optical aperture to f/16 (Dark Mode)"
      }
      aria-label={
        isDark
          ? "Switch to light mode by adjusting optical aperture"
          : "Switch to dark mode by adjusting optical aperture"
      }
      aria-pressed={isDark}
    >
      {/* 24px Precision Brass Aperture Dial */}
      <div className="relative w-6 h-6 flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-xs"
        >
          {/* Outer Coin-Edge Brass Bezel */}
          <circle
            cx="12"
            cy="12"
            r="11"
            stroke={isDark ? "#d4aa50" : "#b08a3c"}
            strokeWidth="1.6"
          />
          {/* Inner Calibrated Step Ring */}
          <circle
            cx="12"
            cy="12"
            r="9.5"
            stroke={isDark ? "#a68233" : "#876222"}
            strokeWidth="0.6"
            strokeDasharray="1.5 1.5"
            strokeOpacity="0.8"
          />

          {/* Interlocking Curved Iris Aperture Blades */}
          <g
            className="transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-center"
            style={{
              transformOrigin: "12px 12px",
              transform: isDark ? "rotate(45deg) scale(0.68)" : "rotate(0deg) scale(1)",
            }}
          >
            {/* Blade 1 */}
            <path
              d="M12 4 C15 4 18 6 18 9 C15 8 13 8 12 4 Z"
              fill={isDark ? "#8f6e2a" : "#876222"}
              opacity="0.85"
            />
            {/* Blade 2 */}
            <path
              d="M18 9 C19 12 18 16 16 18 C16 15 15 13 18 9 Z"
              fill={isDark ? "#a88334" : "#a0752a"}
              opacity="0.85"
            />
            {/* Blade 3 */}
            <path
              d="M16 18 C14 20 10 20 7 18 C10 17 12 16 16 18 Z"
              fill={isDark ? "#8f6e2a" : "#876222"}
              opacity="0.85"
            />
            {/* Blade 4 */}
            <path
              d="M7 18 C5 16 4 12 6 9 C7 12 9 14 7 18 Z"
              fill={isDark ? "#a88334" : "#a0752a"}
              opacity="0.85"
            />
            {/* Blade 5 */}
            <path
              d="M6 9 C8 6 10 4 12 4 C11 7 10 9 6 9 Z"
              fill={isDark ? "#8f6e2a" : "#876222"}
              opacity="0.85"
            />
          </g>

          {/* Dynamic Optical Center Core (Wide Open f/1.4 vs Pinhole f/16) */}
          <circle
            cx="12"
            cy="12"
            r={isDark ? 1.6 : 4.2}
            fill={isDark ? "#e5a93c" : "#FFC83B"}
            className="transition-all duration-400 ease-out"
          />
          {/* Specular Glint Highlight (visible in light mode) */}
          {!isDark && (
            <circle
              cx="11.2"
              cy="11.2"
              r="1.4"
              fill="#FFFFFF"
              opacity="0.85"
              className="pointer-events-none"
            />
          )}
        </svg>
      </div>
    </button>
  );
}

