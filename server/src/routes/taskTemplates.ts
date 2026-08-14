import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const taskTemplatesRouter = Router();

function hydrate(t: any) {
  if (!t) return t;
  return { ...t, subtasks: JSON.parse(t.subtasks_json || "[]") };
}

taskTemplatesRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM task_templates ORDER BY created_at DESC").all();
  res.json(rows.map(hydrate));
});

taskTemplatesRouter.post("/", (req, res) => {
  const { name, title, notes, priority, estimateMinutes, projectId, subtasks } = req.body ?? {};
  if (!name || !title) return res.status(400).json({ error: "name and title required" });
  const id = randomUUID();
  db.prepare(
    `INSERT INTO task_templates (id, name, title, notes, priority, estimate_minutes, project_id, subtasks_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    name,
    title,
    notes ?? null,
    priority ?? "none",
    estimateMinutes ?? null,
    projectId ?? null,
    JSON.stringify(Array.isArray(subtasks) ? subtasks : []),
    new Date().toISOString()
  );
  res.status(201).json(hydrate(db.prepare("SELECT * FROM task_templates WHERE id = ?").get(id)));
});

taskTemplatesRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM task_templates WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Instantiate a template into a real task (+ its subtasks)
taskTemplatesRouter.post("/:id/instantiate", (req, res) => {
  const template: any = db.prepare("SELECT * FROM task_templates WHERE id = ?").get(req.params.id);
  if (!template) return res.status(404).json({ error: "not found" });
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tasks (id, title, notes, priority, estimate_minutes, project_id, due_date, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, template.title, template.notes, template.priority, template.estimate_minutes, template.project_id, req.body?.dueDate ?? null, now, now);

  const subtasks = JSON.parse(template.subtasks_json || "[]") as string[];
  const stmt = db.prepare(`INSERT INTO tasks (id, title, parent_id, created_at, updated_at) VALUES (?,?,?,?,?)`);
  for (const title of subtasks) {
    stmt.run(randomUUID(), title, id, now, now);
  }

  res.status(201).json(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
});
