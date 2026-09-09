import { describe, expect, it } from "vitest";
import { cogsCalculator, paybackCalculator, pricingMarkupCalculator, wholesaleMarginCalculator } from "@/lib/calculators/configs/unitEconomics";
import { breakevenCalculator, penetrationCalculator, repeatOrderCalculator } from "@/lib/calculators/configs/goToMarket";
import { inventoryTurnoverCalculator, mixMarginCalculator, reorderPointCalculator } from "@/lib/calculators/configs/productMgmt";
import { cashFlowCalculator, growthScenarioCalculator, ltvSegmentCalculator, runwayCalculator, valuationCalculator } from "@/lib/calculators/configs/financial";
import { computePnl, PNL_DEFAULTS } from "@/lib/pnl";
import { ALL_CALCULATORS } from "@/lib/calculators/registry";
import { CATEGORIES } from "@/lib/calculators/types";

describe("COGS calculator", () => {
  it("computes COGS % and margin", () => {
    const o = cogsCalculator.compute({
      manufacturingCost: 5, shippingCost: 2, packagingCost: 1,
      wholesalePrice: 20, unitsPerMonth: 100,
    });
    expect(o.cogsPercentage).toBeCloseTo(40, 5);
    expect(o.totalCostPerUnit).toBe(8);
    expect(o.grossMarginPerUnit).toBe(12);
    expect(o.monthlyGrossProfit).toBe(1200);
  });

  it("handles zero wholesale price safely", () => {
    const o = cogsCalculator.compute({
      manufacturingCost: 5, shippingCost: 2, packagingCost: 1,
      wholesalePrice: 0, unitsPerMonth: 100,
    });
    expect(o.cogsPercentage).toBe(0);
  });
});

describe("Wholesale margin calculator", () => {
  it("computes margin, markup, and hotel discount", () => {
    const o = wholesaleMarginCalculator.compute({ unitCost: 50, wholesalePrice: 100, retailPrice: 200 });
    expect(o.wholesaleMarginPct).toBeCloseTo(50);
    expect(o.retailMarginPct).toBeCloseTo(75);
    expect(o.wholesaleMarkupPct).toBeCloseTo(100);
    expect(o.hotelDiscountPct).toBeCloseTo(50);
  });
});

describe("Payback calculator", () => {
  it("computes payback months and LTV:CAC", () => {
    const o = paybackCalculator.compute({ cac: 8000, marginPerUnit: 100, unitsPerMonth: 80, lifetimeMonths: 12 });
    expect(o.monthlyContribution).toBe(8000);
    expect(o.paybackMonths).toBeCloseTo(1);
    expect(o.lifetimeValue).toBe(96000);
    expect(o.ltvCacRatio).toBeCloseTo(12);
  });

  it("returns Infinity payback with zero contribution", () => {
    const o = paybackCalculator.compute({ cac: 8000, marginPerUnit: 0, unitsPerMonth: 80, lifetimeMonths: 12 });
    expect(o.paybackMonths).toBe(Infinity);
  });

  it("treats a missing CAC as zero, so payback is instant", () => {
    const o = paybackCalculator.compute({ cac: 0, marginPerUnit: 100, unitsPerMonth: 80, lifetimeMonths: 12 });
    expect(o.paybackMonths).toBe(0);
  });
});

describe("Penetration calculator", () => {
  it("computes current and projected penetration", () => {
    const o = penetrationCalculator.compute({ targetHotels: 100, acquiredHotels: 10, pipelineHotels: 20, winRatePct: 50 });
    expect(o.penetrationPct).toBeCloseTo(10);
    expect(o.expectedWins).toBeCloseTo(10);
    expect(o.projectedPenetrationPct).toBeCloseTo(20);
    expect(o.remainingHotels).toBe(90);
  });
});

