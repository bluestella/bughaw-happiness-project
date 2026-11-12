"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { addDays } from "@/lib/crm";
import {
  REPORT_COLUMNS,
  dayLabel,
  draftAccomplishments,
  internName,
  reportActions,
  type DailyLogRow,
  type InternRow,
  type ReportViewer,
  type WeeklyReportRow,
} from "@/lib/people";
import { Field } from "../../../sales/SalesShell";
import { ReportBadge } from "../../PeopleShell";

type Text = { accomplishments: string; learnings: string; blockers: string; next_week_plan: string };
const textOf = (r: WeeklyReportRow): Text => ({
  accomplishments: r.accomplishments ?? "",
  learnings: r.learnings ?? "",
  blockers: r.blockers ?? "",
  next_week_plan: r.next_week_plan ?? "",
});
const blank = (v: string) => (v.trim() === "" ? null : v.trim());

const SECTIONS: { key: keyof Text; label: string; hint?: string }[] = [
  { key: "accomplishments", label: "What I accomplished", hint: "Your daily entries can start this for you." },
  { key: "learnings", label: "What I learned" },
  { key: "blockers", label: "What got in the way" },
  { key: "next_week_plan", label: "Plan for next week" },
];

export function ReportView({
  initialReport,
  intern,
  logs,
  viewer,
}: {
  initialReport: WeeklyReportRow;
  intern: InternRow | null;
  logs: DailyLogRow[];
  viewer: ReportViewer;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [report, setReport] = useState(initialReport);
  const [text, setText] = useState<Text>(() => textOf(initialReport));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const actions = reportActions(report.status, viewer);
  const editing = actions.includes("edit");
  const name = intern ? internName(intern) : internName({ full_name: null, email: report.intern_email });

  async function reload() {
    const { data } = await supabase.from("people_weekly_reports").select(REPORT_COLUMNS).eq("id", report.id).single();
    if (data) setReport(data as unknown as WeeklyReportRow);
  }

  async function saveText(): Promise<boolean> {
    const { error } = await supabase
      .from("people_weekly_reports")
      .update({
        accomplishments: blank(text.accomplishments),
        learnings: blank(text.learnings),
        blockers: blank(text.blockers),
        next_week_plan: blank(text.next_week_plan),
      })
      .eq("id", report.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  }

  async function run(done: string, fn: () => Promise<boolean>) {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (!ok) return;
    await reload();
    toast.success(done);
  }

  const save = () => run("Report saved.", saveText);

  const submit = () =>
    run("Report submitted.", async () => {
      if (!(await saveText())) return false;
      const { error } = await supabase.from("people_weekly_reports").update({ status: "submitted" }).eq("id", report.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      return true;
    });

  const review = (status: "approved" | "returned") =>
    run(status === "approved" ? "Report approved." : "Report returned.", async () => {
      if (status === "returned" && !comment.trim()) {
        toast.error("Say what needs to change before returning the report.");
        return false;
      }
      const { error } = await supabase
        .from("people_weekly_reports")
        .update({ status, review_comment: blank(comment) })
        .eq("id", report.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      setComment("");
      return true;
    });

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="font-display text-2xl text-ink">{name}</h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            Week of {dayLabel(report.week_start)} – {dayLabel(addDays(report.week_start, 6))} ·{" "}
            <span className="font-mono">{Number(report.total_hours)} h</span> · <ReportBadge status={report.status} />
          </p>
        </div>
        {actions.includes("print") && (
          <Button asChild size="sm">
            <Link href={`/people/reports/${report.id}/print`} target="_blank">
              <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Print view
            </Link>
          </Button>
        )}
      </header>

      {report.status === "returned" && report.review_comment && (
        <p role="status" className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-[13px] text-danger">
          Returned: {report.review_comment}
        </p>
      )}
      {report.status === "approved" && (
        <p className="mb-4 rounded-lg border border-line bg-white px-4 py-3 text-[13px] text-ink">
          Approved by {report.reviewed_by_email}
          {report.reviewed_at ? ` on ${new Date(report.reviewed_at).toLocaleDateString("en-PH")}` : ""}.
          {report.review_comment ? ` “${report.review_comment}”` : ""}
        </p>
      )}

      <section aria-label="Daily log" className="mb-6 rounded-xl border border-line bg-white p-4 shadow-card">
        <h3 className="mb-2 text-sm font-semibold text-ink">Daily log</h3>
        {logs.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No days were logged this week.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-1.5 pr-3 font-mono text-[10px] uppercase tracking-wide text-ink-soft">Day</th>
                <th scope="col" className="py-1.5 pr-3 font-mono text-[10px] uppercase tracking-wide text-ink-soft">Hours</th>
                <th scope="col" className="py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft">What was done</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-line/60 align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3">{dayLabel(l.work_date)}</td>
                  <td className="py-1.5 pr-3 font-mono">{Number(l.hours)}</td>
                  <td className="whitespace-pre-wrap py-1.5">{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Report" className="mb-6 space-y-4 rounded-xl border border-line bg-white p-4 shadow-card">
        {SECTIONS.map((s) => (
          <div key={s.key}>
            {editing ? (
              <Field label={s.label} hint={s.hint}>
                <Textarea rows={4} value={text[s.key]} onChange={(e) => setText((t) => ({ ...t, [s.key]: e.target.value }))} />
              </Field>
            ) : (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">{s.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{report[s.key] || "—"}</p>
              </div>
            )}
            {editing && s.key === "accomplishments" && logs.length > 0 && (
              <Button
                className="mt-2"
                size="sm"
                onClick={() => setText((t) => ({ ...t, accomplishments: draftAccomplishments(logs) }))}
              >
                Fill from my daily log
              </Button>
            )}
          </div>
        ))}
        {editing && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={save}>
              Save draft
            </Button>
            <Button intent="primary" size="sm" disabled={busy} onClick={submit}>
              Submit for review
            </Button>
          </div>
        )}
      </section>

      {actions.includes("approve") && (
        <section aria-label="Review" className="rounded-xl border border-line bg-white p-4 shadow-card">
          <h3 className="mb-2 text-sm font-semibold text-ink">Review</h3>
          <Field label="Comment (required to return the report)">
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button intent="primary" size="sm" disabled={busy} onClick={() => review("approved")}>
              Approve
            </Button>
            <Button size="sm" disabled={busy} onClick={() => review("returned")}>
              Return to intern
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
