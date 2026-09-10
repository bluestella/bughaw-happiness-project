# Research and Improve Web App UX

> **Workspace:** /Users/bluestella/repositories/bughaw-happiness-project

---

**User**


Use Skill: UX Researcher Do a research on the UX of the web application. Apply best practices on the UX part. I don't think we are winning here. I'll leave it up to you to research. Ask 
Use Skill: Frontend Developer to develop the updates. Make sure it is also aligned with 
Use Skill: Accessibility Auditor . Fix any issues.

**Assistant**

I'll start by invoking the UX Researcher skill to conduct a thorough UX audit of the application, then proceed with the other skills as needed.

Now let me explore the codebase systematically to conduct a thorough UX audit. I'll start by examining the main app structure, key components, and design system.

---

# UX & Accessibility Research Findings — Bughaw Suite

I've completed a thorough heuristic evaluation (Nielsen's 10 Heuristics) and a WCAG 2.2 AA accessibility audit across the entire codebase. Below are the evidence-based findings, prioritized by impact.

---

## 🔴 PRIORITY 1 — ACCESSIBILITY CRITICAL (Blocks users entirely)

### A1. Non-semantic clickable cards (LeadCard & TaskCard)
**WCAG**: 2.1.1 Keyboard (A), 4.1.2 Name, Role, Value (A)  
**Impact**: Keyboard/screen-reader users **cannot open leads or tasks** — they're invisible in the tab order and unannounced.  
**Location**: [CrmBoard.tsx#L82-L132](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/(app)/crm/CrmBoard.tsx#L82-L132), [Board.tsx#L62-L107](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/(app)/tasks/[projectId]/[miniProjectId]/Board.tsx#L62-L107)  
**Current code**: `<div onClick={onOpen}>` — no `role`, no `tabIndex`, no keyboard handler
**Fix**: Convert to `<button>` (wrapping content) or add `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space → open)

### A2. No skip-to-content link
**WCAG**: 2.4.1 Bypass Blocks (A)  
**Impact**: Keyboard users must tab through 20+ Sidebar nav items on EVERY page before reaching content  
**Fix**: Add a visually-hidden-but-focusable "Skip to main content" link as first focusable element, targeting `<main>`

### A3. Focus management broken — Sidebar mobile drawer
**WCAG**: 2.4.3 Focus Order (A), 2.1.1 Keyboard (A)  
**Impact**: When mobile drawer opens, focus stays on the hamburger button — sighted keyboard users can't see where focus is  
**Location**: [Sidebar.tsx#L169-L179](file:///Users/bluestella/repositories/bughaw-happiness-project/src/components/Sidebar.tsx#L169-L179)  
**Fix**: On open, `useEffect` → `focus()` first nav link / close button. On close, return focus to hamburger button.

### A4. Sonner toasts not announced to screen readers
**WCAG**: 4.1.3 Status Messages (AA)  
**Impact**: Save confirmations, error messages, create/delete confirmations are **completely silent** to screen reader users  
**Location**: [AppToaster.tsx#L5-L7](file:///Users/bluestella/repositories/bughaw-happiness-project/src/components/AppToaster.tsx#L5-L7)  
**Current**: `<Toaster position="top-right" closeButton richColors />` — no `aria-live`
**Fix**: Either: (a) wrap Toaster in a `<div aria-live="polite" aria-atomic="true">`, or (b) add explicit `role="status"` region, or (c) use sonner's `toast.custom` with aria-live-wrapped content. Also ensure VerdictBanner `role="status"` content is inside same live region or auto-announced.

### A5. No page titles — route changes silent
**WCAG**: 2.4.2 Page Titled (A)  
**Impact**: Every page has the same `<title>` ("Bughaw Suite" or Next.js default). Screen reader users have no idea which page they landed on after navigation.

---

## 🟠 PRIORITY 2 — ACCESSIBILITY SERIOUS (Major barriers with workarounds)

### B1. TabBar missing ARIA associations
**WCAG**: 1.3.1 Info and Relationships (A), 4.1.2 Name, Role, Value (A)  
**Location**: [tab-bar.tsx#L8-L49](file:///Users/bluestella/repositories/bughaw-happiness-project/src/components/ui/tab-bar.tsx#L8-L49)  
**Current**: Has `role="tablist"` / `role="tab"` / `aria-selected` — GOOD start. Missing: `aria-controls` on tabs, no `role="tabpanel"` with matching `id` on the controlled content.

### B2. Form errors unassociated with fields
**WCAG**: 3.3.1 Error Identification (A), 3.3.2 Labels or Instructions (A)  
**Location**: Login form [login/page.tsx#L154-L155](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/login/page.tsx#L154-L155), plus every inline form  
**Current**: Error `<p>` rendered below fields. No `aria-invalid="true"` on errored inputs, no `aria-describedby` linking error message → input `id`. Screen reader users who land on the input won't hear the error.

### B3. Search inputs missing labels
**WCAG**: 3.3.2 Labels or Instructions (A), 4.1.2 Name, Role, Value (A)  
**Locations**:
- CRM search: [CrmBoard.tsx#L413-L419](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/(app)/crm/CrmBoard.tsx#L413-L419) — has `aria-label` ✓
- CalculatorCatalog search: [CalculatorCatalog.tsx#L37-L49](file:///Users/bluestella/repositories/bughaw-happiness-project/src/components/CalculatorCatalog.tsx#L37-L49) — has icon with `aria-hidden` and placeholder, **no `<label>` and no `aria-label`** ✗
- CommandPalette: [CommandPalette.tsx#L153-L161](file:///Users/bluestella/repositories/bughaw-happiness-project/src/components/CommandPalette.tsx#L153-L161) — same issue ✗  
**Fix**: Add `aria-label="Search calculators"` etc.

### B4. Currency/prefix `<span>` not associated with inputs
**WCAG**: 1.3.1 Info and Relationships (A)  
**Location**: [CalculatorShell.tsx#L186-L209](file:///Users/bluestella/repositories/bughaw-happiness-project/src/components/CalculatorShell.tsx#L186-L209)  
**Current**: The "₱" / "%" affix spans are purely visual. Screen reader announces just input — user might not know it's pesos until they see formatted output.  
**Fix**: `aria-describedby` linking the input to the prefix/suffix id, or `aria-label="Amount in Philippine pesos"`

### B5. CRM table missing `<th scope>` attributes
**WCAG**: 1.3.1 Info and Relationships (A)  
**Location**: [CrmBoard.tsx#L493-L540](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/(app)/crm/CrmBoard.tsx#L493-L540)  
**Current**: `<th>` elements exist but without `scope="col"` — for 6-column tables it's recoverable but technically fails.

### B6. Drag-and-drop has no keyboard alternative
**WCAG**: 2.1.1 Keyboard (A)  
**Impact**: Moving leads/tasks between columns is mouse-only. dnd-kit has keyboard sensors available.  
**Note**: This is already a documented gap in [design-system.md#L162](file:///Users/bluestella/repositories/bughaw-happiness-project/docs/design-system.md#L162) — still a real barrier.

---

## 🟡 PRIORITY 3 — UX HEURISTIC HIGH-IMPACT (Nielsen findings)

### U1. System status invisible — no loading indicators on key pages
**Heuristic**: H1 Visibility of System Status  
**Locations**:
- `/saved` page — has SkeletonCards ✓
- CRM board — initial lead load shows empty columns or "No leads" then content flashes in ✗
- Tasks board — same: initial load is invisible ✗
- Save operations (toast only) — no inline "Saving…" state ✗

### U2. No undo / recovery paths
**Heuristic**: H3 User Control and Freedom  
- Drag moves (lead status / task status) — optimistic update, rollback only if DB rejects. No explicit "Undo last move" button or toast-action.
- Delete operations — ConfirmDialog only, no post-delete recovery (soft-delete or undo window)

### U3. Breadcrumbs absent on deep pages
**Heuristic**: H6 Recognition Rather Than Recall  
**Locations**:
- `/tasks/[projectId]/[miniProjectId]` — only has `← {projectName}` link. No breadcrumb like `Projects / {projectName} / {miniProjectName}`
- Calculators inside categories — no breadcrumb back to category
- CRM sub-pages (import) — no breadcrumb back to CRM

### U4. Empty states are too minimal
**Heuristic**: H8 Aesthetic and Minimalist Design  
Examples:
- Column empty: "Nothing here." — should say "No leads in New. Drag cards here or + Add lead"
- Board empty: "No mini-projects yet." — should include CTA button "Create mini-project" (if has permission)
- No saved calcs: has CTA text ✓
- No CRM leads: has descriptive text ✓

### U5. Login page gaps
**Heuristic**: H9 Help Users Recognize, Diagnose, and Recover from Errors; H3 User Control
- No "Forgot password?" link (Supabase supports password reset — users are locked out)
- Busy state shows bare "…" — should be "Signing in…" / "Creating account…"
- Error "Invalid email or password" gives no clue which is wrong (acceptably cautious for security, but give alternative: "If you forgot your password, ask an admin to reset it" since there's no link)

### U6. Inline help text is tiny and low-contrast
**Heuristic**: H9 Error Recovery; H8  
Calculator `helpText` renders at `text-[11px] text-ink-soft`. Even if contrast technically passes (~6.2:1), 11px body text is a readability strain for the target audience (founders, sales, hotel operators 30–55 y/o). Should be `text-[12px]` minimum with more line height.

---

## 🟢 PRIORITY 4 — POLISH & CONSISTENCY

### P1. Inconsistent button/link implementations
Some actions use `<Button>` component, others inline raw classes:
- Import link in CrmBoard: [CrmBoard.tsx#L402-L408](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/(app)/crm/CrmBoard.tsx#L402-L408) — raw `<Link>` with classes instead of `<Button>` + `asChild` pattern
- Sign-out in AppLayout: [layout.tsx#L20-L27](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/(app)/layout.tsx#L20-L27) — raw button classes
- Open-calculator in Saved: [saved/page.tsx#L98-L103](file:///Users/bluestella/repositories/bughaw-happiness-project/src/app/(app)/saved/page.tsx#L98-L103) — raw Link classes  
**Fix**: Migrate all to `<Button>` + `asChild` for `<Link>`s; Button component needs `asChild` support via Radix pattern or conditional.

### P2. Danger button style references non-existent intent class
[button.tsx#L15](file:///Users/bluestella/repositories/bughaw-happiness-project/src/components/ui/button.tsx#L15):
```ts
danger: "bg-danger-bg text-danger border-danger-border hover:border-danger"
```
But Tailwind only defines `danger` (text), `danger-bg`, `danger-border` colors. `text-danger` = `#A8412A` on `danger-bg` `#FBF0EC` — contrast passes. But `border-danger-border` exists. This is actually fine — colors are defined.

### P3. No visual affordance that cards are clickable
LeadCard / TaskCard — `cursor-pointer` exists, but hover state is only a subtle `hover:border-coir/50`. Many users won't discover the cards open panels. Should have `group-hover` on the title (underline / color shift), or explicit "Open →" affordance on hover.

### P4. Add CTA buttons on dashboard "Every calculator" section
Currently only a Browse all link in the SectionIntro action. No FeaturedCard-like grid of top 4 calculators or filter shortcuts — user must click through.

---

## 📋 IMPLEMENTATION PLAN (By Sprint Batch)

### Batch 1 — Accessibility Blockers (do first)
| # | Task | Files | ETA |
|---|------|-------|-----|
| 1 | Add skip-to-content link + `id="main-content"` on `<main>` | `(app)/layout.tsx`, `globals.css` | ~15 min |
| 2 | Fix LeadCard / TaskCard: make keyboard-reachable `<button>` or add ARIA + keyboard handler | `CrmBoard.tsx`, `Board.tsx` | ~30 min |
| 3 | Fix Sidebar mobile drawer focus management (open → focus close button; close → return focus) | `Sidebar.tsx` | ~20 min |
| 4 | Fix Sonner + live region + status message announcements | `AppToaster.tsx`, root `layout.tsx` | ~20 min |
| 5 | Add dynamic `<title>` per route via Next.js metadata API or client-side effect | Root `layout.tsx`, each `page.tsx` via `export metadata` | ~45 min |
| 6 | Add `aria-live` to VerdictBanner / ensure toasts use same region | `verdict-banner.tsx`, `AppToaster.tsx` | ~10 min |

### Batch 2 — Accessibility Serious (same PR or next)
| # | Task | Files |
|---|------|-------|
| 7 | TabBar: add `aria-controls` + `id`; document that consumers must render `role="tabpanel"` in content | `tab-bar.tsx` + all consumers (CrmBoard, CalculatorCatalog, tools) |
| 8 | Form error association pattern: `aria-invalid` + `aria-describedby` — fix Login first + create reusable pattern | `login/page.tsx`, then `NewLeadForm.tsx`, task forms |
| 9 | Search input missing labels: CalculatorCatalog, CommandPalette | `CalculatorCatalog.tsx`, `CommandPalette.tsx` |
| 10 | CRM table: `<th scope="col">` on all headers | `CrmBoard.tsx` |
| 11 | Calculator currency/percentage affixes: `aria-describedby` pattern | `CalculatorShell.tsx`, `input.tsx` optionally |

### Batch 3 — UX Heuristic Wins
| # | Task | Files |
|---|------|-------|
| 12 | Page loading indicators on CRM & Tasks boards (skeleton columns or inline spinner) | `CrmBoard.tsx`, `Board.tsx`, tasks `page.tsx` |
| 13 | Breadcrumbs: task board, calculator pages, CRM import | `Board.tsx` page wrapper, `calculators/[category]/[calculatorId]/page.tsx` |
| 14 | Improved empty states with CTAs (where permissions allow) | `Board.tsx` columns, CRM empty columns |
| 15 | Login: "Forgot password?" guidance text, better busy-state labels | `login/page.tsx` |
| 16 | Calculator `helpText`: bump to `text-[12px] leading-relaxed` | `CalculatorShell.tsx` |
| 17 | Toast undo action on destructive moves (optional, scope-creep guard: skip if too complex) | `CrmBoard.tsx`, `Board.tsx` drag handlers |

### Batch 4 — Consistency & Polish
| # | Task | Files |
|---|------|-------|
| 18 | `asChild` support for Button + migrate raw Link/button inline classes | `button.tsx`, `CrmBoard.tsx`, `layout.tsx`, `saved/page.tsx` |
| 19 | Stronger clickable-card affordance (hover: title underline, maybe subtle arrow reveal) | `card.tsx` FeaturedCard, LeadCard, TaskCard |
| 20 | Dashboard: add quick-access top-calculators row under SectionIntro header | `(app)/page.tsx` |

---

## ✅ What's working well (keep)
- RLS-first security architecture, mirrored in permissions.ts
- `prefers-reduced-motion` respected globally across transitions
- Fraunces/DM Sans split — emotional/operational typography
- Consistent focus rings (`focus-visible:ring-coir/30`) on most controls
- Calculator input auto-save to localStorage (instant feedback, durable state)
- CalculatorShell input→output column split uniformity
- VerdictBanner with `role="status"` for one-glance go/no-go

---

## 🧪 Validation Plan (after implementation)
1. **Keyboard-only test**: Every critical flow (login → open lead → change status → close panel → sign out) works with Tab/Enter/Escape only
2. **Screen reader** (VoiceOver on Safari): same flow — every state change is announced
3. **Zoom 400%** (Firefox): all content scrolls horizontally only when needed; no overlap
4. **`npm run lint && npm run test && npm run build`** must pass green (CI gate)

---

**Before I start, two quick clarifying questions:**

1. **Batch scope**: Do you want all 4 batches in one PR (~20 files touched), or split into 2 PRs (Batch 1+2 first, then 3+4)? I recommend split so each PR is reviewable.

2. **Breadcrumbs + dynamic titles**: The calculator category pages use dynamic `[category]/[calculatorId]` params. Are you OK with a lightweight `useEffect` + `document.title` approach on client pages, or do you want server-side `export const metadata` (requires moving metadata generation into server layouts)?

Once confirmed, I'll invoke the Frontend Developer skill and start with Batch 1.

Confirmed. One combined PR, hybrid metadata approach. Now invoking the Frontend Developer skill and beginning implementation.

Starting Batch 1a. Let me first check the root layout structure and then make the foundational changes.

Now let me update AppToaster to wrap the toasts in an aria-live region, making them screen-reader accessible.

Now let me migrate the raw inline-class links to use `<Button asChild>`. I'll update the CrmBoard, AppLayout signout, Saved page, and Dashboard.

I'll continue with Batch 1e — implementing the hybrid page title/metadata system. Let me first read the files I need to modify to ensure I have the latest content.

Now let me read the dynamic route pages and the client components that need title effects.

Now let me read the tasks Board component for the client title effect, then I'll apply all Batch 1e edits.

Now I have all the context. Let me apply all Batch 1e edits. I'll start with the server-side metadata exports for static and dynamic routes, then add the client-side title effects.

**Adding metadata to static server pages (Dashboard, Calculators, CRM, CRM Import, Tasks):**

**Now adding `generateMetadata` to the 3 dynamic routes (Calculator, Project, MiniProject):**

**Now adding client-side `document.title` useEffect effects for client pages (hybrid approach defense-in-depth):**

---

