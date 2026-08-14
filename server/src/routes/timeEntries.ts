import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const timeEntriesRouter = Router();

timeEntriesRouter.get("/", (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (from) { clauses.push("started_at >= ?"); params.push(from); }
  if (to) { clauses.push("started_at <= ?"); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  res.json(db.prepare(`SELECT * FROM time_entries ${where} ORDER BY started_at DESC LIMIT 500`).all(...params));
});

timeEntriesRouter.post("/", (req, res) => {
  const { taskId, projectId } = req.body ?? {};
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO time_entries (id, task_id, project_id, started_at) VALUES (?,?,?,?)`).run(
    id, taskId ?? null, projectId ?? null, now
  );
  res.status(201).json(db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id));
});

timeEntriesRouter.post("/:id/stop", (req, res) => {
  const entry: any = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id);
  if (!entry) return res.status(404).json({ error: "not found" });
  const now = new Date().toISOString();
  const durationSeconds = Math.round((new Date(now).getTime() - new Date(entry.started_at).getTime()) / 1000);
  db.prepare("UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?").run(now, durationSeconds, req.params.id);
  if (entry.task_id) {
    db.prepare("UPDATE tasks SET actual_minutes = actual_minutes + ? WHERE id = ?").run(Math.round(durationSeconds / 60), entry.task_id);
  }
  res.json(db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id));
});

timeEntriesRouter.patch("/:id", (req, res) => {
  const entry: any = db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id);
  if (!entry) return res.status(404).json({ error: "not found" });
  const { startedAt, endedAt } = req.body ?? {};
  const newStart = startedAt ?? entry.started_at;
  const newEnd = endedAt ?? entry.ended_at;
  const durationSeconds = newEnd ? Math.round((new Date(newEnd).getTime() - new Date(newStart).getTime()) / 1000) : null;
  db.prepare("UPDATE time_entries SET started_at = ?, ended_at = ?, duration_seconds = ? WHERE id = ?").run(
    newStart, newEnd, durationSeconds, req.params.id
  );
  res.json(db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id));
});

timeEntriesRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM time_entries WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// GET /api/time-entries/summary?range=week|month — totals grouped by day within the range.
timeEntriesRouter.get("/summary", (req, res) => {
  const range = (req.query.range as string) ?? "week";
  const days = range === "month" ? 30 : 7;
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day, SUM(COALESCE(duration_seconds, 0)) AS seconds
       FROM time_entries WHERE started_at >= ? GROUP BY day ORDER BY day ASC`
    )
    .all(from);
  const totalSeconds = (rows as any[]).reduce((sum, r) => sum + r.seconds, 0);
  res.json({ range, days: rows, totalSeconds });
});
