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
} as const;

export type ToolName = keyof typeof tools;
export const TOOL_NAMES = Object.keys(tools) as ToolName[];

export function runTool(name: string, args: any) {
  const fn = (tools as any)[name];
  if (!fn) throw new Error(`unknown tool: ${name}`);
  return fn(args);
}
