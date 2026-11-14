// Database rules from 0023 (production and R&D), attempted through the anon key.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { addDays, manilaDate } from "@/lib/crm";
import { ACTORS, clientFor, emailOf, type Actor } from "./actors.ts";

const db = adminClient();
const today = manilaDate();
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
type Client = Awaited<ReturnType<typeof clientFor>>;

let productId = "";
const batches: string[] = [];
const lots: string[] = [];
const tests: string[] = [];

beforeAll(async () => {
  const { data, error } = await db.from("sales_products").insert({ sku: `prod-${uniq()}`, name: "[access] production product" }).select("id").single();
  if (error) throw new Error(error.message);
  productId = data!.id as string;
});
afterAll(async () => {
  if (tests.length) await db.from("material_tests").delete().in("id", tests);
  if (batches.length) await db.from("production_batches").delete().in("id", batches);
  if (lots.length) await db.from("supplier_lots").delete().in("id", lots);
  await db.from("stock_adjustments").delete().eq("product_id", productId);
  await db.from("sales_products").delete().eq("id", productId);
});

async function batch(c: Client, over: Record<string, unknown> = {}) {
  const r = await c.from("production_batches")
    .insert({ batch_no: `b-${uniq()}`, product_id: productId, made_on: today, qty_made: 100, qty_rejected: 10, ...over }).select("*").single();
  if (r.data) batches.push(r.data.id as string);
  return r;
}
async function lot(c: Client, over: Record<string, unknown> = {}) {
  const r = await c.from("supplier_lots")
    .insert({ lot_no: `l-${uniq()}`, supplier: `[access] ${uniq()}`, material: "Coir", received_on: today, quantity: 25, ...over }).select("*").single();
  if (r.data) lots.push(r.data.id as string);
  return r;
}
async function mtest(c: Client, over: Record<string, unknown> = {}) {
  const r = await c.from("material_tests")
    .insert({ tested_on: today, material: "Coir", test_name: "Tear", result: "14 N/mm", outcome: "pass", ...over }).select("*").single();
  if (r.data) tests.push(r.data.id as string);
  return r;
}
async function stock() {
  const { data } = await db.from("stock_levels").select("on_hand, reserved").eq("product_id", productId).single();
  return data as { on_hand: number; reserved: number };
}
async function withGrant(actor: "contractor", allowed: boolean, fn: () => Promise<void>) {
  const email = emailOf(actor);
  const { error } = await db.from("user_section_overrides").insert({ email, section: "production", allowed });
  if (error) throw new Error(error.message);
  try { await fn(); } finally { await db.from("user_section_overrides").delete().match({ email, section: "production" }); }
}

describe("who can open production records", () => {
  it("members and super_admins by default; contractors only with a grant", async () => {
    expect((await lot(await clientFor("member"))).error).toBeNull();
    for (const a of ["anon", "no_role", "contractor"] as Actor[]) {
      const c = await clientFor(a);
      for (const t of ["supplier_lots", "production_batches", "material_tests"]) {
        expect((await c.from(t).select("id")).data ?? [], `${a} ${t}`).toHaveLength(0);
      }
      expect((await batch(c)).error, a).not.toBeNull();
      expect((await mtest(c)).error, a).not.toBeNull();
    }
    await withGrant("contractor", true, async () => {
      const c = await clientFor("contractor");
      expect((await mtest(c)).error).toBeNull();
      expect(((await c.from("supplier_lots").select("id")).data ?? []).length).toBeGreaterThan(0);
    });
    expect(((await (await clientFor("contractor")).from("material_tests").select("id")).data ?? [])).toHaveLength(0);
  });
});

describe("supplier lots", () => {
  it("are unique per supplier and lot number, ignoring case and spacing, but not across suppliers", async () => {
    const m = await clientFor("member");
    const first = await lot(m, { lot_no: "LOT-A", supplier: "Acme" + uniq() });
    const supplier = first.data!.supplier as string;
    expect((await lot(m, { lot_no: " lot-a ", supplier: supplier.toUpperCase() })).error).not.toBeNull();
    expect((await lot(m, { lot_no: "LOT-A", supplier: `Other ${uniq()}` })).error).toBeNull();
  });
  it("refuse a non-positive quantity, a negative cost, blank text and a future date", async () => {
    const m = await clientFor("member");
    expect((await lot(m, { quantity: 0 })).error).not.toBeNull();
    expect((await lot(m, { total_cost: -1 })).error).not.toBeNull();
    expect((await lot(m, { lot_no: "  " })).error).not.toBeNull();
    expect((await lot(m, { received_on: addDays(today, 1) })).error).not.toBeNull();
    expect((await lot(m, { received_on: today })).error).toBeNull();
  });
  it("cannot be deleted by a member", async () => {
    const l = await lot(await clientFor("member"));
    await (await clientFor("member")).from("supplier_lots").delete().eq("id", l.data!.id);
    expect((await db.from("supplier_lots").select("id").eq("id", l.data!.id)).data).toHaveLength(1);
    await (await clientFor("super_admin")).from("supplier_lots").delete().eq("id", l.data!.id);
    expect((await db.from("supplier_lots").select("id").eq("id", l.data!.id)).data).toHaveLength(0);
  });
});

