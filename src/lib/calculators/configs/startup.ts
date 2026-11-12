// Startup planning calculators: sales, fundraising, working capital, production
// yield and sensitivity. Each is a pure function of its inputs (AGENTS.md §4.3).
//
// Rules held across this file: a division by zero (or by a negative) returns 0,
// never NaN or Infinity; percentages are 0–100; money is PHP.
// Default values are ILLUSTRATIVE starting points, not Bughaw's real numbers —
// every field that needs a researched figure says so in its help text.

import { CHART } from "@/lib/chartTheme";
import { priceForQty, sortedTiers, unitsToNextTier, type PriceTier } from "@/lib/pricing";
import type { CalculatorConfig } from "../types";

const num = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/** a ÷ b, or 0 when b is not positive. */
const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);
const pct = (v: number | undefined): number => Math.min(100, Math.max(0, num(v)));

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export function salesVelocity(i: Record<string, number>) {
  const opportunities = Math.max(0, num(i.opportunities));
  const dealValue = Math.max(0, num(i.avgDealValue));
  const winRate = pct(i.winRatePct) / 100;
  const cycleDays = num(i.salesCycleDays);
  const expectedWins = opportunities * winRate;
  const expectedRevenue = expectedWins * dealValue;
  const velocityPerDay = ratio(expectedRevenue, cycleDays);
  return {
    expectedWins,
    expectedRevenue,
    velocityPerDay,
    velocityPerMonth: velocityPerDay * 30,
  };
}

export const salesVelocityCalculator: CalculatorConfig = {
  id: "sales-velocity",
  category: "go-to-market",
  name: "Sales Velocity",
  description: "How many pesos of closed business your pipeline produces per day, and which lever moves it most.",
  icon: "timer",
  inputGroups: [
    {
      id: "pipeline",
      title: "Pipeline",
      fields: [
        { id: "opportunities", label: "Qualified opportunities", type: "number", defaultValue: 10, min: 0, step: 1 },
        { id: "avgDealValue", label: "Average deal value", type: "currency", defaultValue: 150000, min: 0, step: 10000 },
        { id: "winRatePct", label: "Win rate", type: "percentage", defaultValue: 25, min: 0, max: 100, helpText: "Use your measured rate once you have closed deals; until then this is a guess." },
        { id: "salesCycleDays", label: "Sales cycle (days)", type: "number", defaultValue: 60, min: 1, step: 5, helpText: "First contact to purchase order." },
      ],
    },
  ],
  compute: salesVelocity,
  outputs: [
    { id: "velocityPerMonth", label: "Velocity per month", format: "currency", emphasis: true, note: "Opportunities × win rate × deal value ÷ cycle days, × 30." },
    { id: "velocityPerDay", label: "Velocity per day", format: "currency" },
    { id: "expectedWins", label: "Expected wins", format: "number" },
    { id: "expectedRevenue", label: "Expected revenue from this pipeline", format: "currency" },
  ],
};

const FORECAST_STAGES = [
  { key: "new", label: "New", count: 8, value: 100000, prob: 5 },
  { key: "ack", label: "Acknowledged", count: 5, value: 100000, prob: 10 },
  { key: "qual", label: "Qualified", count: 3, value: 150000, prob: 30 },
  { key: "pilot", label: "Pilot Scoping", count: 2, value: 200000, prob: 60 },
] as const;

export function pipelineForecast(i: Record<string, number>) {
  const out: Record<string, number> = {};
  let unweighted = 0;
  let weighted = 0;
  for (const s of FORECAST_STAGES) {
    const total = Math.max(0, num(i[`${s.key}Count`])) * Math.max(0, num(i[`${s.key}Value`]));
    const w = total * (pct(i[`${s.key}Prob`]) / 100);
    out[`${s.key}Weighted`] = w;
    unweighted += total;
    weighted += w;
  }
  const target = Math.max(0, num(i.targetRevenue));
  return {
    ...out,
    unweightedTotal: unweighted,
    weightedForecast: weighted,
    coverageRatio: ratio(unweighted, target),
    gapToTarget: Math.max(0, target - weighted),
  };
}

