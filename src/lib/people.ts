// People: intern daily logs and weekly reports — pure helpers
// (docs/specs/intern-log-and-reports.md).
//
// MIRRORS supabase/migrations/0018_people_interns.sql. The database is the boundary
// (RLS plus triggers); these helpers decide which buttons to offer and what to show.
// tests/unit/people.test.ts compares the vocabularies with the migration and
// tests/integration/access/people-rules.itest.ts checks every report status change
// against the real triggers.
//
// Monitoring means reviewed output: hours the intern enters and reports a supervisor
// approved. Nothing here tracks screens, location or activity.

import { addDays } from "@/lib/crm";

export const DISCIPLINES = ["chemical_engineering", "marketing", "graphics", "other"] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  chemical_engineering: "Chemical Engineering",
  marketing: "Marketing",
  graphics: "Graphics",
  other: "Other",
};

export const REPORT_STATUSES = ["draft", "submitted", "approved", "returned"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  returned: "Returned",
};

/** An intern can log or change a day this many days back, and never ahead. */
export const LOG_WINDOW_DAYS = 7;
export const SUMMARY_MAX = 1000;
export const MAX_HOURS_PER_DAY = 12;

export const REPORT_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  draft: ["submitted"],
  submitted: ["approved", "returned"],
  approved: [],
  returned: ["submitted"],
};

export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  return (REPORT_TRANSITIONS[from] ?? []).includes(to);
}

// --- Weeks ----------------------------------------------------------------------

/** The Monday (YYYY-MM-DD) of the week containing `isoDate`. */
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7; // Sunday = 0 -> 6
  return addDays(isoDate, -sinceMonday);
}

/** The seven dates of a week, Monday first. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "Mon 10 Nov". */
export function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// --- Logs -----------------------------------------------------------------------

export type LogLike = { work_date: string; hours: number; summary: string };

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

export function weekHours(logs: LogLike[], start: string): number {
  const end = addDays(start, 6);
  const total = logs
    .filter((l) => l.work_date >= start && l.work_date <= end)
    .reduce((sum, l) => sum + finite(Number(l.hours)), 0);
  return Math.round(total * 100) / 100;
}

/** Hours done against the hours the school requires. Percent is capped at 100. */
export function hoursProgress(logs: { hours: number }[], requiredHours: number) {
  const total = Math.round(logs.reduce((sum, l) => sum + finite(Number(l.hours)), 0) * 100) / 100;
  const required = Math.max(0, finite(requiredHours));
  return {
    total,
    required,
    remaining: Math.max(0, Math.round((required - total) * 100) / 100),
    percent: required > 0 ? Math.min(100, Math.round((total / required) * 1000) / 10) : 0,
  };
}

/**
 * May this day be logged or changed? Mirrors the database: a signed-in non-admin
 * works the last 7 days up to today, and not in a week whose report is submitted or
 * approved. A super_admin is exempt from the date window but not from the lock.
 */
export function canEditLog(
  workDate: string,
  today: string,
  reportStatus: ReportStatus | null,
  isAdmin = false,
): { ok: true } | { ok: false; reason: string } {
  if (reportStatus === "submitted" || reportStatus === "approved") {
    return { ok: false, reason: "This week's report is submitted, so its logs are locked." };
  }
  if (!isAdmin) {
    if (workDate > today) return { ok: false, reason: "You cannot log a day that has not happened yet." };
    if (workDate < addDays(today, -LOG_WINDOW_DAYS)) {
      return { ok: false, reason: `Days older than ${LOG_WINDOW_DAYS} days can only be corrected by a super_admin.` };
    }
  }
  return { ok: true };
}

export type LogDraft = { hours: string; summary: string };

/** The same limits as the table's CHECK constraints. */
export function validateLog(draft: LogDraft):
  | { ok: true; hours: number; summary: string }
  | { ok: false; errors: Partial<Record<keyof LogDraft, string>> } {
  const errors: Partial<Record<keyof LogDraft, string>> = {};
  const hours = Number(draft.hours.trim());
  if (draft.hours.trim() === "" || !Number.isFinite(hours)) errors.hours = "Enter the hours worked.";
  else if (hours <= 0 || hours > MAX_HOURS_PER_DAY) errors.hours = `Hours must be above 0 and at most ${MAX_HOURS_PER_DAY}.`;
  else if (Math.round(hours * 100) / 100 !== hours) errors.hours = "Use at most two decimals.";
  const summary = draft.summary.trim();
  if (!summary) errors.summary = "Say what you did.";
  else if (summary.length > SUMMARY_MAX) errors.summary = `Keep it under ${SUMMARY_MAX} characters.`;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, hours, summary };
}

/** A starting text for "accomplishments", one line per logged day. */
export function draftAccomplishments(logs: LogLike[]): string {
  return [...logs]
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
    .map((l) => `${dayLabel(l.work_date)} (${Number(l.hours)} h): ${l.summary.trim()}`)
    .join("\n");
}

// --- Report buttons -----------------------------------------------------------------

export type ReportAction = "edit" | "submit" | "approve" | "return" | "print";
export type ReportViewer = { isOwner: boolean; isSupervisor: boolean; isAdmin: boolean };

export function reportActions(status: ReportStatus, who: ReportViewer): ReportAction[] {
  const out: ReportAction[] = [];
  if (who.isOwner && (status === "draft" || status === "returned")) out.push("edit", "submit");
  // Nobody reviews their own report, even a super_admin.
  if (status === "submitted" && !who.isOwner && (who.isSupervisor || who.isAdmin)) out.push("approve", "return");
  if (status === "approved" || who.isOwner || who.isSupervisor || who.isAdmin) out.push("print");
  return out;
}
