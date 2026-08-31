import { Router } from "express";
import { db } from "../db.js";

export const settingsRouter = Router();

const DEFAULTS: Record<string, unknown> = {
  defaultView: "today",
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  aiPermissionMode: "assist", // suggest | assist | autopilot
  aiProvider: "local", // local (Ollama on this machine) | cloud (Ollama Cloud, free tier)
  ollamaModel: "", // empty = provider-specific default in routes/ai.ts
  ollamaCloudApiKey: "",
  notifyDueTasks: true,
  periodicReminderEnabled: false,
  periodicReminderIntervalMinutes: 60,
  periodicReminderMessage: "Check your Board and to-dos",
  pomodoroLongBreakEvery: 4,
};

function readAll() {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      stored[r.key] = r.value;
    }
  }
  return { ...DEFAULTS, ...stored };
}

settingsRouter.get("/", (_req, res) => {
  res.json(readAll());
});

settingsRouter.patch("/", (req, res) => {
  const body = req.body ?? {};
  const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [key, value] of Object.entries(body)) {
    stmt.run(key, JSON.stringify(value));
  }
  res.json(readAll());
});
