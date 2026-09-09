import { describe, expect, it } from "vitest";
import {
  amountNeeded,
  computeComparison,
  computeEquity,
  computeJv,
  computeLoan,
  computeSafe,
  FUNDING_DEFAULTS,
  type FundingState,
} from "@/lib/funding";

const base: FundingState = { ...FUNDING_DEFAULTS };

describe("amountNeeded", () => {
  it("uses the direct amount in direct mode", () => {
    expect(amountNeeded({ ...base, amountMode: "direct", amountNeeded: 2_000_000 })).toBe(2_000_000);
  });

  it("derives from burn × runway target in burn mode", () => {
    expect(
      amountNeeded({ ...base, amountMode: "burn", monthlyBurn: 120_000, runwayTargetMonths: 18 })
    ).toBe(2_160_000);
  });
});

describe("computeEquity", () => {
  it("computes post-money and investor % from pre-money", () => {
    const o = computeEquity(2_000_000, { ...base, preMoney: 10_000_000 });
    expect(o.postMoney).toBe(12_000_000);
    expect(o.investorPct).toBeCloseTo(16.667, 2);
    expect(o.founderPctAfter).toBeCloseTo(83.333, 2);
  });

  it("computes implied valuation from a target %", () => {
    const o = computeEquity(2_000_000, { ...base, targetInvestorPct: 20 });
    expect(o.impliedPostMoney).toBe(10_000_000);
    expect(o.impliedPreMoney).toBe(8_000_000);
  });

  it("returns Infinity (not NaN) implied valuation at zero target %", () => {
    const o = computeEquity(2_000_000, { ...base, targetInvestorPct: 0 });
    expect(Number.isNaN(o.impliedPreMoney)).toBe(false);
    expect(o.impliedPreMoney).toBe(Infinity);
  });
});

describe("computeSafe", () => {
  it("converts at the cap when the cap is lower", () => {
    const o = computeSafe(2_000_000, {
      ...base,
      valuationCap: 8_000_000,
      discountPct: 20,
      nextRoundPreMoney: 15_000_000,
    });
    expect(o.discountBasis).toBe(12_000_000);
    expect(o.capBasis).toBe(8_000_000);
    expect(o.conversionPct).toBeCloseTo(20);
    expect(o.founderPctAfter).toBeCloseTo(80);
  });

  it("converts at the discounted price when that is lower", () => {
    const o = computeSafe(1_000_000, {
      ...base,
      valuationCap: 20_000_000,
      discountPct: 20,
      nextRoundPreMoney: 10_000_000,
    });
    expect(o.capBasis).toBe(8_000_000);
    expect(o.conversionPct).toBeCloseTo((1 / 9) * 100, 2);
  });
});

describe("computeJv", () => {
  it("splits ownership by capital plus sweat equity and sums to 100", () => {
    const o = computeJv({
      ...base,
      ownCapital: 500_000,
      partnerCapital: 1_500_000,
      sweatEquityPct: 10,
      profitSplitOwnPct: 60,
      projectedAnnualProfit: 800_000,
    });
    expect(o.totalCapital).toBe(2_000_000);
    expect(o.ownershipOwnPct).toBeCloseTo(35); // 25% capital + 10 sweat
    expect(o.ownershipOwnPct + o.ownershipPartnerPct).toBeCloseTo(100);
    expect(o.ownProfitShare).toBe(480_000);
    expect(o.partnerProfitShare).toBe(320_000);
    expect(o.partnerPaybackYears).toBeCloseTo(1_500_000 / 320_000);
  });

  it("returns Infinity payback with zero projected profit", () => {
    const o = computeJv({ ...base, projectedAnnualProfit: 0 });
    expect(o.partnerPaybackYears).toBe(Infinity);
  });
});

