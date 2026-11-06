// Users and fixture rows the specs rely on. Everything here is created AFTER the
// baseline snapshot, so global teardown deletes all of it (docs/ui-testing.md §1.1).
// Fixed UUIDs/tokens let specs navigate straight to fixtures.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Role = "super_admin" | "member" | "contractor";

export const PASSWORD = "e2e-Password-123";

export const USERS: Record<Role, { email: string; password: string }> = {
  super_admin: { email: "admin@test.local", password: PASSWORD },
  member: { email: "member@test.local", password: PASSWORD },
  contractor: { email: "contractor@test.local", password: PASSWORD },
};

/**
 * Member used only by the sign-out test: Supabase sign-out is global, so signing
 * out a shared role user would revoke the sessions every other spec reuses.
 */
export const SIGNOUT_USER = { email: "signout@test.local", password: PASSWORD };

/** Allowlisted in seed.sql but never registered — used by the signup test. */
export const UNREGISTERED_INVITEE = "newhire@test.local";

export const FIXTURES = {
  project: { id: "e2e00000-0000-4000-8000-000000000001", name: "[e2e] Fixture Project" },
  miniProject: { id: "e2e00000-0000-4000-8000-000000000002", name: "[e2e] Fixture Board" },
  memberTask: { id: "e2e00000-0000-4000-8000-000000000003", title: "[e2e] Member task" },
  contractorTask: { id: "e2e00000-0000-4000-8000-000000000004", title: "[e2e] Contractor task" },
  /** A project the contractor is NOT on (TC-RBAC-06). */
  privateProject: { id: "e2e00000-0000-4000-8000-000000000005", name: "[e2e] Members-only Project" },
  leads: [
    { id: "e2e00000-0000-4000-8000-000000000011", contactId: "e2e00000-0000-4000-8000-000000000021", name: "[e2e] Lead New", email: "lead-new@test.local", status: "New" },
    { id: "e2e00000-0000-4000-8000-000000000012", contactId: "e2e00000-0000-4000-8000-000000000022", name: "[e2e] Lead Qualified", email: "lead-qualified@test.local", status: "Qualified" },
    { id: "e2e00000-0000-4000-8000-000000000013", contactId: "e2e00000-0000-4000-8000-000000000023", name: "[e2e] Lead Won", email: "lead-won@test.local", status: "Closed Won" },
  ],
  publishedCard: { id: "e2e00000-0000-4000-8000-000000000031", token: "E2Epublished", name: "[e2e] Published Person" },
  draftCard: { id: "e2e00000-0000-4000-8000-000000000032", token: "E2EdraftCard", name: "[e2e] Draft Person" },
  /** Valid-format token that no card holds — what a rotated-away link looks like. */
  rotatedAwayToken: "E2ErotatedOl",
} as const;

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(`[e2e seed] ${label}: ${error.message}`);
  return data;
}

export async function seedUsers(db: SupabaseClient) {
  for (const { email, password } of [...Object.values(USERS), SIGNOUT_USER]) {
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error && !/already been registered|already exists/i.test(error.message)) {
      throw new Error(`[e2e seed] create user ${email}: ${error.message}`);
    }
  }
}

export async function seedFixtures(db: SupabaseClient) {
  const { project, miniProject, memberTask, contractorTask, privateProject, leads } = FIXTURES;
  const admin = USERS.super_admin.email;
  const member = USERS.member.email;
  const contractor = USERS.contractor.email;

  await must("projects", db.from("projects").insert([
    { id: project.id, name: project.name, created_by_email: admin },
    { id: privateProject.id, name: privateProject.name, created_by_email: admin },
  ]));
  await must("project_contributors", db.from("project_contributors").insert([
    { project_id: project.id, user_email: member, added_by_email: admin },
    { project_id: project.id, user_email: contractor, added_by_email: admin },
    { project_id: privateProject.id, user_email: member, added_by_email: admin },
  ]));
  await must("mini_projects", db.from("mini_projects").insert({
    id: miniProject.id, project_id: project.id, name: miniProject.name, created_by_email: admin,
  }));
  await must("tasks", db.from("tasks").insert([
    { id: memberTask.id, mini_project_id: miniProject.id, title: memberTask.title, status: "To Do", position: 1000, created_by_email: member },
    { id: contractorTask.id, mini_project_id: miniProject.id, title: contractorTask.title, status: "To Do", position: 2000, created_by_email: contractor },
  ]));

  await must("crm_contacts", db.from("crm_contacts").insert(
    leads.map((l) => ({ id: l.contactId, full_name: l.name, email: l.email }))
  ));
  await must("crm_leads", db.from("crm_leads").insert(
    leads.map((l, i) => ({
      id: l.id, contact_id: l.contactId, origin_form: "manual", lead_type: "general",
      status: l.status, position: (i + 1) * 1000, description: "Seeded by the E2E suite.",
    }))
  ));

  const { publishedCard, draftCard } = FIXTURES;
  await must("business_cards", db.from("business_cards").insert([
    {
      id: publishedCard.id, token: publishedCard.token, status: "published",
      full_name: publishedCard.name, job_title: "Test Engineer", email: "published@test.local",
      website_url: "https://bughawinnovations.ph", created_by_email: admin,
    },
    {
      id: draftCard.id, token: draftCard.token, status: "draft",
      full_name: draftCard.name, job_title: "Draft Only", email: "",
      website_url: "", created_by_email: admin,
    },
  ]));
}
