import { randomUUID } from "node:crypto";
import { db } from "./db.js";

// The internal AI tool registry (§17/§18 of the spec). Every tool is a plain deterministic
// function — this is the layer an LLM (local Ollama, or any OpenAI-compatible endpoint) calls
// via tool-calling. It also works standalone with zero AI configured, which is what the
// deterministic command parser in routes/ai.ts uses.

export const tools = {
  create_task(args: { title: string; projectId?: string; dueDate?: string; priority?: string }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, project_id, due_date, priority, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(id, args.title, args.projectId ?? null, args.dueDate ?? null, args.priority ?? "none", now, now);
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  },
  complete_task(args: { taskId: string }) {
    const now = new Date().toISOString();
    db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, args.taskId);
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(args.taskId);
  },
  move_task(args: { taskId: string; projectId: string }) {
    db.prepare("UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?").run(
      args.projectId, new Date().toISOString(), args.taskId
    );
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(args.taskId);
  },
  schedule_task(args: { taskId: string; scheduledAt: string }) {
    db.prepare("UPDATE tasks SET scheduled_at = ?, updated_at = ? WHERE id = ?").run(
      args.scheduledAt, new Date().toISOString(), args.taskId
    );
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(args.taskId);
  },
  get_today() {
    const today = new Date().toISOString().slice(0, 10);
    return db
      .prepare(`SELECT * FROM tasks WHERE status = 'open' AND (due_date <= ? OR scheduled_at LIKE ?) AND parent_id IS NULL`)
      .all(today, `${today}%`);
  },
  get_tasks(args: { projectId?: string; status?: string } = {}) {
    const clauses: string[] = ["parent_id IS NULL"];
    const params: unknown[] = [];
    if (args.projectId) { clauses.push("project_id = ?"); params.push(args.projectId); }
    if (args.status) { clauses.push("status = ?"); params.push(args.status); }
    return db.prepare(`SELECT * FROM tasks WHERE ${clauses.join(" AND ")}`).all(...params);
  },
  get_available_time(args: { date?: string } = {}) {
    // Deterministic estimate: 8h working day minus estimate_minutes of tasks scheduled that day.
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    const scheduled = db
      .prepare(`SELECT COALESCE(SUM(estimate_minutes), 0) AS m FROM tasks WHERE status = 'open' AND (due_date = ? OR scheduled_at LIKE ?)`)
      .get(date, `${date}%`) as any;
    return { date, workingMinutes: 8 * 60, allocatedMinutes: scheduled.m, freeMinutes: Math.max(0, 8 * 60 - scheduled.m) };
  },
  capture_idea(args: { text: string }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, is_inbox, created_at, updated_at) VALUES (?,?,1,?,?)`
    ).run(id, args.text, now, now);
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  },
  start_focus_session(args: { taskId?: string; mode?: string; plannedMinutes?: number }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO focus_sessions (id, task_id, mode, planned_minutes, started_at) VALUES (?,?,?,?,?)`
    ).run(id, args.taskId ?? null, args.mode ?? "pomodoro", args.plannedMinutes ?? 25, now);
    return db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(id);
  },
  update_task(args: { taskId: string; title?: string; notes?: string; priority?: string; dueDate?: string }) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (args.title) { updates.push("title = ?"); values.push(args.title); }
    if (args.notes !== undefined) { updates.push("notes = ?"); values.push(args.notes); }
    if (args.priority) { updates.push("priority = ?"); values.push(args.priority); }
    if (args.dueDate !== undefined) { updates.push("due_date = ?"); values.push(args.dueDate); }
    if (updates.length) {
      values.push(new Date().toISOString(), args.taskId);
      db.prepare(`UPDATE tasks SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`).run(...values);
    }
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(args.taskId);
  },
  delete_task(args: { taskId: string }) {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(args.taskId);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(args.taskId);
    return task;
  },
  create_project(args: { name: string; color?: string; description?: string }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO projects (id, name, color, description, created_at, updated_at) VALUES (?,?,?,?,?,?)`).run(
      id, args.name, args.color ?? null, args.description ?? null, now, now
    );
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  },
  process_inbox(args: { taskId: string; projectId?: string } = {} as any) {
    if (!args.taskId) {
      return db.prepare("SELECT * FROM tasks WHERE is_inbox = 1 AND status = 'open'").all();
    }
    db.prepare("UPDATE tasks SET is_inbox = 0, project_id = ?, updated_at = ? WHERE id = ?").run(
      args.projectId ?? null, new Date().toISOString(), args.taskId
    );
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(args.taskId);
  },
  get_habits() {
    return db.prepare("SELECT id, title, frequency, target_count, unit, deadline_time FROM habits WHERE archived = 0").all();
  },
  get_goals() {
    return db.prepare("SELECT id, title, horizon, status, progress, target_date FROM goals WHERE status != 'abandoned'").all();
  },
  get_projects() {
    return db
      .prepare("SELECT id, name, color, is_archived FROM projects WHERE is_archived = 0 AND deleted_at IS NULL")
      .all();
  },
  get_analytics_summary() {
    const today = new Date().toISOString().slice(0, 10);
    const totalOpen = (db.prepare("SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND status = 'open'").get() as any).c;
    const overdue = (
      db
        .prepare("SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL AND due_date < ?")
        .get(today) as any
    ).c;
    const habitsTotal = (db.prepare("SELECT COUNT(*) c FROM habits WHERE archived = 0").get() as any).c;
    const goalsActive = (db.prepare("SELECT COUNT(*) c FROM goals WHERE status = 'active'").get() as any).c;
    return { totalOpen, overdue, habitsTotal, goalsActive };
  },
  search_notes(args: { query: string }) {
    return db
      .prepare(`SELECT notes.* FROM notes_fts JOIN notes ON notes.rowid = notes_fts.rowid WHERE notes_fts MATCH ? ORDER BY rank`)
      .all(args.query + "*");
  },
  create_calendar_event(args: { title: string; startsAt: string; endsAt: string; allDay?: boolean }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO calendar_events (id, title, starts_at, ends_at, all_day, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(id, args.title, args.startsAt, args.endsAt, args.allDay ? 1 : 0, now, now);
    return db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id);
  },
  add_dependency(args: { taskId: string; blocksTaskId: string }) {
    db.prepare("INSERT OR IGNORE INTO task_dependencies (task_id, blocks_task_id) VALUES (?,?)").run(args.taskId, args.blocksTaskId);
    return { ok: true };
  },
  create_habit(args: { title: string; frequency?: string; targetPerPeriod?: number; deadlineTime?: string; targetCount?: number; unit?: string }) {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO habits (id, title, frequency, target_per_period, deadline_time, target_count, unit, created_at) VALUES (?,?,?,?,?,?,?,?)"
    ).run(
      id, args.title, args.frequency ?? "daily", args.targetPerPeriod ?? 1, args.deadlineTime ?? null, args.targetCount ?? null,
      args.unit ?? null, new Date().toISOString()
    );
    return db.prepare("SELECT * FROM habits WHERE id = ?").get(id);
  },
  // "By title" edit tools exist so the LLM can edit something by name instead of needing a
  // real ID it has no way to know — same fuzzy-match-by-title approach the deterministic
  // "complete <title>" parser already uses. Deliberately no delete_*_by_title counterpart for
  // any of these: the AI can create and edit, never delete, regardless of approval mode.
  update_task_by_title(args: { title: string; changes: { title?: string; notes?: string; priority?: string; dueDate?: string } }) {
    const match = db.prepare("SELECT id FROM tasks WHERE title LIKE ? AND status != 'done' AND deleted_at IS NULL LIMIT 2").all(`%${args.title}%`) as any[];
    if (match.length === 0) throw new Error(`no task matching "${args.title}"`);
    if (match.length > 1) throw new Error(`multiple tasks match "${args.title}" — be more specific`);
    return tools.update_task({ taskId: match[0].id, ...args.changes });
  },
  update_habit_by_title(args: { title: string; changes: { title?: string; frequency?: string; targetPerPeriod?: number; deadlineTime?: string; targetCount?: number; unit?: string } }) {
    const match = db.prepare("SELECT id FROM habits WHERE title LIKE ? AND archived = 0 LIMIT 2").all(`%${args.title}%`) as any[];
    if (match.length === 0) throw new Error(`no habit matching "${args.title}"`);
    if (match.length > 1) throw new Error(`multiple habits match "${args.title}" — be more specific`);
    const id = match[0].id;
    const c = args.changes ?? {};
    db.prepare(
      `UPDATE habits SET
        title = COALESCE(?, title), frequency = COALESCE(?, frequency), target_per_period = COALESCE(?, target_per_period),
        deadline_time = COALESCE(?, deadline_time), target_count = COALESCE(?, target_count), unit = COALESCE(?, unit)
       WHERE id = ?`
    ).run(c.title ?? null, c.frequency ?? null, c.targetPerPeriod ?? null, c.deadlineTime ?? null, c.targetCount ?? null, c.unit ?? null, id);
    return db.prepare("SELECT * FROM habits WHERE id = ?").get(id);
  },
  update_goal_by_title(args: { title: string; changes: { title?: string; progress?: number; status?: string; targetDate?: string } }) {
    const match = db.prepare("SELECT id FROM goals WHERE title LIKE ? AND status != 'abandoned' LIMIT 2").all(`%${args.title}%`) as any[];
    if (match.length === 0) throw new Error(`no goal matching "${args.title}"`);
    if (match.length > 1) throw new Error(`multiple goals match "${args.title}" — be more specific`);
    const id = match[0].id;
    const c = args.changes ?? {};
    db.prepare(
      `UPDATE goals SET title = COALESCE(?, title), progress = COALESCE(?, progress), status = COALESCE(?, status),
        target_date = COALESCE(?, target_date), updated_at = ? WHERE id = ?`
    ).run(c.title ?? null, c.progress ?? null, c.status ?? null, c.targetDate ?? null, new Date().toISOString(), id);
    return db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
  },
  update_project_by_title(args: { title: string; changes: { name?: string; color?: string; description?: string } }) {
    const match = db.prepare("SELECT id FROM projects WHERE name LIKE ? AND is_archived = 0 AND deleted_at IS NULL LIMIT 2").all(`%${args.title}%`) as any[];
    if (match.length === 0) throw new Error(`no project matching "${args.title}"`);
    if (match.length > 1) throw new Error(`multiple projects match "${args.title}" — be more specific`);
    const id = match[0].id;
    const c = args.changes ?? {};
    db.prepare(
      `UPDATE projects SET name = COALESCE(?, name), color = COALESCE(?, color), description = COALESCE(?, description),
        updated_at = ? WHERE id = ?`
    ).run(c.name ?? null, c.color ?? null, c.description ?? null, new Date().toISOString(), id);
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  },
  update_note_by_title(args: { title: string; changes: { title?: string; body?: string } }) {
    const match = db.prepare("SELECT id FROM notes WHERE title LIKE ? AND deleted_at IS NULL LIMIT 2").all(`%${args.title}%`) as any[];
    if (match.length === 0) throw new Error(`no note matching "${args.title}"`);
    if (match.length > 1) throw new Error(`multiple notes match "${args.title}" — be more specific`);
    const id = match[0].id;
    const c = args.changes ?? {};
    db.prepare(`UPDATE notes SET title = COALESCE(?, title), body = COALESCE(?, body), updated_at = ? WHERE id = ?`).run(
      c.title ?? null, c.body ?? null, new Date().toISOString(), id
    );
    return db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  },
} as const;

export type ToolName = keyof typeof tools;
export const TOOL_NAMES = Object.keys(tools) as ToolName[];

// Read-only tools never need approval regardless of AI permission mode. Everything else
// mutates state, so it's gated by the "suggest" permission mode (see routes/ai.ts).
export const READ_ONLY_TOOLS = new Set<ToolName>([
  "get_today",
  "get_tasks",
  "get_available_time",
  "search_notes",
  "get_habits",
  "get_goals",
  "get_projects",
  "get_analytics_summary",
]);

export function runTool(name: string, args: any) {
  const fn = (tools as any)[name];
  if (!fn) throw new Error(`unknown tool: ${name}`);
  return fn(args);
}
