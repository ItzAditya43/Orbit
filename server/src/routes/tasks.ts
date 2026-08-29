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
  return {
    ...task,
    tags: tagsForTask(task.id),
    project_color: projectColor,
    recurrence_days: task.recurrence_days ? JSON.parse(task.recurrence_days) : null,
  };
}

function getSetting(key: string, fallback: unknown) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

// GET /api/tasks?view=today|inbox|upcoming|project|stale&projectId=&status=&q=&priority=&tagId=&hasDueDate=
tasksRouter.get("/", (req, res) => {
  const { view, projectId, status, q, priority, tagId, hasDueDate } = req.query as Record<string, string | undefined>;
  const clauses: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];

  if (q) {
    const rows = db
      .prepare(
        `SELECT tasks.* FROM tasks_fts
         JOIN tasks ON tasks.rowid = tasks_fts.rowid
         WHERE tasks_fts MATCH ? AND tasks.deleted_at IS NULL ORDER BY rank`
      )
      .all(q + "*");
    return res.json(rows.map(hydrate));
  }

  if (view === "inbox") {
    clauses.push("is_inbox = 1", "status = 'open'");
  } else if (view === "today") {
    const today = new Date().toISOString().slice(0, 10);
    // A recurring task made via "Starts" (no due_date set) is genuinely due today by its
    // recurrence pattern even though due_date/scheduled_at/start_date are all null — matched
    // separately below via the same per-day expansion Calendar.tsx uses, since that can't be
    // expressed as a single SQL comparison the way a plain due_date can.
    clauses.push("status = 'open'", "(due_date <= ? OR scheduled_at LIKE ? OR start_date <= ?)");
    params.push(today, `${today}%`, today);
  } else if (view === "upcoming") {
    const today = new Date().toISOString().slice(0, 10);
    clauses.push("status = 'open'", "due_date IS NOT NULL", "due_date > ?");
    params.push(today);
  } else if (view === "project" && projectId) {
    clauses.push("project_id = ?");
    params.push(projectId);
  } else if (view === "stale") {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    clauses.push("status = 'open'", "due_date IS NULL", "is_inbox = 0", "created_at < ?");
    params.push(cutoff);
  }

  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (priority) {
    clauses.push("priority = ?");
    params.push(priority);
  }
  if (hasDueDate === "false") clauses.push("due_date IS NULL");
  if (hasDueDate === "true") clauses.push("due_date IS NOT NULL");
  if (tagId) {
    clauses.push("id IN (SELECT task_id FROM task_tags WHERE tag_id = ?)");
    params.push(tagId);
  }
  clauses.push("parent_id IS NULL");

  const where = `WHERE ${clauses.join(" AND ")}`;
  const rows = db.prepare(`SELECT * FROM tasks ${where} ORDER BY order_index ASC, created_at ASC`).all(...params) as any[];

  if (view === "today") {
    const today = new Date().toISOString().slice(0, 10);
    const seenIds = new Set(rows.map((r) => r.id));
    const recurringCandidates = db
      .prepare(
        `SELECT * FROM tasks
         WHERE deleted_at IS NULL AND status = 'open' AND parent_id IS NULL
           AND recurrence IN ('daily','weekly','interval','custom_days')
           AND (recurrence_start_date IS NOT NULL OR due_date IS NOT NULL)
           AND (recurrence_end_date IS NULL OR recurrence_end_date >= ?)`
      )
      .all(today) as any[];
    for (const t of recurringCandidates) {
      if (seenIds.has(t.id)) continue;
      const anchorIso = (t.recurrence_start_date ?? t.due_date).slice(0, 10);
      if (anchorIso > today) continue;
      const customDays: number[] | null = t.recurrence_days ? JSON.parse(t.recurrence_days) : null;
      const dayOfWeek = new Date(`${today}T00:00:00Z`).getUTCDay();
      const due =
        t.recurrence === "custom_days"
          ? customDays?.includes(dayOfWeek)
          : t.recurrence === "interval" && t.recurrence_interval_days
            ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${anchorIso}T00:00:00Z`).getTime()) / 86400000) % t.recurrence_interval_days === 0
            : t.recurrence === "weekly"
              ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${anchorIso}T00:00:00Z`).getTime()) / 86400000) % 7 === 0
              : true; // daily
      if (due) {
        rows.push(t);
        seenIds.add(t.id);
      }
    }
  }

  res.json(rows.map(hydrate));
});

