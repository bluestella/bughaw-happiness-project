// Hardening from 0019: the audit log, the contributor allowlist check, and the
// team directory guard (docs/security.md).
import { describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { FIXTURES, USERS } from "../../e2e/support/seed.ts";
import { addDays, manilaDate } from "@/lib/crm";
import { weekStart } from "@/lib/people";
import { ACTORS, clientFor, emailOf, type Actor } from "./actors.ts";

const db = adminClient();
const today = manilaDate();
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

type AuditRow = { id: number; actor_email: string | null; table_name: string; row_key: string | null; op: string; changes: Record<string, unknown> };
async function audit(table: string, key: string): Promise<AuditRow[]> {
  const { data, error } = await db
    .from("audit_log")
    .select("id, actor_email, table_name, row_key, op, changes")
    .eq("table_name", table)
    .eq("row_key", key)
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AuditRow[];
}

describe("audit log access", () => {
  it("only a super_admin can read it, and nobody can write or change it", async () => {
    await db.from("audit_log").insert({ table_name: "access_probe", op: "INSERT", changes: {} });
    const admin = await clientFor("super_admin");
    const seen = await admin.from("audit_log").select("id").eq("table_name", "access_probe");
    expect((seen.data ?? []).length).toBeGreaterThan(0);

    for (const actor of ["anon", "no_role", "contractor", "member"] as Actor[]) {
      const c = await clientFor(actor);
      expect(((await c.from("audit_log").select("id")).data ?? []), actor).toHaveLength(0);
    }
    for (const actor of ACTORS) {
      const c = await clientFor(actor);
      await c.from("audit_log").insert({ table_name: "forged", op: "INSERT", changes: {} });
      await c.from("audit_log").update({ table_name: "edited" }).eq("table_name", "access_probe");
      await c.from("audit_log").delete().eq("table_name", "access_probe");
    }
    expect(((await db.from("audit_log").select("id").eq("table_name", "forged")).data ?? [])).toHaveLength(0);
    expect(((await db.from("audit_log").select("id").eq("table_name", "edited")).data ?? [])).toHaveLength(0);
    expect(((await db.from("audit_log").select("id").eq("table_name", "access_probe")).data ?? []).length).toBeGreaterThan(0);
  });
});

describe("what is recorded", () => {
  it("a role change names who did it, and what changed", async () => {
    const admin = await clientFor("super_admin");
    const email = USERS.contractor.email;
    const before = (await audit("allowed_emails", email)).length;
    expect((await admin.rpc("admin_set_allowed_role", { p_email: email, p_role: "member" })).error).toBeNull();
    try {
      const rows = (await audit("allowed_emails", email)).slice(before);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ op: "UPDATE", actor_email: emailOf("super_admin"), changes: { role: { old: "contractor", new: "member" } } });
    } finally {
      await admin.rpc("admin_set_allowed_role", { p_email: email, p_role: "contractor" });
    }
  });

  it("a page-access override is recorded", async () => {
    const admin = await clientFor("super_admin");
    const email = USERS.contractor.email;
    expect((await admin.rpc("admin_set_user_section", { p_email: email, p_section: "crm", p_allowed: true })).error).toBeNull();
    try {
      const rows = (await db.from("audit_log").select("op, actor_email, changes").eq("table_name", "user_section_overrides").eq("row_key", `${email}/crm`).eq("actor_email", emailOf("super_admin"))).data ?? [];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[rows.length - 1]).toMatchObject({ op: "INSERT", actor_email: emailOf("super_admin") });
    } finally {
      await db.from("user_section_overrides").delete().match({ email, section: "crm" });
    }
  });

  it("a quotation insert and each change to it are recorded under the member who made them", async () => {
    const acc = await db.from("crm_accounts").insert({ name: `[audit] ${uniq()}` }).select("id").single();
    const m = await clientFor("member");
    const q = await m.from("sales_quotations").insert({ account_id: acc.data!.id }).select("id").single();
    const id = q.data!.id as string;
    await m.from("sales_quotations").update({ notes: "first note" }).eq("id", id);
    await m.from("sales_quotations").update({ notes: "first note" }).eq("id", id); // no change
    const rows = await audit("sales_quotations", id);
    expect(rows.map((r) => r.op)).toEqual(["INSERT", "UPDATE"]);
    expect(rows.every((r) => r.actor_email === emailOf("member"))).toBe(true);
    expect(rows[1].changes).toEqual({ notes: { old: null, new: "first note" } });
    expect(JSON.stringify(rows[1].changes)).not.toContain("updated_at");
  });

  it("report text is left out of the log, but the status change is in it", async () => {
    await db.from("people_interns").insert({ email: USERS.contractor.email, discipline: "marketing", supervisor_email: USERS.member.email });
    try {
      const week = weekStart(addDays(today, -21));
      await (await clientFor("super_admin")).from("people_daily_logs").insert({ intern_email: USERS.contractor.email, work_date: addDays(today, -21), hours: 2, summary: "SECRET-SUMMARY" });
      const c = await clientFor("contractor");
      const r = await c.from("people_weekly_reports").insert({ week_start: week }).select("id").single();
      const id = r.data!.id as string;
      await c.from("people_weekly_reports").update({ accomplishments: "PRIVATE-WRITING" }).eq("id", id);
      await c.from("people_weekly_reports").update({ status: "submitted" }).eq("id", id);
      const rows = await audit("people_weekly_reports", id);
      const text = JSON.stringify(rows);
      expect(text).not.toContain("PRIVATE-WRITING");
      expect(rows.some((x) => x.op === "UPDATE" && JSON.stringify(x.changes).includes('"submitted"'))).toBe(true);
      // Only the status-related updates are rows: the text-only edit changed nothing that is logged.
      expect(rows.filter((x) => x.op === "UPDATE").every((x) => !("accomplishments" in x.changes))).toBe(true);
    } finally {
      await db.from("people_weekly_reports").delete().eq("intern_email", USERS.contractor.email);
      await db.from("people_daily_logs").delete().eq("intern_email", USERS.contractor.email);
      await db.from("people_interns").delete().eq("email", USERS.contractor.email);
    }
  });

  it("a lead change is recorded without the raw submission", async () => {
    const lead = FIXTURES.leads[0];
    const m = await clientFor("member");
    const before = (await audit("crm_leads", lead.id)).length;
    await m.from("crm_leads").update({ next_action: "Call back", next_action_due_on: addDays(today, 1) }).eq("id", lead.id);
    const rows = (await audit("crm_leads", lead.id)).slice(before);
    expect(rows).toHaveLength(1);
    expect(rows[0].changes).toMatchObject({ next_action: { old: null, new: "Call back" } });
    expect(Object.keys(rows[0].changes)).not.toContain("raw");
    await m.from("crm_leads").update({ next_action: null, next_action_due_on: null }).eq("id", lead.id);
  });
});

