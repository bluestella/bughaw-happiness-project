"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { peso, pesoRound } from "@/lib/format";
import {
  budgetVsActual,
  latestCash,
  monthLabel,
  monthStart,
  monthlyBurn,
  runwayMonths,
  runwayVerdict,
  type BudgetRow,
  type CashRow,
  type Category,
  type ExpenseRow,
} from "@/lib/finance";
import { Field } from "../sales/SalesShell";

export function FinanceOverview({
  cash,
  expenses,
  budgets,
  categories,
  today,
  isAdmin,
}: {
  cash: CashRow[];
  expenses: ExpenseRow[];
  budgets: BudgetRow[];
  categories: Category[];
  today: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const latest = latestCash(cash);
  const burn = monthlyBurn(expenses, today);
  const months = runwayMonths(latest?.amount ?? 0, burn?.burn ?? null);
  const verdict = runwayVerdict(latest ? months : null);
  const month = monthStart(today);
  const bva = budgetVsActual(categories, budgets, expenses, month);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.trim().replace(/,/g, ""));
    if (amount.trim() === "" || !Number.isFinite(n) || n < 0) return toast.error("Enter the cash on hand as 0 or more.");
    setBusy(true);
    const body = { as_of: asOf, amount: n, note: note.trim() || null };
    // A second entry for the same day is a correction, which only a super_admin may make.
    const existing = cash.find((c) => c.as_of === asOf);
    const { error } = existing
      ? await supabase.from("fin_cash_balances").update({ amount: n, note: body.note }).eq("id", existing.id)
      : await supabase.from("fin_cash_balances").insert(body);
    setBusy(false);
    if (error) return toast.error(existing && !isAdmin ? "Only a super_admin can correct a day that already has a balance." : error.message);
    setAmount("");
    setNote("");
    toast.success("Cash balance saved.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-3" aria-label="Cash position">
        <div className="rounded-xl border border-line bg-white p-4 shadow-card">
          <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">Cash on hand</dt>
          <dd className="mt-1 text-2xl font-semibold text-ink">{latest ? peso(Number(latest.amount)) : "—"}</dd>
          <dd className="mt-1 text-[11px] text-ink-soft">{latest ? `as of ${latest.as_of}` : "No balance recorded yet."}</dd>
        </div>
        <div className="rounded-xl border border-line bg-white p-4 shadow-card">
          <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">Monthly spending</dt>
          <dd className="mt-1 text-2xl font-semibold text-ink">{burn ? pesoRound(burn.burn) : "—"}</dd>
          <dd className="mt-1 text-[11px] text-ink-soft">
            {burn ? `average of the last ${burn.monthsUsed} complete month${burn.monthsUsed === 1 ? "" : "s"}` : "Needs a completed month of expenses."}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-white p-4 shadow-card">
          <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">Runway</dt>
          <dd className={`mt-1 text-2xl font-semibold ${months !== null && !verdict.ok ? "text-danger" : "text-ink"}`}>
            {months === null ? "—" : `${months} months`}
          </dd>
          <dd className="mt-1 text-[11px] text-ink-soft">Cash ÷ monthly spending.</dd>
        </div>
      </dl>
      <p role="status" className={`rounded-lg border px-4 py-3 text-[13px] ${verdict.ok ? "border-line bg-white text-ink" : "border-danger-border bg-danger-bg text-danger"}`}>
        {verdict.text}
      </p>

      <form onSubmit={record} className="rounded-xl border border-line bg-white p-4 shadow-card" aria-label="Record cash balance">
        <h2 className="mb-3 text-sm font-semibold text-ink">Record the cash balance</h2>
        <p className="mb-3 text-[12px] text-ink-soft">Add up your bank and cash accounts on the day, and enter the total.</p>
        <div className="grid items-end gap-3 sm:grid-cols-[10rem_12rem_1fr_auto]">
          <Field label="As of">
            <Input type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
          <Field label="Total cash (₱)">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button intent="primary" size="sm" type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>

      <section aria-label="This month against budget">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{monthLabel(month)}: spending against budget</h2>
          <Link href="/finance/budget" className="text-[12px] text-coir-dark hover:underline">
            Set the budget →
          </Link>
        </div>
        {bva.lines.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No budget or spending recorded for this month yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
            <table className="w-full min-w-[34rem] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  {["Category", "Planned", "Spent", "Left", "Used"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bva.lines.map((l) => (
                  <tr key={l.category_id} className="border-b border-line/60">
                    <td className="px-3 py-2 text-ink">{l.name}</td>
                    <td className="px-3 py-2 font-mono">{peso(l.planned)}</td>
                    <td className="px-3 py-2 font-mono">{peso(l.actual)}</td>
                    <td className={`px-3 py-2 font-mono ${l.variance < 0 ? "text-danger" : ""}`}>{peso(l.variance)}</td>
                    <td className={`px-3 py-2 font-mono ${l.over ? "text-danger" : ""}`}>{l.percentUsed === null ? "no budget" : `${l.percentUsed}%`}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 font-mono">{peso(bva.planned)}</td>
                  <td className="px-3 py-2 font-mono">{peso(bva.actual)}</td>
                  <td className={`px-3 py-2 font-mono ${bva.variance < 0 ? "text-danger" : ""}`}>{peso(bva.variance)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
