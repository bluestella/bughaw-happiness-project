# Security

> Security architecture, threat model, and the rules that keep this app safe.
> This doc is honest about gaps — read §5 before assuming a control exists.

## 1. Security model in one paragraph

The app is an **internal, invite-only tool** running entirely on the Supabase
**anon key**. There is no server-held secret and no custom API: every read/write goes
from the browser (or a server component acting with the user's cookie session) to
Postgres, and **Row Level Security is the sole enforcement layer**. Auth is Supabase
GoTrue (email/password + Google OAuth); membership is a DB allowlist enforced by a
`before insert` trigger on `auth.users`; roles are a column on that allowlist, read
through a security-definer RPC. Everything client-side (middleware redirects,
sidebar hiding, `permissions.ts`) is UX, not security. The single exception to
"invite-only" is the public digital business card at `/c/<token>` (§8), which can
reach exactly two narrow security-definer functions and no table.

## 2. Auth chain (defense in depth, outermost first)

1. **Invite allowlist trigger** (`enforce_signup_allowlist`, 0001): rejects any
   `auth.users` insert whose email isn't in `public.allowed_emails` — covers
   password signup *and* OAuth, so a random Google account cannot self-provision.
   Supabase surfaces the raised exception as a generic "Database error saving new
   user"; `login/page.tsx` maps that to a friendly invite-only message. Keep that
   mapping.
2. **Session middleware** (`src/middleware.ts`): refreshes the session cookie via
   `auth.getUser()` on every non-static request; signed-out users are redirected to
   `/login?next=…`. Only `/login`, `/auth/*`, the secret-authed `/api/crm/ingest`
   and the public card route `/c/*` (§8) skip the login redirect.
3. **Role routing**: signed-in contractors are redirected off `/`, `/calculators/*`,
   `/tools/*`, `/saved` to `/tasks`. **This is navigation control, not data
   control** (see §5.1).
4. **RLS** (see [database.md](database.md) §4): the actual boundary. Task-management
   policies enforce the role matrix; workspace tables allow any authenticated user.
5. **DB-set provenance**: `created_by_email` etc. default to `auth.jwt()->>'email'`
   server-side — a client cannot forge authorship on insert. (Caveat §5.4.)

`allowed_emails` has RLS enabled with **zero policies** — unreadable and unwritable
with the anon key. Clients learn only their own role via `current_user_role()`.

## 3. The three-layer permission contract

Any permission change must touch all three, in this order:

1. **SQL migration** — policies / security-definer functions (enforcement),
2. **`src/lib/permissions.ts`** — pure mirror for UI affordances,
3. **`tests/unit/permissions.test.ts`** — capability matrix assertions.

If the mirror and the policies disagree, the UI shows buttons that fail (annoying) or
hides actions that would succeed (confusing) — but security holds as long as the SQL
is right. **Never "fix" a permission bug in TypeScript only.**

## 4. Secrets & configuration

- Only public config exists: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `..._PUBLISHABLE_KEY`). The anon key is
  *designed* to be public; RLS is what protects data.
- **The service-role key must never enter this codebase**, its env, or Vercel env
  for this app. Admin operations (editing the allowlist, role changes) happen in the
  Supabase dashboard/service context only.
- `.env.local` is git-ignored; `.env.example` documents required vars. If you add a
  var, update `.env.example` and this doc. If a real secret (non-`NEXT_PUBLIC_`)
  ever becomes necessary, it must only be read in route handlers/server code and
  reviewed here first.
- CI builds with placeholder Supabase values — builds must never require real creds.
- **Wallet signing keys (optional, server-only)** — `APPLE_PASS_*`, `APPLE_TEAM_ID`,
  `APPLE_WWDR_CERT_PEM`, `GOOGLE_WALLET_*`. These are the app's only non-public
  secrets. They are read solely by `src/lib/wallet.ts` from the
  `src/app/c/[token]/wallet/*` route handlers, never from client code, and
  never with a `NEXT_PUBLIC_` prefix. Unset means the wallet routes 404. A
  Google *Cloud* service account for Wallet is unrelated to (and does not
  justify) a Supabase service-role key, which is still banned.

## 5. Known gaps (accepted risks — do not silently "discover" these as new)

1. **Contractors can reach workspace data at the API level.** RLS on
   `pipeline_accounts`, `app_state`, `saved_calculations` is role-blind
   (`to authenticated using (true)`). The contractor lockout is only middleware
   routing; a contractor using the anon key + their JWT directly can read/write the
   CRM pipeline and calculator state. Accepted because contractors are trusted
   invitees; **tighten by adding `current_user_role() <> 'contractor'` policies** if
   contractor trust drops.
2. **Contributor grants accept arbitrary emails** (no allowlist FK) — a typo grants
   nobody, but also nobody notices. Low risk (grant, not data), fix in DB if needed.
