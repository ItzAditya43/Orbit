import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const notesRouter = Router();

notesRouter.get("/", (req, res) => {
  const { projectId, taskId, q } = req.query as Record<string, string | undefined>;

  if (q) {
    const rows = db
      .prepare(
        `SELECT notes.* FROM notes_fts JOIN notes ON notes.rowid = notes_fts.rowid
         WHERE notes_fts MATCH ? ORDER BY rank`
      )
      .all(q + "*");
    return res.json(rows);
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (projectId) { clauses.push("project_id = ?"); params.push(projectId); }
  if (taskId) { clauses.push("task_id = ?"); params.push(taskId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  res.json(db.prepare(`SELECT * FROM notes ${where} ORDER BY pinned DESC, updated_at DESC`).all(...params));
});

notesRouter.post("/", (req, res) => {
  const { title, body, color, projectId, taskId } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notes (id, title, body, color, project_id, task_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, title, body ?? null, color ?? null, projectId ?? null, taskId ?? null, now, now);
  res.status(201).json(db.prepare("SELECT * FROM notes WHERE id = ?").get(id));
});

notesRouter.patch("/:id", (req, res) => {
  const { title, body, color, pinned } = req.body ?? {};
  db.prepare(
    `UPDATE notes SET title = COALESCE(?, title), body = COALESCE(?, body), color = COALESCE(?, color), pinned = COALESCE(?, pinned), updated_at = ? WHERE id = ?`
  ).run(title ?? null, body ?? null, color ?? null, typeof pinned === "boolean" ? (pinned ? 1 : 0) : null, new Date().toISOString(), req.params.id);
  res.json(db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id));
});

notesRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

notesRouter.post("/:id/convert-to-task", (req, res) => {
  const note: any = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  if (!note) return res.status(404).json({ error: "not found" });
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`INSERT INTO tasks (id, title, notes, project_id, is_inbox, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`).run(
    id,
    note.title,
    note.body,
    note.project_id,
    note.project_id ? 0 : 1,
    now,
    now
  );
  db.prepare("DELETE FROM notes WHERE id = ?").run(note.id);
  res.status(201).json(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
});
