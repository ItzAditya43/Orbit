import express from "express";
import cors from "cors";
import "./db.js";
import { tasksRouter } from "./routes/tasks.js";
import { projectsRouter } from "./routes/projects.js";
import { tagsRouter } from "./routes/tags.js";
import { focusRouter } from "./routes/focus.js";
import { timeEntriesRouter } from "./routes/timeEntries.js";
import { calendarRouter } from "./routes/calendar.js";
import { analyticsRouter } from "./routes/analytics.js";
import { boundariesRouter, scopeReviewRouter } from "./routes/boundaries.js";
import { goalsRouter } from "./routes/goals.js";
import { habitsRouter } from "./routes/habits.js";
import { checkinsRouter } from "./routes/checkins.js";
import { notesRouter } from "./routes/notes.js";
import { automationsRouter, notificationsRouter } from "./routes/automations.js";
import { aiRouter } from "./routes/ai.js";
import { syncRouter } from "./routes/sync.js";
import { settingsRouter } from "./routes/settings.js";
import { taskTemplatesRouter } from "./routes/taskTemplates.js";
import { reviewRouter } from "./routes/review.js";
import { filtersRouter } from "./routes/filters.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { boardsRouter } from "./routes/boards.js";
import { deviceRouter } from "./routes/device.js";
import { startScheduler } from "./scheduler.js";

const app = express();
app.use(cors());
// Pasted/uploaded images travel as base64 inside the JSON body (see routes/attachments.ts —
// avoids a multipart-parsing dependency for a single-user local app) — default 100kb express
// limit would reject anything but a tiny thumbnail, so this is raised for real photos/screenshots.
app.use(express.json({ limit: "30mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/tasks", tasksRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/focus-sessions", focusRouter);
app.use("/api/time-entries", timeEntriesRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/boundaries", boundariesRouter);
app.use("/api/scope-review", scopeReviewRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/habits", habitsRouter);
app.use("/api/checkins", checkinsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/automations", automationsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/sync", syncRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/task-templates", taskTemplatesRouter);
app.use("/api/review", reviewRouter);
app.use("/api/filters", filtersRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/boards", boardsRouter);
app.use("/api/device", deviceRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4310;
app.listen(PORT, () => {
  console.log(`orbit server listening on http://localhost:${PORT}`);
  startScheduler();
});
