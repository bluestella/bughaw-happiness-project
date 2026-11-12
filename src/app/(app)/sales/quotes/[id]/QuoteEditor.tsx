"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogBackdrop, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { manilaDate } from "@/lib/crm";
import { peso } from "@/lib/format";
import type { Role } from "@/lib/permissions";
import {
  LINE_COLUMNS,
  NOT_AN_INVOICE_LINE,
  QUOTE_COLUMNS,
  documentTotals,
  isExpired,
  quoteActions,
  stockShortages,
  suggestedUnitPrice,
  type DocLineRow,
  type ProductRow,
  type QuoteRow,
  type StockRow,
} from "@/lib/sales";
import { Field, QuoteBadge } from "../../SalesShell";

type Draft = {
  contact_name: string;
  valid_until: string;
  payment_terms: string;
  delivery_terms: string;
  lead_time_days: string;
  notes: string;
  tax_note: string;
  discount_amount: string;
};

const draftOf = (q: QuoteRow): Draft => ({
  contact_name: q.contact_name ?? "",
  valid_until: q.valid_until ?? "",
  payment_terms: q.payment_terms ?? "",
  delivery_terms: q.delivery_terms ?? "",
  lead_time_days: q.lead_time_days === null ? "" : String(q.lead_time_days),
  notes: q.notes ?? "",
  tax_note: q.tax_note ?? "",
  discount_amount: String(q.discount_amount ?? 0),
});

const blank = (v: string) => (v.trim() === "" ? null : v.trim());

