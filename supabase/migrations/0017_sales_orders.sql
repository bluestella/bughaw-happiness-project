-- Sales, part 3: sales orders and their effect on stock
-- (docs/specs/sales-quotes-orders-stock.md). Run AFTER 0016. One transaction.
--
-- Internal documents, NOT official invoices or receipts. The official invoice comes
-- from the BIR-authorised booklet; its number and date are recorded here by hand
-- (docs/standards/decisions/0001-official-invoicing-deferred.md).
--
-- Status flow:
--   draft     -> confirmed | cancelled
--   confirmed -> delivered | cancelled
--   delivered -> paid
--   paid and cancelled are final.
--
-- Stock follows the status, inside the same transaction (triggers, not the app):
--   draft -> confirmed      reserves the ordered quantities. An order beyond the free
--                           stock is refused, unless a super_admin gives a reason.
--   confirmed -> cancelled  releases the reservation.
--   confirmed -> delivered  takes the quantities out of on-hand and reserved, and
--                           writes a 'delivery' row in stock_adjustments.
-- Cancelling is super_admin only. Orders are never deleted.
--
-- Verify:
--   select number, status from public.sales_orders order by created_at;

begin;

-- ============================================================
-- 1. Orders
-- ============================================================
create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  quotation_id uuid references public.sales_quotations(id) on delete restrict,
  account_id uuid not null references public.crm_accounts(id) on delete restrict,
  account_name_snapshot text not null default '',
  status text not null default 'draft'
    check (status in ('draft','confirmed','delivered','paid','cancelled')),
  customer_po_no text check (btrim(customer_po_no) <> ''),
  delivery_due_on date,
  delivered_on date,
  -- The OFFICIAL invoice, issued from the BIR-authorised booklet and typed in here.
  official_invoice_no text check (btrim(official_invoice_no) <> ''),
  official_invoice_date date,
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  paid_on date,
  tax_note text check (btrim(tax_note) <> ''),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  notes text check (btrim(notes) <> ''),
  -- A super_admin's reason for confirming an order that exceeds free stock.
  oversell_override_reason text check (btrim(oversell_override_reason) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create index sales_orders_account_id_idx on public.sales_orders (account_id);
create index sales_orders_quotation_id_idx on public.sales_orders (quotation_id);
create index sales_orders_status_idx on public.sales_orders (status, created_at desc);
-- One live order per quotation: pressing "create order" twice cannot make two.
create unique index sales_orders_one_live_per_quotation
  on public.sales_orders (quotation_id)
  where quotation_id is not null and status <> 'cancelled';

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid not null references public.sales_products(id) on delete restrict,
  product_name_snapshot text not null default '',
  qty integer not null check (qty >= 1),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index sales_order_lines_order_id_idx on public.sales_order_lines (order_id, position);
create index sales_order_lines_product_id_idx on public.sales_order_lines (product_id);

-- Now that orders exist, tie delivery adjustments to them.
alter table public.stock_adjustments
  add constraint stock_adjustments_sales_order_id_fkey
  foreign key (sales_order_id) references public.sales_orders(id) on delete set null;

-- ============================================================
-- 2. Triggers on orders
-- ============================================================
-- 2a. New order: number, state, customer and amounts come from the database. An
--     order made from a quotation takes its customer and discount from it, and the
--     quotation must be accepted.
create or replace function public.sales_orders_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_q public.sales_quotations;
begin
  if new.quotation_id is not null then
    select * into v_q from public.sales_quotations where id = new.quotation_id;
    if not found then
      raise exception 'The quotation does not exist.' using errcode = 'foreign_key_violation';
    end if;
    if v_q.status <> 'accepted' then
      raise exception 'Only an accepted quotation can become an order (this one is %).', v_q.status
        using errcode = 'check_violation';
    end if;
    new.account_id := v_q.account_id;
    new.discount_amount := v_q.discount_amount;
    new.tax_note := v_q.tax_note;
  end if;

  new.number := public.sales_next_number('order');
  new.status := 'draft';
  new.subtotal := 0;
  new.total := 0;
  new.delivered_on := null;
  new.official_invoice_no := null;
  new.official_invoice_date := null;
  new.amount_paid := 0;
  new.paid_on := null;
  if public.current_user_role() is distinct from 'super_admin' then
    new.oversell_override_reason := null;
  end if;
  select name into new.account_name_snapshot from public.crm_accounts where id = new.account_id;
  return new;
end;
$$;
revoke all on function public.sales_orders_before_insert() from public, anon, authenticated;

create trigger sales_orders_a_insert
  before insert on public.sales_orders
  for each row execute function public.sales_orders_before_insert();
create trigger sales_orders_b_audit
  before insert or update on public.sales_orders
  for each row execute function public.set_row_audit();

-- 2b. Updates: lock what must not change, allow only legal transitions.
create or replace function public.sales_orders_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lines integer;
begin
  if (new.id, new.number, new.quotation_id, new.account_id, new.account_name_snapshot)
     is distinct from
     (old.id, old.number, old.quotation_id, old.account_id, old.account_name_snapshot) then
    raise exception 'An order''s number, quotation and customer cannot be changed.'
      using errcode = 'check_violation';
  end if;

  -- Paid and cancelled are final.
  if old.status in ('paid','cancelled')
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'A % order cannot be changed.', old.status using errcode = 'check_violation';
  end if;

  -- Only a super_admin sets or changes the override reason, and only on a draft.
  if public.current_user_role() is distinct from 'super_admin' or old.status <> 'draft' then
    new.oversell_override_reason := old.oversell_override_reason;
  end if;

  if old.status <> 'draft' then
    if (new.discount_amount, new.subtotal, new.total, new.tax_note)
       is distinct from (old.discount_amount, old.subtotal, old.total, old.tax_note) then
      raise exception 'A confirmed order''s amounts cannot be edited.' using errcode = 'check_violation';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'     and new.status in ('confirmed','cancelled')) or
      (old.status = 'confirmed' and new.status in ('delivered','cancelled')) or
      (old.status = 'delivered' and new.status = 'paid')
    ) then
      raise exception 'An order cannot go from % to %.', old.status, new.status
        using errcode = 'check_violation';
    end if;

    if new.status = 'cancelled' and public.current_user_role() is distinct from 'super_admin' then
      raise exception 'Only a super_admin can cancel an order.' using errcode = 'insufficient_privilege';
    end if;

    if new.status = 'confirmed' then
      select count(*) into v_lines from public.sales_order_lines where order_id = new.id;
      if v_lines = 0 then
        raise exception 'Add at least one line before confirming the order.' using errcode = 'check_violation';
      end if;
    elsif new.status = 'delivered' then
      new.delivered_on := coalesce(new.delivered_on, (now() at time zone 'Asia/Manila')::date);
      if new.delivered_on > (now() at time zone 'Asia/Manila')::date then
        raise exception 'The delivery date cannot be in the future.' using errcode = 'check_violation';
      end if;
    elsif new.status = 'paid' then
      if new.official_invoice_no is null then
        raise exception 'Record the official invoice number before marking the order paid.'
          using errcode = 'check_violation';
      end if;
      if new.paid_on is null or new.amount_paid < new.total then
        raise exception 'Record the payment date and an amount of at least the order total.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- Delivery and payment details only exist once the order is confirmed.
  if new.status = 'draft' then
    new.delivered_on := null;
    new.official_invoice_no := null;
    new.official_invoice_date := null;
    new.amount_paid := 0;
    new.paid_on := null;
  end if;

  -- Totals are recomputed from the lines until the order is confirmed.
  if old.status = 'draft' then
    select coalesce(sum(line_total), 0) into new.subtotal
      from public.sales_order_lines where order_id = new.id;
    new.total := greatest(0, new.subtotal - new.discount_amount);
  end if;
  return new;
