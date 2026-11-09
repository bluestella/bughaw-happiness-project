-- Let a super_admin permanently remove a CRM lead and everything that exists
-- only because of it, in one transaction.
--
-- Removed:
--   * the lead (crm_lead_activities go with it via ON DELETE CASCADE)
--   * its contact, if no other lead still points at that contact
--   * its account, if no other lead or contact still points at that account
--   * its promoted pipeline_accounts row, if no other lead links to it
-- Contacts/accounts are deduped across leads at ingest, so they are shared and
-- are only removed once orphaned. Same posture as the other admin_* functions:
-- security definer, null-safe super_admin re-check (0008), no anon access.
create or replace function public.admin_delete_lead(p_lead_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_contact  uuid;
  v_account  uuid;
  v_pipeline uuid;
  v_activities int := 0;
  v_contact_deleted boolean := false;
  v_account_deleted boolean := false;
  v_pipeline_deleted boolean := false;
begin
  if public.current_user_role() is distinct from 'super_admin' then
    raise exception 'Only a super_admin can delete leads.';
  end if;

  select contact_id, account_id, pipeline_account_id
    into v_contact, v_account, v_pipeline
    from public.crm_leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found.';
  end if;

  select count(*) into v_activities
    from public.crm_lead_activities where lead_id = p_lead_id;

  delete from public.crm_leads where id = p_lead_id;

  if v_contact is not null
     and not exists (select 1 from public.crm_leads where contact_id = v_contact) then
    delete from public.crm_contacts where id = v_contact;
    v_contact_deleted := true;
  end if;

  if v_account is not null
     and not exists (select 1 from public.crm_leads where account_id = v_account)
     and not exists (select 1 from public.crm_contacts where account_id = v_account) then
    delete from public.crm_accounts where id = v_account;
    v_account_deleted := true;
  end if;

  if v_pipeline is not null
     and not exists (select 1 from public.crm_leads where pipeline_account_id = v_pipeline) then
    delete from public.pipeline_accounts where id = v_pipeline;
    v_pipeline_deleted := true;
  end if;

  return jsonb_build_object(
    'lead', 1,
    'activities', v_activities,
    'contact', v_contact_deleted,
    'account', v_account_deleted,
    'pipeline_account', v_pipeline_deleted
  );
end;
$$;

revoke all on function public.admin_delete_lead(uuid) from public, anon;
grant execute on function public.admin_delete_lead(uuid) to authenticated;