export const pipelineForecastCalculator: CalculatorConfig = {
  id: "pipeline-forecast",
  category: "go-to-market",
  name: "Pipeline Forecast",
  description: "Stage-weighted revenue forecast from your funnel, against the revenue you need to hit.",
  icon: "route",
  inputGroups: [
    ...FORECAST_STAGES.map((s) => ({
      id: s.key,
      title: s.label,
      fields: [
        { id: `${s.key}Count`, label: "Deals", type: "number" as const, defaultValue: s.count, min: 0, step: 1 },
        { id: `${s.key}Value`, label: "Average deal value", type: "currency" as const, defaultValue: s.value, min: 0, step: 10000 },
        { id: `${s.key}Prob`, label: "Chance of closing", type: "percentage" as const, defaultValue: s.prob, min: 0, max: 100, helpText: "Placeholder. Replace with the share of past deals that reached close from this stage." },
      ],
    })),
    {
      id: "target",
      title: "Goal",
      fields: [
        { id: "targetRevenue", label: "Revenue target for the period", type: "currency", defaultValue: 500000, min: 0, step: 50000 },
      ],
    },
  ],
  compute: pipelineForecast,
  outputs: [
    { id: "weightedForecast", label: "Weighted forecast", format: "currency", emphasis: true },
    { id: "unweightedTotal", label: "Total open pipeline", format: "currency" },
    { id: "coverageRatio", label: "Pipeline coverage of target", format: "ratio", note: "A common rule of thumb is 3× or more." },
    { id: "gapToTarget", label: "Gap between forecast and target", format: "currency" },
  ],
  chart: (_i, o) => ({
    title: "Weighted forecast by stage",
    type: "bar",
    labels: FORECAST_STAGES.map((s) => s.label),
    series: [{ name: "Weighted value", color: CHART.green, values: FORECAST_STAGES.map((s) => o[`${s.key}Weighted`]) }],
    format: "currency",
  }),
  verdict: (i, o) => {
    if (num(i.targetRevenue) <= 0) return { ok: true, text: "Enter a revenue target to compare the forecast against it." };
    return o.weightedForecast >= num(i.targetRevenue)
      ? { ok: true, text: "The weighted forecast covers the target." }
      : { ok: false, text: "The weighted forecast falls short of the target. Add pipeline or raise the chance of closing." };
  },
};

// ---------------------------------------------------------------------------
// Pricing and cost
// ---------------------------------------------------------------------------

export const VOLUME_MARGIN_GATE_PCT = 30;

export function volumePricing(i: Record<string, number>) {
  const tiers: PriceTier[] = [1, 2, 3].map((n) => ({ minQty: num(i[`tier${n}Min`]), unitPrice: num(i[`tier${n}Price`]) }));
  const qty = Math.max(0, num(i.orderQty));
  const cost = Math.max(0, num(i.unitCost));
  const hit = priceForQty(tiers, qty);
  const price = hit ? hit.tier.unitPrice : 0;
  const marginAt = (p: number) => (p > 0 ? ((p - cost) / p) * 100 : 0);
  const revenue = price * qty;
  return {
    appliedUnitPrice: price,
    revenue,
    grossProfit: hit ? (price - cost) * qty : 0,
    marginPct: marginAt(price),
    tier1MarginPct: marginAt(num(i.tier1Price)),
    tier2MarginPct: marginAt(num(i.tier2Price)),
    tier3MarginPct: marginAt(num(i.tier3Price)),
    unitsToNextTier: unitsToNextTier(tiers, qty),
    tiersInUse: sortedTiers(tiers).length,
  };
}

