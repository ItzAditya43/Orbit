import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const habitsRouter = Router();

function computeStreak(dates: string[]): number {
  // dates sorted descending, YYYY-MM-DD strings
  if (dates.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 1;
  let cursor = new Date(dates[0]);
  for (let i = 1; i < dates.length; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const expected = cursor.toISOString().slice(0, 10);
    if (dates[i] === expected) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// "Today" everywhere in this file (and the DB) is a UTC date string, not a local wall-clock
// date — so weekday must be derived from that same UTC string, never from Date#getDay() on
// "now" directly. Those two disagree for part of the day in any timezone ahead of UTC (e.g.
// IST): local getDay() can already be "tomorrow" while the UTC date string is still "today",
// which silently broke custom-day habit due-ness right around local midnight.
function isoWeekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

// Monday-start ISO week, so "3/4 this week" means the same thing to a user regardless of
// which day they check on, not a rolling 7-day window that shifts under them.
function currentWeekStart(): string {
  const today = new Date().toISOString().slice(0, 10);
  const day = (isoWeekday(today) + 6) % 7; // 0 = Monday
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
// Monday-anchored 14-day buckets from a fixed epoch, so "this fortnight" is a stable, shared
// boundary rather than "the 14 days since whenever you happened to create the habit."
function currentBiweekStart(): string {
  const epochMonday = new Date(2024, 0, 1); // a Monday
  const monday = fromISO(currentWeekStart());
  const diffWeeks = Math.floor((monday.getTime() - epochMonday.getTime()) / (7 * 86400000));
  const biweekStartWeeks = diffWeeks - (diffWeeks % 2);
  const d = new Date(epochMonday);
  d.setDate(d.getDate() + biweekStartWeeks * 7);
  return d.toISOString().slice(0, 10);
}
function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

habitsRouter.get("/", (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  const habits = db
    .prepare(`SELECT * FROM habits ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY order_index ASC, created_at ASC`)
    .all() as any[];
  const today = new Date().toISOString().slice(0, 10);
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
        ? customDays.includes(isoWeekday(today))
        : h.interval_days
          ? daysBetween(h.created_at.slice(0, 10), today) % h.interval_days === 0
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
  const date = req.body?.date ?? new Date().toISOString().slice(0, 10);
  const amount = Number(req.body?.amount ?? 1);
  db.prepare(
    `INSERT INTO habit_logs (id, habit_id, date, amount) VALUES (?,?,?,?)
     ON CONFLICT(habit_id, date) DO UPDATE SET amount = amount + excluded.amount`
  ).run(randomUUID(), req.params.id, date, amount);
  const row = db.prepare("SELECT amount FROM habit_logs WHERE habit_id = ? AND date = ?").get(req.params.id, date) as any;
  res.status(201).json({ ok: true, amount: row?.amount ?? amount });
});

habitsRouter.delete("/:id/log", (req, res) => {
  const date = req.body?.date ?? new Date().toISOString().slice(0, 10);
  db.prepare("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?").run(req.params.id, date);
  res.status(204).end();
});

habitsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM habits WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
