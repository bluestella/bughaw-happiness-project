# UX Audit & Implementation Plan

Audited: 2026-09-05. Scope: whole app — dashboard, calculators, tools (P&L, Unit Economics, Cost Calculator, Pipeline, Funding), tasks/boards, saved calculations, dialogs, navigation. Framework: Emil Kowalski's design-engineering principles (animation decision framework, component polish, perceived performance) plus a UI-library assessment.

## 1. UI library decision

**Recommendation: keep and deepen the current stack — Base UI (`@base-ui/react`) + Tailwind + `cva` + Sonner. Do not adopt shadcn/Radix.**

Why:
- Base UI is already a dependency and powers `Dialog`/`ConfirmDialog`. It is headless, so the existing warm-paper brand theme (Fraunces/Inter/Plex Mono, coir palette) stays fully ours.
- shadcn/ui would introduce a second headless layer (Radix) alongside Base UI and a second styling convention alongside the `cva` pattern in `button.tsx`. Two component philosophies in a small codebase is worse than one incomplete one.
- What's missing isn't a library — it's coverage. The gap list below closes it with Base UI primitives styled once in `src/components/ui/`.

Primitives to add (all Base UI): **Tooltip** (replaces every `title="…"` info dot), **Slider** (long-term replacement for styled `input[type=range]` — keyboard step, aria built in), **Tabs** (pipeline/funding tab rows), **Checkbox**, **Field/Label**. Icons: replace UI emojis (✕, ×, ☰, ▶, ↺) with `lucide-react`; keep decorative emojis in headers/nav if they're part of the brand voice.

## 2. Findings

### Motion & polish (emil-design-eng)

| # | Finding | Where | Fix |
|---|---------|-------|-----|
| M1 | ✅ Done — buttons had no press feedback | `ui/button.tsx` | `active:scale-[0.97]`, 150ms ease-out, `motion-reduce` exempt |
| M2 | ✅ Done — no custom easing tokens | `globals.css` | `--ease-out-strong`, `--ease-in-out-strong` |
| M3 | ✅ Done — slider thumb static | `globals.css` | scale on active, focus-visible ring, reduced-motion guard |
| M4 | Dialogs pop in with no enter/exit transition | `CalculatorShell`, `ConfirmDialog`, pipeline modal | Shared `ui/dialog.tsx` wrapper: backdrop opacity + popup `scale(0.96)→1` / opacity, 200ms `--ease-out-strong`, exit faster than enter. Modals keep `transform-origin: center` |
| M5 | ✅ Done — Recharts re-animated from zero on every slider tick | `CalculatorShell`, P&L page | Migrated charting to Apache ECharts (canvas, interruptible 200ms merge-updates); Recharts removed |
| M6 | Sidebar mobile slide uses default weak easing | `Sidebar.tsx` | `duration-300` + `ease-[var(--ease-out-strong)]` (iOS-drawer curve), backdrop fade |
| M7 | Graveyard/adding sections toggle with no transition; `▶` rotates with bare `transition-transform` | pipeline, board columns | Grid-rows or height auto-animation; keep under 250ms |
| M8 | Raw `<button>`s with hand-rolled classes miss the new press feedback | P&L reset, shell export row, pipeline tab/mode buttons, saved page | Consolidate onto `Button` variants (add a `tab` intent) |
| M9 | Hover styles not gated for touch | card hovers throughout | `@media (hover: hover) and (pointer: fine)` where hover implies affordance only |
| M10 | Dashboard cards appear all at once | `(app)/page.tsx` | Optional: 40ms stagger fade-up via `@starting-style` — rare view, delight is allowed |

### Interaction & feedback

| # | Finding | Where | Fix |
|---|---------|-------|-----|
| I1 | ✅ Done — sliders had no text entry | P&L, Unit Economics | New `SliderField` (`ui/slider-field.tsx`): slider + editable mono textbox, prefix/suffix (₱, %, mo), live commit, clamps to min, typed values may exceed slider max |
| I2 | `title=""` tooltips: invisible on touch, 1s+ delay, no styling | "i" dots in P&L, funding, slider fields | Base UI Tooltip; skip delay on subsequent hovers |
| I3 | Saved page: delete is instant — no confirm, no toast, no error handling | `saved/page.tsx` | Reuse `ConfirmDialog`; toast on success/failure |
| I4 | Save-to-team dialog: Enter doesn't submit | `CalculatorShell` | Wrap in `<form onSubmit>` |
| I5 | `type="number"` inputs change on scroll-wheel while hovering — silent data corruption in calculators | `CalculatorShell`, funding `NumField`, cost table | Blur-on-wheel or switch to `inputMode="decimal"` text inputs (as `SliderField` does) |
| I6 | Loading states are bare text ("Loading…") | pipeline, saved, cost-calc | Skeleton cards matching final layout — perceived performance |
| I7 | Number fields zero out mid-edit (`parseFloat(v) \|\| 0`) — clearing a field snaps to 0 and recomputes | funding, cost-calc | Draft-string pattern from `SliderField`: keep raw string while focused, parse on commit |
| I8 | Calculator inputs restore from localStorage after first paint — visible value flash | `CalculatorShell`, tool pages | Lazy-init state from localStorage in `useState` initializer (client components) |
| I9 | Cost-calc row delete is instant, no undo | cost-calculator | Sonner toast with Undo action (restores row) |
| I10 | Board drag: good rollback logic; drop overlay could use `dropAnimation` spring feel | `Board.tsx` | Tune dnd-kit `dropAnimation` duration/easing to match tokens |