export const volumePricingCalculator: CalculatorConfig = {
  id: "volume-pricing",
  category: "unit-economics",
  name: "Volume Price Tiers",
  description: "What price an order qualifies for, and what each tier leaves you per pair.",
  icon: "tag",
  inputGroups: [
    {
      id: "order",
      title: "Order",
      fields: [
        { id: "orderQty", label: "Order quantity (pairs)", type: "number", defaultValue: 300, min: 0, step: 10 },
        { id: "unitCost", label: "Cost per pair", type: "currency", defaultValue: 60, min: 0, step: 1, helpText: "Fully loaded: materials, labour, packaging." },
      ],
    },
    ...[
      { n: 1, min: 50, price: 140 },
      { n: 2, min: 200, price: 125 },
      { n: 3, min: 500, price: 110 },
    ].map(({ n, min, price }) => ({
      id: `tier${n}`,
      title: `Tier ${n}`,
      fields: [
        { id: `tier${n}Min`, label: "From quantity", type: "number" as const, defaultValue: min, min: 0, step: 10, helpText: n === 1 ? "Illustrative tiers. Enter your real minimum order and breaks. A tier left at 0 is ignored." : undefined },
        { id: `tier${n}Price`, label: "Price per pair", type: "currency" as const, defaultValue: price, min: 0, step: 1 },
      ],
    })),
  ],
  compute: volumePricing,
  outputs: [
    { id: "appliedUnitPrice", label: "Price per pair for this order", format: "currency", emphasis: true, note: "0 means the quantity is below every tier (under the minimum order)." },
    { id: "revenue", label: "Order revenue", format: "currency" },
    { id: "grossProfit", label: "Order gross profit", format: "currency" },
    { id: "marginPct", label: "Margin on this order", format: "percentage" },
    { id: "unitsToNextTier", label: "Pairs to reach the next tier", format: "number" },
    { id: "tier1MarginPct", label: "Tier 1 margin", format: "percentage" },
    { id: "tier2MarginPct", label: "Tier 2 margin", format: "percentage" },
    { id: "tier3MarginPct", label: "Tier 3 margin", format: "percentage" },
  ],
  chart: (_i, o) => ({
    title: "Margin by tier",
    type: "bar",
    labels: ["Tier 1", "Tier 2", "Tier 3"],
    series: [{ name: "Margin", color: CHART.green, values: [o.tier1MarginPct, o.tier2MarginPct, o.tier3MarginPct] }],
    format: "percentage",
  }),
  verdict: (_i, o) => {
    if (o.appliedUnitPrice <= 0) return { ok: false, text: "This quantity is below the minimum order, so no price applies." };
    return o.marginPct >= VOLUME_MARGIN_GATE_PCT
      ? { ok: true, text: `Margin is at or above the ${VOLUME_MARGIN_GATE_PCT}% gate.` }
      : { ok: false, text: `Margin is below the ${VOLUME_MARGIN_GATE_PCT}% gate. Raise this tier's price or cut the cost per pair.` };
  },
};

export function landedCost(i: Record<string, number>) {
  const units = Math.max(0, num(i.unitsPerDelivery));
  const product = Math.max(0, num(i.unitProductCost));
  const packaging = Math.max(0, num(i.packagingPerUnit));
  const freight = Math.max(0, num(i.freightPerDelivery));
  const handling = Math.max(0, num(i.handlingPerDelivery));
  const price = Math.max(0, num(i.sellingPrice));
  const deliveryTotalCost = (product + packaging) * units + freight + handling;
  const landedCostPerUnit = ratio(deliveryTotalCost, units);
  return {
    landedCostPerUnit,
    deliveryTotalCost,
    deliveryRevenue: price * units,
    marginPerUnit: price - landedCostPerUnit,
    marginPct: price > 0 && units > 0 ? ((price - landedCostPerUnit) / price) * 100 : 0,
    freightSharePct: ratio(freight + handling, deliveryTotalCost) * 100,
  };
}

export const landedCostCalculator: CalculatorConfig = {
  id: "landed-cost",
  category: "unit-economics",
  name: "Landed Cost per Delivery",
  description: "True cost per pair once freight and handling for one delivery are spread over the order.",
  icon: "package",
  inputGroups: [
    {
      id: "product",
      title: "Product",
      fields: [
        { id: "unitProductCost", label: "Product cost per pair", type: "currency", defaultValue: 55, min: 0, step: 1 },
        { id: "packagingPerUnit", label: "Packaging per pair", type: "currency", defaultValue: 5, min: 0, step: 1 },
        { id: "sellingPrice", label: "Selling price per pair", type: "currency", defaultValue: 125, min: 0, step: 1 },
      ],
    },
    {
      id: "delivery",
      title: "One delivery",
      fields: [
        { id: "unitsPerDelivery", label: "Pairs in the delivery", type: "number", defaultValue: 300, min: 0, step: 10 },
        { id: "freightPerDelivery", label: "Freight for the delivery", type: "currency", defaultValue: 4500, min: 0, step: 100 },
        { id: "handlingPerDelivery", label: "Handling, permits, other", type: "currency", defaultValue: 800, min: 0, step: 100 },
      ],
    },
  ],
  compute: landedCost,
  outputs: [
    { id: "landedCostPerUnit", label: "Landed cost per pair", format: "currency", emphasis: true },
    { id: "marginPerUnit", label: "Margin per pair", format: "currency" },
    { id: "marginPct", label: "Margin", format: "percentage" },
    { id: "deliveryTotalCost", label: "Total cost of the delivery", format: "currency" },
    { id: "freightSharePct", label: "Freight and handling share of cost", format: "percentage", note: "A high share means small orders are costing you margin." },
  ],
  verdict: (_i, o) =>
    o.marginPct >= VOLUME_MARGIN_GATE_PCT
      ? { ok: true, text: `Margin after freight clears the ${VOLUME_MARGIN_GATE_PCT}% gate.` }
      : { ok: false, text: `Margin after freight is under the ${VOLUME_MARGIN_GATE_PCT}% gate. Set a minimum order or charge for delivery.` },
};

