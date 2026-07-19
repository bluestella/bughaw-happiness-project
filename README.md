# Bughaw Calculators Hub

Internal unit-economics, go-to-market, and forecasting tools for Bughaw Innovations.
Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (Postgres + Auth). All
figures in ₱ (PHP). **Login is required for the entire app; signups are invite-only.**

## What's inside

**Live tools** (migrated from the original HTML artifacts, under `/tools/*`):

| Tool | Source artifact | Persistence |
|------|-----------------|-------------|
| Pipeline Simulator (mini-CRM: tracker, scenario sim, derived CAC/LTV) | `bughaw_pipeline_simulator.html` | Supabase `pipeline_accounts` + `app_state` (shared) |
| Unit Cost Calculator (R&D costing table) | `bughaw_cost_calculator.html` | Supabase `app_state` (shared) |
| Unit Economics Simulator (sliders: margin, CAC, LTV, payback) | `bughaw_slipper_unit_economics_simulator.html` | localStorage |
| P&L Machine (12-month breakeven model) | `bughaw_p2_slipper_pnl_machine.html` | localStorage |

**11 config-driven calculators** under `/calculators/[category]/[id]` — COGS %,
Wholesale Margin, Payback Period, Hotel Penetration, Repeat Order Rate, Break-Even by
Channel, Inventory Turnover, Product Mix Margin, LTV by Segment, Cash Flow Projection,
Growth Scenario Modeling. Each has CSV/JSON export, localStorage input persistence,
and a **Save to team** button (shared `saved_calculations` table, browsable at `/saved`).

## Setup

### 1. Supabase project

1. Create a project at [database.new](https://database.new).
2. Open the SQL editor and run `supabase/migrations/0001_init.sql`. **Edit the
   `allowed_emails` insert first** — every teammate who should be able to sign up must
   be listed (you can add more later from the Table Editor).
3. Auth settings:
   - Email provider is on by default. Optionally disable "Confirm email" for a smoother
     internal-tool flow (Authentication → Providers → Email).
   - For Google sign-in: Authentication → Providers → Google, add your OAuth client ID
     and secret, and add `https://<your-domain>/auth/callback` (and
     `http://localhost:3000/auth/callback`) to the redirect allowlist. The DB trigger
     still enforces the allowlist for Google signups.

### 2. Environment

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 3. Run

```bash
npm install
npm run dev     # http://localhost:3000 → redirects to /login
npm run test    # vitest formula tests
npm run build
```

### 4. Deploy (Vercel)

Import the repo in Vercel, set the two `NEXT_PUBLIC_SUPABASE_*` env vars, deploy.
CI (`.github/workflows/ci.yml`) runs lint + tests + build on every push/PR to `main`.

## How auth works

- `src/middleware.ts` refreshes the Supabase session and redirects any signed-out
  request to `/login` (only `/login` and `/auth/*` are public).
- Signups hit a `before insert` trigger on `auth.users` that rejects any email not in
  `public.allowed_emails` — this covers email/password *and* OAuth.
- All data tables use RLS policies granting full access to the `authenticated` role:
  one shared team workspace, nothing is per-user private.

## Architecture notes

- Calculator definitions live in `src/lib/calculators/configs/*` as declarative
  configs (`inputGroups` + `compute` + `outputs` + optional `chart`/`verdict`).
  `src/components/CalculatorShell.tsx` renders any config — adding a calculator is one
  config object plus a registry entry, no new pages.
- `src/lib/useAppState.ts` replaces the artifacts' `window.storage` with debounced
  upserts into the shared `app_state` JSONB table.
- The original HTML artifacts remain at the repo root for reference; the plan is in
  `implementation.md`.
