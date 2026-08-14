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
    .prepare("SELECT id, title, due_date FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND due_date <= ?")
    .all(today) as { id: string; title: string; due_date: string }[];

  const created: any[] = [];
  for (const t of dueTasks) {
    const isOverdue = t.due_date < today;
    const message = `${isOverdue ? "Overdue" : "Due today"}: ${t.title}`;
    const already = db
      .prepare("SELECT id FROM notifications WHERE source = 'due-task' AND message = ? AND substr(created_at,1,10) = ?")
      .get(message, today);
    if (already) continue;
    const id = randomUUID();
    db.prepare("INSERT INTO notifications (id, message, source, created_at) VALUES (?,?,?,?)").run(id, message, "due-task", new Date().toISOString());
    created.push({ id, message });
  }
  res.json({ created: created.length });
});