// ---------------------------------------------------------------------------
// Market sizing and fundraising
// ---------------------------------------------------------------------------

export function marketSize(i: Record<string, number>) {
  const properties = Math.max(0, num(i.totalProperties));
  const spend = Math.max(0, num(i.annualSpendPerProperty));
  const reach = pct(i.reachablePct) / 100;
  const share = pct(i.obtainablePct) / 100;
  const tam = properties * spend;
  const sam = tam * reach;
  return {
    tam,
    sam,
    som: sam * share,
    somProperties: properties * reach * share,
  };
}

export const marketSizeCalculator: CalculatorConfig = {
  id: "market-size",
  category: "go-to-market",
  name: "TAM / SAM / SOM",
  description: "Bottom-up market size: how many properties could buy, how many you can reach, how many you can win.",
  icon: "hotel",
  inputGroups: [
    {
      id: "market",
      title: "Market",
      fields: [
        { id: "totalProperties", label: "Properties that could buy", type: "number", defaultValue: 1000, min: 0, step: 50, helpText: "Hotels, resorts and spas you can name and count. The default is a placeholder; replace it with a researched figure." },
        { id: "annualSpendPerProperty", label: "Annual spend per property", type: "currency", defaultValue: 60000, min: 0, step: 5000, helpText: "Pairs per year × price. Build it from a real property's room count." },
      ],
    },
    {
      id: "capture",
      title: "Reach and share",
      fields: [
        { id: "reachablePct", label: "Share you can reach", type: "percentage", defaultValue: 30, min: 0, max: 100, helpText: "By region, channel and sales capacity." },
        { id: "obtainablePct", label: "Share of reachable you can win", type: "percentage", defaultValue: 10, min: 0, max: 100 },
      ],
    },
  ],
  compute: marketSize,
  outputs: [
    { id: "tam", label: "TAM — total market", format: "currency" },
    { id: "sam", label: "SAM — serviceable market", format: "currency" },
    { id: "som", label: "SOM — obtainable market", format: "currency", emphasis: true },
    { id: "somProperties", label: "Properties you would need to win for SOM", format: "number", note: "Investors check that you can name this many." },
  ],
  chart: (_i, o) => ({
    title: "Market funnel",
    type: "bar",
    labels: ["TAM", "SAM", "SOM"],
    series: [{ name: "Annual value", color: CHART.green, values: [o.tam, o.sam, o.som] }],
    format: "currency",
  }),
};

export function capTable(i: Record<string, number>) {
  const pre = Math.max(0, num(i.preMoney));
  const raise = Math.max(0, num(i.raiseAmount));
  const post = pre + raise;
  const investor = ratio(raise, post);
  const pool = pct(i.poolPct) / 100;
  const existing = Math.max(0, 1 - investor - pool);
  const foundersPre = pct(i.foundersPrePct) / 100;
  const foundersPost = foundersPre * existing;
  return {
    postMoney: post,
    investorPct: investor * 100,
    poolPct: pool * 100,
    foundersPct: foundersPost * 100,
    foundersDilutionPts: (foundersPre - foundersPost) * 100,
    foundersStakeValue: foundersPost * post,
  };
}

