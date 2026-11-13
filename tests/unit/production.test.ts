import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BATCH_NO_MAX,
  BATCH_STATUSES,
  LABOR_HOURS_MAX,
  LOT_NO_MAX,
  MATERIAL_MAX,
  METHOD_MAX,
  MONEY_LIMIT,
  NOTES_MAX,
  QTY_MADE_MAX,
  RESULT_MAX,
  SUPPLIER_MAX,
  TEST_NAME_MAX,
  TEST_OUTCOMES,
  UNIT_MAX,
  batchTotals,
  batchesToCsv,
  costPerPair,
  goodPairs,
  hoursPerPair,
  lotUnitCost,
  testSummary,
  validateBatch,
  validateLot,
  validateTest,
  yieldPct,
  type BatchDraft,
  type BatchRow,
  type LotDraft,
  type TestDraft,
} from "@/lib/production";

const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0023_production_rd.sql"), "utf8");
const TODAY = "2026-11-13";

describe("limits and vocabulary mirror 0023_production_rd.sql", () => {
  it("text limits", () => {
    for (const [col, max] of [
      ["lot_no", LOT_NO_MAX], ["supplier", SUPPLIER_MAX], ["material", MATERIAL_MAX], ["unit", UNIT_MAX],
      ["batch_no", BATCH_NO_MAX], ["test_name", TEST_NAME_MAX], ["method", METHOD_MAX], ["result", RESULT_MAX], ["notes", NOTES_MAX],
    ] as const) {
      expect(sql, col).toContain(`char_length(${col}) <= ${max}`);
    }
  });
  it("numeric limits", () => {
    expect(sql).toContain(`qty_made <= ${QTY_MADE_MAX}`);
    expect(sql).toContain(`labor_hours <= ${LABOR_HOURS_MAX}`);
    expect(sql).toContain(`total_cost < ${MONEY_LIMIT}`);
  });
  it("batch statuses and test outcomes", () => {
    const list = (re: RegExp) => (sql.match(re) as RegExpMatchArray)[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(list(/status in \(([^)]*)\)/)).toEqual([...BATCH_STATUSES]);
    expect(list(/outcome in \(([^)]*)\)/)).toEqual([...TEST_OUTCOMES]);
  });
});

describe("batch maths", () => {
  it("good pairs are made minus rejected, never negative", () => {
    expect(goodPairs(100, 7)).toBe(93);
    expect(goodPairs(5, 9)).toBe(0);
    expect(goodPairs(NaN, 0)).toBe(0);
  });
  it("yield is good over made, to one decimal", () => {
    expect(yieldPct(200, 14)).toBe(93);
    expect(yieldPct(3, 1)).toBe(66.7);
    expect(yieldPct(0, 0)).toBe(0);
  });
  it("cost per pair spreads the whole batch cost over the good pairs only", () => {
    expect(costPerPair(9300, 100, 7)).toBe(100);
    expect(costPerPair(1000, 3, 0)).toBe(333.33);
    expect(costPerPair(1000, 10, 10)).toBe(0); // nothing sellable: no Infinity
    expect(hoursPerPair(18.6, 100, 7)).toBe(0.2);
    expect(hoursPerPair(5, 0, 0)).toBe(0);
  });
  const batch = (over: Partial<BatchRow>): BatchRow => ({
    id: "b", batch_no: "B-1", product_id: "p", made_on: TODAY, qty_made: 100, qty_rejected: 10, labor_hours: 20,
    total_cost: 9000, notes: null, status: "completed", completed_at: "2026-11-13T00:00:00Z", ...over,
  });
  it("totals count only completed batches", () => {
    const t = batchTotals([batch({}), batch({ id: "c", qty_made: 100, qty_rejected: 0, total_cost: 11000 }), batch({ id: "o", status: "open", completed_at: null, qty_made: 999 })]);
    expect(t).toEqual({ batches: 2, made: 200, good: 190, yieldPct: 95, costPerPair: 105.26 });
  });
  it("no completed batches, no NaN", () => {
    expect(batchTotals([])).toEqual({ batches: 0, made: 0, good: 0, yieldPct: 0, costPerPair: 0 });
  });
});