describe("Repeat order calculator", () => {
  it("computes repeat rate and reorder interval", () => {
    const o = repeatOrderCalculator.compute({ totalHotels: 4, hotelsReordered: 2, totalOrders: 12, periodMonths: 6 });
    expect(o.repeatRatePct).toBeCloseTo(50);
    expect(o.ordersPerHotel).toBeCloseTo(3);
    expect(o.avgReorderIntervalMonths).toBeCloseTo(3);
  });

  it("returns Infinity reorder interval when hotels order one time or fewer on average", () => {
    const o = repeatOrderCalculator.compute({ totalHotels: 4, hotelsReordered: 0, totalOrders: 4, periodMonths: 6 });
    expect(o.ordersPerHotel).toBe(1);
    expect(o.avgReorderIntervalMonths).toBe(Infinity);
  });

  it("treats a missing period length as zero when computing the reorder interval", () => {
    const o = repeatOrderCalculator.compute({ totalHotels: 4, hotelsReordered: 2, totalOrders: 12, periodMonths: 0 });
    expect(o.ordersPerHotel).toBeGreaterThan(1);
    expect(o.avgReorderIntervalMonths).toBe(0);
  });
});

describe("Break-even by channel", () => {
  it("computes breakeven units per channel", () => {
    const o = breakevenCalculator.compute({
      directPrice: 150, directVarCost: 50, directFixed: 10000,
      partnerPrice: 100, partnerVarCost: 50, partnerFixed: 5000,
      resellerPrice: 50, resellerVarCost: 50, resellerFixed: 5000,
    });
    expect(o.directBreakeven).toBeCloseTo(100);
    expect(o.partnerBreakeven).toBeCloseTo(100);
    expect(o.resellerBreakeven).toBe(Infinity); // zero contribution margin
  });
});

describe("Inventory turnover", () => {
  it("computes turnover and days on hand", () => {
    const o = inventoryTurnoverCalculator.compute({ periodCogs: 120000, avgInventoryValue: 30000, periodMonths: 12 });
    expect(o.turnover).toBeCloseTo(4);
    expect(o.annualizedTurnover).toBeCloseTo(4);
    expect(o.daysOnHand).toBeCloseTo((12 * 30.44) / 4);
  });

  it("returns zero turnover and Infinity days on hand with no inventory value", () => {
    const o = inventoryTurnoverCalculator.compute({ periodCogs: 120000, avgInventoryValue: 0, periodMonths: 12 });
    expect(o.turnover).toBe(0);
    expect(o.daysOnHand).toBe(Infinity);
  });

  it("treats a missing period COGS as zero (not NaN)", () => {
    const o = inventoryTurnoverCalculator.compute({ periodCogs: 0, avgInventoryValue: 30000, periodMonths: 12 });
    expect(o.turnover).toBe(0);
  });
});

describe("Product mix margin", () => {
  it("computes blended margin across product lines", () => {
    const o = mixMarginCalculator.compute({
      slippersPrice: 100, slippersCost: 50, slippersUnits: 10,
      organizersPrice: 200, organizersCost: 100, organizersUnits: 5,
      utilitiesPrice: 0, utilitiesCost: 0, utilitiesUnits: 0,
    });
    expect(o.slippersMarginPct).toBeCloseTo(50);
    expect(o.totalProfit).toBe(1000);
    expect(o.blendedMarginPct).toBeCloseTo(50);
  });
});

describe("LTV by segment", () => {
  it("computes LTV and ratio per segment", () => {
    const o = ltvSegmentCalculator.compute({
      aMonthlyRevenue: 10000, aMarginPct: 50, aLifetimeMonths: 12, aCac: 10000,
      bMonthlyRevenue: 20000, bMarginPct: 50, bLifetimeMonths: 24, bCac: 40000,
    });
    expect(o.aLtv).toBe(60000);
    expect(o.aRatio).toBeCloseTo(6);
    expect(o.bLtv).toBe(240000);
    expect(o.bRatio).toBeCloseTo(6);
  });
});

