import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getAccess, getSessionUser, getSupabase } from "@/lib/session";
import type { Task } from "@/lib/tasks";
import { Board } from "./Board";

export const dynamic = "force-dynamic";

/** Shared by generateMetadata and the page so each row is read once per request. */
const getMiniProject = cache(async (projectId: string, miniProjectId: string) => {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("mini_projects")
    .select("id, project_id, name, description")
    .eq("id", miniProjectId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
});

const getProjectName = cache(async (projectId: string) => {
  const supabase = await getSupabase();
  const { data } = await supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle();
  return data;
});

export async function generateMetadata(
  props: {
    params: Promise<{ projectId: string; miniProjectId: string }>;
  }
): Promise<Metadata> {
  const { projectId, miniProjectId } = await props.params;
  const [miniProject, project] = await Promise.all([
    getMiniProject(projectId, miniProjectId),
    getProjectName(projectId),
  ]);
  const boardName = miniProject?.name ?? "Board";
  const parentName = project?.name ?? "Project";
  return {
    title: `${boardName} · ${parentName}`,
    description: `Kanban board for ${boardName} under the ${parentName} project.`,
  };
}

export default async function MiniProjectPage(
  props: {
    params: Promise<{ projectId: string; miniProjectId: string }>;
  }
) {
  const params = await props.params;
  const supabase = await getSupabase();
  const { projectId, miniProjectId } = params;
  // One round trip: every query is keyed by the URL. If the board is not in
  // this project, getMiniProject returns null and the page 404s.
  const [
    miniProject,
    project,
    access,
    user,
    { data: tasks },
    { data: mpContributors },
    { data: projectContributors },
  ] = await Promise.all([
    getMiniProject(projectId, miniProjectId),
    getProjectName(projectId),
    getAccess(),
    getSessionUser(),
    supabase
      .from("tasks")
      .select("*")
      .eq("mini_project_id", miniProjectId)
      .order("position", { ascending: true }),
    supabase
      .from("mini_project_contributors")
      .select("user_email, added_by_email")
      .eq("mini_project_id", miniProjectId),
    supabase.from("project_contributors").select("user_email").eq("project_id", projectId),
  ]);

  if (!miniProject) notFound();

  return (
    <Board
      miniProject={miniProject}
      projectName={project?.name ?? "Project"}
      initialTasks={(tasks ?? []) as Task[]}
      initialScopedContributors={mpContributors ?? []}
      inheritedContributorEmails={(projectContributors ?? []).map((c) => c.user_email)}
      role={access.role}
      userEmail={user?.email ?? ""}
    />
  );
}
