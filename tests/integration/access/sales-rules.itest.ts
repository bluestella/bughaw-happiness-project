// Database rules from 0015–0017 (docs/specs/sales-quotes-orders-stock.md), attempted
// through the anon key the way the app writes. Every refusal is judged by what is
// in the database afterwards, not only by the error returned.
import { describe, expect, it } from "vitest";
import { adminClient } from "../../e2e/support/admin.ts";
import { addDays, manilaDate } from "@/lib/crm";
import {
  ORDER_STATUSES,
  QUOTE_STATUSES,
  canTransition,
  type OrderStatus,
  type QuoteStatus,
} from "@/lib/sales";
import { ACTORS, clientFor, emailOf, type Actor } from "./actors.ts";

const db = adminClient();
const today = manilaDate();
const nextWeek = addDays(today, 7);
const year = Number(today.slice(0, 4));
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

type Result<T> = PromiseLike<{ data: T; error: { message: string } | null }>;
async function ok<T>(label: string, p: Result<T>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`${label}: no data returned`);
  return data as NonNullable<T>;
}
/** For writes that return nothing: throws on an error only. */
async function exec(label: string, p: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}
const client = (a: Actor) => clientFor(a);

// One customer shared by every test in this file.
let accountId: string | null = null;
async function account(): Promise<string> {
  if (accountId) return accountId;
  const row = await ok("account", db.from("crm_accounts").insert({ name: "[access] Sales Rules Hotel" }).select("id").single());
  accountId = row.id as string;
  return accountId;
}

/** A product with `onHand` pairs in stock, entered the way a super_admin would. */
async function product(onHand = 0): Promise<string> {
  const row = await ok("product", db.from("sales_products").insert({ sku: `sku-${uniq()}`, name: `[access] Slipper ${uniq()}` }).select("id").single());
  const id = row.id as string;
  if (onHand > 0) {
    const a = await client("super_admin");
    const { error } = await a.rpc("stock_adjust", { p_product_id: id, p_delta: onHand, p_reason: "opening_count" });
    if (error) throw new Error(`opening stock: ${error.message}`);
  }
  return id;
}
async function level(productId: string) {
  return ok("level", db.from("stock_levels").select("on_hand, reserved").eq("product_id", productId).single());
}
async function row(table: string, id: string) {
  return ok(table, db.from(table).select("*").eq("id", id).single()) as Promise<Record<string, unknown>>;
}

type L = { product: string; qty: number; price: number };

/** A draft quotation with lines, a validity date, made by a member. */
async function draftQuote(lines: L[], discount = 0): Promise<string> {
  const m = await client("member");
  const q = await ok("quotation", m.from("sales_quotations").insert({ account_id: await account(), discount_amount: discount, valid_until: nextWeek }).select("id").single());
  const id = q.id as string;
  for (const l of lines) {
    await ok("line", m.from("sales_quotation_lines").insert({ quotation_id: id, product_id: l.product, qty: l.qty, unit_price: l.price }).select("id").single());
  }
  return id;
}
async function setQuote(id: string, patch: Record<string, unknown>, actor: Actor = "member") {
  return (await client(actor)).from("sales_quotations").update(patch).eq("id", id).select("id");
}

/** Takes a fresh quotation to `state` by legal moves. */
async function quoteInState(state: QuoteStatus, p?: string): Promise<string> {
  const id = await draftQuote([{ product: p ?? (await product(1000)), qty: 2, price: 100 }]);
  const step = async (status: string) => {
    const { error } = await setQuote(id, { status });
    if (error) throw new Error(`to ${status}: ${error.message}`);
  };
  if (state === "draft") return id;
  if (state === "void") {
    await step("void");
    return id;
  }
  await step("sent");
  if (state === "accepted" || state === "declined") await step(state);
  if (state === "superseded") {
    const { error } = await (await client("member")).rpc("sales_revise_quotation", { p_id: id });
    if (error) throw new Error(`revise: ${error.message}`);
  }
  return id;
}

