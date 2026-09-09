import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/utils/supabase/role";
import { canCreateProject } from "@/lib/permissions";
import { CalculatorHeader } from "@/components/CalculatorHeader";
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
      <CalculatorHeader
        icon={FolderKanban}
        eyebrow="Task Management"
        title="Projects"
        aside={canCreateProject(role) && <NewProjectForm />}
      />

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
            className="block rounded-xl border border-line bg-white p-5 shadow-card transition-all duration-200 ease-out-strong [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-coir/40 [@media(hover:hover)]:hover:shadow-card-hover motion-reduce:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
          >
            <h2 className="text-lg font-semibold text-ink">{p.name}</h2>
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
