"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputCls =
  "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white";

export function NewProjectForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: name.trim(), description: description.trim() })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create project.");
      return;
    }
    setOpen(false);
    setName("");
    setDescription("");
    router.push(`/tasks/${data.id}`);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-coir text-white text-[13px] font-semibold rounded-md px-4 py-2 hover:bg-coir-dark"
      >
        + New Project
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/30 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="bg-paper border border-line rounded-xl p-5 w-full max-w-md space-y-3"
          >
            <h2 className="font-display text-lg font-semibold text-ink">New Project</h2>
            <input
              className={inputCls}
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <textarea
              className={inputCls}
              placeholder="Description (optional)"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {error && <p className="text-[12px] text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[13px] border border-line rounded-md px-3 py-1.5 text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="bg-coir text-white text-[13px] font-semibold rounded-md px-4 py-1.5 hover:bg-coir-dark disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
