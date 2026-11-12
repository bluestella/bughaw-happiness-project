import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISCIPLINES,
  DISCIPLINE_LABELS,
  LOG_WINDOW_DAYS,
  MAX_HOURS_PER_DAY,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  REPORT_TRANSITIONS,
  SUMMARY_MAX,
  canEditLog,
  canTransitionReport,
  dayLabel,
  draftAccomplishments,
  hoursProgress,
  internName,
  reportActions,
  validateLog,
  weekDays,
  weekHours,
  weekStart,
  type ReportStatus,
} from "@/lib/people";

const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0018_people_interns.sql"), "utf8");
const checkList = (column: string): string[] => {
  const m = sql.match(new RegExp(`${column} text[^;]*?check \\(${column} in \\(([^)]*)\\)\\)`, "s"));
  if (!m) throw new Error(`no CHECK list for ${column}`);
  return m[1].split(",").map((v) => v.trim().replace(/'/g, ""));
};

describe("vocabularies and limits mirror 0018_people_interns.sql", () => {
  it("disciplines", () => {
    expect(checkList("discipline")).toEqual([...DISCIPLINES]);
    expect(Object.keys(DISCIPLINE_LABELS).sort()).toEqual([...DISCIPLINES].sort());
  });
  it("report statuses", () => {
    expect(checkList("status")).toEqual([...REPORT_STATUSES]);
    expect(Object.keys(REPORT_STATUS_LABELS).sort()).toEqual([...REPORT_STATUSES].sort());
  });
  it("hour and summary limits", () => {
    expect(sql).toContain(`hours > 0 and hours <= ${MAX_HOURS_PER_DAY}`);
    expect(sql).toContain(`char_length(summary) <= ${SUMMARY_MAX}`);
    expect(sql).toContain(`v_today - ${LOG_WINDOW_DAYS}`);
  });
  it("transitions only name known statuses, and approved is final", () => {
    for (const [from, tos] of Object.entries(REPORT_TRANSITIONS)) {
      expect(REPORT_STATUSES).toContain(from);
      tos.forEach((t) => expect(REPORT_STATUSES).toContain(t));
    }
    expect(REPORT_TRANSITIONS.approved).toEqual([]);
  });
});

describe("canTransitionReport", () => {
  it("allows exactly the documented moves", () => {
    const allowed = REPORT_STATUSES.flatMap((a) => REPORT_STATUSES.map((b) => [a, b] as const)).filter(([a, b]) =>
      canTransitionReport(a, b),
    );
    expect(allowed).toEqual([
      ["draft", "submitted"],
      ["submitted", "approved"],
      ["submitted", "returned"],
      ["returned", "submitted"],
    ]);
  });
});

describe("canTransitionReport with an unknown status", () => {
  it("refuses instead of throwing", () => {
    expect(canTransitionReport("nope" as ReportStatus, "submitted")).toBe(false);
  });
});

describe("weeks", () => {
  it("finds the Monday of any day", () => {
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekStart("2026-11-12")).toBe("2026-11-09"); // Thursday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday belongs to the week before it
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // across the year end
  });
  it("lists seven days from Monday", () => {
    expect(weekDays("2026-11-09")).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
  });
  it("labels a day", () => {
    expect(dayLabel("2026-11-09")).toMatch(/Mon/);
    expect(dayLabel("2026-11-09")).toMatch(/9/);
  });
});

describe("hours", () => {
  const logs = [
    { work_date: "2026-11-09", hours: 4, summary: "a" },
    { work_date: "2026-11-10", hours: 7.5, summary: "b" },
    { work_date: "2026-11-16", hours: 8, summary: "next week" },
    { work_date: "2026-11-08", hours: 3, summary: "week before" },
  ];
  it("adds only that week's days", () => {
    expect(weekHours(logs, "2026-11-09")).toBe(11.5);
    expect(weekHours(logs, "2026-11-16")).toBe(8);
    expect(weekHours([], "2026-11-09")).toBe(0);
    expect(weekHours([{ work_date: "2026-11-09", hours: Number.NaN, summary: "x" }], "2026-11-09")).toBe(0);
  });
  it("shows progress against the required hours", () => {
    expect(hoursProgress([{ hours: 120 }, { hours: 30.5 }], 486)).toEqual({ total: 150.5, required: 486, remaining: 335.5, percent: 31 });
  });
  it("caps at 100% and never reports negative remaining", () => {
    expect(hoursProgress([{ hours: 500 }], 486)).toMatchObject({ remaining: 0, percent: 100 });
  });
  it("returns 0 percent when no hours are required, and ignores bad numbers", () => {
    expect(hoursProgress([{ hours: 10 }], 0)).toMatchObject({ required: 0, remaining: 0, percent: 0 });
    expect(hoursProgress([{ hours: Number.NaN }], Number.NaN)).toEqual({ total: 0, required: 0, remaining: 0, percent: 0 });
    expect(hoursProgress([], 100)).toEqual({ total: 0, required: 100, remaining: 100, percent: 0 });
  });
});

describe("canEditLog", () => {
  const today = "2026-11-12";
  it("allows today and the last 7 days for an intern", () => {
    expect(canEditLog(today, today, null)).toEqual({ ok: true });
    expect(canEditLog("2026-11-05", today, "draft")).toEqual({ ok: true });
    expect(canEditLog("2026-11-10", today, "returned")).toEqual({ ok: true });
  });
  it("refuses tomorrow and day 8", () => {
    const future = canEditLog("2026-11-13", today, null);
    expect(future.ok).toBe(false);
    const old = canEditLog("2026-11-04", today, null);
    expect(old).toMatchObject({ ok: false });
    expect((old as { reason: string }).reason).toMatch(/super_admin/);
  });
  it("locks a submitted or approved week for everyone", () => {
    for (const status of ["submitted", "approved"] as const) {
      expect(canEditLog(today, today, status).ok).toBe(false);
      expect(canEditLog(today, today, status, true).ok).toBe(false);
    }
  });
  it("lets a super_admin ignore the date window", () => {
    expect(canEditLog("2026-01-01", today, null, true)).toEqual({ ok: true });
    expect(canEditLog("2027-01-01", today, "draft", true)).toEqual({ ok: true });
  });
});

describe("validateLog", () => {
  it("accepts a valid day", () => {
    expect(validateLog({ hours: "4.5", summary: "  Tested sample B  " })).toEqual({ ok: true, hours: 4.5, summary: "Tested sample B" });
    expect(validateLog({ hours: "12", summary: "x" }).ok).toBe(true);
  });
  const errors = (hours: string, summary: string) => {
    const r = validateLog({ hours, summary });
    return r.ok ? {} : r.errors;
  };
  it("refuses missing, zero, negative, too many or fractional-cent hours", () => {
    expect(errors("", "x").hours).toBeDefined();
    expect(errors("abc", "x").hours).toBeDefined();
    expect(errors("0", "x").hours).toMatch(/above 0/);
    expect(errors("-2", "x").hours).toBeDefined();
    expect(errors("12.5", "x").hours).toBeDefined();
    expect(errors("1.234", "x").hours).toMatch(/two decimals/);
  });
  it("refuses a blank or oversized summary", () => {
    expect(errors("4", "   ").summary).toBeDefined();
    expect(errors("4", "x".repeat(SUMMARY_MAX + 1)).summary).toBeDefined();
    expect(errors("4", "x".repeat(SUMMARY_MAX))).toEqual({});
  });
  it("reports both problems at once", () => {
    expect(Object.keys(errors("", ""))).toEqual(["hours", "summary"]);
  });
});

describe("draftAccomplishments", () => {
  it("writes one line per day in date order", () => {
    const text = draftAccomplishments([
      { work_date: "2026-11-11", hours: 6, summary: " Ran the filtration test " },
      { work_date: "2026-11-09", hours: 4.5, summary: "Read the SOP" },
    ]);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/Mon.*\(4\.5 h\): Read the SOP$/);
    expect(lines[1]).toMatch(/Wed.*\(6 h\): Ran the filtration test$/);
  });
  it("is empty for no logs", () => {
    expect(draftAccomplishments([])).toBe("");
  });
});

