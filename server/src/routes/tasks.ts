import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { fireTrigger } from "../automationEngine.js";

export const tasksRouter = Router();

function tagsForTask(taskId: string) {
  return db
    .prepare(
      `SELECT t.* FROM tags t JOIN task_tags tt ON tt.tag_id = t.id WHERE tt.task_id = ?`
    )
    .all(taskId);
}

const projectColorStmt = db.prepare("SELECT color FROM projects WHERE id = ?");

function hydrate(task: any) {
  if (!task) return task;
  const projectColor = task.project_id ? (projectColorStmt.get(task.project_id) as any)?.color ?? null : null;
  return { ...task, tags: tagsForTask(task.id), project_color: projectColor };
}

// GET /api/tasks?view=today|inbox|upcoming|project&projectId=&status=&q=
tasksRouter.get("/", (req, res) => {
  const { view, projectId, status, q } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (q) {
    const rows = db
      .prepare(
        `SELECT tasks.* FROM tasks_fts
         JOIN tasks ON tasks.rowid = tasks_fts.rowid
         WHERE tasks_fts MATCH ? ORDER BY rank`
      )
      .all(q + "*");
    return res.json(rows.map(hydrate));
  }

  if (view === "inbox") {
    clauses.push("is_inbox = 1", "status = 'open'");
  } else if (view === "today") {
    const today = new Date().toISOString().slice(0, 10);
    clauses.push("status = 'open'", "(due_date <= ? OR scheduled_at LIKE ? OR start_date <= ?)");
    params.push(today, `${today}%`, today);
  } else if (view === "upcoming") {
    const today = new Date().toISOString().slice(0, 10);
    clauses.push("status = 'open'", "due_date IS NOT NULL", "due_date > ?");
    params.push(today);
  } else if (view === "project" && projectId) {
    clauses.push("project_id = ?");
    params.push(projectId);
  }

  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  clauses.push("parent_id IS NULL");

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM tasks ${where} ORDER BY order_index ASC, created_at ASC`).all(...params);
  res.json(rows.map(hydrate));
});

tasksRouter.get("/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  const subtasks = db
    .prepare("SELECT * FROM tasks WHERE parent_id = ? ORDER BY order_index ASC")
    .all(req.params.id)
    .map(hydrate);
  res.json({ ...hydrate(task), subtasks });
});

tasksRouter.post("/", (req, res) => {
  const {
    title,
    notes,
    projectId,
    parentId,
    priority,
    dueDate,
    startDate,
    scheduledAt,
    estimateMinutes,
    isInbox,
    tagIds,
  } = req.body ?? {};
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title is required" });

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (id, title, notes, project_id, parent_id, priority, due_date, start_date, scheduled_at, estimate_minutes, is_inbox, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    title,
    notes ?? null,
    projectId ?? null,
    parentId ?? null,
    priority ?? "none",
    dueDate ?? null,
    startDate ?? null,
    scheduledAt ?? null,
    estimateMinutes ?? null,
    isInbox ? 1 : 0,
    now,
    now
  );
  if (Array.isArray(tagIds)) {
    const stmt = db.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)");
    for (const tagId of tagIds) stmt.run(id, tagId);
  }
  res.status(201).json(hydrate(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id)));
});

const PATCHABLE_FIELDS: Record<string, string> = {
  title: "title",
  notes: "notes",
  status: "status",
  priority: "priority",
  projectId: "project_id",
  parentId: "parent_id",
  isInbox: "is_inbox",
  estimateMinutes: "estimate_minutes",
  actualMinutes: "actual_minutes",
  dueDate: "due_date",
  startDate: "start_date",
  scheduledAt: "scheduled_at",
  orderIndex: "order_index",
  recurrence: "recurrence",
};

tasksRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(PATCHABLE_FIELDS)) {
    if (key in req.body) {
      let value = req.body[key];
      if (key === "isInbox") value = value ? 1 : 0;
      updates.push(`${col} = ?`);
      values.push(value);
    }
  }
  if (updates.length) {
    values.push(new Date().toISOString(), req.params.id);
    db.prepare(`UPDATE tasks SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`).run(...values);
  }
  if (Array.isArray(req.body.tagIds)) {
    db.prepare("DELETE FROM task_tags WHERE task_id = ?").run(req.params.id);
    const stmt = db.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)");
    for (const tagId of req.body.tagIds) stmt.run(req.params.id, tagId);
  }
  res.json(hydrate(db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id)));
});

tasksRouter.post("/:id/complete", (req, res) => {
  const now = new Date().toISOString();
  db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(
    now,
    now,
    req.params.id
  );
  const task: any = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (task?.recurrence && task.recurrence !== "none" && task.due_date) {
    const next = new Date(task.due_date);
    if (task.recurrence === "daily") next.setDate(next.getDate() + 1);
    else if (task.recurrence === "weekly") next.setDate(next.getDate() + 7);
    else if (task.recurrence === "monthly") next.setMonth(next.getMonth() + 1);
    const newId = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, title, notes, project_id, priority, due_date, recurrence, estimate_minutes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(newId, task.title, task.notes, task.project_id, task.priority, next.toISOString().slice(0, 10), task.recurrence, task.estimate_minutes, now, now);
  }
  fireTrigger("task_completed", { taskId: task.id, taskTitle: task.title, projectId: task.project_id });
  res.json(hydrate(task));
});

tasksRouter.post("/:id/reopen", (req, res) => {
  const now = new Date().toISOString();
  db.prepare("UPDATE tasks SET status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?").run(
    now,
    req.params.id
  );
  res.json(hydrate(db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id)));
});

tasksRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

tasksRouter.get("/:id/dependencies", (req, res) => {
  const blockedBy = db
    .prepare(
      `SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocks_task_id = t.id WHERE d.task_id = ?`
    )
    .all(req.params.id)
    .map(hydrate);
  const blocks = db
    .prepare(
      `SELECT t.* FROM tasks t JOIN task_dependencies d ON d.task_id = t.id WHERE d.blocks_task_id = ?`
    )
    .all(req.params.id)
    .map(hydrate);
  res.json({ blockedBy, blocks });
});

tasksRouter.post("/:id/dependencies", (req, res) => {
  const { blocksTaskId } = req.body ?? {};
  if (!blocksTaskId) return res.status(400).json({ error: "blocksTaskId required" });
  db.prepare("INSERT OR IGNORE INTO task_dependencies (task_id, blocks_task_id) VALUES (?,?)").run(
    req.params.id,
    blocksTaskId
  );
  res.status(201).json({ ok: true });
});

tasksRouter.delete("/:id/dependencies/:blocksTaskId", (req, res) => {
  db.prepare("DELETE FROM task_dependencies WHERE task_id = ? AND blocks_task_id = ?").run(
    req.params.id,
    req.params.blocksTaskId
  );
  res.status(204).end();
});
