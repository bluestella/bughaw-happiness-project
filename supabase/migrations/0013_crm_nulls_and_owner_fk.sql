-- CRM cleanup: one representation for "absent", and a validated lead owner.
-- Run AFTER 0012. Safe to run once; it rewrites existing rows.
--
-- 1. Optional text columns used '' for "no value" (and ga_client_id already used
--    NULL), so every reader had to know which convention each column followed.
--    They are now nullable with NULL = absent, and a CHECK keeps '' / whitespace
--    out so the two representations cannot creep back in.
--      crm_accounts: industry, hotel_star_rating, hotel_room_count_band
--      crm_contacts: full_name, job_title
--      crm_leads:    source, product_of_interest, estimated_volume, description,
--                    engagement_tier
--    Required columns (name, email, kind, status ...) are untouched.
--
-- 2. crm_leads.owner_email was free text. It now references allowed_emails(email),
--    the same invite list that defines who can sign in, so an owner is always a
--    real person. Renaming an allowlist email follows (ON UPDATE CASCADE);
--    removing one clears the owner (ON DELETE SET NULL) instead of blocking it.
--    No UI reads or writes owner_email yet. If a stray value exists that is not on
--    the allowlist, step 2 fails naming it — fix or clear that row and re-run.
--
-- 3. ingest_form_submission() is replaced to write NULLs. Its signature, auth
--    (constant-time secret check), honeypot and merge rules are exactly 0005's.

-- One transaction: if any step fails nothing is applied, so fixing the data and
-- re-running is always safe.
begin;

-- ============================================================
-- 1. '' -> NULL
-- ============================================================
alter table public.crm_accounts
  alter column industry drop not null,
  alter column industry drop default,
  alter column hotel_star_rating drop not null,
  alter column hotel_star_rating drop default,
  alter column hotel_room_count_band drop not null,
  alter column hotel_room_count_band drop default;

alter table public.crm_contacts
  alter column full_name drop not null,
  alter column full_name drop default,
  alter column job_title drop not null,
  alter column job_title drop default;

alter table public.crm_leads
  alter column source drop not null,
  alter column source drop default,
  alter column product_of_interest drop not null,
  alter column product_of_interest drop default,
  alter column estimated_volume drop not null,
  alter column estimated_volume drop default,
  alter column description drop not null,
  alter column description drop default,
  alter column engagement_tier drop not null,
  alter column engagement_tier drop default;

update public.crm_accounts set
  industry = nullif(btrim(industry), ''),
  hotel_star_rating = nullif(btrim(hotel_star_rating), ''),
  hotel_room_count_band = nullif(btrim(hotel_room_count_band), '');

update public.crm_contacts set
  full_name = nullif(btrim(full_name), ''),
  job_title = nullif(btrim(job_title), '');

update public.crm_leads set
  source = nullif(btrim(source), ''),
  product_of_interest = nullif(btrim(product_of_interest), ''),
  estimated_volume = nullif(btrim(estimated_volume), ''),
  description = nullif(btrim(description), ''),
  engagement_tier = nullif(btrim(engagement_tier), '');

-- The picklist checks allowed '' as a member; NULL already passes a CHECK, so
-- '' can simply be dropped from the lists.
alter table public.crm_accounts
  drop constraint crm_accounts_hotel_star_rating_check,
  drop constraint crm_accounts_hotel_room_count_band_check;
alter table public.crm_accounts
  add constraint crm_accounts_hotel_star_rating_check
    check (hotel_star_rating in ('3-Star','4-Star','5-Star','Unrated')),
  add constraint crm_accounts_hotel_room_count_band_check
    check (hotel_room_count_band in ('<50','50–100','101–200','200+')),
  add constraint crm_accounts_industry_not_blank
    check (industry is null or btrim(industry) <> '');

alter table public.crm_contacts
  add constraint crm_contacts_full_name_not_blank
    check (full_name is null or btrim(full_name) <> ''),
  add constraint crm_contacts_job_title_not_blank
    check (job_title is null or btrim(job_title) <> '');

