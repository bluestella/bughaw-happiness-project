// Strategy worksheets — pure helpers for six saved frameworks.
//
// MIRRORS supabase/migrations/0022_strategy_worksheets.sql (kinds, title and size limits).
// The database stores each worksheet as one JSON document (`data`); these helpers build an
// empty one, clean what the form sends back, and compute the numbers the screens show.
// Nothing here returns NaN or Infinity: a divide by zero is 0.

export const WORKSHEET_KINDS = [
  "porter",
  "three_horizons",
  "balanced_scorecard",
  "rice",
  "nine_box",
  "sean_ellis",
] as const;
export type WorksheetKind = (typeof WORKSHEET_KINDS)[number];

export const TITLE_MAX = 120;
export const NOTE_MAX = 500;
export const NAME_MAX = 120;
export const MAX_ROWS = 40;
export const DATA_MAX_BYTES = 65536;

export type WorksheetRow = {
  id: string;
  kind: WorksheetKind;
  title: string;
  data: unknown;
  created_by_email: string;
  created_at: string;
  updated_at: string;
};
export const WORKSHEET_COLUMNS = "id, kind, title, data, created_by_email, created_at, updated_at";

export const KIND_INFO: Record<WorksheetKind, { label: string; origin: string; question: string }> = {
  porter: {
    label: "Five Forces",
    origin: "Porter",
    question: "How hard is it to make money in this market?",
  },
  three_horizons: {
    label: "Three Horizons",
    origin: "McKinsey",
    question: "Is effort split between today's business, the next one and the long bet?",
  },
  balanced_scorecard: {
    label: "Balanced Scorecard",
    origin: "Kaplan and Norton, Harvard",
    question: "Are we on target across money, customers, operations and learning?",
  },
  rice: {
    label: "RICE prioritisation",
    origin: "Intercom",
    question: "Which of these ideas should we do first?",
  },
  nine_box: {
    label: "Nine-box grid",
    origin: "McKinsey and GE",
    question: "Where does each person, product or account sit on performance and potential?",
  },
  sean_ellis: {
    label: "Product-market fit survey",
    origin: "Sean Ellis",
    question: "Would customers be very disappointed if the product went away?",
  },
};

export function isKind(v: unknown): v is WorksheetKind {
  return typeof v === "string" && (WORKSHEET_KINDS as readonly string[]).includes(v);
}

