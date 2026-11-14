// Intern evaluations — pure helpers: the rubric, scores and the draft -> shared step.
//
// MIRRORS supabase/migrations/0024_intern_evaluations.sql. The database is the boundary (RLS
// plus triggers); these helpers decide which criteria to offer, validate forms and compute the
// averages the screens show. Nothing here returns NaN or Infinity.
//
// The rubric is data: a super_admin writes the criteria (the schools' forms are typed in, not
// coded in). Scores are whole numbers 1 to 5. The wording of the five levels below is a neutral
// default, not any school's.

import { DISCIPLINES, type Discipline } from "@/lib/people";
import { manilaDate } from "@/lib/crm";

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
export const SCORE_LABELS: Record<number, string> = {
  1: "Needs significant improvement",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

export const EVAL_STATUSES = ["draft", "shared"] as const;
export type EvalStatus = (typeof EVAL_STATUSES)[number];
export const EVAL_STATUS_LABELS: Record<EvalStatus, string> = { draft: "Draft", shared: "Shared with intern" };

export const LABEL_MAX = 80;
export const DESCRIPTION_MAX = 300;
export const PERIOD_MAX = 60;
export const STRENGTHS_MAX = 1000;
export const IMPROVEMENTS_MAX = 1000;
export const RECOMMENDATION_MAX = 500;
export const COMMENT_MAX = 500;
export const SORT_MAX = 10000;

export type CriterionRow = {
  id: string;
  label: string;
  description: string | null;
  discipline: Discipline | null;
  sort_order: number;
  is_active: boolean;
};
export type EvaluationRow = {
  id: string;
  intern_id: string;
  period: string;
  evaluated_on: string;
  strengths: string | null;
  improvements: string | null;
  recommendation: string | null;
  status: EvalStatus;
  shared_at: string | null;
  created_by_email: string;
};
export type ScoreRow = {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  criterion_label: string;
  score: number;
  comment: string | null;
};
export const CRITERION_COLUMNS = "id, label, description, discipline, sort_order, is_active";
export const EVALUATION_COLUMNS = "id, intern_id, period, evaluated_on, strengths, improvements, recommendation, status, shared_at, created_by_email";
export const SCORE_COLUMNS = "id, evaluation_id, criterion_id, criterion_label, score, comment";

/** The criteria offered for an intern: in use, and either for everyone or for their discipline. */
export function criteriaFor(criteria: CriterionRow[], discipline: Discipline): CriterionRow[] {
  return criteria
    .filter((c) => c.is_active && (c.discipline === null || c.discipline === discipline))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

const round2 = (n: number): number => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

/** The mean of the scores, to two decimals. No scores is 0, not NaN. */
export function averageScore(scores: Pick<ScoreRow, "score">[]): number {
  const valid = scores.map((s) => Number(s.score)).filter((n) => Number.isFinite(n));
  return valid.length === 0 ? 0 : round2(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/** How many of the offered criteria have a score. */
export function completeness(scores: Pick<ScoreRow, "criterion_id">[], offered: Pick<CriterionRow, "id">[]) {
  const scored = new Set(scores.map((s) => s.criterion_id));
  const done = offered.filter((c) => scored.has(c.id)).length;
  return { scored: done, total: offered.length, complete: offered.length > 0 && done === offered.length };
}

/** An evaluation can be shared once at least one criterion has a score (the database agrees). */
export const canShare = (status: EvalStatus, scoreCount: number): boolean => status === "draft" && scoreCount > 0;
export const isLocked = (status: EvalStatus): boolean => status === "shared";

/** The change in average between two evaluations, to two decimals (later minus earlier). */
export const averageChange = (earlier: Pick<ScoreRow, "score">[], later: Pick<ScoreRow, "score">[]): number =>
  earlier.length === 0 || later.length === 0 ? 0 : round2(averageScore(later) - averageScore(earlier));

// ---------- forms ----------
type Errors<T> = Partial<Record<keyof T, string>>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string): boolean => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export type CriterionDraft = { label: string; description: string; discipline: string; sort_order: string };
export function validateCriterion(d: CriterionDraft):
  | { ok: true; row: { label: string; description: string | null; discipline: Discipline | null; sort_order: number } }
  | { ok: false; errors: Errors<CriterionDraft> } {
  const errors: Errors<CriterionDraft> = {};
  const label = d.label.trim();
  if (!label) errors.label = "Name the criterion.";
  else if (label.length > LABEL_MAX) errors.label = `Keep it under ${LABEL_MAX} characters.`;
  if (d.description.trim().length > DESCRIPTION_MAX) errors.description = `Keep it under ${DESCRIPTION_MAX} characters.`;
  if (d.discipline !== "" && !(DISCIPLINES as readonly string[]).includes(d.discipline)) errors.discipline = "Choose a discipline, or all.";
  const order = d.sort_order.trim() === "" ? 0 : Number(d.sort_order.trim());
  if (!Number.isInteger(order) || order < 0 || order > SORT_MAX) errors.sort_order = `Use a whole number from 0 to ${SORT_MAX}.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    row: { label, description: d.description.trim() || null, discipline: (d.discipline || null) as Discipline | null, sort_order: order },
  };
}

export type EvaluationDraft = { intern_id: string; period: string; evaluated_on: string; strengths: string; improvements: string; recommendation: string };
export function validateEvaluation(d: EvaluationDraft, today: string = manilaDate()):
  | { ok: true; row: { intern_id: string; period: string; evaluated_on: string; strengths: string | null; improvements: string | null; recommendation: string | null } }
  | { ok: false; errors: Errors<EvaluationDraft> } {
  const errors: Errors<EvaluationDraft> = {};
  if (!d.intern_id) errors.intern_id = "Choose the intern.";
  const period = d.period.trim();
  if (!period) errors.period = "Say what period this covers, for example Midterm.";
  else if (period.length > PERIOD_MAX) errors.period = `Keep it under ${PERIOD_MAX} characters.`;
  if (!isDate(d.evaluated_on)) errors.evaluated_on = "Enter the date.";
  else if (d.evaluated_on > today) errors.evaluated_on = "The date cannot be in the future.";
  if (d.strengths.trim().length > STRENGTHS_MAX) errors.strengths = `Keep it under ${STRENGTHS_MAX} characters.`;
  if (d.improvements.trim().length > IMPROVEMENTS_MAX) errors.improvements = `Keep it under ${IMPROVEMENTS_MAX} characters.`;
  if (d.recommendation.trim().length > RECOMMENDATION_MAX) errors.recommendation = `Keep it under ${RECOMMENDATION_MAX} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    row: {
      intern_id: d.intern_id, period, evaluated_on: d.evaluated_on, strengths: d.strengths.trim() || null,
      improvements: d.improvements.trim() || null, recommendation: d.recommendation.trim() || null,
    },
  };
}

export function validateScore(score: number, comment: string):
  | { ok: true; score: number; comment: string | null }
  | { ok: false; error: string } {
  if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) return { ok: false, error: `Score from ${SCORE_MIN} to ${SCORE_MAX}.` };
  if (comment.trim().length > COMMENT_MAX) return { ok: false, error: `Keep the comment under ${COMMENT_MAX} characters.` };
  return { ok: true, score, comment: comment.trim() || null };
}

// ---------- saving scores ----------
/** What the form holds per criterion. A score of 0 means "not scored". */
export type ScoreDraft = Record<string, { score: number; comment: string }>;

/** Start the form from what is saved. */
export function scoreDraftFrom(existing: Pick<ScoreRow, "criterion_id" | "score" | "comment">[]): ScoreDraft {
  return Object.fromEntries(existing.map((s) => [s.criterion_id, { score: s.score, comment: s.comment ?? "" }]));
}

/**
 * The writes that turn the saved scores into the form. Offered criteria with a score are
 * saved, offered criteria cleared back to "not scored" are removed, and scores for criteria that
 * are no longer offered (retired later) are left alone.
 */
export function scoreChanges(
  existing: Pick<ScoreRow, "id" | "criterion_id">[],
  draft: ScoreDraft,
  offered: Pick<CriterionRow, "id" | "label">[],
):
  | { ok: true; upsert: { criterion_id: string; score: number; comment: string | null }[]; remove: string[] }
  | { ok: false; error: string } {
  const upsert: { criterion_id: string; score: number; comment: string | null }[] = [];
  const remove: string[] = [];
  for (const c of offered) {
    const d = draft[c.id];
    const saved = existing.find((s) => s.criterion_id === c.id);
    if (!d || !d.score) {
      if (saved) remove.push(saved.id);
      continue;
    }
    const v = validateScore(d.score, d.comment);
    if (!v.ok) return { ok: false, error: `${c.label}: ${v.error}` };
    upsert.push({ criterion_id: c.id, score: v.score, comment: v.comment });
  }
  return { ok: true, upsert, remove };
}
