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

// Route/sidebar gating for /calculators, /tools, /saved
export function canAccessCalculators(role: Role | null): boolean {
  return role !== "contractor";
}
