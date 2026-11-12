import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { QUOTE_COLUMNS, type QuoteRow } from "@/lib/sales";
import { requireSales } from "../access";
import { SalesTabs } from "../SalesShell";
import { QuotesClient } from "./QuotesClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quotations — Sales" };

export default async function QuotesPage() {
  const { supabase, role, canSeeCrm } = await requireSales();
  const [quotes, accounts] = await Promise.all([
    supabase.from("sales_quotations").select(QUOTE_COLUMNS).order("created_at", { ascending: false }).limit(300),
    canSeeCrm
      ? supabase.from("crm_accounts").select("id, name").order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  return (
    <div>
      <CalculatorHeader
        icon={FileText}
        eyebrow="Sales"
        title="Quotations"
        description="Price an order for a hotel, send it, and turn the accepted one into a sales order."
      />
      <SalesTabs isAdmin={role === "super_admin"} />
      {quotes.error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load quotations: {quotes.error.message}
        </p>
      )}
      <QuotesClient
        quotes={(quotes.data ?? []) as unknown as QuoteRow[]}
        accounts={(accounts.data ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
