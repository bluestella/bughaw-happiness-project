import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LINE_COLUMNS, QUOTE_COLUMNS, type DocLineRow, type ProductRow, type QuoteRow, type StockRow } from "@/lib/sales";
import { requireSales } from "../../access";
import { SalesTabs } from "../../SalesShell";
import { QuoteEditor } from "./QuoteEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quotation — Sales" };

export default async function QuotePage({ params }: { params: { id: string } }) {
  const { supabase, role } = await requireSales();
  const { data: quote } = await supabase.from("sales_quotations").select(QUOTE_COLUMNS).eq("id", params.id).maybeSingle();
  if (!quote) notFound();
  const q = quote as unknown as QuoteRow;

  const [lines, products, versions, order, stock] = await Promise.all([
    supabase.from("sales_quotation_lines").select(LINE_COLUMNS).eq("quotation_id", q.id).order("position").order("created_at"),
    supabase
      .from("sales_products")
      .select("id, sku, name, unit, description, is_active, sales_price_tiers(id, min_qty, unit_price)")
      .eq("is_active", true)
      .order("name"),
    supabase.from("sales_quotations").select("id, version, status").eq("number", q.number).order("version"),
    supabase.from("sales_orders").select("id, number").eq("quotation_id", q.id).neq("status", "cancelled").limit(1),
    supabase.from("stock_levels").select("product_id, on_hand, reserved"),
  ]);

  return (
    <div>
      <SalesTabs isAdmin={role === "super_admin"} />
      <QuoteEditor
        initialQuote={q}
        initialLines={(lines.data ?? []) as unknown as DocLineRow[]}
        products={(products.data ?? []) as unknown as ProductRow[]}
        versions={(versions.data ?? []) as { id: string; version: number; status: string }[]}
        liveOrder={((order.data ?? [])[0] as { id: string; number: string } | undefined) ?? null}
        stock={(stock.data ?? []) as StockRow[]}
        role={role}
      />
    </div>
  );
}
