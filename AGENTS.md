# AGENTS.md — Bughaw Suite

**The main guide for AI agents and developers working on this codebase.** Read this
first. Deeper detail lives in the child docs under [`docs/`](docs/):

| Doc | Covers |
|-----|--------|
| [docs/architecture.md](docs/architecture.md) | System design, data flow, module map, patterns |
| [docs/database.md](docs/database.md) | Schema, RLS policy matrix, migrations, SQL functions |
| [docs/security.md](docs/security.md) | Threat model, auth chain, role enforcement, known gaps, rules |
| [docs/testing.md](docs/testing.md) | Test strategy, what to test, how to run |
| [docs/ui-testing.md](docs/ui-testing.md) | Playwright UI/E2E plan: use cases, test cases, CI, issue-reporting loop |
| [docs/design-system.md](docs/design-system.md) | Colors, typography, component patterns, UX rules |
| [docs/product.md](docs/product.md) | What the app is for, users, roles, feature inventory, roadmap |
| [docs/digital-cards.md](docs/digital-cards.md) | Digital business cards: plan, decisions, public-layer security, analytics |
| [docs/standards/database.md](docs/standards/database.md) | **Rules for every new table, function and migration** (0014 onward) + decision records |
| [docs/specs/](docs/specs/) | Feature specs (contract first): CRM deal fields, sales, intern logs |
| [docs/plans/](docs/plans/) | Advisory board verdict and the five-role parallel work plan |

---

## 1. What this app is

An **internal, invite-only web app for Bughaw Innovations** (a Philippine startup
selling sustainable coconut-coir slippers/amenities to hotels). Two halves:

1. **Calculators & tools** — unit economics, go-to-market, forecasting math, plus four
   migrated interactive tools (Pipeline mini-CRM, Unit Cost Calculator, Unit Economics
   Simulator, P&L Machine). All money is **₱ PHP, `en-PH` locale**.
2. **Task management** — projects → mini-projects → kanban task boards, with a
   three-tier role system (`super_admin` / `member` / `contractor`).
3. **CRM** — leads from the public marketing site (bughawinnovations.ph), deduped
   into accounts/contacts and worked on a funnel board. Field-level provenance for
   every CRM column lives in [`FORMS_AUDIT.md`](FORMS_AUDIT.md).

**Login is required for the entire app.** Signups are invite-only via a DB allowlist.
The only public surfaces are `/login`, `/auth/*`, the secret-authed CRM ingest, and
**published digital business cards at `/c/<token>`**, which read through one
security-definer RPC and no table ([docs/digital-cards.md](docs/digital-cards.md)).

## 2. Tech stack

- **Next.js 16 (App Router) + React 19 + TypeScript 5** — mixed server components
  (data fetching) and client components (interactivity)
- **Tailwind CSS 3** with a custom earth-tone token palette (see design-system doc)
- **Supabase** — Postgres + Auth + RLS, accessed with `@supabase/ssr` (anon key only;
  **no service-role key anywhere in the app**)
- **Recharts** (charts), **@dnd-kit** (kanban drag-and-drop), **Vitest** (unit tests)
- **Vercel** deploy; GitHub Actions CI (lint + test + build on push/PR to `main`)

## 3. Repository map

