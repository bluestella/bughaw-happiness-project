// The column list behind CrmLeadRow. Shared by the server page and by the
// client components that read a freshly written lead back.
export const LEAD_ROW_SELECT = `
  id, contact_id, account_id, origin_form, lead_type, status, position, source,
  product_interests, product_of_interest, estimated_volume, description,
  engagement_tier, ga_client_id, attribution, engagement, geo, raw,
  pipeline_account_id, submitted_at, created_at, updated_at,
  crm_contacts ( id, full_name, email, job_title ),
  crm_accounts ( id, name, kind, hotel_star_rating, hotel_room_count_band )
`;
