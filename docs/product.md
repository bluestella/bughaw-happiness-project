# Product

> What this app is for, who uses it, and where it's going. Product-owner view.

## 1. Context

Bughaw Innovations sells sustainable coconut-coir hotel amenities (entry product:
slippers) to Philippine hotels. The business is early-stage: validating unit
economics, running a hand-managed hotel sales pipeline, and coordinating a small
team plus external contractors. This app is the **single internal workbench** for
all of that — replacing a scatter of standalone HTML artifacts (still in the repo
root as frozen reference).

All financial figures are **PHP (₱)**. The app is internal and invite-only; there is
no public/marketing surface and none is planned without an explicit decision.

## 2. Users & roles

| Persona | Role | Primary jobs |
|---|---|---|
| Founder/owner (currently the sole super_admin) | `super_admin` | Everything: pipeline, economics modeling, project setup, roles, deletions |
| Core team | `member` | Run calculators, update pipeline, manage boards & contributors |
| External contractors | `contractor` | Task boards only — locked out of business/financial data routes |

The contractor role exists specifically so outside help can collaborate on execution
without seeing margins, CAC/LTV, or the hotel pipeline. (Note: today this is
route-level; see [security.md](security.md) §5.1 for the enforcement caveat.)

## 3. Feature inventory (shipped)

**Decision tools**
- 11 config-driven calculators in 4 categories (Unit Economics, Go-to-Market,
  Product Management, Financial Forecasting), each with CSV/JSON export, per-user
  input persistence, and shared **Save to team** snapshots browsable at `/saved`.
- Pipeline Simulator — mini-CRM over real hotel accounts (seeded with the live July
  2026 pipeline), scenario simulation, derived CAC/LTV.
- Unit Cost Calculator — R&D costing (shared team document).
- Unit Economics Simulator — slider model with a 30% margin go/no-go gate.
- P&L Machine — 12-month breakeven model.

**Execution**
- Projects → mini-projects → kanban boards (To Do / In Progress / Done), priorities,
  due dates, assignees, drag-and-drop ordering, append-only comments,
  contributor-based sharing at project or board granularity.

**Platform**
- Invite-only auth (password + Google), shared team workspace, mobile-usable UI,
  CI, Vercel deploy.

## 4. Product principles

1. **Decisions over dashboards** — every tool ends in a number-with-a-verdict the
   founder can act on (go/no-go gates, breakeven month), not vanity charts.
2. **One workbench** — new internal needs go in here, in the established design
   system, not into new artifacts/spreadsheets.
3. **Shared by default** — the team sees one truth (shared workspace); privacy tiers
   only where roles demand it.
4. **Cheap to extend** — a new calculator must stay a ~1-file change; that's the
   moat of the architecture.
5. **Trust the small team** — pragmatic security posture, documented honestly, with
   a tightening path when the team grows.

## 5. Roadmap candidates (not committed — decide before building)

From the original plan (`implementation.md` Phase 3) minus what's been superseded:

- **Near-term, high value:** role-aware RLS on workspace tables (contractor data
  lockdown); realtime board sync (Supabase Realtime); RLS integration tests.
- **Medium:** saved-calculation compare/history views; benchmarking against
  hospitality norms; PDF export; error tracking (Sentry) + analytics.
- **Speculative (explicitly NOT built, despite old plan references):** public share
  links (`/results/[shareId]`) — conflicts with the invite-only posture; an external
  API; PWA. Treat old-plan mentions of these as historical, not as requirements.

## 6. Definition of done for any new feature

- Works for the roles it's meant for and is invisible/inert for the rest
  (RLS + `permissions.ts` + tests, see AGENTS.md §4.1).
- Formulas pure and unit-tested; ₱ formatting through `format.ts`.
- Fits the design system without new one-off styles; usable at 375 px.
- State survives refresh; failures surface as plain-language flashes.
- `npm run lint && npm run test && npm run build` green; docs updated when behavior
  or schema changed (this folder + AGENTS.md).