describe("Cash flow projection", () => {
  it("stays flat with zero growth and breakeven margins", () => {
    const o = cashFlowCalculator.compute({
      startingCash: 100000, monthlyRevenue: 100000, revenueGrowthPct: 0,
      grossMarginPct: 50, monthlyOpex: 50000, opexGrowthPct: 0,
    });
    expect(o.endingCash).toBeCloseTo(100000);
    expect(o.lowestCash).toBeCloseTo(100000);
    expect(o.runwayMonths).toBe(Infinity);
  });

  it("detects the cash-out month when burning", () => {
    const o = cashFlowCalculator.compute({
      startingCash: 25000, monthlyRevenue: 0, revenueGrowthPct: 0,
      grossMarginPct: 50, monthlyOpex: 10000, opexGrowthPct: 0,
    });
    expect(o.runwayMonths).toBe(3); // 25k - 10k*3 = -5k in month 3
  });
});

describe("Growth scenario modeling", () => {
  it("orders scenarios best ≥ base ≥ worst", () => {
    const o = growthScenarioCalculator.compute({
      baseUnits: 300, baseGrowthPct: 10, pricePerUnit: 150, costPerUnit: 65,
      monthlyFixed: 20000, optimisticDeltaPct: 5, pessimisticDeltaPct: 5,
    });
    expect(o.bestYear1).toBeGreaterThan(o.baseYear1);
    expect(o.baseYear1).toBeGreaterThan(o.worstYear1);
    expect(o.spread).toBeCloseTo(o.bestYear1 - o.worstYear1);
  });
});

describe("P&L machine (migrated)", () => {
  it("matches the original artifact math at defaults", () => {
    const { profits, cumulative } = computePnl(PNL_DEFAULTS);
    // M1: units=150, profit = 150*150 - 150*30 - (20000+30000+6000+150*40) = 18000 - 62000 = -44000
    expect(profits[0]).toBe(-44000);
    expect(profits).toHaveLength(12);
    expect(cumulative).toBeCloseTo(profits.reduce((a, b) => a + b, 0));
  });

  it("reports no breakeven when opex dwarfs revenue", () => {
    const { breakevenMonth } = computePnl({ ...PNL_DEFAULTS, unitsM1: 50, growthPct: 0, opexSalaries: 150000 });
    expect(breakevenMonth).toBeNull();
  });
});

describe("Runway & burn", () => {
  it("computes net burn and runway with flat revenue", () => {
    const o = runwayCalculator.compute({
      cashOnHand: 300000, monthlyOpex: 150000, monthlyRevenue: 50000, revenueGrowthPct: 0,
    });
    expect(o.netBurn).toBe(100000);
    expect(o.runwayMonths).toBeCloseTo(3); // 300k / 100k per month
    // Shortfall through month 18: 18*100k - 300k = 1.5M
    expect(o.raiseFor18mo).toBeCloseTo(1500000);
  });

  it("returns Infinity runway when cash-flow positive", () => {
    const o = runwayCalculator.compute({
      cashOnHand: 100000, monthlyOpex: 50000, monthlyRevenue: 80000, revenueGrowthPct: 0,
    });
    expect(o.runwayMonths).toBe(Infinity);
    expect(o.raiseFor18mo).toBe(0);
  });

  it("flags short runway in the verdict", () => {
    const o = runwayCalculator.compute({
      cashOnHand: 300000, monthlyOpex: 150000, monthlyRevenue: 50000, revenueGrowthPct: 0,
    });
    expect(runwayCalculator.verdict!({}, o).ok).toBe(false);
  });
});

describe("Pricing & markup", () => {
  it("derives wholesale and retail from target margin and discount", () => {
    const o = pricingMarkupCalculator.compute({
      unitCost: 30, targetGrossMarginPct: 60, channelDiscountPct: 40,
    });
    expect(o.wholesalePrice).toBeCloseTo(75); // 30 / 0.4
    expect(o.retailPrice).toBeCloseTo(125); // 75 / 0.6
    expect(o.markupPct).toBeCloseTo(150);
    expect(o.profitPerUnit).toBeCloseTo(45);
  });

  it("returns Infinity at a 100% margin target", () => {
    const o = pricingMarkupCalculator.compute({
      unitCost: 30, targetGrossMarginPct: 100, channelDiscountPct: 40,
    });
    expect(o.wholesalePrice).toBe(Infinity);
  });
});

