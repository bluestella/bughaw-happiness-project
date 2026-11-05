# UI Testing Plan — Playwright E2E for Bughaw Suite

> **Status: plan, not yet implemented** (written 2026-11-05). Use this as the blueprint
> for building the UI test framework. As phases land, update §5 and remove the matching
> "Day-one findings" in §6 once their issues are filed.

## Context

Bughaw Suite has 11 Vitest suites covering pure logic in `src/lib/`. Nothing tests the real UI:
no Playwright, no component tests, and no `data-testid` attributes anywhere. Today the UI is
checked by hand, using the manual QA checklist in `docs/testing.md` §4. `docs/testing.md` §3
lists a "Playwright E2E smoke test" as a missing suite.

**Goal:** a Playwright framework that drives the real app against a real (local) Supabase,
signing in as each role. Every failure becomes a tracked GitHub Issue that a fix PR closes,
with a regression test attached. This document is the blueprint for building it.

**Decisions already made**
- Backend: **local Supabase CLI** (Docker), migrations 0001–0009 applied, seeded per run.
- Reporting: **GitHub Issues are created automatically** from CI failures.
- Cadence: a **`@smoke` subset gates every PR**. The **full suite runs nightly** and on demand.
- Scope: functional tests, plus **accessibility (axe)**, **visual regression**, **mobile
  viewport** and **security/role** checks.

---

## 1. Architecture

```
playwright.config.ts                 # projects, webServer, reporters
tests/e2e/
  tsconfig.json                      # extends root; root tsconfig excludes tests/e2e
  global-setup.ts                    # safety guard + baseline snapshot + seed users/fixtures
  global-teardown.ts                 # diff-delete back to baseline + leak check (§1.1)
  auth.setup.ts                      # "setup" project: UI login per role → storageState
  fixtures.ts                        # test.extend: asRole(), db (admin client), uniq(), a11y
  support/
    env.ts                           # loads .env.e2e; REFUSES to run unless URL is 127.0.0.1/localhost
    admin.ts                         # service-role supabase-js client (TEST-ONLY)
    seed.ts                          # users via auth.admin.createUser; fixture rows
    baseline.ts                      # snapshot / diff-delete / leak check (§1.1)
    dnd.ts                           # dragTo(): mouse.down → stepped move (>5px) → mouse.up
    downloads.ts                     # expectDownload(page, click, /name/) → parsed content
    a11y.ts                          # axe scan + known-violations baseline filter
  a11y/known-violations.json         # route+ruleId → GitHub issue #, so known gaps don't fail
  specs/
    auth.spec.ts  nav.spec.ts  rbac.spec.ts  calculators.spec.ts  saved.spec.ts
    tools/{pipeline,cost-calculator,unit-economics,pnl,funding,qr-studio}.spec.ts
    tasks/{projects,board,task-panel}.spec.ts
    crm/{board,lead-panel,new-lead,import,ingest-api}.spec.ts
    admin/{allowlist,cards}.spec.ts
    public-card.spec.ts  security.spec.ts  a11y.spec.ts  visual.spec.ts
scripts/e2e/
  env.sh                             # `supabase status -o env` → .env.e2e
  report-issues.mjs                  # Playwright JSON report → create/update/close GitHub Issues
supabase/config.toml                 # from `supabase init`; email confirmations off, google provider stub
supabase/seed.sql                    # allowlist rows + ingest secret (LOCAL ONLY — header warns)
```

### Key choices
- **Runner:** `@playwright/test` (latest stable, version pinned) and `@axe-core/playwright`.
  Specs are `*.spec.ts` under `tests/e2e/`. Vitest only collects `tests/**/*.test.ts`, so the
  two suites never collide.
- **Server:** the `webServer` runs `next build && next start` on :3000 in CI, which matches
  production. Locally it reuses `npm run dev` (`reuseExistingServer: !process.env.CI`).
- **Browsers / projects:**
  | Project | Device | Runs |
  |---|---|---|
  | `setup` | — | auth.setup.ts (dependency of all) |
  | `chromium` | Desktop Chrome | all functional, rbac, security, a11y |
  | `mobile-chromium` | Pixel 7 | `@mobile` tests |
  | `mobile-webkit` | iPhone 14 | `@public` + `@mobile` (customers open cards on iPhones) |
  | `visual` | Desktop Chrome, fixed viewport | `visual.spec.ts`, nightly only |
- **Auth:** the `setup` project signs in through the real login form once per role and saves
  `playwright/.auth/{super_admin,member,contractor}.json`. Specs pick a role with
  `test.use({ storageState: authFile('member') })` or the `asRole()` fixture. Logging in
  through the UI also exercises the login page itself.
- **Selectors:** in priority order, `getByRole` / `getByLabel` / `getByPlaceholder` /
  `getByText`. Use the stable ids the app already has: tab ids `{idBase}-tab-{id}`, form ids
  like `#nl-email` and `#card-full-name`, and `data-track` on the public card. **Don't add
  `data-testid` by default.** When an element has no accessible name, that is an a11y bug: fix
  it by adding a label, and log it (see §6, "Day-one findings").
