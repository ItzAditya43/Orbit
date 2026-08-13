import { Router } from "express";
import { db } from "../db.js";

export const analyticsRouter = Router();

analyticsRouter.get("/summary", (_req, res) => {
  const totalOpen = (db.prepare("SELECT COUNT(*) c FROM tasks WHERE status = 'open'").get() as any).c;
  const totalDone = (db.prepare("SELECT COUNT(*) c FROM tasks WHERE status = 'done'").get() as any).c;
  const overdue = (
    db
      .prepare("SELECT COUNT(*) c FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date < date('now')")
      .get() as any
  ).c;
  const estimateVsActual = db
    .prepare(
      `SELECT id, title, estimate_minutes, actual_minutes FROM tasks WHERE status = 'done' AND estimate_minutes IS NOT NULL ORDER BY completed_at DESC LIMIT 20`
    )
    .all();
  const completedByDay = db
    .prepare(
      `SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS count FROM tasks WHERE completed_at IS NOT NULL GROUP BY day ORDER BY day DESC LIMIT 14`
    )
    .all();
  const focusMinutesByDay = db
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day, SUM((julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 1440) AS minutes
       FROM focus_sessions WHERE was_completed = 1 GROUP BY day ORDER BY day DESC LIMIT 14`
    )
    .all();
  const projectVelocity = db
    .prepare(
      `SELECT p.name, COUNT(t.id) AS completed_count
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.status = 'done' GROUP BY p.id ORDER BY completed_count DESC`
    )
    .all();

  res.json({ totalOpen, totalDone, overdue, estimateVsActual, completedByDay, focusMinutesByDay, projectVelocity });
});
