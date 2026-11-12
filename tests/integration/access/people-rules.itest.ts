// Database rules from 0018 (docs/specs/intern-log-and-reports.md), attempted through
// the anon key as an intern, their supervisor, an unrelated member and a super_admin.
// Cast: the contractor is the intern; the super_admin or the member is the supervisor,
// switched per test through the profile row.
import { describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { addDays, manilaDate } from "@/lib/crm";
import { REPORT_STATUSES, canTransitionReport, weekStart, type ReportStatus } from "@/lib/people";
import { ACTORS, clientFor, emailOf, type Actor } from "./actors.ts";

const db = adminClient();
const today = manilaDate();
const monday = weekStart(today);
const intern = emailOf("contractor");
const memberEmail = emailOf("member");
const adminEmail = emailOf("super_admin");

type Result<T> = PromiseLike<{ data: T; error: { message: string } | null }>;
async function ok<T>(label: string, p: Result<T>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`${label}: no data returned`);
  return data as NonNullable<T>;
}
async function exec(label: string, p: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}
const client = (a: Actor) => clientFor(a);

let profileId: string | null = null;
/** The contractor as an active marketing intern, supervised by `supervisor`. */
async function setSupervisor(supervisor: string | null) {
  if (!profileId) {
    const row = await ok("profile", db.from("people_interns").insert({
      email: intern, full_name: "Test Intern", discipline: "marketing", school: "Test University",
      required_hours: 100, supervisor_email: supervisor,
    }).select("id").single());
    profileId = row.id as string;
  } else {
    await exec("supervisor", db.from("people_interns").update({ supervisor_email: supervisor, is_active: true }).eq("id", profileId));
  }
}

let weekCounter = 0;
/** A Monday far enough back that no other test in this file logs hours in it. */
const freshWeek = () => addDays(monday, -7 * (20 + weekCounter++)); // older than anything the other tests log

async function adminLog(day: string, hours = 4, summary = "Worked on the campaign") {
  await exec("admin log", (await client("super_admin")).from("people_daily_logs").insert({ intern_email: intern, work_date: day, hours, summary }));
}
async function internReport(week: string): Promise<string> {
  const c = await client("contractor");
  return (await ok("report", c.from("people_weekly_reports").insert({ week_start: week }).select("id").single())).id as string;
}
async function reportRow(id: string) {
  return ok("report row", db.from("people_weekly_reports").select("*").eq("id", id).single()) as Promise<Record<string, unknown>>;
}
async function setReport(id: string, patch: Record<string, unknown>, actor: Actor) {
  return (await client(actor)).from("people_weekly_reports").update(patch).eq("id", id).select("id");
}
async function logRows(email = intern) {
  return ok("logs", db.from("people_daily_logs").select("work_date, hours").eq("intern_email", email).order("work_date"));
}

/** A past week with one logged day and a report in `state`, driven by legal moves. */
async function reportIn(state: ReportStatus): Promise<string> {
  const week = freshWeek();
  await adminLog(week);
  const id = await internReport(week);
  if (state === "draft") return id;
  await exec("submit", (await setReport(id, { status: "submitted" }, "contractor")).error ? Promise.resolve({ error: { message: "submit refused" } }) : Promise.resolve({ error: null }));
  if (state === "submitted") return id;
  if (state === "approved") {
    await exec("approve", Promise.resolve({ error: (await setReport(id, { status: "approved" }, "super_admin")).error }));
  } else {
    await exec("return", Promise.resolve({ error: (await setReport(id, { status: "returned", review_comment: "Add numbers" }, "super_admin")).error }));
  }
  return id;
}

describe("profiles", () => {
  it("an intern reads only their own; a stranger reads none; a super_admin reads all", async () => {
    await setSupervisor(adminEmail);
    const own = await (await client("contractor")).from("people_interns").select("email");
    expect((own.data ?? []).map((r) => r.email)).toEqual([intern]);
    expect(((await (await client("member")).from("people_interns").select("email")).data ?? [])).toHaveLength(0);
    expect(((await (await client("no_role")).from("people_interns").select("email")).data ?? [])).toHaveLength(0);
    expect(((await (await client("anon")).from("people_interns").select("email")).data ?? [])).toHaveLength(0);
    expect(((await (await client("super_admin")).from("people_interns").select("email").eq("email", intern)).data ?? [])).toHaveLength(1);
  });

  it("only a super_admin can change one", async () => {
    await setSupervisor(adminEmail);
    const c = await client("contractor");
    await c.from("people_interns").update({ required_hours: 1 }).eq("email", intern);
    expect((await ok("profile", db.from("people_interns").select("required_hours").eq("email", intern).single())).required_hours).toBe(100);
    expect((await c.from("people_interns").insert({ email: memberEmail, discipline: "graphics" })).error).not.toBeNull();
  });

  it("a supervisor sees their intern's profile", async () => {
    await setSupervisor(memberEmail);
    const rows = (await (await client("member")).from("people_interns").select("email")).data ?? [];
    expect(rows.map((r) => r.email)).toEqual([intern]);
  });
});

