import { peso } from "@/lib/format";
import { CATEGORY_LABEL, type CostSummary, type PlanResult } from "@/lib/costCalc";
import { cn } from "@/lib/cn";

/** Coloured swatch per category — Bughaw Blue for materials, Warm Brown for equipment. */
export const CATEGORY_BAR = { material: "bg-coir", equipment: "bg-clay" } as const;

/**
 * "Where the money goes": category subtotals, then every item ranked by cost
 * with a share-of-batch bar. Shared by the calculator page and the report.
 */
export function CostBreakdown({ summary, className }: { summary: CostSummary; className?: string }) {
  const { totalPerBatch, byCategory, breakdown } = summary;
  const items = breakdown.filter((b) => b.costPerBatch > 0);

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {(["material", "equipment"] as const).map((c) => (
          <div key={c} className="rounded-lg border border-line px-3.5 py-2.5 break-inside-avoid">
            <p className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-sm print-exact", CATEGORY_BAR[c])} aria-hidden />
              {c === "material" ? "Materials (used up)" : "Equipment (reused)"}
            </p>
            <p className="font-mono text-[15px] font-semibold mt-0.5">{peso(byCategory[c])}</p>
            <p className="text-[11px] text-ink-soft">
              {totalPerBatch > 0 ? `${((byCategory[c] / totalPerBatch) * 100).toFixed(0)}% of each batch` : "—"}
            </p>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-[13px] text-ink-soft">Add prices to your items to see what drives the cost.</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((b) => (
            <li key={b.id} className="break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate">
                  {b.name || "Unnamed item"}
                  <span className="ml-1.5 text-[11px] text-ink-soft">{CATEGORY_LABEL[b.category]}</span>
                </span>
                <span className="shrink-0 font-mono">
                  {peso(b.costPerBatch)}
                  <span className="ml-2 inline-block w-11 text-right text-ink-soft">{b.sharePct.toFixed(1)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper overflow-hidden print-exact" aria-hidden>
                <div
                  className={cn("h-full rounded-full print-exact", CATEGORY_BAR[b.category])}
                  style={{ width: `${Math.max(1, b.sharePct)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Key figures of a production plan, as label/value pairs. */
export function planFigures(plan: PlanResult): Array<{ label: string; value: string; hint?: string }> {
  return [
    {
      label: "Batches to make",
      value: plan.batchesNeeded.toLocaleString("en-PH"),
      hint: `≈ ${plan.goodPairsProduced.toLocaleString("en-PH", { maximumFractionDigits: 1 })} usable pairs`,
    },
    {
      label: "Usable pairs per batch",
      value: plan.goodPairsPerBatch.toLocaleString("en-PH", { maximumFractionDigits: 2 }),
      hint: plan.wastePct > 0 ? `after ${plan.wastePct}% waste` : "no waste assumed",
    },
    {
      label: "Cost per usable pair",
      value: peso(plan.costPerGoodPair),
      hint: "waste included",
    },
    {
      label: "Cost of this order",
      value: peso(plan.costCharged),
      hint: "equipment spread over its lifetime",
    },
    {
      label: "Cash to buy supplies",
      value: peso(plan.cashToBuy),
      hint: "whole packs, from the list below",
    },
  ];
}

export function ShoppingListTable({ plan }: { plan: PlanResult }) {
  if (plan.shopping.length === 0) {
    return <p className="text-[13px] text-ink-soft">Nothing to buy — add pack sizes and prices to your items.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left font-mono text-[10.5px] uppercase tracking-wide text-ink-soft">
            <th className="py-2 pr-3 font-normal border-b border-line">Item</th>
            <th className="py-2 pr-3 font-normal border-b border-line">Buy</th>
            <th className="py-2 pr-3 font-normal border-b border-line">Pack size</th>
            <th className="py-2 font-normal border-b border-line text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {plan.shopping.map((l) => (
            <tr key={l.id} className="border-b border-line last:border-0 break-inside-avoid">
              <td className="py-2 pr-3">
                {l.name || "Unnamed item"}
                <span className="ml-1.5 text-[11px] text-ink-soft">{CATEGORY_LABEL[l.category]}</span>
              </td>
              <td className="py-2 pr-3 font-mono whitespace-nowrap">× {l.packs.toLocaleString("en-PH")}</td>
              <td className="py-2 pr-3 font-mono whitespace-nowrap">{l.packSize}</td>
              <td className="py-2 font-mono text-right whitespace-nowrap">{peso(l.cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="pt-2.5" colSpan={3}>Total cash needed</td>
            <td className="pt-2.5 font-mono text-right">{peso(plan.cashToBuy)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
