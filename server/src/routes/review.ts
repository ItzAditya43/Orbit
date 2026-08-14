import { Router } from "express";
import { db } from "../db.js";

export const reviewRouter = Router();

reviewRouter.get("/daily", (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const completed = db.prepare("SELECT id, title FROM tasks WHERE substr(completed_at, 1, 10) = ?").all(today);
  const carriedOver = db
    .prepare("SELECT id, title, due_date FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date < ?")
    .all(today);
  const dueToday = db.prepare("SELECT id, title FROM tasks WHERE status = 'open' AND due_date = ?").all(today);
  const focusMinutes = (
    db
      .prepare(
        `SELECT COALESCE(SUM((julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 1440), 0) AS m
         FROM focus_sessions WHERE was_completed = 1 AND substr(started_at, 1, 10) = ?`
      )
      .get(today) as any
  ).m;

  res.json({
    date: today,
    completed,
    carriedOver,
    dueToday,
    focusMinutes: Math.round(focusMinutes),
    summary: `${completed.length} task${completed.length === 1 ? "" : "s"} completed today. ${carriedOver.length} overdue task${
      carriedOver.length === 1 ? "" : "s"
    } carried over. ${Math.round(focusMinutes)} minutes of focused work logged.`,
  });
});

reviewRouter.get("/weekly", (_req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const completed = db.prepare("SELECT id, title, completed_at FROM tasks WHERE completed_at >= ? ORDER BY completed_at DESC").all(weekAgo);
  const created = (db.prepare("SELECT COUNT(*) c FROM tasks WHERE created_at >= ?").get(weekAgo) as any).c;
  const stillOpen = db
    .prepare("SELECT id, title, due_date FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date < date('now') ORDER BY due_date ASC")
    .all();
  const focusMinutes = (
    db
      .prepare(
        `SELECT COALESCE(SUM((julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 1440), 0) AS m
         FROM focus_sessions WHERE was_completed = 1 AND started_at >= ?`
      )
      .get(weekAgo) as any
  ).m;
  const projectProgress = db
    .prepare(
      `SELECT p.name,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done' AND t.completed_at >= ?) AS completed_this_week,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'open') AS still_open
       FROM projects p WHERE p.is_archived = 0`
    )
    .all(weekAgo);
  const stalledProjects = (projectProgress as any[]).filter((p) => p.completed_this_week === 0 && p.still_open > 0);

  res.json({
    weekStart: weekAgo.slice(0, 10),
    completed,
    createdCount: created,
    stillOpen,
    focusMinutes: Math.round(focusMinutes),
    projectProgress,
    stalledProjects,
    summary: `${completed.length} tasks completed this week (${created} created). ${stillOpen.length} tasks are overdue. ${Math.round(
      focusMinutes
    )} minutes of focused work logged. ${stalledProjects.length} project${stalledProjects.length === 1 ? "" : "s"} had no completions this week.`,
  });
});
