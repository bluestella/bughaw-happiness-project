// Database rules from 0024 (intern evaluations), attempted through the anon key.
// Cast: the contractor is the intern; the member is the supervisor (set per test); the
// super_admin can evaluate anyone except themself.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { addDays, manilaDate } from "@/lib/crm";
import { ACTORS, clientFor, emailOf, type Actor } from "./actors.ts";

const db = adminClient();
const today = manilaDate();
const internEmail = emailOf("contractor");
const memberEmail = emailOf("member");
const adminEmail = emailOf("super_admin");
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
type Client = Awaited<ReturnType<typeof clientFor>>;

let internId = "";
let adminProfileId = "";
const criteria: string[] = [];
let criterionA = ""; // for everyone
let criterionM = ""; // marketing only
let criterionG = ""; // graphics only
let criterionOff = ""; // inactive

async function ok<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error || data === null || data === undefined) throw new Error(`${label}: ${error?.message ?? "no data"}`);
  return data as NonNullable<T>;
}
async function criterion(over: Record<string, unknown>): Promise<string> {
  const id = (await ok("criterion", db.from("people_eval_criteria").insert({ label: `[access] ${uniq()}`, ...over }).select("id").single())).id as string;
  criteria.push(id);
  return id;
}
const setSupervisor = (email: string | null) =>
  db.from("people_interns").update({ supervisor_email: email }).eq("id", internId);

beforeAll(async () => {
  // Files run one at a time on one database; another file may have left a profile behind.
  await db.from("people_evaluations").delete().not("id", "is", null);
  await db.from("people_interns").delete().in("email", [internEmail, adminEmail]);
  internId = (await ok("intern", db.from("people_interns").insert({
    email: internEmail, full_name: "Test Intern", discipline: "marketing", supervisor_email: memberEmail, required_hours: 100,
  }).select("id").single())).id as string;
  adminProfileId = (await ok("admin profile", db.from("people_interns").insert({
    email: adminEmail, full_name: "Admin As Intern", discipline: "graphics",
  }).select("id").single())).id as string;
  criterionA = await criterion({ label: `[access] Initiative ${uniq()}`, sort_order: 1 });
  criterionM = await criterion({ label: `[access] Campaign ${uniq()}`, discipline: "marketing", sort_order: 2 });
  criterionG = await criterion({ label: `[access] Layout ${uniq()}`, discipline: "graphics", sort_order: 3 });
  criterionOff = await criterion({ label: `[access] Retired ${uniq()}`, is_active: false });
});
afterAll(async () => {
  await db.from("people_evaluations").delete().in("intern_id", [internId, adminProfileId]);
  if (criteria.length) await db.from("people_eval_criteria").delete().in("id", criteria);
  await db.from("people_interns").delete().in("id", [internId, adminProfileId]);
});

let period = 0;
async function evaluation(c: Client, over: Record<string, unknown> = {}, who = internId) {
  return c.from("people_evaluations")
    .insert({ intern_id: who, period: `Period ${uniq()}-${period++}`, evaluated_on: today, ...over }).select("*").single();
}
async function score(c: Client, evaluationId: string, criterionId: string, value = 4, comment?: string) {
  return c.from("people_evaluation_scores")
    .insert({ evaluation_id: evaluationId, criterion_id: criterionId, score: value, comment }).select("*").single();
}
async function share(c: Client, id: string) {
  return c.from("people_evaluations").update({ status: "shared" }).eq("id", id).select("*");
}

