import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const projectsRouter = Router();

projectsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'open') AS open_task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_task_count
       FROM projects p WHERE p.is_archived = 0 ORDER BY p.created_at ASC`
    )
    .all();
  res.json(rows);
});

projectsRouter.post("/", (req, res) => {
  const { name, color, description } = req.body ?? {};
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name is required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, color, description, created_at, updated_at) VALUES (?,?,?,?,?,?)`
  ).run(id, name, color ?? null, description ?? null, now, now);
  res.status(201).json(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
});

projectsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const fields = ["name", "color", "description", "is_archived"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of fields) {
    if (f in req.body) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (updates.length) {
    values.push(new Date().toISOString(), req.params.id);
    db.prepare(`UPDATE projects SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`).run(...values);
  }
  res.json(db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id));
});

projectsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
