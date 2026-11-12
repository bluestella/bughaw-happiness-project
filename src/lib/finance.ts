// Finance: expenses, cash position and budget — pure helpers.
//
// MIRRORS supabase/migrations/0020_finance.sql. The database is the boundary (RLS plus
// triggers); these helpers compute what the screens show. This is NOT bookkeeping: there is
// no ledger and no tax treatment (the accountant keeps the books). Money is PHP.

import { addDays, csvEscape, manilaDate } from "@/lib/crm";

export const DESCRIPTION_MAX = 500;
export const AMOUNT_LIMIT = 1_000_000_000;
/** The months of history the burn rate averages. */
export const BURN_MONTHS = 3;

export type Category = { id: string; name: string; is_active: boolean };
export type ExpenseRow = {
  id: string;
  spent_on: string;
  amount: number;
  category_id: string;
  vendor: string | null;
  description: string;
  reference: string | null;
  voided_at: string | null;
  void_reason: string | null;
};
export type CashRow = { id: string; as_of: string; amount: number; note: string | null };
export type BudgetRow = { id: string; month_start: string; category_id: string; amount: number };

export const EXPENSE_COLUMNS = "id, spent_on, amount, category_id, vendor, description, reference, voided_at, void_reason";

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
const cents = (v: number): number => Math.round((finite(v) + Number.EPSILON) * 100) / 100;

// --- Months -----------------------------------------------------------------------

