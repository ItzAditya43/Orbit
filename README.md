<p align="center">
  <img src="logo.png" alt="Orbit logo" width="120" />
</p>

<h1 align="center">Orbit</h1>

<p align="center">
  A local-first, Linux-first productivity app — tasks, projects, goals, habits, scheduling,
  a focus timer, time tracking, analytics, an attention-boundary system, and an AI operator
  that can actually drive the app, all running on your own machine with no mandatory account
  or cloud.
</p>

## Run (web + API)

```
npm install
npm run dev
```

- API: http://localhost:4310 — Express + better-sqlite3, DB at `server/data/productivity.sqlite`
- Web: http://localhost:5173 — React + Vite + Tailwind v4 + React Query + Zustand

## Run (Linux desktop app)

```
npm run dev:desktop
```

Requires the Rust toolchain (`cargo`, `rustc`) and Linux desktop deps (webkit2gtk, gtk3).
Prebuilt `.AppImage`/`.deb` are published on the [Releases page](https://github.com/ItzAditya43/Orbit/releases).

## Run (CLI)

```
npm run cli -- today
npm run cli -- task add "Write report"
npm run cli -- task list today
npm run cli -- task done "report"
npm run cli -- timer start
npm run cli -- timer stop
npm run cli -- focus 25
npm run cli -- ai "plan my day"
```

Talks to the same running API server.

## Structure

```
server/   Express REST API + SQLite (schema, routes, automation engine, AI tool registry)
web/      React SPA (all views) + src-tauri/ (Linux desktop shell)
cli/      Node CLI hitting the same API
logo.png  App icon / brand mark, used as-is for the Tauri app icon and web favicon
```

## What's implemented — tested end-to-end, not just written

Every endpoint below was hit live against a running server this session (create/read/update/
delete, error paths, an export→import round trip) — this list reflects what actually works,
not what the code merely intends to do.

**Core task system**: tasks, unlimited-depth subtasks, projects, tags, priorities, due/start/
scheduled dates, task dependencies (blocked-by), full-text search (SQLite FTS5).

**Views**: Today, Inbox with quick capture and project routing, Upcoming (grouped by date),
Projects (list view + kanban board with drag-and-drop), internal Calendar (week view, tasks
overlaid as chips), Search, Analytics (completion trends, focus minutes/day, project velocity,
overdue count), dark/light theme.

**Focus & time**: Pomodoro timer with session logging, manual time-entry tracking with daily
totals.

**Recurring tasks**: daily/weekly/monthly — completing a recurring task spawns the next
occurrence automatically.

**Goals & habits**: goal hierarchy with horizon (life/annual/semester/monthly/weekly/daily)
and progress tracking; habit creation with daily completion logging.

**Notes**: markdown-capable notes, linkable to a project or task.

**Rigid (attention boundaries)**: define active boundaries by category (main/hobby/game/
restricted), check whether a new idea/project falls in scope, park out-of-scope ideas into a
scope-review queue. Matching is simple substring-based, not AI-classified — a real "is this
in scope" judgment call would need the AI operator wired into this flow, which it isn't yet.

**AI operator**: an internal tool registry (`server/src/aiTools.ts` — create/complete/move/
schedule tasks, get today/available-time, capture ideas, start focus sessions) callable by a
deterministic command parser that works with zero AI configured (verified: "add task X
tomorrow", "complete X", "start a 25 minute focus", "plan my day", "how much time do I have"
all parse and execute correctly), plus an optional local-Ollama tool-calling path if
`OLLAMA_HOST` is set. Global "Ask/Command" bar (Ctrl+K) in the web UI.

**Automation engine**: trigger → action rules (task-completed and focus-ended triggers wired
in; create_task/notify/webhook actions), verified firing with `{taskTitle}` template
interpolation and run history logged.

**Backup/restore**: full local JSON export and import via `/api/sync`, verified round-trip.

**Linux desktop shell (Tauri)**: wraps the same web UI, confirmed compiling against the real
Rust/GTK/webkit2gtk toolchain. System tray (open / quick capture / quit), global hotkey
(Ctrl+Shift+Space) for quick capture from anywhere on the desktop, desktop notifications,
close-to-tray background behavior. App icon generated from `logo.png` for all platforms
Tauri supports.

**CLI**: `task add/list/done`, `timer start/stop`, `today`, `focus`/`focus-end`, `ai` — all
verified against a live server.

## What's NOT done — real gaps, not hedging

- **No auth / no multi-user.** Single local user, no login, no API-token enforcement (the
  `api_tokens` table exists in the schema but nothing checks it).
- **No real sync backend.** The export/import round-trip works for single-machine backup and
  restore, but there's no server counterpart for multi-device sync or conflict resolution —
  §27 of the original spec is only half-built.
- **No background scheduler.** The automation engine only fires triggers that happen inline
  during a request (task completed, focus session ended). The trigger types that need a
  clock — task-overdue polling, calendar-event-approaching, user-idle, daily-start, weekly
  review — are defined in the schema's `trigger_type` values but nothing ever fires them,
  because there's no cron/scheduler process.
- **No Linux idle detection, active-window/app detection, or D-Bus integration.** These need
  platform-specific crates (`zbus` for D-Bus, `x11rb`/an XDG portal client for window/idle
  state under X11 or Wayland) that this scaffold doesn't include. The tray icon, global
  hotkey, and notifications are real; "detect what app the user is in" is not.
- **No distraction/website/app blocking.** The Focus system is a working timer with session
  logging, but there's no domain/app blocklist, allowlist, or Linux-level enforcement.
- **No external calendar integration.** The Calendar view is internal-only — no Google
  Calendar, CalDAV, or ICS import/export, despite being in the spec.
- **AI operator has only been verified via the deterministic fallback.** The Ollama
  tool-calling path is implemented and will be used automatically if `OLLAMA_HOST` is set and
  a model is reachable, but no live Ollama model was exercised in this session — treat that
  path as implemented-but-unverified, not confirmed working.
- **No plugin system, public API docs, or webhooks beyond the one automation action type.**
  §31 (developer platform) is unaddressed beyond the REST API that already exists for the
  app's own frontend/CLI.
- **No import from other tools** (Todoist, Super Productivity, CSV/ICS) — only Orbit's own
  JSON export/import format is supported.
- **Kanban only has three fixed columns** (Open/Doing/Done) — no custom statuses or swimlanes.
- **Analytics has no date-range picker** — it's hardcoded to the last 14 days / all-time
  totals.

## Honest bottom line

This is a working full-stack app with real, tested coverage of task management, projects,
scheduling views, focus/time tracking, recurring tasks, goals/habits/notes, a first pass at
attention boundaries, a functioning (if simple) automation engine, and a Linux desktop shell
with tray/hotkey/notifications — not a mockup. It is not a finished product: the sync engine,
scheduled automations, Linux idle/window detection, distraction blocking, and AI-provider
verification beyond the deterministic fallback are the honest list of what's left.
