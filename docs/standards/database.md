# Database standards

> The rules every new table, column, function and migration follows from 0014 on.
> Existing tables (0001–0013) are not rewritten to match; they are brought in line
> only when a migration touches them for another reason.
> Schema reference: [../database.md](../database.md). Security rules: [../security.md](../security.md).

## 1. Names

- `snake_case` everywhere. Tables are plural nouns.
- Tables carry a domain prefix:

| Prefix | Domain | Section key |
|---|---|---|
| `crm_` | Leads, accounts, contacts | `crm` |
| `sales_` | Products, price tiers, quotations, orders | `sales` |
| `stock_` | Stock levels and adjustments | `sales` |
| `people_` | Intern profiles, logs, reports, evaluations | `people` |
| `prod_` | Materials, batches, experiments, quality checks (Wave 2) | `production` |
| `fin_` | Expenses, cash, budgets (Wave 2) | `finance` |

- Foreign keys are `<singular>_id`. Booleans read as a statement: `is_active`, `has_sample`.
- Timestamps end in `_at`, dates in `_on` or `_date`. Emails end in `_email`.
- Policies are named `"<table> <operation>"`, e.g. `"sales_quotations select"`.

## 2. Keys and relations

- Primary key: `id uuid primary key default gen_random_uuid()`.
- Every relation is a declared foreign key with an explicit `on delete` rule:
  `cascade` for owned children (quotation lines), `restrict` for references to
  business records (an order's account), `set null` only for optional links.
- Every foreign key column is indexed.
- People are referenced by email, lower-cased, with a foreign key to
  `allowed_emails(email)` where the person must be on the team (precedent: 0013).

## 3. Columns every table has

```sql
created_at        timestamptz not null default now(),
updated_at        timestamptz not null default now(),   -- maintained by a trigger
created_by_email  text        not null default lower(auth.jwt() ->> 'email')
```

`created_by_email` is set by the database. A policy or trigger must stop a client
from supplying someone else's email.

## 4. Types

- **Money:** `numeric(14,2)`, PHP only. Never `float`, never a currency column.
- **Quantities:** `integer`, with `check (qty >= 0)` unless negatives mean something.
- **Rates and percentages:** `numeric(7,4)` stored as a fraction (0.12 = 12%).
- **Time:** `timestamptz` for moments, `date` for calendar days (a log's work day,
  a quote's validity).
- **Absent values:** `NULL`, never `''` (0013).
- **Free-form structure:** `jsonb` only for data the database never filters or
  joins on. Anything queried gets a real column.

## 5. Fixed vocabularies

- A short, stable list (a document's states) is a `check` constraint.
- A list a super_admin edits (product catalogue, expense categories) is a table.
- Each `check` list is mirrored by exactly one TypeScript constant in
  `src/lib/<domain>.ts`, and a unit test compares the two.

## 6. Business documents

Quotations, sales orders, billing statements and weekly reports are documents.

- **Numbers** come from a database function backed by a per-year counter row,
  never from the client: `Q-2026-0001`, `SO-2026-0001`.
- **States** are a `check` list. Legal transitions are enforced by a trigger, not
  only by the UI.
- **Immutability:** once a document leaves `draft`, its content columns cannot
  change (trigger). A correction is a new version that points at the one it replaces.
- **Snapshots:** a document copies the price, product name and customer name it was
  issued with. Later catalogue edits must not change an issued document.
- **No official invoices.** Until the BIR decision is revisited
  ([decision 0001](decisions/0001-official-invoicing-deferred.md)), no table, column
  or printed page calls an in-app document an invoice or official receipt.

## 7. Deleting

- Business records are cancelled or archived by state, not deleted.
- Hard delete is super_admin only and goes through a security-definer function
  that removes dependants in a known order (precedent: `admin_delete_lead`, 0012).

## 8. Access

- `alter table … enable row level security` and the policies are in the **same
  migration** as the table.
- Policies start from `has_section('<section>')`. Narrower rules (own rows only,
  super_admin only) are added on top, never instead.
- No policy is ever granted to `anon`. Anything public goes through a
  security-definer function that returns display-safe columns only.
- Every function: `security definer set search_path = public` where it needs
  elevated access, then `revoke all … from public, anon` **before** the grant.
- Role guards are null-safe: `is distinct from 'super_admin'`, never `<>`.
- New local stacks do not auto-grant table privileges. Each migration that creates
  a table also grants `select, insert, update, delete` to `authenticated` so
  behaviour does not depend on project age. RLS, not grants, decides access.

## 9. Migrations

- Append-only and numbered. A shipped file is never edited.
- Only the Backend Engineer role creates migrations, from the reserved numbers in
  the work plan.
- Header comment: what it does, why, and a query that verifies it.
- When data already exists: add (nullable) → backfill → tighten, as separate
  statements, and as separate files if the backfill needs review.
- Re-runnable where practical (`if not exists`, `create or replace`,
  `drop policy if exists` before `create policy`).
- A new section needs three things together: an `app_sections` row,
  `role_section_defaults` rows, and a `SECTIONS` entry in `src/lib/access.ts`.

## 10. Proof

A table is not done until:

1. It appears in `tests/integration/access/matrix.ts` with an expected result for
   every role and operation, and `npm run test:access` passes.
2. `npm run db:types` has been re-run and `src/lib/supabase/types.ts` is committed.
3. [../database.md](../database.md) and [../database-erd.md](../database-erd.md)
   describe it.
4. The E2E baseline (`tests/e2e/support/baseline.ts`) knows the table, so test runs
   still leave nothing behind.
