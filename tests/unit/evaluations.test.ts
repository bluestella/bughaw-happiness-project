import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISCIPLINES } from "@/lib/people";
import {
  COMMENT_MAX,
  DESCRIPTION_MAX,
  EVAL_STATUSES,
  IMPROVEMENTS_MAX,
  LABEL_MAX,
  PERIOD_MAX,
  RECOMMENDATION_MAX,
  SCORE_LABELS,
  SCORE_MAX,
  SCORE_MIN,
  SORT_MAX,
  STRENGTHS_MAX,
  averageChange,
  averageScore,
  canShare,
  completeness,
  criteriaFor,
  isLocked,
  scoreChanges,
  scoreDraftFrom,
  validateCriterion,
  validateEvaluation,
  validateScore,
  type CriterionDraft,
  type CriterionRow,
  type EvaluationDraft,
} from "@/lib/evaluations";

const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0024_intern_evaluations.sql"), "utf8");
const TODAY = "2026-11-13";

describe("limits and vocabulary mirror 0024_intern_evaluations.sql", () => {
  it("text and number limits", () => {
    for (const [col, max] of [
      ["label", LABEL_MAX], ["description", DESCRIPTION_MAX], ["period", PERIOD_MAX], ["strengths", STRENGTHS_MAX],
      ["improvements", IMPROVEMENTS_MAX], ["recommendation", RECOMMENDATION_MAX], ["comment", COMMENT_MAX],
    ] as const) {
      expect(sql, col).toContain(`char_length(${col}) <= ${max}`);
    }
    expect(sql).toContain(`sort_order <= ${SORT_MAX}`);
    expect(sql).toContain(`score between ${SCORE_MIN} and ${SCORE_MAX}`);
  });
  it("statuses and disciplines", () => {
    const list = (re: RegExp) => (sql.match(re) as RegExpMatchArray)[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(list(/status in \(([^)]*)\)/)).toEqual([...EVAL_STATUSES]);
    expect(list(/discipline in \(([^)]*)\)/)).toEqual([...DISCIPLINES]);
  });
  it("every score from min to max has a label", () => {
    for (let n = SCORE_MIN; n <= SCORE_MAX; n++) expect(SCORE_LABELS[n].length).toBeGreaterThan(0);
  });
});

const crit = (over: Partial<CriterionRow> & { id: string }): CriterionRow => ({
  label: over.id, description: null, discipline: null, sort_order: 0, is_active: true, ...over,
});

describe("criteriaFor", () => {
  const all = [
    crit({ id: "b", label: "Teamwork", sort_order: 20 }),
    crit({ id: "a", label: "Initiative", sort_order: 10 }),
    crit({ id: "m", label: "Campaign craft", discipline: "marketing", sort_order: 5 }),
    crit({ id: "g", label: "Layout", discipline: "graphics", sort_order: 5 }),
    crit({ id: "x", label: "Retired", is_active: false }),
    crit({ id: "c", label: "Alpha", sort_order: 10 }),
  ];
  it("offers shared and own-discipline criteria, in use only, ordered by position then name", () => {
    expect(criteriaFor(all, "marketing").map((c) => c.id)).toEqual(["m", "c", "a", "b"]);
    expect(criteriaFor(all, "graphics").map((c) => c.id)).toEqual(["g", "c", "a", "b"]);
    expect(criteriaFor(all, "chemical_engineering").map((c) => c.id)).toEqual(["c", "a", "b"]);
  });
  it("an empty rubric offers nothing", () => {
    expect(criteriaFor([], "marketing")).toEqual([]);
  });
});

describe("averages and progress", () => {
  it("the mean to two decimals; none is 0, never NaN", () => {
    expect(averageScore([{ score: 4 }, { score: 5 }, { score: 3 }])).toBe(4);
    expect(averageScore([{ score: 1 }, { score: 2 }, { score: 2 }])).toBe(1.67);
    expect(averageScore([])).toBe(0);
    expect(averageScore([{ score: NaN }])).toBe(0);
  });
  it("completeness counts only the offered criteria that have a score", () => {
    const offered = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(completeness([{ criterion_id: "a" }, { criterion_id: "zz" }], offered)).toEqual({ scored: 1, total: 3, complete: false });
    expect(completeness([{ criterion_id: "a" }, { criterion_id: "b" }, { criterion_id: "c" }], offered).complete).toBe(true);
    expect(completeness([], []).complete).toBe(false);
  });
  it("the change between two evaluations", () => {
    expect(averageChange([{ score: 3 }, { score: 3 }], [{ score: 4 }, { score: 5 }])).toBe(1.5);
    expect(averageChange([{ score: 5 }], [{ score: 3 }])).toBe(-2);
    expect(averageChange([], [{ score: 4 }])).toBe(0);
    expect(averageChange([{ score: 4 }], [])).toBe(0);
    expect(averageChange([{ score: 4 }], [{ score: 4 }])).toBe(0);
  });
  it("sharing needs a draft with at least one score; shared is locked", () => {
    expect(canShare("draft", 1)).toBe(true);
    expect(canShare("draft", 0)).toBe(false);
    expect(canShare("shared", 3)).toBe(false);
    expect(isLocked("shared")).toBe(true);
    expect(isLocked("draft")).toBe(false);
  });
});

