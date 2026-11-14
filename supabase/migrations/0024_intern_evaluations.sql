-- Intern evaluations: an editable rubric, evaluations with a score per criterion, and a
-- "shared" step that releases the feedback to the intern. Run AFTER 0023. One transaction.
--
-- The owner has not given the schools' evaluation forms yet, so NOTHING IS SEEDED: a
-- super_admin writes the criteria in the app (people > Criteria), optionally one set per
-- discipline. When a school's form arrives, its criteria are typed in, not coded in.
-- Scores are whole numbers from 1 to 5.
--
-- Who can do what (the `people` section is already open to members and contractors; these
-- rows decide what each person sees):
--   * Criteria: everyone with the section reads them (an intern should know what they are
--     rated on); only a super_admin writes. Criteria are never deleted, only deactivated.
--   * An evaluation is written by the intern's supervisor or a super_admin, NEVER by the intern
--     and never about oneself. It starts as a draft only they can see. Sharing it releases it
--     to the intern, who can then read it but never change it.
--   * A shared evaluation is final: it and its scores are locked, and a signed-in user cannot
--     delete it. A mistake is handled by a new evaluation.
--   * Each score keeps the criterion's wording as it was when scored, so editing the rubric later
--     never rewrites an old evaluation.
--
-- Verify:
--   select label, discipline, is_active from public.people_eval_criteria order by sort_order;

begin;

