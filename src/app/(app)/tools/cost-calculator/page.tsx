"use client";

import { toast } from "sonner";
import { FlaskConical, Plus, X } from "lucide-react";
import { useAppState } from "@/lib/useAppState";
import { peso } from "@/lib/format";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";

const UNIT_FACTORS: Record<string, number> = { g: 1, kg: 1000, mL: 1, L: 1000, pcs: 1 };
const UNIT_OPTIONS = ["g", "kg", "mL", "L", "pcs"];

interface Row {
  id: string;
  name: string;
  purchaseAmt: number;
  purchaseUnit: string;
  price: number;
  qty: number;
  qtyUnit: string;
  amortize: number;
}

interface CostState {
  rows: Row[];
  outputAmount: number;
  amountPerPair: number | null;
}

let counter = 0;
const row = (r: Omit<Row, "id">): Row => ({ id: `r${++counter}-${Date.now()}`, ...r });

const DEFAULT_ROWS = (): Row[] => [
  row({ name: "Coco peat", purchaseAmt: 20, purchaseUnit: "kg", price: 400, qty: 60, qtyUnit: "g", amortize: 1 }),
  row({ name: "NaOH (Caustic Soda Micropearls)", purchaseAmt: 1, purchaseUnit: "kg", price: 165, qty: 120, qtyUnit: "g", amortize: 1 }),
  row({ name: "Hydrogen Peroxide 12%", purchaseAmt: 500, purchaseUnit: "mL", price: 135, qty: 500, qtyUnit: "mL", amortize: 1 }),
  row({ name: "Distilled water", purchaseAmt: 1000, purchaseUnit: "mL", price: 30, qty: 700, qtyUnit: "mL", amortize: 1 }),
  row({ name: "Glass Beaker 1000ml", purchaseAmt: 1, purchaseUnit: "pcs", price: 724.55, qty: 1, qtyUnit: "pcs", amortize: 50 }),
  row({ name: "Glass Stirring Rod 30cm", purchaseAmt: 1, purchaseUnit: "pcs", price: 44.55, qty: 1, qtyUnit: "pcs", amortize: 50 }),
  row({ name: "Heat-Resistant Gloves", purchaseAmt: 1, purchaseUnit: "pcs", price: 91.35, qty: 1, qtyUnit: "pcs", amortize: 50 }),
];

function computeRow(r: Row) {
  const purchaseBase = (r.purchaseAmt || 0) * (UNIT_FACTORS[r.purchaseUnit] || 1);
  const qtyBase = (r.qty || 0) * (UNIT_FACTORS[r.qtyUnit] || 1);
  const effectivePrice = (r.price || 0) / (r.amortize || 1);
  const unitPrice = purchaseBase > 0 ? effectivePrice / purchaseBase : 0;
  return { unitPrice, costRun: unitPrice * qtyBase };
}

const inputCls =
  "w-full border border-line rounded-md bg-white px-2 py-1.5 text-[13px] transition-colors focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20";

/* Prevents scroll-wheel from silently changing focused number inputs. */
const blurOnWheel = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

