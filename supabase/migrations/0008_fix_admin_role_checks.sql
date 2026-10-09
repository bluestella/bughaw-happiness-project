-- SECURITY FIX — run AFTER 0007_manage_allowlist.sql, as soon as possible.
--
-- The admin_* functions in 0007 guarded themselves with
--     if public.current_user_role() <> 'super_admin' then raise ...
-- For a caller with no allowlist row — including the anonymous role used by
-- anyone holding the public anon key — current_user_role() is NULL, and
-- NULL <> 'super_admin' is NULL, so the guard never fired. Postgres grants
-- EXECUTE on new functions to PUBLIC by default, and 0007 never revoked it, so
-- an anonymous caller could list the allowlist or add an email (with any role)
-- through /rest/v1/rpc/admin_*.
--
-- Fix, in depth:
--   1. Null-safe guards (`is distinct from`), so a NULL role is refused.
--   2. Revoke EXECUTE from PUBLIC and anon on every admin_* function and on
--      list_team_directory() (0006), leaving only `authenticated`.

create or replace function public.admin_list_allowed_emails()
returns table (email text, note text, role public.app_role, added_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can view the allowlist.';
  end if;
  return query
    select a.email, a.note, a.role, a.added_at
    from public.allowed_emails a
    order by a.added_at desc;
end;
$$;

create or replace function public.admin_add_allowed_email(
  p_email text,
  p_note text default '',
  p_role public.app_role default 'member'
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can add to the allowlist.';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required.';
  end if;
  insert into public.allowed_emails (email, note, role)
  values (lower(btrim(p_email)), coalesce(p_note, ''), p_role)
  on conflict (email) do update
    set note = coalesce(excluded.note, public.allowed_emails.note),
        role = excluded.role;
end;
$$;

create or replace function public.admin_remove_allowed_email(p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can edit the allowlist.';
  end if;
  if lower(btrim(p_email)) = lower(auth.jwt() ->> 'email') then
    raise exception 'You cannot remove your own access.';
  end if;
  delete from public.allowed_emails where lower(email) = lower(btrim(p_email));
end;
$$;

revoke all on function public.admin_list_allowed_emails() from public, anon;
revoke all on function public.admin_add_allowed_email(text, text, public.app_role) from public, anon;
revoke all on function public.admin_remove_allowed_email(text) from public, anon;
revoke all on function public.list_team_directory() from public, anon;

grant execute on function public.admin_list_allowed_emails() to authenticated;
grant execute on function public.admin_add_allowed_email(text, text, public.app_role) to authenticated;
grant execute on function public.admin_remove_allowed_email(text) to authenticated;
grant execute on function public.list_team_directory() to authenticated;
