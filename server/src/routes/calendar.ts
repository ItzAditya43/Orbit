import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const calendarRouter = Router();

calendarRouter.get("/", (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (from) { clauses.push("starts_at >= ?"); params.push(from); }
  if (to) { clauses.push("starts_at <= ?"); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const events = db.prepare(`SELECT * FROM calendar_events ${where} ORDER BY starts_at ASC`).all(...params);

  // Overlay scheduled tasks as pseudo-events
  const taskClauses = ["scheduled_at IS NOT NULL"];
  const taskParams: unknown[] = [];
  if (from) { taskClauses.push("scheduled_at >= ?"); taskParams.push(from); }
  if (to) { taskClauses.push("scheduled_at <= ?"); taskParams.push(to); }
  const scheduledTasks = db
    .prepare(`SELECT id, title, scheduled_at, estimate_minutes FROM tasks WHERE ${taskClauses.join(" AND ")}`)
    .all(...taskParams) as any[];

  const taskEvents = scheduledTasks.map((t) => ({
    id: `task-${t.id}`,
    title: t.title,
    starts_at: t.scheduled_at,
    ends_at: t.scheduled_at,
    task_id: t.id,
    source: "task",
  }));

  res.json([...events.map((e: any) => ({ ...e, source: "event" })), ...taskEvents]);
});

calendarRouter.post("/", (req, res) => {
  const { title, startsAt, endsAt, taskId, notes } = req.body ?? {};
  if (!title || !startsAt || !endsAt) return res.status(400).json({ error: "title, startsAt, endsAt required" });
  const id = randomUUID();
  db.prepare(
    `INSERT INTO calendar_events (id, title, starts_at, ends_at, task_id, notes, created_at) VALUES (?,?,?,?,?,?,?)`
  ).run(id, title, startsAt, endsAt, taskId ?? null, notes ?? null, new Date().toISOString());
  res.status(201).json(db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id));
});

calendarRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM calendar_events WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