alter table public.crm_leads
  add constraint crm_leads_source_not_blank
    check (source is null or btrim(source) <> ''),
  add constraint crm_leads_product_of_interest_not_blank
    check (product_of_interest is null or btrim(product_of_interest) <> ''),
  add constraint crm_leads_estimated_volume_not_blank
    check (estimated_volume is null or btrim(estimated_volume) <> ''),
  add constraint crm_leads_description_not_blank
    check (description is null or btrim(description) <> ''),
  add constraint crm_leads_engagement_tier_not_blank
    check (engagement_tier is null or btrim(engagement_tier) <> '');

-- ============================================================
-- 2. Validated lead owner
-- ============================================================
update public.crm_leads
   set owner_email = nullif(lower(btrim(owner_email)), '')
 where owner_email is not null;

alter table public.crm_leads
  add constraint crm_leads_owner_email_fkey
  foreign key (owner_email) references public.allowed_emails(email)
  on update cascade on delete set null;

-- ============================================================
-- 3. ingest_form_submission — same as 0005, writing NULL for absent values
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
    v_star := nullif(btrim(coalesce(p_payload ->> 'starRating', '')), '');
    v_rooms := nullif(btrim(coalesce(p_payload ->> 'roomCount', '')), '');
    v_full_name := nullif(btrim(coalesce(p_payload ->> 'fullName', '')), '');
    v_job_title := null;
  elsif v_form = 'inquiry' or v_form = 'inquiry_api' then
    v_form := 'inquiry_api';
    v_lead_type := 'inquiry';
    v_account_name := btrim(coalesce(p_payload ->> 'name', ''));
    v_account_kind := 'company';
    v_industry := null;
    v_star := null;
    v_rooms := null;
    v_full_name := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
    v_job_title := null;
  else
    v_form := 'contact';
    v_lead_type := 'general';
    v_account_name := btrim(coalesce(p_payload ->> 'company', ''));
    v_account_kind := 'company';
    v_industry := null;
    v_star := null;
    v_rooms := null;
    v_full_name := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
    v_job_title := nullif(btrim(coalesce(p_payload ->> 'role', '')), '');
  end if;

  -- Account upsert on the normalized name key. Existing values are kept unless
  -- the column was empty; star/room-count take the newer non-empty value.
  if v_account_name <> '' then
    insert into public.crm_accounts (name, kind, industry, hotel_star_rating, hotel_room_count_band)
    values (v_account_name, v_account_kind, v_industry, v_star, v_rooms)
    on conflict (name_key) do update
      set kind = case when public.crm_accounts.kind = 'company' then excluded.kind
                      else public.crm_accounts.kind end,
          industry = coalesce(public.crm_accounts.industry, excluded.industry),
          hotel_star_rating = coalesce(excluded.hotel_star_rating, public.crm_accounts.hotel_star_rating),
          hotel_room_count_band = coalesce(excluded.hotel_room_count_band, public.crm_accounts.hotel_room_count_band),
          updated_at = now()
    returning id into v_account_id;
  end if;

  -- Contact upsert on the normalized email key.
  insert into public.crm_contacts (account_id, full_name, email, job_title)
  values (v_account_id, v_full_name, v_email, v_job_title)
  on conflict (email_key) do update
    set account_id = coalesce(excluded.account_id, public.crm_contacts.account_id),
        full_name = coalesce(excluded.full_name, public.crm_contacts.full_name),
        job_title = coalesce(excluded.job_title, public.crm_contacts.job_title),
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
    nullif(left(btrim(coalesce(p_payload ->> 'source', '')), 100), ''),
    coalesce(v_interests, '{}'),
    nullif(btrim(coalesce(p_payload ->> 'product', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'quantity', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'message', p_payload ->> 'additionalInfo', '')), ''),
    nullif(btrim(coalesce(p_payload #>> '{_engagement,tier}', '')), ''),
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

commit;