async function acceptedQuote(lines: L[], discount = 0): Promise<string> {
  const id = await draftQuote(lines, discount);
  for (const status of ["sent", "accepted"]) {
    const { error } = await setQuote(id, { status });
    if (error) throw new Error(`to ${status}: ${error.message}`);
  }
  return id;
}
async function createOrder(quoteId: string, actor: Actor = "member", reason?: string) {
  return (await client(actor)).rpc("sales_create_order", { p_quotation_id: quoteId, p_override_reason: reason ?? null });
}
async function confirmedOrder(p: string, qty = 3): Promise<string> {
  const q = await acceptedQuote([{ product: p, qty, price: 100 }]);
  const { data, error } = await createOrder(q);
  if (error) throw new Error(`create order: ${error.message}`);
  return data as string;
}
async function setOrder(id: string, patch: Record<string, unknown>, actor: Actor = "member") {
  return (await client(actor)).from("sales_orders").update(patch).eq("id", id).select("id");
}
const payFields = (total: number) => ({ official_invoice_no: "INV-0001", official_invoice_date: today, paid_on: today, amount_paid: total });

// ---------------------------------------------------------------------------------

describe("stock_adjust", () => {
  it("is refused for everyone but a super_admin, and changes nothing", async () => {
    const p = await product(10);
    for (const actor of ["anon", "no_role", "contractor", "member"] as Actor[]) {
      const { error } = await (await client(actor)).rpc("stock_adjust", { p_product_id: p, p_delta: 5, p_reason: "correction" });
      expect(error, actor).not.toBeNull();
    }
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 0 });
  });

  it("records an adjustment with the actor's email and moves on-hand stock", async () => {
    const p = await product(0);
    const a = await client("super_admin");
    expect((await a.rpc("stock_adjust", { p_product_id: p, p_delta: 40, p_reason: "production", p_note: "  batch 1 " })).error).toBeNull();
    expect((await a.rpc("stock_adjust", { p_product_id: p, p_delta: -5, p_reason: "damage" })).error).toBeNull();
    expect(await level(p)).toEqual({ on_hand: 35, reserved: 0 });
    const hist = await ok("history", db.from("stock_adjustments").select("delta, reason, note, created_by_email").eq("product_id", p).order("created_at"));
    expect(hist).toEqual([
      { delta: 40, reason: "production", note: "batch 1", created_by_email: emailOf("super_admin") },
      { delta: -5, reason: "damage", note: null, created_by_email: emailOf("super_admin") },
    ]);
  });

  it("refuses zero, a drop below zero, the delivery reason, an unknown reason and an unknown product", async () => {
    const p = await product(10);
    const a = await client("super_admin");
    const bad = [
      { p_product_id: p, p_delta: 0, p_reason: "correction" },
      { p_product_id: p, p_delta: -11, p_reason: "damage" },
      { p_product_id: p, p_delta: -1, p_reason: "delivery" },
      { p_product_id: p, p_delta: 1, p_reason: "gift" },
      { p_product_id: "00000000-0000-4000-8000-00000000dead", p_delta: 1, p_reason: "correction" },
    ];
    for (const args of bad) expect((await a.rpc("stock_adjust", args)).error, JSON.stringify(args)).not.toBeNull();
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 0 });
  });

  it("a new product starts with a stock row of zero", async () => {
    const p = await product(0);
    expect(await level(p)).toEqual({ on_hand: 0, reserved: 0 });
  });
});

describe("quotation numbering and ownership", () => {
  it("assigns the number, version, draft state, customer name and author itself", async () => {
    const m = await client("member");
    const { data, error } = await m
      .from("sales_quotations")
      .insert({
        account_id: await account(), number: "Q-1999-9999", version: 9, status: "accepted",
        subtotal: 999, total: 999, account_name_snapshot: "Forged", created_by_email: "forged@test.local",
      })
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(data!.number).toMatch(new RegExp(`^Q-${year}-\\d{4}$`));
    expect(data).toMatchObject({
      version: 1, status: "draft", subtotal: 0, total: 0,
      account_name_snapshot: "[access] Sales Rules Hotel", created_by_email: emailOf("member"),
    });
  });

  it("numbers run in sequence", async () => {
    const a = await row("sales_quotations", await draftQuote([]));
    const b = await row("sales_quotations", await draftQuote([]));
    const n = (r: Record<string, unknown>) => Number(String(r.number).slice(-4));
    expect(n(b)).toBe(n(a) + 1);
  });

  it("is refused without the sales section, and allowed with a per-person grant", async () => {
    const acc = await account();
    for (const actor of ["anon", "no_role", "contractor"] as Actor[]) {
      const { error } = await (await client(actor)).from("sales_quotations").insert({ account_id: acc }).select("id");
      expect(error, actor).not.toBeNull();
    }
    const email = emailOf("contractor");
    await exec("grant", db.from("user_section_overrides").insert({ email, section: "sales", allowed: true }));
    try {
      const { error } = await (await client("contractor")).from("sales_quotations").insert({ account_id: acc }).select("id");
      expect(error).toBeNull();
    } finally {
      await db.from("user_section_overrides").delete().match({ email, section: "sales" });
    }
    const { error } = await (await client("contractor")).from("sales_quotations").insert({ account_id: acc }).select("id");
    expect(error).not.toBeNull();
  });
});

