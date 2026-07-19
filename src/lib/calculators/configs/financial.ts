import type { CalculatorConfig } from "../types";

export const ltvSegmentCalculator: CalculatorConfig = {
  id: "ltv-segment",
  category: "financial",
  name: "Customer LTV by Hotel Segment",
  description: "Lifetime value and LTV:CAC for Segment A (owner-operated) vs Segment B (conglomerate).",
  icon: "🏆",
  inputGroups: [
    {
      id: "segA",
      title: "Segment A — owner-operated, rating-aspiring",
      fields: [
        { id: "aMonthlyRevenue", label: "Monthly revenue per hotel", type: "currency", defaultValue: 9000, min: 0, step: 500 },
        { id: "aMarginPct", label: "Gross margin", type: "percentage", defaultValue: 55, min: 0, max: 100 },
        { id: "aLifetimeMonths", label: "Relationship length (months)", type: "number", defaultValue: 12, min: 1 },
        { id: "aCac", label: "CAC per hotel", type: "currency", defaultValue: 6000, min: 0, step: 500 },
      ],
    },
    {
      id: "segB",
      title: "Segment B — ESG-reporting conglomerate",
      fields: [
        { id: "bMonthlyRevenue", label: "Monthly revenue per hotel", type: "currency", defaultValue: 25000, min: 0, step: 500 },
        { id: "bMarginPct", label: "Gross margin", type: "percentage", defaultValue: 55, min: 0, max: 100 },
        { id: "bLifetimeMonths", label: "Relationship length (months)", type: "number", defaultValue: 24, min: 1 },
        { id: "bCac", label: "CAC per hotel", type: "currency", defaultValue: 15000, min: 0, step: 500 },
      ],
    },
  ],
  compute: (i) => {
    const ltv = (rev: number, margin: number, months: number) => rev * (margin / 100) * months;
    const aLtv = ltv(i.aMonthlyRevenue || 0, i.aMarginPct || 0, i.aLifetimeMonths || 0);
    const bLtv = ltv(i.bMonthlyRevenue || 0, i.bMarginPct || 0, i.bLifetimeMonths || 0);
    return {
      aLtv,
      bLtv,
      aRatio: (i.aCac || 0) > 0 ? aLtv / i.aCac : Infinity,
      bRatio: (i.bCac || 0) > 0 ? bLtv / i.bCac : Infinity,
    };
  },
  outputs: [
    { id: "aLtv", label: "Segment A LTV", format: "currency", emphasis: true },
    { id: "aRatio", label: "Segment A LTV : CAC", format: "ratio", note: "≥3× is healthy." },
    { id: "bLtv", label: "Segment B LTV", format: "currency", emphasis: true },
    { id: "bRatio", label: "Segment B LTV : CAC", format: "ratio", note: "≥3× is healthy." },
  ],
  chart: (_i, o) => ({
    title: "LTV per hotel by segment",
    type: "bar",
    labels: ["Segment A", "Segment B"],
    series: [{ name: "LTV", color: "#5C7A4F", values: [o.aLtv, o.bLtv] }],
    format: "currency",
  }),
};

const MONTH_LABELS = ["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","M11","M12"];

export function projectCashFlow(i: Record<string, number>) {
  const balances: number[] = [];
  const netFlows: number[] = [];
  let cash = i.startingCash || 0;
  let revenue = i.monthlyRevenue || 0;
  let opex = i.monthlyOpex || 0;
  for (let m = 0; m < 12; m++) {
    if (m > 0) {
      revenue *= 1 + (i.revenueGrowthPct || 0) / 100;
      opex *= 1 + (i.opexGrowthPct || 0) / 100;
    }
    const net = revenue * ((i.grossMarginPct || 0) / 100) - opex;
    cash += net;
    netFlows.push(net);
    balances.push(cash);
  }
  return { balances, netFlows };
}

