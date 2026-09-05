import type { Config } from "tailwindcss";

/**
 * Design tokens — modern clean SaaS theme (light only).
 * Legacy token names (paper/ink/coir/line…) are kept so existing classnames
 * keep working; only their values changed in the rebrand.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F8FAFC", // app background (slate-50)
        panel: "#FFFFFF", // cards / surfaces
        ink: "#0F172A", // primary text (slate-900)
        "ink-soft": "#64748B", // secondary text (slate-500)
        coir: "#2563EB", // accent (blue-600)
        "coir-dark": "#1D4ED8", // accent hover (blue-700)
        "coir-bg": "#EFF6FF", // accent tint surface (blue-50)
        clay: "#EA580C", // secondary/negative accent (orange-600)
        line: "#E2E8F0", // borders (slate-200)
        danger: "#DC2626", // red-600
        amber: "#D97706", // amber-600
        // Semantic status tokens (replace previously hard-coded hexes)
        success: "#059669",
        "success-bg": "#ECFDF5",
        "success-border": "#A7F3D0",
        "danger-bg": "#FEF2F2",
        "danger-border": "#FECACA",
        "amber-bg": "#FFFBEB",
        "amber-border": "#FDE68A",
      },
      fontFamily: {
        // Single modern sans for UI and headings; mono for numbers.
        display: ["Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        "card-hover":
          "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 12px -2px rgb(15 23 42 / 0.08)",
        pop: "0 10px 38px -10px rgb(15 23 42 / 0.28), 0 10px 20px -15px rgb(15 23 42 / 0.2)",
      },
      transitionTimingFunction: {
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-strong": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
