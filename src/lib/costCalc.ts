/**
 * Unit Cost Calculator — pure costing math, report rows and CSV.
 *
 * Everything here is side-effect free so it can be unit-tested
 * (tests/unit/costCalc.test.ts). The page and the report view both read the
 * same shared `app_state` document ("cost-calc") and run it through these
 * helpers, so the screen and the printed report can never disagree.
 *
 * Non-finite guards: every compute returns 0 (or null for "not known yet"),
 * never NaN/Infinity — formatters render those as "—".
 */

import { csvEscape } from "@/lib/crm";

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export type Unit = "g" | "kg" | "mL" | "L" | "pcs";
export type Dimension = "mass" | "volume" | "count";

export const UNITS: Unit[] = ["g", "kg", "mL", "L", "pcs"];

const UNIT_INFO: Record<Unit, { factor: number; dimension: Dimension }> = {
  g: { factor: 1, dimension: "mass" },
  kg: { factor: 1000, dimension: "mass" },
  mL: { factor: 1, dimension: "volume" },
  L: { factor: 1000, dimension: "volume" },
  pcs: { factor: 1, dimension: "count" },
};

/** The smallest unit of each kind — prices are quoted "per g", "per mL", "per pc". */
export const BASE_UNIT: Record<Dimension, Unit> = { mass: "g", volume: "mL", count: "pcs" };

function asUnit(u: string): Unit {
  return (UNITS as string[]).includes(u) ? (u as Unit) : "pcs";
}

export function dimensionOf(u: string): Dimension {
  return UNIT_INFO[asUnit(u)].dimension;
}

export function toBase(amount: number, unit: string): number {
  const n = Number.isFinite(amount) ? amount : 0;
  return n * UNIT_INFO[asUnit(unit)].factor;
}

/** Can an amount in `a` be meaningfully compared with one in `b`? (kg vs g yes, kg vs mL no) */
export function unitsCompatible(a: string, b: string): boolean {
  return dimensionOf(a) === dimensionOf(b);
}

