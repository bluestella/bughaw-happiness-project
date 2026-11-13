import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_MAX_BYTES,
  FIT_THRESHOLD,
  HORIZONS,
  KIND_INFO,
  MAX_ROWS,
  PORTER_FORCES,
  RICE_IMPACT,
  SCORECARD_PERSPECTIVES,
  TITLE_MAX,
  WORKSHEET_KINDS,
  cleanData,
  emptyData,
  horizonMix,
  isKind,
  nineBoxCells,
  nineBoxLabel,
  objectiveProgress,
  porterSummary,
  riceRanking,
  riceScore,
  scorecardProgress,
  seanEllisSummary,
  validateWorksheet,
  worksheetHeadline,
  type HorizonsData,
  type NineBoxData,
  type PorterData,
  type RiceData,
  type ScorecardData,
  type SeanEllisData,
} from "@/lib/strategy";

const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0022_strategy_worksheets.sql"), "utf8");

describe("vocabulary mirrors 0022_strategy_worksheets.sql", () => {
  it("every kind is allowed by the check constraint, and nothing else is", () => {
    const m = sql.match(/check \(kind in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const kinds = (m as RegExpMatchArray)[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(kinds).toEqual([...WORKSHEET_KINDS]);
  });
  it("title and size limits", () => {
    expect(sql).toContain(`char_length(title) <= ${TITLE_MAX}`);
    expect(sql).toContain(`octet_length(data::text) <= ${DATA_MAX_BYTES}`);
  });
  it("every kind has a label, an origin and a question", () => {
    for (const k of WORKSHEET_KINDS) {
      expect(KIND_INFO[k].label.length).toBeGreaterThan(0);
      expect(KIND_INFO[k].origin.length).toBeGreaterThan(0);
      expect(KIND_INFO[k].question.endsWith("?")).toBe(true);
    }
  });
  it("isKind", () => {
    expect(isKind("rice")).toBe(true);
    expect(isKind("swot")).toBe(false);
    expect(isKind(3)).toBe(false);
  });
});

describe("Five Forces", () => {
  const set = (ratings: number[]): PorterData => {
    const d = emptyData("porter") as PorterData;
    PORTER_FORCES.forEach((f, i) => (d.forces[f.key].rating = ratings[i] ?? 0));
    return d;
  };
  it("asks for all five ratings first", () => {
    const s = porterSummary(set([3, 3, 0, 0, 0]));
    expect(s.verdict).toBe("Rate all five forces");
    expect(s.average).toBe(3);
  });
  it("an empty sheet has no average and no strongest force", () => {
    const s = porterSummary(emptyData("porter") as PorterData);
    expect(s).toEqual({ average: 0, strongest: null, verdict: "Rate all five forces" });
  });
  it("verdict bands: 2.4 attractive, 3.4 moderate, above that tough", () => {
    expect(porterSummary(set([2, 2, 3, 2, 3])).verdict).toBe("Attractive market"); // 2.4
    expect(porterSummary(set([3, 3, 4, 3, 4])).verdict).toBe("Moderately attractive"); // 3.4
    expect(porterSummary(set([4, 4, 4, 3, 3])).verdict).toBe("Tough market"); // 3.6
  });
  it("names the strongest force; the first wins a tie", () => {
    expect(porterSummary(set([2, 5, 1, 5, 2])).strongest).toMatchObject({ key: "new_entrants", rating: 5 });
  });
});

describe("Three Horizons", () => {
  const item = (horizon: 1 | 2 | 3, share: number) => ({ name: "x", horizon, share, notes: "" });
  it("shares each horizon of the total and the gap to 70/20/10", () => {
    const mix = horizonMix({ items: [item(1, 50), item(2, 30), item(3, 20)] });
    expect(mix.map((m) => m.pct)).toEqual([50, 30, 20]);
    expect(mix.map((m) => m.gap)).toEqual([-20, 10, 10]);
    expect(HORIZONS.map((h) => h.target)).toEqual([70, 20, 10]);
  });
  it("normalises when the shares do not add up to 100", () => {
    const mix = horizonMix({ items: [item(1, 14), item(2, 4), item(3, 2)] });
    expect(mix.map((m) => m.pct)).toEqual([70, 20, 10]);
  });
  it("no initiatives, no NaN", () => {
    const mix = horizonMix({ items: [] });
    expect(mix.every((m) => m.pct === 0 && Number.isFinite(m.gap))).toBe(true);
  });
});

describe("Balanced Scorecard", () => {
  const obj = (target: number, actual: number, name = "o") => ({ objective: name, measure: "m", target, actual });
  it("progress is actual over target, capped at 100", () => {
    expect(objectiveProgress(obj(200, 50))).toBe(25);
    expect(objectiveProgress(obj(100, 250))).toBe(100);
  });
  it("a target of zero, or a negative actual, is 0", () => {
    expect(objectiveProgress(obj(0, 10))).toBe(0);
    expect(objectiveProgress(obj(10, -5))).toBe(0);
  });
  it("averages within a perspective, then across perspectives that have objectives", () => {
    const d = emptyData("balanced_scorecard") as ScorecardData;
    d.perspectives.financial = [obj(100, 100), obj(100, 50)]; // 75
    d.perspectives.customer = [obj(10, 10)]; // 100
    const s = scorecardProgress(d);
    expect(s.perspectives.find((p) => p.key === "financial")).toMatchObject({ count: 2, average: 75 });
    expect(s.overall).toBe(87.5);
  });
  it("ignores unnamed rows; an empty card is 0", () => {
    const d = emptyData("balanced_scorecard") as ScorecardData;
    d.perspectives.process = [obj(10, 10, "")];
    expect(scorecardProgress(d).overall).toBe(0);
    expect(scorecardProgress(d).perspectives.every((p) => p.count === 0)).toBe(true);
    expect(SCORECARD_PERSPECTIVES).toHaveLength(4);
  });
});

describe("RICE", () => {
  const it1 = (name: string, reach: number, impact: number, confidence: number, effort: number) =>
    ({ name, reach, impact, confidence, effort, notes: "" });
  it("is reach x impact x confidence / effort", () => {
    expect(riceScore(it1("a", 1000, 2, 80, 4))).toBe(400);
    expect(riceScore(it1("a", 500, 0.5, 100, 1))).toBe(250);
  });
  it("no effort is no score, never Infinity", () => {
    expect(riceScore(it1("a", 1000, 3, 100, 0))).toBe(0);
  });
  it("ranks highest first, ties keep the entered order, unnamed rows are left out", () => {
    const d: RiceData = { items: [it1("low", 10, 1, 50, 1), it1("", 9999, 3, 100, 1), it1("tie1", 100, 1, 100, 1), it1("tie2", 100, 1, 100, 1)] };
    const r = riceRanking(d);
    expect(r.map((x) => x.item.name)).toEqual(["tie1", "tie2", "low"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it("offers the five standard impact levels", () => {
    expect(RICE_IMPACT.map((o) => o.value)).toEqual([3, 2, 1, 0.5, 0.25]);
  });
});

describe("Nine-box", () => {
  it("labels every cell", () => {
    expect(nineBoxLabel(3, 3)).toBe("Star");
    expect(nineBoxLabel(1, 1)).toBe("Needs action");
    expect(nineBoxLabel(2, 2)).toBe("Core player");
    expect(nineBoxLabel(9, 9)).toBe("Unplaced");
  });
  it("has nine cells, high potential on top, and places each name once", () => {
    const d: NineBoxData = {
      items: [
        { name: "Ana", performance: 3, potential: 3, notes: "" },
        { name: "Ben", performance: 1, potential: 1, notes: "" },
        { name: "", performance: 2, potential: 2, notes: "" },
      ],
    };
    const cells = nineBoxCells(d);
    expect(cells).toHaveLength(9);
    expect(cells[0]).toMatchObject({ potential: 3, performance: 1 });
    expect(cells.find((c) => c.label === "Star")?.names).toEqual(["Ana"]);
    expect(cells.find((c) => c.label === "Needs action")?.names).toEqual(["Ben"]);
    expect(cells.flatMap((c) => c.names)).toHaveLength(2);
  });
});

describe("Sean Ellis", () => {
  const s = (very: number, somewhat: number, not: number, na = 0): SeanEllisData => ({ very, somewhat, not, na, notes: "" });
  it("40% very disappointed is the line", () => {
    expect(FIT_THRESHOLD).toBe(40);
    expect(seanEllisSummary(s(40, 30, 30))).toMatchObject({ total: 100, veryPct: 40, fit: true, verdict: "Product-market fit signal" });
    expect(seanEllisSummary(s(39, 31, 30))).toMatchObject({ veryPct: 39, fit: false, verdict: "Below the 40% line" });
  });
  it("counts people who no longer use it in the total", () => {
    expect(seanEllisSummary(s(10, 0, 0, 10)).veryPct).toBe(50);
  });
  it("no responses is not a signal and not NaN", () => {
    expect(seanEllisSummary(s(0, 0, 0))).toEqual({ total: 0, veryPct: 0, verdict: "No responses yet", fit: false });
  });
});

describe("cleanData", () => {
  it("returns an empty document of the right shape for nonsense", () => {
    for (const k of WORKSHEET_KINDS) {
      expect(cleanData(k, null)).toEqual(emptyData(k));
      expect(cleanData(k, "text")).toEqual(emptyData(k));
      expect(cleanData(k, [1, 2])).toEqual(emptyData(k));
    }
  });
  it("clamps and trims", () => {
    const p = cleanData("porter", { forces: { rivalry: { rating: 99, notes: "  hi  " }, substitutes: { rating: -3 }, buyer_power: 5 } }) as PorterData;
    expect(p.forces.rivalry).toEqual({ rating: 5, notes: "hi" });
    expect(p.forces.substitutes.rating).toBe(0);
    expect(p.forces.buyer_power).toEqual({ rating: 0, notes: "" });
  });
  it("keeps at most MAX_ROWS rows and drops non-objects", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ name: `n${i}`, horizon: 2, share: 1 }));
    const d = cleanData("three_horizons", { items: [...rows, "junk", 7] }) as HorizonsData;
    expect(d.items).toHaveLength(MAX_ROWS);
    expect(d.items[0]).toEqual({ name: "n0", horizon: 2, share: 1, notes: "" });
  });
  it("coerces horizons and nine-box positions into 1 to 3", () => {
    const h = cleanData("three_horizons", { items: [{ name: "a", horizon: 9, share: "25" }, { name: "b", horizon: 3 }, { name: "c", horizon: "x" }] }) as HorizonsData;
    expect(h.items.map((i) => i.horizon)).toEqual([3, 3, 1]);
    expect(h.items[0].share).toBe(25);
    const n = cleanData("nine_box", { items: [{ name: "a", performance: 0, potential: 7 }, { name: "b" }] }) as NineBoxData;
    expect(n.items.map((i) => [i.performance, i.potential])).toEqual([[1, 3], [2, 2]]);
  });
  it("only accepts the standard RICE impact values and defaults confidence to 50", () => {
    const r = cleanData("rice", { items: [{ name: "a", impact: 1.7 }, { name: "b", impact: "2", confidence: 500 }] }) as RiceData;
    expect(r.items.map((i) => i.impact)).toEqual([1, 2]);
    expect(r.items.map((i) => i.confidence)).toEqual([50, 100]);
  });
  it("rounds survey counts and keeps scorecard numbers non-negative", () => {
    const s = cleanData("sean_ellis", { very: 3.6, somewhat: -4, not: "7", na: "x", notes: "n" }) as SeanEllisData;
    expect(s).toEqual({ very: 4, somewhat: 0, not: 7, na: 0, notes: "n" });
    const b = cleanData("balanced_scorecard", { perspectives: { financial: [{ objective: "a", measure: "b", target: -1, actual: "5" }] } }) as ScorecardData;
    expect(b.perspectives.financial[0]).toMatchObject({ target: 0, actual: 5 });
    expect(b.perspectives.learning).toEqual([]);
  });
});

describe("validateWorksheet", () => {
  const ok = { kind: "rice" as const, title: "Q1 ideas", data: { items: [] } };
  it("accepts a good draft", () => expect(validateWorksheet(ok)).toEqual({}));
  it("needs a title within the limit and a known kind", () => {
    expect(validateWorksheet({ ...ok, title: "   " }).title).toBeDefined();
    expect(validateWorksheet({ ...ok, title: "x".repeat(TITLE_MAX + 1) }).title).toBeDefined();
    expect(validateWorksheet({ ...ok, title: "x".repeat(TITLE_MAX) }).title).toBeUndefined();
    expect(validateWorksheet({ ...ok, kind: "swot" as never }).kind).toBeDefined();
  });
  it("the largest possible document of every kind stays within the database limit", () => {
    const long = "x".repeat(1000); // longer than any field allows; cleanData cuts it
    const rows = (extra: object) => Array.from({ length: MAX_ROWS + 10 }, () => ({ name: long, notes: long, objective: long, measure: long, target: 1e12, actual: 1e12, horizon: 1, share: 100, reach: 1e9, impact: 3, confidence: 100, effort: 1e6, performance: 3, potential: 3, ...extra }));
    const worst: Record<string, unknown> = {
      porter: { forces: Object.fromEntries(PORTER_FORCES.map((f) => [f.key, { rating: 5, notes: long }])) },
      three_horizons: { items: rows({}) },
      balanced_scorecard: { perspectives: Object.fromEntries(SCORECARD_PERSPECTIVES.map((p) => [p.key, rows({})])) },
      rice: { items: rows({}) },
      nine_box: { items: rows({}) },
      sean_ellis: { very: 1e6, somewhat: 1e6, not: 1e6, na: 1e6, notes: long },
    };
    for (const k of WORKSHEET_KINDS) {
      expect(JSON.stringify(cleanData(k, worst[k])).length, k).toBeLessThan(DATA_MAX_BYTES);
    }
  });
});

describe("worksheetHeadline", () => {
  it("says something sensible for an empty sheet of every kind", () => {
    expect(WORKSHEET_KINDS.map((k) => worksheetHeadline(k, null))).toEqual([
      "Rate all five forces",
      "No initiatives yet",
      "No objectives yet",
      "No ideas yet",
      "Nobody placed yet",
      "No responses yet",
    ]);
  });
  it("summarises a filled sheet", () => {
    expect(worksheetHeadline("porter", { forces: Object.fromEntries(PORTER_FORCES.map((f) => [f.key, { rating: 2 }])) })).toBe("Attractive market (average 2 of 5)");
    expect(worksheetHeadline("three_horizons", { items: [{ name: "a", horizon: 1, share: 70 }, { name: "b", horizon: 2, share: 20 }, { name: "c", horizon: 3, share: 10 }] })).toBe("H1 70% · H2 20% · H3 10%");
    expect(worksheetHeadline("balanced_scorecard", { perspectives: { financial: [{ objective: "a", measure: "m", target: 10, actual: 5 }] } })).toBe("1 objectives, 50% of target");
    expect(worksheetHeadline("rice", { items: [{ name: "Fix", reach: 10, impact: 1, confidence: 100, effort: 1 }] })).toBe("Top: Fix (10)");
    expect(worksheetHeadline("nine_box", { items: [{ name: "Ana", performance: 3, potential: 3 }] })).toBe("1 placed");
    expect(worksheetHeadline("sean_ellis", { very: 5, somewhat: 5, not: 0, na: 0 })).toBe("50% very disappointed of 10: Product-market fit signal");
  });
});
