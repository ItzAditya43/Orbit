import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import { backupsDir, BACKUP_TABLES } from "../scheduler.js";

export const syncRouter = Router();

function dumpAll() {
  const dump: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return { exportedAt: new Date().toISOString(), version: 1, data: dump };
}

// Link tables have no id of their own; their whole row is the key.
const LINK_TABLES = new Set(["task_tags", "task_dependencies", "goal_tags", "habit_tags"]);
// Keyed by id but also unique on another column (one log per habit per day, one check-in per
// date) — an incoming row can collide with an existing one under a different id.
const REPLACE_TABLES = new Set(["habit_logs", "daily_checkins"]);

// Merges a backup into the current database: rows with a known id are updated in place, new
// ones are added, nothing already here is removed.
//
// Deliberately an upsert rather than INSERT OR REPLACE — REPLACE deletes the old row first,
// and with foreign keys on that cascaded into everything hanging off it, so restoring a backup
// wiped the tags, subtasks and dependencies of every task it touched.
function importAll(data: Record<string, any[]>) {
  // Tags are unique by name; a backup's tag can share a name with an existing tag under a
  // different id. Those are folded into the existing tag instead of failing the import.
  const tagIdRemap = new Map<string, string>();
  const importTx = db.transaction(() => {
    for (const table of BACKUP_TABLES) {
      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const known = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
      for (const original of rows) {
        if (!original || typeof original !== "object") continue;
        const row = { ...original };
        if (table === "tags") {
          const sameName = db.prepare("SELECT id FROM tags WHERE name = ? AND id != ?").get(row.name, row.id) as { id: string } | undefined;
          if (sameName) {
            tagIdRemap.set(row.id, sameName.id);
            continue;
          }
        }
        // Sections are unique by name too; one that already exists here is kept as it is.
        if (table === "boundary_sections" && db.prepare("SELECT 1 FROM boundary_sections WHERE name = ? AND id != ?").get(row.name, row.id)) continue;
        if ("tag_id" in row && tagIdRemap.has(row.tag_id)) row.tag_id = tagIdRemap.get(row.tag_id);
        // Only columns this version of the schema actually has — a backup from a different
        // version shouldn't fail on a column that's since been added or dropped.
        const columns = Object.keys(row).filter((c) => known.has(c));
        if (columns.length === 0) continue;
        const placeholders = columns.map(() => "?").join(",");
        const sql = LINK_TABLES.has(table)
          ? `INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`
          : REPLACE_TABLES.has(table)
            ? `INSERT OR REPLACE INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`
            : `INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})
               ON CONFLICT(id) DO UPDATE SET ${columns.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ") || "id = id"}`;
        db.prepare(sql).run(...columns.map((c) => row[c]));
      }
    }
  });
  // Rows arrive in backup order, not dependency order (a subtask can precede its parent), so
  // foreign keys are checked off for the duration rather than per row.
  db.pragma("foreign_keys = OFF");
  try {
    importTx();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

// Full local export/import — the "backup/restore" half of §27 Sync. Multi-device sync with
// conflict resolution needs a server counterpart this app doesn't have yet; this is the
// local-first floor that unblocks it later.
syncRouter.get("/backups", (_req, res) => {
  if (!fs.existsSync(backupsDir)) return res.json([]);
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("backup-"))
    .sort()
    .reverse()
    .map((f) => {
      const stat = fs.statSync(path.join(backupsDir, f));
      return { name: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    });
  res.json(files);
});

// Restores one of the automatic daily backups. Like import, this merges: everything in the
// backup is written back as it was that day, and anything created since is left alone.
syncRouter.post("/backups/:name/restore", (req, res) => {
  const name = req.params.name;
  // The name becomes a file path, so it has to be exactly a backup file name and nothing else.
  if (!/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)) return res.status(400).json({ error: "invalid backup name" });
  const file = path.join(backupsDir, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "backup not found" });
  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return res.status(400).json({ error: "backup file is unreadable" });
  }
  if (!parsed?.data || typeof parsed.data !== "object") return res.status(400).json({ error: "backup has no data" });
  importAll(parsed.data);
  const counts: Record<string, number> = {};
  for (const [table, rows] of Object.entries(parsed.data)) if (Array.isArray(rows) && rows.length) counts[table] = rows.length;
  res.json({ ok: true, exportedAt: parsed.exportedAt ?? null, counts });
});

syncRouter.get("/export", (_req, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=orbit-backup.json");
  res.json(dumpAll());
});

syncRouter.post("/import", (req, res) => {
  const { data } = req.body ?? {};
  if (!data || typeof data !== "object") return res.status(400).json({ error: "data required" });
  importAll(data);
  res.json({ ok: true });
});

// Passphrase-encrypted export — scrypt-derived key, AES-256-GCM. The passphrase never
// touches disk; only the ciphertext + salt + iv + auth tag do. Standard Node crypto, no
// external key service.
syncRouter.post("/export-encrypted", (req, res) => {
  const passphrase = req.body?.passphrase as string;
  if (!passphrase || passphrase.length < 4) return res.status(400).json({ error: "passphrase (min 4 chars) required" });

  const plaintext = JSON.stringify(dumpAll());
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  res.setHeader("Content-Disposition", "attachment; filename=orbit-backup.encrypted.json");
  res.json({
    version: 1,
    encrypted: true,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  });
});

syncRouter.post("/import-encrypted", (req, res) => {
  const { passphrase, salt, iv, authTag, ciphertext } = req.body ?? {};
  if (!passphrase || !salt || !iv || !authTag || !ciphertext) {
    return res.status(400).json({ error: "passphrase, salt, iv, authTag, ciphertext all required" });
  }
  let parsed: any;
  try {
    const key = crypto.scryptSync(passphrase, Buffer.from(salt, "base64"), 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
    parsed = JSON.parse(decrypted);
  } catch {
    return res.status(400).json({ error: "wrong passphrase or corrupted backup" });
  }
  if (!parsed?.data || typeof parsed.data !== "object") return res.status(400).json({ error: "backup has no data" });
  // Outside the try: a failure while writing rows is a real error, not a bad passphrase.
  importAll(parsed.data);
  res.json({ ok: true });
});