describe("quotation lines and totals", () => {
  it("prices each line to the centavo and keeps the parent's totals true", async () => {
    const p = await product(100);
    const id = await draftQuote([{ product: p, qty: 7, price: 12.5 }]);
    const m = await client("member");
    const line = await ok("line", m.from("sales_quotation_lines").select("*").eq("quotation_id", id).single());
    expect(line).toMatchObject({ line_total: 87.5 });
    expect(String(line.product_name_snapshot)).toMatch(/^\[access\] Slipper/);
    expect(await row("sales_quotations", id)).toMatchObject({ subtotal: 87.5, total: 87.5 });

    await ok("second", m.from("sales_quotation_lines").insert({ quotation_id: id, product_id: p, qty: 10, unit_price: 100 }).select("id").single());
    expect(await row("sales_quotations", id)).toMatchObject({ subtotal: 1087.5, total: 1087.5 });

    await ok("discount", m.from("sales_quotations").update({ discount_amount: 87.5 }).eq("id", id).select("id"));
    expect(await row("sales_quotations", id)).toMatchObject({ subtotal: 1087.5, discount_amount: 87.5, total: 1000 });

    await ok("edit line", m.from("sales_quotation_lines").update({ qty: 8 }).eq("id", line.id).select("id"));
    expect(await row("sales_quotations", id)).toMatchObject({ subtotal: 1100, total: 1012.5 });

    await ok("delete line", m.from("sales_quotation_lines").delete().eq("id", line.id).select("id"));
    expect(await row("sales_quotations", id)).toMatchObject({ subtotal: 1000, total: 912.5 });
  });

  it("never lets the total go below zero", async () => {
    const id = await draftQuote([{ product: await product(), qty: 1, price: 100 }], 500);
    expect(await row("sales_quotations", id)).toMatchObject({ subtotal: 100, discount_amount: 500, total: 0 });
  });

  it("ignores totals sent by the client", async () => {
    const id = await draftQuote([{ product: await product(), qty: 1, price: 100 }]);
    await setQuote(id, { subtotal: 1, total: 1, notes: "x" });
    expect(await row("sales_quotations", id)).toMatchObject({ subtotal: 100, total: 100, notes: "x" });
  });

  it("refuses a zero quantity, a negative price, and a line on someone else's draft move", async () => {
    const p = await product();
    const id = await draftQuote([]);
    const m = await client("member");
    expect((await m.from("sales_quotation_lines").insert({ quotation_id: id, product_id: p, qty: 0, unit_price: 1 })).error).not.toBeNull();
    expect((await m.from("sales_quotation_lines").insert({ quotation_id: id, product_id: p, qty: 1, unit_price: -1 })).error).not.toBeNull();
    const other = await draftQuote([{ product: p, qty: 1, price: 1 }]);
    const line = await ok("line", m.from("sales_quotation_lines").select("id").eq("quotation_id", other).single());
    const moved = await m.from("sales_quotation_lines").update({ quotation_id: id }).eq("id", line.id);
    expect(moved.error).not.toBeNull();
  });
});

