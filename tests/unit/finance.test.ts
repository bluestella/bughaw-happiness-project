import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AMOUNT_LIMIT,
  BURN_MONTHS,
  DESCRIPTION_MAX,
  addMonths,
  budgetVsActual,
  expensesToCsv,
  latestCash,
  liveExpenses,
  monthEnd,
  monthLabel,
  monthStart,
  monthTotal,
  monthlyBurn,
  runwayMonths,
  runwayVerdict,
  validateExpense,
  type BudgetRow,
  type Category,
  type ExpenseDraft,
  type ExpenseRow,
} from "@/lib/finance";

const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0020_finance.sql"), "utf8");

describe("limits mirror 0020_finance.sql", () => {
  it("description and amount limits", () => {
    expect(sql).toContain(`char_length(description) <= ${DESCRIPTION_MAX}`);
    expect(sql).toContain(`amount < ${AMOUNT_LIMIT}`);
  });
});

const cat = (id: string, name: string): Category => ({ id, name, is_active: true });
const exp = (over: Partial<ExpenseRow> & { spent_on: string; amount: number }): ExpenseRow => ({
  id: Math.random().toString(36).slice(2),
  category_id: "mat",
  vendor: null,
  description: "x",
  reference: null,
  voided_at: null,
  void_reason: null,
  ...over,
});
const categories = [cat("mkt", "Marketing"), cat("mat", "Materials"), cat("oth", "Other")];

describe("months", () => {
  it("finds the first of the month", () => {
    expect(monthStart("2026-11-23")).toBe("2026-11-01");
    expect(monthStart("2026-01-01")).toBe("2026-01-01");
  });
  it("adds and subtracts months across year ends", () => {
    expect(addMonths("2026-11-01", 1)).toBe("2026-12-01");
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-03-01", -14)).toBe("2025-01-01");
    expect(addMonths("2026-05-01", 0)).toBe("2026-05-01");
  });
  it("labels a month and finds its last day", () => {
    expect(monthLabel("2026-11-01")).toMatch(/Nov.*2026/);
    expect(monthEnd("2026-11-01")).toBe("2026-11-30");
    expect(monthEnd("2028-02-01")).toBe("2028-02-29");
    expect(monthEnd("2026-12-01")).toBe("2026-12-31");
  });
});

describe("expense totals", () => {
  const rows = [
    exp({ spent_on: "2026-10-03", amount: 1000 }),
    exp({ spent_on: "2026-10-30", amount: 250.55 }),
    exp({ spent_on: "2026-11-01", amount: 400 }),
    exp({ spent_on: "2026-10-15", amount: 9999, voided_at: "2026-10-16T00:00:00Z", void_reason: "duplicate" }),
  ];
  it("ignores voided expenses", () => {
    expect(liveExpenses(rows)).toHaveLength(3);
  });
  it("totals one month, to the centavo", () => {
    expect(monthTotal(rows, "2026-10-01")).toBe(1250.55);
    expect(monthTotal(rows, "2026-11-01")).toBe(400);
    expect(monthTotal(rows, "2026-09-01")).toBe(0);
    expect(monthTotal([], "2026-10-01")).toBe(0);
  });
});

