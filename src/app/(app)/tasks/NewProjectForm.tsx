"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
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
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        New Project
      </Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <DialogBackdrop />
          <DialogPopup>
            <form onSubmit={submit} className="space-y-3">
              <DialogTitle>New Project</DialogTitle>
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
                <DialogClose>Cancel</DialogClose>
                <Button intent="primary" size="sm" type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
