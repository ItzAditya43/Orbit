import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const automationsRouter = Router();

automationsRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM automations ORDER BY created_at ASC").all());
});

automationsRouter.post("/", (req, res) => {
  const { name, triggerType, actionType, config } = req.body ?? {};
  if (!name || !triggerType || !actionType) return res.status(400).json({ error: "name, triggerType, actionType required" });
  const id = randomUUID();
  db.prepare(
    `INSERT INTO automations (id, name, trigger_type, action_type, config_json, created_at) VALUES (?,?,?,?,?,?)`
  ).run(id, name, triggerType, actionType, JSON.stringify(config ?? {}), new Date().toISOString());
  res.status(201).json(db.prepare("SELECT * FROM automations WHERE id = ?").get(id));
});

automationsRouter.patch("/:id", (req, res) => {
  const { isEnabled } = req.body ?? {};
  if (typeof isEnabled === "boolean") {
    db.prepare("UPDATE automations SET is_enabled = ? WHERE id = ?").run(isEnabled ? 1 : 0, req.params.id);
  }
  res.json(db.prepare("SELECT * FROM automations WHERE id = ?").get(req.params.id));
});

automationsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM automations WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

automationsRouter.get("/runs", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT r.*, a.name AS automation_name FROM automation_runs r
         JOIN automations a ON a.id = r.automation_id ORDER BY r.ran_at DESC LIMIT 100`
      )
      .all()
  );
});

export const notificationsRouter = Router();

notificationsRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100").all());
});

notificationsRouter.post("/:id/read", (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

notificationsRouter.post("/read-all", (_req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
  res.json({ ok: true });
});

// Scans for due/overdue open tasks and creates a notification for each one not already
// notified today. Meant to be polled by the client (no background scheduler exists yet).
notificationsRouter.post("/check-due", (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const dueTasks = db
    .prepare("SELECT id, title, due_date FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL AND due_date <= ?")
    .all(today) as { id: string; title: string; due_date: string }[];

  const created: any[] = [];
  for (const t of dueTasks) {
    const isOverdue = t.due_date < today;
    const message = `${isOverdue ? "Overdue" : "Due today"}: ${t.title}`;
    // Dedupe on "still unread" rather than "same calendar day" — a task that's been overdue for
    // a week shouldn't get a fresh notification every single day it stays overdue, piling up
    // into a wall of near-identical entries. Once you read/dismiss it, a new one can fire again.
    const already = db.prepare("SELECT id FROM notifications WHERE source = 'due-task' AND message = ? AND is_read = 0").get(message);
    if (already) continue;
    const id = randomUUID();
    db.prepare("INSERT INTO notifications (id, message, source, created_at) VALUES (?,?,?,?)").run(id, message, "due-task", new Date().toISOString());
    created.push({ id, message });
  }
  res.json({ created: created.length });
});

function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

// A recurring nudge ("check your Board/to-dos") independent of any specific task being due.
// The interval is enforced HERE, server-side, against the last periodic-reminder notification's
// timestamp — not by the client's poll cadence — so it stays correct no matter how often (or
// rarely, or from how many open windows) the client happens to call this, and can never double-
// fire from a client-side timer bug the way an earlier notification-spam issue did.
notificationsRouter.post("/check-periodic-reminder", (_req, res) => {
  const enabled = getSetting("periodicReminderEnabled", false);
  if (!enabled) return res.json({ created: 0 });

  const intervalMinutes = Math.max(1, Number(getSetting("periodicReminderIntervalMinutes", 60)));
  const message = String(getSetting("periodicReminderMessage", "Check your Board and to-dos") || "Check your Board and to-dos");

  const last = db.prepare("SELECT created_at FROM notifications WHERE source = 'periodic-reminder' ORDER BY created_at DESC LIMIT 1").get() as
    | { created_at: string }
    | undefined;
  const now = Date.now();
  if (last && now - new Date(last.created_at).getTime() < intervalMinutes * 60000) {
    return res.json({ created: 0 });
  }

  const id = randomUUID();
  db.prepare("INSERT INTO notifications (id, message, source, created_at) VALUES (?,?,?,?)").run(id, message, "periodic-reminder", new Date().toISOString());
  res.json({ created: 1 });
});