/** Units that measure the same kind of thing as `u` (for the "used per batch" picker). */
export function compatibleUnits(u: string): Unit[] {
  const d = dimensionOf(u);
  return UNITS.filter((x) => UNIT_INFO[x].dimension === d);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Category = "material" | "equipment";

export const CATEGORY_LABEL: Record<Category, string> = {
  material: "Material",
  equipment: "Equipment",
};

export interface CostRow {
  id: string;
  name: string;
  category: Category;
  /** Size of one pack / bottle / piece as bought from the supplier. */
  purchaseAmt: number;
  purchaseUnit: string;
  /** Price paid for that one pack (₱). */
  price: number;
  /** How much of it one batch uses. */
  qty: number;
  qtyUnit: string;
  /** How many batches one pack lasts before it must be replaced (1 = used up in one batch). */
  amortize: number;
}

export interface CostState {
  rows: CostRow[];
  /** How much finished output one batch makes. */
  outputAmount: number;
  outputUnit: string;
  /** How much of that output goes into one pair. null = not confirmed by R&D yet. */
  amountPerPair: number | null;
  /** Batch planner. */
  targetPairs: number | null;
  wastePct: number;
  /** Report header (shared with the team like everything else). */
  reportTitle: string;
  reportNotes: string;
}

let counter = 0;
export function newRowId(): string {
  counter += 1;
  return `r${counter}-${Date.now()}`;
}

export function makeRow(r: Omit<CostRow, "id">): CostRow {
  return { id: newRowId(), ...r };
}

export const DEFAULT_ROWS = (): CostRow[] => [
  makeRow({ name: "Coco peat", category: "material", purchaseAmt: 20, purchaseUnit: "kg", price: 400, qty: 60, qtyUnit: "g", amortize: 1 }),
  makeRow({ name: "NaOH (Caustic Soda Micropearls)", category: "material", purchaseAmt: 1, purchaseUnit: "kg", price: 165, qty: 120, qtyUnit: "g", amortize: 1 }),
  makeRow({ name: "Hydrogen Peroxide 12%", category: "material", purchaseAmt: 500, purchaseUnit: "mL", price: 135, qty: 500, qtyUnit: "mL", amortize: 1 }),
  makeRow({ name: "Distilled water", category: "material", purchaseAmt: 1000, purchaseUnit: "mL", price: 30, qty: 700, qtyUnit: "mL", amortize: 1 }),
  makeRow({ name: "Glass Beaker 1000ml", category: "equipment", purchaseAmt: 1, purchaseUnit: "pcs", price: 724.55, qty: 1, qtyUnit: "pcs", amortize: 50 }),
  makeRow({ name: "Glass Stirring Rod 30cm", category: "equipment", purchaseAmt: 1, purchaseUnit: "pcs", price: 44.55, qty: 1, qtyUnit: "pcs", amortize: 50 }),
  makeRow({ name: "Heat-Resistant Gloves", category: "equipment", purchaseAmt: 1, purchaseUnit: "pcs", price: 91.35, qty: 1, qtyUnit: "pcs", amortize: 50 }),
];

export const DEFAULT_STATE = (): CostState => ({
  rows: DEFAULT_ROWS(),
  outputAmount: 60,
  outputUnit: "g",
  amountPerPair: null,
  targetPairs: null,
  wastePct: 0,
  reportTitle: "",
  reportNotes: "",
});

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Fill in fields that older saved documents don't have. Rows saved before
 * categories existed are tagged Equipment when they last more than one batch
 * (that is how the team was already using "amortize"), Material otherwise.
 */
export function normalizeRow(r: Partial<CostRow>): CostRow {
  const amortize = num(r.amortize, 1) >= 1 ? num(r.amortize, 1) : 1;
  const category: Category =
    r.category === "material" || r.category === "equipment"
      ? r.category
      : amortize > 1
        ? "equipment"
        : "material";
  return {
    id: typeof r.id === "string" && r.id ? r.id : newRowId(),
    name: typeof r.name === "string" ? r.name : "",
    category,
    purchaseAmt: num(r.purchaseAmt),
    purchaseUnit: asUnit(String(r.purchaseUnit ?? "pcs")),
    price: num(r.price),
    qty: num(r.qty),
    qtyUnit: asUnit(String(r.qtyUnit ?? "pcs")),
    amortize,
  };
}

export function normalizeState(s: Partial<CostState>): CostState {
  const d = DEFAULT_STATE();
  return {
    rows: Array.isArray(s.rows) ? s.rows.map(normalizeRow) : d.rows,
    outputAmount: num(s.outputAmount, d.outputAmount),
    outputUnit: asUnit(String(s.outputUnit ?? d.outputUnit)),
    amountPerPair: numOrNull(s.amountPerPair),
    targetPairs: numOrNull(s.targetPairs),
    wastePct: clampWaste(num(s.wastePct, 0)),
    reportTitle: typeof s.reportTitle === "string" ? s.reportTitle : "",
    reportNotes: typeof s.reportNotes === "string" ? s.reportNotes : "",
  };
}

/** Waste is a share of output, so it must stay in [0, 95] — 100% would mean nothing usable. */
export function clampWaste(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(95, Math.max(0, pct));
}

// ---------------------------------------------------------------------------
// Per-row math
// ---------------------------------------------------------------------------

export interface RowResult {
  /** ₱ per smallest unit (per g / mL / pc), already spread over the batches it lasts. */
  unitPrice: number;
  /** The base unit `unitPrice` is quoted in. */
  baseUnit: Unit;
  /** ₱ charged to one batch. 0 when the row can't be costed (see `mismatch`). */
  costPerBatch: number;
  /** Purchase unit and usage unit measure different things (e.g. kg vs mL). */
  mismatch: boolean;
}

export function computeRow(r: CostRow): RowResult {
  const mismatch = !unitsCompatible(r.purchaseUnit, r.qtyUnit);
  const purchaseBase = toBase(r.purchaseAmt, r.purchaseUnit);
  const qtyBase = toBase(r.qty, r.qtyUnit);
  const lasts = r.amortize >= 1 && Number.isFinite(r.amortize) ? r.amortize : 1;
  const effectivePrice = num(r.price) / lasts;
  const unitPrice = purchaseBase > 0 ? effectivePrice / purchaseBase : 0;
  return {
    unitPrice,
    baseUnit: BASE_UNIT[dimensionOf(r.purchaseUnit)],
    costPerBatch: mismatch ? 0 : unitPrice * qtyBase,
    mismatch,
  };
}

// ---------------------------------------------------------------------------
// Batch summary + breakdown
// ---------------------------------------------------------------------------

export interface BreakdownItem {
  id: string;
  name: string;
  category: Category;
  costPerBatch: number;
  /** Share of the batch total, 0–100. */
  sharePct: number;
}

export interface CostSummary {
  totalPerBatch: number;
  byCategory: Record<Category, number>;
  /** ₱ per one unit of output (per g of treated coco peat, etc.). */
  costPerOutputUnit: number;
  /** ₱ per pair; null until the per-pair amount is entered. */
  costPerPair: number | null;
  /** Pairs one batch makes before waste; null until per-pair amount is known. */
  pairsPerBatch: number | null;
  /** Items sorted by cost, biggest first. */
  breakdown: BreakdownItem[];
  mismatchedRows: CostRow[];
}

export function summarize(s: CostState): CostSummary {
  const byCategory: Record<Category, number> = { material: 0, equipment: 0 };
  const items: BreakdownItem[] = [];
  const mismatchedRows: CostRow[] = [];
  let total = 0;

  for (const r of s.rows) {
    const res = computeRow(r);
    if (res.mismatch) mismatchedRows.push(r);
    total += res.costPerBatch;
    byCategory[r.category] += res.costPerBatch;
    items.push({ id: r.id, name: r.name, category: r.category, costPerBatch: res.costPerBatch, sharePct: 0 });
  }

  for (const it of items) it.sharePct = total > 0 ? (it.costPerBatch / total) * 100 : 0;
  items.sort((a, b) => b.costPerBatch - a.costPerBatch);

  const out = s.outputAmount > 0 ? s.outputAmount : 0;
  const costPerOutputUnit = out > 0 ? total / out : 0;
  const perPair = s.amountPerPair !== null && s.amountPerPair > 0 ? s.amountPerPair : null;
  const ready = perPair !== null && out > 0;

  return {
    totalPerBatch: total,
    byCategory,
    costPerOutputUnit,
    costPerPair: ready ? costPerOutputUnit * perPair : null,
    pairsPerBatch: ready ? out / perPair : null,
    breakdown: items,
    mismatchedRows,
  };
}

// ---------------------------------------------------------------------------
// Batch planner
// ---------------------------------------------------------------------------

export interface ShoppingLine {
  id: string;
  name: string;
  category: Category;
  /** Whole packs to buy, rounded up. */
  packs: number;
  packSize: string;
  /** packs × pack price. */
  cost: number;
}

export interface PlanResult {
  targetPairs: number;
  wastePct: number;
  /** Usable pairs per batch after waste/rejects. */
  goodPairsPerBatch: number;
  batchesNeeded: number;
  /** Pairs actually produced by those whole batches, after waste (≥ target). */
  goodPairsProduced: number;
  /** batchesNeeded × cost per batch — the share of cost charged to this order (equipment spread). */
  costCharged: number;
  /** Steady-state cost of one usable pair, waste included. */
  costPerGoodPair: number;
  shopping: ShoppingLine[];
  /** Cash to buy every pack on the shopping list (equipment bought whole). */
  cashToBuy: number;
}

/** Round up, but tolerate float noise (3.0000000001 packs is 3, not 4). */
function ceilSafe(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.ceil(x - 1e-9);
}

export function fmtAmount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

/**
 * Returns null until the plan can be computed: needs a target, a confirmed
 * per-pair amount and a positive batch output.
 */
export function planProduction(s: CostState, summary: CostSummary = summarize(s)): PlanResult | null {
  const target = s.targetPairs;
  if (target === null || !(target > 0) || summary.pairsPerBatch === null) return null;

  const wastePct = clampWaste(s.wastePct);
  const goodPairsPerBatch = summary.pairsPerBatch * (1 - wastePct / 100);
  if (!(goodPairsPerBatch > 0)) return null;

  const batchesNeeded = ceilSafe(target / goodPairsPerBatch);

  const shopping: ShoppingLine[] = [];
  for (const r of s.rows) {
    const res = computeRow(r);
    if (res.mismatch) continue;
    const purchaseBase = toBase(r.purchaseAmt, r.purchaseUnit);
    if (!(purchaseBase > 0)) continue;
    const lasts = r.amortize >= 1 ? r.amortize : 1;
    // Total consumed across the order; equipment wears out once every `lasts` batches.
    const consumedBase = (toBase(r.qty, r.qtyUnit) * batchesNeeded) / lasts;
    const packs = ceilSafe(consumedBase / purchaseBase);
    if (packs === 0) continue;
    shopping.push({
      id: r.id,
      name: r.name,
      category: r.category,
      packs,
      packSize: `${fmtAmount(r.purchaseAmt)} ${r.purchaseUnit}`,
      cost: packs * num(r.price),
    });
  }

  return {
    targetPairs: target,
    wastePct,
    goodPairsPerBatch,
    batchesNeeded,
    goodPairsProduced: batchesNeeded * goodPairsPerBatch,
    costCharged: batchesNeeded * summary.totalPerBatch,
    costPerGoodPair: summary.totalPerBatch / goodPairsPerBatch,
    shopping,
    cashToBuy: shopping.reduce((a, l) => a + l.cost, 0),
  };
}

// ---------------------------------------------------------------------------
// CSV report
// ---------------------------------------------------------------------------

const money = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "");