```
src/
  proxy.ts                      # Auth gate (Next 16 name for middleware) + per-section route redirects (every request)
  app/
    layout.tsx, globals.css     # Root layout, fonts, Tailwind
    login/page.tsx              # Email/password + Google OAuth sign-in (client)
    auth/callback/route.ts      # OAuth code → session exchange
    auth/signout/route.ts       # POST sign-out
    (app)/                      # Everything behind auth; layout adds Sidebar + header
      page.tsx                  # Dashboard (calculator grid)
      saved/page.tsx            # Browse team-shared saved calculations
      calculators/[category]/[calculatorId]/page.tsx   # Config-driven calculators
      tools/{pipeline,cost-calculator,unit-economics,pnl,qr-studio}/page.tsx  # Migrated tools
      tasks/                    # Task management
        page.tsx                # Project list
        NewProjectForm.tsx
        [projectId]/            # Project detail (mini-projects + contributors)
        [projectId]/[miniProjectId]/   # Kanban Board.tsx + TaskPanel.tsx
      finance/                  # Cash, expenses, budget (section `finance`, off by default for non-admins)
      people/                   # Intern logs, weekly reports, review, overview, interns, evaluations, criteria (section `people`)
      sales/                    # Quotations, orders, stock, products (section `sales`)
      crm/                      # CRM
        page.tsx                # Funnel board + all-leads table
        CrmBoard.tsx            # dnd-kit funnel, filters, CSV export
        LeadPanel.tsx           # Lead detail: activity log, notes, promote-to-pipeline
        NewLeadForm.tsx         # Manual entry (same rules as the website forms)
        leadSelect.ts           # Shared column list behind CrmLeadRow
        import/                 # CSV / JSON import with a dry-run preview
    api/crm/ingest/route.ts     # Lead intake from the marketing site (secret-authed)
    (app)/admin/cards/          # super_admin: card editor, share kit, analytics
    (app)/admin/access/         # super_admin: role defaults + per-person page access
    c/[token]/                  # PUBLIC digital card (+ vcard/, event/, wallet/)
  components/
    Sidebar.tsx                 # Role-aware nav (hides calculators from contractors)
    CalculatorShell.tsx         # Renders ANY calculator config (form/outputs/chart/export)
    CalculatorClient.tsx        # Thin client wrapper
  lib/
    calculators/types.ts        # CalculatorConfig, InputField, ChartSpec, CATEGORIES
    calculators/registry.ts     # ALL_CALCULATORS + lookup helpers
    calculators/configs/*.ts    # 26 calculator definitions (pure, declarative); startup.ts = Wave 2 planning tools
    finance.ts                  # Finance: months, budget vs actual, burn and runway, expense validation, CSV (pure; mirrors 0020)
    evaluations.ts              # Intern evaluations: rubric, scores, averages, form validation, score diff (pure; mirrors 0024)
    people.ts                   # People: weeks, hours progress, edit window, report flow, row types (pure; mirrors 0018)
    sales.ts                    # Sales: statuses, transitions, totals, stock shortages, row types (pure; mirrors 0015–0017)
    permissions.ts              # Pure role helpers — MIRRORS RLS, UI-gating only
    access.ts                   # Sections/pages per person — MIRRORS has_section() (0010)
    tasks.ts                    # Task types + fractional-position ordering math
    crm.ts                      # CRM vocabulary, validation, normalization, CSV (pure)
    crmClient.ts                # Browser write path for manual entry + import (dedupe)
    qrStudio.ts                 # QR Studio: vCard, landing-page HTML, QR matrix (pure)
    cards.ts                    # Digital cards: validation, vCard, signature, analytics (pure)
    wallet.ts                   # Apple/Google Wallet signing (SERVER-ONLY, env secrets)
    pnl.ts                      # P&L Machine formula (pure)
    costCalc.ts                 # Unit Cost Calculator: units, batch/pair cost, planner, report CSV (pure)
    format.ts                   # ₱ / % / ratio / months formatters
    pricing.ts                  # Volume price tiers: priceForQty, unitsToNextTier (pure; used by calculators, later by quotes)
    useAppState.ts              # Shared team JSONB state hook (debounced upsert)
    supabase/{client,server}.ts # Re-exports of utils/supabase (import from here)
    tools.ts                    # TOOLS nav registry
  utils/supabase/
    client.ts, server.ts, middleware.ts   # @supabase/ssr client factories
    role.ts                     # getCurrentUserRole() → RPC current_user_role()
    access.ts                   # getCurrentUserAccess() → RPC current_user_access()
supabase/migrations/
  0001_init.sql                 # Allowlist, signup trigger, workspace tables, RLS
  0002_task_management.sql      # Roles, task tables, security-definer fns, RLS
  0003_crm.sql                  # CRM tables, RLS, ingest_form_submission()
  0004–0007                     # Calculator RLS, hardening, team directory, allowlist admin
  0008_fix_admin_role_checks.sql  # SECURITY: null-safe admin guards, revoke anon EXECUTE
  0009_digital_cards.sql        # Cards, events, public RPCs, admin rollup
  0010_section_access.sql       # Page access: sections, role defaults, per-user overrides, has_section() RLS
  0013_crm_nulls_and_owner_fk.sql # CRM: NULL (not '') for absent values; crm_leads.owner_email FK → allowed_emails
  0020_finance.sql                # Finance: categories, expenses (void, never delete), cash snapshots, monthly budgets; section off by default
  0019_hardening_audit.sql        # Team-directory role guard, contributor email validation, audit_log + triggers
  0024_intern_evaluations.sql     # Evaluations: editable rubric, score per criterion, draft -> shared (final, locked); no self-evaluation
  0018_people_interns.sql         # People: intern profiles, daily logs, weekly reports (own-rows RLS, week lock, review flow)
  0015–0017 sales_*.sql          # Sales: products, tiers, stock; quotations; orders (numbering, locking, stock triggers)
  0014_crm_deal_fields.sql        # CRM: deal value, next action, samples, lost reason (trigger), buyer segment; pipeline → CRM account link
tests/unit/                     # calculators, permissions, crm, cards (+ wallet JWT) tests
tests/e2e/                      # Playwright UI tests (docs/ui-testing.md); LOCAL Supabase only
tests/integration/access/       # Real-RLS access matrix, every role (docs/testing.md §5); LOCAL only
playwright.config.ts            # E2E projects, webServer on :3100, global setup/teardown
scripts/e2e/                    # env.sh (.env.e2e from `supabase status`), clean.ts
supabase/config.toml, seed.sql  # LOCAL stack for E2E only (ports 554xx); never prod
.github/workflows/ci.yml        # lint → test → build
*.html (repo root)              # Original artifacts, kept for reference ONLY — do not edit
implementation.md               # Historical plan (partially superseded; this doc wins)
```

