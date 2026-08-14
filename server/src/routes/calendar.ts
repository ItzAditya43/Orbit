import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const calendarRouter = Router();

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
calendarRouter.get("/", (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (from) { clauses.push("e.starts_at >= ?"); params.push(from); }
  if (to) { clauses.push("e.starts_at <= ?"); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const events = db
    .prepare(
      `SELECT e.*, p.color AS project_color, p.name AS project_name
       FROM calendar_events e LEFT JOIN projects p ON p.id = e.project_id
       ${where} ORDER BY e.starts_at ASC`
    )
    .all(...params) as any[];

  // Overlay scheduled/due tasks as pseudo-events so the calendar reflects the task list too.
  const taskClauses = ["status != 'done'", "(scheduled_at IS NOT NULL OR due_date IS NOT NULL)"];
  const taskParams: unknown[] = [];
  if (from) { taskClauses.push("(scheduled_at >= ? OR due_date >= ?)"); taskParams.push(from, from); }
  if (to) { taskClauses.push("(scheduled_at <= ? OR due_date <= ?)"); taskParams.push(to, to); }
  const scheduledTasks = db
    .prepare(
      `SELECT t.id, t.title, t.scheduled_at, t.due_date, t.priority, t.project_id, p.color AS project_color
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE ${taskClauses.join(" AND ")}`
    )
    .all(...taskParams) as any[];

  const taskEvents = scheduledTasks.map((t) => ({
    id: `task-${t.id}`,
    title: t.title,
    starts_at: t.scheduled_at ?? t.due_date,
    ends_at: t.scheduled_at ?? t.due_date,
    all_day: !t.scheduled_at,
    task_id: t.id,
    project_id: t.project_id,
    color: t.project_color,
    priority: t.priority,
    source: "task",
  }));

  res.json([
    ...events.map((e) => ({ ...e, source: "event", color: e.color ?? e.project_color ?? null })),
    ...taskEvents,
  ]);
});

calendarRouter.post("/", (req, res) => {
  const { title, startsAt, endsAt, allDay, color, location, taskId, projectId, notes } = req.body ?? {};
  if (!title || !startsAt || !endsAt) return res.status(400).json({ error: "title, startsAt, endsAt required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO calendar_events (id, title, starts_at, ends_at, all_day, color, location, task_id, project_id, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, title, startsAt, endsAt, allDay ? 1 : 0, color ?? null, location ?? null, taskId ?? null, projectId ?? null, notes ?? null, now, now);
  res.status(201).json(db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id));
});

calendarRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const fields: Record<string, string> = {
    title: "title",
    startsAt: "starts_at",
    endsAt: "ends_at",
    allDay: "all_day",
    color: "color",
    location: "location",
    taskId: "task_id",
    projectId: "project_id",
    notes: "notes",
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (key in req.body) {
      let value = req.body[key];
      if (key === "allDay") value = value ? 1 : 0;
      updates.push(`${col} = ?`);
      values.push(value);
    }
  }
  if (updates.length) {
    values.push(new Date().toISOString(), req.params.id);
    db.prepare(`UPDATE calendar_events SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`).run(...values);
  }
  res.json(db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(req.params.id));
});

calendarRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM calendar_events WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
