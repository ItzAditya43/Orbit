import { Router } from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import { dataDir } from "../dataDir.js";

export const attachmentsRouter = Router();

const filesDir = path.join(dataDir, "attachments");
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

// Bumping past a few tens of MB isn't a real use case for pasted screenshots/photos, and
// keeping this in JSON (base64) instead of multipart avoids pulling in a multipart-parsing
// dependency for what's a single-user local app.
const MAX_BYTES = 25 * 1024 * 1024;

attachmentsRouter.get("/", (req, res) => {
  const { entityType, entityId } = req.query as Record<string, string | undefined>;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (entityType) { clauses.push("entity_type = ?"); params.push(entityType); }
  if (entityId) { clauses.push("entity_id = ?"); params.push(entityId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM attachments ${where} ORDER BY created_at DESC`).all(...params);
  res.json(rows);
});

// POST { dataUrl: "data:image/png;base64,....", entityType, entityId, filename? }
attachmentsRouter.post("/", (req, res) => {
  const { dataUrl, entityType, entityId, filename } = req.body ?? {};
  if (!dataUrl || !entityType) return res.status(400).json({ error: "dataUrl and entityType required" });

  const match = /^data:([\w/+.-]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: "dataUrl must be a base64 data URL" });
  const [, mimeType, base64] = match;
  const ext = EXT_BY_MIME[mimeType];
  if (!ext) return res.status(400).json({ error: `unsupported image type: ${mimeType}` });

  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) return res.status(413).json({ error: "image too large (25MB max)" });

  const id = randomUUID();
  const storedName = `${id}.${ext}`;
  fs.writeFileSync(path.join(filesDir, storedName), buffer);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO attachments (id, filename, stored_name, mime_type, size, entity_type, entity_id, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, filename ?? storedName, storedName, mimeType, buffer.byteLength, entityType, entityId ?? null, now);

  res.status(201).json(db.prepare("SELECT * FROM attachments WHERE id = ?").get(id));
});

attachmentsRouter.get("/:id/raw", (req, res) => {
  const row = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).end();
  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  fs.createReadStream(path.join(filesDir, row.stored_name)).pipe(res);
});

attachmentsRouter.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id) as any;
  if (row) {
    try { fs.unlinkSync(path.join(filesDir, row.stored_name)); } catch { /* already gone */ }
  }
  db.prepare("DELETE FROM attachments WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
