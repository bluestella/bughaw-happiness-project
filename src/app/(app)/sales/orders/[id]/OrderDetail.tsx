"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { manilaDate } from "@/lib/crm";
import { peso } from "@/lib/format";
import type { Role } from "@/lib/permissions";
import {
  NOT_AN_INVOICE_LINE,
  ORDER_COLUMNS,
  orderActions,
  paymentProblem,
  type DocLineRow,
  type OrderRow,
} from "@/lib/sales";
import { Field, OrderBadge } from "../../SalesShell";

const blank = (v: string) => (v.trim() === "" ? null : v.trim());

export function OrderDetail({
  initialOrder,
  lines,
  quotation,
  role,
}: {
  initialOrder: OrderRow;
  lines: DocLineRow[];
  quotation: { id: string; number: string; version: number } | null;
  role: Role | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => manilaDate(), []);
  const [order, setOrder] = useState(initialOrder);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [po, setPo] = useState(order.customer_po_no ?? "");
  const [dueOn, setDueOn] = useState(order.delivery_due_on ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [deliveredOn, setDeliveredOn] = useState(today);
  const [invoiceNo, setInvoiceNo] = useState(order.official_invoice_no ?? "");
  const [invoiceDate, setInvoiceDate] = useState(order.official_invoice_date ?? "");
  const [amount, setAmount] = useState(order.total ? String(order.total) : "");
  const [paidOn, setPaidOn] = useState(today);

  const actions = orderActions(order.status, role);
  const editable = order.status === "confirmed" || order.status === "delivered";

  async function reload() {
    const { data } = await supabase.from("sales_orders").select(ORDER_COLUMNS).eq("id", order.id).single();
    if (data) setOrder(data as unknown as OrderRow);
  }

  async function update(patch: Record<string, unknown>, done: string) {
    setBusy(true);
    const { error } = await supabase.from("sales_orders").update(patch).eq("id", order.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await reload();
    toast.success(done);
    return true;
  }

  async function markPaid(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      official_invoice_no: blank(invoiceNo),
      official_invoice_date: blank(invoiceDate),
      amount_paid: Number(amount.replace(/,/g, "")),
      paid_on: blank(paidOn),
    };
    const problem = paymentProblem({
      official_invoice_no: fields.official_invoice_no,
      paid_on: fields.paid_on,
      amount_paid: fields.amount_paid,
      total: Number(order.total),
    });
    if (problem) return toast.error(problem);
    await update({ status: "paid", ...fields }, "Marked as paid.");
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir">Sales order</p>
          <h1 className="font-display text-2xl text-ink">{order.number}</h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            {order.account_name_snapshot} · <OrderBadge status={order.status} />
            {quotation && (
              <>
                {" "}
                · from{" "}
                <Link href={`/sales/quotes/${quotation.id}`} className="font-mono text-coir-dark hover:underline">
                  {quotation.number}
                  {quotation.version > 1 ? ` v${quotation.version}` : ""}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.includes("print") && (
            <Button asChild size="sm">
              <Link href={`/sales/orders/${order.id}/print`} target="_blank">
                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Print view
              </Link>
            </Button>
          )}
          {actions.includes("cancel") && (
            <Button intent="danger" size="sm" disabled={busy} onClick={() => setConfirmCancel(true)}>
              Cancel order
            </Button>
          )}
        </div>
      </header>

      {order.oversell_override_reason && (
        <p className="mb-4 rounded-lg border border-amber/60 bg-white px-4 py-3 text-[13px] text-ink">
          Confirmed beyond free stock. Reason: {order.oversell_override_reason}
        </p>
      )}

      <section aria-label="Lines" className="mb-6 rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">Lines</h2>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Product", "Qty", "Price per pair", "Line total"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-line/60">
                <td className="px-2 py-1.5">{l.product_name_snapshot}</td>
                <td className="px-2 py-1.5">{l.qty}</td>
                <td className="px-2 py-1.5">{peso(Number(l.unit_price))}</td>
                <td className="px-2 py-1.5 font-mono text-[12px]">{peso(Number(l.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 ml-auto w-full max-w-xs space-y-1 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Subtotal</dt>
            <dd className="font-mono">{peso(Number(order.subtotal))}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Discount</dt>
            <dd className="font-mono">−{peso(Number(order.discount_amount))}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1 text-[15px] font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{peso(Number(order.total))}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-ink-soft">{NOT_AN_INVOICE_LINE}</p>
      </section>

      <section aria-label="Order details" className="mb-6 rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">Details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer PO number">
            <Input value={po} onChange={(e) => setPo(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="Delivery due">
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} />
          </Field>
        </div>
        {editable && (
          <Button
            className="mt-3"
            size="sm"
            disabled={busy}
            onClick={() =>
              update({ customer_po_no: blank(po), delivery_due_on: blank(dueOn), notes: blank(notes) }, "Details saved.")
            }
          >
            Save details
          </Button>
        )}
      </section>

      {actions.includes("deliver") && (
        <section aria-label="Delivery" className="mb-6 rounded-xl border border-line bg-white p-4 shadow-card">
          <h2 className="mb-1 text-sm font-semibold text-ink">Delivery</h2>
          <p className="mb-3 text-[12px] text-ink-soft">
            Marking the order delivered takes these pairs out of stock. It cannot be undone.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Delivered on">
              <Input type="date" value={deliveredOn} max={today} onChange={(e) => setDeliveredOn(e.target.value)} />
            </Field>
            <Button
              intent="primary"
              size="sm"
              disabled={busy || !deliveredOn}
              onClick={() => update({ status: "delivered", delivered_on: deliveredOn }, "Marked as delivered.")}
            >
              Mark as delivered
            </Button>
          </div>
        </section>
      )}

      {(actions.includes("record_payment") || order.status === "paid") && (
        <section aria-label="Official invoice and payment" className="mb-6 rounded-xl border border-line bg-white p-4 shadow-card">
          <h2 className="mb-1 text-sm font-semibold text-ink">Official invoice and payment</h2>
          <p className="mb-3 text-[12px] text-ink-soft">
            Issue the official invoice from your BIR-authorised booklet, then type its number here. This app does not issue it.
          </p>
          {order.status === "paid" ? (
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
              {(
                [
                  ["Official invoice no.", order.official_invoice_no],
                  ["Invoice date", order.official_invoice_date],
                  ["Amount paid", peso(Number(order.amount_paid))],
                  ["Paid on", order.paid_on],
                  ["Delivered on", order.delivered_on],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{k}</dt>
                  <dd className="text-ink">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <form onSubmit={markPaid} className="grid gap-3 sm:grid-cols-2" noValidate>
              <Field label="Official invoice number">
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </Field>
              <Field label="Amount paid (₱)">
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Paid on">
                <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Button intent="primary" size="sm" type="submit" disabled={busy}>
                  Mark as paid
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${order.number}?`}
        description="The reserved stock is released. A cancelled order stays on record and cannot be reopened; create a new order from the quotation instead."
        confirmLabel="Cancel order"
        busyLabel="Cancelling…"
        onConfirm={async () => {
          await update({ status: "cancelled" }, "Order cancelled.");
        }}
      />
    </div>
  );
}
