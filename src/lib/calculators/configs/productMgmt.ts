import type { CalculatorConfig } from "../types";

export const inventoryTurnoverCalculator: CalculatorConfig = {
  id: "inventory",
  category: "product-mgmt",
  name: "Inventory Turnover Ratio",
  description: "How fast product moves through inventory, and how many days it sits.",
  icon: "📦",
  inputGroups: [
    {
      id: "inventory",
      title: "Inventory",
      fields: [
        { id: "periodCogs", label: "COGS over the period", type: "currency", defaultValue: 234000, min: 0, step: 1000, helpText: "Total cost of goods sold during the period below." },
        { id: "avgInventoryValue", label: "Average inventory value", type: "currency", defaultValue: 60000, min: 0, step: 1000, helpText: "(Opening + closing inventory) ÷ 2, at cost." },
        { id: "periodMonths", label: "Period length (months)", type: "number", defaultValue: 12, min: 1, max: 24, step: 1 },
      ],
    },
  ],
  compute: (i) => {
    const inv = i.avgInventoryValue || 0;
    const turnover = inv > 0 ? (i.periodCogs || 0) / inv : 0;
    const periodDays = (i.periodMonths || 12) * 30.44;
    const daysOnHand = turnover > 0 ? periodDays / turnover : Infinity;
    const annualizedTurnover = turnover * (12 / (i.periodMonths || 12));
    return { turnover, daysOnHand, annualizedTurnover };
  },
  outputs: [
    { id: "turnover", label: "Inventory turnover (period)", format: "ratio", emphasis: true },
    { id: "annualizedTurnover", label: "Annualized turnover", format: "ratio" },
    { id: "daysOnHand", label: "Days inventory on hand", format: "number", note: "Average days a pair sits before it ships." },
  ],
};

const LINES = [
  { key: "slippers", label: "Slippers", color: "#5C7A4F" },
  { key: "organizers", label: "Organizers", color: "#B4703F" },
  { key: "utilities", label: "Utilities", color: "#C68A2E" },
] as const;

export const mixMarginCalculator: CalculatorConfig = {
  id: "mix-margin",
  category: "product-mgmt",
  name: "Product Mix Margin Analysis",
  description: "Margin by product line — slippers, organizers, utilities — and the blended result.",
  icon: "🧮",
  inputGroups: [
    {
      id: "slippers",
      title: "Slippers",
      fields: [
        { id: "slippersPrice", label: "Price per unit", type: "currency", defaultValue: 150, min: 0 },
        { id: "slippersCost", label: "Cost per unit", type: "currency", defaultValue: 65, min: 0 },
        { id: "slippersUnits", label: "Monthly units", type: "number", defaultValue: 300, min: 0, step: 10 },
      ],
    },
    {
      id: "organizers",
      title: "Organizers",
      fields: [
        { id: "organizersPrice", label: "Price per unit", type: "currency", defaultValue: 320, min: 0 },
        { id: "organizersCost", label: "Cost per unit", type: "currency", defaultValue: 180, min: 0 },
        { id: "organizersUnits", label: "Monthly units", type: "number", defaultValue: 60, min: 0, step: 10 },
      ],
    },
    {
      id: "utilities",
      title: "Utilities",
      fields: [
        { id: "utilitiesPrice", label: "Price per unit", type: "currency", defaultValue: 90, min: 0 },
        { id: "utilitiesCost", label: "Cost per unit", type: "currency", defaultValue: 40, min: 0 },
        { id: "utilitiesUnits", label: "Monthly units", type: "number", defaultValue: 120, min: 0, step: 10 },
      ],
    },
  ],
  compute: (i) => {
    const line = (price: number, cost: number, units: number) => ({
      marginPct: price > 0 ? ((price - cost) / price) * 100 : 0,
      profit: (price - cost) * units,
      revenue: price * units,
    });
    const s = line(i.slippersPrice || 0, i.slippersCost || 0, i.slippersUnits || 0);
    const o = line(i.organizersPrice || 0, i.organizersCost || 0, i.organizersUnits || 0);
    const u = line(i.utilitiesPrice || 0, i.utilitiesCost || 0, i.utilitiesUnits || 0);
    const totalRevenue = s.revenue + o.revenue + u.revenue;
    const totalProfit = s.profit + o.profit + u.profit;
    const blendedMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return {
      slippersMarginPct: s.marginPct,
      organizersMarginPct: o.marginPct,
      utilitiesMarginPct: u.marginPct,
      slippersProfit: s.profit,
      organizersProfit: o.profit,
      utilitiesProfit: u.profit,
      blendedMarginPct,
      totalProfit,
    };
  },
  outputs: [
    { id: "blendedMarginPct", label: "Blended margin", format: "percentage", emphasis: true },
    { id: "totalProfit", label: "Total monthly gross profit", format: "currency" },
    { id: "slippersMarginPct", label: "Slippers margin", format: "percentage" },
    { id: "organizersMarginPct", label: "Organizers margin", format: "percentage" },
    { id: "utilitiesMarginPct", label: "Utilities margin", format: "percentage" },
  ],
  chart: (_i, o) => ({
    title: "Monthly gross profit by product line",
    type: "bar",
    labels: LINES.map((l) => l.label),
    series: [
      {
        name: "Gross profit",
        color: "#5C7A4F",
        values: [o.slippersProfit, o.organizersProfit, o.utilitiesProfit],
      },
    ],
    format: "currency",
  }),
};

export const productMgmtCalculators = [inventoryTurnoverCalculator, mixMarginCalculator];
