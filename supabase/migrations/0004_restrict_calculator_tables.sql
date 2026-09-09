-- Bughaw Calculators Hub — close a broken-access-control gap
-- Run this in the Supabase SQL editor (or `supabase db push`) AFTER 0003_crm.sql.
--
-- pipeline_accounts / app_state / saved_calculations were created in
-- 0001_init.sql with "any authenticated user, full access" policies, back
-- before the contractor role existed. src/lib/permissions.ts#canAccessCalculators
-- and src/middleware.ts already hide /calculators, /tools, /saved and /
-- from contractors — but that is UI-only. Because these three tables have no
-- role check, a contractor can still read/write/delete sales-pipeline and
-- calculator data directly through the Supabase client with their own
-- session (same anon key + JWT the app itself uses), bypassing the intended
-- restriction entirely. Tighten the policies to match the UI gate: any
-- signed-in user who is not a contractor.

drop policy "team read"   on public.pipeline_accounts;
drop policy "team write"  on public.pipeline_accounts;
drop policy "team update" on public.pipeline_accounts;
drop policy "team delete" on public.pipeline_accounts;

create policy "non-contractor read" on public.pipeline_accounts for select to authenticated
  using (public.current_user_role() <> 'contractor');
create policy "non-contractor write" on public.pipeline_accounts for insert to authenticated
  with check (public.current_user_role() <> 'contractor');
create policy "non-contractor update" on public.pipeline_accounts for update to authenticated
  using (public.current_user_role() <> 'contractor');
create policy "non-contractor delete" on public.pipeline_accounts for delete to authenticated
  using (public.current_user_role() <> 'contractor');

drop policy "team read"   on public.app_state;
drop policy "team write"  on public.app_state;
drop policy "team update" on public.app_state;
drop policy "team delete" on public.app_state;

create policy "non-contractor read" on public.app_state for select to authenticated
  using (public.current_user_role() <> 'contractor');
create policy "non-contractor write" on public.app_state for insert to authenticated
  with check (public.current_user_role() <> 'contractor');
create policy "non-contractor update" on public.app_state for update to authenticated
  using (public.current_user_role() <> 'contractor');
create policy "non-contractor delete" on public.app_state for delete to authenticated
  using (public.current_user_role() <> 'contractor');

drop policy "team read"  on public.saved_calculations;
drop policy "team write" on public.saved_calculations;
drop policy "team delete" on public.saved_calculations;

create policy "non-contractor read" on public.saved_calculations for select to authenticated
  using (public.current_user_role() <> 'contractor');
create policy "non-contractor write" on public.saved_calculations for insert to authenticated
  with check (public.current_user_role() <> 'contractor');
create policy "non-contractor delete" on public.saved_calculations for delete to authenticated
  using (public.current_user_role() <> 'contractor');
