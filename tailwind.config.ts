import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F3EA",
        panel: "#FFFFFF",
        ink: "#2B2620",
        "ink-soft": "#6B6355",
        coir: "#5C7A4F",
        "coir-dark": "#43593B",
        "coir-bg": "#F1F6EE",
        clay: "#B4703F",
        line: "#DED6C4",
        danger: "#A6432F",
        amber: "#C68A2E",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
