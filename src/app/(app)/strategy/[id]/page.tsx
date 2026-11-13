import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compass } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { KIND_INFO, WORKSHEET_COLUMNS, type WorksheetRow } from "@/lib/strategy";
import { requireStrategy } from "../access";
import { WorksheetEditor } from "./WorksheetEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Worksheet — Strategy" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorksheetPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, isAdmin } = await requireStrategy();
  if (!UUID.test(id)) notFound();
  const { data } = await supabase.from("strategy_worksheets").select(WORKSHEET_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const row = data as unknown as WorksheetRow;
  return (
    <div>
      <CalculatorHeader icon={Compass} eyebrow={KIND_INFO[row.kind].origin} title={KIND_INFO[row.kind].label} description={KIND_INFO[row.kind].question} />
      <WorksheetEditor worksheet={row} isAdmin={isAdmin} />
    </div>
  );
}
