export const TASK_STATUSES = ["To Do", "In Progress", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["Low", "Medium", "High"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type Task = {
  id: string;
  mini_project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_email: string | null;
  position: number;
  created_by_email: string;
  created_at: string;
  updated_at: string;
};

// Fractional position for drag-and-drop reordering: a dropped card takes the
// midpoint of its new neighbors, so only one row is written per drag.
export function computeNewPosition(
  prevPos: number | null,
  nextPos: number | null
): number {
  if (prevPos === null && nextPos === null) return 0;
  if (prevPos === null) return (nextPos as number) - 1;
  if (nextPos === null) return prevPos + 1;
  return (prevPos + nextPos) / 2;
}

export function sortByPosition<T extends { position: number }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => a.position - b.position);
}
