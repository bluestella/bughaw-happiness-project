// Database rules from 0020 (finance), attempted through the anon key. The section is OFF
// by default for members and contractors; a per-person grant turns it on.
import { describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { addDays, manilaDate } from "@/lib/crm";
import { clientFor, emailOf, type Actor } from "./actors.ts";

const db = adminClient();
const today = manilaDate();
const thisMonth = `${today.slice(0, 7)}-01`;
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

async function category(): Promise<string> {
  const { data, error } = await db.from("fin_categories").insert({ name: `[access] ${uniq()}` }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}
const admin = () => clientFor("super_admin");

/** Runs `fn` with finance switched on for one person, then removes the grant. */
async function withFinance(actor: "member" | "contractor", fn: () => Promise<void>) {
  const email = emailOf(actor);
  const { error } = await db.from("user_section_overrides").insert({ email, section: "finance", allowed: true });
  if (error) throw new Error(error.message);
  try {
    await fn();
  } finally {
    await db.from("user_section_overrides").delete().match({ email, section: "finance" });
  }
}
async function expense(client: Awaited<ReturnType<typeof clientFor>>, cat: string, over: Record<string, unknown> = {}) {
  return client.from("fin_expenses").insert({ spent_on: today, amount: 100, category_id: cat, description: "[access] test", ...over }).select("*").single();
}

describe("who can open finance", () => {
  it("is off for members and contractors by default, on for a super_admin, and a grant turns it on for one person", async () => {
    const cat = await category();
    await expense(await admin(), cat);
    for (const actor of ["anon", "no_role", "contractor", "member"] as Actor[]) {
      const c = await clientFor(actor);
      expect(((await c.from("fin_expenses").select("id")).data ?? []), actor).toHaveLength(0);
      expect((await expense(c, cat)).error, actor).not.toBeNull();
    }
    await withFinance("member", async () => {
      const m = await clientFor("member");
      expect(((await m.from("fin_expenses").select("id")).data ?? []).length).toBeGreaterThan(0);
      expect((await expense(m, cat)).error).toBeNull();
    });
    expect(((await (await clientFor("member")).from("fin_expenses").select("id")).data ?? [])).toHaveLength(0);
  });
});

describe("categories", () => {
  it("only a super_admin edits them, and names are unique ignoring case and spacing", async () => {
    const name = `[access] Unique ${uniq()}`;
    expect((await (await admin()).from("fin_categories").insert({ name })).error).toBeNull();
    expect((await (await admin()).from("fin_categories").insert({ name: `  ${name.toUpperCase()} ` })).error).not.toBeNull();
    expect((await (await admin()).from("fin_categories").insert({ name: "   " })).error).not.toBeNull();
    await withFinance("member", async () => {
      const m = await clientFor("member");
      expect(((await m.from("fin_categories").select("id")).data ?? []).length).toBeGreaterThan(5); // the seeded defaults
      expect((await m.from("fin_categories").insert({ name: `[access] ${uniq()}` })).error).not.toBeNull();
    });
  });
  it("ships the default categories", async () => {
    const names = ((await db.from("fin_categories").select("name")).data ?? []).map((r) => r.name);
    for (const n of ["Materials and production", "Packaging", "Marketing", "Other"]) expect(names).toContain(n);
  });
});

describe("expenses", () => {
  it("refuses a zero, negative or huge amount, a blank description and a future date", async () => {
    const cat = await category();
    const a = await admin();
    for (const bad of [
      { amount: 0 }, { amount: -5 }, { amount: 1_000_000_000 },
      { description: "   " }, { description: "x".repeat(501) },
      { spent_on: addDays(today, 1) },
    ]) {
      expect((await expense(a, cat, bad)).error, JSON.stringify(bad)).not.toBeNull();
    }
    expect((await expense(a, cat, { spent_on: today })).error).toBeNull();
  });

  it("is written under the session's email, and cannot be created already voided", async () => {
    const cat = await category();
    const { data } = await expense(await admin(), cat, {
      created_by_email: "forged@test.local", void_reason: "forged", voided_at: new Date().toISOString(),
    });
    expect(data).toMatchObject({ created_by_email: emailOf("super_admin"), voided_at: null, void_reason: null });
  });

  it("is voided with a reason, then locked", async () => {
    const cat = await category();
    const a = await admin();
    const { data } = await expense(a, cat);
    const id = data!.id as string;
    expect((await a.from("fin_expenses").update({ voided_at: new Date().toISOString() }).eq("id", id)).error).toBeNull();
    expect((await db.from("fin_expenses").select("voided_at").eq("id", id).single()).data?.voided_at).toBeNull(); // a time alone voids nothing

    expect((await a.from("fin_expenses").update({ void_reason: "Entered twice" }).eq("id", id)).error).toBeNull();
    const voided = (await db.from("fin_expenses").select("voided_at, void_reason").eq("id", id).single()).data;
    expect(voided?.void_reason).toBe("Entered twice");
    expect(voided?.voided_at).not.toBeNull();

    for (const patch of [{ amount: 1 }, { void_reason: null }, { description: "edited" }]) {
      expect((await a.from("fin_expenses").update(patch).eq("id", id)).error, JSON.stringify(patch)).not.toBeNull();
    }
    expect((await db.from("fin_expenses").select("amount").eq("id", id).single()).data?.amount).toBe(100);
  });

  it("can be edited while live, and is audited", async () => {
    const cat = await category();
    const a = await admin();
    const { data } = await expense(a, cat);
    const id = data!.id as string;
    expect((await a.from("fin_expenses").update({ amount: 250.5, vendor: "Coir Co" }).eq("id", id)).error).toBeNull();
    const rows = (await db.from("audit_log").select("op, actor_email, changes").eq("table_name", "fin_expenses").eq("row_key", id).order("id")).data ?? [];
    expect(rows.map((r) => r.op)).toEqual(["INSERT", "UPDATE"]);
    expect(rows[1]).toMatchObject({ actor_email: emailOf("super_admin"), changes: { amount: { old: 100, new: 250.5 } } });
  });
});

describe("cash balances", () => {
  // One snapshot per day: leave the days empty for the other tests that need today.
  const clear = () => db.from("fin_cash_balances").delete().in("as_of", [today, addDays(today, -1), addDays(today, -2)]);
  it("one per day, never in the future, never negative; only a super_admin corrects one", async () => {
    await clear();
    try {
      await cashRules();
    } finally {
      await clear();
    }
  });
  async function cashRules() {
    const a = await admin();
    expect((await a.from("fin_cash_balances").insert({ as_of: today, amount: 250000 })).error).toBeNull();
    expect((await a.from("fin_cash_balances").insert({ as_of: today, amount: 1 })).error).not.toBeNull();
    expect((await a.from("fin_cash_balances").insert({ as_of: addDays(today, 1), amount: 1 })).error).not.toBeNull();
    expect((await a.from("fin_cash_balances").insert({ as_of: addDays(today, -1), amount: -1 })).error).not.toBeNull();

    await withFinance("member", async () => {
      const m = await clientFor("member");
      expect((await m.from("fin_cash_balances").insert({ as_of: addDays(today, -2), amount: 100 })).error).toBeNull();
      await m.from("fin_cash_balances").update({ amount: 1 }).eq("as_of", today);
      expect((await db.from("fin_cash_balances").select("amount").eq("as_of", today).single()).data?.amount).toBe(250000);
    });
    expect((await a.from("fin_cash_balances").update({ amount: 260000 }).eq("as_of", today)).error).toBeNull();
    expect((await db.from("fin_cash_balances").select("amount").eq("as_of", today).single()).data?.amount).toBe(260000);
  }
});

describe("budgets", () => {
  it("must start on the first of a month, and are unique per category and month", async () => {
    const cat = await category();
    const a = await admin();
    expect((await a.from("fin_budgets").insert({ month_start: addDays(thisMonth, 1), category_id: cat, amount: 100 })).error).not.toBeNull();
    expect((await a.from("fin_budgets").insert({ month_start: thisMonth, category_id: cat, amount: -1 })).error).not.toBeNull();
    expect((await a.from("fin_budgets").insert({ month_start: thisMonth, category_id: cat, amount: 5000 })).error).toBeNull();
    expect((await a.from("fin_budgets").insert({ month_start: thisMonth, category_id: cat, amount: 6000 })).error).not.toBeNull();
    // Changing the amount is an upsert from the screen.
    expect((await a.from("fin_budgets").upsert({ month_start: thisMonth, category_id: cat, amount: 6000 }, { onConflict: "month_start,category_id" })).error).toBeNull();
    expect((await db.from("fin_budgets").select("amount").eq("category_id", cat).single()).data?.amount).toBe(6000);
  });
});
