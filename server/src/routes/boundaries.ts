import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const boundariesRouter = Router();

boundariesRouter.get("/", (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  res.json(
    db
      .prepare(`SELECT * FROM boundaries ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY category, name`)
      .all()
  );
});

boundariesRouter.post("/", (req, res) => {
  const { category, name, projectId } = req.body ?? {};
  if (!category || !name) return res.status(400).json({ error: "category and name required" });
  const id = randomUUID();
  db.prepare("INSERT INTO boundaries (id, category, name, project_id, created_at) VALUES (?,?,?,?,?)").run(
    id, category, name, projectId ?? null, new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM boundaries WHERE id = ?").get(id));
});

boundariesRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM boundaries WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "not found" });
  const { name, category, isActive, projectId } = req.body ?? {};
  db.prepare(
    "UPDATE boundaries SET name = COALESCE(?, name), category = COALESCE(?, category), is_active = COALESCE(?, is_active), project_id = ? WHERE id = ?"
  ).run(
    name ?? null,
    category ?? null,
    isActive === undefined ? null : isActive ? 1 : 0,
    projectId !== undefined ? projectId : existing.project_id,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM boundaries WHERE id = ?").get(req.params.id));
});

boundariesRouter.delete("/:id", (req, res) => {
  db.prepare("UPDATE boundaries SET is_active = 0 WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Strips common suffixes before comparing so "gaming" matches a boundary named "game" and
// vice versa — plain substring matching missed this (see check() below).
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/(ing|ed|s)$/i, "");
}

// Check whether a project/task name falls within active scope. Matches word-by-word against
// each boundary name (normalized) rather than the whole label, so "Learn a new instrument
// (game dev tools)" matches a "game" boundary even though the string doesn't literally
// contain "game" as microsubstring of the full label — and stem-normalized so "gaming"
// matches "game" instead of requiring an exact substring.
boundariesRouter.post("/check", (req, res) => {
  const { label } = req.body ?? {};
  if (!label) return res.status(400).json({ error: "label required" });
  const boundaries = db.prepare("SELECT * FROM boundaries WHERE is_active = 1").all() as any[];
  const labelWords = label.toLowerCase().split(/\s+/).map(normalize);
  const matched = boundaries.filter((b) => {
    // A boundary linked to a real project matches on that project's actual name too, not just
    // its own (possibly differently-worded) label — a boundary named "Career" linked to the
    // "Interview Prep" project should catch "prep for interviews" even though "career" doesn't.
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
  res.json({ inScope: matched.length > 0, matchedBoundaries: matched });
});

export const scopeReviewRouter = Router();

scopeReviewRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM scope_review_items ORDER BY created_at DESC").all());
});

scopeReviewRouter.post("/", (req, res) => {
  const { label, kind } = req.body ?? {};
  if (!label || !kind) return res.status(400).json({ error: "label and kind required" });
  const id = randomUUID();
  db.prepare("INSERT INTO scope_review_items (id, label, kind, created_at) VALUES (?,?,?,?)").run(
    id, label, kind, new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM scope_review_items WHERE id = ?").get(id));
});

scopeReviewRouter.patch("/:id", (req, res) => {
  const { status, reason } = req.body ?? {};
  db.prepare("UPDATE scope_review_items SET status = COALESCE(?, status), reason = COALESCE(?, reason) WHERE id = ?").run(
    status ?? null, reason ?? null, req.params.id
  );
  res.json(db.prepare("SELECT * FROM scope_review_items WHERE id = ?").get(req.params.id));
});

scopeReviewRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM scope_review_items WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
