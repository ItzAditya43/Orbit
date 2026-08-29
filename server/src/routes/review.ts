import { Router } from "express";
import { db } from "../db.js";

export const reviewRouter = Router();

reviewRouter.get("/daily", (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const completed = db.prepare("SELECT id, title FROM tasks WHERE deleted_at IS NULL AND substr(completed_at, 1, 10) = ?").all(today);
  const carriedOver = db
    .prepare("SELECT id, title, due_date FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL AND due_date < ?")
    .all(today);
  const dueToday = db.prepare("SELECT id, title FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND due_date = ?").all(today);
  const focusMinutes = (
    db
      .prepare(
        `SELECT COALESCE(SUM((julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 1440), 0) AS m
         FROM focus_sessions WHERE was_completed = 1 AND substr(started_at, 1, 10) = ?`
      )
      .get(today) as any
  ).m;

  const habitRows = db
    .prepare("SELECT id, title, target_count, frequency, custom_days, interval_days, created_at FROM habits WHERE archived = 0 AND frequency IN ('daily','custom_days','interval')")
    .all() as any[];
  const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const habitsMissed = habitRows.filter((h) => {
    const dueToday =
      h.frequency === "custom_days"
        ? (h.custom_days ? JSON.parse(h.custom_days) : []).includes(todayWeekday)
        : h.frequency === "interval" && h.interval_days
          ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${h.created_at.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000) % h.interval_days === 0
          : true;
    if (!dueToday) return false;
    const log = db.prepare("SELECT amount FROM habit_logs WHERE habit_id = ? AND date = ?").get(h.id, today) as any;
    const amount = log?.amount ?? 0;
    return h.target_count ? amount < h.target_count : !log;
  });

  const goalRows = db.prepare("SELECT id, title, target_date, progress FROM goals WHERE status = 'active'").all() as any[];
  const goalsStalled = goalRows.filter((g) => g.target_date && g.target_date < today && (g.progress ?? 0) < 1);

  res.json({
    date: today,
    completed,
    carriedOver,
    dueToday,
    focusMinutes: Math.round(focusMinutes),
    habitsMissed,
    goalsStalled,
    summary: `${completed.length} task${completed.length === 1 ? "" : "s"} completed today. ${carriedOver.length} overdue task${
      carriedOver.length === 1 ? "" : "s"
    } carried over. ${Math.round(focusMinutes)} minutes of focused work logged. ${habitsMissed.length} habit${
      habitsMissed.length === 1 ? "" : "s"
    } not yet done today.`,
  });
});

reviewRouter.get("/weekly", (_req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const completed = db
    .prepare("SELECT id, title, completed_at FROM tasks WHERE deleted_at IS NULL AND completed_at >= ? ORDER BY completed_at DESC")
    .all(weekAgo);
  const created = (db.prepare("SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND created_at >= ?").get(weekAgo) as any).c;
  const stillOpen = db
    .prepare(
      "SELECT id, title, due_date FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL AND due_date < date('now') ORDER BY due_date ASC"
    )
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
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status = 'done' AND t.completed_at >= ?) AS completed_this_week,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status = 'open') AS still_open
       FROM projects p WHERE p.is_archived = 0 AND p.deleted_at IS NULL`
    )
    .all(weekAgo);
  const stalledProjects = (projectProgress as any[]).filter((p) => p.completed_this_week === 0 && p.still_open > 0);

  const habitWeekStats = (
    db.prepare("SELECT id, title FROM habits WHERE archived = 0").all() as { id: string; title: string }[]
  ).map((h) => {
    const daysLogged = (
      db.prepare("SELECT COUNT(DISTINCT date) c FROM habit_logs WHERE habit_id = ? AND date >= ?").get(h.id, weekAgo.slice(0, 10)) as any
    ).c;
    return { id: h.id, title: h.title, daysLogged };
  });
  const habitsNeglected = habitWeekStats.filter((h) => h.daysLogged === 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const goalsStalled = (
    db.prepare("SELECT id, title, target_date, progress FROM goals WHERE status = 'active'").all() as any[]
  ).filter((g) => g.target_date && g.target_date < todayStr && (g.progress ?? 0) < 1);

  res.json({
    weekStart: weekAgo.slice(0, 10),
    completed,
    createdCount: created,
    stillOpen,
    focusMinutes: Math.round(focusMinutes),
    projectProgress,
    stalledProjects,
    habitWeekStats,
    habitsNeglected,
    goalsStalled,
    summary: `${completed.length} tasks completed this week (${created} created). ${stillOpen.length} tasks are overdue. ${Math.round(
      focusMinutes
    )} minutes of focused work logged. ${stalledProjects.length} project${stalledProjects.length === 1 ? "" : "s"} had no completions this week. ${
      habitsNeglected.length
    } habit${habitsNeglected.length === 1 ? "" : "s"} untouched all week.`,
  });
});
