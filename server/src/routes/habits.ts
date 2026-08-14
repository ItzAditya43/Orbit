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

habitsRouter.get("/", (_req, res) => {
  const habits = db.prepare("SELECT * FROM habits ORDER BY created_at ASC").all() as any[];
  const withLogs = habits.map((h) => {
    const logs = db.prepare("SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 90").all(h.id) as { date: string }[];
    const dates = logs.map((l) => l.date);
    return { ...h, logs, streak: computeStreak(dates), totalCompletions: dates.length };
  });
  res.json(withLogs);
});

habitsRouter.post("/", (req, res) => {
  const { title, frequency, targetPerPeriod } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  db.prepare("INSERT INTO habits (id, title, frequency, target_per_period, created_at) VALUES (?,?,?,?,?)").run(
    id, title, frequency ?? "daily", targetPerPeriod ?? 1, new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM habits WHERE id = ?").get(id));
});

habitsRouter.post("/:id/log", (req, res) => {
  const date = req.body?.date ?? new Date().toISOString().slice(0, 10);
  db.prepare("INSERT OR IGNORE INTO habit_logs (id, habit_id, date) VALUES (?,?,?)").run(
    randomUUID(), req.params.id, date
  );
  res.status(201).json({ ok: true });
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
