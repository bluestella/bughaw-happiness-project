"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, FileText, FlaskConical, Plus, X } from "lucide-react";
import { useAppState } from "@/lib/useAppState";
import { peso } from "@/lib/format";
import {
  BASE_UNIT,
  CATEGORY_LABEL,
  DEFAULT_STATE,
  UNITS,
  clampWaste,
  compatibleUnits,
  computeRow,
  dimensionOf,
  makeRow,
  normalizeState,
  planProduction,
  summarize,
  unitsCompatible,
  type Category,
  type CostRow,
  type CostState,
} from "@/lib/costCalc";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CostBreakdown, ShoppingListTable, planFigures } from "./CostParts";

const inputCls =
  "w-full border border-line rounded-md bg-white px-2 py-1.5 text-[13px] transition-colors focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20";
const mismatchCls = "border-danger-border bg-danger-bg";
/* Same look as inputCls but a fixed width — cn() is plain clsx, so mixing
   w-full and a fixed width on one element lets w-full win and squeezes the amount box. */
const selectCls =
  "w-[58px] shrink-0 border border-line rounded-md bg-white px-1 py-1.5 text-[13px] transition-colors focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20";

/* Prevents scroll-wheel from silently changing focused number inputs. */
const blurOnWheel = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

/**
 * Number input that keeps what you type while focused, so clearing a field to
 * type a new number doesn't snap it back to a default mid-edit.
 */
function NumInput({
  value,
  onChange,
  label,
  id,
  min = 0,
  max,
  placeholder,
  className,
  invalid,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  /** Accessible name; omit when a <label htmlFor={id}> names the input. */
  label?: string;
  id?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      className={`${inputCls} min-w-0 font-mono tabular-nums ${invalid ? mismatchCls : ""} ${className ?? ""}`}
      type="number"
      inputMode="decimal"
      step="any"
      min={min}
      max={max}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      onWheel={blurOnWheel}
      value={draft ?? (value ?? "")}
      onFocus={() => setDraft(value === null ? "" : String(value))}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        onChange(e.target.value === "" ? null : Number.isFinite(n) ? n : null);
      }}
    />
  );
}

function UnitSelect({
  value,
  options,
  onChange,
  label,
  invalid,
}: {
  value: string;
  options: readonly string[];
  onChange: (u: string) => void;
  label: string;
  invalid?: boolean;
}) {
  // A legacy value outside the allowed options must stay selectable so the
  // mismatch is visible rather than silently replaced.
  const opts = options.includes(value) ? options : [value, ...options];
  return (
    <select
      className={`${selectCls} ${invalid ? mismatchCls : ""}`}
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {opts.map((u) => (
        <option key={u}>{u}</option>
      ))}
    </select>
  );
}

const TH = ({ children, hint, className }: { children: React.ReactNode; hint?: string; className?: string }) => (
  <th className={`text-left align-bottom px-1.5 py-3 first:pl-3 border-b border-line ${className ?? ""}`}>
    <span className="block font-mono text-[10.5px] uppercase tracking-wide text-ink-soft whitespace-nowrap">{children}</span>
    {hint && <span className="block text-[11px] font-normal text-ink-soft/80 truncate">{hint}</span>}
  </th>
);

