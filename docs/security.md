# Security

> Security architecture, threat model, and the rules that keep this app safe.
> This doc is honest about gaps — read §5 before assuming a control exists.

## 1. Security model in one paragraph

The app is an **internal, invite-only tool** running entirely on the Supabase
**anon key**. There is no server-held secret and no custom API: every read/write goes
from the browser (or a server component acting with the user's cookie session) to
Postgres, and **Row Level Security is the sole enforcement layer**. Auth is Supabase
GoTrue (email/password + Google OAuth); membership is a DB allowlist enforced by a
`before insert` trigger on `auth.users`; roles are a column on that allowlist, read
through a security-definer RPC. Everything client-side (middleware redirects,
sidebar hiding, `permissions.ts`) is UX, not security. The single exception to
"invite-only" is the public digital business card at `/c/<token>` (§8), which can
reach exactly two narrow security-definer functions and no table.

## 2. Auth chain (defense in depth, outermost first)

1. **Invite allowlist trigger** (`enforce_signup_allowlist`, 0001): rejects any
   `auth.users` insert whose email isn't in `public.allowed_emails` — covers
   password signup *and* OAuth, so a random Google account cannot self-provision.
   Supabase surfaces the raised exception as a generic "Database error saving new
   user"; `login/page.tsx` maps that to a friendly invite-only message. Keep that
   mapping.
2. **Session middleware** (`src/proxy.ts`): refreshes the session cookie via
   `auth.getUser()` on every non-static request; signed-out users are redirected to
   `/login?next=…`. Only `/login`, `/auth/*`, the secret-authed `/api/crm/ingest`
   and the public card route `/c/*` (§8) skip the login redirect.
3. **Section routing** (0010): the middleware reads `current_user_access()` (role +
   visible sections) once per request and redirects any route owned by a section the
   person cannot see (`sectionForPath` / `routeRedirect` in `src/lib/access.ts`).
   This is navigation control; the data control is step 4.
4. **RLS** (see [database.md](database.md) §4): the actual boundary. The crm_*,
   pipeline_accounts, app_state, saved_calculations and task tables check
   `has_section()`; task policies additionally enforce the role matrix and
   contributor grants.
5. **DB-set provenance**: `created_by_email` etc. default to `auth.jwt()->>'email'`
   server-side — a client cannot forge authorship on insert. (Caveat §5.4.)

`allowed_emails` has RLS enabled with **zero policies** — unreadable and unwritable
with the anon key. Clients learn only their own role via `current_user_role()`.

## 3. The three-layer permission contract

Any permission change must touch all three, in this order:

1. **SQL migration** — policies / security-definer functions (enforcement),
2. **`src/lib/permissions.ts`** — pure mirror for UI affordances,
3. **`tests/unit/permissions.test.ts`** — capability matrix assertions.

If the mirror and the policies disagree, the UI shows buttons that fail (annoying) or
hides actions that would succeed (confusing) — but security holds as long as the SQL
is right. **Never "fix" a permission bug in TypeScript only.**

## 4. Secrets & configuration

- Only public config exists: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `..._PUBLISHABLE_KEY`). The anon key is
  *designed* to be public; RLS is what protects data.
- **The service-role key must never enter this codebase**, its env, or Vercel env
  for this app. Admin operations (editing the allowlist, role changes) happen in the
  Supabase dashboard/service context only.
- `.env.local` is git-ignored; `.env.example` documents required vars. If you add a
  var, update `.env.example` and this doc. If a real secret (non-`NEXT_PUBLIC_`)
  ever becomes necessary, it must only be read in route handlers/server code and
  reviewed here first.
- CI builds with placeholder Supabase values — builds must never require real creds.
- **E2E test tooling (local only).** The Playwright suite reads the **local** Supabase
  stack's service-role key from `.env.e2e` (gitignored, written by
  `scripts/e2e/env.sh` from `supabase status`). Only `tests/e2e/support/admin.ts`
  reads it, to seed fixtures and clean up after the run. It is never passed to the
  Next.js server under test, `src/**` is ESLint-blocked from importing `tests/**`, and
  `tests/e2e/support/env.ts` refuses to run against any non-loopback Supabase URL.
  That key belongs to a throwaway Docker stack, so this doesn't relax the ban above
  for the app or for any hosted project. See docs/ui-testing.md §1.1.
