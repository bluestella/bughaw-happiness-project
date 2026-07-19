# AGENTS.md — Bughaw Calculators Hub

**The main guide for AI agents and developers working on this codebase.** Read this
first. Deeper detail lives in the child docs under [`docs/`](docs/):

| Doc | Covers |
|-----|--------|
| [docs/architecture.md](docs/architecture.md) | System design, data flow, module map, patterns |
| [docs/database.md](docs/database.md) | Schema, RLS policy matrix, migrations, SQL functions |
| [docs/security.md](docs/security.md) | Threat model, auth chain, role enforcement, known gaps, rules |
| [docs/testing.md](docs/testing.md) | Test strategy, what to test, how to run |
| [docs/design-system.md](docs/design-system.md) | Colors, typography, component patterns, UX rules |
| [docs/product.md](docs/product.md) | What the app is for, users, roles, feature inventory, roadmap |

---

## 1. What this app is

An **internal, invite-only web app for Bughaw Innovations** (a Philippine startup
selling sustainable coconut-coir slippers/amenities to hotels). Two halves:

1. **Calculators & tools** — unit economics, go-to-market, forecasting math, plus four
   migrated interactive tools (Pipeline mini-CRM, Unit Cost Calculator, Unit Economics
   Simulator, P&L Machine). All money is **₱ PHP, `en-PH` locale**.
2. **Task management** — projects → mini-projects → kanban task boards, with a
   three-tier role system (`super_admin` / `member` / `contractor`).

**Login is required for the entire app.** Signups are invite-only via a DB allowlist.
There is no public surface beyond `/login` and `/auth/*`.

## 2. Tech stack

- **Next.js 14 (App Router) + React 18 + TypeScript 5** — mixed server components
  (data fetching) and client components (interactivity)
- **Tailwind CSS 3** with a custom earth-tone token palette (see design-system doc)
- **Supabase** — Postgres + Auth + RLS, accessed with `@supabase/ssr` (anon key only;
  **no service-role key anywhere in the app**)
- **Recharts** (charts), **@dnd-kit** (kanban drag-and-drop), **Vitest** (unit tests)
- **Vercel** deploy; GitHub Actions CI (lint + test + build on push/PR to `main`)

## 3. Repository map

```
src/
  middleware.ts                 # Auth gate + contractor route lockout (every request)
  app/
    layout.tsx, globals.css     # Root layout, fonts, Tailwind
    login/page.tsx              # Email/password + Google OAuth sign-in (client)
    auth/callback/route.ts      # OAuth code → session exchange
    auth/signout/route.ts       # POST sign-out
    (app)/                      # Everything behind auth; layout adds Sidebar + header
      page.tsx                  # Dashboard (calculator grid)
      saved/page.tsx            # Browse team-shared saved calculations
      calculators/[category]/[calculatorId]/page.tsx   # Config-driven calculators
      tools/{pipeline,cost-calculator,unit-economics,pnl}/page.tsx  # Migrated tools
      tasks/                    # Task management
        page.tsx                # Project list
        NewProjectForm.tsx
        [projectId]/            # Project detail (mini-projects + contributors)
        [projectId]/[miniProjectId]/   # Kanban Board.tsx + TaskPanel.tsx
  components/
    Sidebar.tsx                 # Role-aware nav (hides calculators from contractors)
    CalculatorShell.tsx         # Renders ANY calculator config (form/outputs/chart/export)
    CalculatorClient.tsx        # Thin client wrapper
  lib/
    calculators/types.ts        # CalculatorConfig, InputField, ChartSpec, CATEGORIES
    calculators/registry.ts     # ALL_CALCULATORS + lookup helpers
    calculators/configs/*.ts    # 11 calculator definitions (pure, declarative)
    permissions.ts              # Pure role helpers — MIRRORS RLS, UI-gating only
    tasks.ts                    # Task types + fractional-position ordering math
    pnl.ts                      # P&L Machine formula (pure)
    format.ts                   # ₱ / % / ratio / months formatters
    useAppState.ts              # Shared team JSONB state hook (debounced upsert)
    supabase/{client,server}.ts # Re-exports of utils/supabase (import from here)
    tools.ts                    # TOOLS nav registry
  utils/supabase/
    client.ts, server.ts, middleware.ts   # @supabase/ssr client factories
    role.ts                     # getCurrentUserRole() → RPC current_user_role()
supabase/migrations/
  0001_init.sql                 # Allowlist, signup trigger, workspace tables, RLS
  0002_task_management.sql      # Roles, task tables, security-definer fns, RLS
tests/unit/                     # calculators.test.ts, permissions.test.ts
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

| Capability | super_admin | member | contractor |
|---|---|---|---|
| See calculators/tools/saved | ✅ | ✅ | ❌ (redirected to `/tasks`) |
| Create/delete projects | ✅ | ❌ | ❌ |
| Create mini-projects | ✅ | ✅ (with project access) | ❌ |
| Add contributors | ✅ | ✅ | ❌ |
| Remove contributors | ✅ | ❌ | ❌ |
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
| First-class tables | Supabase | pipeline accounts, saved calcs, projects/tasks | real rows, RLS-governed |

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
```

Supabase setup: run `supabase/migrations/0001_init.sql` then
`0002_task_management.sql` in the SQL editor. **Edit the `allowed_emails` inserts and
role updates first** — that table is the invite list and role assignment.
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is accepted as a fallback name for the anon key.

Deploy: Vercel, auto from `main`. CI must be green.

## 7. Known gaps & honest caveats (verify before "fixing", and read docs/security.md)

- **Contractor calculator lockout is route-level only.** RLS on
  `pipeline_accounts` / `app_state` / `saved_calculations` grants **all**
  authenticated users (including contractors) full access — a contractor with the
  anon key and their JWT could query business data directly. Accepted for now
  (trusted small team); tightening it means new RLS policies using
  `current_user_role()`.
- **Contributor emails are free text** — adding a contributor does not validate the
  email against `allowed_emails`; a typo'd grant silently does nothing until that
  email is invited.
- **Middleware runs an RPC per request** (`current_user_role`) for signed-in users —
  a known latency cost; if it becomes a problem, cache the role in the JWT
  (custom claims) rather than trusting a client-stored value.
- **`task_comments` is append-only by design** (no update/delete policies).
- **Signup allowlist trigger** raises inside `auth.users` insert, which Supabase
  surfaces as a generic "Database error saving new user" — the login page maps this
  to a friendly invite-only message; keep that mapping if you touch signup.
- No E2E/integration tests, no error tracking (Sentry), no rate limiting — see
  docs/testing.md and docs/security.md for the recommended order of improvement.
