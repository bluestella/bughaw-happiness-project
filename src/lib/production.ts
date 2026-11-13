// Production and R&D: supplier lots, production batches, material tests — pure helpers.
//
// MIRRORS supabase/migrations/0023_production_rd.sql (limits, vocabulary). The database is the
// boundary (RLS plus triggers); these helpers validate forms before the round trip and compute
// what the screens show. Nothing here returns NaN or Infinity: a divide by zero is 0.
// Money is PHP; dates are Manila dates (YYYY-MM-DD).

import { csvEscape, manilaDate } from "@/lib/crm";

export const LOT_NO_MAX = 60;
export const SUPPLIER_MAX = 120;
export const MATERIAL_MAX = 120;
export const UNIT_MAX = 20;
export const TEST_NAME_MAX = 120;
export const METHOD_MAX = 500;
export const RESULT_MAX = 300;
export const NOTES_MAX = 500;
export const BATCH_NO_MAX = 60;
export const QTY_MADE_MAX = 1_000_000;
export const LABOR_HOURS_MAX = 100_000;
export const MONEY_LIMIT = 1_000_000_000;

export const BATCH_STATUSES = ["open", "completed"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
export const TEST_OUTCOMES = ["pass", "fail", "inconclusive"] as const;
export type TestOutcome = (typeof TEST_OUTCOMES)[number];
export const OUTCOME_LABEL: Record<TestOutcome, string> = { pass: "Pass", fail: "Fail", inconclusive: "Inconclusive" };

export type LotRow = {
  id: string;
  lot_no: string;
  supplier: string;
  material: string;
  received_on: string;
  quantity: number;
  unit: string;
  total_cost: number;
  notes: string | null;
};
export type BatchRow = {
  id: string;
  batch_no: string;
  product_id: string;
  made_on: string;
  qty_made: number;
  qty_rejected: number;
  labor_hours: number;
  total_cost: number;
  notes: string | null;
  status: BatchStatus;
  completed_at: string | null;
};
export type TestRow = {
  id: string;
  tested_on: string;
  material: string;
  test_name: string;
  method: string | null;
  result: string;
  outcome: TestOutcome;
  batch_id: string | null;
  lot_id: string | null;
  notes: string | null;
  created_by_email: string;
};
export const LOT_COLUMNS = "id, lot_no, supplier, material, received_on, quantity, unit, total_cost, notes";
export const BATCH_COLUMNS = "id, batch_no, product_id, made_on, qty_made, qty_rejected, labor_hours, total_cost, notes, status, completed_at";
export const TEST_COLUMNS = "id, tested_on, material, test_name, method, result, outcome, batch_id, lot_id, notes, created_by_email";

// ---------- small helpers ----------
const ratio = (a: number, b: number): number => (b > 0 && Number.isFinite(a / b) ? a / b : 0);
const money = (n: number): number => Math.round(n * 100) / 100;
const pct = (n: number): number => Math.round(n * 1000) / 10;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string): boolean => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
/** Parse a typed number: "1,250.5" is 1250.5. Blank or junk is NaN. */
function parse(s: string): number {
  const t = s.trim().replace(/,/g, "");
  return t === "" ? NaN : Number(t);
}

// ---------- batch maths ----------
/** Pairs that can be sold: made minus rejected, never below 0. */
export const goodPairs = (made: number, rejected: number): number => Math.max(0, (made || 0) - (rejected || 0));
/** Good pairs as a percent of pairs made, to one decimal. */
export const yieldPct = (made: number, rejected: number): number => pct(ratio(goodPairs(made, rejected), made));
/** What one sellable pair cost: the whole batch cost over the good pairs. */
export const costPerPair = (totalCost: number, made: number, rejected: number): number =>
  money(ratio(totalCost, goodPairs(made, rejected)));
/** Labour hours per sellable pair, to two decimals. */
export const hoursPerPair = (hours: number, made: number, rejected: number): number =>
  money(ratio(hours, goodPairs(made, rejected)));

export function batchTotals(rows: BatchRow[]) {
  const done = rows.filter((r) => r.status === "completed");
  const made = done.reduce((s, r) => s + r.qty_made, 0);
  const rejected = done.reduce((s, r) => s + r.qty_rejected, 0);
  const cost = money(done.reduce((s, r) => s + r.total_cost, 0));
  return {
    batches: done.length,
    made,
    good: goodPairs(made, rejected),
    yieldPct: yieldPct(made, rejected),
    costPerPair: costPerPair(cost, made, rejected),
  };
}

