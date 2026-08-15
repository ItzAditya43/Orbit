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

habitsRouter.get("/", (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  const habits = db
    .prepare(`SELECT * FROM habits ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY created_at ASC`)
    .all() as any[];
  const today = new Date().toISOString().slice(0, 10);
  const withLogs = habits.map((h) => {
    const logs = db.prepare("SELECT date, amount FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 90").all(h.id) as {
      date: string;
      amount: number;
    }[];
    const dates = logs.map((l) => l.date);
    const todayLog = logs.find((l) => l.date === today);
    const todayAmount = todayLog?.amount ?? 0;
    const doneToday = h.target_count ? todayAmount >= h.target_count : !!todayLog;
    let deadlineStatus: "ok" | "due-soon" | "missed" | null = null;
    if (h.deadline_time && !doneToday) {
      const [hh, mm] = h.deadline_time.split(":").map(Number);
      const now = new Date();
      const deadline = new Date(now);
      deadline.setHours(hh, mm, 0, 0);
      const minutesLeft = (deadline.getTime() - now.getTime()) / 60000;
      deadlineStatus = minutesLeft < 0 ? "missed" : minutesLeft <= 120 ? "due-soon" : "ok";
    }
    return {
      ...h,
      logs,
      streak: computeStreak(dates),
      totalCompletions: dates.length,
      todayAmount,
      doneToday,
      deadlineStatus,
    };
  });
  res.json(withLogs);
});

habitsRouter.post("/", (req, res) => {
  const { title, frequency, targetPerPeriod, deadlineTime, targetCount, unit } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  db.prepare(
    "INSERT INTO habits (id, title, frequency, target_per_period, deadline_time, target_count, unit, created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(id, title, frequency ?? "daily", targetPerPeriod ?? 1, deadlineTime ?? null, targetCount ?? null, unit ?? null, new Date().toISOString());
  res.status(201).json(db.prepare("SELECT * FROM habits WHERE id = ?").get(id));
});

habitsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM habits WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const { title, frequency, targetPerPeriod, deadlineTime, targetCount, unit, archived } = req.body ?? {};
  db.prepare(
    `UPDATE habits SET
      title = COALESCE(?, title),
      frequency = COALESCE(?, frequency),
      target_per_period = COALESCE(?, target_per_period),
      deadline_time = ?,
      target_count = ?,
      unit = ?,
      archived = COALESCE(?, archived)
     WHERE id = ?`
  ).run(
    title ?? null,
    frequency ?? null,
    targetPerPeriod ?? null,
    deadlineTime !== undefined ? deadlineTime : (existing as any).deadline_time,
    targetCount !== undefined ? targetCount : (existing as any).target_count,
    unit !== undefined ? unit : (existing as any).unit,
    archived === undefined ? null : archived ? 1 : 0,
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
