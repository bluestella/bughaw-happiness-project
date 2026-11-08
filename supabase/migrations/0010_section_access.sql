-- Bughaw Suite — per-person section/page access
-- Run this in the Supabase SQL editor (or `supabase db push`) AFTER 0009_digital_cards.sql.
--
-- Before this migration, what a person could see was hard-coded by role:
-- contractors got /tasks only, everyone else got everything. This replaces
-- that with data a super_admin edits from /admin/access:
--
--   app_sections            the switchable areas of the app (CRM, Calculators,
--                           Saved, Tasks, and each Tool page)
--   role_section_defaults   what each role gets out of the box
--   user_section_overrides  per-person exceptions (allow or deny), keyed by
--                           allowlist email
--
-- Effective access (has_section below, mirrored by src/lib/access.ts):
--   super_admin           -> every section, always (cannot be locked out)
--   no allowlist row      -> nothing
--   otherwise             -> the person's override if one exists,
--                            else their role's default, else no access
--
-- Enforcement is in RLS, not just the UI: the crm_*, pipeline_accounts,
-- app_state, saved_calculations and task tables now check has_section().
-- Delete rights are unchanged (super_admin only where they were before).
--
-- The seeded defaults reproduce the pre-0010 behaviour exactly (member =
-- everything, contractor = tasks only), so running this changes nothing for
-- anyone until a super_admin edits a default or an override.

-- ============================================================
-- 1. Tables (RLS on, no policies: reached only through the
--    security-definer functions below, like allowed_emails)
-- ============================================================
create table public.app_sections (
  key text primary key,
  label text not null,
  group_label text not null,
  sort_order int not null default 0
);

create table public.role_section_defaults (
  role public.app_role not null,
  section text not null references public.app_sections(key) on delete cascade,
  allowed boolean not null,
  primary key (role, section)
);

create table public.user_section_overrides (
  email text not null references public.allowed_emails(email) on delete cascade on update cascade,
  section text not null references public.app_sections(key) on delete cascade,
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  updated_by_email text default (auth.jwt() ->> 'email'),
  primary key (email, section)
);

alter table public.app_sections enable row level security;
alter table public.role_section_defaults enable row level security;
alter table public.user_section_overrides enable row level security;
-- No policies on purpose.

-- Keys must match SECTIONS in src/lib/access.ts.
insert into public.app_sections (key, label, group_label, sort_order) values
  ('crm',                  'CRM (lead funnel + import)',  'Sections', 10),
  ('tasks',                'Projects & boards',           'Sections', 20),
  ('calculators',          'Calculators',                 'Sections', 30),
  ('saved',                'Saved calculations',          'Sections', 40),
  ('tool:pipeline',        'Pipeline Simulator',          'Tools',    50),
  ('tool:cost-calculator', 'Unit Cost Calculator',        'Tools',    60),
  ('tool:unit-economics',  'Unit Economics Simulator',    'Tools',    70),
  ('tool:pnl',             'P&L Machine',                 'Tools',    80),
  ('tool:funding',         'Funding & Investor Ask',      'Tools',    90),
  ('tool:qr-studio',       'QR Studio',                   'Tools',   100);

-- Pre-0010 behaviour: members see everything, contractors see tasks only.
-- super_admin is never consulted (always allowed), so it has no rows.
insert into public.role_section_defaults (role, section, allowed)
select 'member', key, true from public.app_sections;
insert into public.role_section_defaults (role, section, allowed)
select 'contractor', key, key = 'tasks' from public.app_sections;

-- ============================================================
-- 2. Access functions
-- ============================================================
-- has_section compares lower() on both sides (AGENTS.md §4.2), so a legacy
-- mixed-case allowlist row still matches the signed-in email.
create index user_section_overrides_lower_email_idx
  on public.user_section_overrides (lower(email), section);

create or replace function public.has_section(p_section text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when public.current_user_role() is null then false
    when public.current_user_role() = 'super_admin' then true
    else coalesce(
      (select o.allowed from public.user_section_overrides o
        where lower(o.email) = lower(auth.jwt() ->> 'email') and o.section = p_section
        limit 1),
      (select d.allowed from public.role_section_defaults d
        where d.role = public.current_user_role() and d.section = p_section),
      false
    )
  end;
$$;

-- One round trip for the middleware and the app layout: role + visible sections.
create or replace function public.current_user_access()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'role', public.current_user_role(),
    'sections', coalesce(
      (select jsonb_agg(s.key order by s.sort_order)
         from public.app_sections s
        where public.has_section(s.key)),
      '[]'::jsonb
    )
  );
$$;

-- Which section governs a row of the shared app_state document store.
-- An unknown key maps to NULL, which only a super_admin can touch: a new
-- tool that stores state here must add its key to this function.
create or replace function public.app_state_section(p_key text)
returns text
language sql immutable set search_path = public
as $$
  select case
    when p_key = 'cost-calc' then 'tool:cost-calculator'
    when p_key like 'pipeline-%' then 'tool:pipeline'
    else null
  end;
