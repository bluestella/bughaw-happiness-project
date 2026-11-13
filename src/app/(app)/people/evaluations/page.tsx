import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { EVALUATION_COLUMNS, SCORE_COLUMNS, type EvaluationRow, type ScoreRow } from "@/lib/evaluations";
import { requirePeople } from "../access";
import { PeopleTabs } from "../PeopleShell";
import { EvaluationsClient } from "./EvaluationsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evaluations — People" };

export default async function EvaluationsPage() {
  const p = await requirePeople();
  if (!p.own && !p.reviewer) redirect("/people");
  const evals = await p.supabase.from("people_evaluations").select(EVALUATION_COLUMNS).order("evaluated_on", { ascending: false }).limit(300);
  const evaluations = (evals.data ?? []) as unknown as EvaluationRow[];
  const scores = evaluations.length
    ? ((await p.supabase.from("people_evaluation_scores").select(SCORE_COLUMNS).in("evaluation_id", evaluations.map((e) => e.id))).data ?? [])
    : [];
  // Who this person may write an evaluation about: their interns, or anyone for a super_admin; never themself.
  const writable = p.profiles.filter((x) => x.email.toLowerCase() !== p.email && (p.isAdmin || (x.supervisor_email ?? "").toLowerCase() === p.email));
  return (
    <div>
      <CalculatorHeader
        icon={Users}
        eyebrow="People"
        title="Evaluations"
        description={p.reviewer ? "Score an intern against the criteria and write feedback. A draft is private to you until you share it." : "Feedback your supervisor has shared with you."}
      />
      <PeopleTabs hasOwn={!!p.own} reviewer={p.reviewer} isAdmin={p.isAdmin} />
      <EvaluationsClient
        evaluations={evaluations}
        scores={scores as unknown as ScoreRow[]}
        interns={p.profiles}
        writable={writable}
        today={manilaDate()}
        viewerEmail={p.email}
      />
    </div>
  );
}