describe("contributors must be on the invite list", () => {
  it("refuses a typo'd email and stores a valid one lower-cased", async () => {
    const m = await clientFor("member");
    const project = FIXTURES.project.id;
    const typo = await m.from("project_contributors").insert({ project_id: project, user_email: `nobody-${uniq()}@test.local` });
    expect(typo.error?.message).toMatch(/not on the invite list/);

    const mixed = USERS.contractor.email.toUpperCase();
    await db.from("project_contributors").delete().match({ project_id: project, user_email: USERS.contractor.email });
    try {
      const ok = await m.from("project_contributors").insert({ project_id: project, user_email: `  ${mixed}  ` });
      expect(ok.error).toBeNull();
      const stored = await db.from("project_contributors").select("user_email").eq("project_id", project).eq("user_email", USERS.contractor.email);
      expect(stored.data ?? []).toHaveLength(1);
    } finally {
      // Put the fixture grant back for later tests.
      await db.from("project_contributors").upsert({ project_id: project, user_email: USERS.contractor.email, added_by_email: USERS.super_admin.email });
    }
  });

  it("applies to board contributors too", async () => {
    const m = await clientFor("member");
    const { error } = await m.from("mini_project_contributors").insert({ mini_project_id: FIXTURES.miniProject.id, user_email: `nobody-${uniq()}@test.local` });
    expect(error?.message).toMatch(/not on the invite list/);
  });
});
