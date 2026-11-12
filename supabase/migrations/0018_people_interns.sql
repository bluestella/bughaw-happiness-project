-- People, part 1: intern profiles, daily logs and weekly reports
-- (docs/specs/intern-log-and-reports.md, docs/standards/database.md).
-- Run AFTER 0017. One transaction. No interns are seeded: a super_admin adds each
-- one in the app.
--
-- Principles: monitoring means reviewed output (hours the intern enters, reports a
-- supervisor approved). Nothing here records screens, location or activity. These
-- are personal data: an intern sees only their own rows, a supervisor sees their
-- interns', a super_admin sees all. Nobody else with the `people` section sees any.
--
-- Rules enforced in the database:
--   * intern_email always comes from the session (a super_admin may write for anyone).
--   * A day can be logged or edited for the last 7 days, never the future
--     (super_admin excepted). A day is Manila's calendar day.
--   * Once a week's report is submitted or approved, that week's logs are locked.
--     Returning the report unlocks them.
--   * Report: draft -> submitted (the intern), submitted -> approved | returned
--     (the intern's supervisor or a super_admin), returned -> submitted (the intern).
--     approved is final. Nobody reviews their own report. Returning needs a comment.
--   * A report's total_hours is always the sum of that week's logs, never client-set.
--
-- Verify:
--   select key, sort_order from public.app_sections where key = 'people';

begin;

-- ============================================================
-- 1. The section
-- ============================================================
insert into public.app_sections (key, label, group_label, sort_order) values
  ('people', 'People (intern logs and reports)', 'Sections', 17)
on conflict (key) do nothing;

-- Both roles may open the pages; the row rules below decide what each person sees.
insert into public.role_section_defaults (role, section, allowed) values
  ('member', 'people', true),
  ('contractor', 'people', true)
on conflict (role, section) do nothing;

-- ============================================================
-- 2. Profiles
-- ============================================================
create table public.people_interns (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.allowed_emails(email) on update cascade on delete cascade,
  full_name text,
  discipline text not null
    check (discipline in ('chemical_engineering','marketing','graphics','other')),
  school text check (btrim(school) <> ''),
  program text check (btrim(program) <> ''),
  required_hours integer not null default 0 check (required_hours >= 0),
  starts_on date,
  ends_on date,
  supervisor_email text references public.allowed_emails(email) on update cascade on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint people_interns_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint people_interns_name_not_blank check (btrim(full_name) <> '')
);
create unique index people_interns_email_key on public.people_interns (lower(email));
create index people_interns_supervisor_idx on public.people_interns (lower(supervisor_email));

create trigger people_interns_audit
  before insert or update on public.people_interns
  for each row execute function public.set_row_audit();

-- ============================================================
-- 3. Access helper
-- ============================================================
-- Own row, their supervisor, or a super_admin. security definer so a policy on one
-- table can look at people_interns without recursing through its own policies.
create or replace function public.people_can_see_intern(p_email text)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.has_section('people') and (
    public.current_user_role() = 'super_admin'
    or lower(p_email) = lower(auth.jwt() ->> 'email')
    or exists (
      select 1 from public.people_interns i
       where lower(i.email) = lower(p_email)
         and lower(i.supervisor_email) = lower(auth.jwt() ->> 'email')
    )
  );
$$;
revoke all on function public.people_can_see_intern(text) from public, anon;
grant execute on function public.people_can_see_intern(text) to authenticated;

-- ============================================================
-- 4. Daily logs
-- ============================================================
create table public.people_daily_logs (
  id uuid primary key default gen_random_uuid(),
  intern_email text not null references public.allowed_emails(email) on update cascade on delete cascade,
  work_date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 12),
  summary text not null check (btrim(summary) <> '' and char_length(summary) <= 1000),
  task_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint people_daily_logs_day_key unique (intern_email, work_date)
);
create index people_daily_logs_week_idx on public.people_daily_logs (lower(intern_email), work_date);

create trigger people_daily_logs_b_audit
  before insert or update on public.people_daily_logs
  for each row execute function public.set_row_audit();

-- ============================================================
-- 5. Weekly reports
-- ============================================================
create table public.people_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  intern_email text not null references public.allowed_emails(email) on update cascade on delete cascade,
  -- Always a Monday.
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','returned')),
  accomplishments text check (btrim(accomplishments) <> ''),
  learnings text check (btrim(learnings) <> ''),
  blockers text check (btrim(blockers) <> ''),
  next_week_plan text check (btrim(next_week_plan) <> ''),
  total_hours numeric(6,2) not null default 0,
  submitted_at timestamptz,
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_comment text check (btrim(review_comment) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint people_weekly_reports_week_key unique (intern_email, week_start)
);
create index people_weekly_reports_status_idx on public.people_weekly_reports (status, week_start desc);

-- The Monday of a date's week.
create or replace function public.people_week_start(p_day date)
returns date
language sql immutable
set search_path = public
as $$ select date_trunc('week', p_day)::date $$;
-- Called from triggers that run as the signed-in user, so they need EXECUTE.
revoke all on function public.people_week_start(date) from public, anon;
grant execute on function public.people_week_start(date) to authenticated;

