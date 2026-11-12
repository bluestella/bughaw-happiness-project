# 0001 — Official BIR invoicing is deferred

**Date:** 2026-11-12 · **Status:** accepted by the owner · **Revisit:** after the accountant answers

## Decision

Bughaw Suite does not issue official BIR invoices or receipts. It issues internal
sales documents (quotation, sales order, billing statement). The official invoice
comes from the BIR-authorised booklet; its number and date are recorded on the
sales order.

## Why

- An invoicing system must be registered with the BIR before it is used.
- The e-invoicing mandate (deadline Dec 31, 2026) may cover businesses that use
  invoicing software. Guides disagree on this, and micro taxpayers are exempt.
- Bughaw's registration status, VAT status and size class were not known when this
  was decided.

## Consequences

- Every printed sales document carries the line "This is not an official receipt or
  invoice."
- No table, column, route or label uses the word "invoice" for an in-app document.
  The one exception is `official_invoice_no` / `official_invoice_date` on the order,
  which record the booklet invoice.

## What reopens this

The accountant confirms all of: Bughaw's registration and size class, that in-app
issuing would not bring it under the e-invoicing mandate (or that the mandate is
acceptable), and the yearly effort to keep a registered system.
