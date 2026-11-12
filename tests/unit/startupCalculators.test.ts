import { describe, expect, it } from "vitest";
import { priceForQty, sortedTiers, unitsToNextTier, type PriceTier } from "@/lib/pricing";
import {
  batchYieldCalculator,
  capTableCalculator,
  cashConversionCalculator,
  landedCostCalculator,
  marketSizeCalculator,
  pipelineForecastCalculator,
  safeConversionCalculator,
  salesVelocityCalculator,
  sensitivityCalculator,
  startupCalculators,
  useOfFundsCalculator,
  volumePricingCalculator,
  VOLUME_MARGIN_GATE_PCT,
} from "@/lib/calculators/configs/startup";
import type { CalculatorConfig, Inputs } from "@/lib/calculators/types";

/** Defaults of a calculator, with overrides. */
const inputs = (c: CalculatorConfig, over: Inputs = {}): Inputs => {
  const out: Inputs = {};
  c.inputGroups.forEach((g) => g.fields.forEach((f) => (out[f.id] = f.defaultValue)));
  return { ...out, ...over };
};
const run = (c: CalculatorConfig, over: Inputs = {}) => {
  const i = inputs(c, over);
  const o = c.compute(i);
  return { i, o, verdict: c.verdict?.(i, o) };
};

describe("price tiers (src/lib/pricing.ts)", () => {
  const tiers: PriceTier[] = [
    { minQty: 500, unitPrice: 110 },
    { minQty: 50, unitPrice: 140 },
    { minQty: 200, unitPrice: 125 },
  ];
  it("picks the tier with the highest minimum not above the quantity, whatever the order", () => {
    expect(priceForQty(tiers, 50)?.tier.unitPrice).toBe(140);
    expect(priceForQty(tiers, 199)?.tier.unitPrice).toBe(140);
    expect(priceForQty(tiers, 200)?.tier.unitPrice).toBe(125);
    expect(priceForQty(tiers, 10_000)?.tier.unitPrice).toBe(110);
    expect(priceForQty(tiers, 300)?.index).toBe(1);
  });
  it("returns null below every minimum, or for a quantity that is not a positive number", () => {
    expect(priceForQty(tiers, 49)).toBeNull();
    expect(priceForQty(tiers, 0)).toBeNull();
    expect(priceForQty(tiers, -5)).toBeNull();
    expect(priceForQty(tiers, Number.NaN)).toBeNull();
    expect(priceForQty([], 100)).toBeNull();
  });
  it("ignores tiers with no minimum, no price or non-finite numbers", () => {
    const messy: PriceTier[] = [
      { minQty: 0, unitPrice: 99 },
      { minQty: 10, unitPrice: 0 },
      { minQty: Number.NaN, unitPrice: 50 },
      { minQty: 20, unitPrice: Number.POSITIVE_INFINITY },
      { minQty: 100, unitPrice: 80 },
    ];
    expect(sortedTiers(messy)).toEqual([{ minQty: 100, unitPrice: 80 }]);
    expect(priceForQty(messy, 5)).toBeNull();
  });
  it("does not change the array it is given", () => {
    const copy = tiers.map((t) => ({ ...t }));
    sortedTiers(tiers);
    priceForQty(tiers, 100);
    expect(tiers).toEqual(copy);
  });
  it("counts the units still needed for the next tier", () => {
    expect(unitsToNextTier(tiers, 30)).toBe(20);
    expect(unitsToNextTier(tiers, 300)).toBe(200);
    expect(unitsToNextTier(tiers, 99.5)).toBe(101);
    expect(unitsToNextTier(tiers, 500)).toBe(0);
    expect(unitsToNextTier(tiers, 9_999)).toBe(0);
    expect(unitsToNextTier([], 10)).toBe(0);
    expect(unitsToNextTier(tiers, Number.NaN)).toBe(50);
    expect(unitsToNextTier(tiers, -10)).toBe(50);
  });
});

describe("Sales velocity", () => {
  it("multiplies pipeline, win rate and deal value over the cycle", () => {
    const { o } = run(salesVelocityCalculator);
    expect(o.expectedWins).toBeCloseTo(2.5, 9);
    expect(o.expectedRevenue).toBeCloseTo(375_000, 6);
    expect(o.velocityPerDay).toBeCloseTo(6_250, 6);
    expect(o.velocityPerMonth).toBeCloseTo(187_500, 6);
  });
  it("returns 0, not Infinity, with no sales cycle", () => {
    const { o } = run(salesVelocityCalculator, { salesCycleDays: 0 });
    expect(o.velocityPerDay).toBe(0);
    expect(o.velocityPerMonth).toBe(0);
  });
  it("caps a win rate above 100%", () => {
    expect(run(salesVelocityCalculator, { winRatePct: 250 }).o.expectedWins).toBe(10);
  });
});

