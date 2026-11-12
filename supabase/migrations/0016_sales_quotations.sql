-- Sales, part 2: quotations (docs/specs/sales-quotes-orders-stock.md).
-- Run AFTER 0015. One transaction.
--
-- These are INTERNAL documents. They are not official invoices or receipts
-- (docs/standards/decisions/0001-official-invoicing-deferred.md).
--
-- Rules enforced here, not in the app:
--   * Numbers (Q-2026-0001) come from a per-year counter; a client cannot pick one.
--   * A quotation starts as a draft. Its totals are always recomputed from its lines.
--   * Once it leaves draft its content is locked. A change is a new version that
--     supersedes it (sales_revise_quotation), so the document that was sent survives.
--   * Only legal status changes are accepted.
--   * The customer's name is copied onto the document when it is created.
--   * Quotations are never deleted: abandon a draft by voiding it.
--
-- Status flow:
--   draft -> sent | void
--   sent  -> accepted | declined | superseded
--   declined -> superseded
-- "Expired" is not stored: a sent quotation past valid_until is expired when read.
--
-- Verify:
--   select * from public.sales_counters;   -- empty until the first quotation

begin;

-- ============================================================
-- 1. Document numbers
-- ============================================================
create table public.sales_counters (
  kind text not null check (kind in ('quotation','order')),
  year integer not null,
  last_no integer not null default 0 check (last_no >= 0),
  primary key (kind, year)
);
alter table public.sales_counters enable row level security;
-- No policies and no grants: reached only through sales_next_number().

