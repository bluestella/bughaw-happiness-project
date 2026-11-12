import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { EXPENSE_COLUMNS, addMonths, monthEnd, monthLabel, monthStart, type Category, type ExpenseRow } from "@/lib/finance";
import { requireFinance } from "../access";
import { FinanceTabs, MonthNav } from "../FinanceShell";
import { ExpensesClient } from "./ExpensesClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Expenses — Finance" };

export default async function ExpensesPage(props: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await props.searchParams;
  const { supabase, isAdmin } = await requireFinance();
  const today = manilaDate();
  const month = monthStart(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.month ?? "") ? (searchParams.month as string) : today);
  const [expenses, categories] = await Promise.all([
    supabase.from("fin_expenses").select(EXPENSE_COLUMNS).gte("spent_on", month).lte("spent_on", monthEnd(month)).order("spent_on", { ascending: false }),
    supabase.from("fin_categories").select("id, name, is_active").order("name"),
  ]);
  return (
    <div>
      <CalculatorHeader icon={Wallet} eyebrow="Finance" title="Expenses" description="Every peso spent, with the receipt number from the paper. Voided entries stay on record." />
      <FinanceTabs />
      <MonthNav base="/finance/expenses" month={month} prev={addMonths(month, -1)} next={addMonths(month, 1)} label={monthLabel(month)} />
      {expenses.error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">Could not load expenses: {expenses.error.message}</p>
      )}
      <ExpensesClient
        expenses={(expenses.data ?? []) as unknown as ExpenseRow[]}
        categories={(categories.data ?? []) as unknown as Category[]}
        today={today}
        month={month}
        isAdmin={isAdmin}
      />
    </div>
  );
}