export function QuoteEditor({
  initialQuote,
  initialLines,
  products,
  versions,
  liveOrder,
  stock,
  role,
}: {
  initialQuote: QuoteRow;
  initialLines: DocLineRow[];
  products: ProductRow[];
  versions: { id: string; version: number; status: string }[];
  liveOrder: { id: string; number: string } | null;
  stock: StockRow[];
  role: Role | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => manilaDate(), []);
  const [quote, setQuote] = useState(initialQuote);
  const [lines, setLines] = useState(initialLines);
  const [draft, setDraft] = useState<Draft>(() => draftOf(initialQuote));
  const [busy, setBusy] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [po, setPo] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [reason, setReason] = useState("");

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);

  const isDraft = quote.status === "draft";
  const actions = quoteActions({ ...quote, hasLiveOrder: !!liveOrder }, today);
  const expired = isExpired(quote, today);
  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const levels = useMemo(() => Object.fromEntries(stock.map((s) => [s.product_id, s])), [stock]);
  const shortages = useMemo(
    () => stockShortages(lines.map((l) => ({ product_id: l.product_id, qty: l.qty })), levels),
    [lines, levels],
  );
  const totals = documentTotals(lines, Number(draft.discount_amount) || 0);

  async function reload() {
    const [q, l] = await Promise.all([
      supabase.from("sales_quotations").select(QUOTE_COLUMNS).eq("id", quote.id).single(),
      supabase.from("sales_quotation_lines").select(LINE_COLUMNS).eq("quotation_id", quote.id).order("position").order("created_at"),
    ]);
    if (q.data) {
      const next = q.data as unknown as QuoteRow;
      setQuote(next);
      setDraft((d) => ({ ...d, discount_amount: String(next.discount_amount) }));
    }
    if (l.data) setLines(l.data as unknown as DocLineRow[]);
  }

  /** Writes the details form. Returns false (after telling the user) when it fails. */
  async function saveDetails(): Promise<boolean> {
    const discount = Number(draft.discount_amount.trim() || 0);
    if (!Number.isFinite(discount) || discount < 0) {
      toast.error("The discount must be 0 or more.");
      return false;
    }
    const lead = blank(draft.lead_time_days);
    if (lead !== null && !/^\d+$/.test(lead)) {
      toast.error("Lead time must be a whole number of days.");
      return false;
    }
    const { error } = await supabase
      .from("sales_quotations")
      .update({
        contact_name: blank(draft.contact_name),
        valid_until: blank(draft.valid_until),
        payment_terms: blank(draft.payment_terms),
        delivery_terms: blank(draft.delivery_terms),
        lead_time_days: lead === null ? null : Number(lead),
        notes: blank(draft.notes),
        tax_note: blank(draft.tax_note),
        discount_amount: discount,
      })
      .eq("id", quote.id);
    if (error) {
      toast.error("Could not save: " + error.message);
      return false;
    }
    await reload();
    return true;
  }

  async function run(label: string, fn: () => Promise<boolean | void>) {
    setBusy(true);
    try {
      const ok = await fn();
      if (ok !== false && label) toast.success(label);
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (status: string, label: string) =>
    run(label, async () => {
      if (isDraft && !(await saveDetails())) return false;
      const { error } = await supabase.from("sales_quotations").update({ status }).eq("id", quote.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      await reload();
    });

  const revise = () =>
    run("", async () => {
      const { data, error } = await supabase.rpc("sales_revise_quotation", { p_id: quote.id });
      if (error || !data) {
        toast.error(error?.message ?? "Could not revise.");
        return false;
      }
      router.push(`/sales/quotes/${data}`);
    });

  const createOrder = () =>
    run("", async () => {
      const { data, error } = await supabase.rpc("sales_create_order", {
        p_quotation_id: quote.id,
        p_customer_po_no: blank(po),
        p_delivery_due_on: blank(dueOn),
        p_override_reason: role === "super_admin" ? blank(reason) : null,
      });
      if (error || !data) {
        toast.error(error?.message ?? "Could not create the order.");
        return false;
      }
      router.push(`/sales/orders/${data}`);
    });

  function pickProduct(id: string, nextQty = qty) {
    setProductId(id);
    if (!priceTouched) {
      const tiers = (productById[id]?.sales_price_tiers ?? []).map((t) => ({ minQty: t.min_qty, unitPrice: Number(t.unit_price) }));
      const s = suggestedUnitPrice(tiers, Number(nextQty));
      setPrice(s === null ? "" : String(s));
    }
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    const p = Number(price);
    if (!productId) return toast.error("Choose a product.");
    if (!Number.isInteger(n) || n < 1) return toast.error("Quantity must be a whole number, 1 or more.");
    if (!price.trim() || !Number.isFinite(p) || p < 0) return toast.error("Enter a price per pair.");
    await run("", async () => {
      const { error } = await supabase
        .from("sales_quotation_lines")
        .insert({ quotation_id: quote.id, product_id: productId, qty: n, unit_price: p, position: lines.length });
      if (error) {
        toast.error(error.message);
        return false;
      }
      setProductId("");
      setQty("1");
      setPrice("");
      setPriceTouched(false);
      await reload();
    });
  }

  async function editLine(line: DocLineRow, patch: { qty?: number; unit_price?: number }) {
    if ((patch.qty ?? line.qty) === line.qty && (patch.unit_price ?? line.unit_price) === Number(line.unit_price)) return;
    await run("", async () => {
      const { error } = await supabase.from("sales_quotation_lines").update(patch).eq("id", line.id);
      if (error) toast.error(error.message);
      await reload();
    });
  }

  async function removeLine(id: string) {
    await run("", async () => {
      const { error } = await supabase.from("sales_quotation_lines").delete().eq("id", id);
      if (error) toast.error(error.message);
      await reload();
    });
  }

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir">Quotation</p>
          <h1 className="font-display text-2xl text-ink">
            {quote.number}
            {quote.version > 1 ? <span className="text-ink-soft"> v{quote.version}</span> : null}
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            {quote.account_name_snapshot} · <QuoteBadge status={quote.status} expired={expired} />
          </p>
          {versions.length > 1 && (
            <p className="mt-2 text-[12px] text-ink-soft">
              Versions:{" "}
              {versions.map((v) => (
                <Link
                  key={v.id}
                  href={`/sales/quotes/${v.id}`}
                  className={`mr-2 ${v.id === quote.id ? "font-semibold text-ink" : "text-coir-dark hover:underline"}`}
                >
                  v{v.version}
                </Link>
              ))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.includes("print") && (
            <Button asChild size="sm">
              <Link href={`/sales/quotes/${quote.id}/print`} target="_blank">
                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Print view
              </Link>
            </Button>
          )}
          {actions.includes("send") && (
            <Button intent="primary" size="sm" disabled={busy} onClick={() => setStatus("sent", "Quotation sent.")}>
              Mark as sent
            </Button>
          )}
          {actions.includes("accept") && (
            <Button intent="primary" size="sm" disabled={busy} onClick={() => setStatus("accepted", "Quotation accepted.")}>
              Customer accepted
            </Button>
          )}
          {actions.includes("decline") && (
            <Button size="sm" disabled={busy} onClick={() => setStatus("declined", "Marked as declined.")}>
              Customer declined
            </Button>
          )}
          {actions.includes("revise") && (
            <Button size="sm" disabled={busy} onClick={revise}>
              Revise (new version)
            </Button>
          )}
          {actions.includes("create_order") && (
            <Button intent="primary" size="sm" disabled={busy} onClick={() => setOrderOpen(true)}>
              Create sales order
            </Button>
          )}
          {actions.includes("void") && (
            <Button intent="danger" size="sm" disabled={busy} onClick={() => setConfirmVoid(true)}>
              Void
            </Button>
          )}
        </div>
      </header>

      {liveOrder && (
        <p className="mb-4 rounded-lg border border-line bg-white px-4 py-3 text-[13px] text-ink">
          This quotation became order{" "}
          <Link href={`/sales/orders/${liveOrder.id}`} className="font-mono text-coir-dark hover:underline">
            {liveOrder.number}
          </Link>
          .
        </p>
      )}
      {expired && (
        <p className="mb-4 rounded-lg border border-amber/60 bg-white px-4 py-3 text-[13px] text-ink">
          This quotation passed its validity date ({quote.valid_until}). Revise it with a new date to keep selling on it.
        </p>
      )}

      <section aria-label="Details" className="mb-6 rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">Details</h2>
        {isDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact name">
              <Input value={draft.contact_name} onChange={set("contact_name")} />
            </Field>
            <Field label="Valid until">
              <Input type="date" value={draft.valid_until} onChange={set("valid_until")} />
            </Field>
            <Field label="Payment terms">
              <Input value={draft.payment_terms} onChange={set("payment_terms")} placeholder="e.g. 50% on order, 50% on delivery" />
            </Field>
            <Field label="Delivery terms">
              <Input value={draft.delivery_terms} onChange={set("delivery_terms")} placeholder="e.g. Delivered to the property" />
            </Field>
            <Field label="Lead time (days)">
              <Input inputMode="numeric" value={draft.lead_time_days} onChange={set("lead_time_days")} />
            </Field>
            <Field label="Discount (₱)">
              <Input inputMode="decimal" value={draft.discount_amount} onChange={set("discount_amount")} />
            </Field>
            <Field label="Notes (printed)" className="sm:col-span-2">
              <Textarea rows={2} value={draft.notes} onChange={set("notes")} />
            </Field>
            <Field label="Tax note (printed)" className="sm:col-span-2" hint="No VAT line is calculated. Say here what applies, once your accountant confirms it.">
              <Input value={draft.tax_note} onChange={set("tax_note")} />
            </Field>
            <div className="sm:col-span-2">
              <Button size="sm" disabled={busy} onClick={() => run("Details saved.", saveDetails)}>
                Save details
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            {(
              [
                ["Contact", quote.contact_name],
                ["Valid until", quote.valid_until],
                ["Payment terms", quote.payment_terms],
                ["Delivery terms", quote.delivery_terms],
                ["Lead time", quote.lead_time_days === null ? null : `${quote.lead_time_days} days`],
                ["Notes", quote.notes],
                ["Tax note", quote.tax_note],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{k}</dt>
                <dd className="text-ink">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-label="Lines" className="mb-6 rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">Lines</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {["Product", "Qty", "Price per pair", "Line total", ""].map((h, i) => (
                  <th key={i} scope="col" className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-ink-soft">
                    No lines yet.
                  </td>
                </tr>
              )}
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-line/60">
                  <td className="px-2 py-1.5 text-ink">{l.product_name_snapshot}</td>
                  <td className="px-2 py-1.5">
                    {isDraft ? (
                      <Input
                        className="w-24"
                        inputMode="numeric"
                        defaultValue={l.qty}
                        aria-label={`Quantity for ${l.product_name_snapshot}`}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 1) void editLine(l, { qty: n });
                          else e.target.value = String(l.qty);
                        }}
                      />
                    ) : (
                      l.qty
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isDraft ? (
                      <Input
                        className="w-32"
                        inputMode="decimal"
                        defaultValue={l.unit_price}
                        aria-label={`Price for ${l.product_name_snapshot}`}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n >= 0) void editLine(l, { unit_price: n });
                          else e.target.value = String(l.unit_price);
                        }}
                      />
                    ) : (
                      peso(Number(l.unit_price))
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px]">{peso(Number(l.line_total))}</td>
                  <td className="px-2 py-1.5 text-right">
                    {isDraft && (
                      <button
                        type="button"
                        aria-label={`Remove ${l.product_name_snapshot}`}
                        className="rounded-md p-1.5 text-ink-soft hover:bg-paper hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
                        onClick={() => removeLine(l.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isDraft && (
          <form onSubmit={addLine} className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_6rem_9rem_auto]">
            <Field label="Product">
              <Select value={productId} onChange={(e) => pickProduct(e.target.value)} aria-label="Product">
                <option value="">Choose a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qty">
              <Input
                inputMode="numeric"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  if (productId) pickProduct(productId, e.target.value);
                }}
              />
            </Field>
            <Field label="Price per pair">
              <Input
                inputMode="decimal"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setPriceTouched(true);
                }}
              />
            </Field>
            <Button intent="secondary" size="sm" type="submit" disabled={busy}>
              Add line
            </Button>
          </form>
        )}
        {isDraft && products.length === 0 && (
          <p className="mt-3 text-[12px] text-ink-soft">
            There are no products yet. A super_admin adds them under Sales → Products.
          </p>
        )}
        {isDraft && productId && price === "" && (
          <p className="mt-2 text-[12px] text-ink-soft">
            No price tier applies to this quantity. Enter a price, or raise the quantity to the minimum order.
          </p>
        )}

        <dl className="mt-4 ml-auto w-full max-w-xs space-y-1 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Subtotal</dt>
            <dd className="font-mono">{peso(isDraft ? totals.subtotal : Number(quote.subtotal))}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Discount</dt>
            <dd className="font-mono">−{peso(isDraft ? totals.discount : Number(quote.discount_amount))}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1 text-[15px] font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{peso(isDraft ? totals.total : Number(quote.total))}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-ink-soft">{NOT_AN_INVOICE_LINE}</p>
      </section>

      <ConfirmDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title={`Void ${quote.number}?`}
        description="A voided quotation stays on record but can no longer be sent. This cannot be undone."
        confirmLabel="Void quotation"
        busyLabel="Voiding…"
        onConfirm={() => setStatus("void", "Quotation voided.")}
      />

      <BaseDialog.Root open={orderOpen} onOpenChange={setOrderOpen}>
        <BaseDialog.Portal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>Create sales order</DialogTitle>
            <DialogDescription>
              This reserves the stock for {quote.account_name_snapshot}. You can add the customer&apos;s purchase order number now or later.
            </DialogDescription>
            {shortages.length > 0 && (
              <div role="alert" className="mt-3 rounded-lg border border-danger-border bg-danger-bg p-3 text-[12px] text-danger">
                <p className="font-semibold">Not enough free stock:</p>
                <ul className="mt-1 list-disc pl-4">
                  {shortages.map((s) => (
                    <li key={s.product_id}>
                      {productById[s.product_id]?.name ?? "Product"}: need {s.need}, free {s.free}
                    </li>
                  ))}
                </ul>
                {role !== "super_admin" && <p className="mt-1">A super_admin has to confirm this order.</p>}
              </div>
            )}
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await createOrder();
              }}
            >
              <Field label="Customer PO number (optional)">
                <Input value={po} onChange={(e) => setPo(e.target.value)} />
              </Field>
              <Field label="Delivery due (optional)">
                <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
              </Field>
              {role === "super_admin" && shortages.length > 0 && (
                <Field label="Reason for ordering beyond free stock">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" onClick={() => setOrderOpen(false)}>
                  Cancel
                </Button>
                <Button intent="primary" size="sm" type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create order"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </div>
  );
}
