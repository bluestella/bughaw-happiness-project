"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download, Printer } from "lucide-react";
import { useAppState } from "@/lib/useAppState";
import { peso } from "@/lib/format";
import {
  CATEGORY_LABEL,
  DEFAULT_STATE,
  computeRow,
  costReportCsv,
  fmtAmount,
  normalizeState,
  planProduction,
  summarize,
  type Category,
  type CostState,
} from "@/lib/costCalc";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CostBreakdown, ShoppingListTable, planFigures } from "../CostParts";

const inputCls =
  "w-full border border-line rounded-md bg-white px-2.5 py-2 text-[13px] transition-colors focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20";

function localIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function CostReport({ preparedBy }: { preparedBy: string }) {
  const { value: raw, update, loaded, status } = useAppState<CostState>("cost-calc", DEFAULT_STATE());
  const s = normalizeState(raw);
  const summary = summarize(s);
  const plan = planProduction(s, summary);

  const now = useMemo(() => new Date(), []);
  const dateLabel = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const title = s.reportTitle.trim() || "Unit cost report";

  const setMeta = (patch: Partial<Pick<CostState, "reportTitle" | "reportNotes">>) =>
    update((prev) => ({ ...normalizeState(prev), ...patch }));

  const downloadCsv = () => {
    const csv = costReportCsv(s, { title, preparedBy, date: localIsoDate(now), notes: s.reportNotes });
    // BOM so Excel opens the file as UTF-8 (₱, accents in item names).
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unit-cost-report";
    a.download = `${slug}-${localIsoDate(now)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!loaded) {
    return (
      <div className="space-y-3">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={8} />
      </div>
    );
  }

  const groups: Category[] = ["material", "equipment"];

  return (
    <div>
      {/* Toolbar + report details — never printed */}
      <div className="print:hidden">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <Button intent="ghost" asChild>
            <Link href="/tools/cost-calculator">
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              Back to calculator
            </Link>
          </Button>
          <div className="ml-auto flex flex-wrap gap-2.5">
            <Button onClick={downloadCsv}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Download CSV (Excel)
            </Button>
            <Button intent="primary" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden />
              Print / Save as PDF
            </Button>
          </div>
        </div>

        <section className="mb-6 rounded-xl border border-line bg-panel p-5 shadow-card">
          <h2 className="text-base font-semibold mb-1">Report details</h2>
          <p className="text-xs text-ink-soft mb-3.5">
            Shared with the team, like the rest of the calculator. To change the numbers, go back to the calculator.
          </p>
          <div className="grid gap-3.5 md:grid-cols-2">
            <div>
              <label htmlFor="report-title" className="block text-[13px] mb-1.5">Report title</label>
              <input
                id="report-title"
                className={inputCls}
                placeholder="e.g. Coir treatment trial #3"
                maxLength={120}
                value={s.reportTitle}
                onChange={(e) => setMeta({ reportTitle: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="report-notes" className="block text-[13px] mb-1.5">Notes</label>
              <textarea
                id="report-notes"
                className={`${inputCls} min-h-[72px] resize-y`}
                placeholder="Assumptions, supplier remarks, R&D observations…"
                maxLength={2000}
                value={s.reportNotes}
                onChange={(e) => setMeta({ reportNotes: e.target.value })}
              />
            </div>
          </div>
          <p className="font-mono text-[11px] text-ink-soft mt-2 min-h-4" role="status">{status}</p>
        </section>
      </div>

      {/* The report itself */}
      <article className="rounded-xl border border-line bg-panel p-6 sm:p-8 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-line pb-4 mb-5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-coir-dark">Bughaw Innovations · Unit cost report</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1">{title}</h1>
          <p className="text-[13px] text-ink-soft mt-1.5">
            {dateLabel}
            {preparedBy && <> · Prepared by {preparedBy}</>}
          </p>
        </header>

        {s.reportNotes.trim() && (
          <section className="mb-6 break-inside-avoid">
            <h2 className="font-mono text-[10.5px] uppercase tracking-wide text-ink-soft mb-1.5">Notes</h2>
            <p className="text-[13px] whitespace-pre-wrap">{s.reportNotes.trim()}</p>
          </section>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-3 print:grid-cols-3 break-inside-avoid">
          <Kpi label="Cost of one batch" value={peso(summary.totalPerBatch)} hint={`makes ${fmtAmount(s.outputAmount)} ${s.outputUnit}`} />
          <Kpi
            label={`Cost per ${s.outputUnit} of finished material`}
            value={s.outputAmount > 0 ? peso(summary.costPerOutputUnit, 4) : "—"}
          />
          <Kpi
            label="Cost per pair"
            value={summary.costPerPair === null ? "Not confirmed yet" : peso(summary.costPerPair)}
            hint={
              summary.costPerPair === null
                ? "waiting for R&D's amount per pair"
                : `${fmtAmount(s.amountPerPair ?? 0)} ${s.outputUnit} per pair`
            }
            emphasis
            pending={summary.costPerPair === null}
          />
        </section>

        {summary.mismatchedRows.length > 0 && (
          <div className="mb-6 flex gap-2.5 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger break-inside-avoid print-exact">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <p>
              Not counted because their units don&apos;t match:{" "}
              {summary.mismatchedRows.map((r) => `${r.name || "Unnamed item"} (${r.purchaseUnit} vs ${r.qtyUnit})`).join(", ")}.
              Totals are understated until fixed.
            </p>
          </div>
        )}

        <section className="mb-7 break-inside-avoid">
          <h2 className="text-base font-semibold mb-3">Where the money goes</h2>
          <CostBreakdown summary={summary} />
        </section>

        <section className="mb-7">
          <h2 className="text-base font-semibold mb-3">Line items</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-3 font-normal border-b border-line">Item</th>
                  <th className="py-2 pr-3 font-normal border-b border-line">Pack</th>
                  <th className="py-2 pr-3 font-normal border-b border-line text-right">Pack price</th>
                  <th className="py-2 pr-3 font-normal border-b border-line">Used per batch</th>
                  <th className="py-2 pr-3 font-normal border-b border-line text-right">Lasts</th>
                  <th className="py-2 pr-3 font-normal border-b border-line text-right">Cost / batch</th>
                  <th className="py-2 font-normal border-b border-line text-right">Share</th>
                </tr>
              </thead>
              {groups.map((g) => {
                const rows = s.rows.filter((r) => r.category === g);
                if (rows.length === 0) return null;
                return (
                  <tbody key={g}>
                    <tr>
                      <th colSpan={7} className="pt-3.5 pb-1 text-left text-[12px] font-semibold text-ink">
                        {g === "material" ? "Materials (used up each batch)" : "Equipment (reused; cost spread over its life)"}
                      </th>
                    </tr>
                    {rows.map((r) => {
                      const res = computeRow(r);
                      const share = summary.totalPerBatch > 0 ? (res.costPerBatch / summary.totalPerBatch) * 100 : 0;
                      return (
                        <tr key={r.id} className="border-b border-line break-inside-avoid">
                          <td className="py-1.5 pr-3">{r.name || "Unnamed item"}</td>
                          <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{fmtAmount(r.purchaseAmt)} {r.purchaseUnit}</td>
                          <td className="py-1.5 pr-3 font-mono text-right whitespace-nowrap">{peso(r.price)}</td>
                          <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{fmtAmount(r.qty)} {r.qtyUnit}</td>
                          <td className="py-1.5 pr-3 font-mono text-right whitespace-nowrap">
                            {r.amortize > 1 ? `${fmtAmount(r.amortize)} batches` : "1 batch"}
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-right whitespace-nowrap">
                            {res.mismatch ? <span className="text-danger">Check units</span> : peso(res.costPerBatch)}
                          </td>
                          <td className="py-1.5 font-mono text-right whitespace-nowrap text-ink-soft">{share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="break-inside-avoid">
                      <td colSpan={5} className="py-1.5 pr-3 text-ink-soft">{CATEGORY_LABEL[g]} subtotal</td>
                      <td className="py-1.5 pr-3 font-mono text-right font-semibold whitespace-nowrap">{peso(summary.byCategory[g])}</td>
                      <td />
                    </tr>
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td colSpan={5} className="pt-2.5 font-semibold">Total cost of one batch</td>
                  <td className="pt-2.5 pr-3 font-mono text-right font-semibold whitespace-nowrap">{peso(summary.totalPerBatch)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {plan && (
          <section className="mb-7">
            <h2 className="text-base font-semibold mb-1">Production plan</h2>
            <p className="text-[13px] text-ink-soft mb-3">
              For {plan.targetPairs.toLocaleString("en-PH")} usable pairs
              {plan.wastePct > 0 ? `, allowing ${plan.wastePct}% for waste and rejects` : ""}.
            </p>
            <dl className="mb-5 grid gap-3 grid-cols-2 sm:grid-cols-5 print:grid-cols-5 break-inside-avoid">
              {planFigures(plan).map((f) => (
                <div key={f.label} className="rounded-lg border border-line px-3 py-2">
                  <dt className="text-[11px] text-ink-soft">{f.label}</dt>
                  <dd className="font-mono text-[14px] font-semibold mt-0.5">{f.value}</dd>
                  {f.hint && <dd className="text-[10.5px] text-ink-soft">{f.hint}</dd>}
                </div>
              ))}
            </dl>
            <h3 className="text-[13px] font-semibold mb-1.5">Shopping list</h3>
            <ShoppingListTable plan={plan} />
          </section>
        )}

        <footer className="border-t border-line pt-3 text-[11px] text-ink-soft">
          All amounts in Philippine pesos (₱). Equipment cost is spread across the number of batches it lasts; the
          shopping list counts whole packs.{plan ? " “Cost of this order” and “cash to buy supplies” differ because leftover packs and equipment life carry over to future batches." : ""}{" "}
          Generated {now.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })} from the Bughaw Suite Unit Cost Calculator.
        </footer>
      </article>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  emphasis,
  pending,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 print-exact ${
        pending ? "border-dashed border-line" : emphasis ? "border-coir/25 bg-coir-bg" : "border-line"
      }`}
    >
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`font-mono text-lg font-semibold mt-0.5 ${pending ? "font-sans text-base text-ink-soft" : emphasis ? "text-coir-dark" : ""}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-ink-soft">{hint}</p>}
    </div>
  );
}
