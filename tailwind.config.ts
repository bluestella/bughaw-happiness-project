import type { Config } from "tailwindcss";

/**
 * Design tokens — Bughaw corporate design system (docs/index.html v1.0).
 * Legacy token names (paper/ink/coir/line…) are kept so existing classnames
 * keep working; values are mapped onto the real brand palette instead of the
 * generic blue-on-slate theme that had drifted from it.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F0DE", // cream — the paper, primary light ground
        panel: "#FFFFFF", // cards / surfaces
        ink: "#241F1A", // primary text — 14.3:1 on cream
        "ink-soft": "#6B6355", // secondary text, labels, help text
        coir: "#20699F", // Bughaw Blue — primary actions, focus rings, links (5.1:1)
        "coir-dark": "#17517D", // accent hover
        "coir-bg": "#DCE8F4", // accent tint surface
        clay: "#6E5A42", // Warm Brown — material/secondary accent (5.7:1)
        line: "#DDD6C0", // borders, dividers (brand rule color)
        danger: "#A8412A",
        amber: "#8A6215", // readable dark-gold for caution text; gold itself never sits on cream/white
        // Semantic status tokens
        success: "#2C6B38",
        "success-bg": "#EEF6EA",
        "success-border": "#C4DDB8",
        "danger-bg": "#FBF0EC",
        "danger-border": "#E8C4B8",
        "amber-bg": "#FBF1DC",
        "amber-border": "#E5B95F",
        // Raw brand tokens, for hero/dark-band treatments (login, marketing headers)
        deep: "#1D5C13", // dark brand field
        gold: "#E5B95F", // rules and marks only — never body text on light
        brown: "#6E5A42",
        sky: "#3DAEE0", // headings on dark, display sizes only
        bgreen: "#6EA92F", // markers/icons on dark — never text on Deep Green
      },
      fontFamily: {
        // Fraunces (variable, optical-size aware) for headings and big numbers;
        // DM Sans carries operational UI copy.
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["'DM Sans'", "Helvetica", "Arial", "sans-serif"],
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