describe("sending a quotation", () => {
  it("needs a line and a validity date that has not passed", async () => {
    const m = await client("member");
    const empty = await ok("empty", m.from("sales_quotations").insert({ account_id: await account(), valid_until: nextWeek }).select("id").single());
    expect((await setQuote(empty.id as string, { status: "sent" })).error?.message).toMatch(/at least one line/);

    const noDate = await ok("nodate", m.from("sales_quotations").insert({ account_id: await account() }).select("id").single());
    await exec("line", m.from("sales_quotation_lines").insert({ quotation_id: noDate.id, product_id: await product(), qty: 1, unit_price: 1 }));
    expect((await setQuote(noDate.id as string, { status: "sent" })).error?.message).toMatch(/validity date/);
    expect((await setQuote(noDate.id as string, { status: "sent", valid_until: addDays(today, -1) })).error?.message).toMatch(/validity date/);
    expect((await row("sales_quotations", noDate.id as string)).status).toBe("draft");

    expect((await setQuote(noDate.id as string, { status: "sent", valid_until: today })).error).toBeNull();
    expect((await row("sales_quotations", noDate.id as string)).sent_at).not.toBeNull();
  });

  it("locks everything once it is sent", async () => {
    const p = await product();
    const id = await quoteInState("sent", p);
    const before = await row("sales_quotations", id);
    const m = await client("member");
    for (const patch of [
      { notes: "changed" }, { discount_amount: 1 }, { valid_until: addDays(today, 30) },
      { account_id: await account() }, { number: "Q-1999-0001" }, { version: 5 }, { total: 1 },
    ]) {
      const { error } = await m.from("sales_quotations").update(patch).eq("id", id);
      // Writing the same account back is not a change; every other patch is.
      if ("account_id" in patch) continue;
      expect(error, JSON.stringify(patch)).not.toBeNull();
    }
    const line = await ok("line", m.from("sales_quotation_lines").select("id").eq("quotation_id", id).single());
    expect((await m.from("sales_quotation_lines").insert({ quotation_id: id, product_id: p, qty: 1, unit_price: 1 })).error).not.toBeNull();
    expect((await m.from("sales_quotation_lines").update({ qty: 99 }).eq("id", line.id)).error).not.toBeNull();
    expect((await m.from("sales_quotation_lines").delete().eq("id", line.id)).error).not.toBeNull();
    const after = await row("sales_quotations", id);
    delete before.updated_at; delete after.updated_at;
    expect(after).toEqual(before);
  });

  it("allows exactly the legal status changes", async () => {
    const results: string[] = [];
    for (const from of QUOTE_STATUSES) {
      for (const to of QUOTE_STATUSES) {
        if (from === to) continue;
        const id = await quoteInState(from);
        const { error } = await setQuote(id, { status: to });
        const allowed = !error;
        if (allowed !== canTransition("quotation", from, to)) results.push(`${from} -> ${to}: database ${allowed ? "allowed" : "refused"}`);
      }
    }
    expect(results).toEqual([]);
  }, 120_000);

  it("stamps the decision time when accepted or declined", async () => {
    const accepted = await quoteInState("accepted");
    const declined = await quoteInState("declined");
    expect((await row("sales_quotations", accepted)).decided_at).not.toBeNull();
    expect((await row("sales_quotations", declined)).decided_at).not.toBeNull();
  });
});

describe("revising a quotation", () => {
  it("makes the next version as a new draft and supersedes the old one", async () => {
    const p = await product();
    const old = await quoteInState("sent", p);
    const m = await client("member");
    const { data: newId, error } = await m.rpc("sales_revise_quotation", { p_id: old });
    expect(error).toBeNull();
    const a = await row("sales_quotations", old);
    const b = await row("sales_quotations", newId as string);
    expect(a.status).toBe("superseded");
    expect(b).toMatchObject({ number: a.number, version: 2, supersedes_id: old, status: "draft", valid_until: null, subtotal: 200, total: 200 });
    const lines = await ok("lines", m.from("sales_quotation_lines").select("qty, unit_price").eq("quotation_id", newId));
    expect(lines).toEqual([{ qty: 2, unit_price: 100 }]);
  });

  it("works on a declined quotation but not on a draft, an accepted one, or twice", async () => {
    const m = await client("member");
    const declined = await quoteInState("declined");
    expect((await m.rpc("sales_revise_quotation", { p_id: declined })).error).toBeNull();
    for (const state of ["draft", "accepted", "void"] as QuoteStatus[]) {
      const id = await quoteInState(state);
      expect((await m.rpc("sales_revise_quotation", { p_id: id })).error?.message, state).toMatch(/can be revised/);
    }
    expect((await m.rpc("sales_revise_quotation", { p_id: declined })).error).not.toBeNull();
  });

  it("is refused without the sales section", async () => {
    const id = await quoteInState("sent");
    for (const actor of ["anon", "no_role", "contractor"] as Actor[]) {
      expect((await (await client(actor)).rpc("sales_revise_quotation", { p_id: id })).error, actor).not.toBeNull();
    }
    expect((await row("sales_quotations", id)).status).toBe("sent");
  });
});