-- ============================================================
-- 6. Triggers on logs
-- ============================================================
create or replace function public.people_daily_logs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_admin boolean := public.current_user_role() = 'super_admin';
  v_me text := lower(auth.jwt() ->> 'email');
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_email text;
  v_day date;
  v_week date;
begin
  if tg_op = 'INSERT' then
    -- The session decides whose log this is, unless a super_admin writes for someone.
    -- A signed-in non-admin always writes their own log. (The service role, used only
    -- by tests and admin scripts, has no email claim and is left alone.)
    if not v_admin and v_me is not null then
      new.intern_email := v_me;
      if not exists (
        select 1 from public.people_interns i where lower(i.email) = v_me and i.is_active
      ) then
        raise exception 'You are not set up as an active intern.' using errcode = 'insufficient_privilege';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.intern_email, new.work_date) is distinct from (old.intern_email, old.work_date) then
      raise exception 'A log''s day and intern cannot be changed. Delete it and add the right day.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_email := lower(coalesce(new.intern_email, old.intern_email));
  v_day := coalesce(new.work_date, old.work_date);

  if not v_admin and v_me is not null and (v_day > v_today or v_day < v_today - 7) then
    raise exception 'You can log or change a day only from the last 7 days up to today. Ask a super_admin for older corrections.'
      using errcode = 'check_violation';
  end if;

  -- A submitted or approved week is locked.
  v_week := public.people_week_start(v_day);
  if exists (
    select 1 from public.people_weekly_reports r
     where lower(r.intern_email) = v_email and r.week_start = v_week
       and r.status in ('submitted','approved')
  ) then
    raise exception 'This week''s report is already submitted. It must be returned before the logs can change.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function public.people_daily_logs_guard() from public, anon, authenticated;

create trigger people_daily_logs_a_guard
  before insert or update or delete on public.people_daily_logs
  for each row execute function public.people_daily_logs_guard();

-- After a log changes, touch that week's open report so its total is recomputed.
create or replace function public.people_daily_logs_touch_report()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.intern_email, old.intern_email));
  v_week date := public.people_week_start(coalesce(new.work_date, old.work_date));
begin
  update public.people_weekly_reports
     set updated_at = now()
   where lower(intern_email) = v_email and week_start = v_week and status in ('draft','returned');
  return null;
end;
$$;
revoke all on function public.people_daily_logs_touch_report() from public, anon, authenticated;

create trigger people_daily_logs_c_touch
  after insert or update or delete on public.people_daily_logs
  for each row execute function public.people_daily_logs_touch_report();

-- ============================================================
-- 7. Triggers on reports
-- ============================================================
create or replace function public.people_week_hours(p_email text, p_week date)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(sum(hours), 0)
    from public.people_daily_logs
   where lower(intern_email) = lower(p_email)
     and work_date between p_week and p_week + 6
$$;
-- Reads logs under the caller's RLS, so asking about someone else's week returns 0.
revoke all on function public.people_week_hours(text, date) from public, anon;
grant execute on function public.people_week_hours(text, date) to authenticated;

create or replace function public.people_weekly_reports_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_admin boolean := public.current_user_role() = 'super_admin';
  v_me text := lower(auth.jwt() ->> 'email');
begin
  if not v_admin and v_me is not null then
    new.intern_email := v_me;
    if not exists (
      select 1 from public.people_interns i where lower(i.email) = v_me and i.is_active
    ) then
      raise exception 'You are not set up as an active intern.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.week_start > (now() at time zone 'Asia/Manila')::date then
    raise exception 'A report cannot start in the future.' using errcode = 'check_violation';
  end if;
  new.status := 'draft';
  new.submitted_at := null;
  new.reviewed_by_email := null;
  new.reviewed_at := null;
  new.review_comment := null;
  new.total_hours := public.people_week_hours(new.intern_email, new.week_start);
  return new;
end;
$$;
revoke all on function public.people_weekly_reports_before_insert() from public, anon, authenticated;

create trigger people_weekly_reports_a_insert
  before insert on public.people_weekly_reports
  for each row execute function public.people_weekly_reports_before_insert();
create trigger people_weekly_reports_b_audit
  before insert or update on public.people_weekly_reports
  for each row execute function public.set_row_audit();

create or replace function public.people_weekly_reports_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_admin boolean := public.current_user_role() = 'super_admin';
  v_me text := lower(auth.jwt() ->> 'email');
  v_owner boolean := lower(old.intern_email) = v_me;
  v_supervisor boolean := exists (
    select 1 from public.people_interns i
     where lower(i.email) = lower(old.intern_email) and lower(i.supervisor_email) = v_me
  );
  v_content_changed boolean :=
    (new.accomplishments, new.learnings, new.blockers, new.next_week_plan)
    is distinct from (old.accomplishments, old.learnings, old.blockers, old.next_week_plan);
