import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { ProjectDetail } from "./ProjectDetail";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = createClient();
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
