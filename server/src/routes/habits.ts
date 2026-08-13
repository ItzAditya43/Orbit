import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const habitsRouter = Router();

habitsRouter.get("/", (_req, res) => {
  const habits = db.prepare("SELECT * FROM habits ORDER BY created_at ASC").all() as any[];
  const withLogs = habits.map((h) => ({
    ...h,
    logs: db.prepare("SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 30").all(h.id),
  }));
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
    crypto.randomUUID(), req.params.id, date
  );
  res.status(201).json({ ok: true });
});

habitsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM habits WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
