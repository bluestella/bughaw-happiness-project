-- Sales, part 1: the `sales` section, products, price tiers and stock
-- (docs/specs/sales-quotes-orders-stock.md, docs/standards/database.md).
-- Run AFTER 0014. One transaction. No data is seeded: products, prices and
-- opening stock are entered in the app by a super_admin.
--
-- Access
--   sales_products, sales_price_tiers   read: has_section('sales')   write: super_admin
--   stock_levels, stock_adjustments     read: has_section('sales')   write: NOBODY directly.
--     Stock changes only through stock_adjust() (super_admin) and the order
--     triggers in 0017, so a level and its history can never disagree.
--
-- Verify:
--   select key, sort_order from public.app_sections where key = 'sales';
--   select role, allowed from public.role_section_defaults where section = 'sales';

begin;

-- ============================================================
-- 1. The section
-- ============================================================
insert into public.app_sections (key, label, group_label, sort_order) values
  ('sales', 'Sales (quotes, orders, stock)', 'Sections', 15)
on conflict (key) do nothing;

-- Same as the other sections: members yes, contractors no. Per-person overrides
-- at /admin/access still apply.
insert into public.role_section_defaults (role, section, allowed) values
  ('member', 'sales', true),
  ('contractor', 'sales', false)
on conflict (role, section) do nothing;

-- ============================================================
-- 2. Shared row bookkeeping (used by every new table from here on)
-- ============================================================
-- created_by_email is set from the session and cannot be changed afterwards, so a
-- client can never write someone else's email into the audit column. Service-role
-- inserts (tests, admin scripts) carry no JWT email and keep what they supplied.
create or replace function public.set_row_audit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
begin
  if tg_op = 'INSERT' then
    if v_email is not null then
      new.created_by_email := v_email;
    end if;
  else
    new.created_by_email := old.created_by_email;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_row_audit() from public, anon, authenticated;

-- ============================================================
-- 3. Products and price tiers
-- ============================================================
create table public.sales_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  unit text not null default 'pair',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint sales_products_sku_not_blank check (btrim(sku) <> ''),
  constraint sales_products_name_not_blank check (btrim(name) <> ''),
  constraint sales_products_unit_not_blank check (btrim(unit) <> ''),
  constraint sales_products_description_not_blank check (btrim(description) <> '')
);
create unique index sales_products_sku_key on public.sales_products (lower(btrim(sku)));

create trigger sales_products_audit
  before insert or update on public.sales_products
  for each row execute function public.set_row_audit();

create table public.sales_price_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.sales_products(id) on delete cascade,
  min_qty integer not null check (min_qty >= 1),
  unit_price numeric(14,2) not null check (unit_price > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint sales_price_tiers_product_min_key unique (product_id, min_qty)
);

create trigger sales_price_tiers_audit
  before insert or update on public.sales_price_tiers
  for each row execute function public.set_row_audit();

-- ============================================================
-- 4. Stock
-- ============================================================
create table public.stock_levels (
  product_id uuid primary key references public.sales_products(id) on delete cascade,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now()
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.sales_products(id) on delete restrict,
  delta integer not null check (delta <> 0),
  reason text not null
    check (reason in ('opening_count','production','delivery','damage','correction')),
  note text check (btrim(note) <> ''),
  -- The order a 'delivery' adjustment belongs to. The foreign key is added in 0017,
  -- when sales_orders exists.
  sales_order_id uuid,
  created_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create index stock_adjustments_product_id_idx on public.stock_adjustments (product_id, created_at desc);
create index stock_adjustments_sales_order_id_idx on public.stock_adjustments (sales_order_id);

-- Every product has a stock row from the moment it exists, so nothing downstream
-- has to handle "no row".
create or replace function public.sales_products_create_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.stock_levels (product_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.sales_products_create_stock() from public, anon, authenticated;

create trigger sales_products_stock
  after insert on public.sales_products
  for each row execute function public.sales_products_create_stock();

-- The only way a super_admin changes on-hand stock by hand. 'delivery' is reserved
-- for the order triggers.
create or replace function public.stock_adjust(
  p_product_id uuid,
  p_delta integer,
  p_reason text,
  p_note text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_on_hand integer;
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can adjust stock.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason not in ('opening_count','production','damage','correction') then
    raise exception 'Reason must be opening_count, production, damage or correction.'
      using errcode = 'check_violation';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'The adjustment cannot be zero.' using errcode = 'check_violation';
  end if;

  select on_hand into v_on_hand from public.stock_levels where product_id = p_product_id for update;
  if not found then
    raise exception 'Unknown product.' using errcode = 'foreign_key_violation';
  end if;
  if v_on_hand + p_delta < 0 then
    raise exception 'That would take on-hand stock below zero (on hand: %).', v_on_hand
      using errcode = 'check_violation';
  end if;

  update public.stock_levels
     set on_hand = on_hand + p_delta, updated_at = now()
   where product_id = p_product_id;

  insert into public.stock_adjustments (product_id, delta, reason, note)
  values (p_product_id, p_delta, p_reason, nullif(btrim(p_note), ''));
end;
$$;
revoke all on function public.stock_adjust(uuid, integer, text, text) from public, anon;
grant execute on function public.stock_adjust(uuid, integer, text, text) to authenticated;

-- ============================================================
-- 5. RLS and grants
-- ============================================================
alter table public.sales_products enable row level security;
alter table public.sales_price_tiers enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_adjustments enable row level security;

create policy "sales_products select" on public.sales_products for select to authenticated
  using ((select public.has_section('sales')));
create policy "sales_products insert" on public.sales_products for insert to authenticated
  with check ((select public.current_user_role()) = 'super_admin');
create policy "sales_products update" on public.sales_products for update to authenticated
  using ((select public.current_user_role()) = 'super_admin')
  with check ((select public.current_user_role()) = 'super_admin');

create policy "sales_price_tiers select" on public.sales_price_tiers for select to authenticated
  using ((select public.has_section('sales')));
create policy "sales_price_tiers insert" on public.sales_price_tiers for insert to authenticated
  with check ((select public.current_user_role()) = 'super_admin');
create policy "sales_price_tiers update" on public.sales_price_tiers for update to authenticated
  using ((select public.current_user_role()) = 'super_admin')
  with check ((select public.current_user_role()) = 'super_admin');
create policy "sales_price_tiers delete" on public.sales_price_tiers for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

create policy "stock_levels select" on public.stock_levels for select to authenticated
  using ((select public.has_section('sales')));
create policy "stock_adjustments select" on public.stock_adjustments for select to authenticated
  using ((select public.has_section('sales')));

grant select, insert, update on public.sales_products to authenticated;
grant select, insert, update, delete on public.sales_price_tiers to authenticated;
grant select on public.stock_levels, public.stock_adjustments to authenticated;

commit;