end;
$$;
revoke all on function public.sales_orders_before_update() from public, anon, authenticated;

create trigger sales_orders_c_update
  before update on public.sales_orders
  for each row execute function public.sales_orders_before_update();

-- 2c. Stock follows the status. security definer: stock tables have no client
--     write policies, so this is the only path that changes them for orders.
create or replace function public.sales_orders_apply_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_on_hand integer;
  v_reserved integer;
  v_name text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Lock stock rows in a fixed order so two orders cannot deadlock.
  for r in
    select l.product_id, sum(l.qty)::integer as qty
      from public.sales_order_lines l
     where l.order_id = new.id
     group by l.product_id
     order by l.product_id
  loop
    select on_hand, reserved into v_on_hand, v_reserved
      from public.stock_levels where product_id = r.product_id for update;
    select name into v_name from public.sales_products where id = r.product_id;

    if old.status = 'draft' and new.status = 'confirmed' then
      if r.qty > v_on_hand - v_reserved then
        if public.current_user_role() = 'super_admin' and new.oversell_override_reason is not null then
          null; -- allowed: the reason is on the order
        else
          raise exception 'Not enough free stock for %: need %, free %.',
            v_name, r.qty, greatest(0, v_on_hand - v_reserved)
            using errcode = 'check_violation';
        end if;
      end if;
      update public.stock_levels
         set reserved = reserved + r.qty, updated_at = now()
       where product_id = r.product_id;

    elsif old.status = 'confirmed' and new.status = 'cancelled' then
      update public.stock_levels
         set reserved = greatest(0, reserved - r.qty), updated_at = now()
       where product_id = r.product_id;

    elsif old.status = 'confirmed' and new.status = 'delivered' then
      if r.qty > v_on_hand then
        raise exception 'Not enough stock on hand to deliver %: need %, on hand %.',
          v_name, r.qty, v_on_hand using errcode = 'check_violation';
      end if;
      update public.stock_levels
         set on_hand = on_hand - r.qty,
             reserved = greatest(0, reserved - r.qty),
             updated_at = now()
       where product_id = r.product_id;
      insert into public.stock_adjustments (product_id, delta, reason, sales_order_id)
      values (r.product_id, -r.qty, 'delivery', new.id);
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.sales_orders_apply_stock() from public, anon, authenticated;