-- Manila's calendar year, not UTC's.
create or replace function public.sales_next_number(p_kind text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Asia/Manila'))::integer;
  v_no integer;
begin
  if p_kind not in ('quotation','order') then
    raise exception 'Unknown document kind %.', p_kind using errcode = 'check_violation';
  end if;
  insert into public.sales_counters (kind, year, last_no) values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last_no = public.sales_counters.last_no + 1
  returning last_no into v_no;
  return case p_kind when 'quotation' then 'Q' else 'SO' end
         || '-' || v_year::text || '-' || lpad(v_no::text, 4, '0');
end;
$$;
revoke all on function public.sales_next_number(text) from public, anon, authenticated;

-- ============================================================
-- 2. Quotations
-- ============================================================
create table public.sales_quotations (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  version integer not null default 1 check (version >= 1),
  -- NO ACTION (checked at the end of the statement) rather than RESTRICT, so a whole
  -- revision chain can be removed in one DELETE by an administrator.
  supersedes_id uuid references public.sales_quotations(id),
  account_id uuid not null references public.crm_accounts(id) on delete restrict,
  lead_id uuid references public.crm_leads(id) on delete set null,
  account_name_snapshot text not null default '',
  contact_name text check (btrim(contact_name) <> ''),
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','declined','superseded','void')),
  valid_until date,
  payment_terms text check (btrim(payment_terms) <> ''),
  delivery_terms text check (btrim(delivery_terms) <> ''),
  lead_time_days integer check (lead_time_days >= 0),
  notes text check (btrim(notes) <> ''),
  -- Free text printed on the document. No VAT line until the BIR/VAT status is known.
  tax_note text check (btrim(tax_note) <> ''),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint sales_quotations_number_version_key unique (number, version)
);
create index sales_quotations_account_id_idx on public.sales_quotations (account_id);
create index sales_quotations_lead_id_idx on public.sales_quotations (lead_id);
create index sales_quotations_supersedes_id_idx on public.sales_quotations (supersedes_id);
create index sales_quotations_status_idx on public.sales_quotations (status, created_at desc);

create table public.sales_quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.sales_quotations(id) on delete cascade,
  product_id uuid not null references public.sales_products(id) on delete restrict,
  product_name_snapshot text not null default '',
  qty integer not null check (qty >= 1),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index sales_quotation_lines_quotation_id_idx on public.sales_quotation_lines (quotation_id, position);
create index sales_quotation_lines_product_id_idx on public.sales_quotation_lines (product_id);

-- ============================================================
-- 3. Triggers
-- ============================================================
-- 3a. New quotation: number, version, draft state and customer name come from the
--     database. security definer so the account name can be read by a person who
--     has 'sales' but not 'crm'.
create or replace function public.sales_quotations_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old public.sales_quotations;
begin
  if new.supersedes_id is null then
    new.number := public.sales_next_number('quotation');
    new.version := 1;
  else
    select * into v_old from public.sales_quotations where id = new.supersedes_id;
    if not found then
      raise exception 'The quotation being revised does not exist.' using errcode = 'foreign_key_violation';
    end if;
    new.number := v_old.number;
    new.version := v_old.version + 1;
  end if;
  new.status := 'draft';
  new.sent_at := null;
  new.decided_at := null;
  new.subtotal := 0;
  new.total := 0;
  select name into new.account_name_snapshot from public.crm_accounts where id = new.account_id;
  return new;
end;
$$;
revoke all on function public.sales_quotations_before_insert() from public, anon, authenticated;

create trigger sales_quotations_a_insert
  before insert on public.sales_quotations
  for each row execute function public.sales_quotations_before_insert();
create trigger sales_quotations_b_audit
  before insert or update on public.sales_quotations
  for each row execute function public.set_row_audit();

-- 3b. Updates: lock issued documents, allow only legal transitions, keep totals true.
create or replace function public.sales_quotations_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lines integer;
begin
  -- Identity never changes.
  if (new.id, new.number, new.version, new.supersedes_id, new.account_id, new.account_name_snapshot)
     is distinct from
     (old.id, old.number, old.version, old.supersedes_id, old.account_id, old.account_name_snapshot) then
    raise exception 'A quotation''s number, version and customer cannot be changed.'
      using errcode = 'check_violation';
  end if;

  if old.status <> 'draft' then
    if (new.lead_id, new.contact_name, new.valid_until, new.payment_terms, new.delivery_terms,
        new.lead_time_days, new.notes, new.tax_note, new.discount_amount, new.subtotal, new.total)
       is distinct from
       (old.lead_id, old.contact_name, old.valid_until, old.payment_terms, old.delivery_terms,
        old.lead_time_days, old.notes, old.tax_note, old.discount_amount, old.subtotal, old.total) then
      raise exception 'A quotation that has been sent cannot be edited. Revise it to make a new version.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'    and new.status in ('sent','void')) or
      (old.status = 'sent'     and new.status in ('accepted','declined','superseded')) or
      (old.status = 'declined' and new.status = 'superseded')
    ) then
      raise exception 'A quotation cannot go from % to %.', old.status, new.status
        using errcode = 'check_violation';
    end if;

    if new.status = 'sent' then
      select count(*) into v_lines from public.sales_quotation_lines where quotation_id = new.id;
      if v_lines = 0 then
        raise exception 'Add at least one line before sending the quotation.' using errcode = 'check_violation';
      end if;
      if new.valid_until is null or new.valid_until < (now() at time zone 'Asia/Manila')::date then
        raise exception 'Set a validity date that has not passed before sending.' using errcode = 'check_violation';
      end if;
      new.sent_at := now();
    elsif new.status = 'accepted' then
      if old.valid_until < (now() at time zone 'Asia/Manila')::date then
        raise exception 'This quotation has expired. Revise it with a new validity date.'
          using errcode = 'check_violation';
      end if;
      new.decided_at := now();
    elsif new.status = 'declined' then
      new.decided_at := now();
    end if;
  else
    new.sent_at := old.sent_at;
    new.decided_at := old.decided_at;
  end if;

  -- Totals are never taken from the client. A draft (including the update that
  -- sends or voids it) is recomputed from its lines; after that they are frozen
  -- (checked above).
  if old.status = 'draft' then
    select coalesce(sum(line_total), 0) into new.subtotal
      from public.sales_quotation_lines where quotation_id = new.id;
    new.total := greatest(0, new.subtotal - new.discount_amount);
  end if;
  return new;
end;
$$;
revoke all on function public.sales_quotations_before_update() from public, anon, authenticated;

create trigger sales_quotations_c_update
  before update on public.sales_quotations
  for each row execute function public.sales_quotations_before_update();

-- 3c. Lines: only while the quotation is a draft; name and total come from the database.
create or replace function public.sales_quotation_lines_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quotation uuid := coalesce(new.quotation_id, old.quotation_id);
  v_status text;