describe("reportActions", () => {
  const owner = { isOwner: true, isSupervisor: false, isAdmin: false };
  const supervisor = { isOwner: false, isSupervisor: true, isAdmin: false };
  const admin = { isOwner: false, isSupervisor: false, isAdmin: true };
  const stranger = { isOwner: false, isSupervisor: false, isAdmin: false };
  it("lets the intern edit and submit a draft or returned report", () => {
    expect(reportActions("draft", owner)).toEqual(["edit", "submit", "print"]);
    expect(reportActions("returned", owner)).toEqual(["edit", "submit", "print"]);
    expect(reportActions("submitted", owner)).toEqual(["print"]);
  });
  it("lets a supervisor or super_admin review a submitted report", () => {
    expect(reportActions("submitted", supervisor)).toEqual(["approve", "return", "print"]);
    expect(reportActions("submitted", admin)).toEqual(["approve", "return", "print"]);
    expect(reportActions("draft", supervisor)).toEqual(["print"]);
  });
  it("never lets anyone review their own report, even a super_admin", () => {
    expect(reportActions("submitted", { ...owner, isAdmin: true })).toEqual(["print"]);
  });
  it("shows a stranger nothing but an approved report's print view", () => {
    expect(reportActions("draft", stranger)).toEqual([]);
    expect(reportActions("submitted", stranger)).toEqual([]);
    expect(reportActions("approved", stranger)).toEqual(["print"]);
  });
});

describe("internName", () => {
  it("prefers the profile name, then the start of the email", () => {
    expect(internName({ full_name: "Casey Cruz", email: "casey@school.edu.ph" })).toBe("Casey Cruz");
    expect(internName({ full_name: "  Casey Cruz  ", email: "casey@school.edu.ph" })).toBe("Casey Cruz");
    expect(internName({ full_name: null, email: "casey@school.edu.ph" })).toBe("casey");
    expect(internName({ full_name: "   ", email: "casey@school.edu.ph" })).toBe("casey");
  });
});
