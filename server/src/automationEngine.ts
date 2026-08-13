import { randomUUID } from "node:crypto";
import { db } from "./db.js";

interface TriggerContext {
  taskId?: string;
  taskTitle?: string;
  projectId?: string;
  [key: string]: unknown;
}

// Fires all enabled automations matching triggerType. Runs synchronously — this is a
// local single-user app, so no queue is needed for Phase 6 scope.
export async function fireTrigger(triggerType: string, ctx: TriggerContext = {}) {
  const automations = db
    .prepare("SELECT * FROM automations WHERE trigger_type = ? AND is_enabled = 1")
    .all(triggerType) as any[];

  for (const automation of automations) {
    let result = "ok";
    try {
      const config = JSON.parse(automation.config_json || "{}");
      await runAction(automation.action_type, config, ctx);
    } catch (err: any) {
      result = `error: ${err.message}`;
    }
    db.prepare("INSERT INTO automation_runs (id, automation_id, ran_at, result) VALUES (?,?,?,?)").run(
      randomUUID(),
      automation.id,
      new Date().toISOString(),
      result
    );
  }
}

async function runAction(actionType: string, config: any, ctx: TriggerContext) {
  const now = new Date().toISOString();
  if (actionType === "create_task") {
    db.prepare(
      `INSERT INTO tasks (id, title, notes, project_id, priority, due_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      randomUUID(),
      interpolate(config.title ?? "New task", ctx),
      config.notes ?? null,
      config.projectId ?? null,
      config.priority ?? "none",
      config.dueDate ?? null,
      now,
      now
    );
  } else if (actionType === "notify") {
    db.prepare("INSERT INTO notifications (id, message, source, created_at) VALUES (?,?,?,?)").run(
      randomUUID(),
      interpolate(config.message ?? "Automation fired", ctx),
      "automation",
      now
    );
  } else if (actionType === "webhook") {
    if (config.url) {
      await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      }).catch(() => {});
    }
  }
  // run_ai_workflow intentionally left as a stub — see server/src/routes/ai.ts for the
  // deterministic-fallback AI gateway this would delegate to.
}

function interpolate(template: string, ctx: TriggerContext) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(ctx[key] ?? ""));
}
