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

// --- Row shapes the screens read (columns of 0015–0017) -------------------------------

export type PriceTierRow = { id: string; min_qty: number; unit_price: number };

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  description: string | null;
  is_active: boolean;
  sales_price_tiers?: PriceTierRow[];
};

export type QuoteRow = {
  id: string;
  number: string;
  version: number;
  supersedes_id: string | null;
  account_id: string;
  lead_id: string | null;
  account_name_snapshot: string;
  contact_name: string | null;
  status: QuoteStatus;
  valid_until: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  lead_time_days: number | null;
  notes: string | null;
  tax_note: string | null;
  discount_amount: number;
  subtotal: number;
  total: number;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
  created_by_email: string;
};

export type DocLineRow = {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  qty: number;
  unit_price: number;
  line_total: number;
  position: number;
};

export type OrderRow = {
  id: string;
  number: string;
  quotation_id: string | null;
  account_id: string;
  account_name_snapshot: string;
  status: OrderStatus;
  customer_po_no: string | null;
  delivery_due_on: string | null;
  delivered_on: string | null;
  official_invoice_no: string | null;
  official_invoice_date: string | null;
  amount_paid: number;
  paid_on: string | null;
  tax_note: string | null;
  discount_amount: number;
  subtotal: number;
  total: number;
  notes: string | null;
  oversell_override_reason: string | null;
  created_at: string;
  created_by_email: string;
};

export type StockRow = { product_id: string; on_hand: number; reserved: number };

export const QUOTE_COLUMNS =
  "id, number, version, supersedes_id, account_id, lead_id, account_name_snapshot, contact_name, status, valid_until, payment_terms, delivery_terms, lead_time_days, notes, tax_note, discount_amount, subtotal, total, sent_at, decided_at, created_at, created_by_email";
export const ORDER_COLUMNS =
  "id, number, quotation_id, account_id, account_name_snapshot, status, customer_po_no, delivery_due_on, delivered_on, official_invoice_no, official_invoice_date, amount_paid, paid_on, tax_note, discount_amount, subtotal, total, notes, oversell_override_reason, created_at, created_by_email";
export const LINE_COLUMNS = "id, product_id, product_name_snapshot, qty, unit_price, line_total, position";