- **Data isolation** (the hard rule is §1.1 below):
  - CI runs `supabase db reset` once, which applies the migrations and `seed.sql`.
  - Tests that create rows use a `uniq('E2E Project')` helper, which appends the worker index
    and a timestamp.
  - Specs that touch **shared `app_state` keys** (`cost-calc`, `pipeline-sim`,
    `pipeline-econ`) run with `test.describe.configure({ mode: 'serial' })`. They reset their
    row through the admin client in `beforeEach`.
  - Tests that read localStorage start from a fresh context, so storage is empty by default.
- **Tags:** `@smoke`, `@mobile`, `@public`, `@a11y`, `@visual`, `@security`, plus `@area-*`.
  Each test title starts with its case ID, for example
  `test('TC-AUTH-01 password sign-in lands on dashboard', { tag: ['@smoke'] , annotation: { type: 'severity', description: 'blocker' } }, …)`.
  The issue reporter reads the ID and severity from there.
- **Retries / artifacts:** CI uses `retries: 2`. Settings are `trace: 'on-first-retry'`,
  `screenshot: 'only-on-failure'` and `video: 'retain-on-failure'`. Reporters are `html`,
  `json` (`test-results/report.json`, read by the issue script), `github` (inline PR
  annotations) and `list`.

### 1.1 The test-data rule: tests leave nothing behind

**No test may leave data in any database.** E2E tests write only to the throwaway local
Supabase, and everything they write is removed automatically when the run ends. A run that
can't clean up after itself fails.

1. **Never a real database.** `tests/e2e/support/env.ts` refuses to start unless
   `NEXT_PUBLIC_SUPABASE_URL` points at `127.0.0.1` or `localhost`. No hosted project
   (production or staging) is ever a test target, and there's no flag to override this.
