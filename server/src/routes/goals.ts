import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const goalsRouter = Router();

function hydrate(goal: any) {
  if (!goal) return goal;
  const milestones = db.prepare("SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY order_index ASC").all(goal.id);
  const habits = db.prepare("SELECT id, title, frequency FROM habits WHERE goal_id = ? AND archived = 0").all(goal.id);
  return { ...goal, milestones, habits };
}

goalsRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM goals WHERE status != 'abandoned' ORDER BY created_at ASC").all();
  res.json(rows.map(hydrate));
});

goalsRouter.post("/", (req, res) => {
  const { title, horizon, parentId, projectId, targetDate } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO goals (id, title, horizon, parent_id, project_id, target_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, title, horizon ?? "monthly", parentId ?? null, projectId ?? null, targetDate ?? null, now, now);
  res.status(201).json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(id)));
});

goalsRouter.patch("/:id", (req, res) => {
  const { progress, status, title, targetDate } = req.body ?? {};
  db.prepare(
    `UPDATE goals SET progress = COALESCE(?, progress), status = COALESCE(?, status), title = COALESCE(?, title), target_date = COALESCE(?, target_date), updated_at = ? WHERE id = ?`
  ).run(progress ?? null, status ?? null, title ?? null, targetDate ?? null, new Date().toISOString(), req.params.id);
  res.json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM goals WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

function recomputeProgress(goalId: string) {
  const milestones = db.prepare("SELECT is_done FROM goal_milestones WHERE goal_id = ?").all(goalId) as { is_done: number }[];
  if (milestones.length === 0) return;
  const progress = milestones.filter((m) => m.is_done).length / milestones.length;
  db.prepare("UPDATE goals SET progress = ?, updated_at = ? WHERE id = ?").run(progress, new Date().toISOString(), goalId);
}

goalsRouter.post("/:id/milestones", (req, res) => {
  const { title } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const count = (db.prepare("SELECT COUNT(*) c FROM goal_milestones WHERE goal_id = ?").get(req.params.id) as any).c;
  db.prepare("INSERT INTO goal_milestones (id, goal_id, title, order_index, created_at) VALUES (?,?,?,?,?)").run(
    id, req.params.id, title, count, new Date().toISOString()
  );
  recomputeProgress(req.params.id);
  res.status(201).json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.patch("/:id/milestones/:milestoneId", (req, res) => {
  const { isDone, title } = req.body ?? {};
  db.prepare("UPDATE goal_milestones SET is_done = COALESCE(?, is_done), title = COALESCE(?, title) WHERE id = ?").run(
    typeof isDone === "boolean" ? (isDone ? 1 : 0) : null,
    title ?? null,
    req.params.milestoneId
  );
  recomputeProgress(req.params.id);
  res.json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.delete("/:id/milestones/:milestoneId", (req, res) => {
  db.prepare("DELETE FROM goal_milestones WHERE id = ?").run(req.params.milestoneId);
  recomputeProgress(req.params.id);
  res.json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});