describe("computeLoan", () => {
  it("computes the standard amortized payment", () => {
    const o = computeLoan(1_000_000, {
      ...base,
      annualInterestPct: 12,
      termMonths: 36,
      monthlyCashFlow: 60_000,
    });
    expect(o.monthlyPayment).toBeCloseTo(33_214.31, 0);
    expect(o.totalRepaid).toBeCloseTo(o.monthlyPayment * 36);
    expect(o.totalInterest).toBeCloseTo(o.totalRepaid - 1_000_000);
    expect(o.coverageRatio).toBeCloseTo(60_000 / o.monthlyPayment);
  });

  it("falls back to straight-line at zero interest", () => {
    const o = computeLoan(1_200_000, { ...base, annualInterestPct: 0, termMonths: 24 });
    expect(o.monthlyPayment).toBe(50_000);
    expect(o.totalInterest).toBeCloseTo(0);
  });
});

describe("computeComparison", () => {
  it("returns one row per funding option", () => {
    const rows = computeComparison(base);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.option)).toEqual([
      "Equity (priced round)",
      "SAFE / convertible",
      "Joint venture",
      "Loan / debt",
    ]);
    const loan = rows[3];
    expect(loan.dilutionPct).toBeNull();
    expect(loan.monthlyObligation).toBeGreaterThan(0);
  });
});

describe("NaN & edge input guards", () => {
  it("computeEquity: zero pre-money and zero amount → 0% investor (not NaN)", () => {
    const o = computeEquity(0, { ...base, preMoney: 0 });
    expect(Number.isNaN(o.investorPct)).toBe(false);
    expect(o.investorPct).toBe(0);
    expect(Number.isNaN(o.founderPctAfter)).toBe(false);
  });

  it("computeEquity: zero target → Infinity implied valuation (not NaN)", () => {
    const o = computeEquity(1_000_000, { ...base, targetInvestorPct: 0 });
    expect(Number.isNaN(o.impliedPostMoney)).toBe(false);
    expect(o.impliedPostMoney).toBe(Infinity);
  });

  it("computeEquity: 100% target → non-NaN values", () => {
    const o = computeEquity(1_000_000, { ...base, targetInvestorPct: 100 });
    for (const k of Object.keys(o) as Array<keyof typeof o>) {
      expect(Number.isNaN(o[k]), `o.${k} is NaN`).toBe(false);
    }
  });

  it("computeSafe: zero inputs → zero conversion (not NaN)", () => {
    const o = computeSafe(0, {
      ...base,
      nextRoundPreMoney: 0,
      discountPct: 0,
      valuationCap: 0,
    });
    expect(Number.isNaN(o.conversionPct)).toBe(false);
    expect(o.conversionPct).toBe(0);
    expect(Number.isNaN(o.founderPctAfter)).toBe(false);
  });

  it("computeJv: zero capital and zero profit → non-NaN and zero partner payback = Infinity", () => {
    const o = computeJv({
      ...base,
      ownCapital: 0,
      partnerCapital: 0,
      projectedAnnualProfit: 0,
    });
    expect(Number.isNaN(o.ownershipOwnPct)).toBe(false);
    expect(o.partnerPaybackYears).toBe(Infinity);
  });

  it("computeLoan: zero interest → straight-line (no NaN)", () => {
    const o = computeLoan(1_200_000, { ...base, annualInterestPct: 0, termMonths: 24 });
    expect(Number.isNaN(o.monthlyPayment)).toBe(false);
    expect(o.totalInterest).toBe(0);
  });

  it("computeLoan: zero term month defaults to 1 → finite payment", () => {
    const o = computeLoan(100_000, { ...base, termMonths: 0 });
    expect(Number.isNaN(o.monthlyPayment)).toBe(false);
    expect(Number.isFinite(o.monthlyPayment)).toBe(true);
  });

  it("amountNeeded: burn mode with zeros → 0 (not NaN)", () => {
    expect(amountNeeded({ ...base, amountMode: "burn", monthlyBurn: 0, runwayTargetMonths: 0 })).toBe(0);
  });
});
