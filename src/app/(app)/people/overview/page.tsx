import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { addDays, manilaDate } from "@/lib/crm";
import {
  DISCIPLINE_LABELS,
  LOG_COLUMNS,
  REPORT_COLUMNS,
  dayLabel,
  hoursProgress,
  internName,
  weekHours,
  weekStart,
  type DailyLogRow,
  type WeeklyReportRow,
} from "@/lib/people";
import { Button } from "@/components/ui/button";
import { requirePeople } from "../access";
import { PeopleTabs, ReportBadge } from "../PeopleShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview — People" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function OverviewPage({ searchParams }: { searchParams: { week?: string } }) {
  const p = await requirePeople();
  if (!p.reviewer) redirect("/people");
  const today = manilaDate();
  const week = weekStart(searchParams.week && ISO.test(searchParams.week) ? searchParams.week : today);

  const [logs, reports] = await Promise.all([
    p.supabase.from("people_daily_logs").select(LOG_COLUMNS).order("work_date"),
    p.supabase.from("people_weekly_reports").select(REPORT_COLUMNS).eq("week_start", week),
  ]);
  const allLogs = (logs.data ?? []) as unknown as DailyLogRow[];
  const weekReports = (reports.data ?? []) as unknown as WeeklyReportRow[];
  const interns = p.profiles.filter((x) => x.is_active && (p.isAdmin || x.supervisor_email?.toLowerCase() === p.email));

  return (
    <div>
      <CalculatorHeader
        icon={Users}
        eyebrow="People"
        title="Overview"
        description="Hours and report status for each intern, one week at a time."
      />
      <PeopleTabs hasOwn={!!p.own} reviewer isAdmin={p.isAdmin} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <Link href={`/people/overview?week=${addDays(week, -7)}`} aria-label="Previous week">← Previous</Link>
        </Button>
        <p className="text-[13px] text-ink">
          Week of <span className="font-semibold">{dayLabel(week)}</span>
        </p>
        <Button asChild size="sm">
          <Link href={`/people/overview?week=${addDays(week, 7)}`} aria-label="Next week">Next →</Link>
        </Button>
        {week !== weekStart(today) && (
          <Button asChild size="sm">
            <Link href="/people/overview">This week</Link>
          </Button>
        )}
      </div>

      {interns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
          No interns to show. {p.isAdmin ? "Add one under Interns." : "Interns you supervise appear here."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
          <table className="w-full min-w-[44rem] text-left text-[13px]" aria-label="Intern overview">
            <thead>
              <tr className="border-b border-line">
                {["Intern", "Area", "This week", "Total hours", "Report"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {interns.map((i) => {
                const mine = allLogs.filter((l) => l.intern_email.toLowerCase() === i.email.toLowerCase());
                const prog = hoursProgress(mine, i.required_hours);
                const rep = weekReports.find((r) => r.intern_email.toLowerCase() === i.email.toLowerCase()) ?? null;
                return (
                  <tr key={i.id} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 text-ink">
                      {internName(i)}
                      {i.school && <span className="block text-[11px] text-ink-soft">{i.school}</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{DISCIPLINE_LABELS[i.discipline]}</td>
                    <td className="px-3 py-2 font-mono">{weekHours(mine, week)} h</td>
                    <td className="px-3 py-2 font-mono">
                      {prog.total}
                      {prog.required > 0 && <span className="text-ink-soft"> / {prog.required}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {rep ? (
                        <Link href={`/people/reports/${rep.id}`} className="hover:underline">
                          <ReportBadge status={rep.status} />
                        </Link>
                      ) : (
                        <ReportBadge status={null} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
