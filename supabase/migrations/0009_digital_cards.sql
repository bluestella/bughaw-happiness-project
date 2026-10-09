-- Digital business cards — run AFTER 0008_fix_admin_role_checks.sql.
--
-- This migration adds the app's first public (no sign-in) read surface. The
-- design keeps the same posture as the CRM ingest endpoint in 0003:
--
--   * Both tables have RLS enabled. Only super_admin has policies; anon has
--     NONE. No table here is readable or writable with the anon key.
--   * The public page reads through exactly one security-definer function,
--     get_public_card(token), which returns only the published, display-safe
--     columns of one card (phone only when the card opts in).
--   * View/click/save analytics are written through exactly one
--     security-definer function, record_card_event(...), which validates every
--     field against a fixed vocabulary, can only INSERT, and is throttled per
--     card and globally. It returns nothing, so it is not a read oracle.
--   * No IP address, cookie id, or fingerprint is ever stored — counts only
--     (Data Privacy Act posture; see docs/digital-cards.md §5).
--
-- Card URLs are /c/<token> with a random 12-char base62 token (~70 bits), so
-- cards cannot be enumerated by guessing names. Rotating the token kills every
-- printed QR / NFC tag / signature link for that card at once.

-- ============================================================
-- 1. Token generator (no pgcrypto dependency: uses gen_random_uuid bytes,
--    skipping the UUID v4 version/variant bytes so all 12 bytes are random)
-- ============================================================
create or replace function public.generate_card_token()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  raw bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15];
  result text := '';
  i int;
begin
  foreach i in array idx loop
    result := result || substr(alphabet, 1 + (get_byte(raw, i) % 62), 1);
  end loop;
  return result;
end;
$$;
-- Used as a column default, so the inserting role (authenticated) needs EXECUTE.
revoke all on function public.generate_card_token() from public, anon;
grant execute on function public.generate_card_token() to authenticated;

-- ============================================================
-- 2. Cards
-- ============================================================
create table public.business_cards (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default public.generate_card_token()
    check (token ~ '^[A-Za-z0-9]{12}$'),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'suspended')),
  -- Teammate this card belongs to (optional, informational). Lower-cased.
  owner_email text not null default '' check (owner_email = lower(owner_email)),

  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  job_title text not null default '' check (char_length(job_title) <= 120),
  bio text not null default '' check (char_length(bio) <= 150),
  photo_url text not null default ''
    check (photo_url = '' or (photo_url ~ '^https://' and char_length(photo_url) <= 500)),

  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (phone ~ '^[0-9+() -]{0,30}$'),
  show_phone boolean not null default false,
  phone_on_viber boolean not null default false,

  linkedin_url text not null default ''
    check (linkedin_url = '' or (linkedin_url ~ '^https://' and char_length(linkedin_url) <= 500)),
  facebook_url text not null default ''
    check (facebook_url = '' or (facebook_url ~ '^https://' and char_length(facebook_url) <= 500)),
  instagram_url text not null default ''
    check (instagram_url = '' or (instagram_url ~ '^https://' and char_length(instagram_url) <= 500)),
  website_url text not null default ''
    check (website_url = '' or (website_url ~ '^https://' and char_length(website_url) <= 500)),

  company_blurb text not null default '' check (char_length(company_blurb) <= 400),
  cta_label text not null default '' check (char_length(cta_label) <= 40),
  cta_url text not null default ''
    check (cta_url = '' or (cta_url ~ '^https://' and char_length(cta_url) <= 500)),

  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_business_card()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  -- Provenance is DB-owned: a client cannot rewrite who created the card.
  new.created_by_email := old.created_by_email;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger touch_business_card
  before update on public.business_cards
  for each row execute function public.touch_business_card();

alter table public.business_cards enable row level security;

create policy "cards: super_admin select" on public.business_cards
  for select to authenticated using (public.current_user_role() = 'super_admin');
create policy "cards: super_admin insert" on public.business_cards
  for insert to authenticated with check (public.current_user_role() = 'super_admin');
create policy "cards: super_admin update" on public.business_cards
  for update to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "cards: super_admin delete" on public.business_cards
  for delete to authenticated using (public.current_user_role() = 'super_admin');

-- ============================================================
-- 3. Events (append-only analytics; no update/delete policies)
-- ============================================================
create table public.business_card_events (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.business_cards (id) on delete cascade,
  event text not null
    check (event in ('view', 'save_contact', 'click', 'wallet_apple', 'wallet_google')),
  target text
    check (target is null or target in
      ('email', 'phone', 'viber', 'linkedin', 'facebook', 'instagram', 'website', 'cta')),
  source text not null default 'link' check (source in ('link', 'qr', 'nfc', 'email')),
  device text not null default 'unknown' check (device in ('mobile', 'tablet', 'desktop', 'unknown')),
  occurred_at timestamptz not null default now()
);