export default function CostCalculatorPage() {
  const { value, update, loaded, status } = useAppState<CostState>("cost-calc", {
    rows: DEFAULT_ROWS(),
    outputAmount: 60,
    amountPerPair: null,
  });

  const total = value.rows.reduce((sum, r) => sum + computeRow(r).costRun, 0);
  const outAmt = value.outputAmount || 0;
  const costPerOutputUnit = outAmt > 0 ? total / outAmt : 0;
  const pairCost =
    value.amountPerPair && value.amountPerPair > 0 && outAmt > 0
      ? costPerOutputUnit * value.amountPerPair
      : null;

  const setRow = (id: string, patch: Partial<Row>) =>
    update((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  return (
    <div>
      <CalculatorHeader
        icon={FlaskConical}
        eyebrow="Internal R&D costing"
        title="Unit Cost Calculator"
        description="Enter each ingredient or equipment item's purchase size, price, and quantity used per run. Costs recalculate automatically. Shared with the whole team."
      />

      {!loaded ? (
        <div className="space-y-3">
          <SkeletonCard lines={6} />
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        </div>
      ) : (
        <>
          <div className="scroll-shadow-x overflow-x-auto rounded-xl border border-line bg-panel shadow-card">
            <table className="w-full min-w-[920px] border-collapse">
              <thead>
                <tr className="bg-paper">
                  {["Item", "Purchase amt", "Unit", "Purchase price (₱)", "Qty used", "Unit", "Amortize (runs)", "Unit price", "Cost this run", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left font-mono text-[10.5px] uppercase tracking-wide text-ink-soft px-2.5 py-3 border-b border-line whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {value.rows.map((r) => {
                  const { unitPrice, costRun } = computeRow(r);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-2.5 py-2 min-w-[170px]">
                        <input className={inputCls} value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} />
                      </td>
                      <td className="px-2.5 py-2 w-24">
                        <input className={`${inputCls} font-mono`} type="number" onWheel={blurOnWheel} step="any" value={r.purchaseAmt} onChange={(e) => setRow(r.id, { purchaseAmt: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="px-2.5 py-2 w-20">
                        <select className={inputCls} value={r.purchaseUnit} onChange={(e) => setRow(r.id, { purchaseUnit: e.target.value })}>
                          {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2.5 py-2 w-24">
                        <input className={`${inputCls} font-mono`} type="number" onWheel={blurOnWheel} step="any" value={r.price} onChange={(e) => setRow(r.id, { price: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="px-2.5 py-2 w-24">
                        <input className={`${inputCls} font-mono`} type="number" onWheel={blurOnWheel} step="any" value={r.qty} onChange={(e) => setRow(r.id, { qty: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="px-2.5 py-2 w-20">
                        <select className={inputCls} value={r.qtyUnit} onChange={(e) => setRow(r.id, { qtyUnit: e.target.value })}>
                          {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2.5 py-2 w-24">
                        <input className={`${inputCls} font-mono`} type="number" onWheel={blurOnWheel} step="any" min={1} value={r.amortize} onChange={(e) => setRow(r.id, { amortize: parseFloat(e.target.value) || 1 })} />
                      </td>
                      <td className="px-2.5 py-2 font-mono text-[13px] whitespace-nowrap">
                        <span className="block text-[9.5px] uppercase text-ink-soft">₱/unit</span>
                        {unitPrice.toFixed(4)}
                      </td>
                      <td className="px-2.5 py-2 font-mono text-[13px] whitespace-nowrap">
                        <span className="block text-[9.5px] uppercase text-ink-soft">this run</span>
                        {peso(costRun)}
                      </td>
                      <td className="px-2.5 py-2">
                        <button
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-danger transition-colors hover:border-danger hover:bg-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
                          aria-label={`Remove ${r.name || "row"}`}
                          onClick={() => {
                            const removed = r;
                            const index = value.rows.findIndex((x) => x.id === r.id);
                            update((prev) => ({ ...prev, rows: prev.rows.filter((x) => x.id !== r.id) }));
                            toast(`Removed “${removed.name || "row"}”`, {
                              action: {
                                label: "Undo",
                                onClick: () =>
                                  update((prev) => {
                                    const rows = [...prev.rows];
                                    rows.splice(Math.min(index, rows.length), 0, removed);
                                    return { ...prev, rows };
                                  }),
                              },
                            });
                          }}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <Button
              intent="primary"
              onClick={() =>
                update((prev) => ({
                  ...prev,
                  rows: [...prev.rows, row({ name: "New item", purchaseAmt: 1, purchaseUnit: "g", price: 0, qty: 1, qtyUnit: "g", amortize: 1 })],
                }))
              }
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add row
            </Button>
            <Button onClick={() => update({ rows: DEFAULT_ROWS(), outputAmount: 60, amountPerPair: null })}>
              Reset to baseline
            </Button>
          </div>
          <p className="font-mono text-[11px] text-ink-soft mt-2 min-h-4">{status}</p>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <section className="rounded-xl border border-line bg-panel p-5 shadow-card">
              <h2 className="text-base font-semibold mb-3.5">Run totals</h2>
              <div className="flex justify-between items-baseline py-2 border-b border-dashed border-line">
                <span className="text-[13px] text-ink-soft">Total cost per run</span>
                <span className="font-mono text-lg font-semibold text-coir-dark">{peso(total)}</span>
              </div>
              <label className="block text-xs text-ink-soft mt-3.5 mb-1.5">
                Total treated output from this run (e.g. grams of treated coco peat)
              </label>
              <input
                className={`${inputCls} font-mono`}
                type="number" onWheel={blurOnWheel}
                value={value.outputAmount}
                onChange={(e) => update((prev) => ({ ...prev, outputAmount: parseFloat(e.target.value) || 0 }))}
              />
              <div className="flex justify-between items-baseline py-2 mt-2">
                <span className="text-[13px] text-ink-soft">Cost per unit of output</span>
                <span className="font-mono text-[15px] font-semibold">
                  {outAmt > 0 ? `${peso(costPerOutputUnit)} / unit` : "—"}
                </span>
              </div>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-card">
              <h2 className="text-base font-semibold mb-3.5">
                Cost per pair of slippers
              </h2>
              <label className="block text-xs text-ink-soft mb-1.5">
                Output amount used per pair (same unit as above)
              </label>
              <input
                className={`${inputCls} font-mono`}
                type="number" onWheel={blurOnWheel}
                placeholder="TBD — pending R&D confirmation"
                value={value.amountPerPair ?? ""}
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    amountPerPair: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                  }))
                }
              />
              <div className="mt-3.5 rounded-lg border border-coir/25 bg-coir-bg px-4 py-3.5">
                <p className={`text-2xl font-semibold ${pairCost === null ? "italic text-amber" : "text-coir-dark"}`}>
                  {pairCost === null ? "TBD" : peso(pairCost)}
                </p>
                <p className="text-xs text-ink-soft mt-1">
                  {pairCost === null
                    ? "Waiting on output-amount-per-pair from R&D to finalize."
                    : `Based on ${value.amountPerPair} output units per pair.`}
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
