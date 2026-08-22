import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const tagsRouter = Router();

tagsRouter.get("/", (_req, res) => {
  const tags = db.prepare("SELECT * FROM tags ORDER BY name ASC").all() as any[];
  const taskCount = db.prepare("SELECT COUNT(*) c FROM task_tags tt JOIN tasks t ON t.id = tt.task_id WHERE tt.tag_id = ? AND t.deleted_at IS NULL");
  const goalCount = db.prepare("SELECT COUNT(*) c FROM goal_tags gt JOIN goals g ON g.id = gt.goal_id WHERE gt.tag_id = ? AND g.status != 'abandoned'");
  const habitCount = db.prepare("SELECT COUNT(*) c FROM habit_tags ht JOIN habits h ON h.id = ht.habit_id WHERE ht.tag_id = ? AND h.archived = 0");
  res.json(
    tags.map((t) => ({
      ...t,
      task_count: (taskCount.get(t.id) as any).c,
      goal_count: (goalCount.get(t.id) as any).c,
      habit_count: (habitCount.get(t.id) as any).c,
    }))
  );
});

tagsRouter.post("/", (req, res) => {
  const { name, color } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO tags (id, name, color) VALUES (?,?,?)").run(id, name, color ?? null);
  } catch {
    return res.status(409).json({ error: "tag already exists" });
  }
  res.status(201).json(db.prepare("SELECT * FROM tags WHERE id = ?").get(id));
});

tagsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM tags WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// All tasks/goals/habits currently under this tag, for the Tags page.
tagsRouter.get("/:id/items", (req, res) => {
  const tasks = db
    .prepare(
      `SELECT t.id, t.title, t.status FROM tasks t JOIN task_tags tt ON tt.task_id = t.id
       WHERE tt.tag_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC`
    )
    .all(req.params.id);
  const goals = db
    .prepare(
      `SELECT g.id, g.title, g.status FROM goals g JOIN goal_tags gt ON gt.goal_id = g.id
       WHERE gt.tag_id = ? AND g.status != 'abandoned' ORDER BY g.created_at DESC`
    )
    .all(req.params.id);
  const habits = db
    .prepare(
      `SELECT h.id, h.title FROM habits h JOIN habit_tags ht ON ht.habit_id = h.id
       WHERE ht.tag_id = ? AND h.archived = 0 ORDER BY h.created_at DESC`
    )
    .all(req.params.id);
  res.json({ tasks, goals, habits });
});

// Attach/detach a tag to a task/goal/habit from the Tags page (rather than only from each
// item's own edit UI) — body: { kind: "task" | "goal" | "habit", itemId: string }.
tagsRouter.post("/:id/items", (req, res) => {
  const { kind, itemId } = req.body ?? {};
  const table = kind === "task" ? "task_tags" : kind === "goal" ? "goal_tags" : kind === "habit" ? "habit_tags" : null;
  const col = kind === "task" ? "task_id" : kind === "goal" ? "goal_id" : "habit_id";
  if (!table || !itemId) return res.status(400).json({ error: "kind and itemId required" });
  db.prepare(`INSERT OR IGNORE INTO ${table} (${col}, tag_id) VALUES (?,?)`).run(itemId, req.params.id);
  res.status(201).json({ ok: true });
});

tagsRouter.delete("/:id/items/:kind/:itemId", (req, res) => {
  const { kind, itemId } = req.params;
  const table = kind === "task" ? "task_tags" : kind === "goal" ? "goal_tags" : kind === "habit" ? "habit_tags" : null;
  const col = kind === "task" ? "task_id" : kind === "goal" ? "goal_id" : "habit_id";
  if (!table) return res.status(400).json({ error: "invalid kind" });
  db.prepare(`DELETE FROM ${table} WHERE ${col} = ? AND tag_id = ?`).run(itemId, req.params.id);
  res.status(204).end();
});