create index business_card_events_card_time on public.business_card_events (card_id, occurred_at desc);
create index business_card_events_time on public.business_card_events (occurred_at desc);

alter table public.business_card_events enable row level security;

create policy "card events: super_admin select" on public.business_card_events
  for select to authenticated using (public.current_user_role() = 'super_admin');
-- Inserts happen only through record_card_event(); there is deliberately no
-- insert/update/delete policy for any role.

-- ============================================================
-- 4. Public read — the ONLY way anon sees card data
-- ============================================================
create or replace function public.get_public_card(p_token text)
returns table (
  token text,
  full_name text,
  job_title text,
  bio text,
  photo_url text,
  email text,
  phone text,
  phone_on_viber boolean,
  linkedin_url text,
  facebook_url text,
  instagram_url text,
  website_url text,
  company_blurb text,
  cta_label text,
  cta_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.token,
    c.full_name,
    c.job_title,
    c.bio,
    c.photo_url,
    c.email,
    case when c.show_phone then c.phone else '' end,
    c.show_phone and c.phone_on_viber,
    c.linkedin_url,
    c.facebook_url,
    c.instagram_url,
    c.website_url,
    c.company_blurb,
    c.cta_label,
    c.cta_url
  from public.business_cards c
  where p_token ~ '^[A-Za-z0-9]{12}$'
    and c.token = p_token
    and c.status = 'published';
$$;
revoke all on function public.get_public_card(text) from public, anon;
grant execute on function public.get_public_card(text) to anon, authenticated;

-- ============================================================
-- 5. Public write — event logging, insert-only and throttled
-- ============================================================
create or replace function public.record_card_event(
  p_token text,
  p_event text,
  p_target text default null,
  p_source text default 'link',
  p_device text default 'unknown'
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_card_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{12}$' then return; end if;
  if p_event not in ('view', 'save_contact', 'click', 'wallet_apple', 'wallet_google') then return; end if;
  if p_event = 'click' then
    if p_target is null or p_target not in
      ('email', 'phone', 'viber', 'linkedin', 'facebook', 'instagram', 'website', 'cta') then
      return;
    end if;
  else
    p_target := null;
  end if;
  if p_source is null or p_source not in ('link', 'qr', 'nfc', 'email') then p_source := 'link'; end if;
  if p_device is null or p_device not in ('mobile', 'tablet', 'desktop', 'unknown') then p_device := 'unknown'; end if;

  select c.id into v_card_id
  from public.business_cards c
  where c.token = p_token and c.status = 'published';
  if v_card_id is null then return; end if;

  -- Throttle: 60 events/min per card, 600/min across all cards. Excess is
  -- dropped silently so a caller cannot tell a logged event from a dropped one.
  if (select count(*) from public.business_card_events e
      where e.card_id = v_card_id and e.occurred_at > now() - interval '1 minute') >= 60 then
    return;
  end if;
  if (select count(*) from public.business_card_events e
      where e.occurred_at > now() - interval '1 minute') >= 600 then
    return;
  end if;

  insert into public.business_card_events (card_id, event, target, source, device)
  values (v_card_id, p_event, p_target, p_source, p_device);
end;
$$;
revoke all on function public.record_card_event(text, text, text, text, text) from public, anon;
grant execute on function public.record_card_event(text, text, text, text, text) to anon, authenticated;

-- ============================================================
-- 6. Admin helpers (super_admin re-checked inside, like 0007)
-- ============================================================

-- New random token for a card: every previously shared link/QR stops working.
create or replace function public.admin_rotate_card_token(p_card_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can manage business cards.';
  end if;
  v_token := public.generate_card_token();
  update public.business_cards set token = v_token where id = p_card_id;
  if not found then
    raise exception 'Card not found.';
  end if;
  return v_token;
end;
$$;
revoke all on function public.admin_rotate_card_token(uuid) from public, anon;
grant execute on function public.admin_rotate_card_token(uuid) to authenticated;

-- Analytics rollup as ONE jsonb value (sidesteps PostgREST's max-rows cap).
-- Days are bucketed in Asia/Manila time.
create or replace function public.admin_card_event_rollup(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_result jsonb;
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can view card analytics.';
  end if;
  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) into v_result
  from (
    select
      e.card_id,
      to_char((e.occurred_at at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as day,
      e.event,
      e.target,
      e.source,
      e.device,
      count(*)::int as n
    from public.business_card_events e
    where e.occurred_at >= (date_trunc('day', now() at time zone 'Asia/Manila')
                            - make_interval(days => v_days - 1)) at time zone 'Asia/Manila'
    group by 1, 2, 3, 4, 5, 6
  ) r;
  return v_result;
end;
$$;
revoke all on function public.admin_card_event_rollup(int) from public, anon;
grant execute on function public.admin_card_event_rollup(int) to authenticated;
