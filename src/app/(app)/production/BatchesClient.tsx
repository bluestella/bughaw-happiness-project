"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/lib/format";
import {
  batchTotals,
  batchesToCsv,
  costPerPair,
  goodPairs,
  hoursPerPair,
  validateBatch,
  yieldPct,
  type BatchDraft,
  type BatchRow,
} from "@/lib/production";
import { Field } from "../sales/SalesShell";
import { FieldError, downloadCsv } from "./ProductionShell";

type Product = { id: string; name: string; sku: string; is_active: boolean };

export function BatchesClient({ batches, products, today, isAdmin }: { batches: BatchRow[]; products: Product[]; today: string; isAdmin: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const blank: BatchDraft = { batch_no: "", product_id: "", made_on: today, qty_made: "", qty_rejected: "", labor_hours: "", total_cost: "", notes: "" };
  const [draft, setDraft] = useState<BatchDraft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof BatchDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState<BatchRow | null>(null);
  const [deleting, setDeleting] = useState<BatchRow | null>(null);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? "Unknown product";
  const totals = batchTotals(batches);
  const set = (k: keyof BatchDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  function edit(b: BatchRow) {
    setEditing(b.id);
    setErrors({});
    setDraft({
      batch_no: b.batch_no, product_id: b.product_id, made_on: b.made_on, qty_made: String(b.qty_made), qty_rejected: String(b.qty_rejected),
      labor_hours: String(b.labor_hours || ""), total_cost: String(b.total_cost || ""), notes: b.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() {
    setEditing(null);
    setErrors({});
    setDraft(blank);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateBatch(draft, today);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const { error } = editing
      ? await supabase.from("production_batches").update(v.row).eq("id", editing)
      : await supabase.from("production_batches").insert(v.row);
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "That batch number is already used." : error.message);
    toast.success(editing ? "Batch updated." : "Batch recorded.");
    reset();
    router.refresh();
  }

  async function complete() {
    if (!completing) return;
    const { error } = await supabase.from("production_batches").update({ status: "completed" }).eq("id", completing.id);
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success(`Batch completed. ${goodPairs(completing.qty_made, completing.qty_rejected)} pairs added to stock.`);
    router.refresh();
  }
  async function remove() {
    if (!deleting) return;
    const { error } = await supabase.from("production_batches").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success("Batch deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section aria-label="Completed batches" className="grid gap-3 sm:grid-cols-4">
        {[
          ["Completed batches", String(totals.batches)],
          ["Good pairs", String(totals.good)],
          ["Yield", `${totals.yieldPct}%`],
          ["Cost per good pair", peso(totals.costPerPair)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-white p-3 shadow-card">
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{label}</p>
            <p className="text-lg font-semibold text-ink">{value}</p>
          </div>
        ))}
      </section>

      <form onSubmit={submit} noValidate aria-label={editing ? "Edit batch" : "Record a batch"} className="rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">{editing ? "Edit batch" : "Record a batch"}</h2>
        {products.length === 0 && (
          <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-ink">
            No products to choose from. Products are added in Sales, and you need access to Sales to see them.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Batch number"><Input value={draft.batch_no} onChange={set("batch_no")} /><FieldError message={errors.batch_no} /></Field>
          <Field label="Product">
            <Select value={draft.product_id} onChange={set("product_id")} aria-label="Product">
              <option value="">Choose…</option>
              {products.filter((p) => p.is_active || p.id === draft.product_id).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </Select>
            <FieldError message={errors.product_id} />
          </Field>
          <Field label="Made on"><Input type="date" value={draft.made_on} max={today} onChange={set("made_on")} /><FieldError message={errors.made_on} /></Field>
          <Field label="Pairs made"><Input inputMode="numeric" value={draft.qty_made} onChange={set("qty_made")} /><FieldError message={errors.qty_made} /></Field>
          <Field label="Pairs rejected"><Input inputMode="numeric" value={draft.qty_rejected} onChange={set("qty_rejected")} /><FieldError message={errors.qty_rejected} /></Field>
          <Field label="Labour hours"><Input inputMode="decimal" value={draft.labor_hours} onChange={set("labor_hours")} /><FieldError message={errors.labor_hours} /></Field>
          <Field label="Total batch cost (₱)"><Input inputMode="decimal" value={draft.total_cost} onChange={set("total_cost")} /><FieldError message={errors.total_cost} /></Field>
          <Field label="Notes (optional)"><Input value={draft.notes} onChange={set("notes")} /><FieldError message={errors.notes} /></Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button intent="primary" size="sm" type="submit" disabled={busy}>{editing ? "Save changes" : "Record batch"}</Button>
          {editing && <Button intent="secondary" size="sm" type="button" onClick={reset}>Cancel</Button>}
        </div>
      </form>

      <section aria-label="Batches">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Batches</h2>
          {batches.length > 0 && (
            <Button intent="secondary" size="sm" onClick={() => downloadCsv("bughaw-batches.csv", batchesToCsv(batches, nameOf))}>
              <Download className="mr-1 h-4 w-4" aria-hidden /> Export CSV
            </Button>
          )}
        </div>
        {batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-soft">No batches recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase text-ink-soft">
                  <th className="px-3 py-2">Batch</th><th>Product</th><th>Date</th><th className="text-right">Made</th><th className="text-right">Rejected</th>
                  <th className="text-right">Yield</th><th className="text-right">Cost per pair</th><th className="text-right">Hours per pair</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-semibold text-ink">{b.batch_no}</td>
                    <td>{nameOf(b.product_id)}</td>
                    <td className="font-mono text-[12px]">{b.made_on}</td>
                    <td className="text-right">{b.qty_made}</td>
                    <td className="text-right">{b.qty_rejected}</td>
                    <td className="text-right">{yieldPct(b.qty_made, b.qty_rejected)}%</td>
                    <td className="text-right">{peso(costPerPair(b.total_cost, b.qty_made, b.qty_rejected))}</td>
                    <td className="text-right">{hoursPerPair(b.labor_hours, b.qty_made, b.qty_rejected)}</td>
                    <td>{b.status === "completed" ? "Completed" : "Open"}</td>
                    <td className="whitespace-nowrap py-1 pr-3 text-right">
                      {b.status === "open" && (
                        <>
                          <Button intent="secondary" size="sm" onClick={() => edit(b)} aria-label={`Edit batch ${b.batch_no}`}>Edit</Button>{" "}
                          {isAdmin && (
                            <>
                              <Button intent="primary" size="sm" onClick={() => setCompleting(b)} aria-label={`Complete batch ${b.batch_no}`}>Complete</Button>{" "}
                              <Button intent="danger" size="sm" onClick={() => setDeleting(b)} aria-label={`Delete batch ${b.batch_no}`}>Delete</Button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink-soft">
          Cost per pair is the batch cost over the good pairs (made minus rejected). Only a super_admin completes a batch; a completed batch is locked, and a mistake is fixed with a stock correction.
        </p>
      </section>

      <ConfirmDialog
        open={completing !== null}
        onOpenChange={(o) => !o && setCompleting(null)}
        title={`Complete batch ${completing?.batch_no ?? ""}?`}
        description={completing ? `This adds ${goodPairs(completing.qty_made, completing.qty_rejected)} pairs of ${nameOf(completing.product_id)} to stock and locks the batch. It cannot be undone.` : undefined}
        confirmLabel="Complete batch"
        busyLabel="Completing…"
        onConfirm={complete}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete batch ${deleting?.batch_no ?? ""}?`}
        description="The open batch is removed. Nothing has been added to stock."
        onConfirm={remove}
      />
    </div>
  );
}
