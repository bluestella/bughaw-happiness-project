# Design System & UX

> The unified visual language (originating from the Unit Cost Calculator artifact)
> and the UX rules every new screen must follow. Tokens live in
> [`tailwind.config.ts`](../tailwind.config.ts).

## 1. Brand feel

Warm, papery, analog-scientific: cream background, ink-brown text, coir-green as the
single action color, clay/amber/danger as sparse semantic accents. It should read
like a well-kept field notebook, not a SaaS dashboard. No dark mode.

## 2. Color tokens (use these — no raw hex in JSX)

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F7F3EA` | App background |
| `panel` | `#FFFFFF` | Cards, sidebar, inputs |
| `ink` | `#2B2620` | Primary text |
| `ink-soft` | `#6B6355` | Secondary text, labels, help text |
| `line` | `#DED6C4` | Borders, dividers, chart grid |
| `coir` | `#5C7A4F` | Primary actions, focus rings, active nav |
| `coir-dark` | `#43593B` | Hover state, emphasized values, eyebrows |
| `coir-bg` | `#F1F6EE` | Positive/emphasis surfaces, active nav bg |
| `clay` | `#B4703F` | Warm accent, warnings-ish notices |
| `amber` | `#C68A2E` | Medium priority, caution |
| `danger` | `#A6432F` | Destructive, High priority, failed verdicts |

Chart-only companions used inline (allowed): `#D6E4CE` (coir border tint),
`#FBEBE6`/`#E8C4B8` (danger surface/border), axis text `#6B6355`, grid `#DED6C4`.

## 3. Typography

| Family | Token | Role |
|---|---|---|
| Fraunces (serif) | `font-display` | Page titles, section headings, big numbers |
| Inter | `font-sans` | Body, forms |
| IBM Plex Mono | `font-mono` | Eyebrow labels, numeric inputs, metadata, statuses |

Recurring patterns:
- **Eyebrow label:** `font-mono text-[10–11px] uppercase tracking-[0.1em]` in
  `coir-dark` or `ink-soft` — sits above every page title and output card.
- **Page title:** `font-display text-2xl–3xl font-semibold text-ink`.
- Small, dense sizes throughout (`text-[13px]` body in panels, `text-xs` buttons) —
  this is a data tool; keep density.

## 4. Component recipes (copy the existing markup)

- **Card / panel:** `bg-panel border border-line rounded-xl p-4–5`.
  Emphasized output card: `bg-coir-bg border-[#D6E4CE]`.
- **Primary button:** `bg-coir hover:bg-coir-dark text-white font-semibold rounded-md`
  (small: `text-xs px-3 py-2`). One primary action per view.
- **Secondary button:** `border border-line text-ink hover:border-ink-soft rounded-md`.
- **Destructive:** text/outline in `danger`, never solid red; always paired with a
  `confirm()` for irreversible actions.
- **Input:** `border border-line rounded-md text-sm focus:border-coir
  focus:ring-2 focus:ring-coir/20`; currency inputs get an absolute `₱` prefix,
  percentages a `%` suffix; numeric inputs use `font-mono`.
- **Verdict banner:** green (`coir-bg`) with `✓` or red (`#FBEBE6`) with `✕` + one
  plain sentence.
- **Status flash:** transient text line (`flash()` pattern, 2.5–3 s), used for save
  confirmations and errors — no toast library.
- **Priority chips:** outlined text chips — Low `coir-dark`, Medium `amber`,
  High `danger`.

## 5. Layout

- App frame: fixed 256 px sidebar (`bg-panel`, sticky, own scroll) + sticky
  translucent header (`bg-paper/90 backdrop-blur`) with user email + sign-out +
  `max-w-6xl` centered main content (`px-6 py-8`).
- Calculator pages: two-column `lg:grid-cols-[380px,1fr]` — inputs left,
  outputs/verdict/chart right; stacks on mobile.
- **Mobile:** sidebar becomes an off-canvas drawer with a floating `☰` FAB
  (bottom-right) and scrim. Test every new page at 375 px.

## 6. Data display rules

- **All currency through `format.ts`** — `pesoRound` for headline numbers, `peso`
  for detail; percentages 1 decimal; ratios `×`; durations `mo`; non-finite → `—`.
  Never `toFixed` ad hoc in JSX.
- Charts: Recharts, container height ~`h-72`, grid dashed `line`, ticks 11 px
  `ink-soft`, currency ticks abbreviated (`₱12k`), legend only when >1 series,
  bars `radius=[4,4,0,0]`, lines `strokeWidth=2` no dots.
- Empty states: dashed-border rounded box with one quiet sentence
  ("No mini-projects yet.").

## 7. UX principles

1. **Instant math** — calculators recompute on every keystroke; no Submit buttons.
2. **State survives refresh** — localStorage or `app_state`; users never lose input.
3. **Optimistic writes, honest failures** — UI updates immediately, rolls back with
   a plain-English flash on error ("Could not save — changes may not persist.").
4. **Progressive disclosure of authority** — actions a role can't perform are
   hidden, not disabled (Sidebar, buttons via `permissions.ts`).
5. **One glance verdicts** — where a decision threshold exists (margin gate,
   LTV:CAC), show a go/no-go banner, not just numbers.
6. **Destructive = deliberate** — confirmation dialogs spell out the blast radius
   ("…and everything inside it?").

## 8. Accessibility — current state and bar for new work

In place: labeled inputs (`htmlFor`/`id`), `aria-label` on icon-only buttons,
keyboard-reachable forms, focus rings (`ring-coir/20`).

Gaps to respect/improve when touching UI: some `text-ink-soft`-on-`paper` small text
is borderline contrast; drag-and-drop has no keyboard alternative (dnd-kit supports
sensors — add if a11y becomes a requirement); flash status messages should get
`aria-live="polite"`; emoji icons in nav are decorative and should stay supplementary
to text labels (they do). Don't ship new interactive elements without visible focus
states and real `<button>`/`<a>` semantics.
