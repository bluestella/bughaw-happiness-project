import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import type { Task } from "@/lib/tasks";
import { Board } from "./Board";

export const dynamic = "force-dynamic";

export default async function MiniProjectPage({
  params,
}: {
  params: { projectId: string; miniProjectId: string };
}) {
  const supabase = createClient();
  const [{ data: miniProject }, role, userRes] = await Promise.all([
    supabase
      .from("mini_projects")
      .select("id, project_id, name, description")
      .eq("id", params.miniProjectId)
      .eq("project_id", params.projectId)
      .maybeSingle(),
    getCurrentUserRole(supabase),
    supabase.auth.getUser(),
  ]);

  if (!miniProject) notFound();

  const [
    { data: project },
    { data: tasks },
    { data: mpContributors },
    { data: projectContributors },
  ] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", miniProject.project_id).maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("mini_project_id", miniProject.id)
      .order("position", { ascending: true }),
    supabase
      .from("mini_project_contributors")
      .select("user_email, added_by_email")
      .eq("mini_project_id", miniProject.id),
    supabase
      .from("project_contributors")
      .select("user_email")
      .eq("project_id", miniProject.project_id),
  ]);

  return (
    <Board
      miniProject={miniProject}
      projectName={project?.name ?? "Project"}
      initialTasks={(tasks ?? []) as Task[]}
      initialScopedContributors={mpContributors ?? []}
      inheritedContributorEmails={(projectContributors ?? []).map((c) => c.user_email)}
      role={role}
      userEmail={userRes.data.user?.email ?? ""}
    />
  );
}
