import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { fireTrigger } from "../automationEngine.js";

export const focusRouter = Router();

focusRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT 100").all());
});

focusRouter.post("/", (req, res) => {
  const { taskId, mode, plannedMinutes } = req.body ?? {};
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO focus_sessions (id, task_id, mode, planned_minutes, started_at) VALUES (?,?,?,?,?)`
  ).run(id, taskId ?? null, mode ?? "pomodoro", plannedMinutes ?? null, now);
  res.status(201).json(db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(id));
});

focusRouter.post("/:id/end", (req, res) => {
  const session: any = db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "not found" });
  const now = new Date().toISOString();
  const wasCompleted = req.body?.wasCompleted ? 1 : 0;
  db.prepare("UPDATE focus_sessions SET ended_at = ?, was_completed = ?, notes = ? WHERE id = ?").run(
    now,
    wasCompleted,
    req.body?.notes ?? null,
    req.params.id
  );
  if (session.task_id) {
    const minutes = Math.round((new Date(now).getTime() - new Date(session.started_at).getTime()) / 60000);
    db.prepare("UPDATE tasks SET actual_minutes = actual_minutes + ? WHERE id = ?").run(minutes, session.task_id);
  }
  fireTrigger("focus_ended", { taskId: session.task_id });
  res.json(db.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(req.params.id));
});