export interface ReportMeta {
  title: string;
  preparedBy: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  notes: string;
}

/**
 * Spreadsheet version of the report. Amounts are plain numbers (no ₱ sign or
 * thousands separators) so Excel/Sheets can sum them; the currency is stated
 * in the header line instead.
 */
export function costReportCsv(s: CostState, meta: ReportMeta): string {
  const sum = summarize(s);
  const plan = planProduction(s, sum);
  const lines: string[] = [];
  const add = (...cells: unknown[]) => lines.push(cells.map(csvEscape).join(","));

  add("Report", meta.title || "Unit cost report");
  add("Date", meta.date);
  add("Prepared by", meta.preparedBy);
  add("Currency", "PHP");
  if (meta.notes.trim()) add("Notes", meta.notes.trim());
  lines.push("");

  add("Summary");
  add("Total cost of one batch", money(sum.totalPerBatch));
  add("Materials per batch", money(sum.byCategory.material));
  add("Equipment per batch", money(sum.byCategory.equipment));
  add("One batch makes", `${fmtAmount(s.outputAmount)} ${s.outputUnit}`);
  add(`Cost per ${s.outputUnit} of output`, s.outputAmount > 0 ? sum.costPerOutputUnit.toFixed(4) : "");
  add("Output used per pair", s.amountPerPair !== null ? `${fmtAmount(s.amountPerPair)} ${s.outputUnit}` : "Not confirmed yet");
  add("Cost per pair", sum.costPerPair !== null ? money(sum.costPerPair) : "Not confirmed yet");
  lines.push("");

  add("Line items");
  add("Item", "Type", "Pack size", "Pack unit", "Pack price", "Used per batch", "Usage unit", "Batches it lasts", "Cost per batch", "Share of batch cost (%)", "Warning");
  const sharesById = new Map(sum.breakdown.map((b) => [b.id, b.sharePct]));
  for (const r of s.rows) {
    const res = computeRow(r);
    add(
      r.name,
      CATEGORY_LABEL[r.category],
      r.purchaseAmt,
      r.purchaseUnit,
      money(r.price),
      r.qty,
      r.qtyUnit,
      r.amortize,
      money(res.costPerBatch),
      (sharesById.get(r.id) ?? 0).toFixed(1),
      res.mismatch ? `Units don't match (${r.purchaseUnit} vs ${r.qtyUnit}) - not counted` : ""
    );
  }

  if (plan) {
    lines.push("");
    add("Production plan");
    add("Pairs wanted", plan.targetPairs);
    add("Expected waste / rejects (%)", plan.wastePct);
    add("Usable pairs per batch", plan.goodPairsPerBatch.toFixed(2));
    add("Batches needed", plan.batchesNeeded);
    add("Cost charged to this order", money(plan.costCharged));
    add("Cost per usable pair", money(plan.costPerGoodPair));
    add("Cash needed to buy supplies", money(plan.cashToBuy));
    lines.push("");
    add("Shopping list");
    add("Item", "Type", "Packs to buy", "Pack size", "Cost");
    for (const l of plan.shopping) add(l.name, CATEGORY_LABEL[l.category], l.packs, l.packSize, money(l.cost));
  }

  // \r\n + BOM-free; the caller prepends a BOM so Excel reads ₱/UTF-8 correctly.
  return lines.join("\r\n") + "\r\n";
}
