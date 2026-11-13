import type { Metadata } from "next";
import { Factory } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { LOT_COLUMNS, type LotRow } from "@/lib/production";
import { requireProduction } from "../access";
import { ProductionTabs } from "../ProductionShell";
import { LotsClient } from "./LotsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Supplier lots — Production" };

export default async function LotsPage() {
  const { supabase, isAdmin } = await requireProduction();
  const { data } = await supabase.from("supplier_lots").select(LOT_COLUMNS).order("received_on", { ascending: false });
  return (
    <div>
      <CalculatorHeader icon={Factory} eyebrow="Production and R&D" title="Supplier lots" description="Raw material as it arrives: supplier, lot number, quantity and what it cost." />
      <ProductionTabs />
      <LotsClient lots={(data ?? []) as unknown as LotRow[]} today={manilaDate()} isAdmin={isAdmin} />
    </div>
  );
}