export default function CostCalculatorPage() {
  const { value: raw, update: rawUpdate, loaded, status } = useAppState<CostState>("cost-calc", DEFAULT_STATE());
  const [confirmReset, setConfirmReset] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  // Older saved documents lack newer fields (category, output unit, planner…).
  const value = normalizeState(raw);
  const update = (fn: (prev: CostState) => CostState) => rawUpdate((prev) => fn(normalizeState(prev)));

  const summary = summarize(value);
  const plan = planProduction(value, summary);
  const outUnit = value.outputUnit;

  const setRow = (id: string, patch: Partial<CostRow>) =>
    update((prev) => ({ ...prev, rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  /** Changing what a pack is measured in also moves "used per batch" to a matching unit. */
  const setPurchaseUnit = (r: CostRow, unit: string) =>
    setRow(r.id, unitsCompatible(unit, r.qtyUnit) ? { purchaseUnit: unit } : { purchaseUnit: unit, qtyUnit: BASE_UNIT[dimensionOf(unit)] });

  /** Materials are used up by definition, so switching to Material resets the lifetime. */
  const setCategory = (r: CostRow, category: Category) =>
    setRow(r.id, category === "material" ? { category, amortize: 1 } : { category });

  const removeRow = (r: CostRow) => {
    const index = value.rows.findIndex((x) => x.id === r.id);
    update((prev) => ({ ...prev, rows: prev.rows.filter((x) => x.id !== r.id) }));
    toast(`Removed “${r.name || "item"}”`, {
      action: {
        label: "Undo",
        onClick: () =>
          update((prev) => {
            const rows = [...prev.rows];
            rows.splice(Math.min(index, rows.length), 0, r);
            return { ...prev, rows };
          }),
      },
    });
  };

  const addRow = (category: Category) => {
    const added =
      category === "material"
        ? makeRow({ name: "", category, purchaseAmt: 1, purchaseUnit: "kg", price: 0, qty: 0, qtyUnit: "g", amortize: 1 })
        : makeRow({ name: "", category, purchaseAmt: 1, purchaseUnit: "pcs", price: 0, qty: 1, qtyUnit: "pcs", amortize: 50 });
    setFocusId(added.id);
    update((prev) => ({ ...prev, rows: [...prev.rows, added] }));
  };

  /* Focus the visible name field of a just-added row (table on desktop, card on phones). */
  const focusNewRow = useCallback((el: HTMLInputElement | null) => {
    if (el && el.offsetParent !== null) el.focus();
  }, []);

  return (
    <div>
      <CalculatorHeader
        icon={FlaskConical}
        eyebrow="Internal R&D costing"
        title="Unit Cost Calculator"
        description="List everything that goes into one batch: what you buy, what it costs, and how much of it one batch uses. Totals update as you type and are shared with the whole team."
        aside={
          <Button intent="primary" asChild>
            <Link href="/tools/cost-calculator/report">
              <FileText className="mr-1.5 h-4 w-4" aria-hidden />
              Generate report
            </Link>
          </Button>
        }
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
          <h2 className="text-base font-semibold mb-1">1. What goes into one batch</h2>
          <p className="text-[13px] text-ink-soft mb-3 max-w-3xl">
            <strong className="font-semibold text-ink">Materials</strong> are used up in a batch (coco peat, chemicals).{" "}
            <strong className="font-semibold text-ink">Equipment</strong> is reused (beakers, gloves) — its price is spread
            across the number of batches it lasts.
          </p>

          {summary.mismatchedRows.length > 0 && (
            <div role="alert" className="mb-3 flex gap-2.5 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <p>
                {summary.mismatchedRows.map((r) => `“${r.name || "Unnamed item"}”`).join(", ")}{" "}
                {summary.mismatchedRows.length === 1 ? "is" : "are"} left out of the totals: the pack is measured in one kind of unit
                and the amount used in another (for example kg vs mL). Make both weight, both volume, or both pieces.
              </p>
            </div>
          )}

          {/* Wide screens: table. Fixed layout so it always fits — no sideways scroll. */}
          <div className="hidden xl:block overflow-hidden rounded-xl border border-line bg-panel shadow-card">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col />
                <col className="w-[118px]" />
                <col className="w-[148px]" />
                <col className="w-[100px]" />
                <col className="w-[148px]" />
                <col className="w-[84px]" />
                <col className="w-[112px]" />
                <col className="w-[44px]" />
              </colgroup>
              <thead>
                <tr className="bg-paper">
                  <TH>Item</TH>
                  <TH>Type</TH>
                  <TH hint="size of one pack">Pack you buy</TH>
                  <TH hint="₱ per pack">Pack price</TH>
                  <TH hint="in one batch">Amount used</TH>
                  <TH hint="equipment">Lasts</TH>
                  <TH className="text-right">Cost / batch</TH>
                  <th className="border-b border-line" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {value.rows.map((r) => {
                  const res = computeRow(r);
                  const label = r.name || "item";
                  return (
                    <tr key={r.id} className={`border-b border-line last:border-0 ${r.id === focusId ? "row-enter" : ""} ${res.mismatch ? "bg-danger-bg/40" : ""}`}>
                      <td className="px-1.5 py-2 pl-3">
                        <input ref={r.id === focusId ? focusNewRow : undefined} className={inputCls} placeholder="Item name" aria-label="Item name" title={r.name || undefined} value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} />
                      </td>
                      <td className="px-1.5 py-2">
                        <select className={`${inputCls} px-1.5`} aria-label={`Type of ${label}`} value={r.category} onChange={(e) => setCategory(r, e.target.value as Category)}>
                          <option value="material">{CATEGORY_LABEL.material}</option>
                          <option value="equipment">{CATEGORY_LABEL.equipment}</option>
                        </select>
                      </td>
                      <td className="px-1.5 py-2">
                        <div className="flex gap-1">
                          <NumInput label={`Pack size of ${label}`} value={r.purchaseAmt} onChange={(n) => setRow(r.id, { purchaseAmt: n ?? 0 })} />
                          <UnitSelect label={`Pack unit of ${label}`} value={r.purchaseUnit} options={UNITS} onChange={(u) => setPurchaseUnit(r, u)} invalid={res.mismatch} />
                        </div>
                      </td>
                      <td className="px-1.5 py-2">
                        <NumInput label={`Pack price of ${label} in pesos`} value={r.price} onChange={(n) => setRow(r.id, { price: n ?? 0 })} />
                      </td>
                      <td className="px-1.5 py-2">
                        <div className="flex gap-1">
                          <NumInput label={`Amount of ${label} used per batch`} value={r.qty} onChange={(n) => setRow(r.id, { qty: n ?? 0 })} invalid={res.mismatch} />
                          <UnitSelect label={`Unit of amount used for ${label}`} value={r.qtyUnit} options={compatibleUnits(r.purchaseUnit)} onChange={(u) => setRow(r.id, { qtyUnit: u })} invalid={res.mismatch} />
                        </div>
                      </td>
                      <td className="px-1.5 py-2">
                        {r.category === "equipment" ? (
                          <NumInput label={`Batches one ${label} lasts`} min={1} value={r.amortize} onChange={(n) => setRow(r.id, { amortize: n && n >= 1 ? n : 1 })} />
                        ) : (
                          <span className="block px-1 text-[12px] text-ink-soft">Used up</span>
                        )}
                      </td>
                      <td className="px-1.5 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {res.mismatch ? (
                          <span className="text-[13px] text-danger">Check units</span>
                        ) : (
                          <>
                            <span className="block text-[13px] font-semibold">{peso(res.costPerBatch)}</span>
                            <span className="block text-[10.5px] text-ink-soft">
                              {peso(res.unitPrice, 4)}/{res.baseUnit === "pcs" ? "pc" : res.baseUnit}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-1.5">
                        <RemoveButton name={label} onClick={() => removeRow(r)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-paper">
                  <td className="pl-3 pr-1.5 py-3 text-[13px] font-semibold" colSpan={6}>Total cost of one batch</td>
                  <td className="px-1.5 py-3 font-mono tabular-nums text-[15px] font-semibold text-coir-dark text-right whitespace-nowrap">{peso(summary.totalPerBatch)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Narrower screens: one card per item (two across on tablets) */}
          <div className="xl:hidden grid gap-3 md:grid-cols-2">
            {value.rows.map((r) => {
              const res = computeRow(r);
              const label = r.name || "item";
              return (
                <div key={r.id} className={`rounded-xl border bg-panel p-3.5 shadow-card ${r.id === focusId ? "row-enter" : ""} ${res.mismatch ? "border-danger-border" : "border-line"}`}>
                  <div className="flex gap-2">
                    <input ref={r.id === focusId ? focusNewRow : undefined} className={inputCls} placeholder="Item name" aria-label="Item name" title={r.name || undefined} value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} />
                    <RemoveButton name={label} onClick={() => removeRow(r)} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <Field label="Type">
                      <select className={inputCls} aria-label={`Type of ${label}`} value={r.category} onChange={(e) => setCategory(r, e.target.value as Category)}>
                        <option value="material">{CATEGORY_LABEL.material}</option>
                        <option value="equipment">{CATEGORY_LABEL.equipment}</option>
                      </select>
                    </Field>
                    <Field label="Pack price (₱)">
                      <NumInput label={`Pack price of ${label} in pesos`} value={r.price} onChange={(n) => setRow(r.id, { price: n ?? 0 })} />
                    </Field>
                    <Field label="Pack you buy">
                      <div className="flex gap-1.5">
                        <NumInput label={`Pack size of ${label}`} value={r.purchaseAmt} onChange={(n) => setRow(r.id, { purchaseAmt: n ?? 0 })} />
                        <UnitSelect label={`Pack unit of ${label}`} value={r.purchaseUnit} options={UNITS} onChange={(u) => setPurchaseUnit(r, u)} invalid={res.mismatch} />
                      </div>
                    </Field>
                    <Field label="Amount used per batch">
                      <div className="flex gap-1.5">
                        <NumInput label={`Amount of ${label} used per batch`} value={r.qty} onChange={(n) => setRow(r.id, { qty: n ?? 0 })} invalid={res.mismatch} />
                        <UnitSelect label={`Unit of amount used for ${label}`} value={r.qtyUnit} options={compatibleUnits(r.purchaseUnit)} onChange={(u) => setRow(r.id, { qtyUnit: u })} invalid={res.mismatch} />
                      </div>
                    </Field>
                    <Field label="Batches it lasts">
                      {r.category === "equipment" ? (
                        <NumInput label={`Batches one ${label} lasts`} min={1} value={r.amortize} onChange={(n) => setRow(r.id, { amortize: n && n >= 1 ? n : 1 })} />
                      ) : (
                        <p className="py-1.5 text-[13px] text-ink-soft">Used up in one batch</p>
                      )}
                    </Field>
                    <Field label="Cost per batch">
                      <p className="py-1.5 font-mono text-[14px] font-semibold">
                        {res.mismatch ? <span className="text-danger font-normal text-[13px]">Check units</span> : peso(res.costPerBatch)}
                      </p>
                    </Field>
                  </div>
                </div>
              );
            })}
            <div className="md:col-span-2 flex justify-between rounded-xl border border-line bg-paper px-4 py-3">
              <span className="text-[13px] font-semibold">Total cost of one batch</span>
              <span className="font-mono text-[15px] font-semibold text-coir-dark">{peso(summary.totalPerBatch)}</span>
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <Button onClick={() => addRow("material")}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add material
            </Button>
            <Button onClick={() => addRow("equipment")}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add equipment
            </Button>
            <Button intent="ghost" className="ml-auto" onClick={() => setConfirmReset(true)}>
              Reset to starting example
            </Button>
          </div>
          <p className="font-mono text-[11px] text-ink-soft mt-2 min-h-4" role="status">{status}</p>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <section className="rounded-xl border border-line bg-panel p-5 shadow-card">
              <h2 className="text-base font-semibold mb-3.5">2. What one batch makes</h2>
              <label htmlFor="batch-output" className="block text-[13px] text-ink mb-1">
                How much finished material does one batch make?
              </label>
              <p className="text-xs text-ink-soft mb-1.5">For example, 60 g of treated coco peat.</p>
              <div className="flex gap-1.5">
                <NumInput
                  id="batch-output"
                  value={value.outputAmount}
                  onChange={(n) => update((prev) => ({ ...prev, outputAmount: n ?? 0 }))}
                />
                <UnitSelect label="Unit of batch output" value={outUnit} options={UNITS} onChange={(u) => update((prev) => ({ ...prev, outputUnit: u }))} />
              </div>
              <dl className="mt-3">
                <div className="flex justify-between items-baseline py-2 border-b border-dashed border-line">
                  <dt className="text-[13px] text-ink-soft">Total cost of one batch</dt>
                  <dd className="font-mono text-[15px] font-semibold">{peso(summary.totalPerBatch)}</dd>
                </div>
                <div className="flex justify-between items-baseline py-2">
                  <dt className="text-[13px] text-ink-soft">Cost per {outUnit} of finished material</dt>
                  <dd className="font-mono text-[15px] font-semibold">
                    {value.outputAmount > 0 ? peso(summary.costPerOutputUnit, 4) : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-card">
              <h2 className="text-base font-semibold mb-3.5">3. Cost per pair of slippers</h2>
              <label htmlFor="per-pair" className="block text-[13px] text-ink mb-1">
                How much finished material goes into one pair? ({outUnit})
              </label>
              <p className="text-xs text-ink-soft mb-1.5">Leave blank until R&amp;D confirms the amount.</p>
              <NumInput
                id="per-pair"
                value={value.amountPerPair}
                placeholder="Waiting for R&D"
                onChange={(n) => update((prev) => ({ ...prev, amountPerPair: n }))}
              />
              <div
                className={`mt-3.5 rounded-lg border px-4 py-3.5 ${
                  summary.costPerPair === null ? "border-dashed border-line bg-paper/60" : "border-coir/25 bg-coir-bg"
                }`}
              >
                {summary.costPerPair === null ? (
                  <p className="text-[15px] font-semibold text-ink-soft">Waiting for the amount per pair</p>
                ) : (
                  <p className="font-mono tabular-nums text-2xl font-semibold text-coir-dark">{peso(summary.costPerPair)}</p>
                )}
                <p className="text-xs text-ink-soft mt-1">
                  {summary.costPerPair === null || summary.pairsPerBatch === null
                    ? "Cost per pair appears here once it's entered."
                    : `Uses ${value.amountPerPair} ${outUnit} per pair — one batch makes about ${summary.pairsPerBatch.toLocaleString("en-PH", { maximumFractionDigits: 1 })} pairs.`}
                </p>
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-xl border border-line bg-panel p-5 shadow-card">
            <h2 className="text-base font-semibold mb-1">4. Where the money goes</h2>
            <p className="text-[13px] text-ink-soft mb-4">Each item&apos;s share of one batch, biggest first.</p>
            <CostBreakdown summary={summary} />
          </section>

          <section className="mt-6 rounded-xl border border-line bg-panel p-5 shadow-card">
            <h2 className="text-base font-semibold mb-1">5. Plan a production order</h2>
            <p className="text-[13px] text-ink-soft mb-4">
              Enter how many pairs you need to see how many batches to make and what to buy.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
              <div>
                <label htmlFor="target-pairs" className="block text-[13px] mb-1.5">Pairs you want to make</label>
                <NumInput
                  id="target-pairs"
                  placeholder="e.g. 500"
                  value={value.targetPairs}
                  onChange={(n) => update((prev) => ({ ...prev, targetPairs: n }))}
                />
              </div>
              <div>
                <label htmlFor="waste" className="block text-[13px] mb-1.5">Expected waste or rejects</label>
                <div className="relative">
                  <NumInput
                    id="waste"
                    className="pr-7"
                    max={95}
                    placeholder="0"
                    value={value.wastePct || null}
                    onChange={(n) => update((prev) => ({ ...prev, wastePct: clampWaste(n ?? 0) }))}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft" aria-hidden>%</span>
                </div>
              </div>
            </div>

            {plan ? (
              <>
                <dl className="mt-5 grid gap-3 grid-cols-2 lg:grid-cols-5">
                  {planFigures(plan).map((f) => (
                    <div key={f.label} className="rounded-lg border border-line px-3.5 py-2.5">
                      <dt className="text-xs text-ink-soft">{f.label}</dt>
                      <dd className="font-mono text-[15px] font-semibold mt-0.5">{f.value}</dd>
                      {f.hint && <dd className="text-[11px] text-ink-soft">{f.hint}</dd>}
                    </div>
                  ))}
                </dl>
                <h3 className="text-[13px] font-semibold mt-5 mb-1">Shopping list</h3>
                <p className="text-xs text-ink-soft mb-2">Rounded up to whole packs. Equipment counts how many you need for the batches it lasts.</p>
                <ShoppingListTable plan={plan} />
              </>
            ) : (
              <p className="mt-4 text-[13px] text-amber">
                {summary.pairsPerBatch === null
                  ? "The plan needs the amount per pair (step 3) and how much one batch makes (step 2)."
                  : "Enter the number of pairs to see the plan."}
              </p>
            )}
          </section>

          <ConfirmDialog
            open={confirmReset}
            onOpenChange={setConfirmReset}
            title="Reset to the starting example?"
            description="This replaces every item, amount and plan with the original example — for the whole team. It can't be undone."
            confirmLabel="Reset for everyone"
            onConfirm={() => {
              rawUpdate(DEFAULT_STATE());
              toast("Calculator reset to the starting example.");
            }}
          />
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-ink-soft mb-1">{label}</p>
      {children}
    </div>
  );
}

function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="remove-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft/70 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100 focus:outline-none focus-visible:text-danger focus-visible:ring-2 focus-visible:ring-danger/30"
      aria-label={`Remove ${name}`}
      onClick={onClick}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