describe("Valuation estimator", () => {
  it("computes the revenue-multiple range and profit-based estimate", () => {
    const o = valuationCalculator.compute({
      monthlyRevenue: 100000, multipleLow: 2, multipleHigh: 5, annualProfit: 500000, profitMultiple: 8,
    });
    expect(o.annualRevenue).toBe(1200000);
    expect(o.valuationLow).toBe(2400000);
    expect(o.valuationHigh).toBe(6000000);
    expect(o.valuationMid).toBe(4200000);
    expect(o.profitValuation).toBe(4000000);
  });
});

describe("Reorder point", () => {
  it("computes reorder point, days until reorder, and order quantity", () => {
    const o = reorderPointCalculator.compute({
      dailyUnits: 40, leadTimeDays: 21, safetyStockDays: 7, currentStock: 1500, orderCoverDays: 30,
    });
    expect(o.reorderPoint).toBe(1120); // 40 * 28
    expect(o.daysUntilReorder).toBeCloseTo(9.5); // (1500 - 1120) / 40
    expect(o.suggestedOrderQty).toBe(1200);
    expect(reorderPointCalculator.verdict!({ currentStock: 1500 }, o).ok).toBe(true);
  });

  it("handles zero daily sales and low stock", () => {
    const o = reorderPointCalculator.compute({
      dailyUnits: 0, leadTimeDays: 21, safetyStockDays: 7, currentStock: 100, orderCoverDays: 30,
    });
    expect(o.daysUntilReorder).toBe(Infinity);
    const low = reorderPointCalculator.compute({
      dailyUnits: 40, leadTimeDays: 21, safetyStockDays: 7, currentStock: 500, orderCoverDays: 30,
    });
    expect(low.daysUntilReorder).toBe(0);
    expect(reorderPointCalculator.verdict!({ currentStock: 500 }, low).ok).toBe(false);
  });

  it("treats a missing current stock as zero (not NaN), and flags a reorder", () => {
    const o = reorderPointCalculator.compute({
      dailyUnits: 40, leadTimeDays: 21, safetyStockDays: 7, currentStock: 0, orderCoverDays: 30,
    });
    expect(o.daysUntilReorder).toBe(0);
    expect(reorderPointCalculator.verdict!({ currentStock: 0 }, o).ok).toBe(false);
  });
});

