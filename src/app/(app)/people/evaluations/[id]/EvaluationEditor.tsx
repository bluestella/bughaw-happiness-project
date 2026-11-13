"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  EVAL_STATUS_LABELS,
  IMPROVEMENTS_MAX,
  RECOMMENDATION_MAX,
  SCORE_LABELS,
  SCORE_MAX,
  STRENGTHS_MAX,
  averageScore,
  canShare,
  completeness,
  scoreChanges,
  scoreDraftFrom,
  type CriterionRow,
  type EvaluationRow,
  type ScoreDraft,
  type ScoreRow,
} from "@/lib/evaluations";
import { Field } from "../../../sales/SalesShell";

export function EvaluationEditor({
  evaluation, offered, scores, canWrite,
}: {
  evaluation: EvaluationRow;
  offered: CriterionRow[];
  scores: ScoreRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const editable = canWrite && evaluation.status === "draft";
  const [draft, setDraft] = useState<ScoreDraft>(() => scoreDraftFrom(scores));
  const [strengths, setStrengths] = useState(evaluation.strengths ?? "");
  const [improvements, setImprovements] = useState(evaluation.improvements ?? "");
  const [recommendation, setRecommendation] = useState(evaluation.recommendation ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);

  // What the page shows: the offered criteria, plus any scored criterion that has since been retired.
  const offeredIds = new Set(offered.map((c) => c.id));
  const retired = scores.filter((s) => !offeredIds.has(s.criterion_id));
  const live = offered.map((c) => ({ id: c.id, label: c.label, description: c.description }));
  const rows = [...live, ...retired.map((s) => ({ id: s.criterion_id, label: s.criterion_label, description: null as string | null }))];
  const current = rows.flatMap((r) => (draft[r.id]?.score ? [{ score: draft[r.id].score, criterion_id: r.id }] : []));
  const progress = completeness(current, offered);

  const setScore = (id: string, score: number) => setDraft((d) => ({ ...d, [id]: { score, comment: d[id]?.comment ?? "" } }));
  const setComment = (id: string, comment: string) => setDraft((d) => ({ ...d, [id]: { score: d[id]?.score ?? 0, comment } }));

  async function save(): Promise<boolean> {
    const changes = scoreChanges(scores, draft, offered);
    if (!changes.ok) {
      toast.error(changes.error);
      return false;
    }
    setBusy(true);
    const ev = await supabase
      .from("people_evaluations")
      .update({ strengths: strengths.trim() || null, improvements: improvements.trim() || null, recommendation: recommendation.trim() || null })
      .eq("id", evaluation.id);
    if (ev.error) {
      setBusy(false);
      toast.error(ev.error.message);
      return false;
    }
    if (changes.remove.length) {
      const del = await supabase.from("people_evaluation_scores").delete().in("id", changes.remove);
      if (del.error) {
        setBusy(false);
        toast.error(del.error.message);
        return false;
      }
    }
    if (changes.upsert.length) {
      const up = await supabase
        .from("people_evaluation_scores")
        .upsert(changes.upsert.map((u) => ({ ...u, evaluation_id: evaluation.id })), { onConflict: "evaluation_id,criterion_id" });
      if (up.error) {
        setBusy(false);
        toast.error(up.error.message);
        return false;
      }
    }
    setBusy(false);
    toast.success("Saved.");
    router.refresh();
    return true;
  }

  async function shareIt() {
    if (!(await save())) throw new Error("not saved");
    const { error } = await supabase.from("people_evaluations").update({ status: "shared" }).eq("id", evaluation.id);
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success("Shared with the intern.");
    router.refresh();
  }

  const savedScores = rows.flatMap((r) => (draft[r.id]?.score ? [{ score: draft[r.id].score }] : []));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-card">
        <p className="text-[13px] text-ink">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Status</span>{" "}
          <span className="font-semibold">{EVAL_STATUS_LABELS[evaluation.status]}</span>
          <span className="ml-3 font-mono text-[12px] text-ink-soft">{evaluation.evaluated_on}</span>
        </p>
        <p className="text-[13px] text-ink">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">Average</span>{" "}
          <span className="font-semibold">{savedScores.length === 0 ? "—" : `${averageScore(savedScores)} of ${SCORE_MAX}`}</span>
          <span className="ml-2 text-[12px] text-ink-soft">{progress.scored} of {progress.total} criteria scored</span>
        </p>
        <div className="ml-auto flex gap-2 print:hidden">
          <Button intent="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" aria-hidden /> Print
          </Button>
          {editable && <Button intent="primary" size="sm" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>}
          {editable && (
            <Button intent="secondary" size="sm" onClick={() => setConfirmShare(true)} disabled={busy || !canShare(evaluation.status, current.length)}>
              Share with intern
            </Button>
          )}
        </div>
      </div>

      {evaluation.status === "draft" && !canWrite && (
        <p className="rounded-lg border border-line bg-paper px-3 py-2 text-[12px] text-ink-soft">This is a draft.</p>
      )}
      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-ink-soft">
          There are no criteria for this discipline yet. A super_admin adds them under People → Criteria.
        </p>
      )}

      <div className="space-y-3">
        {rows.map((r) => {
          const d = draft[r.id] ?? { score: 0, comment: "" };
          return (
            <div key={r.id} className="grid gap-3 rounded-xl border border-line bg-white p-4 shadow-card sm:grid-cols-[2fr_12rem_3fr]">
              <div>
                <p className="text-[13px] font-semibold text-ink">{r.label}</p>
                {r.description && <p className="text-[11px] text-ink-soft">{r.description}</p>}
              </div>
              <Field label="Score">
                {editable ? (
                  <Select value={String(d.score)} onChange={(e) => setScore(r.id, Number(e.target.value))} aria-label={`Score for ${r.label}`}>
                    <option value="0">Not scored</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {SCORE_LABELS[n]}</option>)}
                  </Select>
                ) : (
                  <p className="pt-1.5 text-[13px] text-ink">{d.score ? `${d.score} · ${SCORE_LABELS[d.score]}` : "Not scored"}</p>
                )}
              </Field>
              <Field label="Comment">
                {editable ? (
                  <Textarea rows={2} value={d.comment} onChange={(e) => setComment(r.id, e.target.value)} aria-label={`Comment on ${r.label}`} />
                ) : (
                  <p className="pt-1.5 text-[13px] text-ink">{d.comment || "—"}</p>
                )}
              </Field>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-xl border border-line bg-white p-4 shadow-card sm:grid-cols-3">
        {[
          ["Strengths", strengths, setStrengths, STRENGTHS_MAX],
          ["Where to improve", improvements, setImprovements, IMPROVEMENTS_MAX],
          ["Recommendation", recommendation, setRecommendation, RECOMMENDATION_MAX],
        ].map(([label, value, set, max]) => (
          <Field key={label as string} label={label as string}>
            {editable ? (
              <Textarea rows={5} maxLength={max as number} value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} aria-label={label as string} />
            ) : (
              <p className="whitespace-pre-wrap pt-1.5 text-[13px] text-ink">{(value as string) || "—"}</p>
            )}
          </Field>
        ))}
      </div>
      {editable && (
        <p className="text-[11px] text-ink-soft">
          Only you and a super_admin can see this draft. Sharing releases it to the intern and makes it final: it cannot be edited or deleted afterwards, so a correction is a new evaluation.
        </p>
      )}

      <ConfirmDialog
        open={confirmShare}
        onOpenChange={setConfirmShare}
        title="Share this evaluation with the intern?"
        description="They will be able to read the scores and your feedback. It then becomes final and cannot be edited or deleted."
        confirmLabel="Share"
        busyLabel="Sharing…"
        onConfirm={shareIt}
      />
    </div>
  );
}
