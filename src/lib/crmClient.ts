// Browser-side write path for leads that do NOT arrive through the ingest API
// (manual entry and CSV import). Submissions from the marketing site go through
// public.ingest_form_submission instead — see src/app/api/crm/ingest/route.ts.
//
// The dedupe rules here mirror that function exactly (FORMS_AUDIT §10.2):
// account on the normalized name, contact on the normalized email.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  accountKey,
  emailKey,
  normalizeSubmission,
  type OriginForm,
  type SubmissionBody,
  type SubmissionForm,
} from "@/lib/crm";

export type CreateLeadResult = {
  leadId: string;
  contactId: string;
  accountId: string | null;
  contactExisted: boolean;
};

async function upsertAccount(
  supabase: SupabaseClient,
  account: NonNullable<ReturnType<typeof normalizeSubmission>["account"]>
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from("crm_accounts")
    .select("id, industry, hotel_star_rating, hotel_room_count_band, kind")
    .eq("name_key", accountKey(account.name))
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existing) {
    // Only fill in blanks — never overwrite what the team has curated.
    const patch: Record<string, string> = {};
    if (existing.industry === "" && account.industry !== "") patch.industry = account.industry;
    if (account.hotel_star_rating !== "") patch.hotel_star_rating = account.hotel_star_rating;
    if (account.hotel_room_count_band !== "")
      patch.hotel_room_count_band = account.hotel_room_count_band;
    if (existing.kind === "company" && account.kind === "hotel") patch.kind = account.kind;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("crm_accounts").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("crm_accounts")
    .insert({
      name: account.name,
      kind: account.kind,
      industry: account.industry,
      hotel_star_rating: account.hotel_star_rating,
      hotel_room_count_band: account.hotel_room_count_band,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the account.");
  return data.id as string;
}

async function upsertContact(
  supabase: SupabaseClient,
  contact: ReturnType<typeof normalizeSubmission>["contact"],
  accountId: string | null
): Promise<{ id: string; existed: boolean }> {
  const { data: existing, error: findError } = await supabase
    .from("crm_contacts")
    .select("id, full_name, job_title, account_id")
    .eq("email_key", emailKey(contact.email))
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existing) {
    const patch: Record<string, string> = {};
    if (contact.full_name !== "" && existing.full_name === "") patch.full_name = contact.full_name;
    if (contact.job_title !== "" && existing.job_title === "") patch.job_title = contact.job_title;
    if (accountId && !existing.account_id) patch.account_id = accountId;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("crm_contacts").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return { id: existing.id as string, existed: true };
  }

  const { data, error } = await supabase
    .from("crm_contacts")
    .insert({
      account_id: accountId,
      full_name: contact.full_name,
      email: contact.email.trim(),
      job_title: contact.job_title,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the contact.");
  return { id: data.id as string, existed: false };
}

/** Does this email already have a contact row? Used by the import dry-run. */
export async function findExistingContactEmails(
  supabase: SupabaseClient,
  emails: string[]
): Promise<Set<string>> {
  const keys = Array.from(new Set(emails.map(emailKey).filter((e) => e !== "")));
  if (keys.length === 0) return new Set();
  const { data, error } = await supabase
    .from("crm_contacts")
    .select("email_key")
    .in("email_key", keys);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.email_key as string));
}

export async function createLeadFromSubmission(
  supabase: SupabaseClient,
  form: SubmissionForm,
  body: SubmissionBody,
  originForm: OriginForm
): Promise<CreateLeadResult> {
  const { account, contact, lead } = normalizeSubmission(form, body, originForm);

  const accountId = account ? await upsertAccount(supabase, account) : null;
  const { id: contactId, existed } = await upsertContact(supabase, contact, accountId);

  const { data, error } = await supabase
    .from("crm_leads")
    .insert({
      contact_id: contactId,
      account_id: accountId,
      origin_form: lead.origin_form,
      lead_type: lead.lead_type,
      source: lead.source,
      product_interests: lead.product_interests,
      product_of_interest: lead.product_of_interest,
      estimated_volume: lead.estimated_volume,
      description: lead.description,
      engagement_tier: lead.engagement_tier,
      ga_client_id: lead.ga_client_id,
      attribution: lead.attribution,
      engagement: lead.engagement,
      geo: lead.geo,
      raw: body,
      position: Date.now() / 1000,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the lead.");

  const leadId = data.id as string;
  await supabase.from("crm_lead_activities").insert({
    lead_id: leadId,
    kind: "system",
    body: originForm === "import" ? "Imported" : "Added manually",
    to_status: "New",
  });

  return { leadId, contactId, accountId, contactExisted: existed };
}