describe("Pipeline forecast", () => {
  it("weights each stage and compares the total with the target", () => {
    const { o } = run(pipelineForecastCalculator);
    expect(o.newWeighted).toBeCloseTo(40_000, 6);
    expect(o.ackWeighted).toBeCloseTo(50_000, 6);
    expect(o.qualWeighted).toBeCloseTo(135_000, 6);
    expect(o.pilotWeighted).toBeCloseTo(240_000, 6);
    expect(o.unweightedTotal).toBe(2_150_000);
    expect(o.weightedForecast).toBeCloseTo(465_000, 6);
    expect(o.coverageRatio).toBeCloseTo(4.3, 9);
    expect(o.gapToTarget).toBeCloseTo(35_000, 6);
  });
  it("says so when the forecast falls short, and when it covers the target", () => {
    expect(run(pipelineForecastCalculator).verdict?.ok).toBe(false);
    expect(run(pipelineForecastCalculator, { targetRevenue: 400_000 }).verdict?.ok).toBe(true);
    const none = run(pipelineForecastCalculator, { targetRevenue: 0 });
    expect(none.verdict?.ok).toBe(true);
    expect(none.verdict?.text).toMatch(/target/i);
    expect(none.o.coverageRatio).toBe(0);
  });
  it("draws one bar per stage", () => {
    const { i, o } = run(pipelineForecastCalculator);
    const chart = pipelineForecastCalculator.chart!(i, o);
    expect(chart.labels).toEqual(["New", "Acknowledged", "Qualified", "Pilot Scoping"]);
    expect(chart.series[0].values).toEqual([40_000, 50_000, 135_000, 240_000]);
  });
});

describe("Volume price tiers", () => {
  it("applies the tier for the order quantity and reports margins", () => {
    const { o, verdict } = run(volumePricingCalculator);
    expect(o.appliedUnitPrice).toBe(125);
    expect(o.revenue).toBe(37_500);
    expect(o.grossProfit).toBe(19_500);
    expect(o.marginPct).toBeCloseTo(52, 9);
    expect(o.tier1MarginPct).toBeCloseTo(57.142857, 5);
    expect(o.tier3MarginPct).toBeCloseTo(45.454545, 5);
    expect(o.unitsToNextTier).toBe(200);
    expect(o.tiersInUse).toBe(3);
    expect(verdict?.ok).toBe(true);
  });
  it("has no price below the minimum order, and says so", () => {
    const { o, verdict } = run(volumePricingCalculator, { orderQty: 30 });
    expect(o.appliedUnitPrice).toBe(0);
    expect(o.revenue).toBe(0);
    expect(o.grossProfit).toBe(0);
    expect(o.marginPct).toBe(0);
    expect(o.unitsToNextTier).toBe(20);
    expect(verdict?.ok).toBe(false);
    expect(verdict?.text).toMatch(/minimum order/);
  });
  it("uses the lowest price at the top tier", () => {
    const { o } = run(volumePricingCalculator, { orderQty: 500 });
    expect(o.appliedUnitPrice).toBe(110);
    expect(o.unitsToNextTier).toBe(0);
  });
  it("fails the margin gate when cost eats the price", () => {
    const { o, verdict } = run(volumePricingCalculator, { unitCost: 100 });
    expect(o.marginPct).toBeCloseTo(20, 9);
    expect(o.marginPct).toBeLessThan(VOLUME_MARGIN_GATE_PCT);
    expect(verdict?.ok).toBe(false);
  });
  it("ignores a tier left at zero", () => {
    const { o } = run(volumePricingCalculator, { tier3Min: 0, tier3Price: 0, orderQty: 900 });
    expect(o.appliedUnitPrice).toBe(125);
    expect(o.tiersInUse).toBe(2);
    expect(o.tier3MarginPct).toBe(0);
  });
});