// ---------- small helpers ----------
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
function num(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
const round = (n: number, d = 2): number => {
  const f = 10 ** d;
  const r = Math.round((Number.isFinite(n) ? n : 0) * f) / f;
  return r === 0 ? 0 : r; // never -0
};
const ratio = (a: number, b: number): number => (b > 0 && Number.isFinite(a / b) ? a / b : 0);

// ---------- Porter's Five Forces ----------
export const PORTER_FORCES = [
  { key: "rivalry", label: "Rivalry among competitors", hint: "1 = few, weak rivals; 5 = crowded, price wars" },
  { key: "new_entrants", label: "Threat of new entrants", hint: "1 = hard to enter; 5 = anyone can start" },
  { key: "substitutes", label: "Threat of substitutes", hint: "1 = nothing else does the job; 5 = easy alternatives" },
  { key: "buyer_power", label: "Bargaining power of buyers", hint: "1 = buyers need us; 5 = buyers dictate terms" },
  { key: "supplier_power", label: "Bargaining power of suppliers", hint: "1 = many suppliers; 5 = a few hold the supply" },
] as const;
export type PorterKey = (typeof PORTER_FORCES)[number]["key"];
export type PorterData = { forces: Record<PorterKey, { rating: number; notes: string }> };

export function porterSummary(d: PorterData) {
  const rows = PORTER_FORCES.map((f) => ({ ...f, rating: d.forces[f.key].rating }));
  const rated = rows.filter((r) => r.rating > 0);
  const average = rated.length === 0 ? 0 : round(rated.reduce((s, r) => s + r.rating, 0) / rated.length);
  const strongest = rated.length === 0 ? null : rated.reduce((a, b) => (b.rating > a.rating ? b : a));
  const verdict =
    rated.length < PORTER_FORCES.length
      ? "Rate all five forces"
      : average <= 2.4
        ? "Attractive market"
        : average <= 3.4
          ? "Moderately attractive"
          : "Tough market";
  return { average, strongest: strongest ? { key: strongest.key, label: strongest.label, rating: strongest.rating } : null, verdict };
}

// ---------- Three Horizons ----------
export const HORIZONS = [
  { n: 1, label: "Horizon 1: defend and extend today's core", target: 70 },
  { n: 2, label: "Horizon 2: build the next business", target: 20 },
  { n: 3, label: "Horizon 3: options for the long term", target: 10 },
] as const;
export type HorizonItem = { name: string; horizon: 1 | 2 | 3; share: number; notes: string };
export type HorizonsData = { items: HorizonItem[] };

export function horizonMix(d: HorizonsData) {
  const total = d.items.reduce((s, i) => s + i.share, 0);
  return HORIZONS.map((h) => {
    const sum = d.items.filter((i) => i.horizon === h.n).reduce((s, i) => s + i.share, 0);
    const pct = round(ratio(sum, total) * 100, 1);
    return { n: h.n, label: h.label, share: sum, pct, target: h.target, gap: round(pct - h.target, 1) };
  });
}

// ---------- Balanced Scorecard ----------
export const SCORECARD_PERSPECTIVES = [
  { key: "financial", label: "Financial", question: "To succeed financially, what must we achieve?" },
  { key: "customer", label: "Customer", question: "To serve customers, what must we deliver?" },
  { key: "process", label: "Internal processes", question: "Which processes must we excel at?" },
  { key: "learning", label: "Learning and growth", question: "What must we learn and build to keep improving?" },
] as const;
export type PerspectiveKey = (typeof SCORECARD_PERSPECTIVES)[number]["key"];
export type Objective = { objective: string; measure: string; target: number; actual: number };
export type ScorecardData = { perspectives: Record<PerspectiveKey, Objective[]> };

/** Progress of one objective as 0-100: actual over target, capped. A target of 0 is 0. */
export function objectiveProgress(o: Objective): number {
  return round(Math.min(100, ratio(Math.max(0, o.actual), o.target) * 100), 1);
}
export function scorecardProgress(d: ScorecardData) {
  const rows = SCORECARD_PERSPECTIVES.map((p) => {
    const objs = d.perspectives[p.key].filter((o) => o.objective !== "");
    const average = objs.length === 0 ? 0 : round(objs.reduce((s, o) => s + objectiveProgress(o), 0) / objs.length, 1);
    return { key: p.key, label: p.label, count: objs.length, average };
  });
  const withObjs = rows.filter((r) => r.count > 0);
  const overall = withObjs.length === 0 ? 0 : round(withObjs.reduce((s, r) => s + r.average, 0) / withObjs.length, 1);
  return { perspectives: rows, overall };
}

// ---------- RICE ----------
export const RICE_IMPACT = [
  { value: 3, label: "Massive (3)" },
  { value: 2, label: "High (2)" },
  { value: 1, label: "Medium (1)" },
  { value: 0.5, label: "Low (0.5)" },
  { value: 0.25, label: "Minimal (0.25)" },
] as const;
export type RiceItem = { name: string; reach: number; impact: number; confidence: number; effort: number; notes: string };
export type RiceData = { items: RiceItem[] };

/** reach x impact x confidence% / effort. No effort, no score. */
export function riceScore(i: RiceItem): number {
  return round(ratio(i.reach * i.impact * (i.confidence / 100), i.effort), 1);
}
export function riceRanking(d: RiceData) {
  return d.items
    .map((item, index) => ({ item, index, score: riceScore(item) }))
    .filter((r) => r.item.name !== "")
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

// ---------- Nine-box ----------
export type NineBoxItem = { name: string; performance: 1 | 2 | 3; potential: 1 | 2 | 3; notes: string };
export type NineBoxData = { items: NineBoxItem[] };
const NINE_LABELS: Record<string, string> = {
  "3-3": "Star",
  "3-2": "High performer",
  "3-1": "Trusted professional",
  "2-3": "Future leader",
  "2-2": "Core player",
  "2-1": "Solid contributor",
  "1-3": "Rough diamond",
  "1-2": "Inconsistent",
  "1-1": "Needs action",
};
export function nineBoxLabel(performance: number, potential: number): string {
  return NINE_LABELS[`${performance}-${potential}`] ?? "Unplaced";
}
export function nineBoxCells(d: NineBoxData) {
  const cells: { performance: 1 | 2 | 3; potential: 1 | 2 | 3; label: string; names: string[] }[] = [];
  for (const potential of [3, 2, 1] as const) {
    for (const performance of [1, 2, 3] as const) {
      cells.push({
        performance,
        potential,
        label: nineBoxLabel(performance, potential),
        names: d.items.filter((i) => i.name !== "" && i.performance === performance && i.potential === potential).map((i) => i.name),
      });
    }
  }
  return cells;
}

// ---------- Sean Ellis ----------
export const FIT_THRESHOLD = 40;
export type SeanEllisData = { very: number; somewhat: number; not: number; na: number; notes: string };
export function seanEllisSummary(d: SeanEllisData) {
  const total = d.very + d.somewhat + d.not + d.na;
  const veryPct = round(ratio(d.very, total) * 100, 1);
  const verdict = total === 0 ? "No responses yet" : veryPct >= FIT_THRESHOLD ? "Product-market fit signal" : "Below the 40% line";
  return { total, veryPct, verdict, fit: total > 0 && veryPct >= FIT_THRESHOLD };
}

// ---------- empty documents and cleaning ----------
export type WorksheetData = PorterData | HorizonsData | ScorecardData | RiceData | NineBoxData | SeanEllisData;

export function emptyData(kind: WorksheetKind): WorksheetData {
  switch (kind) {
    case "porter":
      return { forces: Object.fromEntries(PORTER_FORCES.map((f) => [f.key, { rating: 0, notes: "" }])) as PorterData["forces"] };
    case "three_horizons":
      return { items: [] };
    case "balanced_scorecard":
      return { perspectives: Object.fromEntries(SCORECARD_PERSPECTIVES.map((p) => [p.key, []])) as unknown as ScorecardData["perspectives"] };
    case "rice":
      return { items: [] };
    case "nine_box":
      return { items: [] };
    case "sean_ellis":
      return { very: 0, somewhat: 0, not: 0, na: 0, notes: "" };
  }
}

const pick3 = (v: unknown, fallback: 1 | 2 | 3): 1 | 2 | 3 => {
  const n = Math.round(num(v, 1, 3, fallback));
  return (n === 1 || n === 2 || n === 3 ? n : fallback) as 1 | 2 | 3;
};

/** Turn whatever is stored or submitted into a clean document of that kind. */
export function cleanData(kind: WorksheetKind, raw: unknown): WorksheetData {
  const r = isObj(raw) ? raw : {};
  switch (kind) {
    case "porter": {
      const src = isObj(r.forces) ? r.forces : {};
      return {
        forces: Object.fromEntries(
          PORTER_FORCES.map((f) => {
            const x = isObj(src[f.key]) ? (src[f.key] as Record<string, unknown>) : {};
            return [f.key, { rating: Math.round(num(x.rating, 0, 5)), notes: text(x.notes, NOTE_MAX) }];
          })
        ) as PorterData["forces"],
      };
    }
    case "three_horizons":
      return {
        items: asArr(r.items).slice(0, MAX_ROWS).filter(isObj).map((x) => ({
          name: text(x.name, NAME_MAX),
          horizon: pick3(x.horizon, 1),
          share: num(x.share, 0, 100),
          notes: text(x.notes, NOTE_MAX),
        })),
      };
    case "balanced_scorecard": {
      const src = isObj(r.perspectives) ? r.perspectives : {};
      return {
        perspectives: Object.fromEntries(
          SCORECARD_PERSPECTIVES.map((p) => [
            p.key,
            asArr(src[p.key]).slice(0, MAX_ROWS).filter(isObj).map((x) => ({
              objective: text(x.objective, NAME_MAX),
              measure: text(x.measure, NAME_MAX),
              target: num(x.target, 0, 1e12),
              actual: num(x.actual, 0, 1e12),
            })),
          ])
        ) as unknown as ScorecardData["perspectives"],
      };
    }
    case "rice":
      return {
        items: asArr(r.items).slice(0, MAX_ROWS).filter(isObj).map((x) => ({
          name: text(x.name, NAME_MAX),
          reach: num(x.reach, 0, 1e9),
          impact: RICE_IMPACT.some((o) => o.value === Number(x.impact)) ? Number(x.impact) : 1,
          confidence: num(x.confidence, 0, 100, 50),
          effort: num(x.effort, 0, 1e6),
          notes: text(x.notes, NOTE_MAX),
        })),
      };
    case "nine_box":
      return {
        items: asArr(r.items).slice(0, MAX_ROWS).filter(isObj).map((x) => ({
          name: text(x.name, NAME_MAX),
          performance: pick3(x.performance, 2),
          potential: pick3(x.potential, 2),
          notes: text(x.notes, NOTE_MAX),
        })),
      };
    case "sean_ellis":
      return {
        very: Math.round(num(r.very, 0, 1e6)),
        somewhat: Math.round(num(r.somewhat, 0, 1e6)),
        not: Math.round(num(r.not, 0, 1e6)),
        na: Math.round(num(r.na, 0, 1e6)),
        notes: text(r.notes, NOTE_MAX),
      };
  }
}

export type WorksheetDraft = { kind: WorksheetKind; title: string; data: unknown };
/**
 * Fields the database would refuse, found before the round trip. The size limit cannot be
 * reached: cleanData caps rows and text, and the largest document is well under it.
 */
export function validateWorksheet(d: WorksheetDraft): Record<string, string> {
  const e: Record<string, string> = {};
  const title = d.title.trim();
  if (!isKind(d.kind)) e.kind = "Pick a framework.";
  if (title === "") e.title = "Give the worksheet a title.";
  else if (title.length > TITLE_MAX) e.title = `Keep the title to ${TITLE_MAX} characters.`;
  return e;
}

/** A one-line result for the list page. */
export function worksheetHeadline(kind: WorksheetKind, raw: unknown): string {
  const data = cleanData(kind, raw);
  switch (kind) {
    case "porter": {
      const s = porterSummary(data as PorterData);
      return s.average === 0 ? s.verdict : `${s.verdict} (average ${s.average} of 5)`;
    }
    case "three_horizons": {
      const mix = horizonMix(data as HorizonsData);
      return mix.every((m) => m.share === 0) ? "No initiatives yet" : mix.map((m) => `H${m.n} ${m.pct}%`).join(" · ");
    }
    case "balanced_scorecard": {
      const s = scorecardProgress(data as ScorecardData);
      const n = s.perspectives.reduce((t, p) => t + p.count, 0);
      return n === 0 ? "No objectives yet" : `${n} objectives, ${s.overall}% of target`;
    }
    case "rice": {
      const r = riceRanking(data as RiceData);
      return r.length === 0 ? "No ideas yet" : `Top: ${r[0].item.name} (${r[0].score})`;
    }
    case "nine_box": {
      const n = (data as NineBoxData).items.filter((i) => i.name !== "").length;
      return n === 0 ? "Nobody placed yet" : `${n} placed`;
    }
    case "sean_ellis": {
      const s = seanEllisSummary(data as SeanEllisData);
      return s.total === 0 ? s.verdict : `${s.veryPct}% very disappointed of ${s.total}: ${s.verdict}`;
    }
  }
}