describe("the rubric", () => {
  it("everyone with the section reads it, and only a super_admin writes it", async () => {
    for (const a of ["contractor", "member", "super_admin"] as Actor[]) {
      const rows = (await (await clientFor(a)).from("people_eval_criteria").select("id").eq("id", criterionA)).data ?? [];
      expect(rows, a).toHaveLength(1);
    }
    for (const a of ["anon", "no_role"] as Actor[]) {
      expect(((await (await clientFor(a)).from("people_eval_criteria").select("id")).data ?? []), a).toHaveLength(0);
    }
    for (const a of ["contractor", "member", "anon", "no_role"] as Actor[]) {
      const c = await clientFor(a);
      expect((await c.from("people_eval_criteria").insert({ label: `[access] forged ${uniq()}` })).error, a).not.toBeNull();
      await c.from("people_eval_criteria").update({ label: "forged" }).eq("id", criterionA);
      await c.from("people_eval_criteria").delete().eq("id", criterionA);
    }
    expect((await db.from("people_eval_criteria").select("label").eq("id", criterionA).single()).data!.label).not.toBe("forged");
  });
  it("a label is unique per discipline, ignoring case and spacing; limits are enforced", async () => {
    const admin = await clientFor("super_admin");
    const label = `[access] Same ${uniq()}`;
    const a = await admin.from("people_eval_criteria").insert({ label }).select("id").single();
    expect(a.error).toBeNull();
    criteria.push(a.data!.id as string);
    expect((await admin.from("people_eval_criteria").insert({ label: ` ${label.toUpperCase()} ` })).error).not.toBeNull();
    const b = await admin.from("people_eval_criteria").insert({ label, discipline: "graphics" }).select("id").single();
    expect(b.error).toBeNull();
    criteria.push(b.data!.id as string);
    expect((await admin.from("people_eval_criteria").insert({ label: "  " })).error).not.toBeNull();
    expect((await admin.from("people_eval_criteria").insert({ label: "x".repeat(81) })).error).not.toBeNull();
    expect((await admin.from("people_eval_criteria").insert({ label: `[access] d ${uniq()}`, discipline: "law" })).error).not.toBeNull();
  });
});

describe("who can write and read an evaluation", () => {
  it("the supervisor and a super_admin write; the intern never does, nor a member with no supervision", async () => {
    await setSupervisor(memberEmail);
    expect((await evaluation(await clientFor("member"))).error).toBeNull();
    expect((await evaluation(await clientFor("super_admin"))).error).toBeNull();
    expect((await evaluation(await clientFor("contractor"))).error).not.toBeNull();
    for (const a of ["anon", "no_role"] as Actor[]) expect((await evaluation(await clientFor(a))).error, a).not.toBeNull();
    await setSupervisor(null);
    expect((await evaluation(await clientFor("member"))).error).not.toBeNull();
    await setSupervisor(memberEmail);
  });
  it("nobody evaluates themself, not even a super_admin", async () => {
    expect((await evaluation(await clientFor("super_admin"), {}, adminProfileId)).error).not.toBeNull();
  });
  it("a draft is invisible to the intern; a shared one is readable by the intern and never writable", async () => {
    await setSupervisor(memberEmail);
    const m = await clientFor("member");
    const e = await evaluation(m, { strengths: "Reliable" });
    const id = e.data!.id as string;
    await score(m, id, criterionA, 4, "Took the lead");
    const intern = await clientFor("contractor");
    expect(((await intern.from("people_evaluations").select("id").eq("id", id)).data ?? []), "draft").toHaveLength(0);
    expect(((await intern.from("people_evaluation_scores").select("id").eq("evaluation_id", id)).data ?? []), "draft scores").toHaveLength(0);
    expect((await share(m, id)).error).toBeNull();
    expect(((await intern.from("people_evaluations").select("strengths, status").eq("id", id)).data ?? [])).toEqual([{ strengths: "Reliable", status: "shared" }]);
    expect(((await intern.from("people_evaluation_scores").select("score, comment").eq("evaluation_id", id)).data ?? [])).toEqual([{ score: 4, comment: "Took the lead" }]);
    expect(((await intern.from("people_evaluations").update({ strengths: "forged" }).eq("id", id).select("id")).data ?? [])).toHaveLength(0);
  });
  it("a different supervisor, and anyone outside the section, see nothing", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m);
    const id = e.data!.id as string;
    await setSupervisor(null);
    expect(((await m.from("people_evaluations").select("id").eq("id", id)).data ?? [])).toHaveLength(0);
    await setSupervisor(memberEmail);
    for (const a of ["anon", "no_role"] as Actor[]) {
      expect(((await (await clientFor(a)).from("people_evaluations").select("id").eq("id", id)).data ?? []), a).toHaveLength(0);
    }
  });
  it("only a super_admin deletes a draft", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m);
    const id = e.data!.id as string;
    await m.from("people_evaluations").delete().eq("id", id);
    expect((await db.from("people_evaluations").select("id").eq("id", id)).data).toHaveLength(1);
    await (await clientFor("super_admin")).from("people_evaluations").delete().eq("id", id);
    expect((await db.from("people_evaluations").select("id").eq("id", id)).data).toHaveLength(0);
  });
});

