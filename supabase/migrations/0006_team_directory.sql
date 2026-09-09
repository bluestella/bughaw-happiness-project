-- Expose a safe, read-only slice of the invite allowlist so authenticated
-- users can pick an existing teammate when adding a project/mini-project
-- contributor, instead of typing a raw email. allowed_emails itself has RLS
-- enabled with no policies (service-role only) — this mirrors the
-- security-definer pattern already used by current_user_role() in
-- 0002_task_management.sql, and deliberately omits the `role` column.

create or replace function public.list_team_directory()
returns table (email text, note text)
language sql stable security definer set search_path = public
as $$
  select email, note from public.allowed_emails order by email;
$$;

grant execute on function public.list_team_directory() to authenticated;
