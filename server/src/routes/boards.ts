import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const boardsRouter = Router();

function hydrate(row: any) {
  if (!row) return row;
  return { ...row, elements: JSON.parse(row.elements || "[]") };
}

boardsRouter.get("/", (req, res) => {
  const { projectId } = req.query as Record<string, string | undefined>;
  const rows = projectId
    ? db.prepare("SELECT * FROM boards WHERE project_id = ? ORDER BY created_at ASC").all(projectId)
    : db.prepare("SELECT * FROM boards ORDER BY created_at ASC").all();
  res.json(rows.map(hydrate));
});

boardsRouter.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM boards WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(hydrate(row));
});

boardsRouter.post("/", (req, res) => {
  const { title, projectId } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO boards (id, title, project_id, elements, created_at, updated_at) VALUES (?,?,?,?,?,?)").run(
    id, title, projectId ?? null, "[]", now, now
  );
  res.status(201).json(hydrate(db.prepare("SELECT * FROM boards WHERE id = ?").get(id)));
});

boardsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM boards WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const { title, elements } = req.body ?? {};
  db.prepare("UPDATE boards SET title = COALESCE(?, title), elements = COALESCE(?, elements), updated_at = ? WHERE id = ?").run(
    title ?? null,
    elements !== undefined ? JSON.stringify(elements) : null,
    new Date().toISOString(),
    req.params.id
  );
  res.json(hydrate(db.prepare("SELECT * FROM boards WHERE id = ?").get(req.params.id)));
});

boardsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM boards WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