describe("what an evaluation may contain", () => {
  it("starts as a draft, refuses a future date, a blank or duplicate period, and a moved intern", async () => {
    await setSupervisor(memberEmail);
    const m = await clientFor("member");
    expect((await evaluation(m, { status: "shared" })).error).not.toBeNull();
    expect((await evaluation(m, { evaluated_on: addDays(today, 1) })).error).not.toBeNull();
    expect((await evaluation(m, { period: "  " })).error).not.toBeNull();
    expect((await evaluation(m, { period: "p".repeat(61) })).error).not.toBeNull();
    const a = await evaluation(m, { period: `Dup ${uniq()}` });
    expect((await evaluation(m, { period: ` ${(a.data!.period as string).toUpperCase()} ` })).error).not.toBeNull();
    const moved = await m.from("people_evaluations").update({ intern_id: adminProfileId }).eq("id", a.data!.id).select("id");
    expect(moved.error?.message ?? "refused").toMatch(/cannot move|refused/);
    expect((await db.from("people_evaluations").select("intern_id").eq("id", a.data!.id).single()).data!.intern_id).toBe(internId);
  });
  it("the evaluator is the session user and never changes", async () => {
    const m = await clientFor("member");
    const a = await evaluation(m, { created_by_email: "forged@x.test" });
    expect(a.data!.created_by_email).toBe(memberEmail);
    const r = await (await clientFor("super_admin")).from("people_evaluations").update({ created_by_email: "forged@x.test", strengths: "edited" }).eq("id", a.data!.id).select("*").single();
    expect(r.data!.created_by_email).toBe(memberEmail);
    expect(r.data!.strengths).toBe("edited");
  });
});

describe("scores", () => {
  it("score 1 to 5 only, once per criterion, and the criterion's wording is kept", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m);
    const id = e.data!.id as string;
    for (const bad of [0, 6]) expect((await score(m, id, criterionA, bad)).error, String(bad)).not.toBeNull();
    const s = await score(m, id, criterionA, 5);
    expect(s.error).toBeNull();
    const { data: crit } = await db.from("people_eval_criteria").select("label").eq("id", criterionA).single();
    expect(s.data!.criterion_label).toBe(crit!.label);
    expect((await score(m, id, criterionA, 3)).error).not.toBeNull(); // already scored
    // Renaming the criterion later does not rewrite the score.
    await (await clientFor("super_admin")).from("people_eval_criteria").update({ label: `${crit!.label} v2` }).eq("id", criterionA);
    expect((await db.from("people_evaluation_scores").select("criterion_label").eq("id", s.data!.id).single()).data!.criterion_label).toBe(crit!.label);
    await db.from("people_eval_criteria").update({ label: crit!.label }).eq("id", criterionA);
  });
  it("only an in-use criterion for the intern's discipline may be scored", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m); // a marketing intern
    const id = e.data!.id as string;
    expect((await score(m, id, criterionM)).error).toBeNull();
    expect((await score(m, id, criterionG)).error).not.toBeNull();
    expect((await score(m, id, criterionOff)).error).not.toBeNull();
  });
  it("the intern, and a member who does not supervise, cannot score", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m);
    const id = e.data!.id as string;
    expect((await score(await clientFor("contractor"), id, criterionA)).error).not.toBeNull();
    await setSupervisor(null);
    expect((await score(m, id, criterionA)).error).not.toBeNull();
    await setSupervisor(memberEmail);
  });
  it("cannot move to another evaluation or criterion", async () => {
    const m = await clientFor("member");
    const e1 = await evaluation(m);
    const e2 = await evaluation(m);
    const s = await score(m, e1.data!.id as string, criterionA);
    const r1 = await m.from("people_evaluation_scores").update({ evaluation_id: e2.data!.id }).eq("id", s.data!.id).select("id");
    const r2 = await m.from("people_evaluation_scores").update({ criterion_id: criterionM }).eq("id", s.data!.id).select("id");
    expect(r1.error).not.toBeNull();
    expect(r2.error).not.toBeNull();
    expect((await m.from("people_evaluation_scores").update({ score: 2, comment: "revised" }).eq("id", s.data!.id).select("score")).data).toEqual([{ score: 2 }]);
  });
});

