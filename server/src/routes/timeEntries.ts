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

timeEntriesRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM time_entries WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
