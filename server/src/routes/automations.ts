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
  res.json(db.prepare("SELECT * FROM automation_runs ORDER BY ran_at DESC LIMIT 100").all());
});

export const notificationsRouter = Router();

notificationsRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100").all());
});

notificationsRouter.post("/:id/read", (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});