describe("creating an order", () => {
  it("copies the accepted quotation and reserves its stock", async () => {
    const p = await product(100);
    const q = await acceptedQuote([{ product: p, qty: 30, price: 110 }], 300);
    const { data: orderId, error } = await createOrder(q);
    expect(error).toBeNull();
    const o = await row("sales_orders", orderId as string);
    expect(o).toMatchObject({ status: "confirmed", quotation_id: q, subtotal: 3300, discount_amount: 300, total: 3000, account_name_snapshot: "[access] Sales Rules Hotel" });
    expect(String(o.number)).toMatch(new RegExp(`^SO-${year}-\\d{4}$`));
    const lines = await ok("lines", db.from("sales_order_lines").select("qty, unit_price, line_total").eq("order_id", orderId as string));
    expect(lines).toEqual([{ qty: 30, unit_price: 110, line_total: 3300 }]);
    expect(await level(p)).toEqual({ on_hand: 100, reserved: 30 });
  });

  it("refuses a quotation that is not accepted", async () => {
    for (const state of ["draft", "sent", "declined", "void"] as QuoteStatus[]) {
      const q = await quoteInState(state);
      const { error } = await createOrder(q);
      expect(error?.message, state).toMatch(/accepted/);
    }
  });

  it("returns the same order when asked twice and reserves only once", async () => {
    const p = await product(100);
    const q = await acceptedQuote([{ product: p, qty: 10, price: 100 }]);
    const a = await createOrder(q);
    const b = await createOrder(q);
    expect(a.error).toBeNull();
    expect(b.data).toBe(a.data);
    expect(await level(p)).toEqual({ on_hand: 100, reserved: 10 });
    const orders = await ok("orders", db.from("sales_orders").select("id").eq("quotation_id", q));
    expect(orders).toHaveLength(1);
  });

  it("is refused without the sales section", async () => {
    const q = await acceptedQuote([{ product: await product(10), qty: 1, price: 1 }]);
    for (const actor of ["anon", "no_role", "contractor"] as Actor[]) {
      expect((await createOrder(q, actor)).error, actor).not.toBeNull();
    }
    expect(await ok("orders", db.from("sales_orders").select("id").eq("quotation_id", q))).toHaveLength(0);
  });
});

describe("overselling", () => {
  it("refuses a member and leaves everything as it was", async () => {
    const p = await product(10);
    const q = await acceptedQuote([{ product: p, qty: 11, price: 100 }]);
    const { error } = await createOrder(q);
    expect(error?.message).toMatch(/Not enough free stock/);
    expect(await ok("orders", db.from("sales_orders").select("id").eq("quotation_id", q))).toHaveLength(0);
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 0 });
    expect((await row("sales_quotations", q)).status).toBe("accepted");
  });

  it("needs a super_admin and a reason; a member's reason is ignored", async () => {
    const p = await product(10);
    const q = await acceptedQuote([{ product: p, qty: 11, price: 100 }]);
    expect((await createOrder(q, "member", "I say so")).error?.message).toMatch(/Not enough free stock/);
    expect((await createOrder(q, "super_admin")).error?.message).toMatch(/Not enough free stock/);
    const { data, error } = await createOrder(q, "super_admin", "Production batch lands Friday");
    expect(error).toBeNull();
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 11 });
    expect((await row("sales_orders", data as string)).oversell_override_reason).toBe("Production batch lands Friday");
  });

  it("still cannot deliver stock that is not on hand", async () => {
    const p = await product(10);
    const q = await acceptedQuote([{ product: p, qty: 11, price: 100 }]);
    const { data } = await createOrder(q, "super_admin", "Batch lands Friday");
    const { error } = await setOrder(data as string, { status: "delivered" });
    expect(error?.message).toMatch(/Not enough stock on hand/);
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 11 });
  });

  it("counts reservations from earlier orders", async () => {
    const p = await product(10);
    await confirmedOrder(p, 8);
    const q = await acceptedQuote([{ product: p, qty: 3, price: 100 }]);
    expect((await createOrder(q)).error?.message).toMatch(/free 2/);
  });
});

