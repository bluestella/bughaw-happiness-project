-- Bughaw Calculators Hub — task management (projects / mini-projects / tasks)
-- Run this in the Supabase SQL editor (or `supabase db push`) AFTER 0001_init.sql.
--
-- ACTION REQUIRED before running: review public.allowed_emails and decide the
-- role for every row. Everyone defaults to 'member'; add extra `update`
-- statements below for anyone who should be 'super_admin' or 'contractor'.

-- ============================================================
-- 1. Roles on the invite allowlist
-- ============================================================
create type public.app_role as enum ('super_admin', 'member', 'contractor');

alter table public.allowed_emails
  add column role public.app_role not null default 'member';

update public.allowed_emails
  set role = 'super_admin'
  where lower(email) = 'soltairefawkes@gmail.com';

-- ============================================================
-- 2. Role lookup + access-check helpers
--    allowed_emails has no RLS policies (service-role only), so clients
--    read their own role through this security-definer function.
-- ============================================================
create or replace function public.current_user_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.allowed_emails
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;
grant execute on function public.current_user_role() to authenticated;

-- ============================================================
-- 3. Core tables
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mini_projects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mini_projects_project_id_idx on public.mini_projects(project_id);

create table public.project_contributors (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_email text not null,
  added_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  primary key (project_id, user_email)
);
create index project_contributors_email_idx on public.project_contributors(user_email);

create table public.mini_project_contributors (
  mini_project_id uuid not null references public.mini_projects(id) on delete cascade,
  user_email text not null,
  added_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  primary key (mini_project_id, user_email)
);
create index mini_project_contributors_email_idx on public.mini_project_contributors(user_email);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  mini_project_id uuid not null references public.mini_projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'To Do' check (status in ('To Do','In Progress','Done')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  due_date date,
  assignee_email text,
  position double precision not null default 0,
  created_by_email text not null default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_mini_project_id_idx on public.tasks(mini_project_id);
create index tasks_status_idx on public.tasks(mini_project_id, status);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  body text not null,
  author_email text not null default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index task_comments_task_id_idx on public.task_comments(task_id);

-- ============================================================
-- 4. Access-check functions (defined after the tables they read)
-- ============================================================
create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_contributors pc
    where pc.project_id = p_project_id
      and lower(pc.user_email) = lower(auth.jwt() ->> 'email')
  );
$$;
grant execute on function public.has_project_access(uuid) to authenticated;

-- Direct-or-inherited access: mini-project contributor OR contributor
-- on its parent project.
create or replace function public.has_mini_project_access(p_mini_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.mini_project_contributors mpc
    where mpc.mini_project_id = p_mini_project_id
      and lower(mpc.user_email) = lower(auth.jwt() ->> 'email')
  )
  or exists (
    select 1
    from public.mini_projects mp
    join public.project_contributors pc on pc.project_id = mp.project_id
    where mp.id = p_mini_project_id
      and lower(pc.user_email) = lower(auth.jwt() ->> 'email')
  );
$$;
grant execute on function public.has_mini_project_access(uuid) to authenticated;

-- ============================================================
-- 5. RLS
-- ============================================================
alter table public.projects enable row level security;
alter table public.mini_projects enable row level security;
alter table public.project_contributors enable row level security;
alter table public.mini_project_contributors enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;

-- projects: super_admin sees/administers all; others only if a contributor
create policy "projects select" on public.projects for select to authenticated
  using (public.current_user_role() = 'super_admin' or public.has_project_access(id));
create policy "projects insert" on public.projects for insert to authenticated
  with check (public.current_user_role() = 'super_admin');
create policy "projects update" on public.projects for update to authenticated
  using (public.current_user_role() = 'super_admin');
create policy "projects delete" on public.projects for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- mini_projects
create policy "mini_projects select" on public.mini_projects for select to authenticated
  using (public.current_user_role() = 'super_admin' or public.has_mini_project_access(id));
create policy "mini_projects insert" on public.mini_projects for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'member' and public.has_project_access(project_id))
  );
create policy "mini_projects update" on public.mini_projects for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'member' and public.has_mini_project_access(id))
  );
create policy "mini_projects delete" on public.mini_projects for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- project_contributors: add = super_admin/member (with project access);
-- remove = super_admin only
create policy "project_contributors select" on public.project_contributors for select to authenticated
  using (public.current_user_role() = 'super_admin' or public.has_project_access(project_id));
create policy "project_contributors insert" on public.project_contributors for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'member' and public.has_project_access(project_id))
  );
create policy "project_contributors delete" on public.project_contributors for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- mini_project_contributors: same shape
create policy "mini_project_contributors select" on public.mini_project_contributors for select to authenticated
  using (public.current_user_role() = 'super_admin' or public.has_mini_project_access(mini_project_id));
create policy "mini_project_contributors insert" on public.mini_project_contributors for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'member' and public.has_mini_project_access(mini_project_id))
  );
create policy "mini_project_contributors delete" on public.mini_project_contributors for delete to authenticated
  using (public.current_user_role() = 'super_admin');

-- tasks: anyone with access reads/creates; contractor edits/deletes only own tasks
create policy "tasks select" on public.tasks for select to authenticated
  using (public.current_user_role() = 'super_admin' or public.has_mini_project_access(mini_project_id));
create policy "tasks insert" on public.tasks for insert to authenticated
  with check (public.current_user_role() = 'super_admin' or public.has_mini_project_access(mini_project_id));
create policy "tasks update" on public.tasks for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'member' and public.has_mini_project_access(mini_project_id))
    or (public.current_user_role() = 'contractor'
        and public.has_mini_project_access(mini_project_id)
        and lower(created_by_email) = lower(auth.jwt() ->> 'email'))
  );
create policy "tasks delete" on public.tasks for delete to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'member' and public.has_mini_project_access(mini_project_id))
    or (public.current_user_role() = 'contractor'
        and public.has_mini_project_access(mini_project_id)
        and lower(created_by_email) = lower(auth.jwt() ->> 'email'))
  );

-- task_comments: read/write for anyone with access to the parent task's
-- mini-project; no update/delete policies => append-only log.
create policy "task_comments select" on public.task_comments for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or exists (select 1 from public.tasks t where t.id = task_id and public.has_mini_project_access(t.mini_project_id))
  );
create policy "task_comments insert" on public.task_comments for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or exists (select 1 from public.tasks t where t.id = task_id and public.has_mini_project_access(t.mini_project_id))
  );
