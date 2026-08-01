"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  canAddContributor,
  canCreateMiniProject,
  canDeleteProjectOrMiniProject,
  canRemoveContributor,
  type Role,
} from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Project = { id: string; name: string; description: string; created_by_email: string | null };
type MiniProject = {
  id: string;
  name: string;
  description: string;
  created_by_email: string | null;
  created_at: string;
};
type Contributor = { user_email: string; added_by_email: string | null; created_at: string };

export function ProjectDetail({
  project,
  initialMiniProjects,
  initialContributors,
  role,
  userEmail,
}: {
  project: Project;
  initialMiniProjects: MiniProject[];
  initialContributors: Contributor[];
  role: Role | null;
  userEmail: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [miniProjects, setMiniProjects] = useState(initialMiniProjects);
  const [contributors, setContributors] = useState(initialContributors);

  const [mpFormOpen, setMpFormOpen] = useState(false);
  const [mpName, setMpName] = useState("");
  const [mpDescription, setMpDescription] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteMiniId, setDeleteMiniId] = useState<string | null>(null);

  async function createMiniProject(e: React.FormEvent) {
    e.preventDefault();
    if (!mpName.trim()) return;
    const { data, error } = await supabase
      .from("mini_projects")
      .insert({ project_id: project.id, name: mpName.trim(), description: mpDescription.trim() })
      .select("id, name, description, created_by_email, created_at")
      .single();
    if (error || !data) {
      toast.error("Could not create mini-project: " + (error?.message ?? "unknown error"));
      return;
    }
    setMiniProjects((prev) => [...prev, data as MiniProject]);
    setMpName("");
    setMpDescription("");
    setMpFormOpen(false);
    toast.success("Mini-project created.");
  }

  async function addContributor(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (contributors.some((c) => c.user_email.toLowerCase() === email)) {
      toast.message("Already a contributor.");
      return;
    }
    const { data, error } = await supabase
      .from("project_contributors")
      .insert({ project_id: project.id, user_email: email })
      .select("user_email, added_by_email, created_at")
      .single();
    if (error || !data) {
      toast.error("Could not add contributor: " + (error?.message ?? "unknown error"));
      return;
    }
    setContributors((prev) => [...prev, data as Contributor]);
    setNewEmail("");
    toast.success("Contributor added.");
  }

  async function removeContributor(email: string) {
    const prev = contributors;
    setContributors((c) => c.filter((x) => x.user_email !== email));
    const { error } = await supabase
      .from("project_contributors")
      .delete()
      .eq("project_id", project.id)
      .eq("user_email", email);
    if (error) {
      setContributors(prev);
      toast.error("Could not remove contributor: " + error.message);
    } else {
      toast.success("Contributor removed.");
    }
  }

  async function deleteMiniProject(id: string) {
    const prev = miniProjects;
    setMiniProjects((m) => m.filter((x) => x.id !== id));
    const { error } = await supabase.from("mini_projects").delete().eq("id", id);
    if (error) {
      setMiniProjects(prev);
      toast.error("Could not delete mini-project: " + error.message);
      throw new Error(error.message);
    }
    toast.success("Mini-project deleted.");
  }

  async function deleteProject() {
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      toast.error("Could not delete project: " + error.message);
      throw new Error(error.message);
    }
    router.push("/tasks");
    router.refresh();
    toast.success("Project deleted.");
  }

  return (
    <div>
      <Link href="/tasks" className="text-[12px] text-ink-soft hover:text-ink">
        ← All projects
      </Link>
      <div className="flex items-end justify-between gap-4 mt-2 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{project.name}</h1>
          {project.description && (
            <p className="text-[13px] text-ink-soft mt-1">{project.description}</p>
          )}
        </div>
        {canDeleteProjectOrMiniProject(role) && (
          <Button intent="danger" size="sm" onClick={() => setDeleteProjectOpen(true)}>
            Delete project
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-ink">Mini-projects</h2>
            {canCreateMiniProject(role) && (
              <Button intent="primary" size="sm" onClick={() => setMpFormOpen((v) => !v)}>
                + New Mini-Project
              </Button>
            )}
          </div>

          {mpFormOpen && (
            <form
              onSubmit={createMiniProject}
              className="border border-line rounded-xl bg-white p-4 mb-4 space-y-2.5"
            >
              <Input
                placeholder="Mini-project name"
                value={mpName}
                onChange={(e) => setMpName(e.target.value)}
                autoFocus
              />
              <Textarea
                placeholder="Description (optional)"
                rows={2}
                value={mpDescription}
                onChange={(e) => setMpDescription(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button intent="secondary" size="sm" type="button" onClick={() => setMpFormOpen(false)}>
                  Cancel
                </Button>
                <Button intent="primary" size="sm" type="submit" disabled={!mpName.trim()}>
                  Create
                </Button>
              </div>
            </form>
          )}

          {miniProjects.length === 0 && !mpFormOpen && (
            <div className="border border-dashed border-line rounded-xl p-8 text-center text-sm text-ink-soft">
              No mini-projects yet.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {miniProjects.map((mp) => (
              <div
                key={mp.id}
                className="border border-line rounded-xl bg-white p-4 hover:border-coir transition-colors relative"
              >
                <Link href={`/tasks/${project.id}/${mp.id}`} className="block">
                  <h3 className="font-semibold text-[14px] text-ink">{mp.name}</h3>
                  {mp.description && (
                    <p className="text-[12px] text-ink-soft mt-1 line-clamp-2">{mp.description}</p>
                  )}
                  <p className="font-mono text-[10px] text-ink-soft mt-2">
                    by {mp.created_by_email ?? "—"}
                  </p>
                </Link>
                {canDeleteProjectOrMiniProject(role) && (
                  <button
                    onClick={() => setDeleteMiniId(mp.id)}
                    className="absolute top-2.5 right-2.5 text-[11px] text-ink-soft hover:text-danger"
                    aria-label={`Delete ${mp.name}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="border border-line rounded-xl bg-white p-4 h-fit">
          <h2 className="font-display text-base font-semibold text-ink mb-1">Contributors</h2>
          <p className="text-[11px] text-ink-soft mb-3">
            Project contributors can see every mini-project inside this project.
          </p>
          <ul className="space-y-2 mb-3">
            {contributors.length === 0 && (
              <li className="text-[12px] text-ink-soft">No contributors yet.</li>
            )}
            {contributors.map((c) => (
              <li key={c.user_email} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] text-ink truncate">
                    {c.user_email}
                    {c.user_email.toLowerCase() === userEmail.toLowerCase() && (
                      <span className="text-ink-soft"> (you)</span>
                    )}
                  </p>
                  <p className="font-mono text-[10px] text-ink-soft truncate">
                    added by {c.added_by_email ?? "—"}
                  </p>
                </div>
                {canRemoveContributor(role) && (
                  <button
                    onClick={() => removeContributor(c.user_email)}
                    className="text-[11px] text-ink-soft hover:text-danger shrink-0"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canAddContributor(role) && (
            <form onSubmit={addContributor} className="flex gap-2">
              <Input
                type="email"
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Button intent="primary" size="sm" type="submit" disabled={!newEmail.trim()}>
                Add
              </Button>
            </form>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleteProjectOpen}
        onOpenChange={setDeleteProjectOpen}
        title="Delete project?"
        description={`Delete project "${project.name}" and everything inside it.`}
        confirmLabel="Delete project"
        onConfirm={deleteProject}
      />

      <ConfirmDialog
        open={deleteMiniId !== null}
        onOpenChange={(o) => !o && setDeleteMiniId(null)}
        title="Delete mini-project?"
        description="Delete this mini-project and all its tasks."
        confirmLabel="Delete mini-project"
        onConfirm={async () => {
          if (!deleteMiniId) return;
          await deleteMiniProject(deleteMiniId);
        }}
      />
    </div>
  );
}
