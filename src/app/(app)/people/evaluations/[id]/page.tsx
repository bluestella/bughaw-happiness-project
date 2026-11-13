import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import {
  CRITERION_COLUMNS,
  EVALUATION_COLUMNS,
  SCORE_COLUMNS,
  criteriaFor,
  type CriterionRow,
  type EvaluationRow,
  type ScoreRow,
} from "@/lib/evaluations";
import { internName } from "@/lib/people";
import { requirePeople } from "../../access";
import { PeopleTabs } from "../../PeopleShell";
import { EvaluationEditor } from "./EvaluationEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evaluation — People" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EvaluationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const p = await requirePeople();
  if (!p.own && !p.reviewer) redirect("/people");
  if (!UUID.test(id)) notFound();
  const { data } = await p.supabase.from("people_evaluations").select(EVALUATION_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const evaluation = data as unknown as EvaluationRow;
  const intern = p.profiles.find((x) => x.id === evaluation.intern_id);
  if (!intern) notFound();
  const [scores, criteria] = await Promise.all([
    p.supabase.from("people_evaluation_scores").select(SCORE_COLUMNS).eq("evaluation_id", id),
    p.supabase.from("people_eval_criteria").select(CRITERION_COLUMNS).order("sort_order").order("label"),
  ]);
  const isSelf = intern.email.toLowerCase() === p.email;
  const writer = !isSelf && (p.isAdmin || (intern.supervisor_email ?? "").toLowerCase() === p.email);
  return (
    <div>
      <CalculatorHeader icon={Users} eyebrow="Evaluation" title={`${internName(intern)} · ${evaluation.period}`} description={`Evaluator: ${evaluation.created_by_email}`} />
      <PeopleTabs hasOwn={!!p.own} reviewer={p.reviewer} isAdmin={p.isAdmin} />
      <EvaluationEditor
        evaluation={evaluation}
        offered={criteriaFor((criteria.data ?? []) as unknown as CriterionRow[], intern.discipline)}
        scores={(scores.data ?? []) as unknown as ScoreRow[]}
        canWrite={writer}
      />
    </div>
  );
}
