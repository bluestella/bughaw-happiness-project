import type { CalculatorConfig } from "../types";

export const penetrationCalculator: CalculatorConfig = {
  id: "penetration",
  category: "go-to-market",
  name: "Hotel Penetration Rate",
  description: "Share of your target hotel market already won, and where the pipeline takes it.",
  icon: "🏨",
  inputGroups: [
    {
      id: "market",
      title: "Target market",
      fields: [
        { id: "targetHotels", label: "Target hotels (addressable)", type: "number", defaultValue: 120, min: 1, step: 1 },
        { id: "acquiredHotels", label: "Hotels acquired (paying)", type: "number", defaultValue: 2, min: 0, step: 1 },
        { id: "pipelineHotels", label: "Hotels in active pipeline", type: "number", defaultValue: 5, min: 0, step: 1 },
        { id: "winRatePct", label: "Expected pipeline win rate", type: "percentage", defaultValue: 30, min: 0, max: 100 },
      ],
    },
  ],
  compute: (i) => {
    const target = i.targetHotels || 1;
    const penetrationPct = ((i.acquiredHotels || 0) / target) * 100;
    const expectedWins = (i.pipelineHotels || 0) * ((i.winRatePct || 0) / 100);
    const projectedPenetrationPct = (((i.acquiredHotels || 0) + expectedWins) / target) * 100;
    const remainingHotels = Math.max(0, target - (i.acquiredHotels || 0));
    return { penetrationPct, projectedPenetrationPct, expectedWins, remainingHotels };
  },
  outputs: [
    { id: "penetrationPct", label: "Penetration today", format: "percentage", emphasis: true },
    { id: "projectedPenetrationPct", label: "Projected w/ pipeline", format: "percentage" },
    { id: "expectedWins", label: "Expected pipeline wins", format: "number" },
    { id: "remainingHotels", label: "Hotels still open", format: "number" },
  ],
};

export const repeatOrderCalculator: CalculatorConfig = {
  id: "repeat-order",
  category: "go-to-market",
  name: "Repeat Order Rate",
  description: "How reliably hotels reorder, and how often orders land.",
  icon: "🔁",
  inputGroups: [
    {
      id: "orders",
      title: "Order history",
      fields: [
        { id: "totalHotels", label: "Hotels with ≥1 order", type: "number", defaultValue: 4, min: 1, step: 1 },
        { id: "hotelsReordered", label: "Hotels that reordered", type: "number", defaultValue: 2, min: 0, step: 1 },
        { id: "totalOrders", label: "Total orders in period", type: "number", defaultValue: 9, min: 0, step: 1 },
        { id: "periodMonths", label: "Period length (months)", type: "number", defaultValue: 6, min: 1, step: 1 },
      ],
    },
  ],
  compute: (i) => {
    const hotels = i.totalHotels || 1;
    const repeatRatePct = ((i.hotelsReordered || 0) / hotels) * 100;
    const ordersPerHotel = (i.totalOrders || 0) / hotels;
    const ordersPerHotelPerMonth = ordersPerHotel / (i.periodMonths || 1);
    const avgReorderIntervalMonths =
      ordersPerHotel > 1 ? (i.periodMonths || 0) / (ordersPerHotel - 1) : Infinity;
    return { repeatRatePct, ordersPerHotel, ordersPerHotelPerMonth, avgReorderIntervalMonths };
  },
  outputs: [
    { id: "repeatRatePct", label: "Repeat order rate", format: "percentage", emphasis: true },
    { id: "ordersPerHotel", label: "Avg orders per hotel", format: "number" },
    { id: "ordersPerHotelPerMonth", label: "Orders / hotel / month", format: "number" },
    { id: "avgReorderIntervalMonths", label: "Avg reorder interval", format: "months" },
  ],
};

const CHANNELS = [
  { key: "direct", label: "Direct", color: "#5C7A4F" },
  { key: "partner", label: "Partnerships", color: "#B4703F" },
  { key: "reseller", label: "Resellers", color: "#C68A2E" },
] as const;

