#!/usr/bin/env node
const BASE = process.env.PRODUCTIVITY_API ?? "http://localhost:4310/api";

async function req(path, opts) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

function printTasks(tasks) {
  if (tasks.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const t of tasks) {
    const mark = t.status === "done" ? "x" : " ";
    const due = t.due_date ? ` (due ${t.due_date})` : "";
    console.log(`  [${mark}] ${t.title}${due}  ${t.id.slice(0, 8)}`);
  }
}

async function main() {
  const [, , cmd, sub, ...rest] = process.argv;

  if (cmd === "task" && sub === "add") {
    const title = rest.join(" ");
    if (!title) return console.error("usage: productivity task add <title>");
    const task = await req("/tasks", { method: "POST", body: JSON.stringify({ title }) });
    console.log(`Created: ${task.title} (${task.id})`);
    return;
  }

  if (cmd === "task" && sub === "list") {
    const view = rest[0] ?? "today";
    const tasks = await req(`/tasks?view=${view}`);
    console.log(`Tasks (${view}):`);
    printTasks(tasks);
    return;
  }

  if (cmd === "task" && sub === "done") {
    const query = rest.join(" ");
    if (!query) return console.error("usage: productivity task done <id-or-title>");
    const tasks = await req(`/tasks?status=open`);
    const match = tasks.find((t) => t.id.startsWith(query) || t.title.toLowerCase().includes(query.toLowerCase()));
    if (!match) return console.error(`No matching open task for "${query}"`);
    await req(`/tasks/${match.id}/complete`, { method: "POST" });
    console.log(`Completed: ${match.title}`);
    return;
  }

  if (cmd === "today") {
    const tasks = await req("/tasks?view=today");
    console.log("Today:");
    printTasks(tasks);
    return;
  }

  if (cmd === "timer" && sub === "start") {
    const entry = await req("/time-entries", { method: "POST", body: JSON.stringify({ taskId: rest[0] }) });
    console.log(`Timer started (${entry.id})`);
    return;
  }

  if (cmd === "timer" && sub === "stop") {
    const entries = await req("/time-entries");
    const running = entries.find((e) => !e.ended_at);
    if (!running) return console.error("No timer running.");
    const stopped = await req(`/time-entries/${running.id}/stop`, { method: "POST" });
    console.log(`Stopped after ${Math.round(stopped.duration_seconds / 60)}m`);
    return;
  }

  if (cmd === "focus") {
    const minutes = Number(rest[0] ?? 25);
    const session = await req("/focus-sessions", { method: "POST", body: JSON.stringify({ mode: "pomodoro", plannedMinutes: minutes }) });
    console.log(`Focus session started for ${minutes}m (${session.id}). Run "productivity focus-end ${session.id}" when done.`);
    return;
  }

  if (cmd === "focus-end") {
    await req(`/focus-sessions/${rest[0]}/end`, { method: "POST", body: JSON.stringify({ wasCompleted: true }) });
    console.log("Focus session ended.");
    return;
  }

  if (cmd === "ai") {
    const text = [sub, ...rest].filter(Boolean).join(" ");
    const result = await req("/ai/command", { method: "POST", body: JSON.stringify({ text }) });
    console.log(result.message ?? JSON.stringify(result.result, null, 2));
    return;
  }

  console.log(`orbit — Linux-first productivity app CLI

Usage:
  orbit today
  orbit task add <title>
  orbit task list [today|inbox|upcoming]
  orbit task done <id-or-title>
  orbit timer start [taskId]
  orbit timer stop
  orbit focus [minutes]
  orbit focus-end <sessionId>
  orbit ai "<natural language command>"

Requires the server running (npm run dev:server from the repo root).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
