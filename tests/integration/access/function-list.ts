// Kept apart from the tests so coverage.itest.ts can import it without re-running them.
/**
 * Functions PostgREST exposes, and where each is exercised. coverage.itest.ts
 * fails when the database has a function that is not listed here.
 */
export const FUNCTIONS: Record<string, string> = {
  admin_add_allowed_email: "admin guard below",
  admin_remove_allowed_email: "admin guard below",
  admin_set_allowed_role: "admin guard below",
  admin_list_allowed_emails: "admin guard below",
  admin_delete_lead: "admin guard below",
  admin_rotate_card_token: "admin guard below",
  admin_card_event_rollup: "admin guard below",
  admin_get_section_access: "admin guard below",
  admin_set_user_section: "admin guard below",
  admin_set_role_section_default: "admin guard below",
  current_user_access: "current_user_access below",
  current_user_role: "current_user_access below (same source)",
  has_section: "scoped.itest.ts, through RLS",
  has_app_state_access: "tables.itest.ts, through app_state RLS",
  app_state_section: "tables.itest.ts, through app_state RLS",
  has_project_access: "tables.itest.ts and scoped.itest.ts, through task RLS",
  has_mini_project_access: "tables.itest.ts and scoped.itest.ts, through task RLS",
  list_team_directory: "directory below",
  generate_card_token: "anonymous refusal below",
  get_public_card: "public card below",
  record_card_event: "public card below",
  ingest_form_submission: "ingest below",
  ct_equal: "pure comparison helper; holds no data",
};
