-- Let a super_admin manage the invite allowlist (public.allowed_emails) from
-- the app instead of the Supabase SQL editor. allowed_emails has RLS enabled
-- with no policies (service-role only), so all access goes through these
-- security-definer functions, which re-check the caller's role themselves —
-- same pattern as current_user_role() in 0002_task_management.sql.

create or replace function public.admin_list_allowed_emails()
returns table (email text, note text, role public.app_role, added_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.current_user_role() <> 'super_admin' then
    raise exception 'Only a super_admin can view the allowlist.';
  end if;
  return query
    select a.email, a.note, a.role, a.added_at
    from public.allowed_emails a
    order by a.added_at desc;
end;
$$;
grant execute on function public.admin_list_allowed_emails() to authenticated;

create or replace function public.admin_add_allowed_email(
  p_email text,
  p_note text default '',
  p_role public.app_role default 'member'
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() <> 'super_admin' then
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
grant execute on function public.admin_add_allowed_email(text, text, public.app_role) to authenticated;

create or replace function public.admin_remove_allowed_email(p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() <> 'super_admin' then
    raise exception 'Only a super_admin can edit the allowlist.';
  end if;
  if lower(btrim(p_email)) = lower(auth.jwt() ->> 'email') then
    raise exception 'You cannot remove your own access.';
  end if;
  delete from public.allowed_emails where lower(email) = lower(btrim(p_email));
end;
$$;
grant execute on function public.admin_remove_allowed_email(text) to authenticated;
