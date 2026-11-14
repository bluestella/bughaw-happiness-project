-- Production and R&D records: supplier lots, production batches, material tests.
-- Run AFTER 0022. One transaction.
--
-- Owner's choice (Wave 2): record production batches, material tests and supplier lots.
-- Nothing is seeded; the fields are the ones the owner picked, nothing more.
--
-- Access: the `production` section. Members have it by default, contractors do not (an
-- intern is given it per person at /admin/access, like any other page). A super_admin always
-- has it.
--
-- Rules enforced here:
--   * Dates are not in the future (Manila). Quantities and costs are not negative.
--   * A supplier lot is unique per supplier and lot number.
--   * A batch starts 'open' and can be edited. COMPLETING it is a super_admin act: it adds the
--     good pairs (made minus rejected) to on-hand stock in the same statement, writes a
--     'production' stock adjustment, and locks the batch. A completed batch can never change
--     or be deleted; a mistake is fixed with a stock correction.
--   * A material test is editable by the person who recorded it or a super_admin.
--   * Only a super_admin deletes anything here.
--
-- Verify:
--   select key, sort_order from public.app_sections where key = 'production';

begin;

-- ============================================================
-- 1. The section
-- ============================================================
insert into public.app_sections (key, label, group_label, sort_order) values
  ('production', 'Production and R&D (batches, tests, lots)', 'Sections', 16)
on conflict (key) do nothing;

insert into public.role_section_defaults (role, section, allowed) values
  ('member', 'production', true),
  ('contractor', 'production', false)
on conflict (role, section) do nothing;

-- ============================================================
-- 2. Dates may not be in the future (one function, the column is the trigger argument)
-- ============================================================
create or replace function public.production_no_future_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col text := tg_argv[0];
  v_new date := (to_jsonb(new) ->> v_col)::date;
begin
  if tg_op = 'INSERT' or v_new is distinct from (to_jsonb(old) ->> v_col)::date then
    if v_new > (now() at time zone 'Asia/Manila')::date then
      raise exception 'The date cannot be in the future.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.production_no_future_date() from public, anon, authenticated;