/** First day (YYYY-MM-DD) of the month containing `iso`. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** `n` months after (or before, if negative) a month start. */
export function addMonths(monthStartIso: string, n: number): string {
  const [y, m] = monthStartIso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** "Nov 2026". */
export function monthLabel(monthStartIso: string): string {
  return new Date(`${monthStartIso}T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// --- Expenses ---------------------------------------------------------------------

/** Voided expenses never count. */
export const liveExpenses = (rows: ExpenseRow[]): ExpenseRow[] => rows.filter((r) => !r.voided_at);

export function monthTotal(rows: ExpenseRow[], month: string): number {
  return cents(
    liveExpenses(rows)
      .filter((r) => monthStart(r.spent_on) === month)
      .reduce((sum, r) => sum + finite(Number(r.amount)), 0),
  );
}

export type BudgetLine = {
  category_id: string;
  name: string;
  planned: number;
  actual: number;
  /** planned − actual. Negative means over budget. */
  variance: number;
  /** actual ÷ planned × 100; null when nothing was planned. */
  percentUsed: number | null;
  over: boolean;
};

/**
 * Planned against actual for one month, one line per category that has a budget or any
 * spending, in name order, plus the totals.
 */
export function budgetVsActual(
  categories: Category[],
  budgets: BudgetRow[],
  expenses: ExpenseRow[],
  month: string,
): { lines: BudgetLine[]; planned: number; actual: number; variance: number } {
  const live = liveExpenses(expenses).filter((r) => monthStart(r.spent_on) === month);
  const lines: BudgetLine[] = [];
  for (const c of categories) {
    const planned = cents(
      budgets
        .filter((b) => b.category_id === c.id && b.month_start === month)
        .reduce((sum, b) => sum + finite(Number(b.amount)), 0),
    );
    const actual = cents(live.filter((r) => r.category_id === c.id).reduce((sum, r) => sum + finite(Number(r.amount)), 0));
    if (planned === 0 && actual === 0) continue;
    lines.push({
      category_id: c.id,
      name: c.name,
      planned,
      actual,
      variance: cents(planned - actual),
      percentUsed: planned > 0 ? Math.round((actual / planned) * 1000) / 10 : null,
      over: actual > planned,
    });
  }
  lines.sort((a, b) => a.name.localeCompare(b.name));
  const planned = cents(lines.reduce((s, l) => s + l.planned, 0));
  const actual = cents(lines.reduce((s, l) => s + l.actual, 0));
  return { lines, planned, actual, variance: cents(planned - actual) };
}

/**
 * Average monthly spending over up to the last BURN_MONTHS COMPLETE months (the current,
 * unfinished month is left out so it cannot make the burn look small). Months before the
 * first expense are not counted as zero. Returns null when there is no completed month
 * with an expense in it yet.
 */
export function monthlyBurn(
  expenses: ExpenseRow[],
  today: string = manilaDate(),
  months: number = BURN_MONTHS,
): { burn: number; monthsUsed: number } | null {
  const live = liveExpenses(expenses);
  if (live.length === 0) return null;
  const current = monthStart(today);
  const firstMonth = live.map((r) => monthStart(r.spent_on)).sort()[0];
  const wanted = Array.from({ length: Math.max(1, months) }, (_, i) => addMonths(current, -(i + 1))).filter(
    (m) => m >= firstMonth,
  );
  if (wanted.length === 0) return null;
  const total = wanted.reduce((sum, m) => sum + monthTotal(live, m), 0);
  return { burn: cents(total / wanted.length), monthsUsed: wanted.length };
}

/** Months the cash lasts at this burn; null when there is no burn to divide by. */
export function runwayMonths(cash: number, burn: number | null): number | null {
  if (burn === null || !(burn > 0)) return null;
  return Math.round((Math.max(0, finite(cash)) / burn) * 10) / 10;
}

/** The most recent snapshot, or null. */
export function latestCash(rows: CashRow[]): CashRow | null {
  return [...rows].sort((a, b) => b.as_of.localeCompare(a.as_of))[0] ?? null;
}

/** Plain-language read on runway, using the same 6 / 12 month lines as the Runway calculator. */
export function runwayVerdict(months: number | null): { ok: boolean; text: string } {
  if (months === null) return { ok: true, text: "Not enough spending history yet to estimate runway." };
  if (months < 6) return { ok: false, text: "Under 6 months of cash at this spending. Start fundraising or cut spending now." };
  if (months < 12) return { ok: false, text: "6 to 12 months of cash. Fundraising takes 3 to 6 months, so begin soon." };
  return { ok: true, text: "12 or more months of cash at this spending." };
}

// --- Validation ---------------------------------------------------------------------

export type ExpenseDraft = { spent_on: string; amount: string; category_id: string; vendor: string; description: string; reference: string };

/** The same limits as the table's CHECK constraints and trigger. */
export function validateExpense(
  d: ExpenseDraft,
  today: string = manilaDate(),
):
  | { ok: true; row: { spent_on: string; amount: number; category_id: string; vendor: string | null; description: string; reference: string | null } }
  | { ok: false; errors: Partial<Record<keyof ExpenseDraft, string>> } {
  const errors: Partial<Record<keyof ExpenseDraft, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.spent_on) || Number.isNaN(Date.parse(`${d.spent_on}T00:00:00Z`))) errors.spent_on = "Enter the date.";
  else if (d.spent_on > today) errors.spent_on = "An expense cannot be dated in the future.";
  const amount = Number(d.amount.trim().replace(/,/g, ""));
  if (d.amount.trim() === "" || !Number.isFinite(amount)) errors.amount = "Enter the amount.";
  else if (amount <= 0) errors.amount = "The amount must be above 0.";
  else if (amount >= AMOUNT_LIMIT) errors.amount = "That amount is too large.";
  if (!d.category_id) errors.category_id = "Choose a category.";
  const description = d.description.trim();
  if (!description) errors.description = "Say what it was for.";
  else if (description.length > DESCRIPTION_MAX) errors.description = `Keep it under ${DESCRIPTION_MAX} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    row: {
      spent_on: d.spent_on,
      amount: cents(amount),
      category_id: d.category_id,
      vendor: d.vendor.trim() || null,
      description,
      reference: d.reference.trim() || null,
    },
  };
}

// --- Export -------------------------------------------------------------------------

/** CSV of expenses for the accountant. Voided ones are included and marked. */
export function expensesToCsv(rows: ExpenseRow[], categories: Category[]): string {
  const name = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const lines = ["date,amount,category,vendor,description,reference,status,void_reason"];
  for (const r of [...rows].sort((a, b) => a.spent_on.localeCompare(b.spent_on))) {
    lines.push(
      [r.spent_on, r.amount, name[r.category_id] ?? "", r.vendor, r.description, r.reference, r.voided_at ? "void" : "recorded", r.void_reason]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/** The last day of a month start, for date-range queries. */
export const monthEnd = (month: string): string => addDays(addMonths(month, 1), -1);