describe("sharing and the lock", () => {
  it("needs at least one score", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m);
    const r = await share(m, e.data!.id as string);
    expect(r.error?.message ?? "").toMatch(/Score at least one/);
    expect((await db.from("people_evaluations").select("status").eq("id", e.data!.id).single()).data!.status).toBe("draft");
  });
  it("a shared evaluation and its scores are final for everyone, and no user can delete it", async () => {
    const m = await clientFor("member");
    const admin = await clientFor("super_admin");
    const e = await evaluation(m);
    const id = e.data!.id as string;
    const s = await score(m, id, criterionA);
    const shared = await share(m, id);
    expect(shared.error).toBeNull();
    expect(shared.data![0].shared_at).not.toBeNull();
    for (const c of [m, admin]) {
      expect((await c.from("people_evaluations").update({ strengths: "late edit" }).eq("id", id).select("id")).error).not.toBeNull();
      expect((await c.from("people_evaluation_scores").update({ score: 1 }).eq("id", s.data!.id).select("id")).error).not.toBeNull();
      expect((await score(c, id, criterionM)).error).not.toBeNull();
      await c.from("people_evaluation_scores").delete().eq("id", s.data!.id);
      await c.from("people_evaluations").delete().eq("id", id);
    }
    const after = (await db.from("people_evaluations").select("strengths, status").eq("id", id).single()).data!;
    expect(after).toEqual({ strengths: null, status: "shared" });
    expect((await db.from("people_evaluation_scores").select("score").eq("evaluation_id", id)).data).toEqual([{ score: 4 }]);
  });
  it("maintenance (service role) can still remove a shared evaluation, which removes its scores", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m);
    const id = e.data!.id as string;
    await score(m, id, criterionA);
    await share(m, id);
    expect((await db.from("people_evaluations").delete().eq("id", id)).error).toBeNull();
    expect((await db.from("people_evaluation_scores").select("id").eq("evaluation_id", id)).data).toHaveLength(0);
  });
  it("a draft's scores go with it when a super_admin deletes the draft", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m);
    const id = e.data!.id as string;
    await score(m, id, criterionA);
    expect((await (await clientFor("super_admin")).from("people_evaluations").delete().eq("id", id)).error).toBeNull();
    expect((await db.from("people_evaluation_scores").select("id").eq("evaluation_id", id)).data).toHaveLength(0);
  });
  it("an intern with evaluations cannot be deleted", async () => {
    const { error } = await db.from("people_interns").delete().eq("id", internId);
    expect(error).not.toBeNull();
  });
});

describe("audit and internals", () => {
  it("records who shared an evaluation, leaving the written feedback out", async () => {
    const m = await clientFor("member");
    const e = await evaluation(m, { strengths: "private feedback text", recommendation: "rehire in the new term" });
    const id = e.data!.id as string;
    await score(m, id, criterionA, 5, "private score comment");
    await share(m, id);
    const { data } = await db.from("audit_log").select("op, actor_email, changes").eq("table_name", "people_evaluations").eq("row_key", id).order("id");
    expect(data!.map((r) => r.op)).toEqual(["INSERT", "UPDATE"]);
    expect(data!.every((r) => r.actor_email === memberEmail)).toBe(true);
    const scores = await db.from("audit_log").select("changes").eq("table_name", "people_evaluation_scores");
    const all = JSON.stringify(data) + JSON.stringify(scores.data);
    expect(all).not.toContain("private feedback text");
    expect(all).not.toContain("rehire in the new term");
    expect(all).not.toContain("private score comment");
  });
  it("the trigger functions cannot be called by anyone through the API", async () => {
    for (const actor of ACTORS) {
      const c = await clientFor(actor);
      for (const fn of ["people_evaluations_guard", "people_evaluation_scores_guard"]) {
        expect((await c.rpc(fn)).error, `${fn} ${actor}`).not.toBeNull();
      }
    }
  });
});
