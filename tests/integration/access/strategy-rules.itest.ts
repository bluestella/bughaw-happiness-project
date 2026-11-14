// Database rules from 0022 (strategy worksheets), attempted through the anon key.
// Members have the section by default, contractors do not; a per-person grant or denial
// overrides either.
import { describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { clientFor, emailOf, type Actor } from "./actors.ts";

const db = adminClient();
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
const made: string[] = [];

type Client = Awaited<ReturnType<typeof clientFor>>;
async function make(client: Client, over: Record<string, unknown> = {}) {
  const r = await client.from("strategy_worksheets")
    .insert({ kind: "rice", title: `[access] ${uniq()}`, data: { items: [] }, ...over }).select("*").single();
  if (r.data) made.push(r.data.id as string);
  return r;
}
async function clean() {
  if (made.length) await db.from("strategy_worksheets").delete().in("id", made.splice(0));
}
async function withOverride(actor: "member" | "contractor", allowed: boolean, fn: () => Promise<void>) {
  const email = emailOf(actor);
  const { error } = await db.from("user_section_overrides").insert({ email, section: "strategy", allowed });
  if (error) throw new Error(error.message);
  try {
    await fn();
  } finally {
    await db.from("user_section_overrides").delete().match({ email, section: "strategy" });
  }
}

describe("who can open strategy worksheets", () => {
  it("members and super_admins by default; nobody else", async () => {
    const own = await make(await clientFor("member"));
    expect(own.error).toBeNull();
    for (const actor of ["anon", "no_role", "contractor"] as Actor[]) {
      const c = await clientFor(actor);
      expect((await c.from("strategy_worksheets").select("id")).data ?? [], actor).toHaveLength(0);
      expect((await make(c)).error, actor).not.toBeNull();
    }
    expect(((await (await clientFor("super_admin")).from("strategy_worksheets").select("id")).data ?? []).length).toBeGreaterThan(0);
    await clean();
  });
  it("a per-person grant opens it for a contractor, and a denial closes it for a member", async () => {
    await withOverride("contractor", true, async () => {
      expect((await make(await clientFor("contractor"))).error).toBeNull();
    });
    expect(((await (await clientFor("contractor")).from("strategy_worksheets").select("id")).data ?? [])).toHaveLength(0);
    await withOverride("member", false, async () => {
      expect(((await (await clientFor("member")).from("strategy_worksheets").select("id")).data ?? [])).toHaveLength(0);
      expect((await make(await clientFor("member"))).error).not.toBeNull();
    });
    await clean();
  });
});

describe("what a worksheet may contain", () => {
  it("refuses an unknown kind, a blank or oversize title, and a document that is not an object", async () => {
    const m = await clientFor("member");
    expect((await make(m, { kind: "swot" })).error).not.toBeNull();
    expect((await make(m, { title: "   " })).error).not.toBeNull();
    expect((await make(m, { title: "x".repeat(121) })).error).not.toBeNull();
    expect((await make(m, { title: "x".repeat(120) })).error).toBeNull();
    expect((await make(m, { data: [1, 2, 3] })).error).not.toBeNull();
    expect((await make(m, { data: "text" })).error).not.toBeNull();
    await clean();
  });
  it("refuses a document over 64 KB and accepts one just under it", async () => {
    const m = await clientFor("member");
    expect((await make(m, { data: { notes: "x".repeat(70000) } })).error).not.toBeNull();
    expect((await make(m, { data: { notes: "x".repeat(60000) } })).error).toBeNull();
    await clean();
  });
  it("accepts every kind the app offers", async () => {
    const m = await clientFor("member");
    for (const kind of ["porter", "three_horizons", "balanced_scorecard", "rice", "nine_box", "sean_ellis"]) {
      expect((await make(m, { kind, title: `[access] ${kind}` })).error, kind).toBeNull();
    }
    await clean();
  });
});

describe("editing and deleting", () => {
  it("a member edits another person's worksheet; the creator stays and the time moves", async () => {
    const a = await make(await clientFor("super_admin"));
    const id = a.data!.id as string;
    const before = a.data!.updated_at as string;
    await new Promise((r) => setTimeout(r, 20));
    const upd = await (await clientFor("member")).from("strategy_worksheets")
      .update({ title: "[access] renamed", created_by_email: "forged@x.test" }).eq("id", id).select("*").single();
    expect(upd.error).toBeNull();
    expect(upd.data!.title).toBe("[access] renamed");
    expect(upd.data!.created_by_email).toBe(emailOf("super_admin"));
    expect(new Date(upd.data!.updated_at as string).getTime()).toBeGreaterThan(new Date(before).getTime());
    await clean();
  });
  it("an update that names the time we loaded matches nothing once someone else has saved", async () => {
    const a = await make(await clientFor("member"));
    const id = a.data!.id as string;
    const loaded = a.data!.updated_at as string;
    const admin = await clientFor("super_admin");
    await new Promise((r) => setTimeout(r, 20));
    expect((await admin.from("strategy_worksheets").update({ title: "[access] newer" }).eq("id", id)).error).toBeNull();
    const stale = await (await clientFor("member")).from("strategy_worksheets")
      .update({ title: "[access] stale" }).eq("id", id).eq("updated_at", loaded).select("id");
    expect(stale.error).toBeNull();
    expect(stale.data).toHaveLength(0);
    const { data } = await db.from("strategy_worksheets").select("title").eq("id", id).single();
    expect(data!.title).toBe("[access] newer");
    await clean();
  });
  it("only a super_admin deletes", async () => {
    const a = await make(await clientFor("member"));
    const id = a.data!.id as string;
    await (await clientFor("member")).from("strategy_worksheets").delete().eq("id", id);
    expect((await db.from("strategy_worksheets").select("id").eq("id", id)).data).toHaveLength(1);
    await (await clientFor("super_admin")).from("strategy_worksheets").delete().eq("id", id);
    expect((await db.from("strategy_worksheets").select("id").eq("id", id)).data).toHaveLength(0);
    made.length = 0;
  });
});

describe("audit", () => {
  it("records who created and retitled a worksheet, without the document", async () => {
    const a = await make(await clientFor("member"), { data: { notes: "secret strategy notes" } });
    const id = a.data!.id as string;
    await (await clientFor("member")).from("strategy_worksheets").update({ title: "[access] audited" }).eq("id", id);
    const { data } = await db.from("audit_log").select("op, actor_email, changes").eq("table_name", "strategy_worksheets").eq("row_key", id).order("id");
    expect(data!.map((r) => r.op)).toEqual(["INSERT", "UPDATE"]);
    expect(data!.every((r) => r.actor_email === emailOf("member"))).toBe(true);
    expect(JSON.stringify(data)).not.toContain("secret strategy notes");
    await clean();
  });
});
