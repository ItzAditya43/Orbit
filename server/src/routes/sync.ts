import { Router } from "express";
import { db } from "../db.js";

export const syncRouter = Router();

const TABLES = ["projects", "tags", "task_tags", "tasks", "task_dependencies", "calendar_events", "goals", "habits", "habit_logs", "notes"];

// Full local export/import — the "backup/restore" half of §27 Sync. Multi-device sync with
// conflict resolution needs a server counterpart this app doesn't have yet; this is the
// local-first floor that unblocks it later.
syncRouter.get("/export", (_req, res) => {
  const dump: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  res.setHeader("Content-Disposition", "attachment; filename=productivity-backup.json");
  res.json({ exportedAt: new Date().toISOString(), version: 1, data: dump });
});

syncRouter.post("/import", (req, res) => {
  const { data } = req.body ?? {};
  if (!data) return res.status(400).json({ error: "data required" });
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
  res.json({ ok: true });
});
