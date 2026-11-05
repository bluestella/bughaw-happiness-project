import { describe, expect, it } from "vitest";
import {
  clampWaste,
  compatibleUnits,
  computeRow,
  costReportCsv,
  DEFAULT_STATE,
  makeRow,
  normalizeRow,
  normalizeState,
  planProduction,
  summarize,
  toBase,
  unitsCompatible,
  type CostRow,
  type CostState,
} from "@/lib/costCalc";

const row = (p: Partial<Omit<CostRow, "id">> = {}): CostRow =>
  makeRow({
    name: "Item",
    category: "material",
    purchaseAmt: 1,
    purchaseUnit: "kg",
    price: 100,
    qty: 100,
    qtyUnit: "g",
    amortize: 1,
    ...p,
  });

const state = (p: Partial<CostState> = {}): CostState => ({ ...DEFAULT_STATE(), ...p });

describe("units", () => {
  it("converts to base units", () => {
    expect(toBase(2, "kg")).toBe(2000);
    expect(toBase(1.5, "L")).toBe(1500);
    expect(toBase(3, "pcs")).toBe(3);
    expect(toBase(NaN, "g")).toBe(0);
  });

  it("only treats same-kind units as compatible", () => {
    expect(unitsCompatible("kg", "g")).toBe(true);
    expect(unitsCompatible("L", "mL")).toBe(true);
    expect(unitsCompatible("kg", "mL")).toBe(false);
    expect(unitsCompatible("pcs", "g")).toBe(false);
    expect(compatibleUnits("kg")).toEqual(["g", "kg"]);
    expect(compatibleUnits("pcs")).toEqual(["pcs"]);
  });
});

describe("computeRow", () => {
  it("prices per base unit and per batch", () => {
    // ₱100 per 1 kg → ₱0.10/g; 100 g used → ₱10
    const r = computeRow(row());
    expect(r.unitPrice).toBeCloseTo(0.1);
    expect(r.baseUnit).toBe("g");
    expect(r.costPerBatch).toBeCloseTo(10);
    expect(r.mismatch).toBe(false);
  });

  it("spreads equipment over the batches it lasts", () => {
    const r = computeRow(row({ purchaseAmt: 1, purchaseUnit: "pcs", price: 500, qty: 1, qtyUnit: "pcs", amortize: 50 }));
    expect(r.costPerBatch).toBeCloseTo(10);
  });

  it("refuses to cost mismatched units instead of returning a wrong number", () => {
    const r = computeRow(row({ purchaseUnit: "kg", qtyUnit: "mL" }));
    expect(r.mismatch).toBe(true);
    expect(r.costPerBatch).toBe(0);
  });

  it("returns 0, not NaN/Infinity, for zero pack size or bad lifetime", () => {
    expect(computeRow(row({ purchaseAmt: 0 })).costPerBatch).toBe(0);
    expect(computeRow(row({ amortize: 0 })).costPerBatch).toBeCloseTo(10);
    expect(Number.isFinite(computeRow(row({ price: NaN })).costPerBatch)).toBe(true);
  });
});

describe("normalize", () => {
  it("tags legacy rows by lifetime and fills defaults", () => {
    const legacy = { id: "x", name: "Beaker", purchaseAmt: 1, purchaseUnit: "pcs", price: 700, qty: 1, qtyUnit: "pcs", amortize: 50 };
    expect(normalizeRow(legacy).category).toBe("equipment");
    expect(normalizeRow({ ...legacy, amortize: 1 }).category).toBe("material");
    expect(normalizeRow({ ...legacy, purchaseUnit: "lbs" }).purchaseUnit).toBe("pcs");
  });

  it("adds new fields to old saved documents", () => {
    const s = normalizeState({ rows: [], outputAmount: 60, amountPerPair: null } as Partial<CostState>);
    expect(s.outputUnit).toBe("g");
    expect(s.targetPairs).toBeNull();
    expect(s.wastePct).toBe(0);
    expect(s.reportTitle).toBe("");
  });

  it("clamps waste to 0–95%", () => {
    expect(clampWaste(-5)).toBe(0);
    expect(clampWaste(100)).toBe(95);
    expect(clampWaste(NaN)).toBe(0);
  });
});

describe("summarize", () => {
  it("totals, splits by category and ranks cost drivers", () => {
    const s = state({
      rows: [
        row({ name: "Cheap", price: 50 }), // ₱5
        row({ name: "Tool", category: "equipment", purchaseUnit: "pcs", qtyUnit: "pcs", qty: 1, price: 750, amortize: 50 }), // ₱15
      ],
      outputAmount: 40,
      amountPerPair: 10,
    });
    const sum = summarize(s);
    expect(sum.totalPerBatch).toBeCloseTo(20);
    expect(sum.byCategory.material).toBeCloseTo(5);
    expect(sum.byCategory.equipment).toBeCloseTo(15);
    expect(sum.breakdown[0].name).toBe("Tool");
    expect(sum.breakdown[0].sharePct).toBeCloseTo(75);
    expect(sum.costPerOutputUnit).toBeCloseTo(0.5);
    expect(sum.costPerPair).toBeCloseTo(5);
    expect(sum.pairsPerBatch).toBeCloseTo(4);
  });

  it("leaves per-pair figures empty until R&D confirms the amount", () => {
    const sum = summarize(state({ amountPerPair: null }));
    expect(sum.costPerPair).toBeNull();
    expect(sum.pairsPerBatch).toBeNull();
  });

  it("guards divide-by-zero on output", () => {
    const sum = summarize(state({ outputAmount: 0, amountPerPair: 10 }));
    expect(sum.costPerOutputUnit).toBe(0);
    expect(sum.costPerPair).toBeNull();
  });

  it("excludes and reports mismatched rows", () => {
    const sum = summarize(state({ rows: [row(), row({ name: "Bad", qtyUnit: "mL" })] }));
    expect(sum.totalPerBatch).toBeCloseTo(10);
    expect(sum.mismatchedRows.map((r) => r.name)).toEqual(["Bad"]);
    expect(sum.breakdown.every((b) => Number.isFinite(b.sharePct))).toBe(true);
  });

  it("has zero shares, not NaN, when everything costs nothing", () => {
    const sum = summarize(state({ rows: [row({ price: 0 })] }));
    expect(sum.breakdown[0].sharePct).toBe(0);
  });
});

