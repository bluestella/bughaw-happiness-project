import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { EXPENSE_COLUMNS, addMonths, monthEnd, monthLabel, monthStart, type BudgetRow, type Category, type ExpenseRow } from "@/lib/finance";
import { requireFinance } from "../access";
import { FinanceTabs, MonthNav } from "../FinanceShell";
import { BudgetClient } from "./BudgetClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Budget — Finance" };

export default async function BudgetPage(props: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await props.searchParams;
  const { supabase } = await requireFinance();
  const month = monthStart(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.month ?? "") ? (searchParams.month as string) : manilaDate());
  const [budgets, categories, expenses] = await Promise.all([
    supabase.from("fin_budgets").select("id, month_start, category_id, amount").eq("month_start", month),
    supabase.from("fin_categories").select("id, name, is_active").order("name"),
    supabase.from("fin_expenses").select(EXPENSE_COLUMNS).gte("spent_on", month).lte("spent_on", monthEnd(month)),
  ]);
  return (
    <div>
      <CalculatorHeader icon={Wallet} eyebrow="Finance" title="Budget" description="Plan what you expect to spend in each category this month, then compare it with what you spent." />
      <FinanceTabs />
      <MonthNav base="/finance/budget" month={month} prev={addMonths(month, -1)} next={addMonths(month, 1)} label={monthLabel(month)} />
      <BudgetClient
        key={month}
        month={month}
        budgets={(budgets.data ?? []) as unknown as BudgetRow[]}
        categories={(categories.data ?? []) as unknown as Category[]}
        expenses={(expenses.data ?? []) as unknown as ExpenseRow[]}
      />
    </div>
  );
}
