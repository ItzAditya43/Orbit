import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const calendarRouter = Router();

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
calendarRouter.get("/", (req, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (from) { clauses.push("e.starts_at >= ?"); params.push(from); }
  if (to) { clauses.push("e.starts_at <= ?"); params.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const events = db
    .prepare(
      `SELECT e.*, p.color AS project_color, p.name AS project_name
       FROM calendar_events e LEFT JOIN projects p ON p.id = e.project_id
       ${where} ORDER BY e.starts_at ASC`
    )
    .all(...params) as any[];

  // Overlay scheduled/due tasks as pseudo-events so the calendar reflects the task list too.
  // Tasks with a per-day recurrence (daily/interval/custom_days) are expanded separately below
  // onto every day they're due, not just their single stored due_date — otherwise "Repeats"
  // was pure metadata that never showed up anywhere until you completed the task.
  const taskClauses = ["t.status != 'done'", "t.deleted_at IS NULL", "(t.scheduled_at IS NOT NULL OR t.due_date IS NOT NULL)"];
  const taskParams: unknown[] = [];
  if (from) { taskClauses.push("(scheduled_at >= ? OR due_date >= ?)"); taskParams.push(from, from); }
  if (to) { taskClauses.push("(scheduled_at <= ? OR due_date <= ?)"); taskParams.push(to, to); }
  const scheduledTasks = db
    .prepare(
      `SELECT t.id, t.title, t.scheduled_at, t.due_date, t.priority, t.project_id, p.color AS project_color
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE ${taskClauses.join(" AND ")} AND (t.recurrence IS NULL OR t.recurrence NOT IN ('daily','weekly','interval','custom_days'))`
    )
    .all(...taskParams) as any[];

  const taskEvents = scheduledTasks.map((t) => ({
    id: `task-${t.id}`,
    title: t.title,
    starts_at: t.scheduled_at ?? t.due_date,
    ends_at: t.scheduled_at ?? t.due_date,
    all_day: !t.scheduled_at,
    task_id: t.id,
    project_id: t.project_id,
    color: t.project_color,
    priority: t.priority,
    source: "task",
  }));

  const recurringTaskEvents: any[] = [];
  if (from && to) {
    const recurringTasks = db
      .prepare(
        `SELECT t.id, t.title, t.due_date, t.recurrence_start_date, t.priority, t.project_id, t.recurrence, t.recurrence_interval_days, t.recurrence_days, t.recurrence_end_date, p.color AS project_color
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
         WHERE t.status != 'done' AND (t.due_date IS NOT NULL OR t.recurrence_start_date IS NOT NULL) AND t.recurrence IN ('daily','weekly','interval','custom_days')`
      )
      .all() as any[];
    const rangeStartIso = from.slice(0, 10);
    const rangeEndIso = to.slice(0, 10);
    for (const t of recurringTasks) {
      // The pattern counts from recurrence_start_date if the user set one explicitly (a Starts
      // field decoupled from Due), otherwise Due date doubles as the anchor like before.
      const anchorIso = (t.recurrence_start_date ?? t.due_date).slice(0, 10);
      const customDays: number[] | null = t.recurrence_days ? JSON.parse(t.recurrence_days) : null;
      for (let d = new Date(`${rangeStartIso}T00:00:00Z`); d.toISOString().slice(0, 10) <= rangeEndIso; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (iso < anchorIso) continue;
        if (t.recurrence_end_date && iso > t.recurrence_end_date) continue;
        const due =
          t.recurrence === "custom_days"
            ? customDays?.includes(d.getUTCDay())
            : t.recurrence === "interval" && t.recurrence_interval_days
              ? Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${anchorIso}T00:00:00Z`).getTime()) / 86400000) % t.recurrence_interval_days === 0
              : t.recurrence === "weekly"
                ? Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${anchorIso}T00:00:00Z`).getTime()) / 86400000) % 7 === 0
                : true; // daily
        if (!due) continue;
        recurringTaskEvents.push({
          id: `task-${t.id}-${iso}`,
          title: t.title,
          starts_at: iso,
          ends_at: iso,
          all_day: true,
          task_id: t.id,
          project_id: t.project_id,
          color: t.project_color,
          priority: t.priority,
          source: "task",
        });
      }
    }
  }

  // Habits with a clear per-day due-ness (daily / custom weekdays / every-N-days) get overlaid
  // on the days they're actually due. Period-based habits (weekly/biweekly/monthly, tracked as
  // "X times this period" rather than specific days) are deliberately left off — there's no
  // single day that represents them, and showing them every day would just be noise.
  const habits = db.prepare("SELECT * FROM habits WHERE archived = 0 AND frequency IN ('daily','custom_days','interval')").all() as any[];
  const habitEvents: any[] = [];
  if (from && to && habits.length) {
    // Walked as UTC-midnight instants and read back via isoWeekday — never Date#getDay() on a
    // local wall-clock value, which can disagree with the UTC date string near local midnight
    // in any timezone ahead of UTC (see the same fix in routes/habits.ts).
    const rangeStartIso = from.slice(0, 10);
    const rangeEndIso = to.slice(0, 10);
    for (const h of habits) {
      const customDays: number[] | null = h.custom_days ? JSON.parse(h.custom_days) : null;
      const createdDate = h.created_at.slice(0, 10);
      for (let d = new Date(`${rangeStartIso}T00:00:00Z`); d.toISOString().slice(0, 10) <= rangeEndIso; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (iso < createdDate) continue;
        const due =
          h.frequency === "custom_days"
            ? customDays?.includes(d.getUTCDay())
            : h.frequency === "interval" && h.interval_days
              ? Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${createdDate}T00:00:00Z`).getTime()) / 86400000) % h.interval_days === 0
              : true; // daily
        if (!due) continue;
        habitEvents.push({
          id: `habit-${h.id}-${iso}`,
          title: h.title,
          starts_at: h.deadline_time ? `${iso}T${h.deadline_time}:00` : iso,
          ends_at: h.deadline_time ? `${iso}T${h.deadline_time}:00` : iso,
          all_day: !h.deadline_time,
          habit_id: h.id,
          color: "#a78bfa",
          source: "habit",
        });
      }
    }
  }

  // Goals with a target date get a single pseudo-event on that date.
  const goalClauses = ["status != 'abandoned'", "target_date IS NOT NULL"];
  const goalParams: unknown[] = [];
  if (from) { goalClauses.push("target_date >= ?"); goalParams.push(from); }
  if (to) { goalClauses.push("target_date <= ?"); goalParams.push(to); }
  const goals = db.prepare(`SELECT id, title, target_date FROM goals WHERE ${goalClauses.join(" AND ")}`).all(...goalParams) as any[];
  const goalEvents = goals.map((g) => ({
    id: `goal-${g.id}`,
    title: g.title,
    starts_at: g.target_date,
    ends_at: g.target_date,
    all_day: true,
    goal_id: g.id,
    color: "#f472b6",
    source: "goal",
  }));

  res.json([
    ...events.map((e) => ({ ...e, source: "event", color: e.color ?? e.project_color ?? null })),
    ...taskEvents,
    ...recurringTaskEvents,
    ...habitEvents,
    ...goalEvents,
  ]);
});

calendarRouter.post("/", (req, res) => {
  const { title, startsAt, endsAt, allDay, color, location, taskId, projectId, notes } = req.body ?? {};
  if (!title || !startsAt || !endsAt) return res.status(400).json({ error: "title, startsAt, endsAt required" });
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO calendar_events (id, title, starts_at, ends_at, all_day, color, location, task_id, project_id, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, title, startsAt, endsAt, allDay ? 1 : 0, color ?? null, location ?? null, taskId ?? null, projectId ?? null, notes ?? null, now, now);
  res.status(201).json(db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id));
});

calendarRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const fields: Record<string, string> = {
    title: "title",
    startsAt: "starts_at",
    endsAt: "ends_at",
    allDay: "all_day",
    color: "color",
    location: "location",
    taskId: "task_id",
    projectId: "project_id",
    notes: "notes",
  };
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (key in req.body) {
      let value = req.body[key];
      if (key === "allDay") value = value ? 1 : 0;
      updates.push(`${col} = ?`);
      values.push(value);
    }
  }
  if (updates.length) {
    values.push(new Date().toISOString(), req.params.id);
    db.prepare(`UPDATE calendar_events SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`).run(...values);
  }
  res.json(db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(req.params.id));
});

calendarRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM calendar_events WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