describe("planProduction", () => {
  // One batch: 100 g of material at ₱0.10/g = ₱10, plus a ₱500 tool lasting 50 batches = ₱10.
  // Batch makes 40 g; 10 g per pair → 4 pairs/batch.
  const base = (p: Partial<CostState> = {}) =>
    state({
      rows: [
        row({ name: "Peat", purchaseAmt: 1, purchaseUnit: "kg", price: 100, qty: 100, qtyUnit: "g" }),
        row({ name: "Beaker", category: "equipment", purchaseUnit: "pcs", qtyUnit: "pcs", qty: 1, price: 500, amortize: 50 }),
      ],
      outputAmount: 40,
      amountPerPair: 10,
      targetPairs: 100,
      ...p,
    });

  it("needs a target and a confirmed per-pair amount", () => {
    expect(planProduction(base({ targetPairs: null }))).toBeNull();
    expect(planProduction(base({ targetPairs: 0 }))).toBeNull();
    expect(planProduction(base({ amountPerPair: null }))).toBeNull();
  });

  it("works out batches, cost and shopping list without waste", () => {
    const p = planProduction(base())!;
    expect(p.goodPairsPerBatch).toBeCloseTo(4);
    expect(p.batchesNeeded).toBe(25);
    expect(p.costCharged).toBeCloseTo(500);
    expect(p.costPerGoodPair).toBeCloseTo(5);
    // 25 batches × 100 g = 2.5 kg → 3 × 1 kg packs; beaker lasts 50 → 1
    const peat = p.shopping.find((l) => l.name === "Peat")!;
    expect(peat.packs).toBe(3);
    expect(peat.cost).toBeCloseTo(300);
    expect(p.shopping.find((l) => l.name === "Beaker")!.packs).toBe(1);
    expect(p.cashToBuy).toBeCloseTo(800);
  });

  it("adds batches to cover waste", () => {
    const p = planProduction(base({ wastePct: 20 }))!;
    // 4 × 0.8 = 3.2 usable pairs/batch → ceil(100 / 3.2) = 32
    expect(p.goodPairsPerBatch).toBeCloseTo(3.2);
    expect(p.batchesNeeded).toBe(32);
    expect(p.costPerGoodPair).toBeCloseTo(6.25);
    expect(p.goodPairsProduced).toBeGreaterThanOrEqual(100);
  });

  it("does not round float noise up to an extra pack", () => {
    // 10 batches × 100 g = exactly 1 kg → 1 pack
    const p = planProduction(base({ targetPairs: 40 }))!;
    expect(p.batchesNeeded).toBe(10);
    expect(p.shopping.find((l) => l.name === "Peat")!.packs).toBe(1);
  });

  it("skips mismatched rows in the shopping list", () => {
    const s = base();
    s.rows.push(row({ name: "Bad", qtyUnit: "mL" }));
    expect(planProduction(s)!.shopping.some((l) => l.name === "Bad")).toBe(false);
  });
});

describe("costReportCsv", () => {
  const meta = { title: "Trial #3, \"hot\" wash", preparedBy: "ana@bughaw.ph", date: "2026-11-05", notes: "Supplier A, line 1\nline 2" };

  it("includes header, summary and every line item with escaping", () => {
    const s = state({ amountPerPair: 25 });
    const csv = costReportCsv(s, meta);
    expect(csv).toContain('Report,"Trial #3, ""hot"" wash"');
    expect(csv).toContain("Prepared by,ana@bughaw.ph");
    expect(csv).toContain('Notes,"Supplier A, line 1\nline 2"');
    expect(csv).toContain("Total cost of one batch,");
    for (const r of s.rows) expect(csv).toContain(r.name.split(" ")[0]);
    expect(csv).not.toContain("NaN");
    expect(csv).not.toContain("Infinity");
  });

  it("states pending per-pair figures in words", () => {
    const csv = costReportCsv(state({ amountPerPair: null }), meta);
    expect(csv).toContain("Cost per pair,Not confirmed yet");
    expect(csv).not.toContain("Production plan");
  });

  it("adds the production plan and shopping list when available", () => {
    const csv = costReportCsv(state({ amountPerPair: 25, targetPairs: 50, wastePct: 10 }), meta);
    expect(csv).toContain("Production plan");
    expect(csv).toContain("Shopping list");
    expect(csv).toContain("Batches needed,");
  });

  it("flags mismatched rows", () => {
    const csv = costReportCsv(state({ rows: [row({ name: "Bad", qtyUnit: "mL" })] }), meta);
    expect(csv).toContain("Units don't match (kg vs mL) - not counted");
  });
});