export const capTableCalculator: CalculatorConfig = {
  id: "cap-table",
  category: "financial",
  name: "Round Dilution",
  description: "Who owns what after a priced round, including a new employee option pool.",
  icon: "gem",
  inputGroups: [
    {
      id: "round",
      title: "The round",
      fields: [
        { id: "preMoney", label: "Pre-money valuation", type: "currency", defaultValue: 20000000, min: 0, step: 1000000 },
        { id: "raiseAmount", label: "Amount raised", type: "currency", defaultValue: 4000000, min: 0, step: 500000 },
        { id: "poolPct", label: "Option pool after the round", type: "percentage", defaultValue: 10, min: 0, max: 100, helpText: "Share of the post-money company set aside for staff. Taken from existing holders, before the investor." },
      ],
    },
    {
      id: "before",
      title: "Before the round",
      fields: [
        { id: "foundersPrePct", label: "Founders own", type: "percentage", defaultValue: 100, min: 0, max: 100, helpText: "Of the company before this round, assuming no earlier investors." },
      ],
    },
  ],
  compute: capTable,
  outputs: [
    { id: "foundersPct", label: "Founders own after", format: "percentage", emphasis: true },
    { id: "investorPct", label: "New investor owns", format: "percentage" },
    { id: "poolPct", label: "Option pool", format: "percentage" },
    { id: "foundersDilutionPts", label: "Founder dilution", format: "percentage", note: "Percentage points given up." },
    { id: "postMoney", label: "Post-money valuation", format: "currency" },
    { id: "foundersStakeValue", label: "Value of founders' stake", format: "currency" },
  ],
  chart: (_i, o) => ({
    title: "Ownership after the round",
    type: "bar",
    labels: ["Founders", "Investor", "Option pool"],
    series: [{ name: "Ownership", color: CHART.green, values: [o.foundersPct, o.investorPct, o.poolPct] }],
    format: "percentage",
  }),
  verdict: (_i, o) =>
    o.foundersPct >= 50
      ? { ok: true, text: "Founders keep a majority after the round." }
      : { ok: false, text: "Founders fall below 50%. Check that you are comfortable giving up control at this price." },
};

export function safeConversion(i: Record<string, number>) {
  const amount = Math.max(0, num(i.safeAmount));
  const preShares = Math.max(0, num(i.preRoundShares));
  const cap = Math.max(0, num(i.valuationCap));
  const roundPre = Math.max(0, num(i.roundPreMoney));
  const discount = pct(i.discountPct) / 100;
  const roundPrice = ratio(roundPre, preShares);
  const capPrice = cap > 0 ? ratio(cap, preShares) : 0;
  const discountPrice = roundPrice * (1 - discount);
  const candidates = [capPrice, discountPrice].filter((p) => p > 0);
  const conversionPrice = candidates.length ? Math.min(...candidates) : roundPrice;
  const shares = ratio(amount, conversionPrice);
  return {
    roundPrice,
    conversionPrice,
    safeShares: shares,
    safeOwnershipPct: ratio(shares, shares + preShares) * 100,
    discountToRoundPct: roundPrice > 0 ? (1 - conversionPrice / roundPrice) * 100 : 0,
  };
}

export const safeConversionCalculator: CalculatorConfig = {
  id: "safe-conversion",
  category: "financial",
  name: "SAFE Conversion",
  description: "How many shares a SAFE turns into at the next priced round, using the better of cap and discount.",
  icon: "key-round",
  inputGroups: [
    {
      id: "safe",
      title: "The SAFE",
      fields: [
        { id: "safeAmount", label: "SAFE amount", type: "currency", defaultValue: 1000000, min: 0, step: 100000 },
        { id: "valuationCap", label: "Valuation cap", type: "currency", defaultValue: 15000000, min: 0, step: 1000000, helpText: "Leave at 0 if the SAFE has no cap." },
        { id: "discountPct", label: "Discount", type: "percentage", defaultValue: 20, min: 0, max: 100, helpText: "Leave at 0 if there is no discount." },
      ],
    },
    {
      id: "round",
      title: "The priced round",
      fields: [
        { id: "roundPreMoney", label: "Pre-money valuation", type: "currency", defaultValue: 20000000, min: 0, step: 1000000 },
        { id: "preRoundShares", label: "Shares outstanding before the round", type: "number", defaultValue: 10000000, min: 0, step: 100000 },
      ],
    },
  ],
  compute: safeConversion,
  outputs: [
    { id: "conversionPrice", label: "SAFE converts at (per share)", format: "currency", emphasis: true },
    { id: "roundPrice", label: "Round price per share", format: "currency" },
    { id: "safeShares", label: "Shares issued to the SAFE holder", format: "number" },
    { id: "safeOwnershipPct", label: "SAFE holder owns, before the new money", format: "percentage" },
    { id: "discountToRoundPct", label: "Effective discount to the round", format: "percentage" },
  ],
  verdict: () => ({
    ok: true,
    text: "Simplified: treats the cap as a price on pre-round shares. Your SAFE's own wording (post-money or pre-money, pool treatment) decides the real number, so have a lawyer confirm it.",
  }),
};