### Consistency & information design

| # | Finding | Fix |
|---|---------|-----|
| C1 | Two slider UIs existed (P&L vs Unit Econ) — now unified via `SliderField`; CalculatorShell fields are a third input style | Extend calculator field config with optional `slider: {min,max,step}` so config-driven calculators can render `SliderField` too |
| C2 | ✅ Done — chart tooltips were default off-brand style | Themed tooltip/axis/legend in `ui/chart.tsx`; series palette re-validated for CVD safety (`src/lib/chartTheme.ts`) |
| C3 | Verdict banners, stat cards, tab buttons re-implement the same styles in 4 files | Extract `ui/stat-card.tsx`, `ui/verdict-banner.tsx`, `ui/tab-bar.tsx` |
| C4 | Hard-coded hex colors bypass the Tailwind palette (`#D6E4CE`, `#FBEBE6`, `#E8C4B8`, chart hexes) | Add semantic tokens (`success-bg`, `danger-bg`, etc.) to `tailwind.config.ts` |
| C5 | Mobile: cost table and pipeline table rely on horizontal scroll with no affordance | Sticky first column or scroll-shadow hint |

### Accessibility

| # | Finding | Fix |
|---|---------|-----|
| A1 | Icon-only buttons (`✕`, `×`, `☰`) rely on `title` or nothing | `aria-label` everywhere; lucide icons with labels |
| A2 | No `prefers-reduced-motion` handling (base fixed for new motion) | Audit all added transitions; movement off, opacity kept |
| A3 | Unstyled native checkbox (pipeline referral flag) | Base UI Checkbox styled to theme |
| A4 | ✅ Done — chart data unavailable to screen readers | Chart containers carry `role="img"` + generated `aria-label` summaries |
| A5 | Sidebar closes on any click inside (`onClick` on `<aside>`) — keyboard/AT users can't interact without dismissing | Close on link navigation + backdrop only |

## 3. Implementation plan

**Phase 0 — shipped in this pass**
`SliderField` with slider-or-textbox input (P&L + Unit Economics), button press feedback, easing tokens, slider thumb polish, reduced-motion guards.

**Phase 1 — component foundation (1–2 days)**
Add lucide-react. Build `ui/tooltip.tsx`, `ui/dialog.tsx` (animated), `ui/tab-bar.tsx`, `ui/stat-card.tsx`, `ui/verdict-banner.tsx`, `ui/checkbox.tsx`. Migrate raw buttons to `Button`. Semantic color tokens (C4).

**Phase 2 — interaction correctness (1–2 days)**
I2–I9: tooltips replace `title`, saved-page confirm+toast, form submit in save dialog, wheel-proof number fields with draft-string editing, lazy localStorage init, skeletons, undo on row delete.

**Phase 3 — calculators & charts (1 day)**
C1 slider support in calculator configs, M5 disable live-chart re-animation, C2 themed chart tooltips, A4 chart aria summaries.

**Phase 4 — navigation, mobile, a11y sweep (1 day)**
M6 sidebar motion + A5 close behavior, C5 table scroll affordances, M9 hover gating, A1/A3 labels and checkbox, M10 dashboard stagger.

Each phase is independently shippable; run `npx tsc --noEmit && npm test` per phase.

## 4. Redesign addendum — 2026-09-05

Full visual rebrand to a modern clean SaaS theme (light-only) plus execution of the remaining phases:

- **Theme**: Tailwind tokens remapped (legacy names kept) — slate surfaces (`#F8FAFC`/white), slate text, blue accent (`#2563EB`); Inter everywhere (Fraunces dropped), IBM Plex Mono for numbers. Semantic status tokens added (`success*`, `danger-bg/border`, `amber-bg/border`); chart palette re-hued to blue/emerald/orange/violet with the same CVD-safe interleave.
- **Navigation**: mobile now uses a sticky top app bar + animated slide-in drawer (Escape closes, body scroll locked, closes on nav/backdrop only — A5, M6); account footer in the drawer; desktop keeps the sidebar + slim header.
- **Components**: new `ui/dialog.tsx` (animated backdrop/popup — M4), `ui/tooltip.tsx` (`InfoTip`, replaces `title=""` — I2), `ui/tab-bar.tsx` (M8/C3), `ui/stat-card.tsx`, `ui/verdict-banner.tsx`, `ui/skeleton.tsx` (I6); lucide-react icons replace UI glyphs (A1).
- **Interaction fixes shipped**: saved-page delete confirm + toast (I3), save-dialog form submit (I4), wheel-proof number inputs (I5), draft-string editing in funding NumField (I7), lazy localStorage init (I8), cost-row delete undo toast (I9), tuned dnd-kit dropAnimation (I10), styled pipeline checkbox (A3), table scroll-shadow affordance (C5), touch-gated card hovers (M9).

Verified: `tsc --noEmit` clean, 55/55 unit tests pass, production build succeeds.