3. **No rate limiting / abuse controls** beyond Supabase's defaults on auth
   endpoints.
4. **`assignee_email` and grant emails are client-supplied strings** (only
   `created_by_*` fields are DB-derived). Spoofing assignment display is possible by
   any user who can edit tasks; provenance fields remain trustworthy.
5. **No audit log** beyond `created_*` columns and append-only `task_comments`.
6. **No error tracking / security monitoring** (no Sentry, no alerting).
7. **XSS surface**: all user text is rendered through React (auto-escaped); there is
   no `dangerouslySetInnerHTML` in the app. Keep it that way — if rich text is ever
   added, sanitize server-side.

8. **Fixed in 0008 (Oct 2026), kept here as a lesson:** the `admin_*` allowlist
   RPCs from 0007 guarded with `current_user_role() <> 'super_admin'`. For an
   anonymous caller that is `NULL <> …` = `NULL`, so the guard never fired. And
   Postgres grants `EXECUTE` to `PUBLIC` by default, so anyone with the anon key
   could add themselves to the allowlist as super_admin (reproduced locally).
   0008 makes the guards null-safe (`is distinct from`) and revokes `EXECUTE`
   from `public, anon`.

## 6. Security review checklist for PRs

- [ ] New table → RLS enabled + policies written in the same migration?
- [ ] New security-definer function → `set search_path = public` + minimal grant?
      That means `revoke all … from public, anon` **before** granting: Postgres
      grants EXECUTE to PUBLIC by default, and Supabase also grants anon.
- [ ] Role guards are null-safe: `if current_user_role() is distinct from
      'super_admin'`, never `<>` (a NULL role must be refused).
- [ ] Anything reachable without login (`/c/*`, `/api/crm/ingest`) reads only through
      a security-definer function returning display-safe columns. No anon
      table policies.
- [ ] Any permission logic changed in TS → matching SQL policy change + tests?
- [ ] No service-role key, no secret in `NEXT_PUBLIC_*`, `.env.example` updated?
- [ ] All email comparisons case-insensitive (`lower()` / `.toLowerCase()`)?
- [ ] User input rendered only via React text nodes (no HTML injection paths)?
- [ ] Destructive actions confirmed in UI *and* restricted by RLS?
- [ ] Redirect targets constructed from `request.nextUrl.clone()` / same-origin only
      (the `next` param is path-joined onto `origin` in `/auth/callback` — keep it a
      path, never a full URL)?

## 7. Hardening roadmap (recommended order)

1. Role-aware RLS on the workspace tables (closes §5.1).
2. JWT custom claim for role (removes the per-request RPC *and* keeps enforcement
   server-side).
3. Validate contributor emails against `allowed_emails` (trigger or FK).
4. Sentry (or similar) + Supabase log drains for visibility.
5. Optional: move Google OAuth + email confirm settings under change control
   (documented dashboard config), enable leaked-password protection in Supabase Auth.

## 8. The public card layer (`/c/<token>`, migration 0009)

The Suite's only public page. It exists because sharing a business card has to
work without a login. Design rules, all enforced in the database:

| Threat | Control |
|---|---|
| Reading unpublished cards, hidden phone numbers, owner/admin fields | `get_public_card()` returns published rows only and a fixed list of display columns. Phone is blanked unless `show_phone`. `anon` has **no** table policy on `business_cards` or `business_card_events`. |
| Enumerating the team by guessing URLs | Random 12-char base62 token (~70 bits). Unknown, draft, suspended and rotated tokens all render the same "not available" page. |
| A leaked or lost QR/NFC tag | `admin_rotate_card_token()` (new token, every old link dies) or set status `suspended`. |
| Analytics spam / storage abuse | `record_card_event()` validates every field against a fixed vocabulary, inserts only, ignores unpublished cards, throttles 60/min per card and 600/min globally, and returns nothing (not an oracle). The click route is same-origin only and always answers 204. |
| Search engines indexing staff details | `X-Robots-Tag: noindex, nofollow` from middleware plus robots metadata. |
| Script/markup injection via card fields | https-only URL check constraints (no `javascript:`), phone character whitelist, length caps. All text is rendered by React. The email-signature HTML is built with `escapeHtml()` and never rendered in-app. |
| Visitor privacy (Data Privacy Act) | No IP, cookie, fingerprint or location stored. Counts only. Bots/unfurlers are skipped. |
| Admin data leaking to non-admins | `business_cards`, `business_card_events`, `admin_card_event_rollup()` and `admin_rotate_card_token()` are super_admin-only in RLS/function guards. `/admin/cards` also redirects non-admins. |

Accepted residual risks: anyone holding a card link can see that card (by
design). A motivated actor can inflate a card's counters up to the throttle.
Photos load from whatever https host the admin pasted, so that host sees the
visitor's IP (`referrerPolicy="no-referrer"` limits what else it learns).
