# Testing

> Strategy, current coverage, and the bar for new work.

## 1. Current state

- **Runner:** Vitest (`vitest.config.ts`, `@` alias to `src`). No network, no DOM,
  no Supabase required — tests are pure-logic and run in <1s.
- **Suites** (`tests/unit/`):
  - `calculators.test.ts` — formula assertions for all 11 calculator configs +
    `computePnl`, including divide-by-zero safety and a registry-integrity sweep
    (unique ids, valid categories).
  - `permissions.test.ts` — full role × capability matrix for every helper in
    `src/lib/permissions.ts` (including the `null` role), plus
    `computeNewPosition` / `sortByPosition` ordering math.
- **CI** (`.github/workflows/ci.yml`): `npm ci` → `lint` → `test` → `build` on every
  push/PR to `main`. Build runs with placeholder Supabase env vars — keep the build
  env-independent.

```bash
npm run test         # one-shot
npm run test:watch   # watch mode
```

- **E2E (Playwright)**, being built per [ui-testing.md](ui-testing.md): `tests/e2e/`,
  run against a throwaway **local** Supabase. **Tests leave nothing behind**: global
  teardown diff-deletes everything a run created and fails the run on leftovers
  ([ui-testing.md §1.1](ui-testing.md#11-the-test-data-rule-tests-leave-nothing-behind)).

```bash
npm run e2e:db       # supabase start + db reset + write .env.e2e (needs Docker)
npm run e2e:smoke    # @smoke subset, chromium (what the PR gate runs)
npm run e2e          # everything
npm run e2e:ui       # Playwright UI mode
npm run e2e:clean    # after a Ctrl-C'd run: delete leftovers back to the baseline
```

## 2. The testing philosophy here

**Everything with a formula or a permission decision is a pure function in
`src/lib/` and has a test.** UI is kept thin enough that the untested surface is
rendering + Supabase plumbing, which the small trusted team exercises manually.
This is a deliberate trade for an internal tool — don't let it erode:

- If you find yourself writing business math inside a component, extract it to
  `src/lib/` and test it (precedent: `pnl.ts` was extracted from the P&L page).
- Every new `CalculatorConfig` needs: a happy-path case with hand-checked numbers,
  a zero/edge-input case proving no `NaN`/`Infinity` escapes, and (if it has a
  `verdict`) a case on each side of the threshold.
- Every change to `permissions.ts` updates the capability matrix; the matrix style
  (explicit expected value per role) is intentional — it doubles as documentation.

## 3. What's missing (add in this order when the team grows)

1. **Component tests** (React Testing Library + jsdom): `CalculatorShell` input →
   output flow, Board column moves calling `computeNewPosition` correctly.
2. **RLS integration tests**: the permission matrix is only asserted against the TS
   mirror, not the real policies. A Supabase local (`supabase start`) test suite
   that signs in as each role and attempts each operation would close the gap
   between `permissions.ts` and the SQL — the highest-value missing suite.
3. **E2E smoke** (Playwright): login → dashboard → run a calculator → save to team;
   contractor login → verify redirect to `/tasks`. **Planned in full in
   [ui-testing.md](ui-testing.md)**: architecture, use cases, test case IDs, CI cadence
   and the issue-reporting loop.
4. Lighthouse/perf budget if the tool ever gets heavy pages.

## 4. Manual QA checklist (until E2E exists)

- Sign-in (password + Google), sign-out, uninvited signup rejected with the
  friendly message.
- Contractor account: lands on `/tasks`, cannot see calculator nav, direct URL to
  `/tools/*` redirects.
- Calculator: inputs persist across refresh (localStorage), CSV/JSON export, Save
  to team appears in `/saved`.
- Shared tools: edit cost-calculator in two browsers — expect last-write-wins
  (known behavior, not a bug).
- Board: drag between/within columns persists after refresh; contractor can edit
  only own tasks; comments append and cannot be edited.
- Project delete (super_admin only) cascades and double-confirms.
- Mobile viewport: sidebar toggle button, board usability.

## 5. Access tests (the real policies, every role)

`tests/integration/access/` signs in with the anon key as five actors (anonymous,
signed-in with no role, contractor, member, super_admin) and attempts every
operation on every table and every function, then checks the result with the
service-role client. It runs against the **local** Supabase only and restores the
baseline afterwards, like the E2E suite.

```bash
npm run e2e:db        # local stack + .env.e2e (needs Docker)
npm run test:access   # 493 checks, about 6 seconds
npm run db:types      # regenerate src/lib/supabase/types.ts after a migration
```

| File | Proves |
|---|---|
| `matrix.ts` | Who may select / insert / update / delete on each table. **Add a row for every new table.** |
| `tables.itest.ts` | Runs the matrix. Judges by what is in the database afterwards, since RLS refuses updates and deletes silently. |
| `scoped.itest.ts` | Row-level rules: a contractor's own tasks, contributor-only projects, per-person section overrides. |
| `functions.itest.ts` | Admin functions refuse non-admins and change nothing; public functions return only safe data. |
| `coverage.itest.ts` | Fails when the database has a table or function with no test. This is the merge gate in [standards/database.md](standards/database.md) §10. |

CI runs it in the `e2e-smoke` job, followed by a check that the generated types
are up to date.

Known gap recorded as a test (2026-11-12): `list_team_directory()` has no role
check, so a signed-in user removed from the allowlist can still list invited
emails. The test asserts today's behaviour and says to flip it when fixed.

## 6. Performance baseline

`npm run e2e:perf` builds the app and loads four routes once each in desktop
Chromium, unthrottled, against the local stack. These are lab floors for spotting
regressions, **not** real-user Core Web Vitals. INP is not measured.

Baseline, 2026-11-12:

| Route | LCP | CLS | TTFB | JavaScript transferred |
|---|---|---|---|---|
| `/` dashboard | 284 ms | 0 | 83 ms | 160 KB |
| `/crm` | 288 ms | 0 | 99 ms | 257 KB |
| `/tasks/[project]/[board]` | 280 ms | 0 | 79 ms | 277 KB |
| `/c/[token]` public card | 212 ms | 0 | 33 ms | 108 KB |

Budget in the spec: LCP ≤ 2500 ms, CLS ≤ 0.1. Not yet done: throttled mobile runs,
real-user monitoring in production, and a CI gate.
