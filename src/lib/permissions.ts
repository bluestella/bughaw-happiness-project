// Pure permission helpers mirroring the RLS policies in
// supabase/migrations/0002_task_management.sql. These gate UI affordances only —
// RLS is the actual security boundary.

export type Role = "super_admin" | "member" | "contractor";

// projects insert policy
export function canCreateProject(role: Role | null): boolean {
  return role === "super_admin";
}

// mini_projects insert policy (access to the parent project is checked by RLS)
export function canCreateMiniProject(role: Role | null): boolean {
  return role === "super_admin" || role === "member";
}

// tasks insert policy — any role, given mini-project access
export function canCreateTask(role: Role | null): boolean {
  return role !== null;
}

// project_contributors / mini_project_contributors insert policies
export function canAddContributor(role: Role | null): boolean {
  return role === "super_admin" || role === "member";
}

// contributor delete policies
export function canRemoveContributor(role: Role | null): boolean {
  return role === "super_admin";
}

// tasks update/delete policies
export function canEditOrDeleteTask(
  role: Role | null,
  task: { created_by_email: string },
  userEmail: string
): boolean {
  if (role === "super_admin" || role === "member") return true;
  if (role === "contractor") {
    return task.created_by_email.toLowerCase() === userEmail.toLowerCase();
  }
  return false;
}

// projects delete / mini_projects delete policies
export function canDeleteProjectOrMiniProject(role: Role | null): boolean {
  return role === "super_admin";
}

// Which sections/pages a person can open (CRM, calculators, saved, tasks,
// each tool) is per-person data since 0010_section_access.sql — see
// src/lib/access.ts. The helpers below cover what a role may do *inside* a
// section it can see.

// crm_* insert/update policies (0010): anyone who can see the CRM may work it.
// Callers only render the CRM for people with the 'crm' section.
export function canEditLead(role: Role | null): boolean {
  return role !== null;
}

// crm_* delete policies
export function canDeleteLead(role: Role | null): boolean {
  return role === "super_admin";
}

// public.allowed_emails — managed only via the admin_* RPCs in
// 0007_manage_allowlist.sql, which enforce super_admin server-side too.
export function canManageAllowlist(role: Role | null): boolean {
  return role === "super_admin";
}

// public.business_cards / business_card_events — RLS in
// 0009_digital_cards.sql grants super_admin only. The card admin section and
// its analytics are one super_admin-only area at /admin/cards.
export function canManageCards(role: Role | null): boolean {
  return role === "super_admin";
}

// public.app_sections / role_section_defaults / user_section_overrides —
// edited only through the admin_* RPCs in 0010_section_access.sql, which
// enforce super_admin server-side too.
export function canManageAccess(role: Role | null): boolean {
  return role === "super_admin";
}
