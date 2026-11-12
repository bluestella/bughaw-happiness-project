-- Finance, part 1: expenses, cash position and monthly budgets
-- (docs/plans/parallel-work-plan-2026-11-12.md, Wave 2). Run AFTER 0019. One transaction.
--
-- This is NOT bookkeeping. There is no ledger and no tax treatment: the accountant keeps
-- the books. This answers the owner's questions: how much cash do we have, what do we
-- spend each month, are we on budget, and how many months does the cash last.
--
-- The `finance` section is OFF by default for members and contractors (the numbers are
-- sensitive); a super_admin always sees it and can grant it per person at /admin/access.
--
-- Rules enforced here:
--   * An expense has a positive amount, a category, a description and a date that is not in
--     the future (Manila). It is never deleted: void it with a reason, and a voided expense
--     is locked.
--   * Cash balances are dated snapshots, one per day. Only a super_admin corrects one.
--   * A budget is one planned amount per category per month (the first of the month).
--   * Categories are edited by a super_admin only. Default categories are seeded below;
--     they are configuration, not business data.
--
-- Verify:
--   select name from public.fin_categories order by name;

begin;

-- ============================================================
-- 1. The section (off by default)
-- ============================================================
insert into public.app_sections (key, label, group_label, sort_order) values
  ('finance', 'Finance (expenses, cash, budget)', 'Sections', 18)
on conflict (key) do nothing;

insert into public.role_section_defaults (role, section, allowed) values
  ('member', 'finance', false),
  ('contractor', 'finance', false)
on conflict (role, section) do nothing;

-- ============================================================
-- 2. Categories
-- ============================================================
create table public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create unique index fin_categories_name_key on public.fin_categories (lower(btrim(name)));

create trigger fin_categories_audit
  before insert or update on public.fin_categories
  for each row execute function public.set_row_audit();

insert into public.fin_categories (name) values
  ('Materials and production'),
  ('Packaging'),
  ('Freight and logistics'),
  ('Marketing'),
  ('Salaries and allowances'),
  ('Professional fees'),
  ('Software and subscriptions'),
  ('Permits and compliance'),
  ('Travel'),
  ('Other');

-- ============================================================
-- 3. Expenses
-- ============================================================
create table public.fin_expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  category_id uuid not null references public.fin_categories(id) on delete restrict,
  vendor text check (btrim(vendor) <> ''),
  description text not null check (btrim(description) <> '' and char_length(description) <= 500),
  -- Receipt or official receipt number, as written on the paper.
  reference text check (btrim(reference) <> ''),
  voided_at timestamptz,
  void_reason text check (btrim(void_reason) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint fin_expenses_void_check check ((voided_at is null) = (void_reason is null))
);
create index fin_expenses_spent_on_idx on public.fin_expenses (spent_on desc);
create index fin_expenses_category_idx on public.fin_expenses (category_id);

create trigger fin_expenses_a_audit
  before insert or update on public.fin_expenses
  for each row execute function public.set_row_audit();

create or replace function public.fin_expenses_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.spent_on > (now() at time zone 'Asia/Manila')::date then
    raise exception 'An expense cannot be dated in the future.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if old.voided_at is not null then
      raise exception 'A voided expense cannot be changed.' using errcode = 'check_violation';
    end if;
    -- Voiding is its own act: it stamps the time and needs a reason (the table CHECK).
    if new.void_reason is not null and old.void_reason is null then
      new.voided_at := now();
    else
      new.voided_at := null;
      new.void_reason := null;
    end if;
  else
    new.voided_at := null;
    new.void_reason := null;
  end if;
  return new;
end;
$$;
revoke all on function public.fin_expenses_guard() from public, anon, authenticated;

create trigger fin_expenses_b_guard
  before insert or update on public.fin_expenses
  for each row execute function public.fin_expenses_guard();

-- ============================================================
-- 4. Cash position: dated snapshots
-- ============================================================
create table public.fin_cash_balances (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  amount numeric(14,2) not null check (amount >= 0 and amount < 1000000000000),
  note text check (btrim(note) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint fin_cash_balances_day_key unique (as_of)
);

create trigger fin_cash_balances_a_audit
  before insert or update on public.fin_cash_balances
  for each row execute function public.set_row_audit();

create or replace function public.fin_cash_balances_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.as_of > (now() at time zone 'Asia/Manila')::date then
    raise exception 'A cash balance cannot be dated in the future.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.fin_cash_balances_guard() from public, anon, authenticated;

create trigger fin_cash_balances_b_guard
  before insert or update on public.fin_cash_balances
  for each row execute function public.fin_cash_balances_guard();

-- ============================================================
-- 5. Budgets: one planned amount per category per month
-- ============================================================
create table public.fin_budgets (
  id uuid primary key default gen_random_uuid(),
  month_start date not null check (extract(day from month_start) = 1),
  category_id uuid not null references public.fin_categories(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 0 and amount < 1000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint fin_budgets_month_category_key unique (month_start, category_id)
);
create index fin_budgets_category_idx on public.fin_budgets (category_id);

create trigger fin_budgets_audit
  before insert or update on public.fin_budgets
  for each row execute function public.set_row_audit();

-- ============================================================
-- 6. Audit
-- ============================================================
create trigger zz_audit after insert or update or delete on public.fin_categories
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.fin_expenses
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.fin_cash_balances
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.fin_budgets
  for each row execute function public.audit_row_change();

-- ============================================================
-- 7. RLS and grants
-- ============================================================
alter table public.fin_categories enable row level security;
alter table public.fin_expenses enable row level security;
alter table public.fin_cash_balances enable row level security;
alter table public.fin_budgets enable row level security;

create policy "fin_categories select" on public.fin_categories for select to authenticated
  using ((select public.has_section('finance')));
create policy "fin_categories insert" on public.fin_categories for insert to authenticated
  with check ((select public.current_user_role()) = 'super_admin');
create policy "fin_categories update" on public.fin_categories for update to authenticated
  using ((select public.current_user_role()) = 'super_admin')
  with check ((select public.current_user_role()) = 'super_admin');

create policy "fin_expenses select" on public.fin_expenses for select to authenticated
  using ((select public.has_section('finance')));
create policy "fin_expenses insert" on public.fin_expenses for insert to authenticated
  with check ((select public.has_section('finance')));
create policy "fin_expenses update" on public.fin_expenses for update to authenticated
  using ((select public.has_section('finance')))
  with check ((select public.has_section('finance')));

create policy "fin_cash_balances select" on public.fin_cash_balances for select to authenticated
  using ((select public.has_section('finance')));
create policy "fin_cash_balances insert" on public.fin_cash_balances for insert to authenticated
  with check ((select public.has_section('finance')));
create policy "fin_cash_balances update" on public.fin_cash_balances for update to authenticated
  using ((select public.current_user_role()) = 'super_admin')
  with check ((select public.current_user_role()) = 'super_admin');

create policy "fin_budgets select" on public.fin_budgets for select to authenticated
  using ((select public.has_section('finance')));
create policy "fin_budgets insert" on public.fin_budgets for insert to authenticated
  with check ((select public.has_section('finance')));
create policy "fin_budgets update" on public.fin_budgets for update to authenticated
  using ((select public.has_section('finance')))
  with check ((select public.has_section('finance')));

grant select, insert, update on public.fin_categories, public.fin_expenses,
  public.fin_cash_balances, public.fin_budgets to authenticated;

commit;
