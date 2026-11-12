-- 0020: let service_role run people_week_start().
--
-- people_daily_logs_guard() is SECURITY INVOKER, so it runs as whichever role
-- wrote the log. It calls people_week_start(), which 0018 granted only to
-- `authenticated`. The test suite's cleanup (and any future admin/service
-- tooling) writes logs as service_role, and it failed with
-- "permission denied for function people_week_start" whenever service_role
-- had no EXECUTE from default privileges (as in CI).
--
-- This pure date helper reads no data, so an explicit grant is safe. It does
-- not give service_role anything it could not already do: service_role
-- bypasses RLS. anon and PUBLIC stay revoked.

grant execute on function public.people_week_start(date) to service_role;
