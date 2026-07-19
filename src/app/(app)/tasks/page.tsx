import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canCreateProject } from "@/lib/permissions";
import { NewProjectForm } from "./NewProjectForm";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const supabase = createClient();
  const role = await getCurrentUserRole(supabase);

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, created_by_email, created_at")
    .order("created_at", { ascending: true });

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-coir-dark">
            Task Management
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Projects</h1>
        </div>
        {canCreateProject(role) && <NewProjectForm />}
      </div>

      {(!projects || projects.length === 0) && (
        <div className="border border-dashed border-line rounded-xl p-10 text-center text-sm text-ink-soft">
          {role === "super_admin"
            ? "No projects yet. Create the first one to get started."
            : "No projects yet — you'll see projects here once you're added as a contributor."}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(projects ?? []).map((p) => (
          <Link
            key={p.id}
            href={`/tasks/${p.id}`}
            className="block border border-line rounded-xl bg-white p-5 hover:border-coir transition-colors"
          >
            <h2 className="font-display text-lg font-semibold text-ink">{p.name}</h2>
            {p.description && (
              <p className="text-[13px] text-ink-soft mt-1 line-clamp-2">{p.description}</p>
            )}
            <p className="font-mono text-[10px] text-ink-soft mt-3">
              Created by {p.created_by_email ?? "—"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
