import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { ProjectDetail } from "./ProjectDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: {
    params: Promise<{ projectId: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", params.projectId)
    .maybeSingle();
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
  const supabase = await createClient();
  const [{ data: project }, role, userRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, created_by_email")
      .eq("id", params.projectId)
      .maybeSingle(),
    getCurrentUserRole(supabase),
    supabase.auth.getUser(),
  ]);

  if (!project) notFound();

  const [{ data: miniProjects }, { data: contributors }] = await Promise.all([
    supabase
      .from("mini_projects")
      .select("id, name, description, created_by_email, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_contributors")
      .select("user_email, added_by_email, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <ProjectDetail
      project={project}
      initialMiniProjects={miniProjects ?? []}
      initialContributors={contributors ?? []}
      role={role}
      userEmail={userRes.data.user?.email ?? ""}
    />
  );
}
