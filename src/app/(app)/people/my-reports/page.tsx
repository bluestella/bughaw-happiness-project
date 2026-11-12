import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { LOG_COLUMNS, REPORT_COLUMNS, weekStart, type DailyLogRow, type WeeklyReportRow } from "@/lib/people";
import { requirePeople } from "../access";
import { PeopleTabs } from "../PeopleShell";
import { MyReports } from "./MyReports";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My reports — People" };

export default async function MyReportsPage(props: { searchParams: Promise<{ week?: string }> }) {
  const searchParams = await props.searchParams;
  const p = await requirePeople();
  if (!p.own) redirect("/people");
  const [reports, logs] = await Promise.all([
    p.supabase.from("people_weekly_reports").select(REPORT_COLUMNS).eq("intern_email", p.own.email).order("week_start", { ascending: false }),
    p.supabase.from("people_daily_logs").select(LOG_COLUMNS).eq("intern_email", p.own.email),
  ]);
  const today = manilaDate();
  return (
    <div>
      <CalculatorHeader
        icon={Users}
        eyebrow="People"
        title="My reports"
        description="One report per week, built from your daily log. Your supervisor approves it; you can print it for your school."
      />
      <PeopleTabs hasOwn reviewer={p.reviewer} isAdmin={p.isAdmin} />
      <MyReports
        reports={(reports.data ?? []) as unknown as WeeklyReportRow[]}
        logs={(logs.data ?? []) as unknown as DailyLogRow[]}
        currentWeek={weekStart(today)}
        preselect={searchParams.week ?? null}
      />
    </div>
  );
}