export function useOfFunds(i: Record<string, number>) {
  const raise = Math.max(0, num(i.raiseAmount));
  const cash = Math.max(0, num(i.cashOnHand));
  const burnNow = Math.max(0, num(i.monthlyBurnNow));
  const burnAfter = Math.max(0, num(i.monthlyBurnAfter));
  const shares = {
    inventory: pct(i.inventoryPct),
    team: pct(i.teamPct),
    marketing: pct(i.marketingPct),
    operations: pct(i.operationsPct),
    reserve: pct(i.reservePct),
  };
  const allocated = Object.values(shares).reduce((a, b) => a + b, 0);
  return {
    inventoryAmount: (raise * shares.inventory) / 100,
    teamAmount: (raise * shares.team) / 100,
    marketingAmount: (raise * shares.marketing) / 100,
    operationsAmount: (raise * shares.operations) / 100,
    reserveAmount: (raise * shares.reserve) / 100,
    allocatedPct: allocated,
    unallocatedPct: 100 - allocated,
    runwayBefore: ratio(cash, burnNow),
    runwayAfter: ratio(cash + raise, burnAfter),
  };
}

export const useOfFundsCalculator: CalculatorConfig = {
  id: "use-of-funds",
  category: "financial",
  name: "Use of Funds",
  description: "Split a raise across inventory, team, marketing and reserve, and see the runway it buys.",
  icon: "wallet",
  inputGroups: [
    {
      id: "money",
      title: "Money and burn",
      fields: [
        { id: "raiseAmount", label: "Amount raised", type: "currency", defaultValue: 3000000, min: 0, step: 250000 },
        { id: "cashOnHand", label: "Cash on hand today", type: "currency", defaultValue: 400000, min: 0, step: 50000 },
        { id: "monthlyBurnNow", label: "Monthly burn today", type: "currency", defaultValue: 120000, min: 0, step: 10000 },
        { id: "monthlyBurnAfter", label: "Monthly burn after the raise", type: "currency", defaultValue: 250000, min: 0, step: 10000, helpText: "Include the hires and spend the raise pays for." },
      ],
    },
    {
      id: "allocation",
      title: "Allocation (should total 100%)",
      fields: [
        { id: "inventoryPct", label: "Inventory and production", type: "percentage", defaultValue: 35, min: 0, max: 100 },
        { id: "teamPct", label: "Team", type: "percentage", defaultValue: 25, min: 0, max: 100 },
        { id: "marketingPct", label: "Sales and marketing", type: "percentage", defaultValue: 20, min: 0, max: 100 },
        { id: "operationsPct", label: "Operations and compliance", type: "percentage", defaultValue: 10, min: 0, max: 100 },
        { id: "reservePct", label: "Reserve", type: "percentage", defaultValue: 10, min: 0, max: 100 },
      ],
    },
  ],
  compute: useOfFunds,
  outputs: [
    { id: "runwayAfter", label: "Runway after the raise", format: "months", emphasis: true },
    { id: "runwayBefore", label: "Runway today", format: "months" },
    { id: "allocatedPct", label: "Allocated", format: "percentage" },
    { id: "inventoryAmount", label: "Inventory and production", format: "currency" },
    { id: "teamAmount", label: "Team", format: "currency" },
    { id: "marketingAmount", label: "Sales and marketing", format: "currency" },
    { id: "operationsAmount", label: "Operations and compliance", format: "currency" },
    { id: "reserveAmount", label: "Reserve", format: "currency" },
  ],
  chart: (_i, o) => ({
    title: "Where the raise goes",
    type: "bar",
    labels: ["Inventory", "Team", "Marketing", "Operations", "Reserve"],
    series: [{ name: "Amount", color: CHART.green, values: [o.inventoryAmount, o.teamAmount, o.marketingAmount, o.operationsAmount, o.reserveAmount] }],
    format: "currency",
  }),
  verdict: (_i, o) => {
    if (Math.abs(o.unallocatedPct) > 0.01) {
      return { ok: false, text: `The allocation totals ${o.allocatedPct.toFixed(1)}%, not 100%. Adjust it before showing this to anyone.` };
    }
    return o.runwayAfter >= 18
      ? { ok: true, text: "The allocation totals 100% and the raise buys 18 months or more of runway." }
      : { ok: false, text: "The allocation totals 100%, but the runway is under 18 months. Investors usually want at least that." };
  },
};

