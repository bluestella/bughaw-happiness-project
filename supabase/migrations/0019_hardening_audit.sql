-- Hardening and an audit log (docs/security.md §5, §9; OWASP Top 10:2025 A01, A08, A09).
-- Run AFTER 0018. One transaction.
--
-- 1. list_team_directory() refused nobody who was signed in. A person removed from the
--    invite list kept a valid session for a while and could still list every invited
--    email and note. It now refuses a caller with no role (found by the Wave 0 access
--    tests, docs/security.md §5).
-- 2. Contributor emails were free text, so a typo'd grant silently did nothing. New
--    grants must name someone on the invite list, and are stored lower-cased.
--    Existing rows are not touched.
-- 3. audit_log: who changed what, on the tables where a change matters most (roles
--    and page access, sales documents, interns and reports, CRM leads). Written only
--    by a trigger; read only by a super_admin. An UPDATE stores just the columns that
--    changed. Large or personal text columns are left out on purpose.
-- 4. people_week_start() and people_week_hours() were granted only to `authenticated` in 0018, but the daily-log
--    trigger is SECURITY INVOKER and calls it, so any write as service_role (test
--    cleanup, admin scripts) failed with "permission denied for function" wherever
--    default privileges do not already allow it (CI). They only read, so an explicit
--    grant is safe. anon and PUBLIC stay revoked.
--
-- Verify:
--   select table_name, op, actor_email, changes from public.audit_log order by id desc limit 5;

begin;

-- ============================================================
-- 0. people helpers for service_role (see item 4 above)
-- ============================================================
grant execute on function public.people_week_start(date) to service_role;
grant execute on function public.people_week_hours(text, date) to service_role;

-- ============================================================
-- 1. Team directory
-- ============================================================
create or replace function public.list_team_directory()
returns table (email text, note text)
language plpgsql stable
security definer set search_path = public
as $$
begin
  if public.current_user_role() is null then
    raise exception 'Not allowed.' using errcode = 'insufficient_privilege';
  end if;
  return query select a.email, a.note from public.allowed_emails a order by a.email;
end;
$$;

-- ============================================================
-- 2. Contributors must be on the invite list
-- ============================================================
create or replace function public.require_allowlisted_contributor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.user_email := lower(btrim(new.user_email));
  if not exists (select 1 from public.allowed_emails a where lower(a.email) = new.user_email) then
    raise exception '% is not on the invite list. Invite them first, then add them.', new.user_email
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.require_allowlisted_contributor() from public, anon, authenticated;

create trigger project_contributors_allowlisted
  before insert on public.project_contributors
  for each row execute function public.require_allowlisted_contributor();
create trigger mini_project_contributors_allowlisted
  before insert on public.mini_project_contributors
  for each row execute function public.require_allowlisted_contributor();

-- ============================================================
-- 3. Audit log
-- ============================================================
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- NULL for the service role and for changes made outside a signed-in session.
  actor_email text,
  table_name text not null,
  row_key text,
  op text not null check (op in ('INSERT','UPDATE','DELETE')),
  -- INSERT: the new row. DELETE: the old row. UPDATE: {column: {old, new}} for changed columns.
  changes jsonb not null
);
create index audit_log_table_at_idx on public.audit_log (table_name, at desc);
create index audit_log_actor_at_idx on public.audit_log (lower(actor_email), at desc);

alter table public.audit_log enable row level security;
create policy "audit_log select" on public.audit_log for select to authenticated
  using ((select public.current_user_role()) = 'super_admin');
-- No insert, update or delete policy: only the trigger below writes, and nobody edits history.
grant select on public.audit_log to authenticated;

-- Trigger arguments are the columns to leave out (large, noisy or personal text).
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changes jsonb;
  v_key text;
  v_skip text[] := array['updated_at'] || coalesce(tg_argv, '{}'::text[]);
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  -- id, else the natural key: email (allowed_emails), email/section, role/section.
  v_key := coalesce(v_row ->> 'id', concat_ws('/', coalesce(v_row ->> 'email', v_row ->> 'role'), v_row ->> 'section', v_row ->> 'key'));

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k))
      into v_changes
      from jsonb_object_keys(v_new) as k
     where k <> all (v_skip) and (v_old -> k) is distinct from (v_new -> k);
    if v_changes is null then
      return null; -- nothing that matters changed
    end if;
  else
    v_changes := v_row - v_skip;
  end if;

  insert into public.audit_log (actor_email, table_name, row_key, op, changes)
  values (lower(nullif(auth.jwt() ->> 'email', '')), tg_table_name, v_key, tg_op, v_changes);
  return null;
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- Roles, page access and the invite list.
create trigger zz_audit after insert or update or delete on public.allowed_emails
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.user_section_overrides
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.role_section_defaults
  for each row execute function public.audit_row_change();
-- Sales.
create trigger zz_audit after insert or update or delete on public.sales_products
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.sales_price_tiers
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.sales_quotations
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.sales_orders
  for each row execute function public.audit_row_change();
-- People. Report text stays out of the log: it is already in the report, and the
-- audit log is for who did what, not a second copy of personal writing.
create trigger zz_audit after insert or update or delete on public.people_interns
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.people_weekly_reports
  for each row execute function public.audit_row_change('accomplishments','learnings','blockers','next_week_plan');
-- CRM leads, without the raw submission blobs.
create trigger zz_audit after insert or update or delete on public.crm_leads
  for each row execute function public.audit_row_change('raw','attribution','engagement','geo','description');

commit;
