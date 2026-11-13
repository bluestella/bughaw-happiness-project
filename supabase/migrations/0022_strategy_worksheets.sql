-- Strategy worksheets: six saved frameworks (Five Forces, Three Horizons, Balanced Scorecard,
-- RICE, nine-box, Sean Ellis survey). Run AFTER 0021. One transaction.
--
-- Each worksheet is one row: a kind, a title and a JSON document. The shape of the document
-- depends on the kind and is cleaned by src/lib/strategy.ts; the database only guarantees
-- that it is a JSON object of bounded size. All the scoring is computed on screen, so a
-- worksheet never holds a number that can drift from its inputs.
--
-- Access: the `strategy` section. Members have it by default, contractors do not; a
-- super_admin always has it and can change either per person at /admin/access.
--   read / create / edit: anyone with the section (a shared team document; the screen
--     refuses to overwrite a newer save)
--   delete: super_admin only
--
-- Verify:
--   select key, sort_order from public.app_sections where key = 'strategy';

begin;

insert into public.app_sections (key, label, group_label, sort_order) values
  ('strategy', 'Strategy worksheets', 'Sections', 19)
on conflict (key) do nothing;

insert into public.role_section_defaults (role, section, allowed) values
  ('member', 'strategy', true),
  ('contractor', 'strategy', false)
on conflict (role, section) do nothing;

create table public.strategy_worksheets (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('porter','three_horizons','balanced_scorecard','rice','nine_box','sean_ellis')),
  title text not null check (btrim(title) <> '' and char_length(title) <= 120),
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create index strategy_worksheets_kind_idx on public.strategy_worksheets (kind, updated_at desc);

create trigger strategy_worksheets_audit
  before insert or update on public.strategy_worksheets
  for each row execute function public.set_row_audit();

-- Who created, retitled or deleted a worksheet. The document itself is left out (large).
create trigger zz_audit after insert or update or delete on public.strategy_worksheets
  for each row execute function public.audit_row_change('data');

alter table public.strategy_worksheets enable row level security;

create policy "strategy_worksheets select" on public.strategy_worksheets for select to authenticated
  using ((select public.has_section('strategy')));
create policy "strategy_worksheets insert" on public.strategy_worksheets for insert to authenticated
  with check ((select public.has_section('strategy')));
create policy "strategy_worksheets update" on public.strategy_worksheets for update to authenticated
  using ((select public.has_section('strategy')))
  with check ((select public.has_section('strategy')));
create policy "strategy_worksheets delete" on public.strategy_worksheets for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

grant select, insert, update, delete on public.strategy_worksheets to authenticated;

commit;