$$;

create or replace function public.has_app_state_access(p_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_user_role() = 'super_admin'
      or coalesce(public.has_section(public.app_state_section(p_key)), false);
$$;

-- ============================================================
-- 3. Admin RPCs (super_admin only, null-safe guards as in 0008)
-- ============================================================
create or replace function public.admin_get_section_access()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can view page access.';
  end if;
  return jsonb_build_object(
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', s.key, 'label', s.label, 'group', s.group_label) order by s.sort_order)
      from public.app_sections s), '[]'::jsonb),
    'defaults', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', d.role, 'section', d.section, 'allowed', d.allowed))
      from public.role_section_defaults d), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', o.email, 'section', o.section, 'allowed', o.allowed))
      from public.user_section_overrides o), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', lower(a.email), 'role', a.role, 'note', a.note) order by lower(a.email))
      from public.allowed_emails a), '[]'::jsonb)
  );
end;
$$;

-- p_allowed NULL clears the override (back to the role default).
create or replace function public.admin_set_user_section(
  p_email text,
  p_section text,
  p_allowed boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_stored text;
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can change page access.';
  end if;
  if not exists (select 1 from public.app_sections where key = p_section) then
    raise exception 'Unknown section: %', p_section;
  end if;
  -- Match the allowlist row case-insensitively; the FK needs its exact spelling.
  select email into v_stored from public.allowed_emails where lower(email) = v_email limit 1;
  if v_stored is null then
    raise exception 'That email is not on the allowlist.';
  end if;

  if p_allowed is null then
    delete from public.user_section_overrides
     where lower(email) = v_email and section = p_section;
  else
    insert into public.user_section_overrides (email, section, allowed)
    values (v_stored, p_section, p_allowed)
    on conflict (email, section) do update
      set allowed = excluded.allowed,
          updated_at = now(),
          updated_by_email = auth.jwt() ->> 'email';
  end if;
end;
$$;

create or replace function public.admin_set_role_section_default(
  p_role public.app_role,
  p_section text,
  p_allowed boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can change role defaults.';
  end if;
  if p_role = 'super_admin' then
    raise exception 'Super admins always see every section.';
  end if;
  if p_allowed is null then
    raise exception 'A role default must be allowed or not allowed.';
  end if;
  if not exists (select 1 from public.app_sections where key = p_section) then
    raise exception 'Unknown section: %', p_section;
  end if;
  insert into public.role_section_defaults (role, section, allowed)
  values (p_role, p_section, p_allowed)
  on conflict (role, section) do update set allowed = excluded.allowed;
end;
$$;


revoke all on function public.has_section(text) from public, anon;
revoke all on function public.current_user_access() from public, anon;
revoke all on function public.app_state_section(text) from public, anon;
revoke all on function public.has_app_state_access(text) from public, anon;
revoke all on function public.admin_get_section_access() from public, anon;
revoke all on function public.admin_set_user_section(text, text, boolean) from public, anon;
revoke all on function public.admin_set_role_section_default(public.app_role, text, boolean) from public, anon;

grant execute on function public.has_section(text) to authenticated;
grant execute on function public.current_user_access() to authenticated;
grant execute on function public.app_state_section(text) to authenticated;
grant execute on function public.has_app_state_access(text) to authenticated;
grant execute on function public.admin_get_section_access() to authenticated;
grant execute on function public.admin_set_user_section(text, text, boolean) to authenticated;
grant execute on function public.admin_set_role_section_default(public.app_role, text, boolean) to authenticated;

-- ============================================================
-- 4. RLS: replace role checks with section checks
--    `(select ...)` wraps let Postgres evaluate the check once per
--    statement instead of once per row.
-- ============================================================

-- 4a. CRM — anyone with the 'crm' section works the funnel; delete stays super_admin.
drop policy "crm_accounts select" on public.crm_accounts;
drop policy "crm_accounts insert" on public.crm_accounts;
drop policy "crm_accounts update" on public.crm_accounts;
drop policy "crm_contacts select" on public.crm_contacts;
drop policy "crm_contacts insert" on public.crm_contacts;
drop policy "crm_contacts update" on public.crm_contacts;
drop policy "crm_leads select" on public.crm_leads;
drop policy "crm_leads insert" on public.crm_leads;
drop policy "crm_leads update" on public.crm_leads;
drop policy "crm_lead_activities select" on public.crm_lead_activities;
drop policy "crm_lead_activities insert" on public.crm_lead_activities;

create policy "crm_accounts select" on public.crm_accounts for select to authenticated
  using ((select public.has_section('crm')));
create policy "crm_accounts insert" on public.crm_accounts for insert to authenticated
  with check ((select public.has_section('crm')));
create policy "crm_accounts update" on public.crm_accounts for update to authenticated
  using ((select public.has_section('crm')));

create policy "crm_contacts select" on public.crm_contacts for select to authenticated
  using ((select public.has_section('crm')));
create policy "crm_contacts insert" on public.crm_contacts for insert to authenticated
  with check ((select public.has_section('crm')));
create policy "crm_contacts update" on public.crm_contacts for update to authenticated
  using ((select public.has_section('crm')));

create policy "crm_leads select" on public.crm_leads for select to authenticated
  using ((select public.has_section('crm')));
create policy "crm_leads insert" on public.crm_leads for insert to authenticated
  with check ((select public.has_section('crm')));
create policy "crm_leads update" on public.crm_leads for update to authenticated
  using ((select public.has_section('crm')));

create policy "crm_lead_activities select" on public.crm_lead_activities for select to authenticated
  using ((select public.has_section('crm')));
create policy "crm_lead_activities insert" on public.crm_lead_activities for insert to authenticated
  with check ((select public.has_section('crm')));

-- 4b. pipeline_accounts — the Pipeline Simulator, plus the CRM's
--     "promote to pipeline" (LeadPanel inserts and reads back the id).
--     0004 and 0005 each left a set of permissive policies; drop both.
drop policy if exists "non-contractor read"   on public.pipeline_accounts;
drop policy if exists "non-contractor write"  on public.pipeline_accounts;
drop policy if exists "non-contractor update" on public.pipeline_accounts;
drop policy if exists "non-contractor delete" on public.pipeline_accounts;
drop policy if exists "pipeline_accounts read"   on public.pipeline_accounts;
drop policy if exists "pipeline_accounts write"  on public.pipeline_accounts;
drop policy if exists "pipeline_accounts update" on public.pipeline_accounts;
drop policy if exists "pipeline_accounts delete" on public.pipeline_accounts;

create policy "pipeline_accounts read" on public.pipeline_accounts for select to authenticated
  using ((select public.has_section('tool:pipeline')) or (select public.has_section('crm')));
create policy "pipeline_accounts write" on public.pipeline_accounts for insert to authenticated
  with check ((select public.has_section('tool:pipeline')) or (select public.has_section('crm')));
create policy "pipeline_accounts update" on public.pipeline_accounts for update to authenticated
  using ((select public.has_section('tool:pipeline')))
  with check ((select public.has_section('tool:pipeline')));
create policy "pipeline_accounts delete" on public.pipeline_accounts for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

-- 4c. app_state — per key, via app_state_section().
drop policy if exists "non-contractor read"   on public.app_state;
drop policy if exists "non-contractor write"  on public.app_state;
drop policy if exists "non-contractor update" on public.app_state;
drop policy if exists "non-contractor delete" on public.app_state;
drop policy if exists "app_state read"   on public.app_state;
drop policy if exists "app_state write"  on public.app_state;
drop policy if exists "app_state update" on public.app_state;
drop policy if exists "app_state delete" on public.app_state;

create policy "app_state read" on public.app_state for select to authenticated
  using (public.has_app_state_access(key));
create policy "app_state write" on public.app_state for insert to authenticated
  with check (public.has_app_state_access(key));
create policy "app_state update" on public.app_state for update to authenticated
  using (public.has_app_state_access(key))
  with check (public.has_app_state_access(key));
create policy "app_state delete" on public.app_state for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

-- 4d. saved_calculations — browse/edit needs 'saved'; saving a run from a
--     calculator needs 'calculators'.
drop policy if exists "non-contractor read"   on public.saved_calculations;
drop policy if exists "non-contractor write"  on public.saved_calculations;
drop policy if exists "non-contractor delete" on public.saved_calculations;
drop policy if exists "team update"              on public.saved_calculations;
drop policy if exists "saved_calculations read"   on public.saved_calculations;
drop policy if exists "saved_calculations write"  on public.saved_calculations;
drop policy if exists "saved_calculations delete" on public.saved_calculations;

create policy "saved_calculations read" on public.saved_calculations for select to authenticated
  using ((select public.has_section('saved')));
create policy "saved_calculations write" on public.saved_calculations for insert to authenticated
  with check ((select public.has_section('calculators')) or (select public.has_section('saved')));
create policy "saved_calculations update" on public.saved_calculations for update to authenticated
  using ((select public.has_section('saved')))
  with check ((select public.has_section('saved')));
create policy "saved_calculations delete" on public.saved_calculations for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

-- 4e. Tasks — every task-table policy for non-super_admins goes through
--     these two helpers, so gating them on 'tasks' gates the whole area.
--     Contributor grants still decide *which* boards a person sees.
create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_section('tasks') and exists (
    select 1 from public.project_contributors pc
    where pc.project_id = p_project_id
      and lower(pc.user_email) = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.has_mini_project_access(p_mini_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_section('tasks') and (
    exists (
      select 1 from public.mini_project_contributors mpc
      where mpc.mini_project_id = p_mini_project_id
        and lower(mpc.user_email) = lower(auth.jwt() ->> 'email')
    )
    or exists (
      select 1
      from public.mini_projects mp
      join public.project_contributors pc on pc.project_id = mp.project_id
      where mp.id = p_mini_project_id
        and lower(pc.user_email) = lower(auth.jwt() ->> 'email')
    )
  );
$$;
