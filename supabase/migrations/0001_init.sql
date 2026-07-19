-- Bughaw Calculators Hub — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).

-- ============================================================
-- 1. Invite-only allowlist
-- ============================================================
create table public.allowed_emails (
  email text primary key,
  note text default '',
  added_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;
-- No policies on purpose: only the service role / dashboard can read or write it.

create or replace function public.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or not exists (
       select 1 from public.allowed_emails a
       where lower(a.email) = lower(new.email)
     )
  then
    raise exception 'Signups are invite-only. Ask a Bughaw admin to add your email.';
  end if;
  return new;
end;
$$;

create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();

-- Add your team here (edit before running, or insert later from the dashboard):
insert into public.allowed_emails (email, note) values
  ('soltairefawkes@gmail.com', 'owner');

-- ============================================================
-- 2. Shared team workspace tables
--    Everyone who can sign in shares the same data.
-- ============================================================

-- Pipeline mini-app: hotel accounts (kanban board)
create table public.pipeline_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  property text not null default '',
  segment text not null default 'A' check (segment in ('A','B')),
  stage text not null default 'Warm Contact' check (stage in
    ('Warm Contact','Meeting Secured','Sample Delivered','PO Signed','Repeat Order','Disqualified')),
  contact text not null default '',
  notes text not null default '',
  reason text not null default '',
  referred_by text not null default '',
  generated_referral boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Small shared JSON documents (cost-calculator table, pipeline simulator
-- scenario, unit-econ assumptions) keyed like the old artifact storage.
create table public.app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Saved runs of the config-driven calculators
create table public.saved_calculations (
  id uuid primary key default gen_random_uuid(),
  calculator_id text not null,
  label text not null default '',
  inputs jsonb not null,
  outputs jsonb not null,
  created_by uuid default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. RLS — shared workspace: any authenticated user, full access
-- ============================================================
alter table public.pipeline_accounts enable row level security;
alter table public.app_state enable row level security;
alter table public.saved_calculations enable row level security;

create policy "team read"   on public.pipeline_accounts for select to authenticated using (true);
create policy "team write"  on public.pipeline_accounts for insert to authenticated with check (true);
create policy "team update" on public.pipeline_accounts for update to authenticated using (true);
create policy "team delete" on public.pipeline_accounts for delete to authenticated using (true);

create policy "team read"   on public.app_state for select to authenticated using (true);
create policy "team write"  on public.app_state for insert to authenticated with check (true);
create policy "team update" on public.app_state for update to authenticated using (true);
create policy "team delete" on public.app_state for delete to authenticated using (true);

create policy "team read"   on public.saved_calculations for select to authenticated using (true);
create policy "team write"  on public.saved_calculations for insert to authenticated with check (true);
create policy "team delete" on public.saved_calculations for delete to authenticated using (true);

-- ============================================================
-- 4. Seed: current real pipeline (from bughaw_pipeline_simulator.html)
-- ============================================================
insert into public.pipeline_accounts
  (name, property, segment, stage, contact, notes, reason, referred_by, generated_referral)
values
  ('Grand Hyatt Manila','461 rooms','B','Sample Delivered','Denise Ann Samson (Sustainability Manager)',
   'Hand-delivered Jul 9. RGM approval pending. Coconut slipper flagged as most viable entry product.','','',true),
  ('Marsham Hotel','Zamboanga','A','Sample Delivered','Alain (Owner-operator)',
   'Hand-delivered Jul 10. Source of the 10% WTP ceiling validation. DOT accreditation-aspiring.','','',false),
  ('New Segment A prospect','TBD','A','Warm Contact','Not yet identified',
   'Beta-round repeatability test target — confirm identity and book a meeting before Jul 24.','','',false),
  ('El Nido Resorts','Ayala Land','B','Warm Contact','Not yet identified',
   'GTPI signatory — committed to phasing out all single-use guest amenities. Highest-conviction warm lead in the pipeline.','','Grand Hyatt Manila',false),
  ('Holiday Inn (Ayala group)','','B','Warm Contact','Not yet identified',
   'Warm referral from Denise, not yet contacted.','','Grand Hyatt Manila',false),
  ('Red Planet QC','Budget chain','B','Disqualified','Arvin (Operations Lead)','',
   'Centralized corporate procurement through Makati HQ — property GMs cannot decide. Already removed single-use dispensers. PHP 45 amenity kit benchmark.','',false),
  ('QC boutique (LLDA-regulated)','Small property','A','Disqualified','','',
   'Existing sustainable supplier relationship. Primary sustainability concern is water quality, not packaging — low fit.','',false);
