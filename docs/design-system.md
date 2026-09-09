# Design System & UX

> The unified visual language — mapped onto the Bughaw corporate design system
> (see [`docs/index.html`](index.html) for the full showcase: palette, type
> specimens, components, and the twelve deck layouts) — and the UX rules every
> new screen must follow. Tokens live in [`tailwind.config.ts`](../tailwind.config.ts).

## 1. Brand feel

Warm, papery, editorial: cream background, ink-brown text, Bughaw Blue as the
single action color, warm brown/gold/danger as sparse semantic accents. It should
read like a well-kept field notebook carrying an actual corporate identity, not a
generic SaaS dashboard. Governing line: **warm about people, cold about claims** —
photography and the display face carry the warmth; numbers, panels and tables stay
clinical. No dark mode in the app itself (the brand system's dark mode is reserved
for decks/marketing, via the raw `deep`/`sky`/`bgreen` tokens below).

## 2. Color tokens (use these — no raw hex in JSX)

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5F0DE` | App background (cream) |
| `panel` | `#FFFFFF` | Cards, sidebar, inputs |
| `ink` | `#241F1A` | Primary text — 14.3:1 |
| `ink-soft` | `#6B6355` | Secondary text, labels, help text |
| `line` | `#DDD6C0` | Borders, dividers, chart grid |
| `coir` | `#20699F` | Bughaw Blue — primary actions, focus rings, active nav (5.1:1) |
| `coir-dark` | `#17517D` | Hover state, emphasized values, eyebrows |
| `coir-bg` | `#DCE8F4` | Emphasis surfaces, active nav bg |
| `clay` | `#6E5A42` | Warm Brown — material/secondary accent, statistics (5.7:1) |
| `amber` | `#8A6215` | Medium priority, caution text — a readable dark-gold |
| `danger` | `#A8412A` | Destructive, High priority, failed verdicts |
| `gold` | `#E5B95F` | Rules and marks only. **Never body text on light** (1.6:1 on cream) |
| `deep` | `#1D5C13` | Dark brand field — hero/dark-band treatments only |
| `sky` | `#3DAEE0` | Headings on `deep`, display sizes only |
| `bgreen` | `#6EA92F` | Markers/icons on `deep` — never text on Deep Green |

Chart-only companions used inline (allowed): `#C4DDB8` (success border tint),
`#FBF0EC`/`#E8C4B8` (danger surface/border), axis text `#6B6355`, grid `#DDD6C0`.

The three pairings that fail contrast, per the brand system — never ship these:
Gold on Cream (1.6:1), Bright Green (`bgreen`) on Deep Green (2.9:1), Sky Blue on
Bughaw Blue (2.3:1).

## 3. Typography

| Family | Token | Role |
|---|---|---|
| Fraunces (serif) | `font-display` | Brand name, page titles, big numbers, Filipino copy — variable, optical-size aware so it stays crisp from stat-tile numbers down to small headings; swapped in for the deck-oriented Gloock face for the app's own UI |
| DM Sans | `font-sans` | Body, forms, operational English copy |
| IBM Plex Mono | `font-mono` | Eyebrow labels, numeric inputs, metadata, statuses |

Recurring patterns:
- **Eyebrow label:** `font-mono text-[10–11px] uppercase tracking-[0.1em]` in
  `coir-dark` or `ink-soft` — sits above every page title and output card.
- **Page title:** `font-display text-2xl–3xl font-semibold text-ink`.
- Small, dense sizes throughout (`text-[13px]` body in panels, `text-xs` buttons) —
  this is a data tool; keep density.
- The language split is the system: Filipino display copy sits in the serif
  (`font-display`), English operational copy stays in the sans (`font-sans`) — it
  codes the emotional register against the operational one.

## 4. Component recipes (copy the existing markup)

- **Card / panel:** `bg-panel border border-line rounded-xl p-4–5`.
  Emphasized output card: `bg-success-bg border-success-border`.
- **Primary button:** `bg-coir hover:bg-coir-dark text-white font-semibold rounded-md`
  (small: `text-xs px-3 py-2`). One primary action per view.
- **Secondary button:** `border border-line text-ink hover:border-ink-soft rounded-md`.
- **Destructive:** text/outline in `danger`, never solid red; always paired with a
  `confirm()` for irreversible actions.
