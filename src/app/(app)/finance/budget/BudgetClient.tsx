"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/lib/format";
import { budgetVsActual, type BudgetRow, type Category, type ExpenseRow } from "@/lib/finance";

export function BudgetClient({
  month,
  budgets,
  categories,
  expenses,
}: {
  month: string;
  budgets: BudgetRow[];
  categories: Category[];
  expenses: ExpenseRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const active = categories.filter((c) => c.is_active);
  const planned = useMemo(() => Object.fromEntries(budgets.map((b) => [b.category_id, Number(b.amount)])), [budgets]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(active.map((c) => [c.id, planned[c.id] === undefined ? "" : String(planned[c.id])])),
  );
  const [busy, setBusy] = useState(false);
  const actual = useMemo(() => budgetVsActual(categories, [], expenses, month).lines, [categories, expenses, month]);
  const spent = (id: string) => actual.find((l) => l.category_id === id)?.actual ?? 0;

  async function save() {
    const rows: { month_start: string; category_id: string; amount: number }[] = [];
    for (const c of active) {
      const raw = (values[c.id] ?? "").trim().replace(/,/g, "");
      if (raw === "" && planned[c.id] === undefined) continue; // never set, still blank
      const n = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0) return toast.error(`Enter ${c.name} as 0 or more.`);
      if (n !== (planned[c.id] ?? 0) || planned[c.id] === undefined) rows.push({ month_start: month, category_id: c.id, amount: n });
    }
    if (rows.length === 0) return toast.success("Nothing to save.");
    setBusy(true);
    const { error } = await supabase.from("fin_budgets").upsert(rows, { onConflict: "month_start,category_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Budget saved.");
    router.refresh();
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
        <table className="w-full min-w-[30rem] text-left text-[13px]" aria-label="Budget by category">
          <thead>
            <tr className="border-b border-line">
              {["Category", "Planned (₱)", "Spent so far"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((c) => (
              <tr key={c.id} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2 text-ink">{c.name}</td>
                <td className="px-3 py-2">
                  <Input
                    className="w-40"
                    inputMode="decimal"
                    value={values[c.id] ?? ""}
                    aria-label={`Planned for ${c.name}`}
                    onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                  />
                </td>
                <td className="px-3 py-2 font-mono">{peso(spent(c.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button className="mt-3" intent="primary" size="sm" disabled={busy} onClick={save}>
        Save budget
      </Button>
    </div>
  );
}
