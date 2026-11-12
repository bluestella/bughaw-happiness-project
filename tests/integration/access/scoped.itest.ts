// Row-level rules the table matrix cannot express: access that depends on who
// owns a row or which board someone was added to.
import { describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { FIXTURES } from "../../e2e/support/seed.ts";
import { clientFor, emailOf } from "./actors.ts";

const db = adminClient();

async function taskTitle(id: string): Promise<string | null> {
  const { data, error } = await db.from("tasks").select("title").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.title as string | undefined) ?? null;
}

describe("contractor: own tasks only", () => {
  it("can edit a task they created", async () => {
    const c = await clientFor("contractor");
    const original = FIXTURES.contractorTask.title;
    await c.from("tasks").update({ title: `${original} (edited)` }).eq("id", FIXTURES.contractorTask.id);
    expect(await taskTitle(FIXTURES.contractorTask.id)).toBe(`${original} (edited)`);
    await db.from("tasks").update({ title: original }).eq("id", FIXTURES.contractorTask.id);
  });

  it("cannot edit a teammate's task on the same board", async () => {
    const c = await clientFor("contractor");
    await c.from("tasks").update({ title: "hijacked" }).eq("id", FIXTURES.memberTask.id);
    expect(await taskTitle(FIXTURES.memberTask.id)).toBe(FIXTURES.memberTask.title);
  });

  it("cannot delete a teammate's task", async () => {
    const c = await clientFor("contractor");
    await c.from("tasks").delete().eq("id", FIXTURES.memberTask.id);
    expect(await taskTitle(FIXTURES.memberTask.id)).toBe(FIXTURES.memberTask.title);
  });
});

describe("projects are visible to contributors only", () => {
  it("contractor does not see a project they were not added to", async () => {
    const c = await clientFor("contractor");
    const { data } = await c.from("projects").select("id").eq("id", FIXTURES.privateProject.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("contractor sees the project they were added to", async () => {
    const c = await clientFor("contractor");
    const { data } = await c.from("projects").select("id").eq("id", FIXTURES.project.id);
    expect(data ?? []).toHaveLength(1);
  });

  it("member sees only projects they contribute to", async () => {
    const m = await clientFor("member");
    const { data } = await m.from("projects").select("id");
    const ids = (data ?? []).map((r) => r.id).sort();
    expect(ids).toEqual([FIXTURES.project.id, FIXTURES.privateProject.id].sort());
  });

  it("a signed-in user with no role sees no project", async () => {
    const n = await clientFor("no_role");
    const { data } = await n.from("projects").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});

describe("per-person section overrides reach RLS", () => {
  const contractor = emailOf("contractor");

  it("granting 'crm' to one contractor lets them read leads; removing it stops them", async () => {
    const c = await clientFor("contractor");
    const before = await c.from("crm_leads").select("id");
    expect(before.data ?? []).toHaveLength(0);

    const grant = await db
      .from("user_section_overrides")
      .insert({ email: contractor, section: "crm", allowed: true });
    expect(grant.error).toBeNull();
    try {
      const during = await c.from("crm_leads").select("id");
      expect((during.data ?? []).length).toBeGreaterThan(0);
    } finally {
      await db.from("user_section_overrides").delete().match({ email: contractor, section: "crm" });
    }

    const after = await c.from("crm_leads").select("id");
    expect(after.data ?? []).toHaveLength(0);
  });

  it("denying 'crm' to one member hides leads from them", async () => {
    const member = emailOf("member");
    const m = await clientFor("member");
    const deny = await db
      .from("user_section_overrides")
      .insert({ email: member, section: "crm", allowed: false });
    expect(deny.error).toBeNull();
    try {
      const during = await m.from("crm_leads").select("id");
      expect(during.data ?? []).toHaveLength(0);
    } finally {
      await db.from("user_section_overrides").delete().match({ email: member, section: "crm" });
    }
    const after = await m.from("crm_leads").select("id");
    expect((after.data ?? []).length).toBeGreaterThan(0);
  });
});
