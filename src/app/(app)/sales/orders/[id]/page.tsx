import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LINE_COLUMNS, ORDER_COLUMNS, type DocLineRow, type OrderRow } from "@/lib/sales";
import { requireSales } from "../../access";
import { SalesTabs } from "../../SalesShell";
import { OrderDetail } from "./OrderDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order — Sales" };

export default async function OrderPage({ params }: { params: { id: string } }) {
  const { supabase, role } = await requireSales();
  const { data } = await supabase.from("sales_orders").select(ORDER_COLUMNS).eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as OrderRow;
  const [lines, quote] = await Promise.all([
    supabase.from("sales_order_lines").select(LINE_COLUMNS).eq("order_id", o.id).order("position").order("created_at"),
    o.quotation_id
      ? supabase.from("sales_quotations").select("id, number, version").eq("id", o.quotation_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return (
    <div>
      <SalesTabs isAdmin={role === "super_admin"} />
      <OrderDetail
        initialOrder={o}
        lines={(lines.data ?? []) as unknown as DocLineRow[]}
        quotation={(quote.data as { id: string; number: string; version: number } | null) ?? null}
        role={role}
      />
    </div>
  );
}