describe("lot and test maths", () => {
  it("unit cost of a lot", () => {
    expect(lotUnitCost(1250, 500)).toBe(2.5);
    expect(lotUnitCost(1250, 0)).toBe(0);
  });
  it("pass rate counts only decided tests", () => {
    expect(testSummary([{ outcome: "pass" }, { outcome: "pass" }, { outcome: "fail" }, { outcome: "inconclusive" }]))
      .toEqual({ total: 4, pass: 2, fail: 1, inconclusive: 1, passRate: 66.7 });
    expect(testSummary([{ outcome: "inconclusive" }]).passRate).toBe(0);
    expect(testSummary([]).total).toBe(0);
  });
});

const lot = (over: Partial<LotDraft> = {}): LotDraft => ({
  lot_no: "L-001", supplier: "Coir Co.", material: "Coir fibre", received_on: TODAY, quantity: "1,250.5", unit: "kg", total_cost: "3,000", notes: "", ...over,
});
describe("validateLot", () => {
  it("accepts a good lot, trims, parses commas and rounds", () => {
    const v = validateLot(lot({ lot_no: " L-001 ", quantity: "1,250.5559" }), TODAY);
    expect(v).toEqual({ ok: true, row: { lot_no: "L-001", supplier: "Coir Co.", material: "Coir fibre", received_on: TODAY, quantity: 1250.556, unit: "kg", total_cost: 3000, notes: null } });
  });
  it("a blank cost means 0", () => {
    const v = validateLot(lot({ total_cost: "" }), TODAY);
    expect(v.ok && v.row.total_cost).toBe(0);
  });
  it("names every problem", () => {
    const v = validateLot(lot({ lot_no: "", supplier: "x".repeat(SUPPLIER_MAX + 1), material: " ", unit: "", received_on: "13/11/2026", quantity: "0", total_cost: "-5", notes: "n".repeat(NOTES_MAX + 1) }), TODAY);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["lot_no", "material", "notes", "quantity", "received_on", "supplier", "total_cost", "unit"]);
  });
  it("future dates, junk and absurd amounts", () => {
    const e = (over: Partial<LotDraft>) => { const v = validateLot(lot(over), TODAY); return v.ok ? {} : v.errors; };
    expect(e({ received_on: "2026-11-14" }).received_on).toMatch(/future/);
    expect(e({ received_on: "2026-13-45" }).received_on).toBeDefined();
    expect(e({ quantity: "abc" }).quantity).toBeDefined();
    expect(e({ quantity: "" }).quantity).toBeDefined();
    expect(e({ quantity: "1e12" }).quantity).toMatch(/too large/);
    expect(e({ total_cost: "1e12" }).total_cost).toMatch(/too large/);
    expect(e({ total_cost: "abc" }).total_cost).toBeDefined();
  });
});

