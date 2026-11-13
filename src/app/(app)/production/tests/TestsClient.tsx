"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { OUTCOME_LABEL, TEST_OUTCOMES, testSummary, validateTest, type TestDraft, type TestRow } from "@/lib/production";
import { Field } from "../../sales/SalesShell";
import { FieldError } from "../ProductionShell";

export function TestsClient({
  tests, batches, lots, today, isAdmin, email,
}: {
  tests: TestRow[];
  batches: { id: string; batch_no: string }[];
  lots: { id: string; lot_no: string; supplier: string }[];
  today: string;
  isAdmin: boolean;
  email: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const blank: TestDraft = { tested_on: today, material: "", test_name: "", method: "", result: "", outcome: "pass", batch_id: "", lot_id: "", notes: "" };
  const [draft, setDraft] = useState<TestDraft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof TestDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<TestRow | null>(null);
  const summary = testSummary(tests);
  const set = (k: keyof TestDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const canEdit = (t: TestRow) => isAdmin || t.created_by_email === email;
  const batchNo = (id: string | null) => batches.find((b) => b.id === id)?.batch_no;
  const lotLabel = (id: string | null) => {
    const l = lots.find((x) => x.id === id);
    return l ? `${l.supplier} ${l.lot_no}` : undefined;
  };

  function edit(t: TestRow) {
    setEditing(t.id);
    setErrors({});
    setDraft({ tested_on: t.tested_on, material: t.material, test_name: t.test_name, method: t.method ?? "", result: t.result, outcome: t.outcome, batch_id: t.batch_id ?? "", lot_id: t.lot_id ?? "", notes: t.notes ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() {
    setEditing(null);
    setErrors({});
    setDraft(blank);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateTest(draft, today);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const { error } = editing ? await supabase.from("material_tests").update(v.row).eq("id", editing) : await supabase.from("material_tests").insert(v.row);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Test updated." : "Test recorded.");
    reset();
    router.refresh();
  }
  async function remove() {
    if (!deleting) return;
    const { error } = await supabase.from("material_tests").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success("Test deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section aria-label="Test results" className="grid gap-3 sm:grid-cols-4">
        {[
          ["Tests recorded", String(summary.total)],
          ["Passed", String(summary.pass)],
          ["Failed", String(summary.fail)],
          ["Pass rate (decided tests)", `${summary.passRate}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-white p-3 shadow-card">
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{label}</p>
            <p className="text-lg font-semibold text-ink">{value}</p>
          </div>
        ))}
      </section>

      <form onSubmit={submit} noValidate aria-label={editing ? "Edit test" : "Record a test"} className="rounded-xl border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-ink">{editing ? "Edit test" : "Record a test"}</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Tested on"><Input type="date" value={draft.tested_on} max={today} onChange={set("tested_on")} /><FieldError message={errors.tested_on} /></Field>
          <Field label="Material"><Input value={draft.material} onChange={set("material")} /><FieldError message={errors.material} /></Field>
          <Field label="Test"><Input value={draft.test_name} onChange={set("test_name")} placeholder="e.g. Tear strength" /><FieldError message={errors.test_name} /></Field>
          <Field label="Outcome">
            <Select value={draft.outcome} onChange={set("outcome")} aria-label="Outcome">
              {TEST_OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
            </Select>
            <FieldError message={errors.outcome} />
          </Field>
          <Field label="Result" className="sm:col-span-2"><Input value={draft.result} onChange={set("result")} placeholder="e.g. 14 N/mm" /><FieldError message={errors.result} /></Field>
          <Field label="Method (optional)" className="sm:col-span-2"><Input value={draft.method} onChange={set("method")} /><FieldError message={errors.method} /></Field>
          <Field label="Batch (optional)">
            <Select value={draft.batch_id} onChange={set("batch_id")} aria-label="Batch">
              <option value="">None</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_no}</option>)}
            </Select>
          </Field>
          <Field label="Supplier lot (optional)">
            <Select value={draft.lot_id} onChange={set("lot_id")} aria-label="Supplier lot">
              <option value="">None</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.supplier} {l.lot_no}</option>)}
            </Select>
          </Field>
          <Field label="Notes (optional)" className="sm:col-span-2"><Input value={draft.notes} onChange={set("notes")} /><FieldError message={errors.notes} /></Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button intent="primary" size="sm" type="submit" disabled={busy}>{editing ? "Save changes" : "Record test"}</Button>
          {editing && <Button intent="secondary" size="sm" type="button" onClick={reset}>Cancel</Button>}
        </div>
      </form>

      <section aria-label="Tests">
        <h2 className="mb-2 text-sm font-semibold text-ink">Tests</h2>
        {tests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-soft">No tests recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase text-ink-soft">
                  <th className="px-3 py-2">Date</th><th>Material</th><th>Test</th><th>Result</th><th>Outcome</th><th>About</th><th>By</th><th />
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-mono text-[12px]">{t.tested_on}</td>
                    <td>{t.material}</td>
                    <td>{t.test_name}</td>
                    <td>{t.result}</td>
                    <td className={t.outcome === "fail" ? "font-semibold text-danger" : t.outcome === "pass" ? "text-coir-dark" : "text-ink-soft"}>{OUTCOME_LABEL[t.outcome]}</td>
                    <td className="text-[12px] text-ink-soft">{[batchNo(t.batch_id) && `Batch ${batchNo(t.batch_id)}`, lotLabel(t.lot_id)].filter(Boolean).join(" · ")}</td>
                    <td className="text-[12px] text-ink-soft">{t.created_by_email.split("@")[0]}</td>
                    <td className="whitespace-nowrap py-1 pr-3 text-right">
                      {canEdit(t) && <Button intent="secondary" size="sm" onClick={() => edit(t)} aria-label={`Edit test ${t.test_name} of ${t.material}`}>Edit</Button>}{" "}
                      {isAdmin && <Button intent="danger" size="sm" onClick={() => setDeleting(t)} aria-label={`Delete test ${t.test_name} of ${t.material}`}>Delete</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} title="Delete this test?" description="The test is removed for everyone." onConfirm={remove} />
    </div>
  );
}
