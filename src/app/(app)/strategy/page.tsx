import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { WORKSHEET_COLUMNS, type WorksheetRow } from "@/lib/strategy";
import { requireStrategy } from "./access";
import { StrategyList } from "./StrategyList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strategy worksheets" };

export default async function StrategyPage() {
  const { supabase } = await requireStrategy();
  const { data } = await supabase.from("strategy_worksheets").select(WORKSHEET_COLUMNS).order("updated_at", { ascending: false });
  return (
    <div>
      <CalculatorHeader
        icon={Compass}
        eyebrow="Strategy"
        title="Strategy worksheets"
        description="Six standard frameworks, saved for the team. Fill one in, and the numbers work themselves out."
      />
      <StrategyList worksheets={(data ?? []) as unknown as WorksheetRow[]} />
    </div>
  );
}
