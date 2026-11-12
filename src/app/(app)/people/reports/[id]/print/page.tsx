import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addDays } from "@/lib/crm";
import {
  DISCIPLINE_LABELS,
  LOG_COLUMNS,
  REPORT_COLUMNS,
  REPORT_STATUS_LABELS,
  dayLabel,
  internName,
  type DailyLogRow,
  type WeeklyReportRow,
} from "@/lib/people";
import { PrintButton } from "../../../../sales/SalesShell";
import { requirePeople } from "../../../access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Weekly report — print" };

export default async function ReportPrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const p = await requirePeople();
  const { data } = await p.supabase.from("people_weekly_reports").select(REPORT_COLUMNS).eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const r = data as unknown as WeeklyReportRow;
  const intern = p.profiles.find((x) => x.email.toLowerCase() === r.intern_email.toLowerCase()) ?? null;
  const { data: logs } = await p.supabase
    .from("people_daily_logs")
    .select(LOG_COLUMNS)
    .eq("intern_email", r.intern_email)
    .gte("work_date", r.week_start)
    .lte("work_date", addDays(r.week_start, 6))
    .order("work_date");
  const rows = (logs ?? []) as unknown as DailyLogRow[];

  const sections: [string, string | null][] = [
    ["What I accomplished", r.accomplishments],
    ["What I learned", r.learnings],
    ["What got in the way", r.blockers],
    ["Plan for next week", r.next_week_plan],
  ];

  return (
    <article className="mx-auto max-w-3xl bg-white p-6 text-ink print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="border-b-2 border-ink pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Bughaw Innovations</p>
        <h1 className="font-display text-2xl">Weekly accomplishment report</h1>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-[13px]">
        <p><span className="text-ink-soft">Intern: </span>{intern ? internName(intern) : r.intern_email}</p>
        <p><span className="text-ink-soft">Week: </span>{dayLabel(r.week_start)} – {dayLabel(addDays(r.week_start, 6))}</p>
        {intern?.school && <p><span className="text-ink-soft">School: </span>{intern.school}</p>}
        {intern?.program && <p><span className="text-ink-soft">Program: </span>{intern.program}</p>}
        {intern && <p><span className="text-ink-soft">Area: </span>{DISCIPLINE_LABELS[intern.discipline]}</p>}
        {intern?.supervisor_email && <p><span className="text-ink-soft">Supervisor: </span>{intern.supervisor_email}</p>}
        <p><span className="text-ink-soft">Status: </span>{REPORT_STATUS_LABELS[r.status]}</p>
        <p><span className="text-ink-soft">Total hours: </span>{Number(r.total_hours)}</p>
      </section>

      <table className="mt-5 w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink">
            <th className="py-1.5 pr-2 font-semibold">Day</th>
            <th className="py-1.5 pr-2 font-semibold">Hours</th>
            <th className="py-1.5 font-semibold">What was done</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-b border-line align-top">
              <td className="whitespace-nowrap py-1.5 pr-2">{dayLabel(l.work_date)}</td>
              <td className="py-1.5 pr-2">{Number(l.hours)}</td>
              <td className="whitespace-pre-wrap py-1.5">{l.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sections.map(([title, body]) => (
        <section key={title} className="mt-4">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <p className="mt-1 whitespace-pre-wrap text-[13px]">{body || "—"}</p>
        </section>
      ))}

      <footer className="mt-10 grid grid-cols-2 gap-10 text-[12px]">
        <div className="border-t border-ink pt-1">Intern</div>
        <div className="border-t border-ink pt-1">
          Supervisor
          {r.status === "approved" && r.reviewed_by_email && (
            <span className="block text-ink-soft">
              Approved by {r.reviewed_by_email}
              {r.reviewed_at ? ` on ${new Date(r.reviewed_at).toLocaleDateString("en-PH")}` : ""}
            </span>
          )}
          {r.status !== "approved" && <span className="block text-ink-soft">Not yet approved</span>}
        </div>
      </footer>
    </article>
  );
}
