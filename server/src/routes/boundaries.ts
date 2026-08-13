import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const boundariesRouter = Router();

boundariesRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM boundaries WHERE is_active = 1 ORDER BY category, name").all());
});

boundariesRouter.post("/", (req, res) => {
  const { category, name } = req.body ?? {};
  if (!category || !name) return res.status(400).json({ error: "category and name required" });
  const id = randomUUID();
  db.prepare("INSERT INTO boundaries (id, category, name, created_at) VALUES (?,?,?,?)").run(
    id, category, name, new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM boundaries WHERE id = ?").get(id));
});

boundariesRouter.delete("/:id", (req, res) => {
  db.prepare("UPDATE boundaries SET is_active = 0 WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Check whether a project/task name falls within active scope (simple substring/category match)
boundariesRouter.post("/check", (req, res) => {
  const { label } = req.body ?? {};
  if (!label) return res.status(400).json({ error: "label required" });
  const boundaries = db.prepare("SELECT * FROM boundaries WHERE is_active = 1").all() as any[];
  const inScope = boundaries.some((b) => label.toLowerCase().includes(b.name.toLowerCase()));
  res.json({ inScope, matchedBoundaries: boundaries.filter((b) => label.toLowerCase().includes(b.name.toLowerCase())) });
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