describe("daily logs", () => {
  it("an intern logs a day under their own name, whatever email they send", async () => {
    await setSupervisor(adminEmail);
    const c = await client("contractor");
    const day = addDays(today, -1);
    const { error } = await c.from("people_daily_logs").insert({ intern_email: memberEmail, work_date: day, hours: 3.5, summary: "Drafted posts" });
    expect(error).toBeNull();
    const rows = await logRows();
    expect(rows).toContainEqual({ work_date: day, hours: 3.5 });
    expect(await logRows(memberEmail)).toHaveLength(0);
  });

  it("refuses a second log for the same day, zero or too many hours, and a blank summary", async () => {
    await setSupervisor(adminEmail);
    const c = await client("contractor");
    const day = addDays(today, -2);
    expect((await c.from("people_daily_logs").insert({ work_date: day, hours: 2, summary: "a" })).error).toBeNull();
    for (const bad of [
      { work_date: day, hours: 2, summary: "again" },
      { work_date: addDays(today, -3), hours: 0, summary: "x" },
      { work_date: addDays(today, -3), hours: 12.5, summary: "x" },
      { work_date: addDays(today, -3), hours: 2, summary: "   " },
    ]) {
      expect((await c.from("people_daily_logs").insert(bad)).error, JSON.stringify(bad)).not.toBeNull();
    }
  });

  it("allows today and 7 days back, refuses tomorrow and 8 days back; a super_admin may go further", async () => {
    await setSupervisor(adminEmail);
    const c = await client("contractor");
    const attempt = (offset: number) => c.from("people_daily_logs").insert({ work_date: addDays(today, offset), hours: 1, summary: "window" });
    expect((await attempt(-7)).error).toBeNull();
    expect((await attempt(0)).error).toBeNull();
    expect((await attempt(1)).error).not.toBeNull();
    expect((await attempt(-8)).error?.message).toMatch(/last 7 days/);
    await adminLog(addDays(today, -60), 5, "Backfilled by a super_admin");
    expect((await logRows()).some((r) => r.work_date === addDays(today, -60))).toBe(true);
  });

  it("someone who is not an intern cannot log, and an inactive intern cannot either", async () => {
    await setSupervisor(adminEmail);
    const m = await client("member");
    expect((await m.from("people_daily_logs").insert({ work_date: addDays(today, -4), hours: 1, summary: "x" })).error?.message).toMatch(/not set up/);
    await exec("deactivate", db.from("people_interns").update({ is_active: false }).eq("id", profileId!));
    const c = await client("contractor");
    expect((await c.from("people_daily_logs").insert({ work_date: addDays(today, -4), hours: 1, summary: "x" })).error).not.toBeNull();
    await exec("reactivate", db.from("people_interns").update({ is_active: true }).eq("id", profileId!));
  });

  it("cannot move a log to another day or intern", async () => {
    await setSupervisor(adminEmail);
    const c = await client("contractor");
    const day = addDays(today, -5);
    const made = await ok("log", c.from("people_daily_logs").insert({ work_date: day, hours: 1, summary: "move me" }).select("id").single());
    expect((await c.from("people_daily_logs").update({ work_date: addDays(day, 1) }).eq("id", made.id)).error).not.toBeNull();
    expect((await c.from("people_daily_logs").update({ intern_email: memberEmail }).eq("id", made.id)).error).not.toBeNull();
    expect((await c.from("people_daily_logs").update({ hours: 2 }).eq("id", made.id)).error).toBeNull();
  });

  it("is private: a stranger sees none, a supervisor sees them but cannot write, an intern cannot see another's", async () => {
    await setSupervisor(adminEmail);
    await adminLog(addDays(today, -20), 6, "Private log");
    expect(((await (await client("member")).from("people_daily_logs").select("id")).data ?? [])).toHaveLength(0);

    await setSupervisor(memberEmail);
    const m = await client("member");
    expect(((await m.from("people_daily_logs").select("id")).data ?? []).length).toBeGreaterThan(0);
    expect((await m.from("people_daily_logs").insert({ intern_email: intern, work_date: addDays(today, -1), hours: 1, summary: "sup" })).error).not.toBeNull();
    const one = await ok("one", db.from("people_daily_logs").select("id").eq("intern_email", intern).limit(1).single());
    await m.from("people_daily_logs").update({ hours: 11 }).eq("id", one.id);
    await m.from("people_daily_logs").delete().eq("id", one.id);
    expect(await ok("still", db.from("people_daily_logs").select("id, hours").eq("id", one.id).single())).not.toMatchObject({ hours: 11 });
  });
});

