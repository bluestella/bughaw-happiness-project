# Product

> What this app is for, who uses it, and where it's going. Product-owner view.

## 1. Context

Bughaw Innovations sells sustainable coconut-coir hotel amenities (entry product:
slippers) to Philippine hotels. The business is early-stage: validating unit
economics, running a hand-managed hotel sales pipeline, and coordinating a small
team plus external contractors. This app is the **single internal workbench** for
all of that — replacing a scatter of standalone HTML artifacts (still in the repo
root as frozen reference).

All financial figures are **PHP (₱)**. The app is internal and invite-only. The one
explicitly decided exception (Oct 2026) is the public digital business card at
`/c/<token>` — see [digital-cards.md](digital-cards.md).

## 2. Users & roles

| Persona | Role | Primary jobs |
|---|---|---|
| Founder/owner (currently the sole super_admin) | `super_admin` | Everything: pipeline, economics modeling, project setup, roles, deletions |
| Core team | `member` | Run calculators, update pipeline, manage boards & contributors |
| External contractors | `contractor` | Task boards only by default — locked out of business/financial data and the CRM (enforced by RLS, not just routing) |

The contractor role exists specifically so outside help can collaborate on execution
without seeing margins, CAC/LTV, or the hotel pipeline.

**Page access (0010).** Roles only set *defaults*. A super_admin can change what
each role sees by default, and allow or deny any section (CRM, Projects & boards,
Calculators, Saved calculations) or tool page for one person, at **Admin → Page
access** (`/admin/access`). Super admins always see everything.

## 3. Feature inventory (shipped)

**Decision tools**
- 26 config-driven calculators in 4 categories (Unit Economics, Go-to-Market,
  Product Management, Financial Forecasting), each with CSV/JSON export, per-user
  input persistence, and shared **Save to team** snapshots browsable at `/saved`.
  Added in Wave 2 for selling and fundraising: Sales Velocity, Pipeline Forecast,
  TAM/SAM/SOM, Volume Price Tiers, Landed Cost per Delivery, Profit Sensitivity,
  Round Dilution, SAFE Conversion, Use of Funds, Cash Conversion Cycle, and Batch
  Yield. Their default numbers are illustrative placeholders, not Bughaw's figures.
- Pipeline Simulator — mini-CRM over real hotel accounts (seeded with the live July
  2026 pipeline), scenario simulation, derived CAC/LTV.
- Unit Cost Calculator — R&D costing (shared team document).
- Unit Economics Simulator — slider model with a 30% margin go/no-go gate.
- P&L Machine — 12-month breakeven model.

**Revenue**
- CRM (`/crm`) — every submission from the three bughawinnovations.ph forms
  (contact, hotel pilot, product inquiry), deduped into accounts and contacts, on a
  six-stage funnel board (New → Acknowledged → Qualified → Pilot Scoping → Closed
  Won/Lost) with an append-only activity log, notes, CSV export, manual entry, CSV
  import, and one-click promotion into the Pipeline Simulator. Intake is a
  secret-authenticated endpoint the marketing site mirrors submissions to.
  Each lead carries a deal: value, expected close, next action with a due date,
  sample dates, and a required reason when it is lost. The board shows open and
  stage-weighted pipeline totals and a Follow-ups tab (overdue, today, next 7 days).
  Accounts have a buyer segment (hotel, resort, spa, other business).

**Sales** (`/sales`, section `sales`)
- Quotations built from a CRM lead or account, priced from per-product volume tiers,
  numbered (Q-2026-0001), sent, accepted or declined, and revised as new versions.
- Sales orders created from an accepted quotation: they reserve stock, are delivered
  (which takes the pairs out of stock) and are paid. The **official BIR invoice is
  issued from your booklet**; its number is typed in here. Every printed document says
  it is not an official receipt or invoice.
- Stock: finished pairs on hand, reserved and free to sell, with a history. Only a
  super_admin adjusts it by hand, and only a super_admin can confirm an order beyond
  free stock or cancel an order.

**People** (`/people`, section `people`)
- Interns record hours and what they did each day (last 7 days, never ahead), build a
  weekly report from the log, and submit it. Their supervisor approves it or returns it
  with a comment; a super_admin sees every intern's hours, progress against the school's
  required hours, and report status. Approved reports print for the school with
  signature spaces. Interns see only their own records. No screen, location or activity
  tracking: only reviewed output.

**Finance** (`/finance`, section `finance`, off by default for members and contractors)
- Cash on hand (dated snapshots), expenses with a category, vendor, receipt number and a
  void-with-reason (never deleted), a monthly budget per category compared with what was
  spent, the average monthly spending over the last three complete months, and the months of
  runway that gives. A CSV export for the accountant. It is a working view, not bookkeeping:
  there is no ledger and no tax treatment.

**Strategy worksheets** (`/strategy`, section `strategy`, on for members by default)
- Six saved frameworks, each a short form that works out its own result: Porter's Five Forces
  (market attractiveness), Three Horizons (effort against a 70/20/10 starting point), Balanced
  Scorecard (progress to target across four perspectives), RICE (ranked ideas), the nine-box
  grid (performance against potential) and the Sean Ellis survey (40% very disappointed is the
  fit line). Anyone with the section can edit; a save is refused if someone saved a newer
  version; only a super_admin deletes.

**Outreach**
- Digital business cards (`/admin/cards`, super_admin only): branded cards with
  link, QR, NFC, email-signature and `.vcf` sharing, Apple/Google Wallet passes
  (dormant until keys are configured), and counts-only analytics. Published cards
  are public at `/c/<random token>`. Plan and decisions:
  [digital-cards.md](digital-cards.md).

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
