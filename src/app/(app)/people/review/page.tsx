import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { REPORT_COLUMNS, dayLabel, internName, type WeeklyReportRow } from "@/lib/people";
import { requirePeople } from "../access";
import { PeopleTabs, ReportBadge } from "../PeopleShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review — People" };

export default async function ReviewPage() {
  const p = await requirePeople();
  if (!p.reviewer) redirect("/people");
  const { data, error } = await p.supabase
    .from("people_weekly_reports")
    .select(REPORT_COLUMNS)
    .neq("status", "draft")
    .order("week_start", { ascending: false })
    .limit(200);
  // Nobody reviews their own report, so it is not in the queue.
  const reports = ((data ?? []) as unknown as WeeklyReportRow[]).filter((r) => r.intern_email.toLowerCase() !== p.email);
  const name = (email: string) => {
    const prof = p.profiles.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return prof ? internName(prof) : email;
  };
  const waiting = reports.filter((r) => r.status === "submitted");
  const rest = reports.filter((r) => r.status !== "submitted");

  const List = ({ title, items }: { title: string; items: WeeklyReportRow[] }) => (
    <section aria-label={title} className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-ink">
        {title} <span className="font-mono text-[11px] font-normal text-ink-soft">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-[13px] text-ink-soft">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-xl border border-line bg-white shadow-card">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/people/reports/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-[13px] hover:bg-paper">
                <span className="font-medium text-ink">{name(r.intern_email)}</span>
                <span className="text-ink-soft">Week of {dayLabel(r.week_start)}</span>
                <span className="font-mono text-[12px] text-ink-soft">{Number(r.total_hours)} h</span>
                <ReportBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div>
      <CalculatorHeader
        icon={Users}
        eyebrow="People"
        title="Review"
        description="Weekly reports from the interns you supervise. Approve, or return with a comment."
      />
      <PeopleTabs hasOwn={!!p.own} reviewer isAdmin={p.isAdmin} />
      {error && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Could not load reports: {error.message}
        </p>
      )}
      <List title="Waiting for review" items={waiting} />
      <List title="Reviewed" items={rest} />
    </div>
  );
}
