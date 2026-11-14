import type { Metadata } from "next";
import { Factory } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { TEST_COLUMNS, type TestRow } from "@/lib/production";
import { requireProduction } from "../access";
import { ProductionTabs } from "../ProductionShell";
import { TestsClient } from "./TestsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Material tests — Production" };

export default async function TestsPage() {
  const { supabase, isAdmin, email } = await requireProduction();
  const [tests, batches, lots] = await Promise.all([
    supabase.from("material_tests").select(TEST_COLUMNS).order("tested_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("production_batches").select("id, batch_no").order("made_on", { ascending: false }).limit(200),
    supabase.from("supplier_lots").select("id, lot_no, supplier").order("received_on", { ascending: false }).limit(200),
  ]);
  return (
    <div>
      <CalculatorHeader icon={Factory} eyebrow="Production and R&D" title="Material tests" description="What was tested, how, the result, and whether it passed. Link a test to the batch or supplier lot it was about." />
      <ProductionTabs />
      <TestsClient
        tests={(tests.data ?? []) as unknown as TestRow[]}
        batches={(batches.data ?? []) as unknown as { id: string; batch_no: string }[]}
        lots={(lots.data ?? []) as unknown as { id: string; lot_no: string; supplier: string }[]}
        today={manilaDate()}
        isAdmin={isAdmin}
        email={email}
      />
    </div>
  );
}
