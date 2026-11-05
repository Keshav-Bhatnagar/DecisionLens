"use client";

import React from "react";
import Link from "next/link";
import { useTheme } from "@/context/ThemeContext";
import { DecisionLensIcon } from "@/components/DecisionLensLogo";

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
  iconSizeClass = "w-9 h-9",
}: BrandLogoProps) {
  const context = useTheme();
  const theme = propTheme || context.theme || "light";
  const isDark = theme === "dark";
  const inkPrimary = isDark ? "#F0EAE1" : "#161E33";

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2.5 transition-opacity hover:opacity-90 select-none ${className}`}
      aria-label="DecisionLens Home"
    >
      <div className={`${iconSizeClass} flex-shrink-0 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-[1.05]`}>
        <DecisionLensIcon size={36} />
      </div>

      {showWordmark && (
        <div className="flex flex-col">
          <span
            className="font-newsreader text-[20px] sm:text-[22px] font-medium tracking-tight leading-none transition-colors"
            style={{ color: inkPrimary }}
          >
            DecisionLens<span className="text-[#D97706] dark:text-[#FBBF24]">.</span>
          </span>
          <span className="text-[8px] font-mono font-semibold uppercase tracking-widest text-[#9E7D47] dark:text-[#D4AA50] mt-0.5">
            Executive Cognitive
          </span>
        </div>
      )}
    </Link>
  );
}
