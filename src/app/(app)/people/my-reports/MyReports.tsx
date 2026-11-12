"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { dayLabel, weekHours, weekStart, type DailyLogRow, type WeeklyReportRow } from "@/lib/people";
import { Field } from "../../sales/SalesShell";
import { ReportBadge } from "../PeopleShell";

export function MyReports({
  reports,
  logs,
  currentWeek,
  preselect,
}: {
  reports: WeeklyReportRow[];
  logs: DailyLogRow[];
  currentWeek: string;
  preselect: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const have = useMemo(() => new Set(reports.map((r) => r.week_start)), [reports]);
  // Weeks that have logged days but no report yet, plus the current week.
  const options = useMemo(() => {
    const weeks = new Set(logs.map((l) => weekStart(l.work_date)));
    weeks.add(currentWeek);
    return Array.from(weeks).filter((w) => !have.has(w)).sort().reverse();
  }, [logs, have, currentWeek]);
  const [week, setWeek] = useState(() => (preselect && options.includes(weekStart(preselect)) ? weekStart(preselect) : (options[0] ?? "")));
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!week) return;
    setBusy(true);
    const { data, error } = await supabase.from("people_weekly_reports").insert({ week_start: week }).select("id").single();
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Could not start the report.");
    router.push(`/people/reports/${data.id}`);
  }

  return (
    <div className="space-y-6">
      {options.length > 0 && (
        <form onSubmit={start} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4 shadow-card" aria-label="Start a report">
          <Field label="Start a report for the week of">
            <Select value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">
              {options.map((w) => (
                <option key={w} value={w}>
                  {dayLabel(w)} ({weekHours(logs, w)} h logged)
                </option>
              ))}
            </Select>
          </Field>
          <Button intent="primary" size="sm" type="submit" disabled={busy || !week}>
            Start report
          </Button>
        </form>
      )}

      {reports.length === 0 ? (
        <p className="text-[13px] text-ink-soft">No reports yet.</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-xl border border-line bg-white shadow-card" aria-label="My reports">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/people/reports/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-[13px] hover:bg-paper">
                <span className="font-medium text-ink">Week of {dayLabel(r.week_start)}</span>
                <span className="font-mono text-[12px] text-ink-soft">{Number(r.total_hours)} h</span>
                <ReportBadge status={r.status} />
                {r.status === "returned" && r.review_comment && <span className="text-[12px] text-danger">{r.review_comment}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
