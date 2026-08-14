import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const filtersRouter = Router();

filtersRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM saved_filters ORDER BY created_at ASC").all() as any[];
  res.json(rows.map((r) => ({ ...r, query: JSON.parse(r.query_json || "{}") })));
});

filtersRouter.post("/", (req, res) => {
  const { name, query } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name required" });
  const id = randomUUID();
  db.prepare("INSERT INTO saved_filters (id, name, query_json, created_at) VALUES (?,?,?,?)").run(
    id, name, JSON.stringify(query ?? {}), new Date().toISOString()
  );
  res.status(201).json(db.prepare("SELECT * FROM saved_filters WHERE id = ?").get(id));
});

filtersRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM saved_filters WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