create trigger sales_orders_d_stock
  before update on public.sales_orders
  for each row execute function public.sales_orders_apply_stock();

-- ============================================================
-- 3. Triggers on order lines
-- ============================================================
create or replace function public.sales_order_lines_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_status text;
begin
  -- Deleting the document itself (an administrator, never a client: there is no
  -- delete policy) removes its lines. That runs as a nested trigger, unlike a direct
  -- delete of a line.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select status into v_status from public.sales_orders where id = v_order;
  if v_status is distinct from 'draft' then
    raise exception 'Lines can only be changed while the order is a draft.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'A line cannot move to another order.' using errcode = 'check_violation';
  end if;
  select name into new.product_name_snapshot from public.sales_products where id = new.product_id;
  new.line_total := round(new.qty * new.unit_price, 2);
  return new;
end;
$$;
revoke all on function public.sales_order_lines_guard() from public, anon, authenticated;

create trigger sales_order_lines_a_guard
  before insert or update or delete on public.sales_order_lines
  for each row execute function public.sales_order_lines_guard();

create or replace function public.sales_order_lines_touch_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.sales_orders set updated_at = now()
   where id = coalesce(new.order_id, old.order_id);
  return null;
end;
$$;
revoke all on function public.sales_order_lines_touch_parent() from public, anon, authenticated;

create trigger sales_order_lines_b_touch
  after insert or update or delete on public.sales_order_lines
  for each row execute function public.sales_order_lines_touch_parent();

-- ============================================================
-- 4. Create an order from an accepted quotation, in one step
-- ============================================================
-- Idempotent: if a live order already exists for the quotation, that order is
-- returned, so a double click cannot make two. security invoker: the caller's RLS
-- applies throughout.
create or replace function public.sales_create_order(
  p_quotation_id uuid,
  p_customer_po_no text default null,
  p_delivery_due_on date default null,
  p_override_reason text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_q public.sales_quotations;
  v_order uuid;
begin
  select * into v_q from public.sales_quotations where id = p_quotation_id for update;
  if not found then
    raise exception 'Quotation not found.' using errcode = 'no_data_found';
  end if;

  select id into v_order from public.sales_orders
   where quotation_id = p_quotation_id and status <> 'cancelled';
  if found then
    return v_order;
  end if;

  if v_q.status <> 'accepted' then
    raise exception 'Only an accepted quotation can become an order (this one is %).', v_q.status
      using errcode = 'check_violation';
  end if;

  insert into public.sales_orders
    (quotation_id, account_id, customer_po_no, delivery_due_on, notes, oversell_override_reason)
  values
    (p_quotation_id, v_q.account_id, nullif(btrim(p_customer_po_no), ''), p_delivery_due_on,
     v_q.notes, nullif(btrim(p_override_reason), ''))
  returning id into v_order;

  insert into public.sales_order_lines (order_id, product_id, qty, unit_price, position)
  select v_order, product_id, qty, unit_price, position
    from public.sales_quotation_lines where quotation_id = p_quotation_id;

  update public.sales_orders set status = 'confirmed' where id = v_order;
  return v_order;
end;
$$;
revoke all on function public.sales_create_order(uuid, text, date, text) from public, anon;
grant execute on function public.sales_create_order(uuid, text, date, text) to authenticated;

-- ============================================================
-- 5. RLS and grants
-- ============================================================
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

create policy "sales_orders select" on public.sales_orders for select to authenticated
  using ((select public.has_section('sales')));
create policy "sales_orders insert" on public.sales_orders for insert to authenticated
  with check ((select public.has_section('sales')));
create policy "sales_orders update" on public.sales_orders for update to authenticated
  using ((select public.has_section('sales')))
  with check ((select public.has_section('sales')));
-- No delete policy: cancel instead.

create policy "sales_order_lines select" on public.sales_order_lines for select to authenticated
  using ((select public.has_section('sales')));
create policy "sales_order_lines insert" on public.sales_order_lines for insert to authenticated
  with check ((select public.has_section('sales')));
create policy "sales_order_lines update" on public.sales_order_lines for update to authenticated
  using ((select public.has_section('sales')))
  with check ((select public.has_section('sales')));
create policy "sales_order_lines delete" on public.sales_order_lines for delete to authenticated
  using ((select public.has_section('sales')));

grant select, insert, update on public.sales_orders to authenticated;
grant select, insert, update, delete on public.sales_order_lines to authenticated;

commit;
