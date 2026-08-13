import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const goalsRouter = Router();

goalsRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM goals WHERE status != 'abandoned' ORDER BY created_at ASC").all());
});

goalsRouter.post("/", (req, res) => {
  const { title, horizon, parentId, projectId, targetDate } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO goals (id, title, horizon, parent_id, project_id, target_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, title, horizon ?? "monthly", parentId ?? null, projectId ?? null, targetDate ?? null, now, now);
  res.status(201).json(db.prepare("SELECT * FROM goals WHERE id = ?").get(id));
});

goalsRouter.patch("/:id", (req, res) => {
  const { progress, status, title, targetDate } = req.body ?? {};
  db.prepare(
    `UPDATE goals SET progress = COALESCE(?, progress), status = COALESCE(?, status), title = COALESCE(?, title), target_date = COALESCE(?, target_date), updated_at = ? WHERE id = ?`
  ).run(progress ?? null, status ?? null, title ?? null, targetDate ?? null, new Date().toISOString(), req.params.id);
  res.json(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id));
});

goalsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM goals WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
