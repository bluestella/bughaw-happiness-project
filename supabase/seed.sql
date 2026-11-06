-- ============================================================================
-- LOCAL / E2E ONLY — never run this against a hosted Supabase project.
-- ============================================================================
-- `supabase db reset` runs this after the migrations, on the throwaway local stack
-- used by the Playwright suite (docs/ui-testing.md). It defines the BASELINE state
-- that global teardown restores after every run (docs/ui-testing.md §1.1):
-- tests may create anything they like, but every row not present here is deleted
-- when the run ends.
--
-- The values below are test credentials for 127.0.0.1 only. They are not secrets.

-- Table privileges. Hosted projects created before Supabase changed its defaults
-- auto-grant anon/authenticated/service_role on every new public table, and the
-- migrations rely on that (they only add RLS policies). Newer local stacks no
-- longer auto-grant, so without this every query fails with "permission denied".
-- Granting the OLD defaults keeps local behaviour identical to production: RLS,
-- not missing grants, is what the E2E security tests exercise.
-- TODO: move this into a numbered migration so a fresh hosted project works too
-- (see docs/ui-testing.md §6, Day-one findings).
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Invite list + roles. Registered users are created by tests/e2e/global-setup.ts
-- (and deleted again by global-teardown.ts). signout@test.local exists so the
-- sign-out test (a global sign-out revokes every session of that user) never
-- touches the shared role sessions. newhire@test.local stays unregistered
-- so TC-AUTH-06 can exercise the allowlisted signup path.
insert into public.allowed_emails (email, note, role) values
  ('admin@test.local',      'e2e super admin', 'super_admin'),
  ('member@test.local',     'e2e member',      'member'),
  ('contractor@test.local', 'e2e contractor',  'contractor'),
  ('signout@test.local',    'e2e sign-out user', 'member'),
  ('newhire@test.local',    'e2e unregistered invitee', 'member')
on conflict (email) do update set role = excluded.role, note = excluded.note;

-- Shared secret the ingest route checks (TC-INGEST-*). Local value only.
insert into public.crm_ingest_secrets (name, secret) values
  ('e2e', 'e2e-ingest-secret')
on conflict (name) do update set secret = excluded.secret;
