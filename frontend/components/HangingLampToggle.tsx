"use client";

import React, { useState } from "react";

interface HangingLampToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
  className?: string;
}

export default function HangingLampToggle({
  theme,
  onToggle,
  className = "",
}: HangingLampToggleProps) {
  const isDark = theme === "dark";
  const [isPulling, setIsPulling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handlePull = () => {
    setIsPulling(true);
    setTimeout(() => {
      onToggle();
    }, 120);
    setTimeout(() => {
      setIsPulling(false);
    }, 380);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePull();
    }
  };

  const brassLight = isDark ? "#e0b85c" : "#c49838";
  const brassDark = isDark ? "#9a7428" : "#805c19";

  return (
    <div
      className={`relative inline-flex flex-col items-center select-none ${className}`}
      style={{ zIndex: 60 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={handlePull}
        onKeyDown={handleKeyDown}
        className="group relative flex flex-col items-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#2B4C8C] rounded pt-1"
        title={
          isDark
            ? "Pull antique lamp cord to illuminate page (Light Mode)"
            : "Pull antique lamp cord to dim page (Dark Mode)"
        }
        aria-label={
          isDark
            ? "Switch to light mode by pulling antique lamp cord"
            : "Switch to dark mode by pulling antique lamp cord"
        }
        aria-pressed={isDark}
      >
        {/* Antique Brass Rosette Bracket Mount (Mounted to Nav Rail) */}
        <div className="relative flex items-center justify-center -mb-0.5">
          <svg width="18" height="8" viewBox="0 0 18 8" fill="none">
            {/* Wall bracket baseplate */}
            <path
              d="M1 2 C4 0.5 14 0.5 17 2 L15 5 C11 4.5 7 4.5 3 5 Z"
              fill={brassDark}
              stroke={brassLight}
              strokeWidth="0.6"
            />
            {/* Central Eyelet Ring */}
            <circle cx="9" cy="5" r="2.2" fill={brassLight} stroke={brassDark} strokeWidth="0.6" />
            <circle cx="9" cy="5" r="1" fill={isDark ? "#181614" : "#F5F1E8"} />
          </svg>
        </div>

        {/* Hanging Beaded Chain & Pull Fob with Spring Pull Animation */}
        <div
          className="flex flex-col items-center origin-top transition-transform"
          style={{
            transform: isPulling
              ? "translateY(8px) scaleY(1.08)"
              : isHovered
              ? "rotate(4deg) translateY(1px)"
              : "rotate(0deg) translateY(0px)",
            transition: isPulling
              ? "transform 0.12s cubic-bezier(0.2, 0.8, 0.4, 1)"
              : "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* Beaded brass pull chain (24px) */}
          <svg
            width="6"
            height="26"
            viewBox="0 0 6 26"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Fine chain connector line */}
            <line x1="3" y1="0" x2="3" y2="26" stroke={brassDark} strokeWidth="0.8" opacity="0.6" />
            {/* Beaded brass balls */}
            <circle cx="3" cy="2.5" r="1.3" fill={brassLight} stroke={brassDark} strokeWidth="0.4" />
            <circle cx="3" cy="6.5" r="1.3" fill={brassLight} stroke={brassDark} strokeWidth="0.4" />
            <circle cx="3" cy="10.5" r="1.3" fill={brassLight} stroke={brassDark} strokeWidth="0.4" />
            <circle cx="3" cy="14.5" r="1.3" fill={brassLight} stroke={brassDark} strokeWidth="0.4" />
            <circle cx="3" cy="18.5" r="1.3" fill={brassLight} stroke={brassDark} strokeWidth="0.4" />
            <circle cx="3" cy="22.5" r="1.3" fill={brassLight} stroke={brassDark} strokeWidth="0.4" />
          </svg>

          {/* Antique Turned Brass Bell Fob / Edison Glow Capsule */}
          <div className="relative -mt-0.5 group-hover:scale-108 transition-transform">
            <svg
              width="18"
              height="22"
              viewBox="0 0 18 22"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-sm"
            >
              {/* Knurled Brass Collar / Socket */}
              <rect
                x="6"
                y="0.5"
                width="6"
                height="3.5"
                rx="0.8"
                fill={brassLight}
                stroke={brassDark}
                strokeWidth="0.7"
              />
              {/* Socket Knurl lines */}
              <line x1="7.5" y1="1" x2="7.5" y2="3.5" stroke={brassDark} strokeWidth="0.5" />
              <line x1="9" y1="1" x2="9" y2="3.5" stroke={brassDark} strokeWidth="0.5" />
              <line x1="10.5" y1="1" x2="10.5" y2="3.5" stroke={brassDark} strokeWidth="0.5" />

              {/* Handblown Teardrop Glass Bulb Body */}
              <path
                d="M9 4 C12.5 4 15 6.5 15 10.5 C15 15 11 19.5 9 21 C7 19.5 3 15 3 10.5 C3 6.5 5.5 4 9 4 Z"
                fill={isDark ? "#171e2c" : "#FFF8DE"}
                stroke={isDark ? "#d4aa50" : "#b08a3c"}
                strokeWidth="1.1"
              />

              {/* Internal Filament Loop */}
              {isDark ? (
                // Dim warm ember glow in dark mode
                <path
                  d="M7.5 8.5 Q9 11.5 10.5 8.5 Q9 15 9 16.5"
                  stroke="#e5a93c"
                  strokeWidth="0.9"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              ) : (
                // Bright warm tungsten filament in light mode
                <g>
                  <path
                    d="M7.5 8 Q9 12 10.5 8 Q9 16 9 17"
                    stroke="#e59819"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <circle cx="9" cy="10" r="2.2" fill="#FFC83B" opacity="0.95" />
                  <circle cx="9" cy="10" r="1.1" fill="#FFFFFF" />
                </g>
              )}
            </svg>

            {/* Radial Warm Glow Atmosphere when lit (Light Mode) */}
            {!isDark && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255, 215, 115, 0.55) 0%, rgba(245, 165, 36, 0.2) 50%, transparent 80%)",
                  transform: "scale(2.4)",
                  filter: "blur(2.5px)",
                }}
              />
            )}

            {/* Soft Ambient Ember Glow (Dark Mode) */}
            {isDark && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(229, 169, 60, 0.3) 0%, transparent 75%)",
                  transform: "scale(1.9)",
                  filter: "blur(2px)",
                }}
              />
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