## 4. The five load-bearing concepts

### 4.1 Security lives in the database, not the UI

**RLS policies are the security boundary.** `src/lib/permissions.ts` deliberately
mirrors the RLS policies from `0002_task_management.sql` but only gates UI affordances
(hiding buttons). Any change to who-can-do-what must be made **in a SQL migration
first**, then mirrored in `permissions.ts`, then covered in
`tests/unit/permissions.test.ts`. Never treat a client-side check as protection.

### 4.2 Roles

Three roles stored on `public.allowed_emails.role`, read via the security-definer RPC
`current_user_role()` (the allowlist table itself has RLS with **no policies** — only
service role can touch it):

**Which sections a person sees is data, not code (0010).** Sections are CRM,
Projects & boards, Calculators, Saved calculations, plus each Tool page. Each role
has editable defaults, and a super_admin can allow or deny any section for one
person at `/admin/access`. Effective = super_admin → all; else override ?? role
default ?? none. It is enforced by the middleware (redirect), the nav (hidden) and
RLS (`has_section()` on the section's tables). The pure mirror is
`src/lib/access.ts`. The rows below marked *default* are the seeded role defaults.

| Capability | super_admin | member | contractor |
|---|---|---|---|
| See calculators / each tool / saved | ✅ always | ✅ *default* | ❌ *default* |
| See / work the CRM | ✅ always | ✅ *default* | ❌ *default* (route **and** RLS) |
| See projects & boards | ✅ always | ✅ *default* | ✅ *default* |
| Manage page access (`/admin/access`) | ✅ | ❌ | ❌ |
| Delete CRM records | ✅ | ❌ | ❌ |
| Create/delete projects | ✅ | ❌ | ❌ |
| Create mini-projects | ✅ | ✅ (with project access) | ❌ |
| Add contributors | ✅ | ✅ | ❌ |
| Remove contributors | ✅ | ❌ | ❌ |
| Manage digital cards + card analytics | ✅ | ❌ | ❌ |
| Create tasks | ✅ | ✅ | ✅ (with board access) |
| Edit/delete tasks | ✅ all | ✅ all (in scope) | only own tasks |
| See projects | all | contributor-only | contributor-only |

Access to boards is granted by **contributor rows keyed by email** (project-level
grants cascade to all mini-projects; mini-project grants are scoped). All email
comparisons are `lower()`-cased on both sides — keep it that way.

### 4.3 Config-driven calculators

A calculator is **one declarative object** (`CalculatorConfig`): `inputGroups` +
pure `compute(inputs) → outputs` + `outputs` defs + optional `chart` / `verdict`.
`CalculatorShell.tsx` renders any config. **To add a calculator:** add a config in
`src/lib/calculators/configs/<category>.ts`, export it in that file's array (registry
picks it up), add formula tests. No new pages, no new components.

