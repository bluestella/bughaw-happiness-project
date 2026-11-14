import type { Metadata } from "next";
import { Factory } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { BATCH_COLUMNS, type BatchRow } from "@/lib/production";
import { requireProduction } from "./access";
import { ProductionTabs } from "./ProductionShell";
import { BatchesClient } from "./BatchesClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Production batches" };

export default async function ProductionPage() {
  const { supabase, isAdmin } = await requireProduction();
  const [batches, products] = await Promise.all([
    supabase.from("production_batches").select(BATCH_COLUMNS).order("made_on", { ascending: false }).order("batch_no", { ascending: false }),
    supabase.from("sales_products").select("id, name, sku, is_active").order("name"),
  ]);
  return (
    <div>
      <CalculatorHeader
        icon={Factory}
        eyebrow="Production and R&D"
        title="Production batches"
        description="Record each batch: pairs made and rejected, labour and cost. Completing a batch adds its good pairs to stock."
      />
      <ProductionTabs />
      <BatchesClient
        batches={(batches.data ?? []) as unknown as BatchRow[]}
        products={(products.data ?? []) as unknown as { id: string; name: string; sku: string; is_active: boolean }[]}
        today={manilaDate()}
        isAdmin={isAdmin}
      />
    </div>
  );
}
