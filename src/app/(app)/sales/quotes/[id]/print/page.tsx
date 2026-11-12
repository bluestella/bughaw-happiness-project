import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LINE_COLUMNS, QUOTE_COLUMNS, QUOTE_STATUS_LABELS, type DocLineRow, type QuoteRow } from "@/lib/sales";
import { requireSales } from "../../../access";
import { DocumentPrint } from "../../../DocumentPrint";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quotation — print" };

export default async function QuotePrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { supabase } = await requireSales();
  const { data } = await supabase.from("sales_quotations").select(QUOTE_COLUMNS).eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const q = data as unknown as QuoteRow;
  const { data: lines } = await supabase
    .from("sales_quotation_lines")
    .select(LINE_COLUMNS)
    .eq("quotation_id", q.id)
    .order("position")
    .order("created_at");

  return (
    <DocumentPrint
      kind="Quotation"
      number={q.version > 1 ? `${q.number} v${q.version}` : q.number}
      customer={q.account_name_snapshot}
      facts={[
        ["Attention", q.contact_name],
        ["Valid until", q.valid_until],
        ["Status", q.status === "draft" ? `${QUOTE_STATUS_LABELS[q.status]} (not yet sent)` : null],
        ["Payment terms", q.payment_terms],
        ["Delivery terms", q.delivery_terms],
        ["Lead time", q.lead_time_days === null ? null : `${q.lead_time_days} days`],
      ]}
      lines={(lines ?? []) as unknown as DocLineRow[]}
      subtotal={Number(q.subtotal)}
      discount={Number(q.discount_amount)}
      total={Number(q.total)}
      notes={q.notes}
      taxNote={q.tax_note}
    />
  );
}