### 4.4 Three persistence tiers — pick deliberately

| Tier | Where | Used by | Semantics |
|---|---|---|---|
| localStorage | browser | calculator inputs, unit-econ + P&L tools | per-person scratch |
| `app_state` JSONB | Supabase | cost calculator, pipeline sim state (via `useAppState`) | shared team doc, debounced (700 ms) last-write-wins upsert |
| First-class tables | Supabase | pipeline accounts, saved calcs, projects/tasks, CRM leads | real rows, RLS-governed |

`useAppState` is **last-write-wins with no conflict resolution** — fine for a tiny
team, do not build multi-writer features on it; promote to a real table instead
(the pipeline accounts table is the precedent).

### 4.5 Kanban ordering

Tasks use **fractional positioning** (`computeNewPosition` in `src/lib/tasks.ts`):
a dropped card takes the midpoint of its neighbors so a drag writes exactly one row.
Don't replace this with reindex-the-column writes.

## 5. Working on this repo — the rules

**Do**
- Run `npm run lint && npm run test && npm run build` before considering work done
  (CI runs exactly this).
- Keep formulas **pure and tested** — every `compute`, `computePnl`, permission
  helper change gets a Vitest case, including divide-by-zero / non-finite guards
  (formatters render non-finite as `—`; computes must return `0`, not `NaN`/`Infinity`).
- Use the existing Supabase factories: `@/lib/supabase/client` in client components,
  `@/lib/supabase/server` in server components/route handlers. Never instantiate
  `createBrowserClient`/`createServerClient` directly.
- New DB changes = **new numbered migration file** (`0003_...`), never edit shipped
  migrations. Every new table gets RLS enabled + explicit policies in the same file.
  Follow [docs/standards/database.md](docs/standards/database.md), and add the table
  to `tests/integration/access/matrix.ts`: `npm run test:access` fails on any table
  or function without an access test.
- Use the Tailwind design tokens (`paper`, `panel`, `ink`, `ink-soft`, `coir`,
  `coir-dark`, `coir-bg`, `clay`, `line`, `danger`, `amber`) — no raw hex in JSX
  except the few chart-only colors already established.
- Format all money through `src/lib/format.ts` (₱, `en-PH`).
- Optimistic UI with rollback on error is the established mutation pattern
  (see `ProjectDetail.tsx`, `Board.tsx`) — follow it.

**Don't**
- Don't put the Supabase **service-role key** in this app, ever. The app runs
  entirely on the anon/publishable key + RLS.
- Don't add secrets beyond `NEXT_PUBLIC_*` vars without updating `.env.example`
  and the security doc.
- Don't gate anything security-relevant only in middleware, the sidebar, or
  `permissions.ts` — see 4.1.
