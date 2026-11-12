# Spec — Products, stock, quotations and sales orders

**Wave:** 1 · **Migrations:** 0014, 0016, 0017, 0018 · **Section:** `sales` · **Status:** draft for owner review
Follows [standards/database.md](../standards/database.md),
[decision 0001](../standards/decisions/0001-official-invoicing-deferred.md) and
[decision 0002](../standards/decisions/0002-one-customer-record.md).

## Why

The first batch is ready to sell. A buyer's purchasing department needs a formal
quotation; the team needs to know what is promised, delivered and paid.

## Flow

```
CRM lead ──▶ Quotation (draft ▶ sent ▶ accepted | declined | expired)
                              │ accepted
                              ▼
                        Sales order (confirmed ▶ delivered ▶ paid | cancelled)
                              │ confirmed: reserves stock
                              │ delivered: reduces stock on hand
                              │ official invoice number recorded by hand
```

## User stories

1. As a seller, I build a quotation for a CRM account from the product list, with
   the price tier chosen by quantity.
2. As a seller, I print or save the quotation as PDF from the browser and mark it sent.
3. As a seller, I turn an accepted quotation into a sales order in one step.
4. As the owner, I see how many pairs are on hand, reserved and free to sell.
5. As a seller, I record delivery, the booklet invoice number and payment.
6. As the owner, I cannot oversell: an order that exceeds free stock is refused
   unless I override it.

## Data

**`sales_products`** — the catalogue (super_admin edits).
`sku` (unique), `name`, `unit` (default `'pair'`), `description`, `is_active`.

**`sales_price_tiers`** — one row per product per quantity break.
`product_id`, `min_qty` (>= 1), `unit_price` numeric(14,2). Unique `(product_id, min_qty)`.
The price for a quantity is the tier with the highest `min_qty <= qty`.

**`stock_levels`** — one row per product.
`product_id` (unique), `on_hand` integer >= 0, `reserved` integer >= 0, `check (reserved <= on_hand)` unless overridden.

**`stock_adjustments`** — append-only history.
`product_id`, `delta` integer, `reason` (`'opening_count','production','delivery','damage','correction'`), `note`, `sales_order_id` nullable. Stock changes only through a function that writes both tables in one transaction.

**`sales_quotations`**
`number` (`Q-YYYY-NNNN`), `version` (default 1), `supersedes_id` nullable, `account_id` → `crm_accounts` restrict, `lead_id` → `crm_leads` set null, `contact_name`, `account_name_snapshot`, `status`, `valid_until` date, `payment_terms`, `delivery_terms`, `lead_time_days`, `notes`, `subtotal`, `discount_amount`, `total`, `sent_at`, `decided_at`.

**`sales_quotation_lines`**
`quotation_id` cascade, `product_id` restrict, `product_name_snapshot`, `qty`, `unit_price`, `line_total`, `position`.

**`sales_orders`**
`number` (`SO-YYYY-NNNN`), `quotation_id` restrict (nullable for direct orders), `account_id` restrict, `status`, `customer_po_no`, `delivery_due_on`, `delivered_on`, `official_invoice_no`, `official_invoice_date`, `amount_paid` numeric(14,2), `paid_on`, `total`, `notes`.

**`sales_order_lines`** — same shape as quotation lines.

Tax: totals carry no VAT line in Wave 1, because Bughaw's VAT status is unknown.
A `tax_note` free-text field prints on the document. Revisit with decision 0001.

## Rules enforced in the database

- Numbers are assigned by a function on insert; clients cannot set them.
- A quotation's lines and totals are frozen once status leaves `draft`. Revising
  creates version N+1 with `supersedes_id`, and marks the old one `superseded`.
- Totals are recomputed by trigger from the lines; a client-supplied total is ignored.
- Legal transitions only (see flow). `expired` is set by reading `valid_until`, not
  by a scheduled job: a sent quotation past its date is shown and treated as expired.
- Creating an order reserves stock; cancelling releases it; delivering reduces
  `on_hand` and `reserved` together.
- Marking an order `paid` requires `official_invoice_no`.

## Access

| | super_admin | has `sales` | no `sales` |
|---|---|---|---|
| Read products, stock, quotations, orders | ✅ | ✅ | ❌ |
| Create and edit draft quotations, create orders | ✅ | ✅ | ❌ |
| Edit products and price tiers | ✅ | ❌ | ❌ |
| Adjust stock, override overselling | ✅ | ❌ | ❌ |
| Cancel an order | ✅ | ❌ | ❌ |
| Delete anything | ❌ (cancel instead) | ❌ | ❌ |

Role defaults for `sales`: member allowed, contractor denied.

## Pure logic (`src/lib/sales.ts`, unit-tested)

- `priceForQty(tiers, qty)` — highest matching tier; `null` when none applies
- `quoteTotals(lines, discount)` — 0 for empty input; never negative, `NaN` or `Infinity`
- `availableToSell(level)` — `on_hand - reserved`
- `canTransition(kind, from, to)` — mirrors the trigger
- `isExpired(quotation, today)`

## Screens

- `/sales/quotes` list and editor; `/sales/quotes/[id]/print`
- `/sales/orders` list and detail; `/sales/orders/[id]/print`
- `/sales/stock` levels and adjustment history
- `/sales/products` (super_admin)
- "New quotation" button on the CRM lead panel, prefilled with account and contact

Print pages use a print stylesheet (no PDF library). Each carries the company
header, document number, and the line "This is not an official receipt or invoice."

## Acceptance

- [ ] Quote for 500 pairs picks the 500-pair tier; changing to 499 picks the lower tier.
- [ ] A sent quotation cannot be edited through the API (database refuses).
- [ ] Converting an accepted quotation creates an order and reserves stock once,
      even if the button is pressed twice.
- [ ] An order beyond free stock is refused for a member and allowed for a
      super_admin with an override reason.
- [ ] Delivering reduces on-hand and reserved by the ordered quantity and writes an adjustment row.
- [ ] A member cannot change a price tier; a contractor cannot read any sales table (access tests).
- [ ] Printed quotation fits one A4 page for up to 10 lines.

## Needs from the owner before build

Products and SKUs, price tiers, minimum order, lead time, payment and delivery
terms, opening stock count, and the company details for the document header.
