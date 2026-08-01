"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
      const msg = error?.message ?? "Could not create project.";
      setError(msg);
      toast.error(msg);
      return;
    }
    setOpen(false);
    setName("");
    setDescription("");
    router.push(`/tasks/${data.id}`);
    router.refresh();
    toast.success("Project created.");
  }

  return (
    <>
      <Button intent="primary" onClick={() => setOpen(true)}>
        + New Project
      </Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/30" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-paper border border-line rounded-xl w-[calc(100vw-2rem)] max-w-md p-5">
            <form onSubmit={submit} className="space-y-3">
              <Dialog.Title className="font-display text-lg font-semibold text-ink">
                New Project
              </Dialog.Title>
              <Input
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <Textarea
                placeholder="Description (optional)"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {error && <p className="text-[12px] text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <Dialog.Close className="text-[12px] px-3 py-1.5 rounded-md font-semibold transition-colors border bg-white text-ink border-line hover:border-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30 focus-visible:border-coir">
                  Cancel
                </Dialog.Close>
                <Button intent="primary" size="sm" type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
