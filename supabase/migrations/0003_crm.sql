-- Bughaw Calculators Hub — CRM (accounts / contacts / leads / activity)
-- Run this in the Supabase SQL editor (or `supabase db push`) AFTER 0002_task_management.sql.
--
-- ACTION REQUIRED after running: insert an ingest secret so the marketing site can
-- mirror form submissions into this CRM. Generate a long random string, e.g.
--   select encode(gen_random_bytes(32), 'hex');
-- then run (from the SQL editor / service role only — this table has no policies):
--   insert into public.crm_ingest_secrets (name, secret) values ('bughawinnovations.ph', '<paste>');
-- Store the same value on the marketing site as CRM_INGEST_SECRET.

-- ============================================================
-- 1. Accounts (company / hotel property)
-- ============================================================
create table public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Dedupe key (FORMS_AUDIT §10.2): case/whitespace-insensitive company name.
  name_key text generated always as (lower(btrim(name))) stored unique,
  kind text not null default 'company' check (kind in ('hotel','company')),
  industry text not null default '',
  hotel_star_rating text not null default ''
    check (hotel_star_rating in ('','3-Star','4-Star','5-Star','Unrated')),
  hotel_room_count_band text not null default ''
    check (hotel_room_count_band in ('','<50','50–100','101–200','200+')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. Contacts (person at an account)
-- ============================================================
create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.crm_accounts(id) on delete set null,
  full_name text not null default '',
  email text not null,
  -- Primary dedupe key across all three forms (FORMS_AUDIT §10.2).
  email_key text generated always as (lower(btrim(email))) stored unique,
  job_title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_contacts_account_id_idx on public.crm_contacts(account_id);

-- ============================================================
-- 3. Leads — one row per submission (never deduped, by design)
-- ============================================================
create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.crm_contacts(id) on delete set null,
  account_id uuid references public.crm_accounts(id) on delete set null,
  origin_form text not null
    check (origin_form in ('contact','for_hotels','inquiry_api','manual','import')),
  lead_type text not null default 'general'
    check (lead_type in ('general','hotel_pilot','inquiry')),
  status text not null default 'New'
    check (status in ('New','Acknowledged','Qualified','Pilot Scoping','Closed Won','Closed Lost')),
  -- Fractional funnel ordering (same scheme as public.tasks).
  position double precision not null default 0,
  source text not null default '',
  product_interests text[] not null default '{}',
  product_of_interest text not null default '',
  estimated_volume text not null default '',
  description text not null default '',
  engagement_tier text not null default '',
  ga_client_id text,
  attribution jsonb,
  engagement jsonb,
  geo jsonb,
  raw jsonb,
  pipeline_account_id uuid references public.pipeline_accounts(id) on delete set null,
  -- Reserved for a later owner-assignment feature; no UI reads it today.
  owner_email text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_leads_status_idx on public.crm_leads(status, position);
create index crm_leads_contact_id_idx on public.crm_leads(contact_id);
create index crm_leads_account_id_idx on public.crm_leads(account_id);
create index crm_leads_submitted_at_idx on public.crm_leads(submitted_at desc);

-- ============================================================
-- 4. Activity log — append-only (same design as public.task_comments)
-- ============================================================
create table public.crm_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','status_change','system')),
  body text not null default '',
  from_status text,
  to_status text,
  author_email text not null default coalesce(auth.jwt() ->> 'email', 'system'),
  created_at timestamptz not null default now()
);
create index crm_lead_activities_lead_id_idx on public.crm_lead_activities(lead_id, created_at);

-- ============================================================
-- 5. Ingest secrets — service role only, like public.allowed_emails
-- ============================================================
create table public.crm_ingest_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now()
);
alter table public.crm_ingest_secrets enable row level security;
-- No policies on purpose: only the service role / dashboard can read or write it.