describe("weekly reports", () => {
  it("starts as a draft with the week's hours, whatever the client sends", async () => {
    await setSupervisor(adminEmail);
    const week = freshWeek();
    await adminLog(week, 4);
    await adminLog(addDays(week, 1), 3.5);
    const c = await client("contractor");
    const made = await ok("report", c.from("people_weekly_reports").insert({
      week_start: week, intern_email: memberEmail, status: "approved", total_hours: 999,
      reviewed_by_email: adminEmail, review_comment: "forged",
    }).select("*").single());
    expect(made).toMatchObject({
      intern_email: intern, status: "draft", total_hours: 7.5, reviewed_by_email: null, review_comment: null, submitted_at: null,
    });
  });

  it("must start on a Monday and not in the future, and only once per week", async () => {
    await setSupervisor(adminEmail);
    const c = await client("contractor");
    expect((await c.from("people_weekly_reports").insert({ week_start: addDays(freshWeek(), 2) })).error).not.toBeNull();
    expect((await c.from("people_weekly_reports").insert({ week_start: addDays(monday, 7) })).error).not.toBeNull();
    const week = freshWeek();
    expect((await c.from("people_weekly_reports").insert({ week_start: week })).error).toBeNull();
    expect((await c.from("people_weekly_reports").insert({ week_start: week })).error).not.toBeNull();
  });

  it("keeps its total in step with the logs while open", async () => {
    await setSupervisor(adminEmail);
    const week = freshWeek();
    await adminLog(week, 4);
    const id = await internReport(week);
    expect((await reportRow(id)).total_hours).toBe(4);
    await adminLog(addDays(week, 2), 2.25);
    expect((await reportRow(id)).total_hours).toBe(6.25);
    await exec("delete", db.from("people_daily_logs").delete().eq("intern_email", intern).eq("work_date", week));
    expect((await reportRow(id)).total_hours).toBe(2.25);
  });

  it("cannot be submitted without any logged hours", async () => {
    await setSupervisor(adminEmail);
    const id = await internReport(freshWeek());
    expect((await setReport(id, { status: "submitted" }, "contractor")).error?.message).toMatch(/at least one day/);
    expect((await reportRow(id)).status).toBe("draft");
  });

  it("locks the week's logs and the text once submitted, and unlocks them when returned", async () => {
    await setSupervisor(adminEmail);
    const week = freshWeek();
    await adminLog(week, 4);
    const id = await internReport(week);
    const c = await client("contractor");
    await exec("write", Promise.resolve({ error: (await setReport(id, { accomplishments: "Wrote 3 posts", learnings: "Hook first" }, "contractor")).error }));
    expect((await setReport(id, { status: "submitted" }, "contractor")).error).toBeNull();
    expect(await reportRow(id)).toMatchObject({ status: "submitted", total_hours: 4 });
    expect((await reportRow(id)).submitted_at).not.toBeNull();

    // Locked: the logs of that week (for the intern and for a super_admin), and the text.
    const log = await ok("log", db.from("people_daily_logs").select("id").eq("intern_email", intern).eq("work_date", week).single());
    const a = await client("super_admin");
    expect((await a.from("people_daily_logs").update({ hours: 9 }).eq("id", log.id)).error?.message).toMatch(/already submitted/);
    expect((await a.from("people_daily_logs").delete().eq("id", log.id)).error?.message).toMatch(/already submitted/);
    expect((await a.from("people_daily_logs").insert({ intern_email: intern, work_date: addDays(week, 1), hours: 1, summary: "late" })).error?.message).toMatch(/already submitted/);
    expect((await c.from("people_daily_logs").update({ hours: 9 }).eq("id", log.id)).error).not.toBeNull();
    expect((await setReport(id, { accomplishments: "edited late" }, "contractor")).error?.message).toMatch(/cannot be edited/);
    expect((await ok("unchanged", db.from("people_daily_logs").select("hours").eq("id", log.id).single())).hours).toBe(4);

    // The reviewer returns it with a comment; now the intern can change both.
    expect((await setReport(id, { status: "returned" }, "super_admin")).error?.message).toMatch(/what needs to change/);
    expect((await setReport(id, { status: "returned", review_comment: "Add numbers" }, "super_admin")).error).toBeNull();
    expect(await reportRow(id)).toMatchObject({ status: "returned", review_comment: "Add numbers", reviewed_by_email: adminEmail });
    expect((await a.from("people_daily_logs").update({ hours: 5 }).eq("id", log.id)).error).toBeNull();
    expect((await setReport(id, { accomplishments: "Wrote 3 posts with reach numbers" }, "contractor")).error).toBeNull();
    expect((await reportRow(id)).total_hours).toBe(5);
    expect((await setReport(id, { status: "submitted" }, "contractor")).error).toBeNull();
    expect(await reportRow(id)).toMatchObject({ status: "submitted", reviewed_by_email: null, reviewed_at: null, total_hours: 5 });
  });

  it("is reviewed by the intern's supervisor, never by the intern, a stranger or on their own report", async () => {
    await setSupervisor(memberEmail);
    const week = freshWeek();
    await adminLog(week, 4);
    const id = await internReport(week);
    await setReport(id, { status: "submitted" }, "contractor");

    expect((await setReport(id, { status: "approved" }, "contractor")).error?.message).toMatch(/your own report/);
    expect((await reportRow(id)).status).toBe("submitted");

    await setSupervisor(adminEmail); // now the member is a stranger
    expect((await setReport(id, { status: "approved" }, "member")).error?.message).not.toBeNull();
    expect((await reportRow(id)).status).toBe("submitted");

    await setSupervisor(memberEmail);
    expect((await setReport(id, { status: "approved" }, "member")).error).toBeNull();
    expect(await reportRow(id)).toMatchObject({ status: "approved", reviewed_by_email: memberEmail });
    expect((await reportRow(id)).reviewed_at).not.toBeNull();
  });

  it("a reviewer cannot change the text, and an approved report cannot change at all", async () => {
    await setSupervisor(adminEmail);
    const week = freshWeek();
    await adminLog(week, 4);
    const id = await internReport(week);
    await setReport(id, { accomplishments: "Original" }, "contractor");
    await setReport(id, { status: "submitted" }, "contractor");
    expect((await setReport(id, { status: "approved", accomplishments: "Rewritten" }, "super_admin")).error?.message).toMatch(/cannot change the report/);
    expect((await setReport(id, { status: "approved" }, "super_admin")).error).toBeNull();
    for (const [patch, actor] of [
      [{ accomplishments: "late edit" }, "contractor"],
      [{ status: "returned", review_comment: "no" }, "super_admin"],
      [{ review_comment: "late comment" }, "super_admin"],
      [{ status: "draft" }, "contractor"],
    ] as [Record<string, unknown>, Actor][]) {
      expect((await setReport(id, patch, actor)).error, JSON.stringify(patch)).not.toBeNull();
    }
    expect(await reportRow(id)).toMatchObject({ status: "approved", accomplishments: "Original" });
  });

  it("is private: a stranger sees none, an intern sees only their own", async () => {
    await setSupervisor(adminEmail);
    await internReport(freshWeek());
    expect(((await (await client("member")).from("people_weekly_reports").select("id")).data ?? [])).toHaveLength(0);
    const own = (await (await client("contractor")).from("people_weekly_reports").select("intern_email")).data ?? [];
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((r) => r.intern_email === intern)).toBe(true);
  });

  it("allows exactly the legal status changes", async () => {
    await setSupervisor(adminEmail);
    const wrong: string[] = [];
    for (const from of REPORT_STATUSES) {
      for (const to of REPORT_STATUSES) {
        if (from === to) continue;
        const id = await reportIn(from);
        // The intern moves a report toward submitted; the reviewer decides the rest.
        const actor: Actor = to === "submitted" || to === "draft" ? "contractor" : "super_admin";
        const patch = to === "returned" ? { status: to, review_comment: "Needs work" } : { status: to };
        const { error } = await setReport(id, patch, actor);
        if (!error !== canTransitionReport(from, to)) wrong.push(`${from} -> ${to}: database ${error ? "refused" : "allowed"}`);
      }
    }
    expect(wrong).toEqual([]);
  }, 180_000);
});

describe("everyone without the right to", () => {
  it("anonymous and role-less callers see and write nothing", async () => {
    await setSupervisor(adminEmail);
    for (const actor of ["anon", "no_role"] as Actor[]) {
      const c = await client(actor);
      for (const table of ["people_interns", "people_daily_logs", "people_weekly_reports"]) {
        expect(((await c.from(table).select("id")).data ?? []), `${actor} ${table}`).toHaveLength(0);
      }
      expect((await c.from("people_daily_logs").insert({ work_date: today, hours: 1, summary: "x" })).error, actor).not.toBeNull();
    }
  });

  it("people_week_hours answers 0 about someone else's week", async () => {
    await setSupervisor(adminEmail);
    const week = freshWeek();
    await adminLog(week, 4);
    const asMember = await (await client("member")).rpc("people_week_hours", { p_email: intern, p_week: week });
    expect(asMember.data).toBe(0);
    const asIntern = await (await client("contractor")).rpc("people_week_hours", { p_email: intern, p_week: week });
    expect(asIntern.data).toBe(4);
    for (const actor of ACTORS.filter((a) => a === "anon")) {
      expect((await (await client(actor)).rpc("people_week_hours", { p_email: intern, p_week: week })).error).not.toBeNull();
    }
  });
});