describe("Landed cost", () => {
  it("spreads freight and handling over the delivery", () => {
    const { o, verdict } = run(landedCostCalculator);
    expect(o.deliveryTotalCost).toBe(23_300);
    expect(o.landedCostPerUnit).toBeCloseTo(77.666667, 5);
    expect(o.marginPerUnit).toBeCloseTo(47.333333, 5);
    expect(o.marginPct).toBeCloseTo(37.866667, 5);
    expect(o.freightSharePct).toBeCloseTo(22.746781, 5);
    expect(o.deliveryRevenue).toBe(37_500);
    expect(verdict?.ok).toBe(true);
  });
  it("shows a small order losing margin to freight", () => {
    const { o, verdict } = run(landedCostCalculator, { unitsPerDelivery: 20 });
    expect(o.landedCostPerUnit).toBeCloseTo(325, 9);
    expect(o.marginPct).toBeLessThan(0);
    expect(verdict?.ok).toBe(false);
  });
  it("returns zeros for an empty delivery", () => {
    const { o } = run(landedCostCalculator, { unitsPerDelivery: 0 });
    expect(o.landedCostPerUnit).toBe(0);
    expect(o.marginPct).toBe(0);
    expect(o.deliveryTotalCost).toBe(5_300);
  });
});

describe("TAM / SAM / SOM", () => {
  it("narrows from the whole market to what you can win", () => {
    const { o } = run(marketSizeCalculator);
    expect(o.tam).toBe(60_000_000);
    expect(o.sam).toBe(18_000_000);
    expect(o.som).toBe(1_800_000);
    expect(o.somProperties).toBeCloseTo(30, 9);
  });
  it("caps percentages at 100 and ignores negatives", () => {
    const { o } = run(marketSizeCalculator, { reachablePct: 500, obtainablePct: 500 });
    expect(o.som).toBe(o.tam);
    expect(run(marketSizeCalculator, { totalProperties: -4 }).o.tam).toBe(0);
  });
  it("draws TAM, SAM and SOM", () => {
    const { i, o } = run(marketSizeCalculator);
    expect(marketSizeCalculator.chart!(i, o).series[0].values).toEqual([60_000_000, 18_000_000, 1_800_000]);
  });
});

describe("Round dilution", () => {
  it("dilutes founders by the new money and the option pool", () => {
    const { o, verdict } = run(capTableCalculator);
    expect(o.postMoney).toBe(24_000_000);
    expect(o.investorPct).toBeCloseTo(16.666667, 5);
    expect(o.poolPct).toBe(10);
    expect(o.foundersPct).toBeCloseTo(73.333333, 5);
    expect(o.foundersDilutionPts).toBeCloseTo(26.666667, 5);
    expect(o.foundersStakeValue).toBeCloseTo(17_600_000, 3);
    expect(o.foundersPct + o.investorPct + o.poolPct).toBeCloseTo(100, 9);
    expect(verdict?.ok).toBe(true);
  });
  it("warns when founders drop below half", () => {
    const { o, verdict } = run(capTableCalculator, { raiseAmount: 20_000_000, poolPct: 15 });
    expect(o.foundersPct).toBeCloseTo(35, 9);
    expect(verdict?.ok).toBe(false);
  });
  it("accounts for earlier holders through the founders' starting share", () => {
    const { o } = run(capTableCalculator, { foundersPrePct: 80 });
    expect(o.foundersPct).toBeCloseTo(58.666667, 5);
  });
  it("never goes negative when investor and pool exceed 100%", () => {
    const { o } = run(capTableCalculator, { preMoney: 0, raiseAmount: 1_000_000, poolPct: 50 });
    expect(o.investorPct).toBe(100);
    expect(o.foundersPct).toBe(0);
  });
  it("returns zeros with no valuation and no raise", () => {
    const { o } = run(capTableCalculator, { preMoney: 0, raiseAmount: 0 });
    expect(o.postMoney).toBe(0);
    expect(o.investorPct).toBe(0);
  });
  it("charts three owners", () => {
    const { i, o } = run(capTableCalculator);
    expect(capTableCalculator.chart!(i, o).labels).toEqual(["Founders", "Investor", "Option pool"]);
  });
});

describe("SAFE conversion", () => {
  it("converts at the cap when the cap beats the discount", () => {
    const { o } = run(safeConversionCalculator);
    expect(o.roundPrice).toBe(2);
    expect(o.conversionPrice).toBe(1.5);
    expect(o.safeShares).toBeCloseTo(666_666.667, 2);
    expect(o.safeOwnershipPct).toBeCloseTo(6.25, 9);
    expect(o.discountToRoundPct).toBeCloseTo(25, 9);
  });
  it("converts at the discount when it beats the cap", () => {
    const { o } = run(safeConversionCalculator, { valuationCap: 40_000_000 });
    expect(o.conversionPrice).toBeCloseTo(1.6, 9);
    expect(o.discountToRoundPct).toBeCloseTo(20, 9);
  });
  it("handles a SAFE with only a cap, only a discount, or neither", () => {
    expect(run(safeConversionCalculator, { discountPct: 0 }).o.conversionPrice).toBe(1.5);
    expect(run(safeConversionCalculator, { valuationCap: 0 }).o.conversionPrice).toBeCloseTo(1.6, 9);
    const plain = run(safeConversionCalculator, { valuationCap: 0, discountPct: 0 }).o;
    expect(plain.conversionPrice).toBe(2);
    expect(plain.safeShares).toBe(500_000);
    expect(plain.discountToRoundPct).toBe(0);
  });
  it("returns zeros without a share count", () => {
    const { o } = run(safeConversionCalculator, { preRoundShares: 0 });
    expect(o.safeShares).toBe(0);
    expect(o.safeOwnershipPct).toBe(0);
  });
  it("always reminds the user it is a simplification", () => {
    expect(run(safeConversionCalculator).verdict?.text).toMatch(/lawyer/i);
  });
});

