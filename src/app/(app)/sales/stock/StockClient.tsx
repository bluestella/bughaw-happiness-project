"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  MANUAL_STOCK_REASONS,
  STOCK_REASON_LABELS,
  availableToSell,
  type StockReason,
} from "@/lib/sales";
import { Field } from "../SalesShell";

export type StockProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  is_active: boolean;
  // PostgREST returns a one-to-one embed as an object, not an array.
  stock_levels: { on_hand: number; reserved: number } | { on_hand: number; reserved: number }[] | null;
};

export type AdjustmentRow = {
  id: string;
  product_id: string;
  delta: number;
  reason: StockReason;
  note: string | null;
  sales_order_id: string | null;
  created_at: string;
  created_by_email: string;
  sales_products: { name: string } | { name: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export function StockClient({
  products,
  history,
  isAdmin,
}: {
  products: StockProduct[];
  history: AdjustmentRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [productId, setProductId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<StockReason>("opening_count");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(delta);
    if (!productId) return toast.error("Choose a product.");
    if (!Number.isInteger(n) || n === 0) return toast.error("Enter a whole number other than 0. Use a minus sign to remove pairs.");
    setBusy(true);
    const { error } = await supabase.rpc("stock_adjust", {
      p_product_id: productId,
      p_delta: n,
      p_reason: reason,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Stock updated.");
    setDelta("");
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
          No products yet.
          {isAdmin ? (
            <>
              {" "}
              Add them under <Link href="/sales/products" className="text-coir-dark hover:underline">Products</Link>, then enter the opening count here.
            </>
          ) : (
            " A super_admin adds products and the opening stock count."
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
          <table className="w-full min-w-[34rem] text-left text-[13px]" aria-label="Stock levels">
            <thead>
              <tr className="border-b border-line">
                {["Product", "On hand", "Reserved", "Free to sell"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const level = one(p.stock_levels) ?? { on_hand: 0, reserved: 0 };
                const free = availableToSell(level);
                return (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 text-ink">
                      {p.name} <span className="font-mono text-[11px] text-ink-soft">{p.sku}</span>
                      {!p.is_active && <span className="ml-2 text-[11px] text-ink-soft">(inactive)</span>}
                    </td>
                    <td className="px-3 py-2 font-mono">{level.on_hand}</td>
                    <td className="px-3 py-2 font-mono">{level.reserved}</td>
                    <td className={`px-3 py-2 font-mono ${free < 0 ? "text-danger" : ""}`}>{free}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && products.length > 0 && (
        <form onSubmit={adjust} className="rounded-xl border border-line bg-white p-4 shadow-card" aria-label="Adjust stock">
          <h2 className="mb-3 text-sm font-semibold text-ink">Adjust stock</h2>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_7rem_10rem_1fr_auto]">
            <Field label="Product">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
                <option value="">Choose…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Change (pairs)">
              <Input inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 500 or -3" />
            </Field>
            <Field label="Reason">
              <Select value={reason} onChange={(e) => setReason(e.target.value as StockReason)} aria-label="Reason">
                {MANUAL_STOCK_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {STOCK_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note (optional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button intent="primary" size="sm" type="submit" disabled={busy}>
              Record
            </Button>
          </div>
        </form>
      )}

      <section aria-label="Stock history">
        <h2 className="mb-2 text-sm font-semibold text-ink">History</h2>
        {history.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No stock movements yet.</p>
        ) : (
          <ul className="divide-y divide-line/60 rounded-xl border border-line bg-white shadow-card">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-[13px]">
                <span className="font-mono text-[11px] text-ink-soft">{new Date(h.created_at).toLocaleString("en-PH")}</span>
                <span className="text-ink">{one(h.sales_products)?.name ?? "Product"}</span>
                <span className={`font-mono ${h.delta < 0 ? "text-danger" : "text-coir-dark"}`}>
                  {h.delta > 0 ? "+" : ""}
                  {h.delta}
                </span>
                <span className="text-ink-soft">{STOCK_REASON_LABELS[h.reason]}</span>
                {h.note && <span className="text-ink-soft">· {h.note}</span>}
                {h.sales_order_id && (
                  <Link href={`/sales/orders/${h.sales_order_id}`} className="text-coir-dark hover:underline">
                    order
                  </Link>
                )}
                <span className="ml-auto font-mono text-[10px] text-ink-soft">{h.created_by_email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