const batchDraft = (over: Partial<BatchDraft> = {}): BatchDraft => ({
  batch_no: "B-2026-01", product_id: "p1", made_on: TODAY, qty_made: "100", qty_rejected: "7", labor_hours: "18.5", total_cost: "9,300", notes: " first run ", ...over,
});
describe("validateBatch", () => {
  it("accepts a good batch", () => {
    expect(validateBatch(batchDraft(), TODAY)).toEqual({ ok: true, row: { batch_no: "B-2026-01", product_id: "p1", made_on: TODAY, qty_made: 100, qty_rejected: 7, labor_hours: 18.5, total_cost: 9300, notes: "first run" } });
  });
  it("blank rejected, hours and cost mean 0", () => {
    const v = validateBatch(batchDraft({ qty_rejected: "", labor_hours: "", total_cost: "" }), TODAY);
    expect(v.ok && [v.row.qty_rejected, v.row.labor_hours, v.row.total_cost]).toEqual([0, 0, 0]);
  });
  const e = (over: Partial<BatchDraft>) => { const v = validateBatch(batchDraft(over), TODAY); return v.ok ? {} : v.errors; };
  it("pairs are whole numbers and rejected cannot exceed made", () => {
    expect(e({ qty_made: "10.5" }).qty_made).toBeDefined();
    expect(e({ qty_made: "-1" }).qty_made).toBeDefined();
    expect(e({ qty_made: "" }).qty_made).toBeDefined();
    expect(e({ qty_made: String(QTY_MADE_MAX + 1) }).qty_made).toMatch(/too many/);
    expect(validateBatch(batchDraft({ qty_made: String(QTY_MADE_MAX), qty_rejected: "0" }), TODAY).ok).toBe(true);
    expect(e({ qty_made: "5", qty_rejected: "6" }).qty_rejected).toMatch(/more than/);
    expect(e({ qty_rejected: "1.5" }).qty_rejected).toBeDefined();
    expect(e({ qty_made: "x", qty_rejected: "6" }).qty_rejected).toBeUndefined(); // reported once, on pairs made
  });
  it("product, date, hours, cost, number", () => {
    expect(e({ product_id: "" }).product_id).toBeDefined();
    expect(e({ batch_no: " " }).batch_no).toBeDefined();
    expect(e({ batch_no: "b".repeat(BATCH_NO_MAX + 1) }).batch_no).toBeDefined();
    expect(e({ made_on: "2026-12-01" }).made_on).toMatch(/future/);
    expect(e({ labor_hours: "-1" }).labor_hours).toBeDefined();
    expect(e({ labor_hours: String(LABOR_HOURS_MAX + 1) }).labor_hours).toMatch(/too many/);
    expect(e({ total_cost: "-1" }).total_cost).toBeDefined();
    expect(e({ total_cost: "9e9" }).total_cost).toMatch(/too large/);
  });
});

const testDraft = (over: Partial<TestDraft> = {}): TestDraft => ({
  tested_on: TODAY, material: "Coir sole", test_name: "Tear strength", method: "", result: "14 N/mm", outcome: "pass", batch_id: "", lot_id: "", notes: "", ...over,
});
describe("validateTest", () => {
  it("accepts a good test; blank links and optional text become null", () => {
    expect(validateTest(testDraft(), TODAY)).toEqual({ ok: true, row: { tested_on: TODAY, material: "Coir sole", test_name: "Tear strength", method: null, result: "14 N/mm", outcome: "pass", batch_id: null, lot_id: null, notes: null } });
    const v = validateTest(testDraft({ batch_id: "b1", lot_id: "l1", method: " ASTM D624 ", notes: " ok " }), TODAY);
    expect(v.ok && [v.row.batch_id, v.row.lot_id, v.row.method, v.row.notes]).toEqual(["b1", "l1", "ASTM D624", "ok"]);
  });
  it("requires material, test, result, a known outcome and a real, non-future date", () => {
    const v = validateTest(testDraft({ material: "", test_name: " ", result: "", outcome: "maybe", tested_on: "2027-01-01" }), TODAY);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["material", "outcome", "result", "test_name", "tested_on"]);
    const long = validateTest(testDraft({ result: "r".repeat(RESULT_MAX + 1), method: "m".repeat(METHOD_MAX + 1) }), TODAY);
    expect(long.ok).toBe(false);
  });
});

describe("batchesToCsv", () => {
  it("one row per batch with the computed columns, oldest first", () => {
    const rows: BatchRow[] = [
      { id: "2", batch_no: "B-2", product_id: "p", made_on: "2026-11-02", qty_made: 100, qty_rejected: 10, labor_hours: 20, total_cost: 9000, notes: null, status: "completed", completed_at: "x" },
      { id: "1", batch_no: "B-1", product_id: "q", made_on: "2026-11-01", qty_made: 50, qty_rejected: 0, labor_hours: 8, total_cost: 5000, notes: null, status: "open", completed_at: null },
    ];
    const csv = batchesToCsv(rows, (id) => (id === "p" ? "Spa slipper, large" : "Hotel slipper")).split("\r\n");
    expect(csv[0]).toBe("batch,product,made_on,pairs_made,pairs_rejected,good_pairs,yield_pct,labor_hours,total_cost,cost_per_pair,status");
    expect(csv[1]).toBe("B-1,Hotel slipper,2026-11-01,50,0,50,100,8,5000,100,open");
    expect(csv[2]).toBe('B-2,"Spa slipper, large",2026-11-02,100,10,90,90,20,9000,100,completed');
  });
});
