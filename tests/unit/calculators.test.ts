import { describe, expect, it } from "vitest";
import { cogsCalculator, paybackCalculator, wholesaleMarginCalculator } from "@/lib/calculators/configs/unitEconomics";
import { breakevenCalculator, penetrationCalculator, repeatOrderCalculator } from "@/lib/calculators/configs/goToMarket";
import { inventoryTurnoverCalculator, mixMarginCalculator } from "@/lib/calculators/configs/productMgmt";
import { cashFlowCalculator, growthScenarioCalculator, ltvSegmentCalculator } from "@/lib/calculators/configs/financial";
import { computePnl, PNL_DEFAULTS } from "@/lib/pnl";
import { ALL_CALCULATORS } from "@/lib/calculators/registry";

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

describe("registry", () => {
  it("has 11 calculators with unique category/id pairs", () => {
    expect(ALL_CALCULATORS).toHaveLength(11);
    const keys = new Set(ALL_CALCULATORS.map((c) => `${c.category}/${c.id}`));
    expect(keys.size).toBe(11);
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
});
