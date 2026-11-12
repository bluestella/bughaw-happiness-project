# 0002 — The CRM account is the one customer record

**Date:** 2026-11-12 · **Status:** accepted by the owner, 2026-11-12

## Decision

`crm_accounts` is the customer for quotations, sales orders and the Pipeline tool.
`pipeline_accounts` stays as the Pipeline tool's simulation data, and gains a
nullable `crm_account_id` foreign key. "Promote to pipeline" sets that link. Sales
tables reference `crm_accounts` only.

## Why

Two customer lists already exist. Orders hung off the wrong one would have to be
moved later, and whoever sends a quote would not know which record is current.

## Consequences

- Migration 0014 adds the link and backfills it where names match exactly
  (case-insensitive). Unmatched pipeline rows stay unlinked and are listed for the
  owner to resolve by hand; nothing is merged or deleted automatically.
- A buyer segment column on `crm_accounts` covers hotels, resorts, spas and other
  businesses.
- The Pipeline tool keeps working unchanged for unlinked rows.

## Open

Whether the Pipeline tool should eventually read CRM data directly and drop its own
table. Not needed for Wave 1.