describe("budgetVsActual", () => {
  const budgets: BudgetRow[] = [
    { id: "1", month_start: "2026-11-01", category_id: "mat", amount: 50000 },
    { id: "2", month_start: "2026-11-01", category_id: "mkt", amount: 10000 },
    { id: "3", month_start: "2026-10-01", category_id: "oth", amount: 999 },
  ];
  const rows = [
    exp({ spent_on: "2026-11-05", amount: 42000, category_id: "mat" }),
    exp({ spent_on: "2026-11-09", amount: 12500.5, category_id: "mkt" }),
    exp({ spent_on: "2026-11-10", amount: 300, category_id: "oth" }),
    exp({ spent_on: "2026-10-10", amount: 5, category_id: "mat" }),
    exp({ spent_on: "2026-11-11", amount: 7000, category_id: "mat", voided_at: "2026-11-12T00:00:00Z", void_reason: "wrong" }),
  ];
  it("compares planned and actual per category, in name order", () => {
    const r = budgetVsActual(categories, budgets, rows, "2026-11-01");
    expect(r.lines.map((l) => l.name)).toEqual(["Marketing", "Materials", "Other"]);
    const mkt = r.lines[0];
    expect(mkt).toMatchObject({ planned: 10000, actual: 12500.5, variance: -2500.5, percentUsed: 125, over: true });
    const mat = r.lines[1];
    expect(mat).toMatchObject({ planned: 50000, actual: 42000, variance: 8000, percentUsed: 84, over: false });
  });
  it("shows unbudgeted spending with no percentage", () => {
    const other = budgetVsActual(categories, budgets, rows, "2026-11-01").lines[2];
    expect(other).toMatchObject({ planned: 0, actual: 300, percentUsed: null, over: true });
  });
  it("totals the month and leaves out other months and voided expenses", () => {
    const r = budgetVsActual(categories, budgets, rows, "2026-11-01");
    expect(r).toMatchObject({ planned: 60000, actual: 54800.5, variance: 5199.5 });
  });
  it("skips categories with neither a budget nor spending, and handles an empty month", () => {
    expect(budgetVsActual(categories, [], [], "2026-11-01")).toEqual({ lines: [], planned: 0, actual: 0, variance: 0 });
    expect(budgetVsActual(categories, budgets, rows, "2026-10-01").lines.map((l) => l.name)).toEqual(["Materials", "Other"]);
  });
});

describe("monthlyBurn", () => {
  const today = "2026-11-12";
  it("is null with no expenses, or only this month's", () => {
    expect(monthlyBurn([], today)).toBeNull();
    expect(monthlyBurn([exp({ spent_on: "2026-11-02", amount: 500 })], today)).toBeNull();
  });
  it("averages the last three complete months and leaves out this one", () => {
    const rows = [
      exp({ spent_on: "2026-08-10", amount: 90000 }),
      exp({ spent_on: "2026-09-10", amount: 120000 }),
      exp({ spent_on: "2026-10-10", amount: 150000 }),
      exp({ spent_on: "2026-11-02", amount: 5 }),
      exp({ spent_on: "2026-07-10", amount: 1_000_000 }), // older than three months
    ];
    expect(monthlyBurn(rows, today)).toEqual({ burn: 120000, monthsUsed: BURN_MONTHS });
  });
  it("does not count months before the first expense as zero", () => {
    const rows = [exp({ spent_on: "2026-10-05", amount: 60000 })];
    expect(monthlyBurn(rows, today)).toEqual({ burn: 60000, monthsUsed: 1 });
  });
  it("counts a quiet month in the middle as zero", () => {
    const rows = [exp({ spent_on: "2026-08-05", amount: 90000 }), exp({ spent_on: "2026-10-05", amount: 30000 })];
    expect(monthlyBurn(rows, today)).toEqual({ burn: 40000, monthsUsed: 3 });
  });
  it("ignores voided expenses and crosses a year end", () => {
    const rows = [
      exp({ spent_on: "2026-12-10", amount: 100 }),
      exp({ spent_on: "2026-11-10", amount: 900, voided_at: "2026-11-11T00:00:00Z", void_reason: "x" }),
      exp({ spent_on: "2026-11-20", amount: 300 }),
    ];
    expect(monthlyBurn(rows, "2027-01-15", 2)).toEqual({ burn: 200, monthsUsed: 2 });
    expect(monthlyBurn([exp({ spent_on: "2026-10-10", amount: 10, voided_at: "2026-10-11T00:00:00Z", void_reason: "x" })], today)).toBeNull();
  });
  it("uses at least one month even if asked for none", () => {
    expect(monthlyBurn([exp({ spent_on: "2026-10-05", amount: 800 })], today, 0)).toEqual({ burn: 800, monthsUsed: 1 });
  });
});

