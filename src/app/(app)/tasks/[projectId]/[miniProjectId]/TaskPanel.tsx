"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canEditOrDeleteTask, type Role } from "@/lib/permissions";
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from "@/lib/tasks";

type Comment = { id: string; body: string; author_email: string; created_at: string };

const inputCls =
  "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white";

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
      return;
    }
    onUpdated(data as Task);
  }

  async function remove() {
    if (!confirm("Delete this task?")) return;
    const { error, data } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id)
      .select("id");
    if (error || !data || data.length === 0) {
      setError(error ? error.message : "You don't have permission to delete this task.");
      return;
    }
    onDeleted(task.id);
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
      setError("Could not add comment: " + (error?.message ?? "unknown error"));
      return;
    }
    setComments((prev) => [...prev, data as Comment]);
    setNewComment("");
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-ink/30 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-paper border border-line rounded-xl w-full max-w-lg my-8"
      >
        <form onSubmit={save} className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <input
              className={`${inputCls} font-semibold`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!editable}
            />
            <button
              type="button"
              onClick={onClose}
              className="text-ink-soft hover:text-ink text-lg leading-none mt-2"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <textarea
            className={inputCls}
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
              <select
                className={inputCls}
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as Task["status"])}
                disabled={!editable}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                Priority
              </span>
              <select
                className={inputCls}
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task["priority"])}
                disabled={!editable}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                Due date
              </span>
              <input
                type="date"
                className={inputCls}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!editable}
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                Assignee
              </span>
              <select
                className={inputCls}
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
              </select>
            </label>
          </div>

          <p className="font-mono text-[10px] text-ink-soft">
            Created by {task.created_by_email}
          </p>

          {error && <p className="text-[12px] text-danger">{error}</p>}

          <div className="flex items-center justify-between">
            {editable ? (
              <button
                type="button"
                onClick={remove}
                className="text-[12px] text-danger border border-danger/40 rounded-md px-3 py-1.5 hover:bg-danger/5"
              >
                Delete task
              </button>
            ) : (
              <span className="text-[11px] text-ink-soft">Read-only — not your task.</span>
            )}
            {editable && (
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="bg-coir text-white text-[13px] font-semibold rounded-md px-4 py-1.5 hover:bg-coir-dark disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
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
            <input
              className={inputCls}
              placeholder="Add a comment…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="bg-coir text-white text-[12px] font-semibold rounded-md px-3 hover:bg-coir-dark disabled:opacity-50 shrink-0"
            >
              Post
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
