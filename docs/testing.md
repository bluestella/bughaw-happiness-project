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
   contractor login → verify redirect to `/tasks`.
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