describe("production batches", () => {
  it("start open; one inserted as completed is refused", async () => {
    const m = await clientFor("member");
    const ok = await batch(m);
    expect(ok.error).toBeNull();
    expect(ok.data!.status).toBe("open");
    expect(ok.data!.completed_at).toBeNull();
    expect((await batch(m, { status: "completed" })).error).not.toBeNull();
  });
  it("refuse rejected above made, negatives, a future date, a duplicate number and an unknown product", async () => {
    const m = await clientFor("member");
    expect((await batch(m, { qty_made: 5, qty_rejected: 6 })).error).not.toBeNull();
    expect((await batch(m, { qty_made: -1 })).error).not.toBeNull();
    expect((await batch(m, { labor_hours: -1 })).error).not.toBeNull();
    expect((await batch(m, { total_cost: -1 })).error).not.toBeNull();
    expect((await batch(m, { made_on: addDays(today, 1) })).error).not.toBeNull();
    expect((await batch(m, { product_id: "00000000-0000-4000-8000-000000000000" })).error).not.toBeNull();
    const a = await batch(m, { batch_no: "DUP-1" + uniq() });
    expect((await batch(m, { batch_no: ` ${(a.data!.batch_no as string).toLowerCase()} ` })).error).not.toBeNull();
  });
  it("an open batch can be edited by a member, and the creator never changes", async () => {
    const a = await batch(await clientFor("super_admin"));
    const r = await (await clientFor("member")).from("production_batches")
      .update({ qty_made: 120, notes: "recount", created_by_email: "forged@x.test" }).eq("id", a.data!.id).select("*").single();
    expect(r.error).toBeNull();
    expect(r.data!.qty_made).toBe(120);
    expect(r.data!.created_by_email).toBe(emailOf("super_admin"));
  });
  it("only a super_admin completes; completing adds the good pairs to stock and says so in the history", async () => {
    const before = await stock();
    const a = await batch(await clientFor("member"), { qty_made: 100, qty_rejected: 10 });
    const id = a.data!.id as string;
    for (const actor of ["member", "contractor", "anon", "no_role"] as Actor[]) {
      await (await clientFor(actor)).from("production_batches").update({ status: "completed" }).eq("id", id);
    }
    expect((await db.from("production_batches").select("status").eq("id", id).single()).data!.status).toBe("open");
    expect(await stock()).toEqual(before);

    const done = await (await clientFor("super_admin")).from("production_batches").update({ status: "completed" }).eq("id", id).select("*").single();
    expect(done.error).toBeNull();
    expect(done.data!.status).toBe("completed");
    expect(done.data!.completed_at).not.toBeNull();
    expect((await stock()).on_hand).toBe(before.on_hand + 90);
    const { data: adj } = await db.from("stock_adjustments").select("delta, reason, note").eq("product_id", productId).eq("note", `Batch ${a.data!.batch_no}`);
    expect(adj).toEqual([{ delta: 90, reason: "production", note: `Batch ${a.data!.batch_no}` }]);
  });
  it("a completed batch is locked for everyone, cannot be deleted by a user, and does not add stock twice", async () => {
    const a = await batch(await clientFor("member"), { qty_made: 20, qty_rejected: 0 });
    const id = a.data!.id as string;
    const admin = await clientFor("super_admin");
    expect((await admin.from("production_batches").update({ status: "completed" }).eq("id", id)).error).toBeNull();
    const afterFirst = await stock();
    for (const actor of ["member", "super_admin"] as Actor[]) {
      const c = await clientFor(actor);
      expect((await c.from("production_batches").update({ qty_made: 999 }).eq("id", id).select("id")).error?.message ?? "refused", actor).toMatch(/locked|refused/);
      await c.from("production_batches").delete().eq("id", id);
    }
    const row = (await db.from("production_batches").select("qty_made, status").eq("id", id).single()).data!;
    expect(row).toEqual({ qty_made: 20, status: "completed" });
    expect(await stock()).toEqual(afterFirst);
    // Even the service role cannot edit it; maintenance may delete it.
    expect((await db.from("production_batches").update({ qty_made: 5 }).eq("id", id)).error).not.toBeNull();
  });
  it("a batch with no good pairs completes without touching stock", async () => {
    const before = await stock();
    const a = await batch(await clientFor("member"), { qty_made: 10, qty_rejected: 10 });
    expect((await (await clientFor("super_admin")).from("production_batches").update({ status: "completed" }).eq("id", a.data!.id)).error).toBeNull();
    expect(await stock()).toEqual(before);
  });
  it("an open batch can be deleted by a super_admin and not by a member", async () => {
    const a = await batch(await clientFor("member"));
    const id = a.data!.id as string;
    await (await clientFor("member")).from("production_batches").delete().eq("id", id);
    expect((await db.from("production_batches").select("id").eq("id", id)).data).toHaveLength(1);
    await (await clientFor("super_admin")).from("production_batches").delete().eq("id", id);
    expect((await db.from("production_batches").select("id").eq("id", id)).data).toHaveLength(0);
  });
  it("a product with batches cannot be deleted", async () => {
    const { error } = await db.from("sales_products").delete().eq("id", productId);
    expect(error).not.toBeNull();
  });
});

