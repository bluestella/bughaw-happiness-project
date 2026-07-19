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
sidebar hiding, `permissions.ts`) is UX, not security.

## 2. Auth chain (defense in depth, outermost first)

1. **Invite allowlist trigger** (`enforce_signup_allowlist`, 0001): rejects any
   `auth.users` insert whose email isn't in `public.allowed_emails` — covers
   password signup *and* OAuth, so a random Google account cannot self-provision.
   Supabase surfaces the raised exception as a generic "Database error saving new
   user"; `login/page.tsx` maps that to a friendly invite-only message. Keep that
   mapping.
2. **Session middleware** (`src/middleware.ts`): refreshes the session cookie via
   `auth.getUser()` on every non-static request; signed-out users are redirected to
   `/login?next=…`. Only `/login` and `/auth/*` are public.
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

## 6. Security review checklist for PRs

- [ ] New table → RLS enabled + policies written in the same migration?
- [ ] New security-definer function → `set search_path = public` + minimal grant?
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
