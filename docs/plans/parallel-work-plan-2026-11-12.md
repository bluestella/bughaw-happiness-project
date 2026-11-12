# Parallel work plan — five roles

Follows the verdict in [advisory-board-bughaw-suite-2026-11-12.md](advisory-board-bughaw-suite-2026-11-12.md).
Status: **Wave 0 done 2026-11-12** (standards, decision records, Wave 1 specs, access-test harness, type generation, performance baseline). Wave 1 not started; it waits on the owner inputs in §9.

## 1. How five roles work at once without colliding

Each role owns a set of paths. Nobody edits outside their paths; they ask the owner.

| Role | Owns | Never touches |
|---|---|---|
| Enterprise Architect (EA) | `docs/standards/`, `docs/architecture.md`, `docs/database.md`, `docs/database-erd.md`, `docs/security.md`, `AGENTS.md` | Code |
| Solutions Architect (SA) | `docs/specs/<feature>.md`, TypeScript types in `src/lib/<domain>/types.ts` | Migrations, pages |
| Backend Engineer (BE) | `supabase/migrations/`, `supabase/seed.sql`, pure logic in `src/lib/<domain>.ts`, `src/app/api/` | Pages and components |
| Frontend Engineer (FE) | `src/app/(app)/`, `src/components/`, `src/lib/calculators/configs/` | Migrations |
| Test Engineer (TE) | `tests/`, `playwright.config.ts`, `.github/workflows/`, `scripts/e2e/` | Feature code (files bugs instead) |

Rules that prevent merge conflicts:

- **Only BE creates migrations**, and numbers are reserved up front (table in §4).
- **Contract first.** SA's spec and types land before BE and FE start a feature. FE builds against the types; BE builds to them.
- **One branch per role per wave**, merged in the order EA/SA → BE → FE → TE additions. CI must be green at each merge.
- **You are the only approver.** Each wave ends with one review session, not a stream of small ones.

## 2. Waves

| Wave | Dates | Outcome |
|---|---|---|
| 0 Contracts | Nov 13–14 | Standards, domain model, Wave 1 specs, access-test harness on existing tables, performance baseline |
| 1 Sell the batch | Nov 15–26 | CRM deal fields, quotes, sales orders, stock, intern daily log and weekly report |
| 2 Run the company | Nov 27 – Jan 8 | Production and R&D records, expenses and cash, intern evaluations and school export, framework calculators, monitoring, audit log |
| 3 Scale | After Jan 8 | Purchasing and suppliers, role in the session token, realtime boards, official invoicing if approved |

Wave 1 has a hard gate: **no new table merges without its access tests passing.**

## 3. Work by role

### Enterprise Architect

