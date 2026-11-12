import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { manilaDate } from "@/lib/crm";
import { LOG_COLUMNS, weekStart, type DailyLogRow, type ReportStatus } from "@/lib/people";
import { requirePeople } from "../access";
import { PeopleTabs } from "../PeopleShell";
import { MyLog } from "./MyLog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My log — People" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function MyLogPage({ searchParams }: { searchParams: { week?: string } }) {
  const p = await requirePeople();
  if (!p.own) redirect("/people");
  const today = manilaDate();
  const week = weekStart(searchParams.week && ISO.test(searchParams.week) ? searchParams.week : today);

  const [logs, report] = await Promise.all([
    p.supabase.from("people_daily_logs").select(LOG_COLUMNS).eq("intern_email", p.own.email).order("work_date"),
    p.supabase.from("people_weekly_reports").select("id, status").eq("intern_email", p.own.email).eq("week_start", week).maybeSingle(),
  ]);

  return (
    <div>
      <CalculatorHeader
        icon={Users}
        eyebrow="People"
        title="My log"
        description="Record what you did each day. Your supervisor sees your hours and your weekly report, nothing else."
      />
      <PeopleTabs hasOwn reviewer={p.reviewer} isAdmin={p.isAdmin} />
      {logs.error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load your log: {logs.error.message}
        </p>
      )}
      <MyLog
        profile={p.own}
        logs={(logs.data ?? []) as unknown as DailyLogRow[]}
        week={week}
        today={today}
        report={(report.data as { id: string; status: ReportStatus } | null) ?? null}
      />
    </div>
  );
}