export const cashFlowCalculator: CalculatorConfig = {
  id: "cash-flow",
  category: "financial",
  name: "Cash Flow Projection",
  description: "12-month cash balance from revenue growth, margin, and operating spend.",
  icon: "💧",
  inputGroups: [
    {
      id: "cash",
      title: "Starting point",
      fields: [
        { id: "startingCash", label: "Cash on hand today", type: "currency", defaultValue: 150000, min: 0, step: 5000 },
        { id: "monthlyRevenue", label: "Revenue, month 1", type: "currency", defaultValue: 45000, min: 0, step: 1000 },
        { id: "revenueGrowthPct", label: "Monthly revenue growth", type: "percentage", defaultValue: 10, min: -50, max: 100 },
      ],
    },
    {
      id: "spend",
      title: "Margin & spend",
      fields: [
        { id: "grossMarginPct", label: "Gross margin", type: "percentage", defaultValue: 55, min: 0, max: 100 },
        { id: "monthlyOpex", label: "Monthly opex", type: "currency", defaultValue: 56000, min: 0, step: 1000, helpText: "Salaries, machines, logistics, everything below gross margin." },
        { id: "opexGrowthPct", label: "Monthly opex growth", type: "percentage", defaultValue: 2, min: -50, max: 100 },
      ],
    },
  ],
  compute: (i) => {
    const { balances, netFlows } = projectCashFlow(i);
    const endingCash = balances[11];
    const lowestCash = Math.min(...balances);
    const firstNegative = balances.findIndex((b) => b < 0);
    const cumulativeNet = netFlows.reduce((a, b) => a + b, 0);
    return {
      endingCash,
      lowestCash,
      runwayMonths: firstNegative === -1 ? Infinity : firstNegative + 1,
      cumulativeNet,
    };
  },
  outputs: [
    { id: "endingCash", label: "Cash at month 12", format: "currency", emphasis: true },
    { id: "lowestCash", label: "Lowest cash point", format: "currency" },
    { id: "runwayMonths", label: "Cash-out month", format: "months", note: "First month the balance goes negative (— if it never does)." },
    { id: "cumulativeNet", label: "Cumulative net cash flow", format: "currency" },
  ],
  chart: (i) => {
    const { balances } = projectCashFlow(i);
    return {
      title: "Projected cash balance",
      type: "line",
      labels: MONTH_LABELS,
      series: [{ name: "Cash balance", color: "#5C7A4F", values: balances }],
      format: "currency",
    };
  },
  verdict: (_i, o) => ({
    ok: o.lowestCash >= 0,
    text:
      o.lowestCash >= 0
        ? "Cash stays positive across all 12 months at these assumptions."
        : "Cash goes negative — this plan needs bridging capital or lower burn.",
  }),
};

export function projectScenarios(i: Record<string, number>) {
  const run = (growthPct: number) => {
    let units = i.baseUnits || 0;
    const profits: number[] = [];
    let cumulative = 0;
    for (let m = 0; m < 12; m++) {
      if (m > 0) units = Math.round(units * (1 + growthPct / 100));
      const profit =
        units * ((i.pricePerUnit || 0) - (i.costPerUnit || 0)) - (i.monthlyFixed || 0);
      cumulative += profit;
      profits.push(profit);
    }
    return { profits, cumulative };
  };
  const base = run(i.baseGrowthPct || 0);
  const best = run((i.baseGrowthPct || 0) + (i.optimisticDeltaPct || 0));
  const worst = run(Math.max(-100, (i.baseGrowthPct || 0) - (i.pessimisticDeltaPct || 0)));
  return { base, best, worst };
}

export const growthScenarioCalculator: CalculatorConfig = {
  id: "growth-scenario",
  category: "financial",
  name: "Growth Scenario Modeling",
  description: "Year-1 operating profit under base, optimistic, and pessimistic growth.",
  icon: "📈",
  inputGroups: [
    {
      id: "base",
      title: "Base case",
      fields: [
        { id: "baseUnits", label: "Pairs sold, month 1", type: "number", defaultValue: 300, min: 0, step: 50 },
        { id: "baseGrowthPct", label: "Monthly growth", type: "percentage", defaultValue: 12, min: -50, max: 100 },
        { id: "pricePerUnit", label: "Price per pair", type: "currency", defaultValue: 150, min: 0 },
        { id: "costPerUnit", label: "Variable cost per pair", type: "currency", defaultValue: 65, min: 0 },
        { id: "monthlyFixed", label: "Monthly fixed cost", type: "currency", defaultValue: 56000, min: 0, step: 1000 },
      ],
    },
    {
      id: "sensitivity",
      title: "Sensitivity",
      fields: [
        { id: "optimisticDeltaPct", label: "Optimistic: extra growth", type: "percentage", defaultValue: 8, min: 0, max: 50, helpText: "Added on top of base monthly growth." },
        { id: "pessimisticDeltaPct", label: "Pessimistic: growth haircut", type: "percentage", defaultValue: 8, min: 0, max: 50, helpText: "Subtracted from base monthly growth." },
      ],
    },
  ],
  compute: (i) => {
    const { base, best, worst } = projectScenarios(i);
    return {
      baseYear1: base.cumulative,
      bestYear1: best.cumulative,
      worstYear1: worst.cumulative,
      spread: best.cumulative - worst.cumulative,
    };
  },
  outputs: [
    { id: "baseYear1", label: "Year-1 profit — base", format: "currency", emphasis: true },
    { id: "bestYear1", label: "Year-1 profit — optimistic", format: "currency" },
    { id: "worstYear1", label: "Year-1 profit — pessimistic", format: "currency" },
    { id: "spread", label: "Best-to-worst spread", format: "currency", note: "How sensitive the plan is to the growth assumption." },
  ],
  chart: (i) => {
    const { base, best, worst } = projectScenarios(i);
    return {
      title: "Monthly operating profit by scenario",
      type: "line",
      labels: MONTH_LABELS,
      series: [
        { name: "Optimistic", color: "#5C7A4F", values: best.profits },
        { name: "Base", color: "#C68A2E", values: base.profits },
        { name: "Pessimistic", color: "#A6432F", values: worst.profits },
      ],
      format: "currency",
    };
  },
};

export const financialCalculators = [
  ltvSegmentCalculator,
  cashFlowCalculator,
  growthScenarioCalculator,
];
