export interface ToolDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  path: string;
}

export const TOOLS: ToolDef[] = [
  {
    id: "pipeline",
    name: "Pipeline Simulator",
    description: "Track real hotel accounts, simulate checkpoint scenarios, derive CAC & LTV.",
    icon: "🛤️",
    path: "/tools/pipeline",
  },
  {
    id: "cost-calculator",
    name: "Unit Cost Calculator",
    description: "R&D costing table — ingredients, equipment amortization, cost per pair.",
    icon: "🧪",
    path: "/tools/cost-calculator",
  },
  {
    id: "unit-economics",
    name: "Unit Economics Simulator",
    description: "Slider-driven per-pair margin, hotel CAC, LTV:CAC and payback.",
    icon: "🎚️",
    path: "/tools/unit-economics",
  },
  {
    id: "pnl",
    name: "P&L Machine",
    description: "12-month P&L: breakeven month, breakeven pairs, year-1 cash need.",
    icon: "📊",
    path: "/tools/pnl",
  },
];
