"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import {
  canAddContributor,
  canEditOrDeleteTask,
  canRemoveContributor,
  type Role,
} from "@/lib/permissions";
import {
  TASK_STATUSES,
  computeNewPosition,
  sortByPosition,
  type Task,
  type TaskStatus,
} from "@/lib/tasks";
import { TaskPanel } from "./TaskPanel";

type MiniProject = { id: string; project_id: string; name: string; description: string };
type ScopedContributor = { user_email: string; added_by_email: string | null };
type Columns = Record<TaskStatus, string[]>;

const inputCls =
  "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white";

const PRIORITY_STYLE: Record<string, string> = {
  Low: "text-coir-dark border-coir/50",
  Medium: "text-amber border-amber/50",
  High: "text-danger border-danger/50",
};

function buildColumns(tasks: Task[]): Columns {
  const cols: Columns = { "To Do": [], "In Progress": [], Done: [] };
  for (const t of sortByPosition(tasks)) cols[t.status].push(t.id);
  return cols;
}

function TaskCard({
  task,
  draggable,
  onOpen,
}: {
  task: Task;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`border border-line rounded-lg bg-white p-3 cursor-pointer hover:border-coir ${
        isDragging ? "opacity-40" : ""
      } ${draggable ? "" : "cursor-default"}`}
    >
      <p className="text-[13px] font-medium text-ink leading-snug">{task.title}</p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span
          className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${
            PRIORITY_STYLE[task.priority] ?? ""
          }`}
        >
          {task.priority}
        </span>
        {task.due_date && (
          <span className="font-mono text-[10px] text-ink-soft">due {task.due_date}</span>
        )}
      </div>
      {task.assignee_email && (
        <p className="font-mono text-[10px] text-ink-soft mt-1.5 truncate">
          → {task.assignee_email}
        </p>
      )}
    </div>
  );
}

function Column({
  status,
  taskIds,
  tasksById,
  role,
  userEmail,
  onOpenTask,
  onAddTask,
}: {
  status: TaskStatus;
  taskIds: string[];
  tasksById: Record<string, Task>;
  role: Role | null;
  userEmail: string;
  onOpenTask: (task: Task) => void;
  onAddTask: (status: TaskStatus, title: string) => Promise<boolean>;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await onAddTask(status, title.trim());
    if (ok) {
      setTitle("");
      setAdding(false);
    }
  }

  return (
    <div className="bg-panel border border-line rounded-xl p-3 flex flex-col min-h-[200px]">
      <div className="flex items-center justify-between px-1 mb-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">{status}</p>
        <span className="font-mono text-[10px] text-ink-soft">{taskIds.length}</span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex-1 space-y-2">
          {taskIds.map((id) => {
            const task = tasksById[id];
            if (!task) return null;
            return (
              <TaskCard
                key={id}
                task={task}
                draggable={canEditOrDeleteTask(role, task, userEmail)}
                onOpen={() => onOpenTask(task)}
              />
            );
          })}
        </div>
      </SortableContext>
      {adding ? (
        <form onSubmit={submit} className="mt-2 space-y-1.5">
          <input
            className={inputCls}
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={!title.trim()}
              className="bg-coir text-white text-[12px] font-semibold rounded-md px-3 py-1 hover:bg-coir-dark disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[12px] border border-line rounded-md px-3 py-1 text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 text-[12px] text-ink-soft hover:text-ink text-left px-1"
        >
          + Add task
        </button>
      )}
    </div>
  );
}

export function Board({
  miniProject,
  projectName,
  initialTasks,
  initialScopedContributors,
  inheritedContributorEmails,
  role,
  userEmail,
}: {
  miniProject: MiniProject;
  projectName: string;
  initialTasks: Task[];
  initialScopedContributors: ScopedContributor[];
  inheritedContributorEmails: string[];
  role: Role | null;
  userEmail: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tasksById, setTasksById] = useState<Record<string, Task>>(() =>
    Object.fromEntries(initialTasks.map((t) => [t.id, t]))
  );
  const [columns, setColumns] = useState<Columns>(() => buildColumns(initialTasks));
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [status, setStatus] = useState("");
  const [scopedContributors, setScopedContributors] = useState(initialScopedContributors);
  const [newEmail, setNewEmail] = useState("");
  const dragSnapshot = useRef<{ columns: Columns; tasksById: Record<string, Task> } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>(
      [...inheritedContributorEmails, ...scopedContributors.map((c) => c.user_email), userEmail]
        .filter(Boolean)
        .map((e) => e.toLowerCase())
    );
    return Array.from(set).sort();
  }, [inheritedContributorEmails, scopedContributors, userEmail]);

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(""), 3000);
  }

  function findContainer(id: UniqueIdentifier): TaskStatus | null {
    if (TASK_STATUSES.includes(id as TaskStatus)) return id as TaskStatus;
    for (const s of TASK_STATUSES) if (columns[s].includes(id as string)) return s;
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
    dragSnapshot.current = { columns, tasksById };
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const fromIds = prev[from].filter((id) => id !== active.id);
      const toIds = [...prev[to]];
      const overIdx = toIds.indexOf(over.id as string);
      const insertAt = overIdx >= 0 ? overIdx : toIds.length;
      toIds.splice(insertAt, 0, active.id as string);
      return { ...prev, [from]: fromIds, [to]: toIds };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) {
      rollbackDrag();
      return;
    }

    const container = findContainer(active.id);
    if (!container) return;

    // Same-column reorder
    let finalColumns = columns;
    const overContainer = findContainer(over.id);
    if (overContainer === container && active.id !== over.id) {
      const ids = columns[container];
      const oldIdx = ids.indexOf(active.id as string);
      const newIdx = ids.indexOf(over.id as string);
      if (oldIdx >= 0 && newIdx >= 0) {
        finalColumns = { ...columns, [container]: arrayMove(ids, oldIdx, newIdx) };
        setColumns(finalColumns);
      }
    }

    const ids = finalColumns[container];
    const idx = ids.indexOf(active.id as string);
    const prevTask = idx > 0 ? tasksById[ids[idx - 1]] : null;
    const nextTask = idx < ids.length - 1 ? tasksById[ids[idx + 1]] : null;
    const newPosition = computeNewPosition(
      prevTask ? prevTask.position : null,
      nextTask ? nextTask.position : null
    );

    const taskId = active.id as string;
    const before = dragSnapshot.current;
    const updated = { ...tasksById[taskId], status: container, position: newPosition };
    setTasksById((prev) => ({ ...prev, [taskId]: updated }));

    const { error, data } = await supabase
      .from("tasks")
      .update({ status: container, position: newPosition })
      .eq("id", taskId)
      .select("id");
    if (error || !data || data.length === 0) {
      // RLS rejection surfaces as 0 updated rows, not an error
      if (before) {
        setColumns(before.columns);
        setTasksById(before.tasksById);
      }
      flash(error ? "Could not move task: " + error.message : "You can only move tasks you created.");
    }
    dragSnapshot.current = null;
  }

  function rollbackDrag() {
    const before = dragSnapshot.current;
    if (before) {
      setColumns(before.columns);
      setTasksById(before.tasksById);
    }
    dragSnapshot.current = null;
  }

  async function addTask(taskStatus: TaskStatus, title: string): Promise<boolean> {
    const ids = columns[taskStatus];
    const last = ids.length > 0 ? tasksById[ids[ids.length - 1]] : null;
    const position = computeNewPosition(last ? last.position : null, null);
    const { data, error } = await supabase
      .from("tasks")
      .insert({ mini_project_id: miniProject.id, title, status: taskStatus, position })
      .select("*")
      .single();
    if (error || !data) {
      flash("Could not create task: " + (error?.message ?? "unknown error"));
      return false;
    }
    const task = data as Task;
    setTasksById((prev) => ({ ...prev, [task.id]: task }));
    setColumns((prev) => ({ ...prev, [taskStatus]: [...prev[taskStatus], task.id] }));
    return true;
  }

  function handleTaskUpdated(task: Task) {
    setTasksById((prev) => ({ ...prev, [task.id]: task }));
    setColumns((prev) => {
      const current = findContainerIn(prev, task.id);
      if (current === task.status || !current) return prev;
      return {
        ...prev,
        [current]: prev[current].filter((id) => id !== task.id),
        [task.status]: [...prev[task.status], task.id],
      };
    });
    setOpenTask(task);
  }

  function findContainerIn(cols: Columns, id: string): TaskStatus | null {
    for (const s of TASK_STATUSES) if (cols[s].includes(id)) return s;
    return null;
  }

  function handleTaskDeleted(id: string) {
    setTasksById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setColumns((prev) => {
      const next = { ...prev };
      for (const s of TASK_STATUSES) next[s] = next[s].filter((x) => x !== id);
      return next;
    });
    setOpenTask(null);
  }

  async function addScopedContributor(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    const { data, error } = await supabase
      .from("mini_project_contributors")
      .insert({ mini_project_id: miniProject.id, user_email: email })
      .select("user_email, added_by_email")
      .single();
    if (error || !data) {
      flash("Could not add contributor: " + (error?.message ?? "unknown error"));
      return;
    }
    setScopedContributors((prev) => [...prev, data as ScopedContributor]);
    setNewEmail("");
  }

  async function removeScopedContributor(email: string) {
    const prev = scopedContributors;
    setScopedContributors((c) => c.filter((x) => x.user_email !== email));
    const { error } = await supabase
      .from("mini_project_contributors")
      .delete()
      .eq("mini_project_id", miniProject.id)
      .eq("user_email", email);
    if (error) {
      setScopedContributors(prev);
      flash("Could not remove contributor: " + error.message);
    }
  }

  const activeTask = activeId ? tasksById[activeId as string] : null;

  return (
    <div>
      <Link
        href={`/tasks/${miniProject.project_id}`}
        className="text-[12px] text-ink-soft hover:text-ink"
      >
        ← {projectName}
      </Link>
      <div className="mt-2 mb-5">
        <h1 className="font-display text-2xl font-semibold text-ink">{miniProject.name}</h1>
        {miniProject.description && (
          <p className="text-[13px] text-ink-soft mt-1">{miniProject.description}</p>
        )}
      </div>

      {status && (
        <p className="mb-4 text-[12px] text-clay border border-clay/40 bg-clay/5 rounded-md px-3 py-2">
          {status}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={rollbackDrag}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {TASK_STATUSES.map((s) => (
            <Column
              key={s}
              status={s}
              taskIds={columns[s]}
              tasksById={tasksById}
              role={role}
              userEmail={userEmail}
              onOpenTask={(t) => setOpenTask(t)}
              onAddTask={addTask}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="border border-coir rounded-lg bg-white p-3 shadow-lg rotate-2">
              <p className="text-[13px] font-medium text-ink leading-snug">{activeTask.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <section className="mt-8 border border-line rounded-xl bg-white p-4 max-w-md">
        <h2 className="font-display text-base font-semibold text-ink mb-1">Board contributors</h2>
        <p className="text-[11px] text-ink-soft mb-3">
          Added here in addition to contributors inherited from {projectName}.
        </p>
        {inheritedContributorEmails.length > 0 && (
          <p className="text-[11px] text-ink-soft mb-2">
            Inherited: {inheritedContributorEmails.join(", ")}
          </p>
        )}
        <ul className="space-y-1.5 mb-3">
          {scopedContributors.length === 0 && (
            <li className="text-[12px] text-ink-soft">No board-specific contributors.</li>
          )}
          {scopedContributors.map((c) => (
            <li key={c.user_email} className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-ink truncate">{c.user_email}</span>
              {canRemoveContributor(role) && (
                <button
                  onClick={() => removeScopedContributor(c.user_email)}
                  className="text-[11px] text-ink-soft hover:text-danger shrink-0"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {canAddContributor(role) && (
          <form onSubmit={addScopedContributor} className="flex gap-2">
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
      </section>

      {openTask && (
        <TaskPanel
          task={openTask}
          assigneeOptions={assigneeOptions}
          role={role}
          userEmail={userEmail}
          onClose={() => setOpenTask(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
        />
      )}
    </div>
  );
}
