"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { DISCIPLINE_LABELS, internName, type InternRow } from "@/lib/people";
import { EVAL_STATUS_LABELS, averageScore, validateEvaluation, type EvaluationDraft, type EvaluationRow, type ScoreRow } from "@/lib/evaluations";
import { Field } from "../../sales/SalesShell";

export function EvaluationsClient({
  evaluations, scores, interns, writable, today, viewerEmail,
}: {
  evaluations: EvaluationRow[];
  scores: ScoreRow[];
  interns: InternRow[];
  writable: InternRow[];
  today: string;
  viewerEmail: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<EvaluationDraft>({ intern_id: "", period: "", evaluated_on: today, strengths: "", improvements: "", recommendation: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof EvaluationDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string) => {
    const i = interns.find((x) => x.id === id);
    return i ? internName(i) : "Unknown intern";
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const v = validateEvaluation(draft, today);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const { data, error } = await supabase.from("people_evaluations").insert(v.row).select("id").single();
    setBusy(false);
    if (error || !data) return toast.error(error?.code === "23505" ? "That intern already has an evaluation for that period." : error?.message ?? "Could not create the evaluation.");
    router.push(`/people/evaluations/${data.id}`);
  }

  return (
    <div className="space-y-6">
      {writable.length > 0 && (
        <form onSubmit={create} noValidate aria-label="New evaluation" className="rounded-xl border border-line bg-white p-4 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink">New evaluation</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Intern">
              <Select value={draft.intern_id} onChange={(e) => setDraft((d) => ({ ...d, intern_id: e.target.value }))} aria-label="Intern">
                <option value="">Choose…</option>
                {writable.map((i) => (
                  <option key={i.id} value={i.id}>{internName(i)} ({DISCIPLINE_LABELS[i.discipline]})</option>
                ))}
              </Select>
              {errors.intern_id && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.intern_id}</span>}
            </Field>
            <Field label="Period" hint="For example Midterm, Final or Month 2.">
              <Input value={draft.period} onChange={(e) => setDraft((d) => ({ ...d, period: e.target.value }))} />
              {errors.period && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.period}</span>}
            </Field>
            <Field label="Date">
              <Input type="date" value={draft.evaluated_on} max={today} onChange={(e) => setDraft((d) => ({ ...d, evaluated_on: e.target.value }))} />
              {errors.evaluated_on && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.evaluated_on}</span>}
            </Field>
          </div>
          <Button className="mt-3" intent="primary" size="sm" type="submit" disabled={busy}>{busy ? "Creating…" : "Start evaluation"}</Button>
        </form>
      )}

      <section aria-label="Evaluations">
        <h2 className="mb-2 text-sm font-semibold text-ink">Evaluations</h2>
        {evaluations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-soft">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {evaluations.map((e) => {
              const mine = scores.filter((s) => s.evaluation_id === e.id);
              return (
                <li key={e.id}>
                  <Link href={`/people/evaluations/${e.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-coir-bg/40">
                    <span>
                      <span className="block text-[13px] font-semibold text-ink">{nameOf(e.intern_id)} · {e.period}</span>
                      <span className="block text-[12px] text-ink-soft">
                        {EVAL_STATUS_LABELS[e.status]} · {mine.length === 0 ? "no scores yet" : `average ${averageScore(mine)} of 5`}
                        {e.created_by_email !== viewerEmail && ` · by ${e.created_by_email.split("@")[0]}`}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-ink-soft">{e.evaluated_on}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
