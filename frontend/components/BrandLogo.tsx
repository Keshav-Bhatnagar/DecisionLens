"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "@/context/ThemeContext";
import FacetedLensCanvas from "@/components/FacetedLensCanvas";

interface BrandLogoProps {
  className?: string;
  theme?: "light" | "dark";
  href?: string;
  showWordmark?: boolean;
  iconSizeClass?: string;
}

export default function BrandLogo({
  className = "",
  theme: propTheme,
  href = "/",
  showWordmark = true,
  iconSizeClass = "w-[46px] h-[46px]",
}: BrandLogoProps) {
  const context = useTheme();
  const theme = propTheme || context.theme || "light";
  const isDark = theme === "dark";
  const inkPrimary = isDark ? "#F0EAE1" : "#161E33";
  const brassColor = isDark ? "#d4aa50" : "#b08a3c";
  const brassDark = isDark ? "#a68233" : "#876222";

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2.5 transition-opacity hover:opacity-90 select-none ${className}`}
      aria-label="DecisionLens Home"
    >
      {/* Bespoke Antique Magnifying Lens Emblem: 180° rotation on hover */}
      <div
        className={`relative ${iconSizeClass} flex-shrink-0 flex items-center justify-center transition-transform duration-700 ease-in-out group-hover:rotate-180 motion-reduce:transform-none`}
      >
        {hasMounted ? (
          <FacetedLensCanvas size={46} />
        ) : (
          <svg
            viewBox="0 0 44 44"
            className="w-full h-full drop-shadow-xs"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="brassGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={isDark ? "#f0cf85" : "#d8af56"} />
                <stop offset="50%" stopColor={brassColor} />
                <stop offset="100%" stopColor={brassDark} />
              </linearGradient>
              <linearGradient id="handleGrad" x1="26" y1="26" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={isDark ? "#3f3223" : "#2a1c10"} />
                <stop offset="100%" stopColor={isDark ? "#221910" : "#140c06"} />
              </linearGradient>
            </defs>

            {/* Handle Angled at 45° */}
            <line
              x1="24.5"
              y1="24.5"
              x2="26.8"
              y2="26.8"
              stroke="url(#brassGrad)"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <line
              x1="26.5"
              y1="26.5"
              x2="38.5"
              y2="38.5"
              stroke="url(#handleGrad)"
              strokeWidth="3.6"
              strokeLinecap="round"
            />
            <circle cx="39" cy="39" r="2.2" fill="url(#brassGrad)" />
            <circle cx="26.2" cy="26.2" r="2.4" fill="url(#brassGrad)" />

            {/* Brass Rim */}
            <circle
              cx="16"
              cy="16"
              r="12.5"
              stroke="url(#brassGrad)"
              strokeWidth="2.4"
            />
            <circle
              cx="16"
              cy="16"
              r="10.8"
              stroke={isDark ? "#594218" : "#876222"}
              strokeWidth="0.8"
              strokeDasharray="1.5 1.5"
            />
            <circle
              cx="16"
              cy="16"
              r="11.5"
              fill={isDark ? "#221F1C" : "#F4EFE6"}
              fillOpacity={isDark ? "0.6" : "0.55"}
            />

            {/* 6 Faceted Paper Shards */}
            <g transform="translate(16, 16)">
              <path
                d="M0 0 L-2 -8.5 L2.5 -8 Z"
                fill={isDark ? "#F0EAE1" : "#EDE7D6"}
                fillOpacity="0.85"
                stroke={isDark ? "#D4AA50" : "#2F5D8F"}
                strokeWidth="0.4"
              />
              <path
                d="M0 0 L2.5 -8 L7.5 -3.5 Z"
                fill={isDark ? "#F0EAE1" : "#F5F1E8"}
                fillOpacity="0.75"
                stroke={isDark ? "#D4AA50" : "#2F5D8F"}
                strokeWidth="0.4"
              />
              <path
                d="M0 0 L7.5 -3.5 L6 6 Z"
                fill={isDark ? "#F0EAE1" : "#E5DEC9"}
                fillOpacity="0.8"
                stroke={isDark ? "#D4AA50" : "#2F5D8F"}
                strokeWidth="0.4"
              />
              <path
                d="M0 0 L6 6 L-1.5 8 Z"
                fill={isDark ? "#F0EAE1" : "#EDE7D6"}
                fillOpacity="0.7"
                stroke={isDark ? "#D4AA50" : "#2F5D8F"}
                strokeWidth="0.4"
              />
              <path
                d="M0 0 L-1.5 8 L-7.5 3 Z"
                fill={isDark ? "#F0EAE1" : "#F5F1E8"}
                fillOpacity="0.8"
                stroke={isDark ? "#D4AA50" : "#2F5D8F"}
                strokeWidth="0.4"
              />
              <path
                d="M0 0 L-7.5 3 L-2 -8.5 Z"
                fill={isDark ? "#F0EAE1" : "#E5DEC9"}
                fillOpacity="0.75"
                stroke={isDark ? "#D4AA50" : "#2F5D8F"}
                strokeWidth="0.4"
              />
              <circle
                cx="0"
                cy="0"
                r="4.8"
                stroke={isDark ? "#D4AA50" : "#2F5D8F"}
                strokeWidth="0.6"
                strokeOpacity="0.8"
              />
              <circle cx="0" cy="0" r="1.8" fill="#e5a93c" />
              <circle cx="0" cy="0" r="0.9" fill="#FFF2B8" />
            </g>
          </svg>
        )}
      </div>

      {/* Typography Wordmark */}
      {showWordmark && (
        <span
          className="font-newsreader text-[21px] sm:text-[23px] font-medium tracking-tight leading-none transition-colors"
          style={{ color: inkPrimary }}
        >
          DecisionLens<span className="text-[#2B4C8C] dark:text-[#D4AA50]">.</span>
        </span>
      )}
    </Link>
  );
}