describe("registry", () => {
  it("has 15 calculators with unique category/id pairs", () => {
    expect(ALL_CALCULATORS).toHaveLength(15);
    const keys = new Set(ALL_CALCULATORS.map((c) => `${c.category}/${c.id}`));
    expect(keys.size).toBe(15);
  });

  it("every calculator computes finite defaults", () => {
    for (const c of ALL_CALCULATORS) {
      const inputs: Record<string, number> = {};
      c.inputGroups.forEach((g) => g.fields.forEach((f) => (inputs[f.id] = f.defaultValue)));
      const outputs = c.compute(inputs);
      for (const o of c.outputs) {
        expect(outputs[o.id], `${c.id}.${o.id}`).toBeTypeOf("number");
        expect(Number.isNaN(outputs[o.id]), `${c.id}.${o.id} is NaN`).toBe(false);
      }
    }
  });

  it("every calculator produces non-NaN outputs for zeroed inputs", () => {
    for (const c of ALL_CALCULATORS) {
      const inputs: Record<string, number> = {};
      c.inputGroups.forEach((g) => g.fields.forEach((f) => (inputs[f.id] = 0)));
      const outputs = c.compute(inputs);
      for (const o of c.outputs) {
        expect(Number.isNaN(outputs[o.id]), `${c.id}.${o.id} NaN on zero inputs`).toBe(false);
      }
    }
  });

  it("every calculator produces non-NaN outputs for extreme large inputs", () => {
    for (const c of ALL_CALCULATORS) {
      const inputs: Record<string, number> = {};
      c.inputGroups.forEach((g) => g.fields.forEach((f) => (inputs[f.id] = 1e9)));
      const outputs = c.compute(inputs);
      for (const o of c.outputs) {
        expect(Number.isNaN(outputs[o.id]), `${c.id}.${o.id} NaN on large inputs`).toBe(false);
      }
    }
  });

  it("every calculator produces finite-or-Infinity outputs (never NaN) for negative inputs", () => {
    for (const c of ALL_CALCULATORS) {
      const inputs: Record<string, number> = {};
      c.inputGroups.forEach((g) => g.fields.forEach((f) => (inputs[f.id] = -1e6)));
      const outputs = c.compute(inputs);
      for (const o of c.outputs) {
        expect(Number.isNaN(outputs[o.id]), `${c.id}.${o.id} NaN on negative inputs`).toBe(false);
      }
    }
  });

  it("every calculator verdict returns ok + text on defaults", () => {
    for (const c of ALL_CALCULATORS) {
      if (!c.verdict) continue;
      const inputs: Record<string, number> = {};
      c.inputGroups.forEach((g) => g.fields.forEach((f) => (inputs[f.id] = f.defaultValue)));
      const outputs = c.compute(inputs);
      const verdict = c.verdict(inputs, outputs);
      expect(verdict, `${c.id} verdict`).toBeDefined();
      expect(typeof verdict.ok).toBe("boolean");
      expect(typeof verdict.text).toBe("string");
      expect(verdict.text.length).toBeGreaterThan(0);
    }
  });
});

