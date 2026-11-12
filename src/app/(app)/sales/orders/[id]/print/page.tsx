import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LINE_COLUMNS, ORDER_COLUMNS, type DocLineRow, type OrderRow } from "@/lib/sales";
import { requireSales } from "../../../access";
import { DocumentPrint } from "../../../DocumentPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sales order — print" };

export default async function OrderPrintPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireSales();
  const { data } = await supabase.from("sales_orders").select(ORDER_COLUMNS).eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as OrderRow;
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select(LINE_COLUMNS)
    .eq("order_id", o.id)
    .order("position")
    .order("created_at");

  return (
    <DocumentPrint
      kind="Sales order"
      number={o.number}
      customer={o.account_name_snapshot}
      facts={[
        ["Customer PO", o.customer_po_no],
        ["Delivery due", o.delivery_due_on],
        ["Delivered", o.delivered_on],
        ["Official invoice no.", o.official_invoice_no],
      ]}
      lines={(lines ?? []) as unknown as DocLineRow[]}
      subtotal={Number(o.subtotal)}
      discount={Number(o.discount_amount)}
      total={Number(o.total)}
      notes={o.notes}
      taxNote={o.tax_note}
    />
  );
}