begin
  -- Deleting the document itself (an administrator, never a client: there is no
  -- delete policy) removes its lines. That runs as a nested trigger, unlike a direct
  -- delete of a line.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select status into v_status from public.sales_quotations where id = v_quotation;
  if v_status is distinct from 'draft' then
    raise exception 'Lines can only be changed while the quotation is a draft.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.quotation_id is distinct from old.quotation_id then
    raise exception 'A line cannot move to another quotation.' using errcode = 'check_violation';
  end if;
  select name into new.product_name_snapshot from public.sales_products where id = new.product_id;
  new.line_total := round(new.qty * new.unit_price, 2);
  return new;
end;
$$;
revoke all on function public.sales_quotation_lines_guard() from public, anon, authenticated;

create trigger sales_quotation_lines_a_guard
  before insert or update or delete on public.sales_quotation_lines
  for each row execute function public.sales_quotation_lines_guard();

-- After any line change, touch the parent so 3b recomputes its totals.
create or replace function public.sales_quotation_lines_touch_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.sales_quotations
     set updated_at = now()
   where id = coalesce(new.quotation_id, old.quotation_id);
  return null;
end;
$$;
revoke all on function public.sales_quotation_lines_touch_parent() from public, anon, authenticated;

create trigger sales_quotation_lines_b_touch
  after insert or update or delete on public.sales_quotation_lines
  for each row execute function public.sales_quotation_lines_touch_parent();

-- ============================================================
-- 4. Revise: a new draft version that supersedes a sent or declined quotation
-- ============================================================
-- security invoker: the caller's RLS applies to everything it reads and writes.
create or replace function public.sales_revise_quotation(p_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_old public.sales_quotations;
  v_new uuid;
begin
  select * into v_old from public.sales_quotations where id = p_id for update;
  if not found then
    raise exception 'Quotation not found.' using errcode = 'no_data_found';
  end if;
  if v_old.status not in ('sent','declined') then
    raise exception 'Only a sent or declined quotation can be revised (this one is %).', v_old.status
      using errcode = 'check_violation';
  end if;

  insert into public.sales_quotations
    (supersedes_id, account_id, lead_id, contact_name, payment_terms, delivery_terms,
     lead_time_days, notes, tax_note, discount_amount)
  values
    (p_id, v_old.account_id, v_old.lead_id, v_old.contact_name, v_old.payment_terms, v_old.delivery_terms,
     v_old.lead_time_days, v_old.notes, v_old.tax_note, v_old.discount_amount)
  returning id into v_new;

  insert into public.sales_quotation_lines (quotation_id, product_id, qty, unit_price, position)
  select v_new, product_id, qty, unit_price, position
    from public.sales_quotation_lines where quotation_id = p_id;

  update public.sales_quotations set status = 'superseded' where id = p_id;
  return v_new;
end;
$$;
revoke all on function public.sales_revise_quotation(uuid) from public, anon;
grant execute on function public.sales_revise_quotation(uuid) to authenticated;

-- ============================================================
-- 5. RLS and grants
-- ============================================================
alter table public.sales_quotations enable row level security;
alter table public.sales_quotation_lines enable row level security;

create policy "sales_quotations select" on public.sales_quotations for select to authenticated
  using ((select public.has_section('sales')));
create policy "sales_quotations insert" on public.sales_quotations for insert to authenticated
  with check ((select public.has_section('sales')));
create policy "sales_quotations update" on public.sales_quotations for update to authenticated
  using ((select public.has_section('sales')))
  with check ((select public.has_section('sales')));
-- No delete policy: void a draft instead.

create policy "sales_quotation_lines select" on public.sales_quotation_lines for select to authenticated
  using ((select public.has_section('sales')));
create policy "sales_quotation_lines insert" on public.sales_quotation_lines for insert to authenticated
  with check ((select public.has_section('sales')));
create policy "sales_quotation_lines update" on public.sales_quotation_lines for update to authenticated
  using ((select public.has_section('sales')))
  with check ((select public.has_section('sales')));
create policy "sales_quotation_lines delete" on public.sales_quotation_lines for delete to authenticated
  using ((select public.has_section('sales')));

grant select, insert, update on public.sales_quotations to authenticated;
grant select, insert, update, delete on public.sales_quotation_lines to authenticated;

commit;
