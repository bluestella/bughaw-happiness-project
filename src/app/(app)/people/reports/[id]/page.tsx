import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { addDays } from "@/lib/crm";
import { LOG_COLUMNS, REPORT_COLUMNS, type DailyLogRow, type WeeklyReportRow } from "@/lib/people";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { requirePeople } from "../../access";
import { PeopleTabs } from "../../PeopleShell";
import { ReportView } from "./ReportView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Weekly report — People" };

export default async function ReportPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const p = await requirePeople();
  const { data } = await p.supabase.from("people_weekly_reports").select(REPORT_COLUMNS).eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const report = data as unknown as WeeklyReportRow;
  const intern = p.profiles.find((x) => x.email.toLowerCase() === report.intern_email.toLowerCase()) ?? null;
  const logs = await p.supabase
    .from("people_daily_logs")
    .select(LOG_COLUMNS)
    .eq("intern_email", report.intern_email)
    .gte("work_date", report.week_start)
    .lte("work_date", addDays(report.week_start, 6))
    .order("work_date");

  const isOwner = p.email === report.intern_email.toLowerCase();
  const isSupervisor = (intern?.supervisor_email ?? "").toLowerCase() === p.email;

  return (
    <div>
      <CalculatorHeader icon={Users} eyebrow="People" title="Weekly report" />
      <PeopleTabs hasOwn={!!p.own} reviewer={p.reviewer} isAdmin={p.isAdmin} />
      <ReportView
        initialReport={report}
        intern={intern}
        logs={(logs.data ?? []) as unknown as DailyLogRow[]}
        viewer={{ isOwner, isSupervisor, isAdmin: p.isAdmin }}
      />
    </div>
  );
}
