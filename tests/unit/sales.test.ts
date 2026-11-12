import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANUAL_STOCK_REASONS,
  NOT_AN_INVOICE_LINE,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  QUOTE_TRANSITIONS,
  STOCK_REASONS,
  STOCK_REASON_LABELS,
  availableToSell,
  canTransition,
  documentTotals,
  isExpired,
  lineTotal,
  orderActions,
  paymentProblem,
  quoteActions,
  stockShortages,
  suggestedUnitPrice,
  type OrderStatus,
  type QuoteStatus,
} from "@/lib/sales";

const migration = (name: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", name), "utf8");

/** The values in `check (<column> in ('a','b',...))` that follows `column text`. */
function checkList(sql: string, column: string): string[] {
  const m = sql.match(new RegExp(`${column} text[^;]*?check \\(${column} in \\(([^)]*)\\)\\)`, "s"));
  if (!m) throw new Error(`no CHECK list for ${column}`);
  return m[1].split(",").map((v) => v.trim().replace(/'/g, ""));
}

describe("vocabularies mirror the migrations", () => {
  it("quotation statuses", () => {
    expect(checkList(migration("0016_sales_quotations.sql"), "status")).toEqual([...QUOTE_STATUSES]);
    expect(Object.keys(QUOTE_STATUS_LABELS).sort()).toEqual([...QUOTE_STATUSES].sort());
  });
  it("order statuses", () => {
    expect(checkList(migration("0017_sales_orders.sql"), "status")).toEqual([...ORDER_STATUSES]);
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual([...ORDER_STATUSES].sort());
  });
  it("stock reasons", () => {
    expect(checkList(migration("0015_sales_catalog_stock.sql"), "reason")).toEqual([...STOCK_REASONS]);
    expect(Object.keys(STOCK_REASON_LABELS).sort()).toEqual([...STOCK_REASONS].sort());
  });
  it("manual stock reasons are the ones stock_adjust() accepts", () => {
    const sql = migration("0015_sales_catalog_stock.sql");
    const fn = sql.match(/p_reason not in \(([^)]*)\)/);
    expect(fn).not.toBeNull();
    const accepted = fn![1].split(",").map((v) => v.trim().replace(/'/g, ""));
    expect(accepted).toEqual([...MANUAL_STOCK_REASONS]);
    expect(MANUAL_STOCK_REASONS).not.toContain("delivery");
  });
  it("transition tables only name known statuses", () => {
    for (const [from, tos] of Object.entries(QUOTE_TRANSITIONS)) {
      expect(QUOTE_STATUSES).toContain(from);
      tos.forEach((t) => expect(QUOTE_STATUSES).toContain(t));
    }
    for (const [from, tos] of Object.entries(ORDER_TRANSITIONS)) {
      expect(ORDER_STATUSES).toContain(from);
      tos.forEach((t) => expect(ORDER_STATUSES).toContain(t));
    }
  });
  it("final statuses have no way out", () => {
    for (const s of ["accepted", "superseded", "void"] as const) expect(QUOTE_TRANSITIONS[s]).toEqual([]);
    for (const s of ["paid", "cancelled"] as const) expect(ORDER_TRANSITIONS[s]).toEqual([]);
  });
});

describe("canTransition", () => {
  it("allows the documented moves and nothing else", () => {
    const allowedQuotes = QUOTE_STATUSES.flatMap((a) => QUOTE_STATUSES.map((b) => [a, b] as const)).filter(([a, b]) =>
      canTransition("quotation", a, b),
    );
    expect(allowedQuotes).toEqual([
      ["draft", "sent"],
      ["draft", "void"],
      ["sent", "accepted"],
      ["sent", "declined"],
      ["sent", "superseded"],
      ["declined", "superseded"],
    ]);
    const allowedOrders = ORDER_STATUSES.flatMap((a) => ORDER_STATUSES.map((b) => [a, b] as const)).filter(([a, b]) =>
      canTransition("order", a, b),
    );
    expect(allowedOrders).toEqual([
      ["draft", "confirmed"],
      ["draft", "cancelled"],
      ["confirmed", "delivered"],
      ["confirmed", "cancelled"],
      ["delivered", "paid"],
    ]);
  });
  it("never allows staying in the same status as a transition", () => {
    for (const s of QUOTE_STATUSES) expect(canTransition("quotation", s, s)).toBe(false);
    for (const s of ORDER_STATUSES) expect(canTransition("order", s, s)).toBe(false);
  });
  it("refuses an unknown status instead of throwing", () => {
    expect(canTransition("quotation", "nope" as QuoteStatus, "sent")).toBe(false);
    expect(canTransition("order", "nope" as OrderStatus, "paid")).toBe(false);
  });
});

describe("isExpired", () => {
  const today = "2026-11-12";
  it("is true only for a sent quotation past its date", () => {
    expect(isExpired({ status: "sent", valid_until: "2026-11-11" }, today)).toBe(true);
    expect(isExpired({ status: "sent", valid_until: today }, today)).toBe(false);
    expect(isExpired({ status: "sent", valid_until: "2026-12-01" }, today)).toBe(false);
    expect(isExpired({ status: "sent", valid_until: null }, today)).toBe(false);
    expect(isExpired({ status: "accepted", valid_until: "2020-01-01" }, today)).toBe(false);
    expect(isExpired({ status: "draft", valid_until: "2020-01-01" }, today)).toBe(false);
  });
});

describe("money", () => {
  it("rounds a line to the centavo", () => {
    expect(lineTotal(7, 12.5)).toBe(87.5);
    expect(lineTotal(3, 33.335)).toBe(100.01);
    expect(lineTotal(1, 0.005)).toBe(0.01);
  });
  it("treats bad numbers as zero", () => {
    expect(lineTotal(Number.NaN, 10)).toBe(0);
    expect(lineTotal(5, Number.POSITIVE_INFINITY)).toBe(0);
    expect(lineTotal(-2, 10)).toBe(0);
    expect(lineTotal(2, -10)).toBe(0);
  });
  it("totals lines and applies the discount", () => {
    const lines = [
      { qty: 300, unit_price: 125 },
      { qty: 100, unit_price: 140.5 },
    ];
    expect(documentTotals(lines, 1500)).toEqual({ subtotal: 51550, discount: 1500, total: 50050 });
  });
  it("never lets the total go negative, and ignores a negative or missing discount", () => {
    expect(documentTotals([{ qty: 1, unit_price: 100 }], 500).total).toBe(0);
    expect(documentTotals([{ qty: 1, unit_price: 100 }], -50)).toEqual({ subtotal: 100, discount: 0, total: 100 });
    expect(documentTotals([], 0)).toEqual({ subtotal: 0, discount: 0, total: 0 });
    expect(documentTotals([{ qty: 1, unit_price: 100 }], Number.NaN).total).toBe(100);
  });
});

describe("suggestedUnitPrice", () => {
  const tiers = [
    { minQty: 50, unitPrice: 140 },
    { minQty: 200, unitPrice: 125 },
  ];
  it("uses the tier for the quantity, or null below the minimum", () => {
    expect(suggestedUnitPrice(tiers, 300)).toBe(125);
    expect(suggestedUnitPrice(tiers, 50)).toBe(140);
    expect(suggestedUnitPrice(tiers, 49)).toBeNull();
    expect(suggestedUnitPrice([], 100)).toBeNull();
  });
});

describe("stock", () => {
  it("free stock is on hand minus reserved", () => {
    expect(availableToSell({ on_hand: 500, reserved: 120 })).toBe(380);
    expect(availableToSell({ on_hand: 10, reserved: 25 })).toBe(-15);
    expect(availableToSell({ on_hand: Number.NaN, reserved: 5 })).toBe(-5);
  });
  it("finds products an order needs more of than is free, adding lines together", () => {
    const levels = {
      a: { on_hand: 100, reserved: 40 },
      b: { on_hand: 10, reserved: 0 },
      c: { on_hand: 5, reserved: 9 },
    };
    const lines = [
      { product_id: "a", qty: 30 },
      { product_id: "a", qty: 40 },
      { product_id: "b", qty: 10 },
      { product_id: "c", qty: 1 },
      { product_id: "ghost", qty: 3 },
    ];
    expect(stockShortages(lines, levels)).toEqual([
      { product_id: "a", need: 70, free: 60 },
      { product_id: "c", need: 1, free: 0 },
      { product_id: "ghost", need: 3, free: 0 },
    ]);
  });
  it("reports nothing when everything is in stock, or for no lines", () => {
    expect(stockShortages([{ product_id: "a", qty: 60 }], { a: { on_hand: 100, reserved: 40 } })).toEqual([]);
    expect(stockShortages([], {})).toEqual([]);
    expect(stockShortages([{ product_id: "a", qty: Number.NaN }], { a: { on_hand: 0, reserved: 0 } })).toEqual([]);
  });
});

describe("quoteActions", () => {
  const today = "2026-11-12";
  it("offers the right buttons for each status", () => {
    expect(quoteActions({ status: "draft", valid_until: null }, today)).toEqual(["edit", "send", "void"]);
    expect(quoteActions({ status: "sent", valid_until: "2026-12-01" }, today)).toEqual([
      "accept", "decline", "revise", "print",
    ]);
    expect(quoteActions({ status: "declined", valid_until: "2026-12-01" }, today)).toEqual(["revise", "print"]);
    expect(quoteActions({ status: "superseded", valid_until: null }, today)).toEqual(["print"]);
    expect(quoteActions({ status: "void", valid_until: null }, today)).toEqual(["print"]);
  });
  it("only lets an expired quotation be revised", () => {
    expect(quoteActions({ status: "sent", valid_until: "2026-11-01" }, today)).toEqual(["revise", "print"]);
  });
  it("offers an order once, and not when a live order exists", () => {
    expect(quoteActions({ status: "accepted", valid_until: null }, today)).toEqual(["create_order", "print"]);
    expect(quoteActions({ status: "accepted", valid_until: null, hasLiveOrder: true }, today)).toEqual(["print"]);
  });
});

describe("orderActions", () => {
  it("lets only a super_admin cancel", () => {
    expect(orderActions("confirmed", "super_admin")).toEqual(["deliver", "cancel", "print"]);
    expect(orderActions("confirmed", "member")).toEqual(["deliver", "print"]);
    expect(orderActions("confirmed", null)).toEqual(["deliver", "print"]);
    expect(orderActions("draft", "super_admin")).toEqual(["cancel"]);
    expect(orderActions("draft", "member")).toEqual([]);
  });
  it("records payment after delivery, and only prints once final", () => {
    expect(orderActions("delivered", "member")).toEqual(["record_payment", "print"]);
    expect(orderActions("paid", "super_admin")).toEqual(["print"]);
    expect(orderActions("cancelled", "super_admin")).toEqual(["print"]);
  });
});

describe("paymentProblem", () => {
  const ok = { official_invoice_no: "0001234", paid_on: "2026-11-20", amount_paid: 50000, total: 50000 };
  it("is null when everything is recorded", () => {
    expect(paymentProblem(ok)).toBeNull();
    expect(paymentProblem({ ...ok, amount_paid: 51000 })).toBeNull();
  });
  it("names the first thing missing", () => {
    expect(paymentProblem({ ...ok, official_invoice_no: null })).toMatch(/invoice number/);
    expect(paymentProblem({ ...ok, official_invoice_no: "   " })).toMatch(/invoice number/);
    expect(paymentProblem({ ...ok, paid_on: null })).toMatch(/payment date/);
    expect(paymentProblem({ ...ok, amount_paid: 49999.99 })).toMatch(/at least the order total/);
    expect(paymentProblem({ ...ok, amount_paid: Number.NaN })).toMatch(/at least the order total/);
  });
});

describe("documents are never called invoices", () => {
  it("the printed line says so", () => {
    expect(NOT_AN_INVOICE_LINE).toMatch(/not an official receipt or invoice/i);
  });
});
