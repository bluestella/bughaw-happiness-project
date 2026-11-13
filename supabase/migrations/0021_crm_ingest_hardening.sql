-- Harden the CRM ingest (docs/security.md §9; OWASP Top 10:2025 A02, A04, A07).
-- Run AFTER 0020. One transaction.
--
-- 1. The ingest secret was stored in plaintext in crm_ingest_secrets. It is now stored only as
--    a SHA-256 hash (hex). Existing secrets are hashed in place, so the marketing site's
--    secret keeps working: NO rotation and NO change on the site. The plaintext column is
--    dropped. The secret is random and long, which is what makes an unsalted fast hash fine.
-- 2. ingest_form_submission() is the only function granted to anon. It now counts calls per
--    secret per minute (crm_ingest_secrets.max_per_minute, default 60) and refuses the rest
--    with errcode 54000, which the API route turns into HTTP 429.
--
-- To add or rotate a secret afterwards (SQL editor, service role):
--   insert into public.crm_ingest_secrets (name, secret_hash)
--   values ('bughawinnovations.ph', encode(sha256(convert_to('<new secret>', 'utf8')), 'hex'))
--   on conflict (name) do update set secret_hash = excluded.secret_hash;
--
-- Verify:
--   select name, max_per_minute, left(secret_hash, 8) from public.crm_ingest_secrets;
--   select column_name from information_schema.columns
--    where table_name = 'crm_ingest_secrets';  -- no 'secret'

begin;

-- ============================================================
-- 1. Hash the stored secrets
-- ============================================================
alter table public.crm_ingest_secrets add column secret_hash text;
alter table public.crm_ingest_secrets
  add column max_per_minute integer not null default 60 check (max_per_minute >= 1);

update public.crm_ingest_secrets
   set secret_hash = encode(sha256(convert_to(secret, 'utf8')), 'hex')
 where secret is not null;

alter table public.crm_ingest_secrets alter column secret_hash set not null;
alter table public.crm_ingest_secrets add constraint crm_ingest_secrets_hash_format
  check (secret_hash ~ '^[0-9a-f]{64}$');
alter table public.crm_ingest_secrets drop column secret;

-- ============================================================
-- 2. Rate counter (service role only: RLS on, no policies)
-- ============================================================
create table public.crm_ingest_rate (
  name text not null references public.crm_ingest_secrets(name) on update cascade on delete cascade,
  window_start timestamptz not null,
  n integer not null default 0,
  primary key (name, window_start)
);
alter table public.crm_ingest_rate enable row level security;

-- ============================================================
-- 3. ingest_form_submission: same as 0013, with the hashed secret and the rate limit
-- ============================================================
create or replace function public.ingest_form_submission(p_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_name text;
  v_limit integer;
  v_count integer;
  v_window timestamptz := date_trunc('minute', now());
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
  -- The secret is stored only as a SHA-256 hash. Hash what the caller sent and compare the
  -- hashes in constant time against every stored row.
  if p_secret is null or p_secret = '' then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select s.name, s.max_per_minute
    into v_secret_name, v_limit
    from public.crm_ingest_secrets s
   where public.ct_equal(s.secret_hash, encode(sha256(convert_to(p_secret, 'utf8')), 'hex'))
   limit 1;

  if v_secret_name is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- Per-secret rate limit, counted per minute. A leaked secret or a runaway site cannot
  -- flood the CRM. Everything this call would write is rolled back when it is refused.
  insert into public.crm_ingest_rate (name, window_start, n)
  values (v_secret_name, v_window, 1)
  on conflict (name, window_start) do update set n = public.crm_ingest_rate.n + 1
  returning n into v_count;

  if v_count > v_limit then
    raise exception 'rate limit exceeded' using errcode = '54000';
  end if;
  if v_count = 1 then
    delete from public.crm_ingest_rate where window_start < now() - interval '1 hour';
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
