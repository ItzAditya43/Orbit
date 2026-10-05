import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { addDays, daysBetween, localDay, localToday, weekday } from "../dates.js";

export const habitsRouter = Router();

function computeStreak(dates: string[]): number {
  // dates sorted descending, YYYY-MM-DD strings
  if (dates.length === 0) return 0;
  const today = localToday();
  if (dates[0] !== today && dates[0] !== addDays(today, -1)) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] !== addDays(dates[0], -i)) break;
    streak++;
  }
  return streak;
}

// Monday-start ISO week, so "3/4 this week" means the same thing to a user regardless of
// which day they check on, not a rolling 7-day window that shifts under them.
function currentWeekStart(): string {
  const today = localToday();
  return addDays(today, -((weekday(today) + 6) % 7)); // back to Monday
}
function currentMonthStart(): string {
  return `${localToday().slice(0, 7)}-01`;
}
// Monday-anchored 14-day buckets from a fixed epoch, so "this fortnight" is a stable, shared
// boundary rather than "the 14 days since whenever you happened to create the habit."
function currentBiweekStart(): string {
  const weekStart = currentWeekStart();
  const weeksSinceEpoch = Math.floor(daysBetween("2024-01-01", weekStart) / 7); // 2024-01-01 is a Monday
  return addDays(weekStart, -(weeksSinceEpoch % 2) * 7);
}

habitsRouter.get("/", (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  const habits = db
    .prepare(`SELECT * FROM habits ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY order_index ASC, created_at ASC`)
    .all() as any[];
  const today = localToday();
  const weekStart = currentWeekStart();
  const monthStart = currentMonthStart();
  const withLogs = habits.map((h) => {
    const logs = db.prepare("SELECT date, amount FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 90").all(h.id) as {
      date: string;
      amount: number;
    }[];
    const dates = logs.map((l) => l.date);
    const todayLog = logs.find((l) => l.date === today);
    const todayAmount = todayLog?.amount ?? 0;

    let periodProgress: { completed: number; target: number; label: string } | null = null;
    if (h.frequency === "weekly") {
      const completed = logs.filter((l) => l.date >= weekStart).length;
      periodProgress = { completed, target: h.target_per_period ?? 1, label: "this week" };
    } else if (h.frequency === "biweekly") {
      const biweekStart = currentBiweekStart();
      const completed = logs.filter((l) => l.date >= biweekStart).length;
      periodProgress = { completed, target: h.target_per_period ?? 1, label: "this fortnight" };
    } else if (h.frequency === "monthly") {
      const completed = logs.filter((l) => l.date >= monthStart).length;
      periodProgress = { completed, target: h.target_per_period ?? 1, label: "this month" };
    }

    // custom_days: only "due" on specific weekdays (e.g. Mon/Wed/Fri). interval: due every
    // N days counting from when the habit was created (e.g. interval_days=2 -> alternate days).
    const customDays: number[] | null = h.custom_days ? JSON.parse(h.custom_days) : null;
    const dueToday =
      customDays !== null
        ? customDays.includes(weekday(today))
        : h.interval_days
          ? daysBetween(localDay(h.created_at), today) % h.interval_days === 0
          : true;

    const doneToday = periodProgress
      ? periodProgress.completed >= periodProgress.target
      : !dueToday
        ? true // nothing to do today on an off-day — don't nag or show it as overdue
        : h.target_count
          ? todayAmount >= h.target_count
          : !!todayLog;

    let deadlineStatus: "ok" | "due-soon" | "missed" | null = null;
    if (h.deadline_time && !doneToday && !periodProgress) {
      const [hh, mm] = h.deadline_time.split(":").map(Number);
      const now = new Date();
      const deadline = new Date(now);
      deadline.setHours(hh, mm, 0, 0);
      const minutesLeft = (deadline.getTime() - now.getTime()) / 60000;
      deadlineStatus = minutesLeft < 0 ? "missed" : minutesLeft <= 120 ? "due-soon" : "ok";
    }
    const tags = db.prepare(`SELECT t.* FROM tags t JOIN habit_tags ht ON ht.tag_id = t.id WHERE ht.habit_id = ?`).all(h.id);
    return {
      ...h,
      customDays,
      dueToday,
      logs,
      streak: computeStreak(dates),
      totalCompletions: dates.length,
      todayAmount,
      doneToday,
      loggedToday: !!todayLog,
      deadlineStatus,
      periodProgress,
      tags,
    };
  });
  res.json(withLogs);
});

