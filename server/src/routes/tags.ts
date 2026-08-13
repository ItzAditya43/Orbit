import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const tagsRouter = Router();

tagsRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM tags ORDER BY name ASC").all());
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