// ---------------------------------------------------------------------------
// Working capital, production, sensitivity
// ---------------------------------------------------------------------------

export function cashConversion(i: Record<string, number>) {
  const revenue = Math.max(0, num(i.annualRevenue));
  const cogs = Math.max(0, num(i.annualCogs));
  const dio = ratio(Math.max(0, num(i.avgInventory)), cogs) * 365;
  const dso = ratio(Math.max(0, num(i.avgReceivables)), revenue) * 365;
  const dpo = ratio(Math.max(0, num(i.avgPayables)), cogs) * 365;
  return {
    dio,
    dso,
    dpo,
    cashConversionDays: dio + dso - dpo,
    workingCapital: Math.max(0, num(i.avgInventory)) + Math.max(0, num(i.avgReceivables)) - Math.max(0, num(i.avgPayables)),
  };
}

export const cashConversionCalculator: CalculatorConfig = {
  id: "cash-conversion",
  category: "product-mgmt",
  name: "Cash Conversion Cycle",
  description: "How many days your cash is tied up between paying for goods and collecting from hotels.",
  icon: "hourglass",
  inputGroups: [
    {
      id: "year",
      title: "Annual figures",
      fields: [
        { id: "annualRevenue", label: "Revenue per year", type: "currency", defaultValue: 1800000, min: 0, step: 100000 },
        { id: "annualCogs", label: "Cost of goods sold per year", type: "currency", defaultValue: 900000, min: 0, step: 100000 },
      ],
    },
    {
      id: "balances",
      title: "Typical balances",
      fields: [
        { id: "avgInventory", label: "Inventory on hand", type: "currency", defaultValue: 250000, min: 0, step: 10000 },
        { id: "avgReceivables", label: "Owed to you by hotels", type: "currency", defaultValue: 200000, min: 0, step: 10000 },
        { id: "avgPayables", label: "You owe suppliers", type: "currency", defaultValue: 90000, min: 0, step: 10000 },
      ],
    },
  ],
  compute: cashConversion,
  outputs: [
    { id: "cashConversionDays", label: "Cash conversion cycle (days)", format: "number", emphasis: true },
    { id: "dio", label: "Days of inventory", format: "number" },
    { id: "dso", label: "Days to collect", format: "number" },
    { id: "dpo", label: "Days to pay suppliers", format: "number" },
    { id: "workingCapital", label: "Cash tied up", format: "currency" },
  ],
  chart: (_i, o) => ({
    title: "Days in the cycle",
    type: "bar",
    labels: ["Inventory", "Collect", "Pay suppliers"],
    series: [{ name: "Days", color: CHART.green, values: [o.dio, o.dso, o.dpo] }],
    format: "number",
  }),
  verdict: (_i, o) =>
    o.cashConversionDays <= 60
      ? { ok: true, text: "Cash comes back within about two months. Guideline only; the right number depends on your payment terms." }
      : { ok: false, text: "Cash is tied up for more than two months (a guideline). Shorten hotel payment terms, carry less stock, or ask suppliers for longer terms." },
};

export function batchYield(i: Record<string, number>) {
  const started = Math.max(0, num(i.unitsStarted));
  const good = Math.min(started, Math.max(0, num(i.goodUnits)));
  const costEach = Math.max(0, num(i.costPerUnitStarted));
  const batchCost = started * costEach;
  return {
    yieldPct: ratio(good, started) * 100,
    scrapUnits: started - good,
    scrapCost: (started - good) * costEach,
    batchCost,
    costPerGoodUnit: ratio(batchCost, good),
  };
}

export const batchYieldCalculator: CalculatorConfig = {
  id: "batch-yield",
  category: "product-mgmt",
  name: "Batch Yield and Scrap Cost",
  description: "What a production batch really costs per sellable pair once rejects are counted.",
  icon: "flask-conical",
  inputGroups: [
    {
      id: "batch",
      title: "Batch",
      fields: [
        { id: "unitsStarted", label: "Pairs started", type: "number", defaultValue: 500, min: 0, step: 10 },
        { id: "goodUnits", label: "Pairs that passed inspection", type: "number", defaultValue: 465, min: 0, step: 10 },
        { id: "costPerUnitStarted", label: "Cost per pair started", type: "currency", defaultValue: 55, min: 0, step: 1 },
        { id: "targetYieldPct", label: "Target yield", type: "percentage", defaultValue: 92, min: 0, max: 100, helpText: "Your own quality target for this process." },
      ],
    },
  ],
  compute: (i) => ({ ...batchYield(i), targetYieldPct: pct(i.targetYieldPct) }),
  outputs: [
    { id: "costPerGoodUnit", label: "Cost per sellable pair", format: "currency", emphasis: true },
    { id: "yieldPct", label: "Yield", format: "percentage" },
    { id: "scrapUnits", label: "Rejected pairs", format: "number" },
    { id: "scrapCost", label: "Cost of rejects", format: "currency" },
    { id: "batchCost", label: "Total batch cost", format: "currency" },
  ],
  verdict: (_i, o) =>
    o.yieldPct >= o.targetYieldPct
      ? { ok: true, text: "Yield meets the target." }
      : { ok: false, text: "Yield is below the target. Each reject raises the cost of every sellable pair." },
};

