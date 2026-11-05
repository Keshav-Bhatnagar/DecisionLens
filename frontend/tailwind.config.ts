import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4f8",
          100: "#d9e2ec",
          200: "#bcccdc",
          300: "#9fb3c8",
          400: "#829ab1",
          500: "#627d98",
          600: "#486581",
          700: "#334e68",
          800: "#243b53",
          900: "#102a43",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
        muted: "var(--ink-secondary)",
        softly: {
          bg: "#FDFCF8",
          sage: "#E8EFE8",
          lavender: "#EFEDF4",
          coral: "#FFB7B2",
          dark: "#292524",
          muted: "#78716C",
          blush: "#FFE4E1",
          softpurple: "#E6E6FA",
        },
        editorial: {
          ground: "var(--bg-page)",
          "ground-secondary": "var(--bg-sidebar)",
          ink: "var(--ink)",
          "ink-secondary": "var(--ink-secondary)",
          muted: "var(--ink-tertiary)",
          blue: "var(--accent)",
          amber: "#B4874B",
          hairline: "var(--border)",
        },
        dossier: {
          page: "var(--bg-page)",
          surface: "var(--bg-surface)",
          sidebar: "var(--bg-sidebar)",
          ink: "var(--ink)",
          "ink-hover": "var(--ink)",
          "ink-secondary": "var(--ink-secondary)",
          "ink-tertiary": "var(--ink-tertiary)",
          accent: "var(--accent)",
          border: "var(--border)",
        },
        paper: {
          page: "var(--bg-page)",
          surface: "var(--bg-surface)",
          sidebar: "var(--bg-sidebar)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          secondary: "var(--ink-secondary)",
          tertiary: "var(--ink-tertiary)",
          light: "var(--ink-secondary)",
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
        },
      },
      borderRadius: {
        sm: "2px",
        md: "4px",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "Inter", "system-ui", "-apple-system", "sans-serif"],
        jakarta: ['"Plus Jakarta Sans"', "sans-serif"],
        inter: ["Inter", "sans-serif"],
        newsreader: ["Newsreader", "serif"],
        courier: ['"Courier Prime"', "monospace"],
        mono: ['"Courier Prime"', "monospace"],
        outfit: ["Outfit", "sans-serif"],
        reenie: ['"Reenie Beanie"', "cursive"],
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(0,0,0,0.05)",
        "soft-lg": "0 10px 30px -4px rgba(0,0,0,0.07)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "float-delayed": {
          "0%, 100%": { transform: "translateY(-6px)" },
          "50%": { transform: "translateY(10px)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(255, 183, 178, 0.35)" },
          "50%": { transform: "scale(1.06)", boxShadow: "0 0 24px 6px rgba(255, 183, 178, 0.5)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-delayed": "float-delayed 7s ease-in-out infinite",
        breathe: "breathe 4s ease-in-out infinite",
      },
      zIndex: {
        60: "60",
        70: "70",
        80: "80",
        90: "90",
        100: "100",
      },
    },
  },
  plugins: [],
};

export default config;
