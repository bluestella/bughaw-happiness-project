-- CRM deal fields and follow-ups (docs/specs/crm-deal-fields.md).
-- Run AFTER 0013. One transaction; safe to re-run.
--
-- 1. crm_accounts.segment: who the buyer is (hotel, resort, spa, other business).
--    `kind` stays as it is because ingest_form_submission() writes it.
-- 2. crm_leads: what a deal is worth, what happens next and when, sample
--    tracking, and why a deal was lost. All nullable (NULL = not recorded, 0013).
-- 3. A lead cannot be Closed Lost without a reason, and only a lost lead keeps one.
--    Enforced by a trigger so the board, the panel and any script obey it.
-- 4. pipeline_accounts.crm_account_id: the CRM account is the one customer record
--    (docs/standards/decisions/0002-one-customer-record.md). Linked where the
--    names match exactly (case/space-insensitive); nothing is merged or deleted.
--
-- Access is unchanged: these are new columns on tables whose RLS already checks
-- has_section('crm') / has_section('tool:pipeline').
--
-- Verify:
--   select count(*) from public.crm_leads where status = 'Closed Lost' and lost_reason is null;  -- 0
--   select count(*) filter (where crm_account_id is not null) as linked, count(*) as total
--     from public.pipeline_accounts;

begin;

-- ============================================================
-- 1. Buyer segment
-- ============================================================
alter table public.crm_accounts
  add column if not exists segment text;

alter table public.crm_accounts
  drop constraint if exists crm_accounts_segment_check;
alter table public.crm_accounts
  add constraint crm_accounts_segment_check
  check (segment in ('hotel','resort','spa','other_business'));

update public.crm_accounts set segment = 'hotel'
 where segment is null and kind = 'hotel';

-- ============================================================
-- 2. Deal fields
-- ============================================================
alter table public.crm_leads
  add column if not exists deal_value numeric(14,2),
  add column if not exists expected_close_on date,
  add column if not exists next_action text,
  add column if not exists next_action_due_on date,
  add column if not exists sample_sent_on date,
  add column if not exists sample_feedback_on date,
  add column if not exists lost_reason text;

alter table public.crm_leads
  drop constraint if exists crm_leads_deal_value_check,
  drop constraint if exists crm_leads_next_action_check,
  drop constraint if exists crm_leads_next_action_due_check,
  drop constraint if exists crm_leads_sample_dates_check,
  drop constraint if exists crm_leads_lost_reason_check;

alter table public.crm_leads
  add constraint crm_leads_deal_value_check
    check (deal_value >= 0),
  -- NULL = no next action; never '' or whitespace, never longer than a card can show.
  add constraint crm_leads_next_action_check
    check (btrim(next_action) <> '' and char_length(next_action) <= 200),
  add constraint crm_leads_next_action_due_check
    check (next_action is null or next_action_due_on is not null),
  add constraint crm_leads_sample_dates_check
    check (sample_feedback_on is null
           or (sample_sent_on is not null and sample_feedback_on >= sample_sent_on)),
  add constraint crm_leads_lost_reason_check
    check (lost_reason in ('price','timing','no_response','chose_competitor','not_a_fit','other'));

create index if not exists crm_leads_next_action_due_idx
  on public.crm_leads (next_action_due_on)
  where next_action_due_on is not null;

-- ============================================================
-- 3. Lost needs a reason; only lost keeps one
-- ============================================================
-- Leads already Closed Lost predate the rule: record 'other' so later edits to
-- those rows are not refused.
update public.crm_leads set lost_reason = 'other'
 where status = 'Closed Lost' and lost_reason is null;

create or replace function public.crm_leads_enforce_lost_reason()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Closed Lost' then
    if new.lost_reason is null then
      raise exception 'A lead cannot be Closed Lost without a lost reason.'
        using errcode = 'check_violation';
    end if;
  else
    new.lost_reason := null;
  end if;
  return new;
end;
$$;

-- Trigger functions cannot be called through the API, but keep the default
-- PUBLIC grant off anyway (docs/security.md §6).
revoke all on function public.crm_leads_enforce_lost_reason() from public, anon;

drop trigger if exists crm_leads_lost_reason on public.crm_leads;
create trigger crm_leads_lost_reason
  before insert or update on public.crm_leads
  for each row execute function public.crm_leads_enforce_lost_reason();

-- ============================================================
-- 4. Pipeline accounts point at the CRM account
-- ============================================================
alter table public.pipeline_accounts
  add column if not exists crm_account_id uuid
    references public.crm_accounts(id) on delete set null;

create index if not exists pipeline_accounts_crm_account_id_idx
  on public.pipeline_accounts (crm_account_id);

update public.pipeline_accounts p
   set crm_account_id = a.id
  from public.crm_accounts a
 where p.crm_account_id is null
   and a.name_key = lower(btrim(p.name));

-- A promoted lead already knows both sides: use that link where the name differs.
update public.pipeline_accounts p
   set crm_account_id = l.account_id
  from public.crm_leads l
 where p.crm_account_id is null
   and l.pipeline_account_id = p.id
   and l.account_id is not null;

commit;
