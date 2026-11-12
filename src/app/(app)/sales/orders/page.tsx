import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { peso } from "@/lib/format";
import { ORDER_COLUMNS, type OrderRow } from "@/lib/sales";
import { requireSales } from "../access";
import { OrderBadge, SalesTabs } from "../SalesShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders — Sales" };

export default async function OrdersPage() {
  const { supabase, role } = await requireSales();
  const { data, error } = await supabase
    .from("sales_orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);
  const orders = (data ?? []) as unknown as OrderRow[];

  return (
    <div>
      <CalculatorHeader
        icon={ClipboardList}
        eyebrow="Sales"
        title="Orders"
        description="Confirmed orders reserve stock. Deliver, record the official invoice number from your booklet, and record payment."
      />
      <SalesTabs isAdmin={role === "super_admin"} />
      {error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load orders: {error.message}
        </p>
      )}
      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
          No orders yet. Accept a quotation, then create the order from it.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
          <table className="w-full min-w-[46rem] text-left text-[13px]" aria-label="Orders">
            <thead>
              <tr className="border-b border-line">
                {["Number", "Customer", "Status", "Total", "Delivery due", "Official invoice"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-line/60 last:border-0 hover:bg-paper">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">
                    <Link href={`/sales/orders/${o.id}`} className="text-coir-dark hover:underline">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink">{o.account_name_snapshot}</td>
                  <td className="px-3 py-2">
                    <OrderBadge status={o.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{peso(Number(o.total))}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink-soft">{o.delivery_due_on ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-ink-soft">{o.official_invoice_no ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
