import { randomUUID } from "node:crypto";
import { db } from "./db.js";

const RECURRENCES = ["daily", "weekly", "monthly", "interval", "custom_days"];

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The occurrence after `baseIso` for this task's repeat pattern. All UTC date-string math, to
// match how "today" is derived everywhere else on the server.
function nextOccurrence(task: any, baseIso: string): string {
  if (task.recurrence === "weekly") return addDaysIso(baseIso, 7);
  if (task.recurrence === "interval") return addDaysIso(baseIso, task.recurrence_interval_days || 1);
  if (task.recurrence === "monthly") {
    // Clamped to the target month's last day — Jan 31 + 1 month is Feb 28/29, not Mar 3.
    const [y, m, day] = baseIso.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, lastDay))).toISOString().slice(0, 10);
  }
  if (task.recurrence === "custom_days") {
    const days: number[] = task.recurrence_days ? JSON.parse(task.recurrence_days) : [];
    if (days.length) {
      for (let i = 1; i <= 7; i++) {
        const candidate = addDaysIso(baseIso, i);
        if (days.includes(new Date(`${candidate}T00:00:00Z`).getUTCDay())) return candidate;
      }
    }
  }
  return addDaysIso(baseIso, 1); // daily
}

// Marks a task done and, if it repeats, creates its next occurrence. Shared by the single
// complete endpoint, bulk complete, and the AI complete_task tool so all three behave the same
// — bulk/AI completion used to just flip the status, which silently ended a recurring series.
// Returns the completed task row, or undefined if there's no such task.
export function markTaskDone(taskId: string): any {
  const before: any = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!before) return undefined;
  const now = new Date().toISOString();
  db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, taskId);
  const task: any = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);

  // Already-done tasks don't spawn again — completing twice would otherwise fork the series.
  const repeats = RECURRENCES.includes(task.recurrence) && (task.due_date || task.recurrence_start_date);
  if (before.status === "done" || !repeats) return task;

  // A task created via "Starts" has no due_date at all — it's due by its pattern, so the
  // occurrence being completed is today's (or the start date, if that's still in the future).
  const today = now.slice(0, 10);
  const start = task.recurrence_start_date ? task.recurrence_start_date.slice(0, 10) : null;
  const base = task.due_date ? task.due_date.slice(0, 10) : start && start > today ? start : today;
  const nextDue = nextOccurrence(task, base);
  if (task.recurrence_end_date && nextDue > task.recurrence_end_date) return task;

  const newId = randomUUID();
  // The anchor moves forward with the series: leaving the old start date on the new occurrence
  // made it count as due again on the very day its predecessor was completed.
  db.prepare(
    `INSERT INTO tasks (id, title, notes, project_id, priority, due_date, recurrence, recurrence_interval_days, recurrence_days, recurrence_start_date, recurrence_end_date, estimate_minutes, color, energy, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    newId, task.title, task.notes, task.project_id, task.priority, nextDue,
    task.recurrence, task.recurrence_interval_days, task.recurrence_days, task.recurrence_start_date ? nextDue : null,
    task.recurrence_end_date, task.estimate_minutes, task.color, task.energy, now, now
  );
  db.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) SELECT ?, tag_id FROM task_tags WHERE task_id = ?").run(newId, task.id);
  return task;
}