begin
  if (new.id, new.intern_email, new.week_start) is distinct from (old.id, old.intern_email, old.week_start) then
    raise exception 'A report''s intern and week cannot be changed.' using errcode = 'check_violation';
  end if;

  -- Review fields are written only by the review itself, below.
  new.reviewed_by_email := old.reviewed_by_email;
  new.reviewed_at := old.reviewed_at;
  new.submitted_at := old.submitted_at;
  new.total_hours := old.total_hours;

  if new.status is distinct from old.status then
    if old.status in ('draft','returned') and new.status = 'submitted' then
      if not v_owner then
        raise exception 'Only the intern can submit their own report.' using errcode = 'insufficient_privilege';
      end if;
      new.total_hours := public.people_week_hours(old.intern_email, old.week_start);
      if new.total_hours <= 0 then
        raise exception 'Log at least one day of hours before submitting the report.' using errcode = 'check_violation';
      end if;
      new.submitted_at := now();
      new.reviewed_by_email := null;
      new.reviewed_at := null;
      -- The supervisor's last comment stays visible until the review replaces it.
    elsif old.status = 'submitted' and new.status in ('approved','returned') then
      if v_owner then
        raise exception 'You cannot review your own report.' using errcode = 'insufficient_privilege';
      end if;
      if not (v_supervisor or v_admin) then
        raise exception 'Only the intern''s supervisor or a super_admin can review a report.'
          using errcode = 'insufficient_privilege';
      end if;
      if v_content_changed then
        raise exception 'A reviewer cannot change the report''s text.' using errcode = 'check_violation';
      end if;
      if new.status = 'returned' and new.review_comment is null then
        raise exception 'Say what needs to change when returning a report.' using errcode = 'check_violation';
      end if;
      new.reviewed_by_email := v_me;
      new.reviewed_at := now();
    else
      raise exception 'A report cannot go from % to %.', old.status, new.status using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- No status change.
  if new.review_comment is distinct from old.review_comment then
    raise exception 'The review comment is written only when a report is approved or returned.'
      using errcode = 'check_violation';
  end if;
  if v_content_changed then
    if old.status not in ('draft','returned') then
      raise exception 'A submitted report cannot be edited. It must be returned first.' using errcode = 'check_violation';
    end if;
    if not v_owner then
      raise exception 'Only the intern can write their report.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  -- Keep the running total true while the report is open.
  if old.status in ('draft','returned') then
    new.total_hours := public.people_week_hours(old.intern_email, old.week_start);
  end if;
  return new;
end;
$$;
revoke all on function public.people_weekly_reports_before_update() from public, anon, authenticated;

create trigger people_weekly_reports_c_update
  before update on public.people_weekly_reports
  for each row execute function public.people_weekly_reports_before_update();

-- ============================================================
-- 8. RLS and grants
-- ============================================================
alter table public.people_interns enable row level security;
alter table public.people_daily_logs enable row level security;
alter table public.people_weekly_reports enable row level security;

create policy "people_interns select" on public.people_interns for select to authenticated
  using ((select public.people_can_see_intern(email)));
create policy "people_interns insert" on public.people_interns for insert to authenticated
  with check ((select public.current_user_role()) = 'super_admin');
create policy "people_interns update" on public.people_interns for update to authenticated
  using ((select public.current_user_role()) = 'super_admin')
  with check ((select public.current_user_role()) = 'super_admin');
-- No delete: deactivate instead.

create policy "people_daily_logs select" on public.people_daily_logs for select to authenticated
  using ((select public.people_can_see_intern(intern_email)));
create policy "people_daily_logs insert" on public.people_daily_logs for insert to authenticated
  with check (
    (select public.has_section('people'))
    and ((select public.current_user_role()) = 'super_admin'
         or lower(intern_email) = lower((select auth.jwt() ->> 'email')))
  );
create policy "people_daily_logs update" on public.people_daily_logs for update to authenticated
  using (
    (select public.has_section('people'))
    and ((select public.current_user_role()) = 'super_admin'
         or lower(intern_email) = lower((select auth.jwt() ->> 'email')))
  );
create policy "people_daily_logs delete" on public.people_daily_logs for delete to authenticated
  using (
    (select public.has_section('people'))
    and ((select public.current_user_role()) = 'super_admin'
         or lower(intern_email) = lower((select auth.jwt() ->> 'email')))
  );

create policy "people_weekly_reports select" on public.people_weekly_reports for select to authenticated
  using ((select public.people_can_see_intern(intern_email)));
create policy "people_weekly_reports insert" on public.people_weekly_reports for insert to authenticated
  with check (
    (select public.has_section('people'))
    and ((select public.current_user_role()) = 'super_admin'
         or lower(intern_email) = lower((select auth.jwt() ->> 'email')))
  );
-- Whoever can see a report may update it; the trigger decides what each person may change.
create policy "people_weekly_reports update" on public.people_weekly_reports for update to authenticated
  using ((select public.people_can_see_intern(intern_email)));
-- No delete.

grant select, insert, update on public.people_interns to authenticated;
grant select, insert, update, delete on public.people_daily_logs to authenticated;
grant select, insert, update on public.people_weekly_reports to authenticated;

commit;
