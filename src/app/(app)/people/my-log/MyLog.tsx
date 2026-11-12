"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { addDays } from "@/lib/crm";
import {
  DISCIPLINE_LABELS,
  SUMMARY_MAX,
  canEditLog,
  dayLabel,
  hoursProgress,
  validateLog,
  weekDays,
  weekHours,
  weekStart,
  type DailyLogRow,
  type InternRow,
  type ReportStatus,
} from "@/lib/people";
import { ReportBadge } from "../PeopleShell";

function DayRow({
  day,
  today,
  log,
  reportStatus,
  internEmail,
}: {
  day: string;
  today: string;
  log: DailyLogRow | undefined;
  reportStatus: ReportStatus | null;
  internEmail: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [hours, setHours] = useState(log ? String(log.hours) : "");
  const [summary, setSummary] = useState(log?.summary ?? "");
  const [errors, setErrors] = useState<{ hours?: string; summary?: string }>({});
  const [busy, setBusy] = useState(false);
  const can = canEditLog(day, today, reportStatus);
  const dirty = (log ? String(log.hours) : "") !== hours || (log?.summary ?? "") !== summary;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = validateLog({ hours, summary });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    const { error } = log
      ? await supabase.from("people_daily_logs").update({ hours: v.hours, summary: v.summary }).eq("id", log.id)
      : await supabase.from("people_daily_logs").insert({ intern_email: internEmail, work_date: day, hours: v.hours, summary: v.summary });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(log ? "Day updated." : "Day logged.");
    router.refresh();
  }

  async function remove() {
    if (!log) return;
    setBusy(true);
    const { error } = await supabase.from("people_daily_logs").delete().eq("id", log.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setHours("");
    setSummary("");
    toast.success("Day removed.");
    router.refresh();
  }

  return (
    <li className="rounded-xl border border-line bg-white p-3 shadow-card">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">
          {dayLabel(day)}
          {day === today && <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-coir">Today</span>}
        </p>
        {log && <span className="font-mono text-[12px] text-ink-soft">{log.hours} h</span>}
      </div>
      {can.ok ? (
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-[6rem_1fr_auto]" noValidate>
          <label className="block">
            <span className="sr-only">Hours on {dayLabel(day)}</span>
            <Input
              inputMode="decimal"
              placeholder="Hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              aria-label={`Hours on ${dayLabel(day)}`}
              aria-invalid={!!errors.hours}
            />
            {errors.hours && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.hours}</span>}
          </label>
          <label className="block">
            <span className="sr-only">What you did on {dayLabel(day)}</span>
            <Textarea
              rows={2}
              maxLength={SUMMARY_MAX}
              placeholder="What did you do?"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              aria-label={`What you did on ${dayLabel(day)}`}
              aria-invalid={!!errors.summary}
            />
            {errors.summary && <span role="alert" className="mt-1 block text-[11px] text-danger">{errors.summary}</span>}
          </label>
          <div className="flex gap-2 sm:flex-col">
            <Button intent="primary" size="sm" type="submit" disabled={busy || !dirty}>
              {log ? "Save" : "Add"}
            </Button>
            {log && (
              <Button size="sm" disabled={busy} onClick={remove} aria-label={`Remove ${dayLabel(day)}`}>
                Remove
              </Button>
            )}
          </div>
        </form>
      ) : log ? (
        <div>
          <p className="whitespace-pre-wrap text-[13px] text-ink">{log.summary}</p>
          <p className="mt-1 text-[11px] text-ink-soft">{can.reason}</p>
        </div>
      ) : (
        <p className="text-[12px] text-ink-soft">{day > today ? "Not yet." : can.reason}</p>
      )}
    </li>
  );
}

export function MyLog({
  profile,
  logs,
  week,
  today,
  report,
}: {
  profile: InternRow;
  logs: DailyLogRow[];
  week: string;
  today: string;
  report: { id: string; status: ReportStatus } | null;
}) {
  const progress = hoursProgress(logs, profile.required_hours);
  const thisWeek = weekHours(logs, week);
  const days = weekDays(week);
  const currentWeek = weekStart(today);

  return (
    <div>
      <section aria-label="Progress" className="mb-5 rounded-xl border border-line bg-white p-4 shadow-card">
        <p className="text-[12px] text-ink-soft">
          {DISCIPLINE_LABELS[profile.discipline]}
          {profile.school ? ` · ${profile.school}` : ""}
        </p>
        <p className="mt-1 text-[15px] font-semibold text-ink">
          {progress.total} of {progress.required} required hours
          {progress.required > 0 && <span className="ml-2 font-mono text-[12px] font-normal text-ink-soft">{progress.percent}%</span>}
        </p>
        {progress.required > 0 && (
          <div
            role="progressbar"
            aria-label="Required hours completed"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-2 overflow-hidden rounded-full bg-paper"
          >
            <div className="h-full bg-coir" style={{ width: `${progress.percent}%` }} />
          </div>
        )}
        {progress.required > 0 && <p className="mt-2 text-[12px] text-ink-soft">{progress.remaining} hours to go.</p>}
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href={`/people/my-log?week=${addDays(week, -7)}`} aria-label="Previous week">← Previous</Link>
          </Button>
          <p className="text-[13px] text-ink">
            Week of <span className="font-semibold">{dayLabel(week)}</span>
            <span className="ml-2 font-mono text-[12px] text-ink-soft">{thisWeek} h</span>
          </p>
          <Button asChild size="sm">
            <Link href={`/people/my-log?week=${addDays(week, 7)}`} aria-label="Next week">Next →</Link>
          </Button>
          {week !== currentWeek && (
            <Button asChild size="sm">
              <Link href="/people/my-log">This week</Link>
            </Button>
          )}
        </div>
        <p className="flex items-center gap-2 text-[12px] text-ink-soft">
          Report: <ReportBadge status={report?.status ?? null} />
          <Link
            href={report ? `/people/reports/${report.id}` : `/people/my-reports?week=${week}`}
            className="text-coir-dark hover:underline"
          >
            {report ? "Open" : "Start one"} →
          </Link>
        </p>
      </div>

      <ul className="space-y-2" aria-label="Days of the week">
        {days.map((d) => (
          <DayRow
            key={`${d}:${logs.find((l) => l.work_date === d)?.id ?? "new"}:${report?.status ?? "none"}`}
            day={d}
            today={today}
            log={logs.find((l) => l.work_date === d)}
            reportStatus={report?.status ?? null}
            internEmail={profile.email}
          />
        ))}
      </ul>
    </div>
  );
}
