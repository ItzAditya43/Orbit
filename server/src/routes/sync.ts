import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db.js";
import { backupsDir } from "../scheduler.js";

export const syncRouter = Router();

const TABLES = ["projects", "tags", "task_tags", "tasks", "task_dependencies", "calendar_events", "goals", "habits", "habit_logs", "notes"];

function dumpAll() {
  const dump: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return { exportedAt: new Date().toISOString(), version: 1, data: dump };
}

function importAll(data: Record<string, any[]>) {
  const importTx = db.transaction(() => {
    for (const table of TABLES) {
      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => "?").join(",");
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`);
      for (const row of rows) stmt.run(...columns.map((c) => row[c]));
    }
  });
  importTx();
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

syncRouter.get("/export", (_req, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=orbit-backup.json");
  res.json(dumpAll());
});

syncRouter.post("/import", (req, res) => {
  const { data } = req.body ?? {};
  if (!data) return res.status(400).json({ error: "data required" });
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
  try {
    const key = crypto.scryptSync(passphrase, Buffer.from(salt, "base64"), 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decrypted);
    importAll(parsed.data);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "wrong passphrase or corrupted backup" });
  }
});
