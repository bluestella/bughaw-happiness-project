-- Reference RLS test script for 0002_task_management.sql. NOT run in CI.
-- Run against a local Supabase stack (`supabase start` + `psql`) or a staging
-- project. It simulates JWTs for three test users, one per role, by setting
-- request.jwt.claims — the same mechanism PostgREST uses.
--
-- Prereqs: both migrations applied, and these rows present:
--   insert into public.allowed_emails (email, role) values
--     ('admin@test.local', 'super_admin'),
--     ('member@test.local', 'member'),
--     ('contractor@test.local', 'contractor');

begin;

create or replace function pg_temp.impersonate(p_email text) returns void
language sql as $$
  select
    set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('email', p_email, 'role', 'authenticated')::text, true);
$$;

-- ============================================================
-- 1. Only super_admin can create projects
-- ============================================================
select pg_temp.impersonate('admin@test.local');
insert into public.projects (name) values ('RLS Test Project');

select pg_temp.impersonate('member@test.local');
do $$
begin
  insert into public.projects (name) values ('member should fail');
  raise exception 'FAIL: member created a project';
exception when insufficient_privilege or check_violation then
  raise notice 'OK: member cannot create projects';
end $$;

select pg_temp.impersonate('contractor@test.local');
do $$
begin
  insert into public.projects (name) values ('contractor should fail');
  raise exception 'FAIL: contractor created a project';
exception when insufficient_privilege or check_violation then
  raise notice 'OK: contractor cannot create projects';
end $$;

-- ============================================================
-- 2. Visibility: non-contributors see nothing; super_admin sees all
-- ============================================================
select pg_temp.impersonate('member@test.local');
do $$
declare n int;
begin
  select count(*) into n from public.projects;
  if n <> 0 then raise exception 'FAIL: member sees % projects without being a contributor', n; end if;
  raise notice 'OK: member sees no projects before being added';
end $$;

select pg_temp.impersonate('admin@test.local');
do $$
declare n int;
begin
  select count(*) into n from public.projects where name = 'RLS Test Project';
  if n <> 1 then raise exception 'FAIL: super_admin cannot see the project'; end if;
  raise notice 'OK: super_admin sees everything';
end $$;

-- Add member as project contributor; they should now see it,
-- plus every mini-project inside (inheritance).
insert into public.project_contributors (project_id, user_email)
  select id, 'member@test.local' from public.projects where name = 'RLS Test Project';
insert into public.mini_projects (project_id, name)
  select id, 'RLS Board' from public.projects where name = 'RLS Test Project';

select pg_temp.impersonate('member@test.local');
do $$
declare n int;
begin
  select count(*) into n from public.mini_projects where name = 'RLS Board';
  if n <> 1 then raise exception 'FAIL: project contributor cannot see inherited mini-project'; end if;
  raise notice 'OK: project contributor inherits mini-project visibility';
end $$;

-- Member (with access) can create a mini-project and add a contributor,
-- but cannot remove one.
insert into public.mini_projects (project_id, name)
  select id, 'Member Board' from public.projects where name = 'RLS Test Project';
insert into public.mini_project_contributors (mini_project_id, user_email)
  select id, 'contractor@test.local' from public.mini_projects where name = 'RLS Board';
do $$
declare n int;
begin
  delete from public.mini_project_contributors where user_email = 'contractor@test.local';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: member removed a contributor'; end if;
  raise notice 'OK: member cannot remove contributors (0 rows affected)';
end $$;

-- ============================================================
-- 3. Contractor task rights: create + edit own; not others'
-- ============================================================
select pg_temp.impersonate('contractor@test.local');
do $$
declare n int;
begin
  select count(*) into n from public.mini_projects;
  if n <> 1 then raise exception 'FAIL: contractor should see exactly the one board they were added to, saw %', n; end if;
  raise notice 'OK: contractor sees only their assigned board';
end $$;

insert into public.tasks (mini_project_id, title)
  select id, 'Contractor task' from public.mini_projects where name = 'RLS Board';

select pg_temp.impersonate('member@test.local');
insert into public.tasks (mini_project_id, title)
  select id, 'Member task' from public.mini_projects where name = 'RLS Board';

select pg_temp.impersonate('contractor@test.local');
do $$
declare n int;
begin
  -- contractor sees all tasks on the board...
  select count(*) into n from public.tasks;
  if n <> 2 then raise exception 'FAIL: contractor should see both tasks, saw %', n; end if;
  -- ...but can only update their own
  update public.tasks set priority = 'High' where title = 'Member task';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: contractor updated someone else''s task'; end if;
  update public.tasks set priority = 'High' where title = 'Contractor task';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: contractor could not update their own task'; end if;
  delete from public.tasks where title = 'Member task';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: contractor deleted someone else''s task'; end if;
  raise notice 'OK: contractor edits/deletes only their own tasks';
end $$;

-- ============================================================
-- 4. Comments are append-only
-- ============================================================
insert into public.task_comments (task_id, body)
  select id, 'first comment' from public.tasks where title = 'Contractor task';
do $$
declare n int;
begin
  update public.task_comments set body = 'edited' where body = 'first comment';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: comment was edited'; end if;
  delete from public.task_comments where body = 'first comment';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: comment was deleted'; end if;
  raise notice 'OK: comments are append-only';
end $$;

-- ============================================================
-- 5. Only super_admin deletes mini-projects/projects (cascade check)
-- ============================================================
select pg_temp.impersonate('member@test.local');
do $$
declare n int;
begin
  delete from public.mini_projects where name = 'RLS Board';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: member deleted a mini-project'; end if;
  raise notice 'OK: member cannot delete mini-projects';
end $$;

select pg_temp.impersonate('admin@test.local');
delete from public.projects where name = 'RLS Test Project';
do $$
declare n int;
begin
  select count(*) into n from public.tasks;
  if n <> 0 then raise exception 'FAIL: cascade delete left % tasks behind', n; end if;
  raise notice 'OK: project delete cascades to boards/tasks/comments';
end $$;

rollback;