// ---------- lot maths ----------
/** Cost of one unit (kg, m, piece...) of a lot. */
export const lotUnitCost = (totalCost: number, quantity: number): number => money(ratio(totalCost, quantity));

// ---------- test maths ----------
export function testSummary(rows: Pick<TestRow, "outcome">[]) {
  const pass = rows.filter((r) => r.outcome === "pass").length;
  const fail = rows.filter((r) => r.outcome === "fail").length;
  const inconclusive = rows.filter((r) => r.outcome === "inconclusive").length;
  const decided = pass + fail;
  return { total: rows.length, pass, fail, inconclusive, passRate: pct(ratio(pass, decided)) };
}

// ---------- form drafts and validation ----------
export type LotDraft = { lot_no: string; supplier: string; material: string; received_on: string; quantity: string; unit: string; total_cost: string; notes: string };
export type BatchDraft = { batch_no: string; product_id: string; made_on: string; qty_made: string; qty_rejected: string; labor_hours: string; total_cost: string; notes: string };
export type TestDraft = { tested_on: string; material: string; test_name: string; method: string; result: string; outcome: string; batch_id: string; lot_id: string; notes: string };
type Errors<T> = Partial<Record<keyof T, string>>;

function checkText(errors: Record<string, string>, key: string, value: string, label: string, max: number, required = true) {
  const v = value.trim();
  if (v === "" && required) errors[key] = `Enter ${label}.`;
  else if (v.length > max) errors[key] = `Keep ${label} under ${max} characters.`;
}
function checkDate(errors: Record<string, string>, key: string, value: string, today: string, what: string) {
  if (!isDate(value)) errors[key] = "Enter the date.";
  else if (value > today) errors[key] = `${what} cannot be dated in the future.`;
}

export function validateLot(d: LotDraft, today: string = manilaDate()):
  | { ok: true; row: { lot_no: string; supplier: string; material: string; received_on: string; quantity: number; unit: string; total_cost: number; notes: string | null } }
  | { ok: false; errors: Errors<LotDraft> } {
  const errors: Record<string, string> = {};
  checkText(errors, "lot_no", d.lot_no, "the lot number", LOT_NO_MAX);
  checkText(errors, "supplier", d.supplier, "the supplier", SUPPLIER_MAX);
  checkText(errors, "material", d.material, "the material", MATERIAL_MAX);
  checkText(errors, "unit", d.unit, "the unit", UNIT_MAX);
  checkText(errors, "notes", d.notes, "the notes", NOTES_MAX, false);
  checkDate(errors, "received_on", d.received_on, today, "A delivery");
  const quantity = parse(d.quantity);
  if (!Number.isFinite(quantity)) errors.quantity = "Enter the quantity.";
  else if (quantity <= 0) errors.quantity = "The quantity must be above 0.";
  else if (quantity >= MONEY_LIMIT) errors.quantity = "That quantity is too large.";
  const cost = d.total_cost.trim() === "" ? 0 : parse(d.total_cost);
  if (!Number.isFinite(cost) || cost < 0) errors.total_cost = "Enter the cost, or leave it blank.";
  else if (cost >= MONEY_LIMIT) errors.total_cost = "That amount is too large.";
  if (Object.keys(errors).length) return { ok: false, errors: errors as Errors<LotDraft> };
  return {
    ok: true,
    row: {
      lot_no: d.lot_no.trim(), supplier: d.supplier.trim(), material: d.material.trim(),
      received_on: d.received_on, quantity: Math.round(quantity * 1000) / 1000, unit: d.unit.trim(),
      total_cost: money(cost), notes: d.notes.trim() || null,
    },
  };
}

