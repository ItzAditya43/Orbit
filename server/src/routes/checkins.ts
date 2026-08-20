import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const checkinsRouter = Router();

checkinsRouter.get("/", (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (from) { clauses.push("date >= ?"); params.push(from); }
  if (to) { clauses.push("date <= ?"); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  res.json(db.prepare(`SELECT * FROM daily_checkins ${where} ORDER BY date DESC`).all(...params));
});

checkinsRouter.get("/today", (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json(db.prepare("SELECT * FROM daily_checkins WHERE date = ?").get(today) ?? null);
});

// Fields not present in the body are left untouched (COALESCE against the existing row)
// rather than wiped to null — the Today widget calls this once per control (mood, energy,
// sleep, wake independently), so a naive "always set" would clobber whichever field wasn't
// part of the click that triggered the save.
checkinsRouter.put("/:date", (req, res) => {
  const { mood, energy, note, sleepTime, wakeTime } = req.body ?? {};
  const date = req.params.date;
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM daily_checkins WHERE date = ?").get(date) as any;
  if (existing) {
    db.prepare(
      "UPDATE daily_checkins SET mood = COALESCE(?, mood), energy = COALESCE(?, energy), note = COALESCE(?, note), sleep_time = COALESCE(?, sleep_time), wake_time = COALESCE(?, wake_time), updated_at = ? WHERE date = ?"
    ).run(mood ?? null, energy ?? null, note ?? null, sleepTime ?? null, wakeTime ?? null, now, date);
  } else {
    db.prepare(
      "INSERT INTO daily_checkins (id, date, mood, energy, note, sleep_time, wake_time, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(randomUUID(), date, mood ?? null, energy ?? null, note ?? null, sleepTime ?? null, wakeTime ?? null, now, now);
  }
  res.json(db.prepare("SELECT * FROM daily_checkins WHERE date = ?").get(date));
});
