"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  canAddContributor,
  canCreateMiniProject,
  canDeleteProjectOrMiniProject,
  canRemoveContributor,
  type Role,
} from "@/lib/permissions";

type Project = { id: string; name: string; description: string; created_by_email: string | null };
type MiniProject = {
  id: string;
  name: string;
  description: string;
  created_by_email: string | null;
  created_at: string;
};
type Contributor = { user_email: string; added_by_email: string | null; created_at: string };

const inputCls =
  "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white";

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
  const [status, setStatus] = useState("");

  const [mpFormOpen, setMpFormOpen] = useState(false);
  const [mpName, setMpName] = useState("");
  const [mpDescription, setMpDescription] = useState("");
  const [newEmail, setNewEmail] = useState("");

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(""), 3000);
  }

  async function createMiniProject(e: React.FormEvent) {
    e.preventDefault();
    if (!mpName.trim()) return;
    const { data, error } = await supabase
      .from("mini_projects")
      .insert({ project_id: project.id, name: mpName.trim(), description: mpDescription.trim() })
      .select("id, name, description, created_by_email, created_at")
      .single();
    if (error || !data) {
      flash("Could not create mini-project: " + (error?.message ?? "unknown error"));
      return;
    }
    setMiniProjects((prev) => [...prev, data as MiniProject]);
    setMpName("");
    setMpDescription("");
    setMpFormOpen(false);
  }

  async function addContributor(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (contributors.some((c) => c.user_email.toLowerCase() === email)) {
      flash("Already a contributor.");
      return;
    }
    const { data, error } = await supabase
      .from("project_contributors")
      .insert({ project_id: project.id, user_email: email })
      .select("user_email, added_by_email, created_at")
      .single();
    if (error || !data) {
      flash("Could not add contributor: " + (error?.message ?? "unknown error"));
      return;
    }
    setContributors((prev) => [...prev, data as Contributor]);
    setNewEmail("");
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
      flash("Could not remove contributor: " + error.message);
    }
  }

  async function deleteMiniProject(id: string) {
    if (!confirm("Delete this mini-project and all its tasks?")) return;
    const prev = miniProjects;
    setMiniProjects((m) => m.filter((x) => x.id !== id));
    const { error } = await supabase.from("mini_projects").delete().eq("id", id);
    if (error) {
      setMiniProjects(prev);
      flash("Could not delete mini-project: " + error.message);
    }
  }

  async function deleteProject() {
    if (!confirm(`Delete project "${project.name}" and everything inside it?`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      flash("Could not delete project: " + error.message);
      return;
    }
    router.push("/tasks");
    router.refresh();
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
          <button
            onClick={deleteProject}
            className="text-[12px] text-danger border border-danger/40 rounded-md px-3 py-1.5 hover:bg-danger/5 shrink-0"
          >
            Delete project
          </button>
        )}
      </div>

      {status && (
        <p className="mb-4 text-[12px] text-clay border border-clay/40 bg-clay/5 rounded-md px-3 py-2">
          {status}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-ink">Mini-projects</h2>
            {canCreateMiniProject(role) && (
              <button
                onClick={() => setMpFormOpen((v) => !v)}
                className="bg-coir text-white text-[13px] font-semibold rounded-md px-3 py-1.5 hover:bg-coir-dark"
              >
                + New Mini-Project
              </button>
            )}
          </div>

          {mpFormOpen && (
            <form
              onSubmit={createMiniProject}
              className="border border-line rounded-xl bg-white p-4 mb-4 space-y-2.5"
            >
              <input
                className={inputCls}
                placeholder="Mini-project name"
                value={mpName}
                onChange={(e) => setMpName(e.target.value)}
                autoFocus
              />
              <textarea
                className={inputCls}
                placeholder="Description (optional)"
                rows={2}
                value={mpDescription}
                onChange={(e) => setMpDescription(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMpFormOpen(false)}
                  className="text-[13px] border border-line rounded-md px-3 py-1.5 text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mpName.trim()}
                  className="bg-coir text-white text-[13px] font-semibold rounded-md px-4 py-1.5 hover:bg-coir-dark disabled:opacity-50"
                >
                  Create
                </button>
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
                    onClick={() => deleteMiniProject(mp.id)}
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
              <input
                className={inputCls}
                type="email"
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={!newEmail.trim()}
                className="bg-coir text-white text-[12px] font-semibold rounded-md px-3 hover:bg-coir-dark disabled:opacity-50 shrink-0"
              >
                Add
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
