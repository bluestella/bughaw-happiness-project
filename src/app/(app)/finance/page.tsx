import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { EXPENSE_COLUMNS, addMonths, monthStart, type BudgetRow, type CashRow, type Category, type ExpenseRow } from "@/lib/finance";
import { requireFinance } from "./access";
import { FinanceTabs } from "./FinanceShell";
import { FinanceOverview } from "./FinanceOverview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finance" };

export default async function FinancePage() {
  const { supabase, isAdmin } = await requireFinance();
  const today = manilaDate();
  const month = monthStart(today);
  const [cash, expenses, budgets, categories] = await Promise.all([
    supabase.from("fin_cash_balances").select("id, as_of, amount, note").order("as_of", { ascending: false }).limit(12),
    // Four months back covers the three completed months the burn averages, plus this one.
    supabase.from("fin_expenses").select(EXPENSE_COLUMNS).gte("spent_on", addMonths(month, -4)).order("spent_on", { ascending: false }),
    supabase.from("fin_budgets").select("id, month_start, category_id, amount").eq("month_start", month),
    supabase.from("fin_categories").select("id, name, is_active").order("name"),
  ]);
  return (
    <div>
      <CalculatorHeader
        icon={Wallet}
        eyebrow="Finance"
        title="Cash, spending and runway"
        description="A working view, not the books. Your accountant keeps the books."
      />
      <FinanceTabs />
      <FinanceOverview
        cash={(cash.data ?? []) as unknown as CashRow[]}
        expenses={(expenses.data ?? []) as unknown as ExpenseRow[]}
        budgets={(budgets.data ?? []) as unknown as BudgetRow[]}
        categories={(categories.data ?? []) as unknown as Category[]}
        today={today}
        isAdmin={isAdmin}
      />
    </div>
  );
}
