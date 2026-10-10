-- Per-card QR style — run AFTER 0009_digital_cards.sql.
--
-- The super_admin designs each card's QR in /admin/cards (theme, rounded
-- modules, centre logo, sun ring, logo size); the public card renders the same
-- style read-only. Only the LOOK is stored — the QR content is always the
-- card link and is never stored.
--
-- Mirrors normalizeQrStyle() in src/lib/qrStyle.ts.

alter table public.business_cards
  add column qr_style jsonb not null
    default '{"theme":"dawn","rounded":true,"logo":true,"sunRing":true,"logoSize":20}'::jsonb;

alter table public.business_cards
  add constraint business_cards_qr_style_check check (
    jsonb_typeof(qr_style) = 'object'
    -- No keys beyond the five known ones.
    and (qr_style - array['theme', 'rounded', 'logo', 'sunRing', 'logoSize']) = '{}'::jsonb
    and coalesce(qr_style ->> 'theme', 'dawn') in ('dawn', 'ocean', 'grove', 'ink')
    and coalesce(jsonb_typeof(qr_style -> 'rounded'), 'boolean') = 'boolean'
    and coalesce(jsonb_typeof(qr_style -> 'logo'), 'boolean') = 'boolean'
    and coalesce(jsonb_typeof(qr_style -> 'sunRing'), 'boolean') = 'boolean'
    and case
      when qr_style -> 'logoSize' is null then true
      when jsonb_typeof(qr_style -> 'logoSize') = 'number'
        then (qr_style ->> 'logoSize')::numeric between 12 and 28
      else false
    end
  );

-- get_public_card gains a column; a changed return type needs drop + create.
drop function public.get_public_card(text);

create function public.get_public_card(p_token text)
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
  cta_url text,
  qr_style jsonb
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
    c.cta_url,
    c.qr_style
  from public.business_cards c
  where p_token ~ '^[A-Za-z0-9]{12}$'
    and c.token = p_token
    and c.status = 'published';
$$;
revoke all on function public.get_public_card(text) from public, anon;
grant execute on function public.get_public_card(text) to anon, authenticated;
