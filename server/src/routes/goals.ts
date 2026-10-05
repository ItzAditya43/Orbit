import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { addDays, daysBetween, localDay, localToday, weekday } from "../dates.js";

export const goalsRouter = Router();

// A goal's progress is measured from the real work attached to it, whichever of these exist:
//   - milestones: share ticked off
//   - tasks: share done, in the project the goal is linked to
//   - habits: how consistently the habits linked to it were kept over the last 30 days
// With more than one source the progress is their plain average. Only a goal with none of
// them keeps a hand-set number (the slider).
const HABIT_WINDOW_DAYS = 30;

function habitConsistency(habit: any, today: string): number {
  const windowDays = Math.min(HABIT_WINDOW_DAYS, daysBetween(localDay(habit.created_at), today) + 1);
  if (windowDays <= 0) return 0;
  const from = addDays(today, -(windowDays - 1));
  const logs = db.prepare("SELECT date, amount FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ?").all(habit.id, from, today) as {
    date: string;
    amount: number;
  }[];
  const kept = logs.filter((l) => (habit.target_count ? l.amount >= habit.target_count : true)).length;
  const perPeriod = habit.target_per_period ?? 1;
  let expected: number;
  if (habit.frequency === "weekly") expected = (perPeriod * windowDays) / 7;
  else if (habit.frequency === "biweekly") expected = (perPeriod * windowDays) / 14;
  else if (habit.frequency === "monthly") expected = (perPeriod * windowDays) / 30;
  else if (habit.custom_days) {
    const days: number[] = JSON.parse(habit.custom_days);
    expected = 0;
    for (let i = 0; i < windowDays; i++) if (days.includes(weekday(addDays(from, i)))) expected++;
  } else if (habit.interval_days) expected = windowDays / habit.interval_days;
  else expected = windowDays;
  // Less than one expected occurrence so far (e.g. a monthly habit made last week): nothing
  // has been missed yet, so it can't count against the goal.
  if (expected < 1) return kept > 0 ? 1 : 0;
  return Math.min(1, kept / expected);
}

function measureProgress(goal: any) {
  const sources: { milestones?: number; tasks?: number; habits?: number } = {};
  const detail: Record<string, string> = {};

  const milestones = db.prepare("SELECT is_done FROM goal_milestones WHERE goal_id = ?").all(goal.id) as { is_done: number }[];
  if (milestones.length) {
    const done = milestones.filter((m) => m.is_done).length;
    sources.milestones = done / milestones.length;
    detail.milestones = `${done}/${milestones.length} milestones`;
  }

  if (goal.project_id) {
    const t = db
      .prepare(
        `SELECT COUNT(*) total, COALESCE(SUM(status = 'done'), 0) done FROM tasks
         WHERE project_id = ? AND deleted_at IS NULL AND parent_id IS NULL`
      )
      .get(goal.project_id) as { total: number; done: number };
    if (t.total > 0) {
      sources.tasks = t.done / t.total;
      detail.tasks = `${t.done}/${t.total} tasks`;
    }
  }

  const habits = db.prepare("SELECT * FROM habits WHERE goal_id = ? AND archived = 0").all(goal.id) as any[];
  if (habits.length) {
    const today = localToday();
    sources.habits = habits.reduce((sum, h) => sum + habitConsistency(h, today), 0) / habits.length;
    detail.habits = `habits kept ${Math.round(sources.habits * 100)}% (last ${HABIT_WINDOW_DAYS}d)`;
  }

  const values = Object.values(sources);
  if (values.length === 0) return { auto: false, progress: goal.progress as number, detail: [] as string[] };
  return { auto: true, progress: values.reduce((a, b) => a + b, 0) / values.length, detail: Object.values(detail) };
}

function hydrate(goal: any) {
  if (!goal) return goal;
  const measured = measureProgress(goal);
  // Written back so everything else that reads goals.progress (Analytics, Review, the Matrix,
  // the AI tools) sees the measured number without each needing to know how it's derived.
  if (measured.auto && Math.abs((goal.progress ?? 0) - measured.progress) > 0.0005) {
    db.prepare("UPDATE goals SET progress = ? WHERE id = ?").run(measured.progress, goal.id);
  }
  const milestones = db.prepare("SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY order_index ASC").all(goal.id);
  const habits = db.prepare("SELECT id, title, frequency FROM habits WHERE goal_id = ? AND archived = 0").all(goal.id);
  const tags = db.prepare(`SELECT t.* FROM tags t JOIN goal_tags gt ON gt.tag_id = t.id WHERE gt.goal_id = ?`).all(goal.id);
  return { ...goal, progress: measured.progress, progress_auto: measured.auto, progress_detail: measured.detail, milestones, habits, tags };
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
  const existing = db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "not found" });
  const { progress, status, title, targetDate, horizon, projectId } = req.body ?? {};
  // targetDate uses explicit-vs-omitted (not COALESCE) so it can actually be cleared to null —
  // e.g. the priority matrix clearing a goal's due date when dragged into a non-urgent quadrant.
  db.prepare(
    `UPDATE goals SET progress = COALESCE(?, progress), status = COALESCE(?, status), title = COALESCE(?, title),
      target_date = ?, horizon = COALESCE(?, horizon), project_id = ?, updated_at = ? WHERE id = ?`
  ).run(
    progress ?? null, status ?? null, title ?? null,
    targetDate !== undefined ? targetDate : existing.target_date,
    horizon ?? null,
    projectId !== undefined ? projectId || null : existing.project_id,
    new Date().toISOString(), req.params.id
  );
  res.json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM goals WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

goalsRouter.post("/:id/milestones", (req, res) => {
  const { title } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "title required" });
  const id = randomUUID();
  const count = (db.prepare("SELECT COUNT(*) c FROM goal_milestones WHERE goal_id = ?").get(req.params.id) as any).c;
  db.prepare("INSERT INTO goal_milestones (id, goal_id, title, order_index, created_at) VALUES (?,?,?,?,?)").run(
    id, req.params.id, title, count, new Date().toISOString()
  );
  res.status(201).json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.patch("/:id/milestones/:milestoneId", (req, res) => {
  const { isDone, title } = req.body ?? {};
  db.prepare("UPDATE goal_milestones SET is_done = COALESCE(?, is_done), title = COALESCE(?, title) WHERE id = ?").run(
    typeof isDone === "boolean" ? (isDone ? 1 : 0) : null,
    title ?? null,
    req.params.milestoneId
  );
  res.json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.delete("/:id/milestones/:milestoneId", (req, res) => {
  db.prepare("DELETE FROM goal_milestones WHERE id = ?").run(req.params.milestoneId);
  res.json(hydrate(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});
