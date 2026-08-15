import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { fireTrigger } from "./automationEngine.js";
import { dataDir } from "./dataDir.js";

export const backupsDir = path.join(dataDir, "backups");

const TABLES = ["projects", "tags", "task_tags", "tasks", "task_dependencies", "calendar_events", "goals", "habits", "habit_logs", "notes", "daily_checkins"];

function getSetting(key: string, fallback: unknown) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function setSetting(key: string, value: unknown) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    JSON.stringify(value)
  );
}

// Fires the daily_start automation trigger once per calendar day, and task_overdue once
// per task per day. There's no OS-level cron here — this is a plain in-process interval
// that only runs while the server is up, which is the honest local-only equivalent.
async function tick() {
  const today = new Date().toISOString().slice(0, 10);

  const lastDailyStart = getSetting("_lastDailyStartDate", null);
  if (lastDailyStart !== today) {
    setSetting("_lastDailyStartDate", today);
    await fireTrigger("daily_start", {});
  }

  const overdueFiredLog = getSetting("_overdueFiredLog", {}) as Record<string, string>;
  const overdueTasks = db
    .prepare("SELECT id, title, project_id FROM tasks WHERE deleted_at IS NULL AND status = 'open' AND due_date IS NOT NULL AND due_date < ?")
    .all(today) as { id: string; title: string; project_id: string | null }[];
  let changed = false;
  for (const t of overdueTasks) {
    if (overdueFiredLog[t.id] === today) continue;
    await fireTrigger("task_overdue", { taskId: t.id, taskTitle: t.title, projectId: t.project_id ?? undefined });
    overdueFiredLog[t.id] = today;
    changed = true;
  }
  if (changed) setSetting("_overdueFiredLog", overdueFiredLog);
}

function runScheduledBackup() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const lastBackup = getSetting("_lastBackupDate", null);
  if (lastBackup === today) return;

  const dump: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  const file = path.join(backupsDir, `backup-${today}.json`);
  fs.writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, data: dump }));
  setSetting("_lastBackupDate", today);

  // Keep the last 14 daily backups.
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("backup-"))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - 14))) {
    fs.unlinkSync(path.join(backupsDir, f));
  }
}

export function startScheduler() {
  const run = () => {
    tick().catch(() => {});
    try {
      runScheduledBackup();
    } catch {
      // best-effort — a failed local backup shouldn't take the server down
    }
  };
  run();
  setInterval(run, 5 * 60 * 1000);
}
