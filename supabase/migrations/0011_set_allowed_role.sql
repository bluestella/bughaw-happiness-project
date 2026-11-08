-- Let a super_admin change the role of an existing allowlist entry from the app.
-- Same posture as the other admin_* functions: security definer, re-checks the
-- caller's role (null-safe, per 0008), no anon access.
create or replace function public.admin_set_allowed_role(
  p_email text,
  p_role public.app_role
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can edit the allowlist.';
  end if;
  if p_role is null then
    raise exception 'Role is required.';
  end if;
  if lower(btrim(p_email)) = lower(auth.jwt() ->> 'email') then
    raise exception 'You cannot change your own role.';
  end if;
  update public.allowed_emails
     set role = p_role
   where lower(email) = lower(btrim(p_email));
  if not found then
    raise exception 'That email is not on the allowlist.';
  end if;
end;
$$;

revoke all on function public.admin_set_allowed_role(text, public.app_role) from public, anon;
grant execute on function public.admin_set_allowed_role(text, public.app_role) to authenticated;