const cd = (over: Partial<CriterionDraft> = {}): CriterionDraft => ({ label: " Initiative ", description: "", discipline: "", sort_order: "", ...over });
describe("validateCriterion", () => {
  it("accepts a good one; blank discipline is all disciplines and blank order is 0", () => {
    expect(validateCriterion(cd())).toEqual({ ok: true, row: { label: "Initiative", description: null, discipline: null, sort_order: 0 } });
    expect(validateCriterion(cd({ discipline: "graphics", sort_order: "30", description: " d " }))).toEqual({ ok: true, row: { label: "Initiative", description: "d", discipline: "graphics", sort_order: 30 } });
  });
  it("names each problem", () => {
    const e = (over: Partial<CriterionDraft>) => { const v = validateCriterion(cd(over)); return v.ok ? {} : v.errors; };
    expect(e({ label: " " }).label).toBeDefined();
    expect(e({ label: "x".repeat(LABEL_MAX + 1) }).label).toBeDefined();
    expect(e({ description: "x".repeat(DESCRIPTION_MAX + 1) }).description).toBeDefined();
    expect(e({ discipline: "law" }).discipline).toBeDefined();
    expect(e({ sort_order: "1.5" }).sort_order).toBeDefined();
    expect(e({ sort_order: "-1" }).sort_order).toBeDefined();
    expect(e({ sort_order: String(SORT_MAX + 1) }).sort_order).toBeDefined();
    expect(e({ sort_order: "abc" }).sort_order).toBeDefined();
  });
});

const ed = (over: Partial<EvaluationDraft> = {}): EvaluationDraft => ({
  intern_id: "i1", period: " Midterm ", evaluated_on: TODAY, strengths: "", improvements: "", recommendation: "", ...over,
});
describe("validateEvaluation", () => {
  it("accepts a good one and turns blank text into null", () => {
    expect(validateEvaluation(ed(), TODAY)).toEqual({ ok: true, row: { intern_id: "i1", period: "Midterm", evaluated_on: TODAY, strengths: null, improvements: null, recommendation: null } });
    const v = validateEvaluation(ed({ strengths: " s ", improvements: " i ", recommendation: " r " }), TODAY);
    expect(v.ok && [v.row.strengths, v.row.improvements, v.row.recommendation]).toEqual(["s", "i", "r"]);
  });
  it("names each problem", () => {
    const e = (over: Partial<EvaluationDraft>) => { const v = validateEvaluation(ed(over), TODAY); return v.ok ? {} : v.errors; };
    expect(e({ intern_id: "" }).intern_id).toBeDefined();
    expect(e({ period: " " }).period).toBeDefined();
    expect(e({ period: "p".repeat(PERIOD_MAX + 1) }).period).toBeDefined();
    expect(e({ evaluated_on: "13-11-2026" }).evaluated_on).toBeDefined();
    expect(e({ evaluated_on: "2026-13-40" }).evaluated_on).toBeDefined();
    expect(e({ evaluated_on: "2026-11-14" }).evaluated_on).toMatch(/future/);
    expect(e({ strengths: "s".repeat(STRENGTHS_MAX + 1) }).strengths).toBeDefined();
    expect(e({ improvements: "s".repeat(IMPROVEMENTS_MAX + 1) }).improvements).toBeDefined();
    expect(e({ recommendation: "s".repeat(RECOMMENDATION_MAX + 1) }).recommendation).toBeDefined();
  });
});

describe("validateScore", () => {
  it("whole numbers 1 to 5 with an optional comment", () => {
    expect(validateScore(3, "")).toEqual({ ok: true, score: 3, comment: null });
    expect(validateScore(5, " great ")).toEqual({ ok: true, score: 5, comment: "great" });
    for (const bad of [0, 6, 2.5, NaN, -1]) expect(validateScore(bad, "").ok, String(bad)).toBe(false);
    expect(validateScore(3, "c".repeat(COMMENT_MAX + 1)).ok).toBe(false);
  });
});

describe("saving scores", () => {
  const offered = [{ id: "a", label: "Initiative" }, { id: "b", label: "Teamwork" }, { id: "c", label: "Craft" }];
  it("the form starts from what is saved", () => {
    expect(scoreDraftFrom([{ criterion_id: "a", score: 4, comment: null }, { criterion_id: "b", score: 2, comment: "ok" }]))
      .toEqual({ a: { score: 4, comment: "" }, b: { score: 2, comment: "ok" } });
    expect(scoreDraftFrom([])).toEqual({});
  });
  it("saves scored criteria, removes ones cleared back to unscored, and skips untouched ones", () => {
    const existing = [{ id: "s1", criterion_id: "a" }, { id: "s2", criterion_id: "b" }, { id: "s9", criterion_id: "retired" }];
    const r = scoreChanges(existing, { a: { score: 5, comment: " great " }, b: { score: 0, comment: "" } }, offered);
    expect(r).toEqual({ ok: true, upsert: [{ criterion_id: "a", score: 5, comment: "great" }], remove: ["s2"] });
  });
  it("leaves scores for criteria that are no longer offered alone", () => {
    const r = scoreChanges([{ id: "s9", criterion_id: "retired" }], {}, offered);
    expect(r).toEqual({ ok: true, upsert: [], remove: [] });
  });
  it("names the criterion when a score or comment is invalid", () => {
    const bad = scoreChanges([], { b: { score: 9, comment: "" } }, offered);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/^Teamwork:/);
    const long = scoreChanges([], { c: { score: 3, comment: "x".repeat(COMMENT_MAX + 1) } }, offered);
    expect(long.ok).toBe(false);
  });
});