- **Input:** `border border-line rounded-md text-sm focus:border-coir
  focus:ring-2 focus:ring-coir/20`; currency inputs get an absolute `₱` prefix,
  percentages a `%` suffix; numeric inputs use `font-mono`.
- **Verdict banner:** green (`success-bg`) with `✓` or red (`danger-bg`) with `✕` + one
  plain sentence.
- **Status flash:** transient text line (`flash()` pattern, 2.5–3 s), used for save
  confirmations and errors — no toast library.
- **Priority chips:** outlined text chips — Low `coir-dark`, Medium `amber`,
  High `danger`.
- **Icons:** `lucide-react` only — no emoji anywhere in the app (nav, cards, page
  chrome). Icon keys are stored as plain strings in data (`ToolDef.icon`,
  `CalculatorConfig.icon`, e.g. `"flask-conical"`) and resolved to a component via
  `getIcon()` in [`src/lib/icons.ts`](../src/lib/icons.ts) — add a new key there
  before referencing it. Render at `strokeWidth={1.75}`, sized 16px in nav rows,
  ~18–24px in page/section headers; never at emoji-casual scale.
- **Page header:** `CalculatorHeader` ([`src/components/CalculatorHeader.tsx`](../src/components/CalculatorHeader.tsx))
  is the one header used across calculators, tools, CRM, and Tasks — icon in a
  `coir-bg` chip, mono eyebrow, `font-display` title, optional description, and
  optional `action` (below the description) or `aside` (beside the whole block,
  e.g. a "Reset to defaults" button or a page-specific summary card) slots.
- **Section intro:** `SectionIntro` ([`src/components/SectionIntro.tsx`](../src/components/SectionIntro.tsx))
  is the "editorial pull quote" section header for a handful of high-traffic
  spots (dashboard, catalog) — bigger `font-display` presence than a plain h2.
  Don't reach for it on every section; it's meant to be used sparingly.
- **Featured vs. catalog cards** ([`src/components/ui/card.tsx`](../src/components/ui/card.tsx)):
  uniform card grids are only correct for genuinely homogeneous data where
  position/status carries the signal (CRM board, task board, project list). When
  items differ in importance — e.g. the 5 hand-built Tools vs. the long tail of
  generated calculators — don't give them the same visual weight. Use
  `FeaturedCard` (roomy, icon + name + description, sized `md`/`lg`) for the
  small, high-value set, and `CatalogRow` (dense, single-line, inside a
  `divide-y` list) for the long tail. See the dashboard and `/calculators` for
  the reference implementation.
- **Command palette:** `CommandPalette` ([`src/components/CommandPalette.tsx`](../src/components/CommandPalette.tsx)),
  opened via `⌘K`/`Ctrl+K` or the search button at the top of the sidebar, is
  the fast path to any calculator/tool/page. It's built on the existing
  `@base-ui/react` Dialog — no `cmdk` dependency.

## 5. Layout

- App frame: fixed 256 px sidebar (`bg-panel`, sticky, own scroll) + sticky
  translucent header (`bg-paper/90 backdrop-blur`) with user email + sign-out +
  `max-w-6xl` centered main content (`px-6 py-8`).
- **Sidebar nav is primary destinations only** — Dashboard, Calculators (the
  catalog, not individual calculators), Saved, CRM, Tasks, plus the 5 flagship
  Tools. The 15 generated calculators live in the `/calculators` catalog page,
  not as sidebar leaves — reach any of them via that page's filter or the
  command palette, not by scrolling the sidebar.
- **Dashboard (`/`)** is a slim orientation page: an editorial masthead, an
  asymmetric "Featured tools" section (`FeaturedCard`), a link into the full
  catalog, and a couple of quick links (CRM, Tasks). It does not enumerate every
  calculator — that's what `/calculators` (`CalculatorCatalog`) is for.
- Calculator pages: two-column `lg:grid-cols-[380px,1fr]` — inputs left,
  outputs/verdict/chart right; stacks on mobile. This split stays uniform by
  design (dense data-entry UI) — don't editorialize it; the header above it uses
  `CalculatorHeader` per §4.
- **Mobile:** sidebar becomes an off-canvas drawer with a hamburger button in a
  sticky top bar and scrim. Test every new page at 375 px.

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