describe("delivery, cancellation and payment", () => {
  it("delivery takes the pairs out of on-hand and reserved and writes history", async () => {
    const p = await product(50);
    const id = await confirmedOrder(p, 20);
    const { error } = await setOrder(id, { status: "delivered" });
    expect(error).toBeNull();
    expect(await level(p)).toEqual({ on_hand: 30, reserved: 0 });
    expect((await row("sales_orders", id)).delivered_on).toBe(today);
    const hist = await ok("history", db.from("stock_adjustments").select("delta, reason, sales_order_id").eq("product_id", p).eq("reason", "delivery"));
    expect(hist).toEqual([{ delta: -20, reason: "delivery", sales_order_id: id }]);
  });

  it("refuses a delivery date in the future", async () => {
    const p = await product(5);
    const id = await confirmedOrder(p, 1);
    const { error } = await setOrder(id, { status: "delivered", delivered_on: addDays(today, 3) });
    expect(error?.message).toMatch(/future/);
    expect(await level(p)).toEqual({ on_hand: 5, reserved: 1 });
  });

  it("only a super_admin can cancel, and cancelling releases the reservation", async () => {
    const p = await product(10);
    const q = await acceptedQuote([{ product: p, qty: 4, price: 100 }]);
    const id = (await createOrder(q)).data as string;
    expect((await setOrder(id, { status: "cancelled" }, "member")).error?.message).toMatch(/super_admin/);
    expect((await row("sales_orders", id)).status).toBe("confirmed");
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 4 });

    expect((await setOrder(id, { status: "cancelled" }, "super_admin")).error).toBeNull();
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 0 });

    // The quotation can become a new order once the first is cancelled.
    const again = await createOrder(q);
    expect(again.error).toBeNull();
    expect(again.data).not.toBe(id);
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 4 });
  });

  it("a delivered order cannot be cancelled", async () => {
    const p = await product(10);
    const id = await confirmedOrder(p, 2);
    await setOrder(id, { status: "delivered" });
    expect((await setOrder(id, { status: "cancelled" }, "super_admin")).error).not.toBeNull();
    expect(await level(p)).toEqual({ on_hand: 8, reserved: 0 });
  });

  it("is paid only with an invoice number, a payment date and the full amount", async () => {
    const p = await product(10);
    const id = await confirmedOrder(p, 2);
    await setOrder(id, { status: "delivered" });
    const total = Number((await row("sales_orders", id)).total);
    expect(total).toBe(200);

    expect((await setOrder(id, { status: "paid" })).error?.message).toMatch(/invoice number/);
    expect((await setOrder(id, { status: "paid", official_invoice_no: "INV-1" })).error?.message).toMatch(/payment date/);
    expect((await setOrder(id, { status: "paid", ...payFields(total - 0.01) })).error?.message).toMatch(/order total/);
    expect((await row("sales_orders", id)).status).toBe("delivered");

    expect((await setOrder(id, { status: "paid", ...payFields(total) })).error).toBeNull();
    expect(await row("sales_orders", id)).toMatchObject({ status: "paid", official_invoice_no: "INV-0001" });
  });

  it("paid and cancelled orders cannot be changed at all", async () => {
    const p = await product(10);
    const paid = await confirmedOrder(p, 1);
    await setOrder(paid, { status: "delivered" });
    await setOrder(paid, { status: "paid", ...payFields(100) });
    const cancelled = await confirmedOrder(p, 1);
    await setOrder(cancelled, { status: "cancelled" }, "super_admin");
    for (const id of [paid, cancelled]) {
      for (const actor of ["member", "super_admin"] as Actor[]) {
        const { error } = await setOrder(id, { notes: "late edit" }, actor);
        expect(error?.message, `${id} ${actor}`).toMatch(/cannot be changed/);
      }
    }
  });

  it("locks amounts, customer and lines once confirmed", async () => {
    const p = await product(10);
    const id = await confirmedOrder(p, 2);
    const m = await client("member");
    for (const patch of [{ total: 1 }, { discount_amount: 5 }, { subtotal: 1 }, { account_id: await account() }, { quotation_id: null }, { number: "SO-1999-0001" }]) {
      if ("account_id" in patch) continue; // same value written back is not a change
      expect((await m.from("sales_orders").update(patch).eq("id", id)).error, JSON.stringify(patch)).not.toBeNull();
    }
    const line = await ok("line", m.from("sales_order_lines").select("id").eq("order_id", id).single());
    expect((await m.from("sales_order_lines").insert({ order_id: id, product_id: p, qty: 1, unit_price: 1 })).error).not.toBeNull();
    expect((await m.from("sales_order_lines").update({ qty: 9 }).eq("id", line.id)).error).not.toBeNull();
    expect((await m.from("sales_order_lines").delete().eq("id", line.id)).error).not.toBeNull();
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 2 });
  });
});