habitsRouter.post("/", (req, res) => {
  const { title, frequency, targetPerPeriod, deadlineTime, targetCount, unit, goalId, customDays, intervalDays } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  db.prepare(
    `INSERT INTO habits (id, title, frequency, target_per_period, deadline_time, target_count, unit, goal_id, custom_days, interval_days, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, title, frequency ?? "daily", targetPerPeriod ?? 1, deadlineTime ?? null, targetCount ?? null, unit ?? null, goalId ?? null,
    Array.isArray(customDays) ? JSON.stringify(customDays) : null, intervalDays ?? null,
    new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM habits WHERE id = ?").get(id));
});

// Body: { ids: string[] } — the full list of habit ids in their new display order.
habitsRouter.post("/reorder", (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
  const update = db.prepare("UPDATE habits SET order_index = ? WHERE id = ?");
  const tx = db.transaction((list: string[]) => {
    list.forEach((id, i) => update.run(i, id));
  });
  tx(ids);
  res.json({ ok: true });
});

habitsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM habits WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "not found" });
  const { title, frequency, targetPerPeriod, deadlineTime, targetCount, unit, archived, goalId, customDays, intervalDays, urgentOverride, importantOverride } =
    req.body ?? {};
  db.prepare(
    `UPDATE habits SET
      title = COALESCE(?, title),
      frequency = COALESCE(?, frequency),
      target_per_period = COALESCE(?, target_per_period),
      deadline_time = ?,
      target_count = ?,
      unit = ?,
      archived = COALESCE(?, archived),
      goal_id = ?,
      custom_days = ?,
      interval_days = ?,
      urgent_override = ?,
      important_override = ?
     WHERE id = ?`
  ).run(
    title ?? null,
    frequency ?? null,
    targetPerPeriod ?? null,
    deadlineTime !== undefined ? deadlineTime : existing.deadline_time,
    targetCount !== undefined ? targetCount : existing.target_count,
    unit !== undefined ? unit : existing.unit,
    archived === undefined ? null : archived ? 1 : 0,
    goalId !== undefined ? goalId : existing.goal_id,
    customDays !== undefined ? (Array.isArray(customDays) ? JSON.stringify(customDays) : null) : existing.custom_days,
    intervalDays !== undefined ? intervalDays : existing.interval_days,
    urgentOverride !== undefined ? (urgentOverride === null ? null : urgentOverride ? 1 : 0) : existing.urgent_override,
    importantOverride !== undefined ? (importantOverride === null ? null : importantOverride ? 1 : 0) : existing.important_override,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM habits WHERE id = ?").get(req.params.id));
});

// Logs a completion for `date` (defaults to today). For quantity habits, `amount` adds to
// the running total for that day instead of just marking a boolean done.
habitsRouter.post("/:id/log", (req, res) => {
  const date = req.body?.date ?? localToday();
  const amount = Number(req.body?.amount ?? 1);
  db.prepare(
    `INSERT INTO habit_logs (id, habit_id, date, amount) VALUES (?,?,?,?)
     ON CONFLICT(habit_id, date) DO UPDATE SET amount = amount + excluded.amount`
  ).run(randomUUID(), req.params.id, date, amount);
  const row = db.prepare("SELECT amount FROM habit_logs WHERE habit_id = ? AND date = ?").get(req.params.id, date) as any;
  res.status(201).json({ ok: true, amount: row?.amount ?? amount });
});

habitsRouter.delete("/:id/log", (req, res) => {
  const date = req.body?.date ?? localToday();
  db.prepare("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?").run(req.params.id, date);
  res.status(204).end();
});

habitsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM habits WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