describe("Use of funds", () => {
  it("splits the raise and computes runway before and after", () => {
    const { o } = run(useOfFundsCalculator);
    expect(o.inventoryAmount).toBe(1_050_000);
    expect(o.teamAmount).toBe(750_000);
    expect(o.marketingAmount).toBe(600_000);
    expect(o.operationsAmount).toBe(300_000);
    expect(o.reserveAmount).toBe(300_000);
    expect(o.allocatedPct).toBe(100);
    expect(o.unallocatedPct).toBe(0);
    expect(o.runwayBefore).toBeCloseTo(3.333333, 5);
    expect(o.runwayAfter).toBeCloseTo(13.6, 9);
  });
  it("flags runway under 18 months", () => {
    const { verdict } = run(useOfFundsCalculator);
    expect(verdict?.ok).toBe(false);
    expect(verdict?.text).toMatch(/18 months/);
  });
  it("passes when the split is 100% and the runway is long enough", () => {
    expect(run(useOfFundsCalculator, { monthlyBurnAfter: 150_000 }).verdict?.ok).toBe(true);
  });
  it("refuses an allocation that is not 100%", () => {
    const { o, verdict } = run(useOfFundsCalculator, { reservePct: 0 });
    expect(o.allocatedPct).toBe(90);
    expect(o.unallocatedPct).toBe(10);
    expect(verdict?.ok).toBe(false);
    expect(verdict?.text).toMatch(/not 100%/);
  });
  it("returns zero runway with no burn", () => {
    const { o } = run(useOfFundsCalculator, { monthlyBurnNow: 0, monthlyBurnAfter: 0 });
    expect(o.runwayBefore).toBe(0);
    expect(o.runwayAfter).toBe(0);
  });
  it("charts five uses", () => {
    const { i, o } = run(useOfFundsCalculator);
    expect(useOfFundsCalculator.chart!(i, o).series[0].values).toEqual([1_050_000, 750_000, 600_000, 300_000, 300_000]);
  });
});

describe("Cash conversion cycle", () => {
  it("adds days of inventory and collection and subtracts days to pay", () => {
    const { o, verdict } = run(cashConversionCalculator);
    expect(o.dio).toBeCloseTo(101.388889, 5);
    expect(o.dso).toBeCloseTo(40.555556, 5);
    expect(o.dpo).toBeCloseTo(36.5, 9);
    expect(o.cashConversionDays).toBeCloseTo(105.444444, 5);
    expect(o.workingCapital).toBe(360_000);
    expect(verdict?.ok).toBe(false);
  });
  it("passes at 60 days or fewer", () => {
    const { o, verdict } = run(cashConversionCalculator, { avgInventory: 100_000, avgReceivables: 100_000 });
    expect(o.cashConversionDays).toBeLessThanOrEqual(60);
    expect(verdict?.ok).toBe(true);
  });
  it("returns zero days when there is no revenue or cost", () => {
    const { o } = run(cashConversionCalculator, { annualRevenue: 0, annualCogs: 0 });
    expect(o.dio).toBe(0);
    expect(o.dso).toBe(0);
    expect(o.dpo).toBe(0);
  });
  it("charts three legs", () => {
    const { i, o } = run(cashConversionCalculator);
    expect(cashConversionCalculator.chart!(i, o).labels).toHaveLength(3);
  });
});