- **CSP for local http Supabase.** `src/lib/securityHeaders.js` builds the headers.
  Only when `NEXT_PUBLIC_SUPABASE_URL` is `http:` (the local stack) does it add that
  origin to `connect-src` and drop `upgrade-insecure-requests` and HSTS. For an https
  URL the output is byte-identical to before (`tests/unit/securityHeaders.test.ts`).
- **Wallet signing keys (optional, server-only)** — `APPLE_PASS_*`, `APPLE_TEAM_ID`,
  `APPLE_WWDR_CERT_PEM`, `GOOGLE_WALLET_*`. These are the app's only non-public
  secrets. They are read solely by `src/lib/wallet.ts` from the
  `src/app/c/[token]/wallet/*` route handlers, never from client code, and
  never with a `NEXT_PUBLIC_` prefix. Unset means the wallet routes 404. A
  Google *Cloud* service account for Wallet is unrelated to (and does not
  justify) a Supabase service-role key, which is still banned.

## 5. Known gaps (accepted risks — do not silently "discover" these as new)

1. **Some sections have no data to protect, so routing is their only gate.** Since
   0010, every table behind a section checks `has_section()`, so hiding a section
   also blocks its data at the API. But Calculators, Unit Economics, P&L, Funding and
   QR Studio compute in the browser (localStorage, no table): denying them hides and
   redirects the page, and someone who loads the JS bundle could still run the
   math. That is acceptable because the formulas are not secret. Shared-data caveats:
   `pipeline_accounts` is readable/insertable with **either** `tool:pipeline` or
   `crm` (the CRM's "promote to pipeline" writes there). An `app_state` key that
   is not mapped in `app_state_section()` is super_admin-only, so a new tool that
   stores state there must add its key in a migration.
2. ~~Contributor grants accept arbitrary emails.~~ **Fixed in 0019:** a new grant must
   name someone on the invite list and is stored lower-cased. Existing rows were not touched.
3. **No rate limiting / abuse controls** beyond Supabase's defaults on auth
   endpoints.
4. **`assignee_email` and grant emails are client-supplied strings** (only
   `created_by_*` fields are DB-derived). Spoofing assignment display is possible by
   any user who can edit tasks; provenance fields remain trustworthy.
5. ~~No audit log.~~ **Partly fixed in 0019:** `audit_log` records changes to roles, page access, the
   invite list, sales documents, interns and report status, and CRM leads (§11). Tasks, calculators,
   saved calculations and cards are not audited.
6. **No error tracking / security monitoring** (no Sentry, no alerting).
7. **XSS surface**: all user text is rendered through React (auto-escaped); there is
   no `dangerouslySetInnerHTML` in the app. Keep it that way — if rich text is ever
   added, sanitize server-side.

8. **Fixed in 0008 (Oct 2026), kept here as a lesson:** the `admin_*` allowlist
   RPCs from 0007 guarded with `current_user_role() <> 'super_admin'`. For an
   anonymous caller that is `NULL <> …` = `NULL`, so the guard never fired. And
   Postgres grants `EXECUTE` to `PUBLIC` by default, so anyone with the anon key
   could add themselves to the allowlist as super_admin (reproduced locally).
   0008 makes the guards null-safe (`is distinct from`) and revokes `EXECUTE`
   from `public, anon`.

## 6. Security review checklist for PRs

- [ ] New table → RLS enabled + policies written in the same migration?
- [ ] New security-definer function → `set search_path = public` + minimal grant?
      That means `revoke all … from public, anon` **before** granting: Postgres
      grants EXECUTE to PUBLIC by default, and Supabase also grants anon.
- [ ] Role guards are null-safe: `if current_user_role() is distinct from
      'super_admin'`, never `<>` (a NULL role must be refused).
- [ ] Anything reachable without login (`/c/*`, `/api/crm/ingest`) reads only through
      a security-definer function returning display-safe columns. No anon
      table policies.
- [ ] Any permission logic changed in TS → matching SQL policy change + tests?
- [ ] No service-role key, no secret in `NEXT_PUBLIC_*`, `.env.example` updated?
- [ ] All email comparisons case-insensitive (`lower()` / `.toLowerCase()`)?
- [ ] User input rendered only via React text nodes (no HTML injection paths)?
- [ ] Destructive actions confirmed in UI *and* restricted by RLS?
- [ ] Redirect targets constructed from `request.nextUrl.clone()` / same-origin only
      (the `next` param is path-joined onto `origin` in `/auth/callback` — keep it a
      path, never a full URL)?

## 7. Hardening roadmap (recommended order)

1. Role-aware RLS on the workspace tables (closes §5.1).
2. JWT custom claim for role (removes the per-request RPC *and* keeps enforcement
   server-side).
3. Validate contributor emails against `allowed_emails` (trigger or FK).
4. Sentry (or similar) + Supabase log drains for visibility.
5. Optional: move Google OAuth + email confirm settings under change control
   (documented dashboard config), enable leaked-password protection in Supabase Auth.

## 8. The public card layer (`/c/<token>`, migration 0009)

The Suite's only public page. It exists because sharing a business card has to
work without a login. Design rules, all enforced in the database:

| Threat | Control |
|---|---|
| Reading unpublished cards, hidden phone numbers, owner/admin fields | `get_public_card()` returns published rows only and a fixed list of display columns. Phone is blanked unless `show_phone`. `anon` has **no** table policy on `business_cards` or `business_card_events`. |
| Enumerating the team by guessing URLs | Random 12-char base62 token (~70 bits). Unknown, draft, suspended and rotated tokens all render the same "not available" page. |
| A leaked or lost QR/NFC tag | `admin_rotate_card_token()` (new token, every old link dies) or set status `suspended`. |
| Analytics spam / storage abuse | `record_card_event()` validates every field against a fixed vocabulary, inserts only, ignores unpublished cards, throttles 60/min per card and 600/min globally, and returns nothing (not an oracle). The click route is same-origin only and always answers 204. |
| Search engines indexing staff details | `X-Robots-Tag: noindex, nofollow` from middleware plus robots metadata. |
| Script/markup injection via card fields | https-only URL check constraints (no `javascript:`), phone character whitelist, length caps. All text is rendered by React. The email-signature HTML is built with `escapeHtml()` and never rendered in-app. |
| Visitor privacy (Data Privacy Act) | No IP, cookie, fingerprint or location stored. Counts only. Bots/unfurlers are skipped. |
| Admin data leaking to non-admins | `business_cards`, `business_card_events`, `admin_card_event_rollup()` and `admin_rotate_card_token()` are super_admin-only in RLS/function guards. `/admin/cards` also redirects non-admins. |

Accepted residual risks: anyone holding a card link can see that card (by
design). A motivated actor can inflate a card's counters up to the throttle.
Photos load from whatever https host the admin pasted, so that host sees the
visitor's IP (`referrerPolicy="no-referrer"` limits what else it learns).

## 9. OWASP Top 10:2025 control map

There is no 2026 edition; 2025 is the current list. A category counts as covered
only when it has a control, a test that fails if the control is removed, and a row
here. "Planned" rows are not controls yet. Owners and waves are in
[plans/parallel-work-plan-2026-11-12.md](plans/parallel-work-plan-2026-11-12.md).

| Category | Control today | Proof today | Planned |
|---|---|---|---|
| A01 Broken Access Control | RLS on every table; `has_section()`; null-safe role guards (§3, §6) | `tests/integration/access` runs each role against the real policies and functions (`npm run test:access`) | Access tests for every new table before merge. Fixed in 0019: contributor emails validated against the invite list; `list_team_directory()` refuses a caller with no role |
| A02 Security Misconfiguration | Security headers and CSP (`src/lib/securityHeaders.js`); `poweredByHeader` off | `tests/unit/securityHeaders.test.ts` | Document Supabase Auth dashboard settings; turn on leaked-password protection |
| A03 Software Supply Chain Failures | Lockfile; `npm ci` in CI; Dependabot weekly (0019 PR); `npm audit` runs in CI, report only | none | Make the audit blocking once Next is upgraded (§11); GitHub Actions pinned by commit; secret scanning |
| A04 Cryptographic Failures | TLS from Vercel and Supabase; constant-time secret compare (`ct_equal`) | ingest tests in E2E plan | Store a hash of the ingest secret, not the plaintext (§5, AGENTS.md §7) |
| A05 Injection | React text rendering only; Supabase client parameterises queries; URL and phone check constraints on cards | card and CRM unit tests | Lint rule banning `dangerouslySetInnerHTML`; CSV formula-injection test on import and export |
| A06 Insecure Design | Three-layer permission contract (§3); public layer behind two functions (§8) | permission matrix unit tests | Document state transitions and immutability enforced by triggers ([standards/database.md](standards/database.md) §6) |
| A07 Authentication Failures | Allowlist trigger; Supabase Auth; session refresh in middleware (§2) | `tests/e2e/specs/auth.spec.ts` | Review auth rate limits; optional MFA for super_admin |
| A08 Software or Data Integrity Failures | Provenance columns set by the database; append-only comments and activities | access tests assert no update/delete on append-only tables; sales documents lock when issued | `audit_log` (0019) on the tables listed in §11; extend it to finance tables when they exist |
| A09 Security Logging and Alerting Failures | `audit_log` answers "who changed this" (§11). No error tracking or alerting yet | `tests/integration/access/audit-rules.itest.ts` | Error tracking (needs an account: owner decision); alert on repeated failed ingest auth; Supabase log review routine |
| A10 Mishandling of Exceptional Conditions | Functions refuse a NULL role (0008); optimistic UI rolls back on error | access tests include the anonymous and no-role callers | Error boundary per section; malformed-input tests for every function |

## 10. Intern records (personal data)

Intern profiles, daily logs and weekly reports (0018) are personal data under the Data
Privacy Act. Purpose: supervision and crediting the intern's school. Access: the intern, their
supervisor and a super_admin, enforced by RLS and proven in
`tests/integration/access/people-rules.itest.ts`. Nothing is collected beyond hours, a text
summary and a report. Retention is **manual**: keep records until a year after the internship
ends, then delete on request or archive. Tell each intern what is recorded when you invite them.
NPC registration is not expected at this size (threshold: 250 employees or sensitive data of
1,000 people), but confirm against NPC Circular 2022-04; breach notification within 72 hours
applies regardless.

## 11. Audit log and the dependency advisory (Wave 2)

**Audit log (0019).** `audit_log` has one row per change on: `allowed_emails`,
`user_section_overrides`, `role_section_defaults`, `sales_products`, `sales_price_tiers`,
`sales_quotations`, `sales_orders`, `people_interns`, `people_weekly_reports` (text columns left
out) and `crm_leads` (raw submission and message left out). Each row has the actor's email (NULL
for the service role), the table, the row's key, the operation and the changes: the new row for an
insert, the old row for a delete, `{column: {old, new}}` for an update. No-op updates write nothing.
Only a trigger writes it; only a super_admin reads it; nobody edits it. There is no screen for it
yet: read it in the Supabase table editor. Tasks, calculators, saved calculations and digital cards
are not audited.

**Dependency advisories.** The critical advisory on Next 14 (and the high one on its bundled
`postcss`) was resolved by the upgrade to Next 16 and React 19. What `npm audit --omit=dev` still
reports is `passkit-generator` (Apple/Google Wallet, dormant until keys exist) and its `joi`
dependency, whose fix is a major change. Non-breaking transitive fixes were applied. The CI audit
step reports but does not fail the build; make it blocking once those two are resolved or removed.
