"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/lib/format";
import type { ProductRow } from "@/lib/sales";
import { Field } from "../SalesShell";

function TierEditor({ product, onChange }: { product: ProductRow; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [minQty, setMinQty] = useState("");
  const [price, setPrice] = useState("");
  const tiers = [...(product.sales_price_tiers ?? [])].sort((a, b) => a.min_qty - b.min_qty);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(minQty);
    const p = Number(price);
    if (!Number.isInteger(q) || q < 1) return toast.error("From quantity must be a whole number, 1 or more.");
    if (!Number.isFinite(p) || p <= 0) return toast.error("Enter a price above 0.");
    const { error } = await supabase.from("sales_price_tiers").insert({ product_id: product.id, min_qty: q, unit_price: p });
    if (error) return toast.error(error.code === "23505" ? "There is already a tier starting at that quantity." : error.message);
    setMinQty("");
    setPrice("");
    onChange();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("sales_price_tiers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  }

  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Price tiers</p>
      {tiers.length === 0 ? (
        <p className="mt-1 text-[12px] text-ink-soft">No tiers yet, so quotations cannot suggest a price.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-[13px]">
          {tiers.map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              <span className="w-28 text-ink-soft">From {t.min_qty} pairs</span>
              <span className="font-mono">{peso(Number(t.unit_price))}</span>
              <button
                type="button"
                aria-label={`Remove tier from ${t.min_qty} pairs`}
                className="rounded-md p-1 text-ink-soft hover:bg-paper hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
                onClick={() => remove(t.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="From quantity">
          <Input className="w-28" inputMode="numeric" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
        </Field>
        <Field label="Price per pair (₱)">
          <Input className="w-32" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Button size="sm" type="submit">
          Add tier
        </Button>
      </form>
    </div>
  );
}

export function ProductsClient({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pair");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) return toast.error("A product needs a SKU and a name.");
    setBusy(true);
    const { error } = await supabase.from("sales_products").insert({
      sku: sku.trim(),
      name: name.trim(),
      unit: unit.trim() || "pair",
      description: description.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "That SKU is already used." : error.message);
    setSku("");
    setName("");
    setDescription("");
    toast.success("Product added.");
    router.refresh();
  }

  async function toggleActive(p: ProductRow) {
    const { error } = await supabase.from("sales_products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="rounded-xl border border-line bg-white p-4 shadow-card" aria-label="Add a product">
        <h2 className="mb-3 text-sm font-semibold text-ink">Add a product</h2>
        <div className="grid items-end gap-3 sm:grid-cols-[9rem_1fr_7rem]">
          <Field label="SKU">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="Description (optional)" className="sm:col-span-3">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Button className="mt-3" intent="primary" size="sm" type="submit" disabled={busy}>
          Add product
        </Button>
      </form>

      {products.length === 0 ? (
        <p className="text-[13px] text-ink-soft">No products yet.</p>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <li key={p.id} className="rounded-xl border border-line bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[14px] font-semibold text-ink">
                  {p.name} <span className="font-mono text-[11px] font-normal text-ink-soft">{p.sku}</span>
                  {!p.is_active && <span className="ml-2 text-[11px] font-normal text-ink-soft">(inactive)</span>}
                </p>
                <Button size="sm" onClick={() => toggleActive(p)}>
                  {p.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
              {p.description && <p className="mt-1 text-[12px] text-ink-soft">{p.description}</p>}
              <TierEditor product={p} onChange={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
