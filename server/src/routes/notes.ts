import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const notesRouter = Router();

notesRouter.get("/", (req, res) => {
  const { projectId, taskId } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (projectId) { clauses.push("project_id = ?"); params.push(projectId); }
  if (taskId) { clauses.push("task_id = ?"); params.push(taskId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  res.json(db.prepare(`SELECT * FROM notes ${where} ORDER BY updated_at DESC`).all(...params));
});

notesRouter.post("/", (req, res) => {
  const { title, body, projectId, taskId } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notes (id, title, body, project_id, task_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
  ).run(id, title, body ?? null, projectId ?? null, taskId ?? null, now, now);
  res.status(201).json(db.prepare("SELECT * FROM notes WHERE id = ?").get(id));
});

notesRouter.patch("/:id", (req, res) => {
  const { title, body } = req.body ?? {};
  db.prepare("UPDATE notes SET title = COALESCE(?, title), body = COALESCE(?, body), updated_at = ? WHERE id = ?").run(
    title ?? null, body ?? null, new Date().toISOString(), req.params.id
  );
  res.json(db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id));
});

notesRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
