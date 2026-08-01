"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { createClient } from "@/lib/supabase/client";
import { canEditOrDeleteTask, type Role } from "@/lib/permissions";
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from "@/lib/tasks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Comment = { id: string; body: string; author_email: string; created_at: string };

export function TaskPanel({
  task,
  assigneeOptions,
  role,
  userEmail,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: Task;
  assigneeOptions: string[];
  role: Role | null;
  userEmail: string;
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const editable = canEditOrDeleteTask(role, task, userEmail);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [taskStatus, setTaskStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [assignee, setAssignee] = useState(task.assignee_email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("task_comments")
        .select("id, body, author_email, created_at")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true });
      setComments((data ?? []) as Comment[]);
      setCommentsLoaded(true);
    })();
  }, [supabase, task.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    const patch = {
      title: title.trim(),
      description,
      status: taskStatus,
      priority,
      due_date: dueDate || null,
      assignee_email: assignee || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", task.id)
      .select("*")
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      setError(error ? error.message : "You don't have permission to edit this task.");
      toast.error(error ? error.message : "You don't have permission to edit this task.");
      return;
    }
    onUpdated(data as Task);
    toast.success("Task saved.");
  }

  async function remove() {
    const { error, data } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id)
      .select("id");
    if (error || !data || data.length === 0) {
      const msg = error ? error.message : "You don't have permission to delete this task.";
      setError(msg);
      toast.error(msg);
      throw new Error(msg);
    }
    onDeleted(task.id);
    toast.success("Task deleted.");
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: task.id, body })
      .select("id, body, author_email, created_at")
      .single();
    if (error || !data) {
      const msg = "Could not add comment: " + (error?.message ?? "unknown error");
      setError(msg);
      toast.error(msg);
      return;
    }
    setComments((prev) => [...prev, data as Comment]);
    setNewComment("");
    toast.success("Comment added.");
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-paper border border-line rounded-xl w-[calc(100vw-2rem)] max-w-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="p-5 border-b border-line flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-base font-semibold text-ink">
                Task
              </Dialog.Title>
              <Dialog.Description className="text-[11px] text-ink-soft">
                Created by {task.created_by_email}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="text-ink-soft hover:text-ink text-lg leading-none"
            >
              ✕
            </Dialog.Close>
          </div>

          <form onSubmit={save} className="p-5 space-y-3">
            <Input
              className="font-semibold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!editable}
              autoFocus
            />

            <Textarea
              placeholder="Description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!editable}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  Status
                </span>
                <Select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value as Task["status"])}
                  disabled={!editable}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  Priority
                </span>
                <Select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task["priority"])}
                  disabled={!editable}
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  Due date
                </span>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={!editable}
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  Assignee
                </span>
                <Select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={!editable}
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {error && <p className="text-[12px] text-danger">{error}</p>}

            <div className="flex items-center justify-between">
              {editable ? (
                <Button intent="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete task
                </Button>
              ) : (
                <span className="text-[11px] text-ink-soft">Read-only — not your task.</span>
              )}
              {editable && (
                <Button intent="primary" size="sm" type="submit" disabled={saving || !title.trim()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </form>

          <div className="border-t border-line p-5">
            <h3 className="font-display text-sm font-semibold text-ink mb-3">Comments</h3>
            {!commentsLoaded && <p className="text-[12px] text-ink-soft">Loading…</p>}
            {commentsLoaded && comments.length === 0 && (
              <p className="text-[12px] text-ink-soft mb-3">No comments yet.</p>
            )}
            <ul className="space-y-3 mb-3">
              {comments.map((c) => (
                <li key={c.id}>
                  <p className="font-mono text-[10px] text-ink-soft">
                    {c.author_email} · {new Date(c.created_at).toLocaleString("en-PH")}
                  </p>
                  <p className="text-[13px] text-ink whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
            <form onSubmit={addComment} className="flex gap-2">
              <Input
                placeholder="Add a comment…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <Button intent="primary" size="sm" type="submit" disabled={!newComment.trim()}>
                Post
              </Button>
            </form>
          </div>

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete task?"
            description="This deletes the task and its comments."
            confirmLabel="Delete"
            onConfirm={remove}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