-- ============================================================
-- 3. Supplier lots
-- ============================================================
create table public.supplier_lots (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null check (btrim(lot_no) <> '' and char_length(lot_no) <= 60),
  supplier text not null check (btrim(supplier) <> '' and char_length(supplier) <= 120),
  material text not null check (btrim(material) <> '' and char_length(material) <= 120),
  received_on date not null,
  quantity numeric(14,3) not null check (quantity > 0 and quantity < 1000000000),
  unit text not null default 'kg' check (btrim(unit) <> '' and char_length(unit) <= 20),
  total_cost numeric(14,2) not null default 0 check (total_cost >= 0 and total_cost < 1000000000),
  notes text check (btrim(notes) <> '' and char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create unique index supplier_lots_supplier_lot_key
  on public.supplier_lots (lower(btrim(supplier)), lower(btrim(lot_no)));
create index supplier_lots_received_idx on public.supplier_lots (received_on desc);

create trigger supplier_lots_a_date before insert or update on public.supplier_lots
  for each row execute function public.production_no_future_date('received_on');
create trigger supplier_lots_b_audit before insert or update on public.supplier_lots
  for each row execute function public.set_row_audit();

-- ============================================================
-- 4. Production batches
-- ============================================================
create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null check (btrim(batch_no) <> '' and char_length(batch_no) <= 60),
  product_id uuid not null references public.sales_products(id) on delete restrict,
  made_on date not null,
  qty_made integer not null check (qty_made >= 0 and qty_made <= 1000000),
  qty_rejected integer not null default 0 check (qty_rejected >= 0),
  labor_hours numeric(8,2) not null default 0 check (labor_hours >= 0 and labor_hours <= 100000),
  total_cost numeric(14,2) not null default 0 check (total_cost >= 0 and total_cost < 1000000000),
  notes text check (btrim(notes) <> '' and char_length(notes) <= 500),
  status text not null default 'open' check (status in ('open','completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint production_batches_rejected_le_made check (qty_rejected <= qty_made),
  constraint production_batches_completed_check check ((status = 'completed') = (completed_at is not null))
);
create unique index production_batches_batch_no_key on public.production_batches (lower(btrim(batch_no)));
create index production_batches_made_idx on public.production_batches (made_on desc);
create index production_batches_product_idx on public.production_batches (product_id);

create or replace function public.production_batches_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Service-role writes (tests, admin scripts) carry no JWT email and keep their own rules.
  v_me text := lower(nullif(auth.jwt() ->> 'email', ''));
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'open' then
      raise exception 'A batch starts open. Complete it afterwards.' using errcode = 'check_violation';
    end if;
    new.completed_at := null;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Signed-in users never delete a completed batch. Service-role maintenance (no JWT email)
    -- may, which is how the test suites clean up after themselves.
    if old.status = 'completed' and v_me is not null then
      raise exception 'A completed batch cannot be deleted. Correct the stock instead.' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'completed' then
    raise exception 'A completed batch is locked. Correct the stock instead.' using errcode = 'check_violation';
  end if;
  if new.status = 'completed' then
    if v_me is not null and public.current_user_role() is distinct from 'super_admin' then
      raise exception 'Only a super_admin can complete a batch.' using errcode = 'insufficient_privilege';
    end if;
    new.completed_at := now();
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.production_batches_guard() from public, anon, authenticated;

-- Completing adds the good pairs to on-hand stock, in the same statement, and says so in the
-- stock history. Runs as the function owner so no client needs write access to stock.
create or replace function public.production_batches_apply_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_good integer := new.qty_made - new.qty_rejected;
begin
  if old.status = 'open' and new.status = 'completed' and v_good > 0 then
    perform 1 from public.stock_levels where product_id = new.product_id for update;
    update public.stock_levels
       set on_hand = on_hand + v_good, updated_at = now()
     where product_id = new.product_id;
    insert into public.stock_adjustments (product_id, delta, reason, note)
    values (new.product_id, v_good, 'production', 'Batch ' || new.batch_no);
  end if;
  return new;
end;
$$;
revoke all on function public.production_batches_apply_stock() from public, anon, authenticated;

create trigger production_batches_a_date before insert or update on public.production_batches
  for each row execute function public.production_no_future_date('made_on');
create trigger production_batches_b_guard before insert or update or delete on public.production_batches
  for each row execute function public.production_batches_guard();
create trigger production_batches_c_audit before insert or update on public.production_batches
  for each row execute function public.set_row_audit();
create trigger production_batches_d_stock before update on public.production_batches
  for each row execute function public.production_batches_apply_stock();

-- ============================================================
-- 5. Material tests
-- ============================================================
create table public.material_tests (
  id uuid primary key default gen_random_uuid(),
  tested_on date not null,
  material text not null check (btrim(material) <> '' and char_length(material) <= 120),
  test_name text not null check (btrim(test_name) <> '' and char_length(test_name) <= 120),
  method text check (btrim(method) <> '' and char_length(method) <= 500),
  result text not null check (btrim(result) <> '' and char_length(result) <= 300),
  outcome text not null check (outcome in ('pass','fail','inconclusive')),
  batch_id uuid references public.production_batches(id) on delete set null,
  lot_id uuid references public.supplier_lots(id) on delete set null,
  notes text check (btrim(notes) <> '' and char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create index material_tests_tested_idx on public.material_tests (tested_on desc);
create index material_tests_batch_idx on public.material_tests (batch_id);
create index material_tests_lot_idx on public.material_tests (lot_id);

create trigger material_tests_a_date before insert or update on public.material_tests
  for each row execute function public.production_no_future_date('tested_on');
create trigger material_tests_b_audit before insert or update on public.material_tests
  for each row execute function public.set_row_audit();

-- ============================================================
-- 6. Audit (free-text notes left out)
-- ============================================================
create trigger zz_audit after insert or update or delete on public.supplier_lots
  for each row execute function public.audit_row_change('notes');
create trigger zz_audit after insert or update or delete on public.production_batches
  for each row execute function public.audit_row_change('notes');
create trigger zz_audit after insert or update or delete on public.material_tests
  for each row execute function public.audit_row_change('notes','method');

-- ============================================================
-- 7. RLS and grants
-- ============================================================
alter table public.supplier_lots enable row level security;
alter table public.production_batches enable row level security;
alter table public.material_tests enable row level security;

create policy "supplier_lots select" on public.supplier_lots for select to authenticated
  using ((select public.has_section('production')));
create policy "supplier_lots insert" on public.supplier_lots for insert to authenticated
  with check ((select public.has_section('production')));
create policy "supplier_lots update" on public.supplier_lots for update to authenticated
  using ((select public.has_section('production')))
  with check ((select public.has_section('production')));
create policy "supplier_lots delete" on public.supplier_lots for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

create policy "production_batches select" on public.production_batches for select to authenticated
  using ((select public.has_section('production')));
create policy "production_batches insert" on public.production_batches for insert to authenticated
  with check ((select public.has_section('production')));
create policy "production_batches update" on public.production_batches for update to authenticated
  using ((select public.has_section('production')))
  with check ((select public.has_section('production')));
create policy "production_batches delete" on public.production_batches for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

create policy "material_tests select" on public.material_tests for select to authenticated
  using ((select public.has_section('production')));
create policy "material_tests insert" on public.material_tests for insert to authenticated
  with check ((select public.has_section('production')));
-- The person who recorded a test, or a super_admin, may correct it.
create policy "material_tests update" on public.material_tests for update to authenticated
  using ((select public.has_section('production'))
         and ((select public.current_user_role()) = 'super_admin'
              or lower(created_by_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))))
  with check ((select public.has_section('production')));
create policy "material_tests delete" on public.material_tests for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

grant select, insert, update, delete on public.supplier_lots, public.production_batches, public.material_tests to authenticated;

commit;