describe("Batch yield", () => {
  it("costs each sellable pair including the rejects", () => {
    const { o, verdict } = run(batchYieldCalculator);
    expect(o.yieldPct).toBeCloseTo(93, 9);
    expect(o.scrapUnits).toBe(35);
    expect(o.scrapCost).toBe(1_925);
    expect(o.batchCost).toBe(27_500);
    expect(o.costPerGoodUnit).toBeCloseTo(59.139785, 5);
    expect(verdict?.ok).toBe(true);
  });
  it("flags yield below the target", () => {
    const { o, verdict } = run(batchYieldCalculator, { goodUnits: 400 });
    expect(o.yieldPct).toBe(80);
    expect(verdict?.ok).toBe(false);
  });
  it("cannot count more good pairs than were started", () => {
    const { o } = run(batchYieldCalculator, { goodUnits: 900 });
    expect(o.yieldPct).toBe(100);
    expect(o.scrapUnits).toBe(0);
  });
  it("returns zeros for an empty batch and for a batch with no good pairs", () => {
    expect(run(batchYieldCalculator, { unitsStarted: 0, goodUnits: 0 }).o.yieldPct).toBe(0);
    expect(run(batchYieldCalculator, { goodUnits: 0 }).o.costPerGoodUnit).toBe(0);
  });
});

describe("Profit sensitivity", () => {
  it("shifts each lever by the same percentage", () => {
    const { o } = run(sensitivityCalculator);
    expect(o.baseProfit).toBe(22_000);
    expect(o.priceUp).toBeCloseTo(10_000, 6);
    expect(o.priceDown).toBeCloseTo(-10_000, 6);
    expect(o.costUp).toBeCloseTo(-4_800, 6);
    expect(o.costDown).toBeCloseTo(4_800, 6);
    expect(o.volUp).toBeCloseTo(5_200, 6);
    expect(o.volDown).toBeCloseTo(-5_200, 6);
    expect(o.biggestSwing).toBeCloseTo(10_000, 6);
  });
  it("shows no movement with no swing", () => {
    const { o } = run(sensitivityCalculator, { swingPct: 0 });
    expect(o.biggestSwing).toBe(0);
  });
  it("labels the chart series with the tested percentage", () => {
    const { i, o } = run(sensitivityCalculator, { swingPct: 15 });
    const chart = sensitivityCalculator.chart!(i, o);
    expect(chart.series.map((s) => s.name)).toEqual(["+15%", "−15%"]);
    expect(chart.labels).toEqual(["Price", "Cost per pair", "Volume"]);
  });
});

describe("every startup calculator", () => {
  const fill = (c: CalculatorConfig, v: number): Inputs => {
    const out: Inputs = {};
    c.inputGroups.forEach((g) => g.fields.forEach((f) => (out[f.id] = v)));
    return out;
  };
  const finiteOutputs = (c: CalculatorConfig, i: Inputs) => {
    const o = c.compute(i);
    for (const def of c.outputs) {
      expect(Number.isFinite(o[def.id]), `${c.id}.${def.id} for ${JSON.stringify(Object.values(i)[0])}`).toBe(true);
    }
  };

  it("returns finite numbers (never NaN or Infinity) for default, zero, negative, huge and missing inputs", () => {
    for (const c of startupCalculators) {
      finiteOutputs(c, inputs(c));
      for (const v of [0, -1e6, 1e9]) finiteOutputs(c, fill(c, v));
      const o = c.compute({});
      for (const def of c.outputs) expect(Number.isFinite(o[def.id]), `${c.id}.${def.id} with {}`).toBe(true);
    }
  });
  it("has a verdict and chart that work on defaults and zeros", () => {
    for (const c of startupCalculators) {
      for (const i of [inputs(c), fill(c, 0)]) {
        const o = c.compute(i);
        if (c.verdict) expect(c.verdict(i, o).text.length).toBeGreaterThan(0);
        if (c.chart) {
          const chart = c.chart(i, o);
          for (const s of chart.series) {
            expect(s.values).toHaveLength(chart.labels.length);
            s.values.forEach((v) => expect(Number.isFinite(v)).toBe(true));
          }
        }
      }
    }
  });
  it("gives every output a unique id, and every input a default inside its own bounds", () => {
    for (const c of startupCalculators) {
      expect(new Set(c.outputs.map((o) => o.id)).size, c.id).toBe(c.outputs.length);
      c.inputGroups.forEach((g) =>
        g.fields.forEach((f) => {
          if (f.min !== undefined) expect(f.defaultValue, `${c.id}.${f.id}`).toBeGreaterThanOrEqual(f.min);
          if (f.max !== undefined) expect(f.defaultValue, `${c.id}.${f.id}`).toBeLessThanOrEqual(f.max);
        }),
      );
    }
  });
  it("only references output ids that compute returns", () => {
    for (const c of startupCalculators) {
      const o = c.compute(inputs(c));
      for (const def of c.outputs) expect(o, `${c.id}.${def.id}`).toHaveProperty(def.id);
    }
  });
});