-- ============================================================
-- 6. RLS — CRM is for super_admin + member; contractors get nothing
-- ============================================================
alter table public.crm_accounts enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_lead_activities enable row level security;

create policy "crm_accounts select" on public.crm_accounts for select to authenticated
  using (public.current_user_role() in ('super_admin','member'));
create policy "crm_accounts insert" on public.crm_accounts for insert to authenticated
  with check (public.current_user_role() in ('super_admin','member'));
create policy "crm_accounts update" on public.crm_accounts for update to authenticated
  using (public.current_user_role() in ('super_admin','member'));
create policy "crm_accounts delete" on public.crm_accounts for delete to authenticated
  using (public.current_user_role() = 'super_admin');

create policy "crm_contacts select" on public.crm_contacts for select to authenticated
  using (public.current_user_role() in ('super_admin','member'));
create policy "crm_contacts insert" on public.crm_contacts for insert to authenticated
  with check (public.current_user_role() in ('super_admin','member'));
create policy "crm_contacts update" on public.crm_contacts for update to authenticated
  using (public.current_user_role() in ('super_admin','member'));
create policy "crm_contacts delete" on public.crm_contacts for delete to authenticated
  using (public.current_user_role() = 'super_admin');

create policy "crm_leads select" on public.crm_leads for select to authenticated
  using (public.current_user_role() in ('super_admin','member'));
create policy "crm_leads insert" on public.crm_leads for insert to authenticated
  with check (public.current_user_role() in ('super_admin','member'));
create policy "crm_leads update" on public.crm_leads for update to authenticated
  using (public.current_user_role() in ('super_admin','member'));
create policy "crm_leads delete" on public.crm_leads for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- Activity log: read/append for the same roles; no update/delete policies => append-only.
create policy "crm_lead_activities select" on public.crm_lead_activities for select to authenticated
  using (public.current_user_role() in ('super_admin','member'));
create policy "crm_lead_activities insert" on public.crm_lead_activities for insert to authenticated
  with check (public.current_user_role() in ('super_admin','member'));

