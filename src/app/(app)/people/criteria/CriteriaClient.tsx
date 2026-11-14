"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { DISCIPLINES, DISCIPLINE_LABELS, type Discipline } from "@/lib/people";
import { validateCriterion, type CriterionDraft, type CriterionRow } from "@/lib/evaluations";
import { Field } from "../../sales/SalesShell";

export function CriteriaClient({ criteria }: { criteria: CriterionRow[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const blank: CriterionDraft = { label: "", description: "", discipline: "", sort_order: "" };
  const [draft, setDraft] = useState<CriterionDraft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof CriterionDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof CriterionDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  function edit(c: CriterionRow) {
    setEditing(c.id);
    setErrors({});
    setDraft({ label: c.label, description: c.description ?? "", discipline: c.discipline ?? "", sort_order: String(c.sort_order) });
  }
  function reset() {
    setEditing(null);
    setErrors({});
    setDraft(blank);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateCriterion(draft);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const { error } = editing
      ? await supabase.from("people_eval_criteria").update(v.row).eq("id", editing)
      : await supabase.from("people_eval_criteria").insert(v.row);
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "That criterion already exists for that discipline." : error.message);
    toast.success(editing ? "Criterion updated." : "Criterion added.");
    reset();
    router.refresh();
  }
  async function toggle(c: CriterionRow) {
    const { error } = await supabase.from("people_eval_criteria").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(c.is_active ? "Criterion retired. Past evaluations keep it." : "Criterion back in use.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} noValidate aria-label={editing ? "Edit criterion" : "Add a criterion"} className="rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">{editing ? "Edit criterion" : "Add a criterion"}</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Criterion" className="sm:col-span-2">
            <Input value={draft.label} onChange={set("label")} placeholder="e.g. Reliability and punctuality" />
            {errors.label && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.label}</span>}
          </Field>
          <Field label="For">
            <Select value={draft.discipline} onChange={set("discipline")} aria-label="Applies to">
              <option value="">Every discipline</option>
              {DISCIPLINES.map((d) => <option key={d} value={d}>{DISCIPLINE_LABELS[d as Discipline]}</option>)}
            </Select>
            {errors.discipline && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.discipline}</span>}
          </Field>
          <Field label="Position">
            <Input inputMode="numeric" value={draft.sort_order} onChange={set("sort_order")} />
            {errors.sort_order && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.sort_order}</span>}
          </Field>
          <Field label="What it means (optional)" className="sm:col-span-4">
            <Input value={draft.description} onChange={set("description")} />
            {errors.description && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.description}</span>}
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button intent="primary" size="sm" type="submit" disabled={busy}>{editing ? "Save changes" : "Add criterion"}</Button>
          {editing && <Button intent="secondary" size="sm" type="button" onClick={reset}>Cancel</Button>}
        </div>
      </form>

      <section aria-label="Criteria">
        <h2 className="mb-2 text-sm font-semibold text-ink">Criteria</h2>
        {criteria.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-soft">
            No criteria yet. Nothing is preset: add the ones your schools use, and evaluations will offer them.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white shadow-card">
            {criteria.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className={`block text-[13px] font-semibold ${c.is_active ? "text-ink" : "text-ink-soft line-through"}`}>{c.label}</span>
                  <span className="block text-[12px] text-ink-soft">
                    {c.discipline ? DISCIPLINE_LABELS[c.discipline] : "Every discipline"} · position {c.sort_order}{!c.is_active && " · retired"}
                    {c.description && ` · ${c.description}`}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button intent="secondary" size="sm" onClick={() => edit(c)} aria-label={`Edit criterion ${c.label}`}>Edit</Button>
                  <Button intent="secondary" size="sm" onClick={() => void toggle(c)} aria-label={`${c.is_active ? "Retire" : "Restore"} criterion ${c.label}`}>
                    {c.is_active ? "Retire" : "Restore"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