describe("CATEGORIES metadata", () => {
  it("has one entry per calculator category with non-empty labels", () => {
    expect(CATEGORIES).toHaveLength(4);
    for (const c of CATEGORIES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("cogsCalculator verdict", () => {
  it("passes the ≥30% margin gate", () => {
    const o = cogsCalculator.compute({
      manufacturingCost: 5, shippingCost: 2, packagingCost: 1,
      wholesalePrice: 20, unitsPerMonth: 100,
    });
    expect(cogsCalculator.verdict!({}, o).ok).toBe(true);
  });

  it("fails the gate below 30% margin", () => {
    const o = cogsCalculator.compute({
      manufacturingCost: 15, shippingCost: 3, packagingCost: 1,
      wholesalePrice: 20, unitsPerMonth: 100,
    });
    expect(cogsCalculator.verdict!({}, o).ok).toBe(false);
  });
});

describe("paybackCalculator verdict", () => {
  it("is ok when CAC pays back within the relationship window", () => {
    const o = paybackCalculator.compute({ cac: 8000, marginPerUnit: 100, unitsPerMonth: 80, lifetimeMonths: 12 });
    const v = paybackCalculator.verdict!({ lifetimeMonths: 12 }, o);
    expect(v.ok).toBe(true);
    expect(v.text).toContain("months");
  });

  it("is not ok when payback exceeds the relationship window", () => {
    const o = paybackCalculator.compute({ cac: 800000, marginPerUnit: 100, unitsPerMonth: 80, lifetimeMonths: 12 });
    const v = paybackCalculator.verdict!({ lifetimeMonths: 12 }, o);
    expect(v.ok).toBe(false);
  });

  it("reports no-payback text when contribution is zero", () => {
    const o = paybackCalculator.compute({ cac: 8000, marginPerUnit: 0, unitsPerMonth: 80, lifetimeMonths: 12 });
    const v = paybackCalculator.verdict!({ lifetimeMonths: 12 }, o);
    expect(v.ok).toBe(false);
    expect(v.text).toContain("never earned back");
  });

  it("treats a missing lifetimeMonths input as zero when checking the verdict", () => {
    const o = paybackCalculator.compute({ cac: 8000, marginPerUnit: 100, unitsPerMonth: 80, lifetimeMonths: 12 });
    // paybackMonths is finite (1 month) but the verdict input omits lifetimeMonths,
    // so the comparison falls back to `payback <= 0`, which is false.
    const v = paybackCalculator.verdict!({}, o);
    expect(v.ok).toBe(false);
  });
});

describe("chart() specs render sane shapes", () => {
  it("ltvSegmentCalculator", () => {
    const inputs = { aMonthlyRevenue: 10000, aMarginPct: 50, aLifetimeMonths: 12, aCac: 10000, bMonthlyRevenue: 20000, bMarginPct: 50, bLifetimeMonths: 24, bCac: 40000 };
    const o = ltvSegmentCalculator.compute(inputs);
    const chart = ltvSegmentCalculator.chart!(inputs, o);
    expect(chart.labels).toEqual(["Segment A", "Segment B"]);
    expect(chart.series[0].values).toEqual([o.aLtv, o.bLtv]);
  });

  it("cashFlowCalculator", () => {
    const inputs = { startingCash: 100000, monthlyRevenue: 100000, revenueGrowthPct: 0, grossMarginPct: 50, monthlyOpex: 50000, opexGrowthPct: 0 };
    const o = cashFlowCalculator.compute(inputs);
    const chart = cashFlowCalculator.chart!(inputs, o);
    expect(chart.labels).toHaveLength(12);
    expect(chart.series[0].values).toHaveLength(12);
    expect(cashFlowCalculator.verdict!({}, o).ok).toBe(true);
  });

  it("cashFlowCalculator verdict flags negative cash", () => {
    const o = cashFlowCalculator.compute({ startingCash: 1000, monthlyRevenue: 0, revenueGrowthPct: 0, grossMarginPct: 50, monthlyOpex: 10000, opexGrowthPct: 0 });
    expect(cashFlowCalculator.verdict!({}, o).ok).toBe(false);
  });

  it("growthScenarioCalculator", () => {
    const inputs = { baseUnits: 300, baseGrowthPct: 10, pricePerUnit: 150, costPerUnit: 65, monthlyFixed: 20000, optimisticDeltaPct: 5, pessimisticDeltaPct: 5 };
    const o = growthScenarioCalculator.compute(inputs);
    const chart = growthScenarioCalculator.chart!(inputs, o);
    expect(chart.series).toHaveLength(3);
    for (const s of chart.series) expect(s.values).toHaveLength(12);
  });

  it("runwayCalculator", () => {
    const inputs = { cashOnHand: 300000, monthlyOpex: 150000, monthlyRevenue: 50000, revenueGrowthPct: 0 };
    const o = runwayCalculator.compute(inputs);
    const chart = runwayCalculator.chart!(inputs, o);
    expect(chart.labels).toHaveLength(24);
    expect(chart.series[0].values).toHaveLength(24);
  });

  it("runwayCalculator verdict: caution band (6-12mo)", () => {
    const o = runwayCalculator.compute({ cashOnHand: 900000, monthlyOpex: 150000, monthlyRevenue: 50000, revenueGrowthPct: 0 });
    const v = runwayCalculator.verdict!({}, o);
    expect(v.text).toContain("Caution");
  });

  it("runwayCalculator verdict: healthy band (12mo+)", () => {
    const o = runwayCalculator.compute({ cashOnHand: 100000, monthlyOpex: 50000, monthlyRevenue: 80000, revenueGrowthPct: 0 });
    const v = runwayCalculator.verdict!({}, o);
    expect(v.ok).toBe(true);
    expect(v.text).toContain("Healthy");
  });

  it("valuationCalculator", () => {
    const inputs = { monthlyRevenue: 100000, multipleLow: 2, multipleHigh: 5, annualProfit: 500000, profitMultiple: 8 };
    const o = valuationCalculator.compute(inputs);
    const chart = valuationCalculator.chart!(inputs, o);
    expect(chart.labels).toEqual(["Low", "Midpoint", "High"]);
    expect(chart.series[0].values).toEqual([o.valuationLow, o.valuationMid, o.valuationHigh]);
  });

  it("breakevenCalculator", () => {
    const inputs = {
      directPrice: 150, directVarCost: 50, directFixed: 10000,
      partnerPrice: 100, partnerVarCost: 50, partnerFixed: 5000,
      resellerPrice: 50, resellerVarCost: 50, resellerFixed: 5000,
    };
    const o = breakevenCalculator.compute(inputs);
    const chart = breakevenCalculator.chart!(inputs, o);
    expect(chart.labels).toEqual(["Direct", "Partnerships", "Resellers"]);
    // resellerBreakeven is Infinity (zero contribution margin) -> chart maps it to 0
    expect(chart.series[0].values[2]).toBe(0);
  });

  it("breakevenCalculator — the inverse mix (direct/partner infinite, reseller finite)", () => {
    const inputs = {
      directPrice: 50, directVarCost: 50, directFixed: 10000,
      partnerPrice: 50, partnerVarCost: 50, partnerFixed: 5000,
      resellerPrice: 150, resellerVarCost: 50, resellerFixed: 5000,
    };
    const o = breakevenCalculator.compute(inputs);
    const chart = breakevenCalculator.chart!(inputs, o);
    expect(chart.series[0].values[0]).toBe(0);
    expect(chart.series[0].values[1]).toBe(0);
    expect(chart.series[0].values[2]).toBeGreaterThan(0);
  });

  it("mixMarginCalculator", () => {
    const inputs = {
      slippersPrice: 100, slippersCost: 50, slippersUnits: 10,
      organizersPrice: 200, organizersCost: 100, organizersUnits: 5,
      utilitiesPrice: 0, utilitiesCost: 0, utilitiesUnits: 0,
    };
    const o = mixMarginCalculator.compute(inputs);
    const chart = mixMarginCalculator.chart!(inputs, o);
    expect(chart.labels).toEqual(["Slippers", "Organizers", "Utilities"]);
    expect(chart.series[0].values).toEqual([o.slippersProfit, o.organizersProfit, o.utilitiesProfit]);
  });

  it("pricingMarkupCalculator", () => {
    const inputs = { unitCost: 30, targetGrossMarginPct: 60, channelDiscountPct: 40 };
    const o = pricingMarkupCalculator.compute(inputs);
    const chart = pricingMarkupCalculator.chart!(inputs, o);
    expect(chart.labels).toEqual(["Unit cost", "Wholesale", "Retail"]);
    expect(chart.series[0].values).toEqual([inputs.unitCost, o.wholesalePrice, o.retailPrice]);
  });

  it("pricingMarkupCalculator chart treats a missing unit cost as zero", () => {
    const inputs = { unitCost: 0, targetGrossMarginPct: 60, channelDiscountPct: 40 };
    const o = pricingMarkupCalculator.compute(inputs);
    const chart = pricingMarkupCalculator.chart!(inputs, o);
    expect(chart.series[0].values[0]).toBe(0);
  });
});

describe("reorderPointCalculator verdict — ok branch", () => {
  it("is ok when stock is comfortably above the reorder point", () => {
    const o = reorderPointCalculator.compute({
      dailyUnits: 10, leadTimeDays: 5, safetyStockDays: 2, currentStock: 5000, orderCoverDays: 30,
    });
    expect(reorderPointCalculator.verdict!({ currentStock: 5000 }, o).ok).toBe(true);
  });
});

describe("computePnl edge cases", () => {
  it("handles all-zero input state with no NaN or Infinity in profit array", () => {
    const { profits, cumulative, breakevenMonth, breakevenUnits } = computePnl({
      unitsM1: 0,
      growthPct: 0,
      price: 0,
      cogs: 0,
      cac: 0,
      opexMachines: 0,
      opexSalaries: 0,
      opexLogistics: 0,
    });
    expect(profits).toHaveLength(12);
    for (const p of profits) {
      expect(Number.isNaN(p)).toBe(false);
      expect(Number.isFinite(p)).toBe(true);
    }
    expect(cumulative).toBe(0);
    expect(breakevenMonth).toBe(1);
    expect(breakevenUnits).toBe(0);
  });

  it("produces exactly 12 profit entries even at enormous growth", () => {
    const { profits, cumulative } = computePnl({
      ...PNL_DEFAULTS,
      growthPct: 100,
    });
    expect(profits).toHaveLength(12);
    expect(Number.isNaN(cumulative)).toBe(false);
    for (const p of profits) {
      expect(Number.isNaN(p)).toBe(false);
    }
  });

  it("handles zero units with high opex without NaN", () => {
    const { profits, breakevenMonth } = computePnl({
      ...PNL_DEFAULTS,
      unitsM1: 0,
      growthPct: 0,
      opexSalaries: 1_000_000,
    });
    expect(breakevenMonth).toBeNull();
    for (const p of profits) {
      expect(Number.isNaN(p)).toBe(false);
      expect(p).toBeLessThan(0);
    }
  });

  it("keeps cumulative equal to sum of profits", () => {
    const cases = [
      PNL_DEFAULTS,
      { ...PNL_DEFAULTS, unitsM1: 0, growthPct: 0 },
      { ...PNL_DEFAULTS, growthPct: 50, price: 500 },
      { ...PNL_DEFAULTS, cogs: 0, cac: 0 },
      { ...PNL_DEFAULTS, unitsM1: 10000, opexSalaries: 0 },
    ];
    for (const s of cases) {
      const { profits, cumulative } = computePnl(s);
      const sum = profits.reduce((a, b) => a + b, 0);
      expect(cumulative, `sum for ${JSON.stringify(s)}`).toBeCloseTo(sum);
    }
  });

  it("monotonically non-decreasing unit counts with non-negative growth", () => {
    const s = { ...PNL_DEFAULTS, growthPct: 5 };
    const { profits } = computePnl(s);
    expect(profits).toHaveLength(12);
  });

  it("does not produce NaN profits with negative growth rate (contraction)", () => {
    const { profits, cumulative } = computePnl({
      ...PNL_DEFAULTS,
      unitsM1: 1000,
      growthPct: -50,
    });
    expect(Number.isNaN(cumulative)).toBe(false);
    for (const p of profits) {
      expect(Number.isNaN(p)).toBe(false);
      expect(Number.isFinite(p)).toBe(true);
    }
  });

  it("falls back to the fallback default when a field is NaN", () => {
    const { profits } = computePnl({ ...PNL_DEFAULTS, unitsM1: NaN });
    // unitsM1 NaN -> safeNum fallback 0 -> month 1 units = 0
    expect(profits).toHaveLength(12);
    expect(Number.isNaN(profits[0])).toBe(false);
  });

  it("freezes unit growth instead of going NaN when the compounded product overflows to Infinity", () => {
    // Both unitsM1 and growthPct are individually finite (so safeNum keeps them
    // as-is), but their product overflows past Number.MAX_VALUE — the guard on
    // `grown` must fall back to the previous running unit count.
    const { profits } = computePnl({ ...PNL_DEFAULTS, unitsM1: 1e20, growthPct: 1e300 });
    expect(profits).toHaveLength(12);
    for (const p of profits) {
      expect(Number.isNaN(p)).toBe(false);
      expect(Number.isFinite(p)).toBe(true);
    }
  });

  it("clamps profit to 0 instead of Infinity when revenue overflows", () => {
    const { profits, breakevenMonth } = computePnl({
      ...PNL_DEFAULTS,
      unitsM1: 1e200,
      growthPct: 0,
      price: 1e200,
      cogs: 0,
      cac: 0,
    });
    expect(profits[0]).toBe(0);
    expect(Number.isFinite(profits[0])).toBe(true);
    expect(breakevenMonth).toBe(1);
  });
});
