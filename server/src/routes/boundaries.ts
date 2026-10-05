import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { addDays, daysBetween, localDay, localToday } from "../dates.js";
import { classifyScope, scopeAiAvailable } from "./ai.js";

export const boundariesRouter = Router();

// ---- sections -------------------------------------------------------------------------------

function listSections() {
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM boundaries b WHERE b.category = s.name AND b.is_active = 1) AS active_count
       FROM boundary_sections s ORDER BY s.order_index ASC, s.created_at ASC`
    )
    .all() as any[];
}

function sectionByName(name: string): any {
  return db.prepare("SELECT * FROM boundary_sections WHERE name = ?").get(name);
}

function ensureSection(name: string): any {
  const existing = sectionByName(name);
  if (existing) return existing;
  const next = (db.prepare("SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM boundary_sections").get() as any).n;
  db.prepare("INSERT INTO boundary_sections (id, name, is_restricted, order_index, created_at) VALUES (?,?,?,?,?)").run(
    randomUUID(), name, name === "restricted" ? 1 : 0, next, new Date().toISOString()
  );
  return sectionByName(name);
}

function activeItems(sectionName: string, exceptId?: string): any[] {
  return db
    .prepare("SELECT * FROM boundaries WHERE category = ? AND is_active = 1 AND id != ? ORDER BY name")
    .all(sectionName, exceptId ?? "") as any[];
}

// A section with a limit is a deliberate "I only have room for N of these" — adding one more
// has to come with a decision about which existing one makes way. Returns the 409 body when
// the section is full, or null when there's room.
function capacityConflict(sectionName: string, exceptId?: string) {
  const section = sectionByName(sectionName);
  if (!section?.max_active) return null;
  const items = activeItems(sectionName, exceptId);
  if (items.length < section.max_active) return null;
  return {
    error: `"${sectionName}" is full (${items.length}/${section.max_active})`,
    code: "section_full",
    section: sectionName,
    limit: section.max_active,
    items: items.map((b) => ({ id: b.id, name: b.name })),
  };
}

const cleanName = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

boundariesRouter.get("/sections", (_req, res) => {
  res.json(listSections());
});

boundariesRouter.post("/sections", (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: "name required" });
  if (sectionByName(name)) return res.status(409).json({ error: "a section with that name already exists" });
  const section = ensureSection(name);
  const { color, maxActive, isRestricted } = req.body ?? {};
  db.prepare("UPDATE boundary_sections SET color = ?, max_active = ?, is_restricted = ? WHERE id = ?").run(
    color ?? null,
    Number(maxActive) > 0 ? Math.floor(Number(maxActive)) : null,
    isRestricted === undefined ? section.is_restricted : isRestricted ? 1 : 0,
    section.id
  );
  res.status(201).json(listSections().find((s) => s.id === section.id));
});

// Body: { ids: string[] } — every section id in its new display order.
boundariesRouter.post("/sections/reorder", (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
  const update = db.prepare("UPDATE boundary_sections SET order_index = ? WHERE id = ?");
  db.transaction(() => ids.forEach((id: string, i: number) => update.run(i, id)))();
  res.json(listSections());
});

boundariesRouter.patch("/sections/:id", (req, res) => {
  const section: any = db.prepare("SELECT * FROM boundary_sections WHERE id = ?").get(req.params.id);
  if (!section) return res.status(404).json({ error: "not found" });
  const body = req.body ?? {};
  const name = "name" in body ? cleanName(body.name) : section.name;
  if (!name) return res.status(400).json({ error: "name required" });
  if (name !== section.name && sectionByName(name)) return res.status(409).json({ error: "a section with that name already exists" });
  db.transaction(() => {
    db.prepare("UPDATE boundary_sections SET name = ?, color = ?, max_active = ?, is_restricted = ? WHERE id = ?").run(
      name,
      "color" in body ? body.color ?? null : section.color,
      "maxActive" in body ? (Number(body.maxActive) > 0 ? Math.floor(Number(body.maxActive)) : null) : section.max_active,
      "isRestricted" in body ? (body.isRestricted ? 1 : 0) : section.is_restricted,
      section.id
    );
    // Items point at their section by name (removed ones included, so restoring one later
    // lands it back in the renamed section rather than resurrecting the old name).
    if (name !== section.name) db.prepare("UPDATE boundaries SET category = ? WHERE category = ?").run(name, section.name);
  })();
  res.json(listSections().find((s) => s.id === section.id));
});

// Deleting a section moves its items to Removed (restorable) rather than destroying them.
boundariesRouter.delete("/sections/:id", (req, res) => {
  const section: any = db.prepare("SELECT * FROM boundary_sections WHERE id = ?").get(req.params.id);
  if (section) {
    db.transaction(() => {
      db.prepare("UPDATE boundaries SET is_active = 0 WHERE category = ?").run(section.name);
      db.prepare("DELETE FROM boundary_sections WHERE id = ?").run(section.id);
    })();
  }
  res.status(204).end();
});

// ---- items ----------------------------------------------------------------------------------

boundariesRouter.get("/", (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  res.json(
    db
      .prepare(`SELECT * FROM boundaries ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY category, name`)
      .all()
  );
});

// Per-area activity for areas linked to a project: what's open, what got done and how much
// time went in over the last 7 days, and when anything last happened. An area with no linked
// project has nothing to measure against, so it's simply absent from the result.
function areaStats() {
  const today = localToday();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const linked = db
    .prepare(
      `SELECT b.* FROM boundaries b JOIN projects p ON p.id = b.project_id
       WHERE b.is_active = 1 AND p.deleted_at IS NULL`
    )
    .all() as any[];
  return linked.map((b) => {
    const p = b.project_id;
    const one = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as any).v;
    const openTasks = one("SELECT COUNT(*) v FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND status = 'open'", p);
    const completedThisWeek = one("SELECT COUNT(*) v FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND status = 'done' AND completed_at >= ?", p, weekAgo);
    const trackedSeconds = one(
      `SELECT COALESCE(SUM(duration_seconds), 0) v FROM time_entries
       WHERE started_at >= ? AND (project_id = ? OR task_id IN (SELECT id FROM tasks WHERE project_id = ?))`,
      weekAgo, p, p
    );
    const focusMinutes = one(
      `SELECT COALESCE(SUM((julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 1440), 0) v
       FROM focus_sessions WHERE started_at >= ? AND task_id IN (SELECT id FROM tasks WHERE project_id = ?)`,
      weekAgo, p
    );
    const lastActivityAt: string | null = one(
      `SELECT MAX(at) v FROM (
         SELECT MAX(completed_at) at FROM tasks WHERE project_id = ? AND deleted_at IS NULL
         UNION ALL SELECT MAX(created_at) FROM tasks WHERE project_id = ? AND deleted_at IS NULL
         UNION ALL SELECT MAX(started_at) FROM time_entries WHERE project_id = ? OR task_id IN (SELECT id FROM tasks WHERE project_id = ?)
         UNION ALL SELECT MAX(started_at) FROM focus_sessions WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)
       )`,
      p, p, p, p, p
    );
    // Never-touched areas count from when they were added, so a new one isn't "stale" on day one.
    const idleDays = daysBetween(localDay(lastActivityAt ?? b.created_at), today);
    return {
      id: b.id,
      name: b.name,
      category: b.category,
      projectId: p,
      openTasks,
      completedThisWeek,
      minutesThisWeek: Math.round(trackedSeconds / 60 + focusMinutes),
      lastActivityAt,
      idleDays,
    };
  });
}

export const STALE_AREA_DAYS = 21;
export function staleAreas() {
  const restricted = new Set((db.prepare("SELECT name FROM boundary_sections WHERE is_restricted = 1").all() as any[]).map((s) => s.name));
  // Going quiet on something you're avoiding is the point, not a problem to flag.
  return areaStats().filter((a) => a.idleDays >= STALE_AREA_DAYS && !restricted.has(a.category));
}

boundariesRouter.get("/stats", (_req, res) => {
  res.json(areaStats());
});

boundariesRouter.post("/", (req, res) => {
  const { projectId, replaceId } = req.body ?? {};
  const category = cleanName(req.body?.category);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!category || !name) return res.status(400).json({ error: "category and name required" });
  ensureSection(category);
  // replaceId is the caller's answer to a previous "section is full": drop that one, add this.
  const conflict = capacityConflict(category, replaceId);
  if (conflict) return res.status(409).json(conflict);
  const id = randomUUID();
  db.transaction(() => {
    if (replaceId) db.prepare("UPDATE boundaries SET is_active = 0 WHERE id = ? AND category = ?").run(replaceId, category);
    db.prepare("INSERT INTO boundaries (id, category, name, project_id, created_at) VALUES (?,?,?,?,?)").run(
      id, category, name, projectId || null, new Date().toISOString()
    );
  })();
  res.status(201).json(db.prepare("SELECT * FROM boundaries WHERE id = ?").get(id));
});

boundariesRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM boundaries WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "not found" });
  const { name, isActive, projectId, replaceId } = req.body ?? {};
  const category = req.body?.category !== undefined ? cleanName(req.body.category) : existing.category;
  if (!category) return res.status(400).json({ error: "category required" });
  const willBeActive = isActive === undefined ? !!existing.is_active : !!isActive;
  // Moving into a section, or restoring into one, takes up a slot there just like adding does.
  const takesSlot = willBeActive && (category !== existing.category || !existing.is_active);
  if (takesSlot) {
    ensureSection(category);
    const conflict = capacityConflict(category, replaceId ?? existing.id);
    if (conflict) return res.status(409).json(conflict);
  }
  db.transaction(() => {
    if (takesSlot && replaceId) db.prepare("UPDATE boundaries SET is_active = 0 WHERE id = ? AND category = ?").run(replaceId, category);
    db.prepare("UPDATE boundaries SET name = COALESCE(?, name), category = ?, is_active = ?, project_id = ? WHERE id = ?").run(
      typeof name === "string" && name.trim() ? name.trim() : null,
      category,
      willBeActive ? 1 : 0,
      projectId !== undefined ? projectId || null : existing.project_id,
      req.params.id
    );
  })();
  res.json(db.prepare("SELECT * FROM boundaries WHERE id = ?").get(req.params.id));
});

// Soft-removes by default (the row moves to the "Removed" list and can be restored);
// ?permanent=true actually deletes it, which is the only way to get rid of a row for good.
boundariesRouter.delete("/:id", (req, res) => {
  if (req.query.permanent === "true") {
    db.prepare("DELETE FROM boundaries WHERE id = ?").run(req.params.id);
  } else {
    db.prepare("UPDATE boundaries SET is_active = 0 WHERE id = ?").run(req.params.id);
  }
  res.status(204).end();
});

// ---- scope check ----------------------------------------------------------------------------

// Strips common suffixes before comparing so "gaming" matches a boundary named "game" and
// vice versa — plain substring matching missed this.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/(ing|ed|s)$/i, "");
}

// Checks an idea against the active areas, in two steps:
//   1. Word matching (stem-normalised, also against a linked project's real name) — instant,
//      offline, and what decides the answer whenever it finds anything.
//   2. Only if that finds nothing, and Ollama Cloud is set up: ask the model whether the idea
//      is an instance of one of the areas ("Genshin" -> "Games"), which no amount of word
//      matching can know.
// A match in a restricted section is reported separately and never counts as "in scope" —
// it means "this is something you said you're staying away from".
boundariesRouter.post("/check", async (req, res) => {
  const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  if (!label) return res.status(400).json({ error: "label required" });
  const boundaries = db.prepare("SELECT * FROM boundaries WHERE is_active = 1").all() as any[];
  const restrictedSections = new Set(
    (db.prepare("SELECT name FROM boundary_sections WHERE is_restricted = 1").all() as { name: string }[]).map((s) => s.name)
  );
  const labelWords = label.toLowerCase().split(/\s+/).map(normalize);
  let matched = boundaries.filter((b) => {
    const names = [b.name];
    if (b.project_id) {
      const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(b.project_id) as any;
      if (project) names.push(project.name);
    }
    return names.some((n) => {
      const boundaryWords = n.toLowerCase().split(/\s+/).map(normalize);
      return boundaryWords.some((bw: string) => labelWords.some((lw: string) => lw && bw && (lw.includes(bw) || bw.includes(lw))));
    });
  });

  let via: "match" | "ai" | "none" = matched.length ? "match" : "none";
  let reason: string | undefined;
  if (matched.length === 0 && req.body?.useAi !== false && scopeAiAvailable()) {
    const verdict = await classifyScope(
      label,
      boundaries.map((b) => ({ id: b.id, name: b.name, section: b.category, restricted: restrictedSections.has(b.category) }))
    );
    if (verdict) {
      via = "ai";
      reason = verdict.reason;
      matched = boundaries.filter((b) => b.id === verdict.areaId);
    }
  }

  const restrictedBoundaries = matched.filter((b) => restrictedSections.has(b.category));
  const matchedBoundaries = matched.filter((b) => !restrictedSections.has(b.category));
  res.json({
    inScope: matchedBoundaries.length > 0 && restrictedBoundaries.length === 0,
    restricted: restrictedBoundaries.length > 0,
    matchedBoundaries,
    restrictedBoundaries,
    via,
    reason,
  });
});

export const scopeReviewRouter = Router();

scopeReviewRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM scope_review_items ORDER BY created_at DESC").all());
});

scopeReviewRouter.post("/", (req, res) => {
  const { label, kind, revisitAt } = req.body ?? {};
  if (!label || !kind) return res.status(400).json({ error: "label and kind required" });
  const id = randomUUID();
  // A parked idea comes back up for a decision after two weeks unless told otherwise —
  // parking with no date is how ideas used to sit in the list forever.
  db.prepare("INSERT INTO scope_review_items (id, label, kind, revisit_at, created_at) VALUES (?,?,?,?,?)").run(
    id, label, kind, revisitAt === null ? null : revisitAt || addDays(localToday(), 14), new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM scope_review_items WHERE id = ?").get(id));
});

scopeReviewRouter.patch("/:id", (req, res) => {
  const { status, reason, revisitAt } = req.body ?? {};
  db.prepare("UPDATE scope_review_items SET status = COALESCE(?, status), reason = COALESCE(?, reason) WHERE id = ?").run(
    status ?? null, reason ?? null, req.params.id
  );
  if (revisitAt !== undefined) db.prepare("UPDATE scope_review_items SET revisit_at = ? WHERE id = ?").run(revisitAt || null, req.params.id);
  res.json(db.prepare("SELECT * FROM scope_review_items WHERE id = ?").get(req.params.id));
});

scopeReviewRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM scope_review_items WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