describe("orders without a quotation, and forged values", () => {
  it("a direct draft order takes lines, then confirms and reserves", async () => {
    const p = await product(10);
    const m = await client("member");
    const o = await ok("order", m.from("sales_orders").insert({ account_id: await account() }).select("id").single());
    const id = o.id as string;
    expect((await setOrder(id, { status: "confirmed" })).error?.message).toMatch(/at least one line/);
    await exec("line", m.from("sales_order_lines").insert({ order_id: id, product_id: p, qty: 3, unit_price: 50 }));
    expect(await row("sales_orders", id)).toMatchObject({ subtotal: 150, total: 150, status: "draft" });
    expect((await setOrder(id, { status: "confirmed" })).error).toBeNull();
    expect(await level(p)).toEqual({ on_hand: 10, reserved: 3 });
  });

  it("starts as a draft whatever the client sends", async () => {
    const m = await client("member");
    const { data, error } = await m.from("sales_orders").insert({
      account_id: await account(), status: "paid", amount_paid: 999, official_invoice_no: "FORGED",
      paid_on: today, delivered_on: today, total: 999, oversell_override_reason: "forged", created_by_email: "forged@test.local",
    }).select("*").single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      status: "draft", amount_paid: 0, official_invoice_no: null, paid_on: null, delivered_on: null,
      total: 0, oversell_override_reason: null, created_by_email: emailOf("member"),
    });
  });

  it("takes the customer and discount from the quotation, not the client", async () => {
    const q = await acceptedQuote([{ product: await product(5), qty: 1, price: 100 }], 10);
    const other = await ok("acc", db.from("crm_accounts").insert({ name: `[access] Other ${uniq()}` }).select("id").single());
    const m = await client("member");
    const { data, error } = await m.from("sales_orders").insert({ quotation_id: q, account_id: other.id, discount_amount: 0 }).select("*").single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ account_id: await account(), discount_amount: 10 });
  });

  it("refuses a direct order against a quotation that is not accepted", async () => {
    const q = await quoteInState("sent");
    const { error } = await (await client("member")).from("sales_orders").insert({ account_id: await account(), quotation_id: q });
    expect(error?.message).toMatch(/accepted/);
  });

  it("allows exactly the legal order status changes (as a super_admin)", async () => {
    async function orderIn(state: OrderStatus): Promise<string> {
      const p = await product(1000);
      if (state === "draft") {
        const m = await client("member");
        const o = await ok("order", m.from("sales_orders").insert({ account_id: await account() }).select("id").single());
        await exec("line", m.from("sales_order_lines").insert({ order_id: o.id, product_id: p, qty: 1, unit_price: 100 }));
        return o.id as string;
      }
      const id = await confirmedOrder(p, 1);
      if (state === "confirmed") return id;
      if (state === "cancelled") {
        await setOrder(id, { status: "cancelled" }, "super_admin");
        return id;
      }
      await setOrder(id, { status: "delivered" });
      if (state === "paid") await setOrder(id, { status: "paid", ...payFields(100) });
      return id;
    }
    const wrong: string[] = [];
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (from === to) continue;
        const id = await orderIn(from);
        const patch = to === "paid" ? { status: to, ...payFields(100) } : { status: to };
        const { error } = await setOrder(id, patch, "super_admin");
        if (!error !== canTransition("order", from, to)) wrong.push(`${from} -> ${to}: database ${error ? "refused" : "allowed"}`);
      }
    }
    expect(wrong).toEqual([]);
  }, 180_000);
});

describe("internal functions", () => {
  it("cannot be called by anyone through the API", async () => {
    for (const actor of ACTORS) {
      const c = await client(actor);
      expect((await c.rpc("sales_next_number", { p_kind: "quotation" })).error, `next_number ${actor}`).not.toBeNull();
      expect((await c.rpc("set_row_audit")).error, `set_row_audit ${actor}`).not.toBeNull();
    }
  });
});
