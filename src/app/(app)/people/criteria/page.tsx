import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { CRITERION_COLUMNS, type CriterionRow } from "@/lib/evaluations";
import { requirePeople } from "../access";
import { PeopleTabs } from "../PeopleShell";
import { CriteriaClient } from "./CriteriaClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criteria — People" };

export default async function CriteriaPage() {
  const p = await requirePeople();
  if (!p.isAdmin) redirect("/people");
  const { data } = await p.supabase.from("people_eval_criteria").select(CRITERION_COLUMNS).order("sort_order").order("label");
  return (
    <div>
      <CalculatorHeader
        icon={Users}
        eyebrow="People"
        title="Evaluation criteria"
        description="What interns are scored on. Type in each school's form here: one set for everyone, or criteria for one discipline. Scores run from 1 to 5."
      />
      <PeopleTabs hasOwn={!!p.own} reviewer isAdmin />
      <CriteriaClient criteria={(data ?? []) as unknown as CriterionRow[]} />
    </div>
  );
}
