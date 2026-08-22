import { Router } from "express";
import { db } from "../db.js";

export const analyticsRouter = Router();

analyticsRouter.get("/summary", (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const days = from && to ? Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000)) : 14;
  const fromClause = from ? "AND day >= ?" : "";
  const toClause = to ? "AND day <= ?" : "";

  const totalOpen = (db.prepare("SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND status = 'open'").get() as any).c;
  const totalDone = (db.prepare("SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND status = 'done'").get() as any).c;
  const overdue = (
    db
      .prepare("SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL AND due_date < date('now')")
      .get() as any
  ).c;
  const estimateVsActual = db
    .prepare(
      `SELECT id, title, estimate_minutes, actual_minutes FROM tasks WHERE deleted_at IS NULL AND status = 'done' AND estimate_minutes IS NOT NULL ORDER BY completed_at DESC LIMIT 20`
    )
    .all();
  const completedByDayParams = [from, to].filter(Boolean);
  const completedByDay = db
    .prepare(
      `SELECT day, COUNT(*) AS count FROM (SELECT substr(completed_at, 1, 10) AS day FROM tasks WHERE deleted_at IS NULL AND completed_at IS NOT NULL)
       WHERE 1=1 ${fromClause} ${toClause} GROUP BY day ORDER BY day DESC LIMIT ?`
    )
    .all(...completedByDayParams, days);
  const focusMinutesByDay = db
    .prepare(
      `SELECT day, SUM(minutes) AS minutes FROM (
         SELECT substr(started_at, 1, 10) AS day, (julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 1440 AS minutes
         FROM focus_sessions WHERE was_completed = 1
       ) WHERE 1=1 ${fromClause} ${toClause} GROUP BY day ORDER BY day DESC LIMIT ?`
    )
    .all(...completedByDayParams, days);
  const projectVelocity = db
    .prepare(
      `SELECT p.name, COUNT(t.id) AS completed_count
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.deleted_at IS NULL AND t.status = 'done' GROUP BY p.id ORDER BY completed_count DESC`
    )
    .all();

  // Habits: per-habit streak + completions in range, plus an overall today-completion rate.
  const habitRows = db.prepare("SELECT id, title, target_count FROM habits WHERE archived = 0").all() as {
    id: string;
    title: string;
    target_count: number | null;
  }[];
  const habitStats = habitRows.map((h) => {
    const logs = db.prepare("SELECT date, amount FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 90").all(h.id) as {
      date: string;
      amount: number;
    }[];
    const dates = logs.map((l) => l.date);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let streak = 0;
    if (dates.length && (dates[0] === today || dates[0] === yesterday)) {
      streak = 1;
      const cursor = new Date(dates[0]);
      for (let i = 1; i < dates.length; i++) {
        cursor.setDate(cursor.getDate() - 1);
        if (dates[i] === cursor.toISOString().slice(0, 10)) streak++;
        else break;
      }
    }
    const inRange = dates.filter((d) => (!from || d >= from) && (!to || d <= to)).length;
    const todayLog = logs.find((l) => l.date === today);
    const completedToday = h.target_count ? (todayLog?.amount ?? 0) >= h.target_count : !!todayLog;
    return { id: h.id, title: h.title, streak, completedToday, totalCompletions: dates.length, completionsInRange: inRange };
  });
  const habitsCompletedToday = habitStats.filter((h) => h.completedToday).length;

  // Goals: overall progress + breakdown by horizon.
  const goalRows = db.prepare("SELECT horizon, status, progress FROM goals WHERE status != 'abandoned'").all() as any[];
  const goalsActive = goalRows.filter((g) => g.status === "active").length;
  const goalsDone = goalRows.filter((g) => g.status === "done").length;
  const avgGoalProgress = goalRows.length ? goalRows.reduce((s, g) => s + (g.progress ?? 0), 0) / goalRows.length : 0;
  const goalsByHorizon = Object.entries(
    goalRows.reduce((acc: Record<string, number>, g) => ((acc[g.horizon] = (acc[g.horizon] ?? 0) + 1), acc), {})
  ).map(([horizon, count]) => ({ horizon, count }));

  const totalNotes = (db.prepare("SELECT COUNT(*) c FROM notes").get() as any).c;

  const timeTrackedMinutes = (
    db
      .prepare(
        `SELECT COALESCE(SUM(duration_seconds), 0) / 60.0 AS minutes FROM time_entries
         WHERE ended_at IS NOT NULL ${from ? "AND started_at >= ?" : ""} ${to ? "AND started_at <= ?" : ""}`
      )
      .get(...[from, to].filter(Boolean)) as any
  ).minutes;

  const upcomingEvents = (
    db.prepare("SELECT COUNT(*) c FROM calendar_events WHERE starts_at >= datetime('now')").get() as any
  ).c;

  const checkinClauses: string[] = [];
  const checkinParams: unknown[] = [];
  if (from) { checkinClauses.push("date >= ?"); checkinParams.push(from); }
  if (to) { checkinClauses.push("date <= ?"); checkinParams.push(to); }
  const checkinWhere = checkinClauses.length ? `WHERE ${checkinClauses.join(" AND ")}` : "";
  const checkins = db.prepare(`SELECT date, mood, energy FROM daily_checkins ${checkinWhere} ORDER BY date DESC LIMIT ?`).all(...checkinParams, days);

  res.json({
    totalOpen,
    totalDone,
    overdue,
    estimateVsActual,
    completedByDay,
    focusMinutesByDay,
    projectVelocity,
    rangeDays: days,
    habits: { total: habitRows.length, completedToday: habitsCompletedToday, stats: habitStats },
    goals: { active: goalsActive, done: goalsDone, avgProgress: avgGoalProgress, byHorizon: goalsByHorizon },
    notes: { total: totalNotes },
    timeTrackedMinutes,
    upcomingEvents,
    checkins,
  });
});
