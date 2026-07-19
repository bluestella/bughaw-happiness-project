import type { CalculatorConfig } from "../types";

export const cogsCalculator: CalculatorConfig = {
  id: "cogs",
  category: "unit-economics",
  name: "COGS % Calculator",
  description: "Cost of goods sold as a percentage of the price a hotel pays.",
  icon: "💰",
  inputGroups: [
    {
      id: "costs",
      title: "Cost per pair",
      fields: [
        { id: "manufacturingCost", label: "Manufacturing cost", type: "currency", defaultValue: 52, min: 0, helpText: "Raw coir-cassava material, labor, overhead." },
        { id: "shippingCost", label: "Shipping / freight", type: "currency", defaultValue: 8, min: 0 },
        { id: "packagingCost", label: "Packaging", type: "currency", defaultValue: 5, min: 0 },
      ],
    },
    {
      id: "revenue",
      title: "Revenue",
      fields: [
        { id: "wholesalePrice", label: "Wholesale price to hotel", type: "currency", defaultValue: 150, min: 0, helpText: "Price you charge per pair." },
        { id: "unitsPerMonth", label: "Monthly pairs sold", type: "number", defaultValue: 300, min: 0, step: 10 },
      ],
    },
  ],
  compute: (i) => {
    const totalCostPerUnit =
      (i.manufacturingCost || 0) + (i.shippingCost || 0) + (i.packagingCost || 0);
    const price = i.wholesalePrice || 0;
    const cogsPercentage = price > 0 ? (totalCostPerUnit / price) * 100 : 0;
    const grossMarginPerUnit = price - totalCostPerUnit;
    const monthlyGrossProfit = grossMarginPerUnit * (i.unitsPerMonth || 0);
    return { totalCostPerUnit, cogsPercentage, grossMarginPerUnit, monthlyGrossProfit };
  },
  outputs: [
    { id: "cogsPercentage", label: "COGS %", format: "percentage", emphasis: true },
    { id: "totalCostPerUnit", label: "Total cost per pair", format: "currency" },
    { id: "grossMarginPerUnit", label: "Gross margin per pair", format: "currency" },
    { id: "monthlyGrossProfit", label: "Monthly gross profit", format: "currency" },
  ],
  verdict: (_i, o) => {
    const marginPct = 100 - o.cogsPercentage;
    return {
      ok: marginPct >= 30,
      text: `Gross margin ${marginPct.toFixed(1)}% — Bughaw go/no-go gate is ≥30% at scale.`,
    };
  },
};

export const wholesaleMarginCalculator: CalculatorConfig = {
  id: "margin",
  category: "unit-economics",
  name: "Wholesale Margin Calculator",
  description: "Compare hotel wholesale pricing against retail — margins and markups.",
  icon: "🏷️",
  inputGroups: [
    {
      id: "prices",
      title: "Pricing",
      fields: [
        { id: "unitCost", label: "Cost per unit (landed)", type: "currency", defaultValue: 65, min: 0 },
        { id: "wholesalePrice", label: "Wholesale price to hotel", type: "currency", defaultValue: 150, min: 0 },
        { id: "retailPrice", label: "Retail reference price", type: "currency", defaultValue: 250, min: 0, helpText: "What a comparable pair sells for at retail." },
      ],
    },
  ],
  compute: (i) => {
    const cost = i.unitCost || 0;
    const ws = i.wholesalePrice || 0;
    const rt = i.retailPrice || 0;
    const wholesaleMarginPct = ws > 0 ? ((ws - cost) / ws) * 100 : 0;
    const retailMarginPct = rt > 0 ? ((rt - cost) / rt) * 100 : 0;
    const wholesaleMarkupPct = cost > 0 ? ((ws - cost) / cost) * 100 : 0;
    const hotelDiscountPct = rt > 0 ? ((rt - ws) / rt) * 100 : 0;
    return { wholesaleMarginPct, retailMarginPct, wholesaleMarkupPct, hotelDiscountPct };
  },
  outputs: [
    { id: "wholesaleMarginPct", label: "Wholesale margin", format: "percentage", emphasis: true },
    { id: "retailMarginPct", label: "Retail margin", format: "percentage" },
    { id: "wholesaleMarkupPct", label: "Markup over cost", format: "percentage" },
    { id: "hotelDiscountPct", label: "Hotel discount vs retail", format: "percentage", note: "How much cheaper the hotel buys vs retail." },
  ],
};

export const paybackCalculator: CalculatorConfig = {
  id: "payback",
  category: "unit-economics",
  name: "Payback Period Calculator",
  description: "How many months until the margin from a hotel account earns back its CAC.",
  icon: "⏱️",
  inputGroups: [
    {
      id: "account",
      title: "Hotel account",
      fields: [
        { id: "cac", label: "CAC — cost to win the hotel", type: "currency", defaultValue: 8000, min: 0, step: 500, helpText: "Sales visits, samples, relationship time." },
        { id: "marginPerUnit", label: "Contribution margin per pair", type: "currency", defaultValue: 85, min: 0 },
        { id: "unitsPerMonth", label: "Pairs ordered per month", type: "number", defaultValue: 60, min: 0, step: 10 },
        { id: "lifetimeMonths", label: "Expected relationship (months)", type: "number", defaultValue: 12, min: 1, step: 1 },
      ],
    },
  ],
  compute: (i) => {
    const monthlyContribution = (i.marginPerUnit || 0) * (i.unitsPerMonth || 0);
    const paybackMonths = monthlyContribution > 0 ? (i.cac || 0) / monthlyContribution : Infinity;
    const lifetimeValue = monthlyContribution * (i.lifetimeMonths || 0);
    const ltvCacRatio = (i.cac || 0) > 0 ? lifetimeValue / i.cac : Infinity;
    return { monthlyContribution, paybackMonths, lifetimeValue, ltvCacRatio };
  },
  outputs: [
    { id: "paybackMonths", label: "CAC payback", format: "months", emphasis: true },
    { id: "monthlyContribution", label: "Monthly contribution", format: "currency" },
    { id: "lifetimeValue", label: "Lifetime value", format: "currency" },
    { id: "ltvCacRatio", label: "LTV : CAC", format: "ratio", note: "A healthy account is ≥3×." },
  ],
  verdict: (i, o) => ({
    ok: isFinite(o.paybackMonths) && o.paybackMonths <= (i.lifetimeMonths || 0),
    text: isFinite(o.paybackMonths)
      ? `CAC earned back in ${o.paybackMonths.toFixed(1)} months of a ${i.lifetimeMonths}-month relationship.`
      : "No contribution — CAC is never earned back at these settings.",
  }),
};

export const unitEconomicsCalculators = [
  cogsCalculator,
  wholesaleMarginCalculator,
  paybackCalculator,
];
