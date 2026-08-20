import Database from "better-sqlite3";
import path from "node:path";
import { dataDir } from "./dataDir.js";

export const db = new Database(path.join(dataDir, "productivity.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  description TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | in_progress | done | archived
  priority TEXT NOT NULL DEFAULT 'none', -- none | low | medium | high | urgent
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  is_inbox INTEGER NOT NULL DEFAULT 0,
  estimate_minutes INTEGER,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  start_date TEXT,
  scheduled_at TEXT,
  recurrence TEXT, -- none | daily | weekly | monthly
  order_index INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocks_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, blocks_task_id)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'pomodoro', -- pomodoro | flowtime | stopwatch | custom
  planned_minutes INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  was_completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  location TEXT,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boundaries (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- main | hobby | game | restricted
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scope_review_items (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL, -- project | task | idea
  status TEXT NOT NULL DEFAULT 'pending', -- pending | parked | allowed | rejected
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  horizon TEXT NOT NULL DEFAULT 'monthly', -- life | annual | semester | monthly | weekly | daily
  parent_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  target_date TEXT,
  progress REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active | done | abandoned
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily', -- daily | weekly | custom
  target_per_period INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  UNIQUE(habit_id, date)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  color TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- task_completed | task_overdue | timer_started | timer_stopped | focus_started | focus_ended | daily_start
  action_type TEXT NOT NULL, -- create_task | notify | webhook | run_ai_workflow
  config_json TEXT NOT NULL DEFAULT '{}',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  ran_at TEXT NOT NULL,
  result TEXT
);

CREATE TABLE IF NOT EXISTS ai_actions (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | executed | rejected
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'automation',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  priority TEXT NOT NULL DEFAULT 'none',
  estimate_minutes INTEGER,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  subtasks_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title, notes, content='tasks', content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, body, content='notes', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO notes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, notes) VALUES (new.rowid, new.title, new.notes);
END;
CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, notes) VALUES ('delete', old.rowid, old.title, old.notes);
END;
CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, notes) VALUES ('delete', old.rowid, old.title, old.notes);
  INSERT INTO tasks_fts(rowid, title, notes) VALUES (new.rowid, new.title, new.notes);
END;
`);

// Lightweight migration for columns added after the initial CREATE TABLE — SQLite's
// CREATE TABLE IF NOT EXISTS won't retrofit new columns onto an already-existing db file.
const notesColumns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
const notesColumnNames = new Set(notesColumns.map((c) => c.name));
if (!notesColumnNames.has("color")) db.exec("ALTER TABLE notes ADD COLUMN color TEXT");
if (!notesColumnNames.has("pinned")) db.exec("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");

const eventColumns = db.prepare("PRAGMA table_info(calendar_events)").all() as { name: string }[];
const eventColumnNames = new Set(eventColumns.map((c) => c.name));
if (!eventColumnNames.has("all_day")) db.exec("ALTER TABLE calendar_events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0");
if (!eventColumnNames.has("color")) db.exec("ALTER TABLE calendar_events ADD COLUMN color TEXT");
if (!eventColumnNames.has("location")) db.exec("ALTER TABLE calendar_events ADD COLUMN location TEXT");
if (!eventColumnNames.has("project_id")) db.exec("ALTER TABLE calendar_events ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL");
if (!eventColumnNames.has("updated_at")) db.exec("ALTER TABLE calendar_events ADD COLUMN updated_at TEXT");

const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
const taskColumnNames = new Set(taskColumns.map((c) => c.name));
if (!taskColumnNames.has("deleted_at")) db.exec("ALTER TABLE tasks ADD COLUMN deleted_at TEXT");
if (!taskColumnNames.has("color")) db.exec("ALTER TABLE tasks ADD COLUMN color TEXT");
if (!taskColumnNames.has("energy")) db.exec("ALTER TABLE tasks ADD COLUMN energy TEXT");

if (!notesColumnNames.has("deleted_at")) db.exec("ALTER TABLE notes ADD COLUMN deleted_at TEXT");

const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
const projectColumnNames = new Set(projectColumns.map((c) => c.name));
if (!projectColumnNames.has("deleted_at")) db.exec("ALTER TABLE projects ADD COLUMN deleted_at TEXT");

// Time-boxed + quantity-based habits (e.g. "drink water by midnight", "read 20 pages"),
// on top of the original plain daily-checkbox habit.
const habitColumns = db.prepare("PRAGMA table_info(habits)").all() as { name: string }[];
const habitColumnNames = new Set(habitColumns.map((c) => c.name));
if (!habitColumnNames.has("deadline_time")) db.exec("ALTER TABLE habits ADD COLUMN deadline_time TEXT"); // HH:MM, local
if (!habitColumnNames.has("target_count")) db.exec("ALTER TABLE habits ADD COLUMN target_count INTEGER"); // NULL = simple done/not-done
if (!habitColumnNames.has("unit")) db.exec("ALTER TABLE habits ADD COLUMN unit TEXT"); // e.g. "glasses", "pages"
if (!habitColumnNames.has("archived")) db.exec("ALTER TABLE habits ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");

const habitLogColumns = db.prepare("PRAGMA table_info(habit_logs)").all() as { name: string }[];
const habitLogColumnNames = new Set(habitLogColumns.map((c) => c.name));
if (!habitLogColumnNames.has("amount")) db.exec("ALTER TABLE habit_logs ADD COLUMN amount INTEGER NOT NULL DEFAULT 1");

db.exec(`
CREATE TABLE IF NOT EXISTS daily_checkins (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  mood INTEGER, -- 1-5
  energy INTEGER, -- 1-5
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Images attached to a task/note/project/board (or standalone). Files live on disk under
-- <dataDir>/attachments/<id>.<ext>; this table is just the pointer + metadata.
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  entity_type TEXT NOT NULL, -- task | note | project | board
  entity_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- Freeform per-project (or standalone) canvas: sticky notes, typed text, pasted images,
-- freehand sketch strokes, all positioned on an infinite board. elements is a JSON array
-- of shape objects (id/type/x/y/w/h/...type-specific fields) — no per-shape table, since
-- the shape of what's on a board is inherently open-ended and doesn't benefit from being
-- normalized into columns.
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  elements TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id);
`);

// Backfill notes_fts for databases that had a `notes` table before the FTS index existed.
const notesFtsCount = (db.prepare("SELECT COUNT(*) c FROM notes_fts").get() as any).c;
const notesCount = (db.prepare("SELECT COUNT(*) c FROM notes").get() as any).c;
if (notesFtsCount === 0 && notesCount > 0) {
  db.exec(`INSERT INTO notes_fts(rowid, title, body) SELECT rowid, title, body FROM notes`);
}