export const breakevenCalculator: CalculatorConfig = {
  id: "breakeven",
  category: "go-to-market",
  name: "Break-Even by Channel",
  description: "Monthly pairs needed to break even in each sales channel.",
  icon: "⚖️",
  inputGroups: [
    {
      id: "direct",
      title: "Direct sales",
      fields: [
        { id: "directPrice", label: "Price per pair", type: "currency", defaultValue: 150, min: 0 },
        { id: "directVarCost", label: "Variable cost per pair", type: "currency", defaultValue: 65, min: 0 },
        { id: "directFixed", label: "Monthly fixed cost", type: "currency", defaultValue: 25000, min: 0, step: 1000, helpText: "Sales time, travel, samples attributable to this channel." },
      ],
    },
    {
      id: "partner",
      title: "Partnerships",
      fields: [
        { id: "partnerPrice", label: "Price per pair", type: "currency", defaultValue: 130, min: 0 },
        { id: "partnerVarCost", label: "Variable cost per pair", type: "currency", defaultValue: 65, min: 0 },
        { id: "partnerFixed", label: "Monthly fixed cost", type: "currency", defaultValue: 10000, min: 0, step: 1000 },
      ],
    },
    {
      id: "reseller",
      title: "Resellers",
      fields: [
        { id: "resellerPrice", label: "Price per pair", type: "currency", defaultValue: 110, min: 0 },
        { id: "resellerVarCost", label: "Variable cost per pair", type: "currency", defaultValue: 65, min: 0 },
        { id: "resellerFixed", label: "Monthly fixed cost", type: "currency", defaultValue: 5000, min: 0, step: 1000 },
      ],
    },
  ],
  compute: (i) => {
    const be = (price: number, varCost: number, fixed: number) => {
      const cm = price - varCost;
      return cm > 0 ? fixed / cm : Infinity;
    };
    return {
      directBreakeven: be(i.directPrice || 0, i.directVarCost || 0, i.directFixed || 0),
      partnerBreakeven: be(i.partnerPrice || 0, i.partnerVarCost || 0, i.partnerFixed || 0),
      resellerBreakeven: be(i.resellerPrice || 0, i.resellerVarCost || 0, i.resellerFixed || 0),
      directCM: (i.directPrice || 0) - (i.directVarCost || 0),
      partnerCM: (i.partnerPrice || 0) - (i.partnerVarCost || 0),
      resellerCM: (i.resellerPrice || 0) - (i.resellerVarCost || 0),
    };
  },
  outputs: [
    { id: "directBreakeven", label: "Direct: breakeven pairs/mo", format: "number", emphasis: true },
    { id: "partnerBreakeven", label: "Partnerships: breakeven pairs/mo", format: "number" },
    { id: "resellerBreakeven", label: "Resellers: breakeven pairs/mo", format: "number" },
    { id: "directCM", label: "Direct margin per pair", format: "currency" },
    { id: "partnerCM", label: "Partner margin per pair", format: "currency" },
    { id: "resellerCM", label: "Reseller margin per pair", format: "currency" },
  ],
  chart: (_i, o) => ({
    title: "Breakeven volume by channel (pairs / month)",
    type: "bar",
    labels: CHANNELS.map((c) => c.label),
    series: [
      {
        name: "Breakeven pairs",
        color: "#5C7A4F",
        values: [
          isFinite(o.directBreakeven) ? Math.ceil(o.directBreakeven) : 0,
          isFinite(o.partnerBreakeven) ? Math.ceil(o.partnerBreakeven) : 0,
          isFinite(o.resellerBreakeven) ? Math.ceil(o.resellerBreakeven) : 0,
        ],
      },
    ],
    format: "number",
  }),
};

export const goToMarketCalculators = [
  penetrationCalculator,
  repeatOrderCalculator,
  breakevenCalculator,
];
