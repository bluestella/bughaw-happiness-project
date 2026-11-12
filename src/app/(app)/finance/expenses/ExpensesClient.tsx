"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DialogBackdrop, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/lib/format";
import {
  expensesToCsv,
  monthTotal,
  validateExpense,
  type Category,
  type ExpenseDraft,
  type ExpenseRow,
} from "@/lib/finance";
import { Field } from "../../sales/SalesShell";

export function ExpensesClient({
  expenses,
  categories,
  today,
  month,
  isAdmin,
}: {
  expenses: ExpenseRow[];
  categories: Category[];
  today: string;
  month: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const active = categories.filter((c) => c.is_active);
  const nameOf = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const [draft, setDraft] = useState<ExpenseDraft>({ spent_on: today, amount: "", category_id: "", vendor: "", description: "", reference: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null);
  const [reason, setReason] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const set = (k: keyof ExpenseDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = validateExpense(draft, today);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const { error } = await supabase.from("fin_expenses").insert(v.row);
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft((d) => ({ ...d, amount: "", vendor: "", description: "", reference: "" }));
    toast.success("Expense recorded.");
    router.refresh();
  }

  async function voidIt() {
    if (!voiding) return;
    if (!reason.trim()) return toast.error("Say why you are voiding it.");
    setBusy(true);
    const { error } = await supabase.from("fin_expenses").update({ void_reason: reason.trim() }).eq("id", voiding.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setVoiding(null);
    setReason("");
    toast.success("Expense voided.");
    router.refresh();
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const { error } = await supabase.from("fin_categories").insert({ name: newCategory.trim() });
    if (error) return toast.error(error.code === "23505" ? "That category already exists." : error.message);
    setNewCategory("");
    toast.success("Category added.");
    router.refresh();
  }

  function exportCsv() {
    const blob = new Blob([expensesToCsv(expenses, categories)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bughaw-expenses-${month.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} noValidate className="rounded-xl border border-line bg-white p-4 shadow-card" aria-label="Add an expense">
        <h2 className="mb-3 text-sm font-semibold text-ink">Add an expense</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={draft.spent_on} max={today} onChange={set("spent_on")} />
            {errors.spent_on && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.spent_on}</span>}
          </Field>
          <Field label="Amount (₱)">
            <Input inputMode="decimal" value={draft.amount} onChange={set("amount")} />
            {errors.amount && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.amount}</span>}
          </Field>
          <Field label="Category">
            <Select value={draft.category_id} onChange={set("category_id")} aria-label="Category">
              <option value="">Choose…</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {errors.category_id && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.category_id}</span>}
          </Field>
          <Field label="Vendor (optional)">
            <Input value={draft.vendor} onChange={set("vendor")} />
          </Field>
          <Field label="What it was for" className="sm:col-span-3">
            <Input value={draft.description} onChange={set("description")} />
            {errors.description && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.description}</span>}
          </Field>
          <Field label="Receipt no. (optional)">
            <Input value={draft.reference} onChange={set("reference")} />
          </Field>
        </div>
        <Button className="mt-3" intent="primary" size="sm" type="submit" disabled={busy}>
          Add expense
        </Button>
      </form>

      <section aria-label="Expenses this month">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">
            Total this month <span className="ml-2 font-mono text-[13px] font-normal">{peso(monthTotal(expenses, month))}</span>
          </h2>
          <Button size="sm" onClick={exportCsv} disabled={expenses.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Export CSV
          </Button>
        </div>
        {expenses.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No expenses this month.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
            <table className="w-full min-w-[42rem] text-left text-[13px]" aria-label="Expenses">
              <thead>
                <tr className="border-b border-line">
                  {["Date", "Category", "What it was for", "Amount", ""].map((h, i) => (
                    <th key={i} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((r) => (
                  <tr key={r.id} className={`border-b border-line/60 last:border-0 ${r.voided_at ? "text-ink-soft" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{r.spent_on}</td>
                    <td className="px-3 py-2">{nameOf[r.category_id] ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={r.voided_at ? "line-through" : ""}>{r.description}</span>
                      {r.vendor && <span className="block text-[11px] text-ink-soft">{r.vendor}</span>}
                      {r.reference && <span className="block font-mono text-[10px] text-ink-soft">{r.reference}</span>}
                      {r.voided_at && <span className="block text-[11px]">Voided: {r.void_reason}</span>}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 font-mono ${r.voided_at ? "line-through" : ""}`}>{peso(Number(r.amount))}</td>
                    <td className="px-3 py-2 text-right">
                      {!r.voided_at && (
                        <Button size="sm" onClick={() => setVoiding(r)} aria-label={`Void ${r.description}`}>
                          Void
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <form onSubmit={addCategory} className="flex flex-wrap items-end gap-2" aria-label="Add a category">
          <Field label="New category">
            <Input className="w-64" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          </Field>
          <Button size="sm" type="submit">
            Add category
          </Button>
        </form>
      )}

      <BaseDialog.Root open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <BaseDialog.Portal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>Void this expense?</DialogTitle>
            <DialogDescription>
              {voiding ? `${voiding.description}, ${peso(Number(voiding.amount))}. ` : ""}A voided expense stays on record, stops counting, and cannot be edited.
            </DialogDescription>
            <div className="mt-3">
              <Field label="Reason">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" onClick={() => setVoiding(null)}>
                Cancel
              </Button>
              <Button intent="danger" size="sm" disabled={busy} onClick={voidIt}>
                Void expense
              </Button>
            </div>
          </DialogPopup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </div>
  );
}