export function validateBatch(d: BatchDraft, today: string = manilaDate()):
  | { ok: true; row: { batch_no: string; product_id: string; made_on: string; qty_made: number; qty_rejected: number; labor_hours: number; total_cost: number; notes: string | null } }
  | { ok: false; errors: Errors<BatchDraft> } {
  const errors: Record<string, string> = {};
  checkText(errors, "batch_no", d.batch_no, "the batch number", BATCH_NO_MAX);
  checkText(errors, "notes", d.notes, "the notes", NOTES_MAX, false);
  checkDate(errors, "made_on", d.made_on, today, "A batch");
  if (!d.product_id) errors.product_id = "Choose the product.";
  const made = parse(d.qty_made);
  if (!Number.isInteger(made) || made < 0) errors.qty_made = "Enter the pairs made, as a whole number.";
  else if (made > QTY_MADE_MAX) errors.qty_made = "That is too many pairs.";
  const rejected = d.qty_rejected.trim() === "" ? 0 : parse(d.qty_rejected);
  if (!Number.isInteger(rejected) || rejected < 0) errors.qty_rejected = "Enter the rejected pairs, as a whole number.";
  else if (!errors.qty_made && rejected > made) errors.qty_rejected = "Rejected pairs cannot be more than pairs made.";
  const hours = d.labor_hours.trim() === "" ? 0 : parse(d.labor_hours);
  if (!Number.isFinite(hours) || hours < 0) errors.labor_hours = "Enter the labour hours, or leave blank.";
  else if (hours > LABOR_HOURS_MAX) errors.labor_hours = "That is too many hours.";
  const cost = d.total_cost.trim() === "" ? 0 : parse(d.total_cost);
  if (!Number.isFinite(cost) || cost < 0) errors.total_cost = "Enter the batch cost, or leave blank.";
  else if (cost >= MONEY_LIMIT) errors.total_cost = "That amount is too large.";
  if (Object.keys(errors).length) return { ok: false, errors: errors as Errors<BatchDraft> };
  return {
    ok: true,
    row: {
      batch_no: d.batch_no.trim(), product_id: d.product_id, made_on: d.made_on, qty_made: made,
      qty_rejected: rejected, labor_hours: money(hours), total_cost: money(cost), notes: d.notes.trim() || null,
    },
  };
}

export function validateTest(d: TestDraft, today: string = manilaDate()):
  | { ok: true; row: { tested_on: string; material: string; test_name: string; method: string | null; result: string; outcome: TestOutcome; batch_id: string | null; lot_id: string | null; notes: string | null } }
  | { ok: false; errors: Errors<TestDraft> } {
  const errors: Record<string, string> = {};
  checkText(errors, "material", d.material, "the material", MATERIAL_MAX);
  checkText(errors, "test_name", d.test_name, "the test name", TEST_NAME_MAX);
  checkText(errors, "method", d.method, "the method", METHOD_MAX, false);
  checkText(errors, "result", d.result, "the result", RESULT_MAX);
  checkText(errors, "notes", d.notes, "the notes", NOTES_MAX, false);
  checkDate(errors, "tested_on", d.tested_on, today, "A test");
  if (!(TEST_OUTCOMES as readonly string[]).includes(d.outcome)) errors.outcome = "Choose pass, fail or inconclusive.";
  if (Object.keys(errors).length) return { ok: false, errors: errors as Errors<TestDraft> };
  return {
    ok: true,
    row: {
      tested_on: d.tested_on, material: d.material.trim(), test_name: d.test_name.trim(), method: d.method.trim() || null,
      result: d.result.trim(), outcome: d.outcome as TestOutcome, batch_id: d.batch_id || null, lot_id: d.lot_id || null,
      notes: d.notes.trim() || null,
    },
  };
}

// ---------- export ----------
export function batchesToCsv(rows: BatchRow[], productName: (id: string) => string): string {
  const lines = ["batch,product,made_on,pairs_made,pairs_rejected,good_pairs,yield_pct,labor_hours,total_cost,cost_per_pair,status"];
  for (const r of [...rows].sort((a, b) => a.made_on.localeCompare(b.made_on) || a.batch_no.localeCompare(b.batch_no))) {
    lines.push(
      [r.batch_no, productName(r.product_id), r.made_on, r.qty_made, r.qty_rejected, goodPairs(r.qty_made, r.qty_rejected),
        yieldPct(r.qty_made, r.qty_rejected), r.labor_hours, r.total_cost, costPerPair(r.total_cost, r.qty_made, r.qty_rejected), r.status]
        .map(csvEscape).join(","),
    );
  }
  return lines.join("\r\n");
}