describe("runway", () => {
  it("divides cash by burn, to one decimal", () => {
    expect(runwayMonths(400000, 120000)).toBe(3.3);
    expect(runwayMonths(0, 120000)).toBe(0);
  });
  it("is null without a burn, and never negative or non-finite", () => {
    expect(runwayMonths(400000, null)).toBeNull();
    expect(runwayMonths(400000, 0)).toBeNull();
    expect(runwayMonths(-5, 100)).toBe(0);
    expect(runwayMonths(Number.NaN, 100)).toBe(0);
  });
  it("reads the number in plain language", () => {
    expect(runwayVerdict(null).ok).toBe(true);
    expect(runwayVerdict(3).ok).toBe(false);
    expect(runwayVerdict(3).text).toMatch(/Under 6 months/);
    expect(runwayVerdict(8).ok).toBe(false);
    expect(runwayVerdict(8).text).toMatch(/6 to 12/);
    expect(runwayVerdict(12).ok).toBe(true);
  });
});

describe("latestCash", () => {
  it("picks the most recent snapshot", () => {
    const rows = [
      { id: "a", as_of: "2026-10-01", amount: 1, note: null },
      { id: "b", as_of: "2026-11-05", amount: 2, note: null },
      { id: "c", as_of: "2026-09-30", amount: 3, note: null },
    ];
    expect(latestCash(rows)?.id).toBe("b");
    expect(latestCash([])).toBeNull();
  });
});

describe("validateExpense", () => {
  const today = "2026-11-12";
  const good: ExpenseDraft = { spent_on: "2026-11-10", amount: "1,250.505", category_id: "mat", vendor: " Coir Co ", description: "  Husk fibre  ", reference: " OR-001 " };
  it("accepts a valid expense, trimmed and rounded", () => {
    expect(validateExpense(good, today)).toEqual({
      ok: true,
      row: { spent_on: "2026-11-10", amount: 1250.51, category_id: "mat", vendor: "Coir Co", description: "Husk fibre", reference: "OR-001" },
    });
    const bare = validateExpense({ ...good, vendor: "", reference: "" }, today);
    expect(bare.ok && bare.row).toMatchObject({ vendor: null, reference: null });
  });
  const errors = (over: Partial<ExpenseDraft>) => {
    const r = validateExpense({ ...good, ...over }, today);
    return r.ok ? {} : r.errors;
  };
  it("refuses a missing, bad or future date", () => {
    expect(errors({ spent_on: "" }).spent_on).toBeDefined();
    expect(errors({ spent_on: "2026-13-45" }).spent_on).toBeDefined();
    expect(errors({ spent_on: "2026-11-13" }).spent_on).toMatch(/future/);
    expect(errors({ spent_on: today })).toEqual({});
  });
  it("refuses a missing, zero, negative or huge amount", () => {
    expect(errors({ amount: "" }).amount).toBeDefined();
    expect(errors({ amount: "abc" }).amount).toBeDefined();
    expect(errors({ amount: "0" }).amount).toMatch(/above 0/);
    expect(errors({ amount: "-5" }).amount).toBeDefined();
    expect(errors({ amount: "1000000000" }).amount).toMatch(/too large/);
  });
  it("needs a category and a description within the limit", () => {
    expect(errors({ category_id: "" }).category_id).toBeDefined();
    expect(errors({ description: "   " }).description).toBeDefined();
    expect(errors({ description: "x".repeat(DESCRIPTION_MAX + 1) }).description).toBeDefined();
    expect(errors({ description: "x".repeat(DESCRIPTION_MAX) })).toEqual({});
  });
  it("defaults the date check to today", () => {
    expect(validateExpense({ ...good, spent_on: "2000-01-01" }).ok).toBe(true);
  });
});

describe("expensesToCsv", () => {
  it("writes a header, sorted rows, category names, quoting and voided status", () => {
    const rows = [
      exp({ spent_on: "2026-11-09", amount: 100, category_id: "mkt", description: 'Flyers, "large"', vendor: "Print Co" }),
      exp({ spent_on: "2026-11-01", amount: 50.5, category_id: "unknown", description: "Misc", voided_at: "2026-11-02T00:00:00Z", void_reason: "duplicate" }),
    ];
    const lines = expensesToCsv(rows, categories).split("\r\n");
    expect(lines[0]).toBe("date,amount,category,vendor,description,reference,status,void_reason");
    expect(lines[1]).toBe("2026-11-01,50.5,,,Misc,,void,duplicate");
    expect(lines[2]).toBe('2026-11-09,100,Marketing,Print Co,"Flyers, ""large""",,recorded,');
    expect(expensesToCsv([], categories).split("\r\n")).toHaveLength(1);
  });
});
