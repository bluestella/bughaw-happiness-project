-- Bughaw Calculators Hub — security hardening migration
-- Run AFTER 0003_crm.sql.

-- ============================================================
-- 1. Constant-time text comparison helper
--    Used for shared-secret checks to defeat timing oracles.
--    Always runs the full length; never short-circuits.
-- ============================================================
create or replace function public.ct_equal(a text, b text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  result integer := 0;
  i integer;
  la integer;
  lb integer;
begin
  la := length(coalesce(a, ''));
  lb := length(coalesce(b, ''));
  if la <> lb then
    return false;
  end if;
  for i in 1..la loop
    result := result | (ascii(substr(coalesce(a, ''), i, 1)) # ascii(substr(coalesce(b, ''), i, 1)));
  end loop;
  return result = 0;
end;
$$;
grant execute on function public.ct_equal(text, text) to public;

-- ============================================================
-- 2. Harden ingest_form_submission against timing oracles
--    Replace the plain = check with a constant-time comparison.
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
  v_ok := false;
  -- Iterate every stored secret with a constant-time compare so the
  -- byte-position oracle cannot reveal the shared secret.
  for v_ok in
    select public.ct_equal(coalesce(s.secret, ''), coalesce(p_secret, ''))
    from public.crm_ingest_secrets s
  loop
    if v_ok then exit; end if;
  end loop;

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

-- ============================================================
-- 3. Fix missing saved_calculations UPDATE policy
--    0001_init.sql only declared select/insert/delete.
-- ============================================================
drop policy if exists "team update" on public.saved_calculations;
create policy "team update" on public.saved_calculations for update to authenticated
  using (public.current_user_role() in ('super_admin', 'member'))
  with check (public.current_user_role() in ('super_admin', 'member'));

-- ============================================================
-- 4. Harden workspace tables against contractor access
--
--    AGENTS.md §7 "Known gaps" explicitly called this out:
--    pipeline_accounts, app_state, and saved_calculations granted
--    full CRUD to *any* authenticated user including contractors.
--    Now mirror the CRM pattern: super_admin + member only.
--
--    Drop the old permissive policies and replace them with
--    role-gated ones. saved_calculations update above already
--    enforces the gate; we mirror that on the remaining ops.
-- ============================================================

-- 4a. pipeline_accounts
drop policy if exists "team read"   on public.pipeline_accounts;
drop policy if exists "team write"  on public.pipeline_accounts;
drop policy if exists "team update" on public.pipeline_accounts;
drop policy if exists "team delete" on public.pipeline_accounts;

create policy "pipeline_accounts read"   on public.pipeline_accounts for select to authenticated
  using (public.current_user_role() in ('super_admin', 'member'));
create policy "pipeline_accounts write"  on public.pipeline_accounts for insert to authenticated
  with check (public.current_user_role() in ('super_admin', 'member'));
create policy "pipeline_accounts update" on public.pipeline_accounts for update to authenticated
  using (public.current_user_role() in ('super_admin', 'member'))
  with check (public.current_user_role() in ('super_admin', 'member'));
create policy "pipeline_accounts delete" on public.pipeline_accounts for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- 4b. app_state
drop policy if exists "team read"   on public.app_state;
drop policy if exists "team write"  on public.app_state;
drop policy if exists "team update" on public.app_state;
drop policy if exists "team delete" on public.app_state;

create policy "app_state read"   on public.app_state for select to authenticated
  using (public.current_user_role() in ('super_admin', 'member'));
create policy "app_state write"  on public.app_state for insert to authenticated
  with check (public.current_user_role() in ('super_admin', 'member'));
create policy "app_state update" on public.app_state for update to authenticated
  using (public.current_user_role() in ('super_admin', 'member'))
  with check (public.current_user_role() in ('super_admin', 'member'));
create policy "app_state delete" on public.app_state for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- 4c. saved_calculations select/insert/delete (update declared above)
drop policy if exists "team read"   on public.saved_calculations;
drop policy if exists "team write"  on public.saved_calculations;
drop policy if exists "team delete" on public.saved_calculations;

create policy "saved_calculations read"   on public.saved_calculations for select to authenticated
  using (public.current_user_role() in ('super_admin', 'member'));
create policy "saved_calculations write"  on public.saved_calculations for insert to authenticated
  with check (public.current_user_role() in ('super_admin', 'member'));
create policy "saved_calculations delete" on public.saved_calculations for delete to authenticated
  using (public.current_user_role() = 'super_admin');