export function sensitivity(i: Record<string, number>) {
  const price = Math.max(0, num(i.price));
  const cost = Math.max(0, num(i.unitCost));
  const units = Math.max(0, num(i.monthlyUnits));
  const fixed = Math.max(0, num(i.fixedCosts));
  const swing = pct(i.swingPct) / 100;
  const profit = (p: number, c: number, u: number) => (p - c) * u - fixed;
  const base = profit(price, cost, units);
  const d = (v: number) => v - base;
  const priceUp = d(profit(price * (1 + swing), cost, units));
  const priceDown = d(profit(price * (1 - swing), cost, units));
  const costUp = d(profit(price, cost * (1 + swing), units));
  const costDown = d(profit(price, cost * (1 - swing), units));
  const volUp = d(profit(price, cost, units * (1 + swing)));
  const volDown = d(profit(price, cost, units * (1 - swing)));
  return {
    baseProfit: base,
    priceUp,
    priceDown,
    costUp,
    costDown,
    volUp,
    volDown,
    biggestSwing: Math.max(Math.abs(priceUp), Math.abs(priceDown), Math.abs(costUp), Math.abs(costDown), Math.abs(volUp), Math.abs(volDown)),
  };
}

export const sensitivityCalculator: CalculatorConfig = {
  id: "sensitivity",
  category: "unit-economics",
  name: "Profit Sensitivity",
  description: "Which lever — price, cost or volume — moves monthly profit most when it shifts by the same percentage.",
  icon: "sliders-horizontal",
  inputGroups: [
    {
      id: "base",
      title: "Today",
      fields: [
        { id: "price", label: "Price per pair", type: "currency", defaultValue: 125, min: 0, step: 1 },
        { id: "unitCost", label: "Cost per pair", type: "currency", defaultValue: 60, min: 0, step: 1 },
        { id: "monthlyUnits", label: "Pairs sold per month", type: "number", defaultValue: 800, min: 0, step: 50 },
        { id: "fixedCosts", label: "Fixed costs per month", type: "currency", defaultValue: 30000, min: 0, step: 5000 },
      ],
    },
    {
      id: "swing",
      title: "How far each lever moves",
      fields: [
        { id: "swingPct", label: "Change tested (±)", type: "percentage", defaultValue: 10, min: 0, max: 100 },
      ],
    },
  ],
  compute: sensitivity,
  outputs: [
    { id: "baseProfit", label: "Monthly profit today", format: "currency", emphasis: true },
    { id: "biggestSwing", label: "Largest swing from one lever", format: "currency" },
    { id: "priceDown", label: "Profit change if price falls", format: "currency" },
    { id: "costUp", label: "Profit change if cost rises", format: "currency" },
    { id: "volDown", label: "Profit change if volume falls", format: "currency" },
  ],
  chart: (i, o) => {
    const s = `${pct(i.swingPct)}%`;
    return {
      title: "Change in monthly profit",
      type: "bar",
      labels: ["Price", "Cost per pair", "Volume"],
      series: [
        { name: `+${s}`, color: CHART.green, values: [o.priceUp, o.costUp, o.volUp] },
        { name: `−${s}`, color: CHART.clay, values: [o.priceDown, o.costDown, o.volDown] },
      ],
      format: "currency",
    };
  },
};

export const startupCalculators = [
  salesVelocityCalculator,
  pipelineForecastCalculator,
  volumePricingCalculator,
  landedCostCalculator,
  sensitivityCalculator,
  marketSizeCalculator,
  capTableCalculator,
  safeConversionCalculator,
  useOfFundsCalculator,
  cashConversionCalculator,
  batchYieldCalculator,
];