describe("material tests", () => {
  it("accept only pass, fail or inconclusive, a real result and a past date", async () => {
    const m = await clientFor("member");
    for (const outcome of ["pass", "fail", "inconclusive"]) expect((await mtest(m, { outcome })).error, outcome).toBeNull();
    expect((await mtest(m, { outcome: "maybe" })).error).not.toBeNull();
    expect((await mtest(m, { result: " " })).error).not.toBeNull();
    expect((await mtest(m, { tested_on: addDays(today, 1) })).error).not.toBeNull();
  });
  it("the person who recorded a test can edit it; another member cannot; a super_admin can", async () => {
    const own = await mtest(await clientFor("member"));
    const id = own.data!.id as string;
    expect(own.data!.created_by_email).toBe(emailOf("member"));
    const edit = (c: Client, result: string) => c.from("material_tests").update({ result }).eq("id", id).select("id");
    expect((await edit(await clientFor("member"), "15 N/mm")).data).toHaveLength(1);

    // Another member: borrow the contractor seat with a grant, and make the test theirs by creating it.
    await withGrant("contractor", true, async () => {
      expect((await edit(await clientFor("contractor"), "forged")).data).toHaveLength(0);
    });
    expect((await db.from("material_tests").select("result").eq("id", id).single()).data!.result).toBe("15 N/mm");
    expect((await edit(await clientFor("super_admin"), "16 N/mm")).data).toHaveLength(1);
  });
  it("link to a batch and a lot, and survive either being deleted", async () => {
    const m = await clientFor("member");
    const b = await batch(m);
    const l = await lot(m);
    const t = await mtest(m, { batch_id: b.data!.id, lot_id: l.data!.id });
    expect(t.error).toBeNull();
    const admin = await clientFor("super_admin");
    await admin.from("production_batches").delete().eq("id", b.data!.id);
    await admin.from("supplier_lots").delete().eq("id", l.data!.id);
    const row = (await db.from("material_tests").select("batch_id, lot_id").eq("id", t.data!.id).single()).data!;
    expect(row).toEqual({ batch_id: null, lot_id: null });
  });
  it("only a super_admin deletes", async () => {
    const t = await mtest(await clientFor("member"));
    await (await clientFor("member")).from("material_tests").delete().eq("id", t.data!.id);
    expect((await db.from("material_tests").select("id").eq("id", t.data!.id)).data).toHaveLength(1);
    await (await clientFor("super_admin")).from("material_tests").delete().eq("id", t.data!.id);
    expect((await db.from("material_tests").select("id").eq("id", t.data!.id)).data).toHaveLength(0);
  });
});

describe("audit and internals", () => {
  it("records who completed a batch, leaving the notes out", async () => {
    const a = await batch(await clientFor("member"), { notes: "private shop-floor remark", qty_made: 4, qty_rejected: 0 });
    await (await clientFor("super_admin")).from("production_batches").update({ status: "completed" }).eq("id", a.data!.id);
    const { data } = await db.from("audit_log").select("op, actor_email, changes").eq("table_name", "production_batches").eq("row_key", a.data!.id).order("id");
    expect(data!.map((r) => r.op)).toEqual(["INSERT", "UPDATE"]);
    expect(data![1].actor_email).toBe(emailOf("super_admin"));
    expect(JSON.stringify(data)).not.toContain("private shop-floor remark");
  });
  it("the trigger functions cannot be called by anyone through the API", async () => {
    for (const actor of ACTORS) {
      const c = await clientFor(actor);
      for (const fn of ["production_no_future_date", "production_batches_guard", "production_batches_apply_stock"]) {
        expect((await c.rpc(fn)).error, `${fn} ${actor}`).not.toBeNull();
      }
    }
  });
});