2. **Baseline snapshot, then diff-delete.** `global-setup.ts` snapshots every public table
   (primary keys), the `app_state` values and the `auth.users` list **before** it seeds
   anything. That snapshot is the baseline: the state right after `supabase db reset`.
   `global-teardown.ts` then:
   - deletes every row whose key isn't in the baseline. This covers global-setup fixtures,
     rows made through the UI, rows made by the ingest API and rows left by crashed tests;
   - restores every `app_state` value to its baseline (or deletes keys that didn't exist);
   - deletes every auth user created during the run (the seeded test users included).

   Cleanup doesn't depend on tests tracking what they create, so a test that dies halfway
   still gets cleaned up.
3. **Leak check.** After cleanup, teardown snapshots again and compares the result with the
   baseline. Any difference fails the run and lists the leftover rows by table. Teardown runs
   even when tests fail.
4. **Per-test cleanup when tests share a worker.** Tests that need a clean slate mid-run
   (for example the shared `app_state` keys) use the `db` fixture to reset or delete their own
   rows in `beforeEach`/`afterEach`. Don't rely on another test's leftovers.
5. **Mark test data.** Use `uniq()` for every name, label and email a test types. It prefixes
   `[e2e]` so a stray row is obvious in the UI. Teardown uses the baseline diff, not this
   marker, so the marker is only a visual hint.
6. **CI destroys the database.** The CI jobs end with `supabase stop --no-backup`, so even the
   local container's volume is thrown away.
7. **Locally, run `npm run e2e:clean`** after an interrupted run (Ctrl-C can skip teardown).
   It runs the same diff-delete against the saved baseline (`playwright/.baseline.json`).
   `npm run e2e:db` (a full `supabase db reset`) also returns the DB to baseline.

### Required app/repo changes (Phase 0)
1. **CSP (`next.config.js`).** The policy currently blocks local Supabase:
   `connect-src 'self' https:` rejects `http://127.0.0.1:54321`, and
   `upgrade-insecure-requests` rewrites requests to https.
   - Derive the Supabase origin from `NEXT_PUBLIC_SUPABASE_URL`.
   - **Only when that origin is `http:`**, add it to `connect-src` and drop
     `upgrade-insecure-requests` and HSTS.
   - Production uses an https URL, so its headers stay byte-identical. Add a Vitest case for
     the header builder (extract it into `src/lib/securityHeaders.ts`).
2. **Service-role key, test tooling only.** It lives in `.env.e2e` (gitignored) and is written
   by `scripts/e2e/env.sh` from `supabase status`. Only `tests/e2e/support/admin.ts` reads it.
   Two guards:
   - An ESLint `no-restricted-imports` rule in `src/**` forbids importing `tests/**`.
   - `env.ts` throws if the URL host isn't `127.0.0.1` or `localhost`, so tests can never touch
     production.

   This keeps the AGENTS.md rule "no service-role key in the app". Document it in
   `docs/security.md` and `.env.example`, as AGENTS.md §5 requires for any new secret.
3. **Local Supabase.** Run `supabase init` to create `config.toml`:
   - email confirmations off;
   - a stub Google provider, so the OAuth redirect can be asserted;
   - `site_url = http://localhost:3000`.

   `seed.sql` inserts the allowlist rows (`admin@test.local` super_admin, `member@test.local`,
   `contractor@test.local`, `newhire@test.local` member and not yet registered) and the
   `crm_ingest_secrets` row with value `e2e-ingest-secret`. Migrations 0001 and 0002 also
   allowlist the owner email; tests ignore that row.
4. **`global-setup.ts`.** Creates the three registered users with
   `auth.admin.createUser({ email_confirm: true })`, then inserts fixed-UUID fixtures:
   - one project with Contractor as a contributor, plus one mini-project;
   - tasks created by both Member and Contractor;
   - 3 CRM leads across stages;
   - one published card, one draft card and one rotated card token.
5. **package.json scripts:** `e2e`, `e2e:smoke` (`--grep @smoke --project=chromium`), `e2e:ui`,
   `e2e:clean` (diff-delete back to the saved baseline, §1.1),
   `e2e:db` (`supabase start && supabase db reset && scripts/e2e/env.sh`), `e2e:visual:update`
   (runs in the Playwright Docker image so baselines match CI Linux).
6. **.gitignore:** `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.auth/`,
   `.env.e2e`.

---

## 2. CI & issue-reporting loop

### Workflows
- **`ci.yml` (existing).** Add a job `e2e-smoke` that runs after `test`:
  - setup-node 22, then `npm ci` and `npx playwright install --with-deps chromium`;
  - `supabase/setup-cli` action, then `supabase start` and `supabase db reset`, then
    `scripts/e2e/env.sh`;
  - `npm run e2e:smoke`;
  - upload `playwright-report/` as an artifact (always);
  - `supabase stop --no-backup` (always), so the database is destroyed (§1.1).
  - Budget: about 6 minutes. It gates merges to `main`.
- **`e2e-nightly.yml` (new).**
  - Triggers: `schedule` (cron 18:00 UTC = 02:00 Manila) and `workflow_dispatch`.
  - Runs every project, including `visual`, inside the `mcr.microsoft.com/playwright` image
    pinned to the installed version.
  - Uploads the report and traces, then runs `report-issues.mjs` with permissions
    `issues: write`.

### `scripts/e2e/report-issues.mjs` (runs via `actions/github-script` / Octokit)
1. Parse `test-results/report.json`.
2. **Fingerprint** each test as `sha1(project + file + titlePath)`. Store it in the issue body
   as `<!-- e2e-fingerprint: … -->`.
3. A test whose final status is **failed** (still failing after retries) is handled as
   follows:
   - Search open issues labeled `e2e-failure` for the fingerprint.
   - **If none exists, create one:**
     - Title: `[E2E] TC-XXX-NN <title> (<project>)`.
     - Body: error message and stack excerpt, the `test.step` trail as repro steps, role,
       URL, a link to the run's HTML report and trace artifact, and the failing screenshot
       name.
     - Labels: `e2e-failure`, `area:<x>`, `severity:<blocker|major|minor>` from the
       annotation, plus `a11y` or `visual` when the spec is one of those.
   - **If one exists**, add a comment with the new run link (de-duplicated, so there's no
     issue spam).
4. A test that passed only after a retry is a **flaky** pass. Create or update a single
   rolling issue labeled `flaky` that lists the tests.
5. When a **previously failing fingerprint passes** on a nightly run of `main`, comment
   "Passing since run X" and close the issue.
6. Write a summary table to `$GITHUB_STEP_SUMMARY`.

PR runs **don't** create issues, because branches are work in progress. PR authors see failures
through the `github` reporter annotations and the uploaded report.

### Human-found issues
Add `.github/ISSUE_TEMPLATE/ui-bug.yml`, a form with fields for area, role, URL, steps,
expected vs actual, screenshot and severity. It applies the same labels, so manual exploratory
findings go into the same queue.

### Fix loop (definition of done for a UI bug)
1. Issue exists (automatic or manual).
2. The fix PR **adds or updates the test case that reproduces it.** For a manually found bug,
   that means a new `TC-*` test, written to fail before the fix.
3. The PR body says `Fixes #N`, and its smoke CI passes.
4. The nightly run confirms the fix (for automatic issues, the reporter auto-closes them).
5. For a11y baseline entries, the fix PR also deletes the entry from `known-violations.json`.

Labels to create once: `e2e-failure`, `flaky`, `a11y`, `visual`, `severity:blocker`,
`severity:major`, `severity:minor`, and `area:{auth,nav,calculators,tools,tasks,crm,admin,public-card,security}`.

---

## 3. Use cases

| ID | Actor | Use case |
|---|---|---|
| UC-01 | Any invitee | Sign in (password / Google), sign out, get bounced to login when signed out |
| UC-02 | Uninvited person | Attempt signup and get a clear invite-only refusal |
| UC-03 | All roles | Navigate via sidebar, command palette (⌘K), mobile drawer — seeing only what their role allows |
| UC-04 | Admin/member | Run a calculator, tweak inputs, export CSV/JSON, save to team, revisit in Saved |
| UC-05 | Admin/member | Use the shared tools: pipeline sim + real pipeline accounts, unit-cost calc + printable report, unit-econ sim, P&L, funding, QR Studio |
| UC-06 | Super admin | Create/delete projects and mini-projects; manage contributors |
| UC-07 | All roles w/ access | Work a kanban board: add tasks, drag across columns, edit in panel, comment |
| UC-08 | Contractor | Work only on boards they're added to; edit only own tasks; locked out of business tools |
| UC-09 | Marketing site (system) | Post a lead to `/api/crm/ingest`, which shows up in the CRM |
| UC-10 | Admin/member | Work the CRM funnel: filter, drag stages, open lead, add notes, promote to pipeline, export |
| UC-11 | Admin/member | Add a lead manually; import leads by pasting CSV/JSON with a dry-run preview |
| UC-12 | Super admin | Manage the allowlist (invite, role, remove) |
| UC-13 | Super admin | Create/edit/publish digital cards, share (link/QR/signature), rotate token, view analytics |
| UC-14 | Public visitor | Open a card at `/c/<token>`, save the vCard, tap contact links |
| UC-15 | Everyone | Use the app accessibly (keyboard, screen-reader names, contrast) and on a phone |

---

## 4. Test cases

**Legend:** **S** = `@smoke` (runs on PRs). Roles: A = super_admin, M = member, C = contractor,
P = public/anonymous. The **Sev** column is the severity used when the test fails
(B = blocker, Mj = major, Mn = minor).

### 4.1 Auth — `auth.spec.ts` (UC-01, UC-02)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-AUTH-01 | S | M | Fill Email/Password, click "Sign in" → lands on `/`, header shows email | B |
| TC-AUTH-02 | S | C | Sign in → lands on `/tasks` | B |
| TC-AUTH-03 | S | P | Visit `/crm` signed out → redirected to `/login?next=%2Fcrm`; after sign-in lands on `/crm` | B |
| TC-AUTH-04 | | P | Wrong password → `role=alert` "Invalid email or password…" | Mj |
| TC-AUTH-05 | S | P | "Create one" → signup with uninvited email → "Signups are invite-only. Ask a Bughaw admin…" | B |
| TC-AUTH-06 | | P | Signup with `newhire@test.local` (allowlisted) → signed in, lands on `/` | Mj |
| TC-AUTH-07 | | P | "Continue with Google" → request to `/auth/v1/authorize?provider=google` with `redirect_to` containing `/auth/callback?next=` (route intercepted, not followed) | Mj |
| TC-AUTH-08 | | P | `/login?error=auth` → "Sign-in failed. Try again." | Mn |
| TC-AUTH-09 | S | M | Click "Sign out" → `/login`; visiting `/` again redirects to login | B |
| TC-AUTH-10 | | M | Signed-in user visits `/login` → redirected to `/` (contractor → `/tasks`) | Mn |
| TC-AUTH-11 | | P | Password < 6 chars → browser validation blocks submit | Mn |

### 4.2 Navigation — `nav.spec.ts` (UC-03)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-NAV-01 | S | A | Sidebar shows Dashboard, Calculators, Saved, CRM (Lead funnel, Import leads), Projects & boards, all 6 Tools, Admin (Allowlist, Digital cards) | Mj |
| TC-NAV-02 | S | M | Same as A **minus** Admin section | Mj |
| TC-NAV-03 | S | C | Only Dashboard + Projects & boards visible; no Calculators/Saved/CRM/Tools/Admin | B |
| TC-NAV-04 | | A | Active link has `aria-current="page"` on each section | Mn |
| TC-NAV-05 | | M | ⌘K/Ctrl+K opens palette; type "P&L" → arrow + Enter navigates to `/tools/pnl`; nonsense → "No matches." | Mn |
| TC-NAV-06 | | C | Palette results exclude calculators/tools/CRM | Mj |
| TC-NAV-07 | | M | Dashboard: H1 "Bughaw Suite", 6 featured tool cards each link to the right route | Mn |
| TC-NAV-08 | | M | Unknown calculator id / project id / `/tools` → 404 page (documents current behavior) | Mn |

### 4.3 Role enforcement — `rbac.spec.ts` (UC-08, `@security`)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-RBAC-01 | S | C | Direct-visit `/`, `/calculators`, `/calculators/unit-economics/cogs`, `/tools/pipeline`, `/saved`, `/crm`, `/crm/import` → each ends at `/tasks` | B |
| TC-RBAC-02 | S | M, C | Direct-visit `/admin/allowlist`, `/admin/cards` → `/tasks` | B |
| TC-RBAC-03 | | M | `/tasks`: no "New Project" button; project page: no "Delete project", no contributor "Remove" | Mj |
| TC-RBAC-04 | | C | Project page: no "New Mini-Project", no UserPicker | Mj |
| TC-RBAC-05 | | C | Board: own task is draggable/editable; Member's task opens panel with "Read-only — not your task." | B |
| TC-RBAC-06 | | C | Projects list shows only the project they're a contributor on | B |
| TC-RBAC-07 | | C | **RLS check through the browser session:** `page.evaluate` a supabase-js `select` on `saved_calculations`, `pipeline_accounts`, `crm_leads` with contractor's session → 0 rows / error (verifies migration 0004 vs stale docs/security.md §5.1) | B |
| TC-RBAC-08 | | M | LeadPanel shows no delete affordance (CRM delete = super_admin only) | Mj |

### 4.4 Calculators & Saved — `calculators.spec.ts`, `saved.spec.ts` (UC-04)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-CALC-01 | | M | Catalog: "All" lists 15; each category tab filters correctly; search "runway" → 1 result; "zzz" → `No calculators match “zzz”.` | Mj |
| TC-CALC-02 | S* | M | **Data-driven over all 15 configs** (registry import): page renders H1, every output StatCard shows no `NaN`/`Infinity`/`undefined` (`—` allowed); *only `cogs` in smoke* | B |
| TC-CALC-03 | | M | Change first input on each calculator → at least one output changes | Mj |
| TC-CALC-04 | | M | COGS golden value: set known inputs → expected ₱/% output formatted `en-PH` | Mj |
| TC-CALC-05 | | M | Edit input, reload → value persists (localStorage `bughaw-calc-{id}`); "Reset defaults" restores | Mj |
| TC-CALC-06 | | M | "Export CSV" → download `bughaw-cogs.csv`, parse: header + input/output rows; "Export JSON" → valid JSON with inputs/outputs | Mj |
| TC-CALC-07 | S | M | "Save to team" → label `uniq()` → "Save" → toast "Saved to team workspace."; `/saved` lists it | B |
| TC-CALC-08 | | A | Snapshot saved by M is visible to A (team-shared) | Mj |
| TC-SAVED-01 | | M | Saved row "Open calculator" → correct calculator route | Mn |
| TC-SAVED-02 | | M | "Delete" → ConfirmDialog "Delete snapshot?" → confirm → row gone, toast "Snapshot deleted." | Mj |
| TC-SAVED-03 | | M | Empty state text when no rows (fresh DB via admin delete) | Mn |

### 4.5 Tools — `tools/*.spec.ts` (UC-05)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-PIPE-01 | S | M | Real Pipeline tab → "Add account" → fill name/contact/segment/stage → Save → card appears in stage column; reload persists | B |
| TC-PIPE-02 | | M | Save with empty name → toast "Give the account a name first." | Mn |
| TC-PIPE-03 | | M | Set stage Disqualified → "Why disqualified" textarea appears; card moves under "Disqualified — do not re-chase (N)" toggle | Mn |
| TC-PIPE-04 | | M | Edit → Delete → ConfirmDialog "Delete account?" → gone, toast "Deleted." | Mj |
| TC-PIPE-05 | | M | Simulator: "Everyone advances one stage" changes verdict/projections; "Reset to current state" restores; add hypothetical lead (empty name → toast), "Remove {name}" | Mj |
| TC-PIPE-06 | | M | Unit Economics tab: sub-tabs switch; "Reveal ▸" steps until "All revealed"; "Show all" | Mn |
| TC-PIPE-07 | | M,A | Shared state: M changes sim, status "Saved"; A in second context reloads → sees change (last-write-wins documented) | Mj |
| TC-COST-01 | S | M | Page loads seeded example; totals show ₱ values; status "Saved" after edit | B |
| TC-COST-02 | | M | "Add material" → new row with labelled inputs ("Item name", "Pack price of … in pesos"); totals update | Mj |
| TC-COST-03 | | M | "Remove {x}" → toast with "Undo" → Undo restores row | Mj |
| TC-COST-04 | | M | Incompatible units → `role=alert` banner + row "Check units" | Mj |
| TC-COST-05 | | M | Clear `#per-pair` → "Waiting for the amount per pair"; `#target-pairs` empty → "Enter the number of pairs to see the plan." | Mn |
| TC-COST-06 | | M | "Reset to starting example" → ConfirmDialog confirm "Reset for everyone" → example restored | Mj |
| TC-COST-07 | | M | "Generate report" → `/report`; edit `#report-title` → H1 updates; "Download CSV (Excel)" → `{slug}-{YYYY-MM-DD}.csv` starts with UTF-8 BOM; "Print / Save as PDF" calls `window.print` (stubbed) | Mj |
| TC-UE-01 | | M | Slider text input `ue-*` and range stay in sync; StatCards (Contribution, LTV, LTV:CAC, CAC payback) update; gate banner flips "clears gate"/"below gate" at threshold | Mj |
| TC-UE-02 | | M | Persists across reload; "Reset to defaults" | Mn |
| TC-PNL-01 | | M | Adjust `pnl-*` sliders → "Breakeven month" changes, extreme inputs → "Not within 12 mo"; chart `role=img` present; "About {label}" tooltip opens | Mj |
| TC-FUND-01 | | M | Each tab (Equity/SAFE/JV/Loan/Compare) renders; `aria-pressed` toggles switch input modes; no NaN; persists | Mj |
| TC-QR-01 | S | M | Enter Destination URL → canvas aria-label changes from "(empty)"; "Download QR as PNG" → `*-qr.png` (valid PNG magic bytes) | Mj |
| TC-QR-02 | | M | "Contact card only" + name/email → "Download .vcf" content has `BEGIN:VCARD`, `FN:`, `EMAIL`; "Copy vCard" → clipboard matches | Mj |
| TC-QR-03 | | M | "Build landing page" → `*-page.html` download, button label "Page built — rename it index.html" | Mn |
| TC-QR-04 | | M | Warnings: empty URL, very long URL, logo > 23% → `role=status` warnings; non-image logo upload → toast "Choose an image file." | Mn |

### 4.6 Tasks — `tasks/*.spec.ts` (UC-06, UC-07, UC-08)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-TASK-01 | S | A | "New Project" → name `uniq()` → Create → navigates to `/tasks/{id}` | B |
| TC-TASK-02 | | A | Empty project name → Create blocked/inline error | Mn |
| TC-TASK-03 | | M | "New Mini-Project" → Create → card appears, links to board | Mj |
| TC-TASK-04 | | M | UserPicker "Add a teammate…" → pick C → appears in contributors; add again → toast "Already a contributor." | Mj |
| TC-TASK-05 | | A | Contributor "Remove" → gone (and C loses access → C's project list no longer shows it) | Mj |
| TC-TASK-06 | | A | "Delete {mini}" and "Delete project" → ConfirmDialogs → redirect to `/tasks`, gone | Mj |
| TC-TASK-07 | S | M | Board: "+ Add task" in To Do → "Task title" → Add → toast "Task created.", column count +1 | B |
| TC-TASK-08 | S | M | Drag card To Do → In Progress (dnd helper) → counts update; **reload → still in In Progress** | B |
| TC-TASK-09 | | M | Reorder within column → order persists after reload (fractional position, single write) | Mj |
| TC-TASK-10 | | C | Drag Member's task → not draggable / toast "You can only move tasks you created." and card snaps back | B |
| TC-TASK-11 | | M | Open card → TaskPanel: edit title, description, Status, Priority, Assignee, Due date → Save → card aria-label reflects new values | Mj |
| TC-TASK-12 | | M | "Delete task" → ConfirmDialog → removed | Mj |
| TC-TASK-13 | | M | Comment "Add a comment…" → Post → appears; no edit/delete controls on comments (append-only) | Mn |
| TC-TASK-14 | | M | Board contributors: add board-specific contributor; "Inherited: …" lists project contributors | Mn |

### 4.7 CRM — `crm/*.spec.ts` (UC-09, UC-10, UC-11)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-CRM-01 | S | M | `/crm` Funnel shows 6 columns with seeded leads; "All leads" tab shows table | B |
| TC-CRM-02 | | M | Search "Search leads", "Filter by source form", "Filter by engagement tier" → "X of Y" counter + visible cards update | Mj |
| TC-CRM-03 | | M | "Export CSV" → `bughaw-leads-YYYY-MM-DD.csv` row count = filtered count; impossible filter → toast "Nothing to export…" | Mj |
| TC-CRM-04 | | M | Drag lead New → Qualified → persists after reload; LeadPanel activity shows a status_change entry | B |
| TC-CRM-05 | | M | Open lead → status select change → toast "Status updated."; add note → appears in Activity | Mj |
| TC-CRM-06 | | M | "Promote to pipeline account" → "Open the simulator →" → `/tools/pipeline` Real Pipeline shows account | Mj |
| TC-CRM-07 | S | M | "New lead" → General contact, valid → "Add lead" → toast "Lead and contact created."; card in New | B |
| TC-CRM-08 | | M | Validation: blank name → "Full name is required."; bad email → "Enter a valid email address."; short message → "Message must be at least 10 characters." (`role=alert`) | Mj |
| TC-CRM-09 | | M | New lead with existing contact's email → toast "Lead added to the existing contact." | Mj |
| TC-CRM-10 | | M | Hotel pilot / Product inquiry forms swap fields (`#nl-hotel`, `#nl-product`…) and submit | Mn |
| TC-CRM-11 | | M | Import: paste contact CSV (1 new, 1 existing, 1 invalid email, 1 honeypot) → "Check rows" → "1 new · 1 existing contact · 2 invalid" with reasons → "Import 2 row(s)" → toast "Imported 2 leads."; they appear on board | B |
| TC-CRM-12 | | M | Import garbage → "Could not parse: …"; JSON array input also accepted | Mn |
| TC-INGEST-01 | S | P | `request.post('/api/crm/ingest')` with `x-bughaw-ingest-secret: e2e-ingest-secret` + valid contact payload → 200; then M sees lead on board (cross-surface) | B |
| TC-INGEST-02 | | P | Missing/wrong secret → 401 "Unauthorized." | B |
| TC-INGEST-03 | | P | Invalid JSON → 400 "Invalid JSON body."; unknown form → 400 with `details.form`; field errors → 400 | Mj |
| TC-INGEST-04 | | P | Honeypot filled → 200-shaped response, **no** lead created | Mj |

### 4.8 Admin — `admin/*.spec.ts` (UC-12, UC-13)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-ALLOW-01 | | A | Add `uniq@test.local` as Contractor → row appears with role; that email can then sign up (ties to TC-AUTH-06) | Mj |
| TC-ALLOW-02 | | A | "Remove {email} from the allowlist" → ConfirmDialog → row gone | Mj |
| TC-CARD-01 | S | A | "New card" → Full name → "Create card" → appears in list; Visibility published → Share kit link opens `/c/<token>` showing the name | B |
| TC-CARD-02 | | A | Validation: empty name → "Name is required."; `http://` link → "…must be a full https:// link."; button label w/o link → "Fill in both…"; toast "Fix the highlighted fields first." | Mj |
| TC-CARD-03 | | A | Edit field → preview shows "· unsaved", "Save changes" enabled; save → disabled again | Mn |
| TC-CARD-04 | | A | Share kit: Copy link / signature (clipboard), QR "SVG"/"PNG" downloads valid | Mn |
| TC-CARD-05 | | A | "Replace" link → confirm → old `/c/<old>` shows "This card isn’t available."; new token works | B |
| TC-CARD-06 | | A | Draft card → banner "This card is draft…"; public URL 404s | B |
| TC-CARD-07 | | A | Analytics tab: after visiting a public card + clicking a link, Views/Link clicks > 0 for period; period & card selects filter | Mj |
| TC-CARD-08 | | A | Delete card → confirm → gone; public URL 404s | Mj |

### 4.9 Public card — `public-card.spec.ts` (UC-14, `@public`, runs on chromium + mobile-webkit)
| ID | S | Role | Steps → Expected | Sev |
|---|---|---|---|---|
| TC-PUB-01 | S | P | Fresh context (no cookies) → `/c/<published>` renders H1 name, "Save contact", Contact + Find me online links; **no redirect to login** | B |
| TC-PUB-02 | | P | Response header `X-Robots-Tag: noindex, nofollow` | Mj |
| TC-PUB-03 | S | P | Unknown token, malformed token (`abc`), draft token, rotated token → "This card isn’t available." + "Visit bughawinnovations.ph" | B |
| TC-PUB-04 | | P | "Save contact" → `/vcard` returns `text/vcard` attachment with FN/EMAIL/TEL of card | Mj |
| TC-PUB-05 | | P | Click `data-track="email"` → beacon POST to `/c/<token>/event` returns 204 (wait for request) | Mn |
| TC-PUB-06 | | P | Wallet env unset → no wallet buttons; `/wallet/apple` & `/wallet/google` → 404 | Mn |
| TC-PUB-07 | | P | `?s=qr` visit is attributed as source qr in admin analytics (ties TC-CARD-07) | Mn |
| TC-PUB-08 | | P | Page HTML contains no draft-only fields / no Supabase table names / no other cards' data | B |

### 4.10 Security (UI-observable) — `security.spec.ts` (`@security`)
| ID | Steps → Expected | Sev |
|---|---|---|
| TC-SEC-01 | Open redirect: sign in at `/login?next=` with each of `//evil.com`, `/\evil.com`, `https://evil.com`, `%2F%2Fevil.com`, `/x%0d%0aSet-Cookie:` → lands on same-origin `/` | B |
| TC-SEC-02 | `/auth/callback?code=bogus` → `/login?error=auth` | Mj |
| TC-SEC-03 | Response headers on `/` include CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` | Mj |
| TC-SEC-04 | `/c/<token>/event` from a foreign `Origin` or >512-byte body → 204 but no event recorded (admin DB check) | Mn |
| TC-SEC-05 | XSS: card bio / lead message / task title containing `<img src=x onerror=window.__xss=1>` renders as text; `window.__xss` undefined on admin, CRM, board, public card | B |
| TC-SEC-06 | Contractor session cannot call `admin_list_allowed_emails` / `admin_card_event_rollup` RPC from the browser (error) | B |

### 4.11 Accessibility — `a11y.spec.ts` (`@a11y`, nightly)
- **TC-A11Y-01..N, page sweep.** Run an axe scan (tags `wcag2a`, `wcag2aa`, `wcag21aa`) on
  every route, signed in as the appropriate role:
  - `/login`, `/`, `/calculators` and one calculator per category, `/saved`;
  - all 6 tools plus `/report`;
  - `/tasks`, the project page and the board;
  - `/crm`, `/crm/import`, `/admin/allowlist`, `/admin/cards`, `/c/<token>`;
  - open dialogs: Save to team, TaskPanel, LeadPanel, New lead, ConfirmDialog.

  **A new violation fails the test.** Violations listed in `known-violations.json` (each one
  tied to an issue #) are reported but don't fail.
- **TC-A11Y-K1, keyboard.** Tab through the login form and submit with Enter. Open and close
  the mobile drawer with the keyboard and Esc. Navigate the command palette with the arrow
  keys. Focus is visible on every stop (`:focus-visible` outline present).
- **TC-A11Y-K2, dialogs.** Focus is trapped inside dialogs, and closing returns focus to the
  element that opened them.
- **TC-A11Y-K3, live regions.** Toasts and save-status text are announced (`role=status` or
  `aria-live`).

### 4.12 Mobile — `@mobile` tag (mobile-chromium + mobile-webkit)
| ID | Steps → Expected | Sev |
|---|---|---|
| TC-MOB-01 | "Open navigation" opens `#sidebar-drawer`; link navigates and closes it; Esc / "Close navigation" closes | Mj |
| TC-MOB-02 | No horizontal page scroll (`scrollWidth <= innerWidth`) on dashboard, calculator, cost calc, CRM, board, public card | Mj |
| TC-MOB-03 | Cost calculator shows the card layout (table hidden) and edits work | Mj |
| TC-MOB-04 | Board: tap card opens TaskPanel; touch-drag moves a card (documents current touch support) | Mj |
| TC-MOB-05 | Public card tap targets ≥ 44×44 px for contact links | Mn |

### 4.13 Visual regression — `visual.spec.ts` (`@visual`, nightly, Linux Docker only)
- `toHaveScreenshot()` with `maxDiffPixelRatio: 0.01`, animations disabled. Mask dynamic
  regions: emails, dates, toasts and chart canvases.
- Baselines (desktop): login, dashboard, calculator (COGS), cost-calc report, P&L, CRM funnel,
  board, admin cards editor, public card.
- Baselines (mobile-webkit): public card, dashboard with the drawer open.
- Baselines are updated only through `npm run e2e:visual:update` (Docker), and the PR must
  show the diff images. A visual failure opens an issue labeled `visual`.

---

## 5. Implementation phases

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **0 Foundation** | Deps; `playwright.config.ts`; `supabase init` + `seed.sql`; global-setup; auth.setup; fixtures/helpers; CSP tweak + its Vitest case; scripts; gitignore; ESLint import guard; docs (security, testing, AGENTS table, .env.example) | `npm run e2e:db && npm run e2e -- --list` works; one trivial login test passes locally |
| **1 Smoke + PR gate** | All `S` cases (~25) | `e2e-smoke` job green on a PR in under 7 minutes; `npm run lint && npm run test && npm run build` still green |
| **2 Nightly + issue loop** | `e2e-nightly.yml`, `report-issues.mjs`, labels, issue template | Deliberately broken test on a dispatch run creates exactly one issue; rerun comments instead of duplicating; fixing closes it |
| **3 Full functional** | Remaining TCs in 4.1–4.10 | All pass or have an open issue linked |
| **4 Quality layers** | a11y sweep + baseline, mobile projects, visual baselines | Baseline file entries each reference an issue |

---

## 6. Day-one findings (file these as issues when Phase 0 starts)

Exploration already turned up these problems. The tests above will catch them:
1. **No accessible name.** The Pipeline account dialog labels have no `htmlFor`. The TaskPanel
   title input has no label. NewProjectForm and the mini-project form use placeholders only.
   (a11y, Mj)
2. **Contributor "Remove" buttons don't name the person**, so screen-reader users hear
   identical buttons. (a11y, Mn)
3. **ConfirmDialog always says "Deleting…" while busy**, even for "Reset for everyone",
   "Replace link" and "Remove" (`src/components/ui/confirm-dialog.tsx`). (Mn)
4. **Drag-and-drop is mouse/pointer-only.** The Board and the CRM funnel have no
   `KeyboardSensor`, so keyboard users can't move cards. (a11y, Mj)
5. **Pipeline Simulator projection `<select>`s have no labels.** (a11y, Mn)
6. **Only default 404s and no `error.tsx`.** `/tools` has no index page and 404s. (Mn)
7. **The docs are wrong in two places.** `docs/testing.md` lists 2 suites and 11 calculators;
   there are 11 suites and 15 calculators. `docs/security.md` §5.1 says contractors can reach
   the workspace tables, but migration 0004 restricts them. TC-RBAC-07 will confirm which is
   true. (docs, Mn)

## 7. Critical files

- **New:**
  - `playwright.config.ts`
  - `tests/e2e/**`
  - `scripts/e2e/{env.sh,report-issues.mjs}`
  - `supabase/config.toml` and `supabase/seed.sql`
  - `.github/workflows/e2e-nightly.yml`
  - `.github/ISSUE_TEMPLATE/ui-bug.yml`
  - `src/lib/securityHeaders.ts` and `tests/unit/securityHeaders.test.ts`
- **Modified:**
  - `next.config.js` (CSP via the helper)
  - `package.json` (deps and scripts)
  - `.github/workflows/ci.yml` (the `e2e-smoke` job)
  - `.gitignore` and `tsconfig.json` (exclude `tests/e2e`)
  - `.eslintrc.json` (import guard)
  - `.env.example`
  - `docs/security.md` and `docs/testing.md`
  - AGENTS.md (doc table, repo map, §6 commands)
- **Reused:**
  - The calculator registry (`src/lib/calculators/registry.ts` `ALL_CALCULATORS`) drives the
    data-driven TC-CALC-02/03.
  - `src/lib/crm.ts` validation messages and CSV headers supply the test data for the
    TC-CRM-08/11 assertions.
  - `src/lib/cards.ts` `validateCard` messages are used for TC-CARD-02.
  - `TOOLS` (`src/lib/tools.ts`) drives the TC-NAV-01/07 expectations.
  - The test emails from `supabase/tests/task_management_rls.sql`.

## 8. Verification (of the framework itself)

1. Locally run `npm run e2e:db`, then `npm run e2e:smoke`. Expect all green, with an HTML
   report in `playwright-report/`.
2. Run `npm run e2e -- --project=mobile-webkit --grep @public` and expect it to pass.
3. **Negative check:** temporarily break the "Sign in" label, or change the CSP back. Smoke
   fails with a trace that shows the cause.
4. **Issue loop:** dispatch the nightly workflow on a branch that has one forced failure.
   - It creates one issue with the right labels, steps and artifact link.
   - Re-dispatching adds a comment and no new issue.
   - Removing the forced failure and re-dispatching closes the issue.
5. Run `npm run lint && npm run test && npm run build`. All three stay green, and the
   production CSP headers are unchanged (covered by the Vitest case).
