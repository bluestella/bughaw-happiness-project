# Architecture

> Audience: developers/agents changing structure or adding features.
> Companion to [AGENTS.md](../AGENTS.md); DB detail in [database.md](database.md).

## 1. High-level shape

```
Browser ──▶ Next.js middleware (src/middleware.ts)
              │  refresh session cookie, auth gate, contractor route lockout
              ▼
        Next.js App Router (Vercel)
          ├─ Server components: fetch via @/lib/supabase/server (cookies → RLS)
          ├─ Client components: mutate via @/lib/supabase/client (anon key → RLS)
          └─ Route handlers: /auth/callback (OAuth exchange), /auth/signout
              ▼
        Supabase (Postgres + GoTrue Auth)
          ├─ RLS on every table  ← the actual security boundary
          ├─ security-definer fns: current_user_role(), has_project_access(),
          │                        has_mini_project_access()
          └─ before-insert trigger on auth.users → invite allowlist
```

There is **no custom API layer**. Clients talk to Supabase directly with the anon key;
authorization is entirely RLS. This is intentional: it keeps the app thin and makes
the DB the single source of truth for permissions.

## 2. Request lifecycle

1. Every request (except static assets, per the middleware `matcher`) hits
   `src/middleware.ts`, which builds a Supabase client bound to request cookies
   (`src/utils/supabase/middleware.ts`), calls `auth.getUser()` (refreshes the
   session), and:
   - unauthenticated + non-public path → redirect `/login?next=<path>`
   - authenticated on `/login` → redirect to `/` (or `/tasks` for contractors)
   - contractor on `/`, `/calculators/*`, `/tools/*`, `/saved` → redirect `/tasks`
2. Server components under `src/app/(app)/` fetch initial data server-side
   (e.g., the board page runs parallel queries for mini-project, tasks,
   contributors, role, user) and pass it to client components as props.
3. Client components perform mutations directly against Supabase and update local
   state optimistically, rolling back on error.

If Supabase env vars are missing, the middleware client factory returns
`supabase: null` and the middleware passes requests through — this is what lets
`npm run build` succeed in CI with placeholder vars.

## 3. Supabase client factories

Three factories in `src/utils/supabase/`, all resolving credentials from
`NEXT_PUBLIC_SUPABASE_URL` + (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ??
`NEXT_PUBLIC_SUPABASE_ANON_KEY`):

| File | Context | Notes |
|---|---|---|
| `client.ts` | Client components | `createBrowserClient`; throws if env missing |
| `server.ts` | Server components / route handlers | cookie-store bound; swallows cookie-set errors from RSC (middleware handles refresh) |
| `middleware.ts` | Middleware only | returns `{supabase, response}`; null-safe on missing env |

`src/lib/supabase/{client,server}.ts` are **one-line re-exports** of the above —
application code imports from `@/lib/supabase/*`. Keep both paths in sync if you
touch the factories (or consolidate; the split is historical).

## 4. The calculator engine

The core abstraction of the app. Defined in `src/lib/calculators/types.ts`:

```ts
CalculatorConfig {
  id, category, name, description, icon
  inputGroups: { id, title, fields: InputField[] }[]   // currency|number|percentage
  compute: (Inputs) => Outputs                          // PURE — the only logic
  outputs: OutputDef[]                                  // label + format + emphasis
  chart?:   (inputs, outputs) => ChartSpec              // bar|line, series, labels
  verdict?: (inputs, outputs) => { ok, text }           // go/no-go banner
}
```

- Configs live in `src/lib/calculators/configs/{unitEconomics,goToMarket,productMgmt,financial}.ts`,
  aggregated by `registry.ts` into `ALL_CALCULATORS`.
- The route `app/(app)/calculators/[category]/[calculatorId]/page.tsx` looks up the
  config (`getCalculator`) and renders `CalculatorShell` via the thin
  `CalculatorClient` wrapper.
- `CalculatorShell.tsx` handles everything generic: input rendering with ₱/% adorners,
  localStorage persistence (`bughaw-calc-<id>`), recompute via `useMemo`, output
  cards, verdict banner, Recharts chart, CSV/JSON export, and **Save to team**
  (insert into `saved_calculations`).
- The Sidebar and dashboard grid are generated from `CATEGORIES` + the registry —
  adding a config automatically wires nav, dashboard, and routing.

**Invariant:** `compute` must be a total function over `Record<string, number>` —
guard divisions, return `0` rather than `NaN`/`Infinity` (formatters render
non-finite as `—` as a second line of defense).

## 5. Migrated tools (`/tools/*`)

Hand-built pages (not config-driven) migrated from the root HTML artifacts, listed in
`src/lib/tools.ts`:

| Tool | State | Notes |
|---|---|---|
| Pipeline Simulator (`pipeline/page.tsx`, ~730 lines) | `pipeline_accounts` table + `app_state` | mini-CRM: kanban stages, scenario sim, derived CAC/LTV |
| Unit Cost Calculator | `app_state` (shared) | R&D costing table, unit conversions, amortization |
| Unit Economics Simulator | localStorage | slider-driven margin/CAC/LTV/payback |
| P&L Machine | localStorage | formula extracted to pure `src/lib/pnl.ts` (tested) |

Shared team state goes through `src/lib/useAppState.ts`: load-once on mount, merge
over defaults, debounced (700 ms) upsert of the whole JSONB doc, "Saved" status
string. **Last-write-wins; no realtime, no merging.**

## 6. Task management

Hierarchy: **project → mini-project → task (+ append-only comments)**, with
contributor grants at both project and mini-project level (project grants inherit
downward via `has_mini_project_access`).

- `tasks/page.tsx` (server) lists projects visible under RLS; `NewProjectForm` is
  super_admin-only client form.
- `[projectId]/ProjectDetail.tsx` (client): mini-project CRUD + contributor
  management, optimistic updates with rollback.
- `[projectId]/[miniProjectId]/Board.tsx` (client, ~530 lines): dnd-kit kanban across
  the three fixed statuses (`To Do` / `In Progress` / `Done`), fractional-position
  ordering (`computeNewPosition`), `TaskPanel.tsx` detail drawer with comments.
- Server pages use `export const dynamic = "force-dynamic"` where data must be fresh.

UI capability gating uses `src/lib/permissions.ts`; enforcement is RLS
(see [security.md](security.md) §3).

## 7. Established patterns (follow these)

- **Server fetch → client interact.** Initial data loads in server components,
  interactivity in `"use client"` children receiving `initial*` props.
- **Optimistic mutation with rollback.** Snapshot state, update UI, call Supabase,
  restore snapshot + `flash(message)` on error.
- **Pure logic in `src/lib`, presentational logic in components.** Anything with a
  formula or a permission decision must be importable and testable without React.
- **Declarative registries** (`registry.ts`, `tools.ts`, `CATEGORIES`) drive nav and
  routing — never hand-maintain parallel lists.
- **Email as identity key** throughout (contributors, task ownership), always
  compared case-insensitively.

## 8. Directions for growth (aligned with the existing design)

- New calculator → config + tests only (see AGENTS.md §4.3).
- New multi-writer or queryable feature → first-class table + RLS migration, not
  `app_state`.
- Role logic changes → migration first (policies/functions), then `permissions.ts`,
  then tests.
- If middleware RPC latency hurts → move role into JWT custom claims (server-verified),
  never into a cookie/localStorage the client controls.
- Realtime board updates → Supabase Realtime channels on `tasks` would slot into
  `Board.tsx` without schema changes.
