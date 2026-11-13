"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/lib/format";
import { lotUnitCost, validateLot, type LotDraft, type LotRow } from "@/lib/production";
import { Field } from "../../sales/SalesShell";
import { FieldError } from "../ProductionShell";

export function LotsClient({ lots, today, isAdmin }: { lots: LotRow[]; today: string; isAdmin: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const blank: LotDraft = { lot_no: "", supplier: "", material: "", received_on: today, quantity: "", unit: "kg", total_cost: "", notes: "" };
  const [draft, setDraft] = useState<LotDraft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof LotDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<LotRow | null>(null);
  const set = (k: keyof LotDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  function edit(l: LotRow) {
    setEditing(l.id);
    setErrors({});
    setDraft({ lot_no: l.lot_no, supplier: l.supplier, material: l.material, received_on: l.received_on, quantity: String(l.quantity), unit: l.unit, total_cost: String(l.total_cost || ""), notes: l.notes ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() {
    setEditing(null);
    setErrors({});
    setDraft(blank);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateLot(draft, today);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const { error } = editing ? await supabase.from("supplier_lots").update(v.row).eq("id", editing) : await supabase.from("supplier_lots").insert(v.row);
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "That supplier already has a lot with that number." : error.message);
    toast.success(editing ? "Lot updated." : "Lot recorded.");
    reset();
    router.refresh();
  }
  async function remove() {
    if (!deleting) return;
    const { error } = await supabase.from("supplier_lots").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success("Lot deleted. Tests that pointed at it are kept.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} noValidate aria-label={editing ? "Edit lot" : "Record a lot"} className="rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">{editing ? "Edit lot" : "Record a lot"}</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Supplier"><Input value={draft.supplier} onChange={set("supplier")} /><FieldError message={errors.supplier} /></Field>
          <Field label="Lot number"><Input value={draft.lot_no} onChange={set("lot_no")} /><FieldError message={errors.lot_no} /></Field>
          <Field label="Material"><Input value={draft.material} onChange={set("material")} /><FieldError message={errors.material} /></Field>
          <Field label="Received on"><Input type="date" value={draft.received_on} max={today} onChange={set("received_on")} /><FieldError message={errors.received_on} /></Field>
          <Field label="Quantity"><Input inputMode="decimal" value={draft.quantity} onChange={set("quantity")} /><FieldError message={errors.quantity} /></Field>
          <Field label="Unit"><Input value={draft.unit} onChange={set("unit")} /><FieldError message={errors.unit} /></Field>
          <Field label="Total cost (₱)"><Input inputMode="decimal" value={draft.total_cost} onChange={set("total_cost")} /><FieldError message={errors.total_cost} /></Field>
          <Field label="Notes (optional)"><Input value={draft.notes} onChange={set("notes")} /><FieldError message={errors.notes} /></Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button intent="primary" size="sm" type="submit" disabled={busy}>{editing ? "Save changes" : "Record lot"}</Button>
          {editing && <Button intent="secondary" size="sm" type="button" onClick={reset}>Cancel</Button>}
        </div>
      </form>

      <section aria-label="Lots">
        <h2 className="mb-2 text-sm font-semibold text-ink">Lots</h2>
        {lots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-soft">No supplier lots recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase text-ink-soft">
                  <th className="px-3 py-2">Lot</th><th>Supplier</th><th>Material</th><th>Received</th><th className="text-right">Quantity</th><th className="text-right">Total cost</th><th className="text-right">Per unit</th><th />
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-semibold text-ink">{l.lot_no}</td>
                    <td>{l.supplier}</td>
                    <td>{l.material}</td>
                    <td className="font-mono text-[12px]">{l.received_on}</td>
                    <td className="text-right">{l.quantity} {l.unit}</td>
                    <td className="text-right">{peso(l.total_cost)}</td>
                    <td className="text-right">{peso(lotUnitCost(l.total_cost, l.quantity))} / {l.unit}</td>
                    <td className="whitespace-nowrap py-1 pr-3 text-right">
                      <Button intent="secondary" size="sm" onClick={() => edit(l)} aria-label={`Edit lot ${l.lot_no}`}>Edit</Button>{" "}
                      {isAdmin && <Button intent="danger" size="sm" onClick={() => setDeleting(l)} aria-label={`Delete lot ${l.lot_no}`}>Delete</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete lot ${deleting?.lot_no ?? ""}?`} description="The lot is removed for everyone." onConfirm={remove} />
    </div>
  );
}