tasksRouter.get("/trash", (_req, res) => {
  const rows = db.prepare("SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all();
  res.json(rows.map(hydrate));
});

tasksRouter.post("/trash/empty", (_req, res) => {
  const result = db.prepare("DELETE FROM tasks WHERE deleted_at IS NOT NULL").run();
  res.json({ ok: true, count: result.changes });
});

tasksRouter.get("/check-duplicate", (req, res) => {
  const title = (req.query.title as string) ?? "";
  if (!title.trim()) return res.json([]);
  const normalized = title.trim().toLowerCase();
  const rows = db
    .prepare("SELECT id, title FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND lower(title) LIKE ?")
    .all(`%${normalized}%`) as { id: string; title: string }[];
  res.json(rows.filter((r) => r.title.toLowerCase() !== normalized).slice(0, 5));
});

// POST /api/tasks/auto-schedule { date } — slots today's un-timed open tasks sequentially
// into working hours based on estimate_minutes (falls back to 30m when unset).
tasksRouter.post("/auto-schedule", (req, res) => {
  const date = (req.body?.date as string) ?? new Date().toISOString().slice(0, 10);
  const startHM = getSetting("workingHoursStart", "09:00") as string;
  const endHM = getSetting("workingHoursEnd", "17:00") as string;

  const tasksToSchedule = db
    .prepare(
      `SELECT * FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND parent_id IS NULL
       AND (due_date = ? OR scheduled_at LIKE ?) AND (scheduled_at IS NULL OR scheduled_at NOT LIKE '%T%')
       ORDER BY CASE priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, created_at ASC`
    )
    .all(date, `${date}%`) as any[];

  const [startH, startM] = startHM.split(":").map(Number);
  const [endH, endM] = endHM.split(":").map(Number);
  let cursor = new Date(`${date}T00:00:00`);
  cursor.setHours(startH, startM, 0, 0);
  const endTime = new Date(`${date}T00:00:00`);
  endTime.setHours(endH, endM, 0, 0);

  const scheduled: any[] = [];
  const now = new Date().toISOString();
  for (const task of tasksToSchedule) {
    const durationMin = task.estimate_minutes ?? 30;
    const slotEnd = new Date(cursor.getTime() + durationMin * 60000);
    if (slotEnd > endTime) break;
    db.prepare("UPDATE tasks SET scheduled_at = ?, updated_at = ? WHERE id = ?").run(cursor.toISOString(), now, task.id);
    scheduled.push({ id: task.id, title: task.title, scheduledAt: cursor.toISOString() });
    cursor = slotEnd;
  }

  res.json({ scheduled, unscheduledCount: tasksToSchedule.length - scheduled.length });
});

tasksRouter.get("/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  const subtasks = db
    .prepare("SELECT * FROM tasks WHERE parent_id = ? AND deleted_at IS NULL ORDER BY order_index ASC")
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
    color,
    energy,
    recurrence,
    recurrenceIntervalDays,
    recurrenceDays,
    recurrenceStartDate,
    recurrenceEndDate,
  } = req.body ?? {};
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title is required" });

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (id, title, notes, project_id, parent_id, priority, due_date, start_date, scheduled_at, estimate_minutes, is_inbox, color, energy, recurrence, recurrence_interval_days, recurrence_days, recurrence_start_date, recurrence_end_date, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
    color ?? null,
    energy ?? null,
    recurrence ?? null,
    recurrenceIntervalDays ?? null,
    Array.isArray(recurrenceDays) ? JSON.stringify(recurrenceDays) : null,
    recurrenceStartDate ?? null,
    recurrenceEndDate ?? null,
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
  recurrenceIntervalDays: "recurrence_interval_days",
  recurrenceDays: "recurrence_days",
  recurrenceStartDate: "recurrence_start_date",
  recurrenceEndDate: "recurrence_end_date",
  color: "color",
  energy: "energy",
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
      if (key === "recurrenceDays") value = Array.isArray(value) ? JSON.stringify(value) : null;
      updates.push(`${col} = ?`);
      values.push(value);
    }
  }
  // A task that just gained a per-day recurrence (daily/weekly/interval/custom_days) plus a
  // real anchor date is now genuinely scheduled on the Calendar going forward — leaving
  // is_inbox untouched left it stuck showing in the Unscheduled panel forever even though it's
  // no longer unscheduled. Only auto-clear it if the caller didn't already say what isInbox
  // should be in this same request.
  const nextRecurrence = "recurrence" in req.body ? req.body.recurrence : (existing as any).recurrence;
  const nextStartDate = "recurrenceStartDate" in req.body ? req.body.recurrenceStartDate : (existing as any).recurrence_start_date;
  const isRecurringNow = nextRecurrence && ["daily", "weekly", "interval", "custom_days"].includes(nextRecurrence);

  if (!("isInbox" in req.body)) {
    const nextDueDate = "dueDate" in req.body ? req.body.dueDate : (existing as any).due_date;
    // A task that just gained a per-day recurrence plus a real anchor date is now genuinely
    // scheduled on the Calendar going forward — leaving is_inbox untouched left it stuck showing
    // in the Unscheduled panel forever even though it's no longer unscheduled. Only auto-clear
    // it if the caller didn't already say what isInbox should be in this same request.
    if (isRecurringNow && (nextDueDate || nextStartDate)) {
      updates.push("is_inbox = ?");
      values.push(0);
    }
  }
  // Setting/moving "Starts" on a recurring task with no due_date (or one that predates the new
  // Starts) syncs due_date to match, so a freshly-configured recurring task doesn't start out
  // already "Overdue" from a stale pre-recurrence due_date — a real bug that made "how is it
  // overdue if it's due today" happen on setup. Only touches due_date when the caller isn't
  // already setting it explicitly in this same request.
  if (isRecurringNow && "recurrenceStartDate" in req.body && !("dueDate" in req.body)) {
    const existingDue = (existing as any).due_date;
    if (!existingDue || existingDue < req.body.recurrenceStartDate) {
      updates.push("due_date = ?");
      values.push(req.body.recurrenceStartDate);
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

tasksRouter.post("/:id/snooze", (req, res) => {
  const preset = (req.body?.preset as string) ?? "tomorrow";
  const now = new Date();
  const d = new Date();
  if (preset === "tomorrow") d.setDate(now.getDate() + 1);
  else if (preset === "in3days") d.setDate(now.getDate() + 3);
  else if (preset === "nextWeek") d.setDate(now.getDate() + 7);
  else if (preset === "nextMonth") d.setMonth(now.getMonth() + 1);
  const dueDate = d.toISOString().slice(0, 10);
  db.prepare("UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?").run(dueDate, new Date().toISOString(), req.params.id);
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
    else if (task.recurrence === "interval") next.setDate(next.getDate() + (task.recurrence_interval_days || 1));
    else if (task.recurrence === "custom_days") {
      const days: number[] = task.recurrence_days ? JSON.parse(task.recurrence_days) : [];
      if (days.length) {
        do { next.setDate(next.getDate() + 1); } while (!days.includes(next.getUTCDay()));
      } else {
        next.setDate(next.getDate() + 1);
      }
    }
    const nextDue = next.toISOString().slice(0, 10);
    if (!task.recurrence_end_date || nextDue <= task.recurrence_end_date) {
      const newId = randomUUID();
      db.prepare(
        `INSERT INTO tasks (id, title, notes, project_id, priority, due_date, recurrence, recurrence_interval_days, recurrence_days, recurrence_start_date, recurrence_end_date, estimate_minutes, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        newId, task.title, task.notes, task.project_id, task.priority, nextDue,
        task.recurrence, task.recurrence_interval_days, task.recurrence_days, task.recurrence_start_date, task.recurrence_end_date, task.estimate_minutes, now, now
      );
    }
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

tasksRouter.post("/:id/restore", (req, res) => {
  db.prepare("UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
  res.json(hydrate(db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id)));
});

tasksRouter.delete("/:id", (req, res) => {
  if (req.query.permanent === "true") {
    db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  } else {
    db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
  }
  res.status(204).end();
});

tasksRouter.get("/:id/dependencies", (req, res) => {
  const blockedBy = db
    .prepare(
      `SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocks_task_id = t.id WHERE d.task_id = ? AND t.deleted_at IS NULL`
    )
    .all(req.params.id)
    .map(hydrate);
  const blocks = db
    .prepare(
      `SELECT t.* FROM tasks t JOIN task_dependencies d ON d.task_id = t.id WHERE d.blocks_task_id = ? AND t.deleted_at IS NULL`
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

// POST /api/tasks/bulk { taskIds: string[], action: "complete"|"reopen"|"delete"|"move"|"tag"|"priority", ...args }
tasksRouter.post("/bulk", (req, res) => {
  const { taskIds, action, projectId, tagId, priority } = req.body ?? {};
  if (!Array.isArray(taskIds) || taskIds.length === 0) return res.status(400).json({ error: "taskIds required" });
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    for (const id of taskIds) {
      if (action === "complete") {
        db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
      } else if (action === "reopen") {
        db.prepare("UPDATE tasks SET status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?").run(now, id);
      } else if (action === "delete") {
        db.prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(now, id);
      } else if (action === "move") {
        db.prepare("UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?").run(projectId ?? null, now, id);
      } else if (action === "tag" && tagId) {
        db.prepare("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)").run(id, tagId);
      } else if (action === "priority" && priority) {
        db.prepare("UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?").run(priority, now, id);
      }
    }
  });
  run();

  res.json({ ok: true, count: taskIds.length });
});

tasksRouter.post("/:id/duplicate", (req, res) => {
  const task: any = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tasks (id, title, notes, project_id, priority, due_date, start_date, estimate_minutes, is_inbox, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, `${task.title} (copy)`, task.notes, task.project_id, task.priority, task.due_date, task.start_date, task.estimate_minutes, task.is_inbox, now, now);
  res.status(201).json(hydrate(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id)));
});

// Converts a task (and its subtasks) into a new project.
tasksRouter.post("/:id/convert-to-project", (req, res) => {
  const task: any = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  const now = new Date().toISOString();
  const projectId = randomUUID();
  db.prepare(`INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)`).run(
    projectId,
    task.title,
    task.notes,
    now,
    now
  );
  db.prepare("UPDATE tasks SET project_id = ?, parent_id = NULL WHERE parent_id = ?").run(projectId, task.id);
  db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
  res.status(201).json(db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId));
});
