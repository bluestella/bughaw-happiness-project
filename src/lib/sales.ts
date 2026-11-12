// Sales: quotations, orders and stock — pure helpers (docs/specs/sales-quotes-orders-stock.md).
//
// MIRRORS supabase/migrations/0015–0017. The database is the boundary: these
// helpers only decide which buttons to offer and show totals while someone types.
// tests/unit/sales.test.ts compares the vocabularies with the migrations, and
// tests/integration/access/sales-rules.itest.ts checks every status transition
// against the real triggers.
//
// These are INTERNAL documents, not official invoices or receipts
// (docs/standards/decisions/0001-official-invoicing-deferred.md).

import { priceForQty, type PriceTier } from "@/lib/pricing";
import type { Role } from "@/lib/permissions";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "superseded", "void"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const ORDER_STATUSES = ["draft", "confirmed", "delivered", "paid", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Reasons recorded in stock_adjustments. People may enter all but 'delivery'. */
export const STOCK_REASONS = ["opening_count", "production", "delivery", "damage", "correction"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];
export const MANUAL_STOCK_REASONS = STOCK_REASONS.filter((r) => r !== "delivery");

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  superseded: "Superseded",
  void: "Void",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  delivered: "Delivered",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  opening_count: "Opening count",
  production: "Production",
  delivery: "Delivery",
  damage: "Damage",
  correction: "Correction",
};

/** Printed on every sales document until the BIR decision is revisited. */
export const NOT_AN_INVOICE_LINE = "This is not an official receipt or invoice.";

// --- Status transitions ---------------------------------------------------------

export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["sent", "void"],
  sent: ["accepted", "declined", "superseded"],
  accepted: [],
  declined: ["superseded"],
  superseded: [],
  void: [],
};

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: ["paid"],
  paid: [],
  cancelled: [],
};

export function canTransition(kind: "quotation", from: QuoteStatus, to: QuoteStatus): boolean;
export function canTransition(kind: "order", from: OrderStatus, to: OrderStatus): boolean;
export function canTransition(kind: "quotation" | "order", from: string, to: string): boolean {
  const table: Record<string, readonly string[]> = kind === "quotation" ? QUOTE_TRANSITIONS : ORDER_TRANSITIONS;
  return (table[from] ?? []).includes(to);
}

/** A sent quotation whose validity date has passed. Expiry is read, never stored. */
export function isExpired(q: { status: string; valid_until: string | null }, today: string): boolean {
  return q.status === "sent" && !!q.valid_until && q.valid_until < today;
}

// --- Money ------------------------------------------------------------------------

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
const cents = (v: number): number => Math.round((finite(v) + Number.EPSILON) * 100) / 100;

/** qty × unit price, to the centavo — the same rule as the database trigger. */
export function lineTotal(qty: number, unitPrice: number): number {
  return cents(Math.max(0, finite(qty)) * Math.max(0, finite(unitPrice)));
}

export type MoneyLine = { qty: number; unit_price: number };

/** Subtotal, discount and total. The total is never below zero. */
export function documentTotals(lines: MoneyLine[], discount: number) {
  const subtotal = cents(lines.reduce((sum, l) => sum + lineTotal(l.qty, l.unit_price), 0));
  const applied = Math.max(0, cents(discount));
  return { subtotal, discount: applied, total: Math.max(0, cents(subtotal - applied)) };
}

// --- Prices -----------------------------------------------------------------------

/** The catalogue price for a quantity, or null when the quantity is below every tier. */
export function suggestedUnitPrice(tiers: PriceTier[], qty: number): number | null {
  return priceForQty(tiers, qty)?.tier.unitPrice ?? null;
}

// --- Stock ------------------------------------------------------------------------

export type StockLevel = { on_hand: number; reserved: number };

/** On hand minus reserved. Negative only after a super_admin overrode a shortage. */
export function availableToSell(level: StockLevel): number {
  return finite(level.on_hand) - finite(level.reserved);
}

export type Shortage = { product_id: string; need: number; free: number };

/**
 * Products an order needs more of than is free. Quantities for the same product
 * are added together first, as the database does.
 */
export function stockShortages(
  lines: { product_id: string; qty: number }[],
  levels: Record<string, StockLevel | undefined>,
): Shortage[] {
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.product_id, (need.get(l.product_id) ?? 0) + Math.max(0, finite(l.qty)));
  const out: Shortage[] = [];
  for (const [product_id, qty] of Array.from(need.entries())) {
    const level = levels[product_id];
    const free = level ? Math.max(0, availableToSell(level)) : 0;
    if (qty > free) out.push({ product_id, need: qty, free });
  }
  return out;
}

// --- Which buttons to offer ---------------------------------------------------------

export type QuoteAction = "edit" | "send" | "void" | "accept" | "decline" | "revise" | "create_order" | "print";

export function quoteActions(
  q: { status: QuoteStatus; valid_until: string | null; hasLiveOrder?: boolean },
  today: string,
): QuoteAction[] {
  const expired = isExpired(q, today);
  switch (q.status) {
    case "draft":
      return ["edit", "send", "void"];
    case "sent":
      // An expired quotation can only be revised with a new date.
      return expired ? ["revise", "print"] : ["accept", "decline", "revise", "print"];
    case "accepted":
      return q.hasLiveOrder ? ["print"] : ["create_order", "print"];
    case "declined":
      return ["revise", "print"];
    default:
      return ["print"];
  }
}

export type OrderAction = "deliver" | "cancel" | "record_payment" | "print";

export function orderActions(status: OrderStatus, role: Role | null): OrderAction[] {
  const canCancel = role === "super_admin";
  switch (status) {
    case "confirmed":
      return canCancel ? ["deliver", "cancel", "print"] : ["deliver", "print"];
    case "delivered":
      return ["record_payment", "print"];
    case "draft":
      return canCancel ? ["cancel"] : [];
    default:
      return ["print"];
  }
}

/** Why an order cannot be marked paid yet, or null when it can. Mirrors the trigger. */
export function paymentProblem(o: {
  official_invoice_no: string | null;
  paid_on: string | null;
  amount_paid: number;
  total: number;
}): string | null {
  if (!o.official_invoice_no?.trim()) return "Record the official invoice number first.";
  if (!o.paid_on) return "Record the payment date.";
  if (!(finite(o.amount_paid) >= finite(o.total))) return "The amount paid must be at least the order total.";
  return null;
}