Wave 0
- `docs/standards/database.md` (content in §5).
- Domain model: one **account** record (the CRM's) as the customer for quotes, orders and the Pipeline tool. Decide the path for `pipeline_accounts`: keep the table, add a link to the CRM account, stop creating unlinked rows.
- Section map for new areas: `sales` (quotes, orders, stock), `people` (intern logs), later `production`, `finance`. Each is an `app_sections` row with role defaults.
- Decision records in `docs/standards/decisions/`: official invoicing deferred; interns use the existing contractor role plus per-person access; money stored as `numeric(14,2)` PHP.
- OWASP Top 10:2025 control map (§6) into `docs/security.md`.

Wave 1–2
- Review every migration against the standard before merge.
- Data Privacy Act note for intern records: what is collected, who sees it, retention, breach contact.
- Keep the ERD and AGENTS.md current.

### Solutions Architect

Wave 0: one spec per Wave 1 feature, each with user stories, table and column list, state transitions, access matrix by role, and acceptance criteria written so TE can turn them into tests.

| Spec | Key points |
|---|---|
| CRM deal fields | Deal value, expected close, next action and due date, segment, lost reason, sample sent and received dates; overdue follow-up view |
| Quotations | Lines with product, quantity, unit price from price tiers, validity date, terms; states draft → sent → accepted or expired; immutable after sent; revision makes a new version |
| Sales orders | Created from an accepted quote; reserves stock; delivery date; states confirmed → delivered → paid; fields for official invoice number and payment date |
| Stock | Products, on-hand count, reserved count, manual adjustments with a reason |
| Intern log | Daily entry (date, hours, what was done, linked tasks); weekly report generated from entries; submit → approve or return; printable summary |
| Printing | Print stylesheet pages, not a PDF library, for quotes, orders and intern summaries; every sales document is labelled "not an official receipt or invoice" until the BIR decision |

Wave 2: specs for production batches and experiment log, expenses and cash, intern evaluations, the worksheet type for strategy frameworks, audit log.

### Backend Engineer

Wave 0
- Generate database types into `src/lib/supabase/types.ts` and a script to refresh them.
- Seed data for the local stack: one user per role plus one intern per discipline.

Wave 1 (migrations in §4)
- Tables, policies using `has_section()`, numbering functions, state-transition guards in the database, immutability triggers for issued documents.
- Pure logic with unit tests: quote totals and tier pricing, stock reservation, weekly report roll-up, hours totals.
- Null-safe role guards and `revoke … from public, anon` on every function, per the PR checklist.

Wave 2
- Production, finance and evaluation tables; audit log table with triggers on sales and finance tables; contributor email validation against the allowlist; rate limiting on `/api/crm/ingest`.

### Frontend Engineer

Wave 0
- Performance baseline for dashboard, CRM, a task board and `/c/<token>`; record LCP, INP, CLS and bundle size per route.
- Quick wins found in the baseline: lazy-load charts and drag-and-drop, reserve space for async content, keep data fetching in server components.

Wave 1
- CRM: new fields in the lead panel, follow-up view, segment filter.
- Quotes and orders: list, editor, print view. Stock page. All money through `format.ts`, design tokens only, usable at 375 px.
- Intern pages: my log, my weekly report, supervisor review queue.
- Optimistic updates with rollback, as in `Board.tsx`.

Wave 2
- Production, finance and evaluation screens; framework calculators as configs; the worksheet renderer; an owner dashboard that shows open quotes, stock, cash and intern hours.

### Test Engineer

Wave 0
- **Access-test harness**: Vitest suite against the local Supabase that signs in as each role and attempts each operation on each table, plus anonymous calls to every function. Start with existing tables so the harness is proven before new ones arrive.
- Add it to CI after the unit tests.

Wave 1
- Access tests for every new table (the merge gate).
- Playwright flows tagged `@smoke`: lead → quote → order → stock reduced; intern logs a day → submits week → supervisor approves; intern cannot open CRM pricing or another intern's report.
- Lighthouse CI budget on the four baseline routes.

Wave 2
- Coverage threshold on `src/lib`; accessibility checks on new pages; dependency audit and secret scanning in CI; a test that the ingest route rejects bad secrets and oversized bodies.

## 4. Migration reservations (BE only)

| Number | Content | Wave |
|---|---|---|
| 0014 | CRM deal fields; link from `pipeline_accounts` to the CRM account — **done** | 1 |
| 0015 | Sections `sales`, `people`; role defaults | 1 |
| 0016 | Products, price tiers, stock and adjustments | 1 |
| 0017 | Quotations and lines; numbering; immutability | 1 |
| 0018 | Sales orders; stock reservation; payment and invoice-number fields | 1 |
| 0019 | Intern profiles, daily logs, weekly reports | 1 |
| 0020–0025 | Audit log, production, finance, evaluations, worksheets, ingest rate limit | 2 |

## 5. Database standards (summary for `docs/standards/database.md`)

- **Names:** snake_case, plural tables, `<domain>_` prefix (`sales_`, `stock_`, `people_`, `prod_`, `fin_`).
- **Keys:** `uuid` primary keys; foreign keys always declared with an explicit `on delete` rule; index every foreign key.
- **Columns every table has:** `created_at`, `updated_at` (`timestamptz`), `created_by_email` set by the database, never by the client.
- **Money:** `numeric(14,2)`, PHP only, never float. Quantities are integers.
- **Absent values:** `NULL`, not empty strings (as in 0013).
- **Fixed vocabularies:** `check` constraints for short stable lists; lookup tables when a super_admin must edit them. Mirror each list in one TypeScript constant with a test that compares them.
- **Documents:** human-readable numbers from a database function (`Q-2026-0001`); rows become read-only once issued; corrections are new versions, never edits.
- **Deletes:** business records are cancelled, not deleted. Hard delete is super_admin only.
- **Access:** RLS on in the same migration; policies call `has_section()`; no table policy for `anon`; security-definer functions set `search_path` and revoke default execute.
- **Emails:** compared lower-cased on both sides.
- **Migrations:** append-only and numbered; additive first, then backfill, then tighten, in separate files when data exists; each has a header saying what it does and how to verify it.
- **Proof:** every table has access tests; types are regenerated after each migration; ERD updated in the same change.

## 6. Security: OWASP Top 10:2025 map

There is no 2026 edition; 2025 is current. Exact numbering should be confirmed against owasp.org when EA writes this into `docs/security.md`.

| Category | State today | Work | Owner |
|---|---|---|---|
| Broken Access Control | RLS is the boundary; tested only against the TS mirror | Access-test harness on every table and function; validate contributor emails | TE, BE |
| Security Misconfiguration | Security headers and CSP exist | Test CSP on new pages; document Supabase Auth settings; leaked-password protection on | EA, TE |
| Software Supply Chain Failures | Lockfile, CI | `npm audit` gate, Dependabot, pinned GitHub Actions, secret scanning | TE |
| Cryptographic Failures | TLS by platform; ingest secret stored in plaintext | Store a hash of the ingest secret and compare hashes | BE |
| Injection | React escaping; no raw HTML; Supabase client parameterises | CSV import and export formula-injection test; keep `dangerouslySetInnerHTML` at zero with a lint rule | TE, FE |
| Insecure Design | Three-layer permission contract | State transitions and immutability enforced in the database, not the UI | SA, BE |
| Authentication Failures | Allowlist trigger, Google and password login | Rate-limit review; session expiry check; optional MFA for super_admin | EA, BE |
| Software or Data Integrity Failures | No audit trail | Audit log on sales and finance tables; issued documents immutable | BE |
| Security Logging and Alerting Failures | None | Error tracking, Supabase log review, alert on repeated failed ingest auth | BE, TE |
| Mishandling of Exceptional Conditions | Optimistic UI with rollback | Error boundaries per section; functions fail closed; tests for null role and malformed input | FE, BE, TE |

A claim that all ten are "resolved" is not checkable. The definition of done is: each row has a control, a test that fails when the control is removed, and a line in `docs/security.md`.

## 7. Tests: what "perfect" means here

Perfect is not measurable, so the target is defined as:

1. Every table: each role × select, insert, update, delete has an expected result and a test against the real policies.
2. Every database function: a test that anonymous and under-privileged callers are refused.
3. Every state transition in a spec has an allowed and a refused test.
4. Every section has one `@smoke` end-to-end flow.
5. Tests leave no data behind (existing rule).
6. CI fails on any of the above failing.

## 8. Performance: Core Web Vitals

Targets at the 75th percentile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.

- An invite-only app has no public field data, so use Lighthouse CI on four routes as the gate and real-user monitoring for the truth. Real-user monitoring is a new service and a choice for you to make.
- `/c/<token>` is the page customers load on their phones and gets the strictest budget.
- Likely costs to check in the baseline, not yet measured: the per-request role lookup in middleware, chart and drag-and-drop bundles on first load, layout shift from late-loading lists.

## 9. What needs your decision before Wave 1 starts

1. ~~Official invoicing deferred or built now.~~ **Decided 2026-11-12: deferred** until the accountant answers the four BIR questions. Wave 1 sales documents are internal and labelled as not official invoices.
2. CRM account becomes the single customer record, with the Pipeline tool linked to it.
3. Interns stay on the contractor role with per-person access, or get a fourth role.
4. Which deadline is first and its date.
5. Batch-one products, price tiers, MOQ, lead time and stock count.