-- ============================================================
-- 7. Ingest function — the only write path that does not need a session.
--    Authorisation happens here (shared secret), not in the app: this app
--    never holds a service-role key.
-- ============================================================
create or replace function public.ingest_form_submission(p_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_form text;
  v_lead_type text;
  v_account_name text;
  v_account_kind text;
  v_industry text;
  v_star text;
  v_rooms text;
  v_email text;
  v_full_name text;
  v_job_title text;
  v_interests text[];
  v_account_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
begin
  select exists (
    select 1 from public.crm_ingest_secrets s where s.secret = p_secret
  ) into v_ok;
  if p_secret is null or p_secret = '' or not v_ok then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- Honeypot (FORMS_AUDIT §5.1): never store the record, but report success so
  -- the bot gets no oracle.
  if coalesce(btrim(p_payload ->> 'website_field_hp'), '') <> '' then
    return jsonb_build_object('status', 'dropped');
  end if;

  v_form := coalesce(p_payload ->> 'form', 'contact');
  v_email := btrim(coalesce(p_payload ->> 'email', ''));
  if v_email = '' then
    raise exception 'email is required' using errcode = '22023';
  end if;

  if v_form = 'for_hotels' then
    v_lead_type := 'hotel_pilot';
    v_account_name := btrim(coalesce(p_payload ->> 'hotelName', ''));
    v_account_kind := 'hotel';
    v_industry := 'Hospitality';
    v_star := coalesce(p_payload ->> 'starRating', '');
    v_rooms := coalesce(p_payload ->> 'roomCount', '');
    v_full_name := btrim(coalesce(p_payload ->> 'fullName', ''));
    v_job_title := '';
  elsif v_form = 'inquiry' or v_form = 'inquiry_api' then
    v_form := 'inquiry_api';
    v_lead_type := 'inquiry';
    v_account_name := btrim(coalesce(p_payload ->> 'name', ''));
    v_account_kind := 'company';
    v_industry := '';
    v_star := '';
    v_rooms := '';
    v_full_name := btrim(coalesce(p_payload ->> 'name', ''));
    v_job_title := '';
  else
    v_form := 'contact';
    v_lead_type := 'general';
    v_account_name := btrim(coalesce(p_payload ->> 'company', ''));
    v_account_kind := 'company';
    v_industry := '';
    v_star := '';
    v_rooms := '';
    v_full_name := btrim(coalesce(p_payload ->> 'name', ''));
    v_job_title := btrim(coalesce(p_payload ->> 'role', ''));
  end if;

  -- Account upsert on the normalized name key.
  if v_account_name <> '' then
    insert into public.crm_accounts (name, kind, industry, hotel_star_rating, hotel_room_count_band)
    values (v_account_name, v_account_kind, v_industry, v_star, v_rooms)
    on conflict (name_key) do update
      set kind = case when public.crm_accounts.kind = 'company' then excluded.kind
                      else public.crm_accounts.kind end,
          industry = case when public.crm_accounts.industry = '' then excluded.industry
                          else public.crm_accounts.industry end,
          hotel_star_rating = case when excluded.hotel_star_rating <> '' then excluded.hotel_star_rating
                                   else public.crm_accounts.hotel_star_rating end,
          hotel_room_count_band = case when excluded.hotel_room_count_band <> '' then excluded.hotel_room_count_band
                                       else public.crm_accounts.hotel_room_count_band end,
          updated_at = now()
    returning id into v_account_id;
  end if;

  -- Contact upsert on the normalized email key.
  insert into public.crm_contacts (account_id, full_name, email, job_title)
  values (v_account_id, v_full_name, v_email, v_job_title)
  on conflict (email_key) do update
    set account_id = coalesce(excluded.account_id, public.crm_contacts.account_id),
        full_name = case when excluded.full_name <> '' then excluded.full_name
                         else public.crm_contacts.full_name end,
        job_title = case when excluded.job_title <> '' then excluded.job_title
                         else public.crm_contacts.job_title end,
        updated_at = now()
  returning id into v_contact_id;

  select coalesce(array_agg(x), '{}'::text[])
    into v_interests
    from (
      select btrim(value) as x
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_payload -> 'interests') = 'array'
             then p_payload -> 'interests' else '[]'::jsonb end
      )
    ) t
   where btrim(x) <> '';

  insert into public.crm_leads (
    contact_id, account_id, origin_form, lead_type, source, product_interests,
    product_of_interest, estimated_volume, description, engagement_tier, ga_client_id,
    attribution, engagement, geo, raw, position
  ) values (
    v_contact_id,
    v_account_id,
    v_form,
    v_lead_type,
    left(coalesce(p_payload ->> 'source', ''), 100),
    coalesce(v_interests, '{}'),
    coalesce(p_payload ->> 'product', ''),
    coalesce(p_payload ->> 'quantity', ''),
    coalesce(p_payload ->> 'message', p_payload ->> 'additionalInfo', ''),
    coalesce(p_payload #>> '{_engagement,tier}', ''),
    p_payload #>> '{_analytics,gaClientId}',
    p_payload -> '_attribution',
    p_payload -> '_engagement',
    p_payload -> '_geo',
    p_payload,
    extract(epoch from now())
  )
  returning id into v_lead_id;

  insert into public.crm_lead_activities (lead_id, kind, body, to_status, author_email)
  values (v_lead_id, 'system', 'Submitted via ' || v_form, 'New', 'system');

  return jsonb_build_object(
    'status', 'ok',
    'lead_id', v_lead_id,
    'contact_id', v_contact_id,
    'account_id', v_account_id
  );
end;
$$;

revoke all on function public.ingest_form_submission(text, jsonb) from public;
grant execute on function public.ingest_form_submission(text, jsonb) to anon, authenticated;