- Don't edit the root `*.html` artifacts — they are frozen reference material.
- Don't let tests leave data behind. E2E tests run only against the local Supabase
  (`env.ts` refuses any other host), and global teardown deletes everything a run created,
  then fails the run if anything is left over. See
  [docs/ui-testing.md §1.1](docs/ui-testing.md#11-the-test-data-rule-tests-leave-nothing-behind).
- Don't introduce per-user private data casually: the workspace tables
  (`pipeline_accounts`, `app_state`, `saved_calculations`) are intentionally
  shared-team (RLS = any authenticated user). Changing that is a product decision.
- Don't trust `implementation.md` for current state — it predates locked decisions
  in places (e.g., it mentions share links, Zustand, Sentry that don't exist).

## 6. Environment & commands

```bash
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev        # http://localhost:3000 → redirects to /login
npm run test       # vitest run (pure-logic tests, no network needed)
npm run test:watch
npm run lint
npm run build      # works with placeholder env vars (CI does this)
npm run e2e:db     # E2E: local Supabase (Docker) on ports 554xx + .env.e2e
npm run e2e:smoke  # E2E @smoke subset; app on :3100; leaves no data behind
npm run e2e:clean  # E2E: remove leftovers after an interrupted run
npm run test:access # Real RLS + function guards for every role (needs e2e:db)
npm run db:types   # Regenerate src/lib/supabase/types.ts after a migration
npm run e2e:perf   # Performance baseline on a production build
```

Supabase setup: run every file in `supabase/migrations/` in numeric order
(`0001_init.sql` … `0020_finance.sql`) in the SQL editor (0003 has an
ACTION REQUIRED header: insert an ingest secret before the marketing site can post
leads). **Edit the `allowed_emails` inserts and
role updates first** — that table is the invite list and role assignment.
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is accepted as a fallback name for the anon key.

Deploy: Vercel, auto from `main`. CI must be green.

## 7. Known gaps & honest caveats (verify before "fixing", and read docs/security.md)

- **Client-only tools are gated by route only.** Since 0010, every table behind a
  section checks `has_section()`. Calculators, Unit Economics, P&L, Funding and QR
  Studio have no table (browser math / localStorage), so denying them hides and
  redirects the page and nothing more. **A new tool that stores `app_state` must
  map its key in `app_state_section()`** (new migration); unmapped keys are
  super_admin-only. A new section = `app_sections` row + `role_section_defaults`
  rows + `SECTIONS` entry in `src/lib/access.ts` (the access test diffs them).
- **The CRM ingest secret is stored in plaintext** in `crm_ingest_secrets` (a table
  with RLS and no policies, so service-role only — same posture as
  `allowed_emails`). Rotating it means updating that row and the marketing site's
  env var together. `ingest_form_submission()` is the only function granted to
  `anon`; keep it that way.
- **Contributor emails** must be on the invite list (0019); the database refuses
  anything else and lower-cases what it stores.
- **`audit_log`** (0019) records who changed roles, page access, sales documents, interns
  and report status, and CRM leads. Super_admin read only; see docs/security.md §11.
- **Open advisory:** `passkit-generator` / `joi` (Wallet passes, dormant) report high
  advisories whose fix is a major change (docs/security.md §11).
- **Middleware runs an RPC per request** (`current_user_role`) for signed-in users —
  a known latency cost; if it becomes a problem, cache the role in the JWT
  (custom claims) rather than trusting a client-stored value.
- **`task_comments` is append-only by design** (no update/delete policies).
- **Signup allowlist trigger** raises inside `auth.users` insert, which Supabase
  surfaces as a generic "Database error saving new user" — the login page maps this
  to a friendly invite-only message; keep that mapping if you touch signup.
- No E2E/integration tests, no error tracking (Sentry), no rate limiting — see
  docs/testing.md and docs/security.md for the recommended order of improvement.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