-- ============================================================
-- 1. Criteria (the rubric)
-- ============================================================
create table public.people_eval_criteria (
  id uuid primary key default gen_random_uuid(),
  label text not null check (btrim(label) <> '' and char_length(label) <= 80),
  description text check (btrim(description) <> '' and char_length(description) <= 300),
  -- Null means the criterion applies to every discipline.
  discipline text check (discipline in ('chemical_engineering','marketing','graphics','other')),
  sort_order integer not null default 0 check (sort_order >= 0 and sort_order <= 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', ''))
);
create unique index people_eval_criteria_label_key
  on public.people_eval_criteria (lower(btrim(label)), coalesce(discipline, ''));

create trigger people_eval_criteria_audit
  before insert or update on public.people_eval_criteria
  for each row execute function public.set_row_audit();

-- ============================================================
-- 2. Access helpers (security definer, so a policy can look at people_interns)
-- ============================================================
-- May this person write evaluations about this intern? The supervisor or a super_admin, never
-- the intern themself.
create or replace function public.people_can_evaluate(p_intern_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.has_section('people') and exists (
    select 1 from public.people_interns i
     where i.id = p_intern_id
       and lower(i.email) is distinct from lower(auth.jwt() ->> 'email')
       and (public.current_user_role() = 'super_admin'
            or lower(i.supervisor_email) = lower(auth.jwt() ->> 'email'))
  );
$$;
revoke all on function public.people_can_evaluate(uuid) from public, anon;
grant execute on function public.people_can_evaluate(uuid) to authenticated;

-- May this person read an evaluation? Its writers always; the intern only once it is shared.
create or replace function public.people_can_read_evaluation(p_intern_id uuid, p_status text)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.people_can_evaluate(p_intern_id)
      or (public.has_section('people') and p_status = 'shared' and exists (
            select 1 from public.people_interns i
             where i.id = p_intern_id
               and lower(i.email) = lower(auth.jwt() ->> 'email')));
$$;
revoke all on function public.people_can_read_evaluation(uuid, text) from public, anon;
grant execute on function public.people_can_read_evaluation(uuid, text) to authenticated;

-- ============================================================
-- 3. Evaluations
-- ============================================================
create table public.people_evaluations (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.people_interns(id) on delete restrict,
  -- What the evaluation covers, in the evaluator's words: "Midterm", "Final", "Month 2".
  period text not null check (btrim(period) <> '' and char_length(period) <= 60),
  evaluated_on date not null,
  strengths text check (btrim(strengths) <> '' and char_length(strengths) <= 1000),
  improvements text check (btrim(improvements) <> '' and char_length(improvements) <= 1000),
  recommendation text check (btrim(recommendation) <> '' and char_length(recommendation) <= 500),
  status text not null default 'draft' check (status in ('draft','shared')),
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The evaluator: set from the session and never changed.
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint people_evaluations_shared_check check ((status = 'shared') = (shared_at is not null))
);
create unique index people_evaluations_period_key
  on public.people_evaluations (intern_id, lower(btrim(period)));
create index people_evaluations_status_idx on public.people_evaluations (status, evaluated_on desc);

create or replace function public.people_evaluations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Service-role writes (tests, admin scripts) carry no JWT email.
  v_me text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_scores integer;
begin
  if tg_op = 'DELETE' then
    if old.status = 'shared' and v_me is not null then
      raise exception 'A shared evaluation is final and cannot be deleted.' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception 'An evaluation starts as a draft. Share it afterwards.' using errcode = 'check_violation';
    end if;
    new.shared_at := null;
  else
    if old.status = 'shared' then
      raise exception 'A shared evaluation is final. Write a new one instead.' using errcode = 'check_violation';
    end if;
    if new.intern_id is distinct from old.intern_id then
      raise exception 'An evaluation cannot move to another intern.' using errcode = 'check_violation';
    end if;
    if new.status = 'shared' then
      select count(*) into v_scores from public.people_evaluation_scores where evaluation_id = new.id;
      if v_scores = 0 then
        raise exception 'Score at least one criterion before sharing.' using errcode = 'check_violation';
      end if;
      new.shared_at := now();
    else
      new.shared_at := null;
    end if;
  end if;

  if (tg_op = 'INSERT' or new.evaluated_on is distinct from old.evaluated_on)
     and new.evaluated_on > (now() at time zone 'Asia/Manila')::date then
    raise exception 'The evaluation date cannot be in the future.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.people_evaluations_guard() from public, anon, authenticated;

create trigger people_evaluations_a_guard
  before insert or update or delete on public.people_evaluations
  for each row execute function public.people_evaluations_guard();
create trigger people_evaluations_b_audit
  before insert or update on public.people_evaluations
  for each row execute function public.set_row_audit();

-- ============================================================
-- 4. Scores
-- ============================================================
create table public.people_evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.people_evaluations(id) on delete cascade,
  criterion_id uuid not null references public.people_eval_criteria(id) on delete restrict,
  -- The criterion's wording when it was scored; filled by the trigger.
  criterion_label text not null default '',
  score smallint not null check (score between 1 and 5),
  comment text check (btrim(comment) <> '' and char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  constraint people_evaluation_scores_key unique (evaluation_id, criterion_id)
);

create or replace function public.people_evaluation_scores_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_eval uuid := coalesce(new.evaluation_id, old.evaluation_id);
  v_status text;
  v_discipline text;
  c record;
begin
  -- Deleting the evaluation (a super_admin or maintenance, never a client) removes its scores.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select e.status, i.discipline into v_status, v_discipline
    from public.people_evaluations e
    join public.people_interns i on i.id = e.intern_id
   where e.id = v_eval;
  if v_status is distinct from 'draft' then
    raise exception 'Scores can only change while the evaluation is a draft.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.evaluation_id is distinct from old.evaluation_id
                           or new.criterion_id is distinct from old.criterion_id) then
    raise exception 'A score cannot move to another evaluation or criterion.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select label, discipline, is_active into c from public.people_eval_criteria where id = new.criterion_id;
    if not found or not c.is_active then
      raise exception 'That criterion is not in use.' using errcode = 'check_violation';
    end if;
    if c.discipline is not null and c.discipline is distinct from v_discipline then
      raise exception 'That criterion is for another discipline.' using errcode = 'check_violation';
    end if;
    new.criterion_label := c.label;
  else
    new.criterion_label := old.criterion_label;
  end if;
  return new;
end;
$$;
revoke all on function public.people_evaluation_scores_guard() from public, anon, authenticated;

create trigger people_evaluation_scores_a_guard
  before insert or update or delete on public.people_evaluation_scores
  for each row execute function public.people_evaluation_scores_guard();
create trigger people_evaluation_scores_b_audit
  before insert or update on public.people_evaluation_scores
  for each row execute function public.set_row_audit();

-- ============================================================
-- 5. Audit (free text left out: it is personal)
-- ============================================================
create trigger zz_audit after insert or update or delete on public.people_eval_criteria
  for each row execute function public.audit_row_change();
create trigger zz_audit after insert or update or delete on public.people_evaluations
  for each row execute function public.audit_row_change('strengths','improvements','recommendation');
create trigger zz_audit after insert or update or delete on public.people_evaluation_scores
  for each row execute function public.audit_row_change('comment');

-- ============================================================
-- 6. RLS and grants
-- ============================================================
alter table public.people_eval_criteria enable row level security;
alter table public.people_evaluations enable row level security;
alter table public.people_evaluation_scores enable row level security;

create policy "people_eval_criteria select" on public.people_eval_criteria for select to authenticated
  using ((select public.has_section('people')));
create policy "people_eval_criteria insert" on public.people_eval_criteria for insert to authenticated
  with check ((select public.current_user_role()) = 'super_admin');
create policy "people_eval_criteria update" on public.people_eval_criteria for update to authenticated
  using ((select public.current_user_role()) = 'super_admin')
  with check ((select public.current_user_role()) = 'super_admin');
-- No delete: deactivate instead.

create policy "people_evaluations select" on public.people_evaluations for select to authenticated
  using ((select public.people_can_read_evaluation(intern_id, status)));
create policy "people_evaluations insert" on public.people_evaluations for insert to authenticated
  with check ((select public.people_can_evaluate(intern_id)));
create policy "people_evaluations update" on public.people_evaluations for update to authenticated
  using ((select public.people_can_evaluate(intern_id)))
  with check ((select public.people_can_evaluate(intern_id)));
create policy "people_evaluations delete" on public.people_evaluations for delete to authenticated
  using ((select public.current_user_role()) = 'super_admin');

-- A score follows its evaluation: readable when the evaluation is, writable by its writers.
create policy "people_evaluation_scores select" on public.people_evaluation_scores for select to authenticated
  using (exists (select 1 from public.people_evaluations e where e.id = evaluation_id));
create policy "people_evaluation_scores insert" on public.people_evaluation_scores for insert to authenticated
  with check (exists (select 1 from public.people_evaluations e
                       where e.id = evaluation_id and (select public.people_can_evaluate(e.intern_id))));
create policy "people_evaluation_scores update" on public.people_evaluation_scores for update to authenticated
  using (exists (select 1 from public.people_evaluations e
                  where e.id = evaluation_id and (select public.people_can_evaluate(e.intern_id))))
  with check (exists (select 1 from public.people_evaluations e
                       where e.id = evaluation_id and (select public.people_can_evaluate(e.intern_id))));
create policy "people_evaluation_scores delete" on public.people_evaluation_scores for delete to authenticated
  using (exists (select 1 from public.people_evaluations e
                  where e.id = evaluation_id and (select public.people_can_evaluate(e.intern_id))));

grant select, insert, update on public.people_eval_criteria to authenticated;
grant select, insert, update, delete on public.people_evaluations to authenticated;
grant select, insert, update, delete on public.people_evaluation_scores to authenticated;

commit;
