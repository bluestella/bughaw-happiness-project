import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getAccess, getSessionUser, getSupabase } from "@/lib/session";
import { ProjectDetail } from "./ProjectDetail";

export const dynamic = "force-dynamic";

/** Shared by generateMetadata and the page so the row is read once per request. */
const getProject = cache(async (projectId: string) => {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("projects")
    .select("id, name, description, created_by_email")
    .eq("id", projectId)
    .maybeSingle();
  return data;
});

export async function generateMetadata(
  props: {
    params: Promise<{ projectId: string }>;
  }
): Promise<Metadata> {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  return {
    title: project ? `${project.name} · Projects` : "Project",
    description: project
      ? `Kanban boards and mini-projects for the ${project.name} project.`
      : "Bughaw Suite project.",
  };
}

export default async function ProjectPage(
  props: {
    params: Promise<{ projectId: string }>;
  }
) {
  const params = await props.params;
  const supabase = await getSupabase();
  const { projectId } = params;
  // One round trip: every query is keyed by the URL's projectId.
  const [project, access, user, { data: miniProjects }, { data: contributors }] =
    await Promise.all([
      getProject(projectId),
      getAccess(),
      getSessionUser(),
      supabase
        .from("mini_projects")
        .select("id, name, description, created_by_email, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("project_contributors")
        .select("user_email, added_by_email, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
    ]);

  if (!project) notFound();

  return (
    <ProjectDetail
      project={project}
      initialMiniProjects={miniProjects ?? []}
      initialContributors={contributors ?? []}
      role={access.role}
      userEmail={user?.email ?? ""}
    />
  );
}
