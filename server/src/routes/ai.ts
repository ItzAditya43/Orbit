import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { runTool, TOOL_NAMES, tools, READ_ONLY_TOOLS, type ToolName } from "../aiTools.js";

export const aiRouter = Router();

function getPermissionMode(): "suggest" | "assist" | "autopilot" {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'aiPermissionMode'").get() as any;
  if (!row) return "assist";
  try {
    return JSON.parse(row.value);
  } catch {
    return "assist";
  }
}

// Executes immediately unless the user has AI set to "suggest" mode and the tool mutates
// state — in that case the action is queued in ai_actions for explicit approval (§16 of
// the spec: Suggest / Assist / Autopilot permission tiers).
function decideAndRun(toolName: string, args: any) {
  const mode = getPermissionMode();
  const isReadOnly = READ_ONLY_TOOLS.has(toolName as ToolName);
  if (isReadOnly || mode !== "suggest") {
    const result = runTool(toolName, args);
    return { status: "executed" as const, result };
  }
  const id = randomUUID();
  db.prepare("INSERT INTO ai_actions (id, tool_name, args_json, status, created_at) VALUES (?,?,?,?,?)").run(
    id,
    toolName,
    JSON.stringify(args ?? {}),
    "pending",
    new Date().toISOString()
  );
  return { status: "pending" as const, actionId: id };
}

aiRouter.get("/status", async (_req, res) => {
  const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  let ollamaAvailable = false;
  try {
    const r = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(800) });
    ollamaAvailable = r.ok;
  } catch {
    ollamaAvailable = false;
  }
  res.json({ ollamaAvailable, ollamaHost, tools: TOOL_NAMES, fallback: "deterministic", permissionMode: getPermissionMode() });
});

aiRouter.get("/actions", (req, res) => {
  const status = (req.query.status as string) ?? "pending";
  res.json(db.prepare("SELECT * FROM ai_actions WHERE status = ? ORDER BY created_at DESC").all(status));
});

aiRouter.post("/actions/:id/approve", (req, res) => {
  const action: any = db.prepare("SELECT * FROM ai_actions WHERE id = ?").get(req.params.id);
  if (!action) return res.status(404).json({ error: "not found" });
  const args = JSON.parse(action.args_json || "{}");
  // Fuzzy-match-by-title tools (see aiTools.ts) throw when a suggested edit no longer
  // resolves to exactly one entity — without this, that exception would crash the request
  // unhandled and leave the action permanently stuck "pending" with no way to dismiss it.
  try {
    const result = runTool(action.tool_name, args);
    db.prepare("UPDATE ai_actions SET status = 'executed', result_json = ? WHERE id = ?").run(JSON.stringify(result), action.id);
    res.json({ ok: true, result });
  } catch (e: any) {
    const message = e?.message ?? "failed to execute";
    db.prepare("UPDATE ai_actions SET status = 'failed', result_json = ? WHERE id = ?").run(JSON.stringify({ error: message }), action.id);
    res.status(400).json({ ok: false, error: message });
  }
});

aiRouter.post("/actions/:id/reject", (req, res) => {
  db.prepare("UPDATE ai_actions SET status = 'rejected' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// LLM-issued tool calls are restricted to tools that don't need an existing entity's ID —
// the model has no grounding to know real task/project IDs, so anything requiring one
// (complete_task, update_task, move_task, etc.) stays deterministic-parser-only.
// get_today/get_available_time were dropped from this list after live testing: the model
// kept reaching for them on plain unrelated questions ("why is sleep important" -> get_today),
// giving a useless answer instead of actually replying. Both are already covered reliably by
// the deterministic parser's own phrases ("plan my day", "how much time do I have").
const LLM_SAFE_TOOLS: ToolName[] = [
  "create_task",
  "capture_idea",
  "start_focus_session",
  "create_project",
  "create_calendar_event",
  "create_habit",
  "update_task_by_title",
  "update_habit_by_title",
  "update_goal_by_title",
  "update_project_by_title",
  "update_note_by_title",
  "search_notes",
];
// No delete_* tool is ever in this list, and none ever will be — the AI can create and edit,
// never delete, no matter what permission mode or approval state is in play.

// POST /api/ai/command  { text: "add task buy milk tomorrow" }
//
// The deterministic parser runs FIRST, not Ollama — it's fast and exactly-reliable for the
// command shapes it recognizes. Small local models (what's actually feasible to run without
// a GPU/heavy RAM) are unreliable at strict tool-arg JSON: tested live against llama3.2:1b,
// it invented its own args schema and dropped "tomorrow" from a date entirely. So when Ollama
// does issue a mutating tool call, it's ALWAYS queued for approval (see decideAndRunViaLlm)
// regardless of the user's AI permission mode — the deterministic parser is still what's
// trusted to execute immediately, this just gives free-form phrasing a path to *suggest*
// an action instead of only being able to have a conversation about it.
aiRouter.post("/command", async (req, res) => {
  const text: string = req.body?.text ?? "";
  if (!text.trim()) return res.status(400).json({ error: "text required" });

  const deterministic = runDeterministic(text);
  if (deterministic.tool !== null) return res.json(deterministic);

  const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  try {
    const result = await askOllama(ollamaHost, text);
    if (result) return res.json(result);
  } catch {
    // fall through to the deterministic "didn't recognize that" message
  }

  res.json(deterministic);
});

// Extracts the first {...} block from a response, tolerating stray prose/markdown fences
// around it — small models frequently don't follow "JSON only" instructions exactly.
function extractJsonObject(content: string): any | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function askOllama(host: string, text: string): Promise<any | null> {
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:1b";
  const r = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are Orbit's assistant, a local productivity app. Only use a tool call when the user is " +
            "directly asking you to create, add, start, or do something concrete right now. Any question, " +
            "request for information/advice/opinion, or general conversation is always a reply, never a tool " +
            'call — e.g. "why is sleep important" is a reply, NOT get_today. If in doubt, reply.\n' +
            "If the user clearly wants one of these actions taken, respond ONLY with strict JSON: " +
            `{"tool": <one of ${LLM_SAFE_TOOLS.join(", ")}>, "args": {...}}.\n` +
            "create_task args: {title, dueDate?} — dueDate as YYYY-MM-DD.\n" +
            'create_habit args: {title, frequency?, deadlineTime?, targetCount?, unit?} — use this for recurring ' +
            'habits/routines ("make a habit of X", "I want to do X every day/week"). frequency is "daily" ' +
            '(default), "weekly", or "monthly". deadlineTime is a 24-hour "HH:MM" if they mention a specific ' +
            'time (e.g. "at 7pm" -> "19:00"). If they mention a number/quantity to hit (e.g. "drink 8 glasses ' +
            'of water", "read 20 pages"), put the number in targetCount and the unit in unit, and keep title ' +
            'short (e.g. title "Drink water", targetCount 8, unit "glasses" — NOT title "Drink 8 glasses of ' +
            'water"). Leave targetCount/unit unset entirely for a plain done/not-done habit.\n' +
            "To edit/change/update ANYTHING that already exists (a habit, task, goal, project, or note), you " +
            "MUST respond with a tool call, never a reply — you cannot actually change anything by just saying " +
            'you did in a reply, that would be a lie. Use update_task_by_title / update_habit_by_title / ' +
            'update_goal_by_title / update_project_by_title / update_note_by_title with args {title: ' +
            '"<enough of its existing name/title to identify it>", changes: {...only the fields to change...}} ' +
            '— e.g. "change my shower habit to 8pm" -> {"tool": "update_habit_by_title", "args": {"title": ' +
            '"shower", "changes": {"deadlineTime": "20:00"}}}. Never invent an id. There is no delete tool ' +
            "available to you — if the user asks to delete/remove something, tell them to do it from the " +
            "relevant page themselves.\n" +
            "Otherwise, or if you're unsure, just answer directly and briefly (2-3 sentences max) as JSON: " +
            '{"reply": "<your answer>"}. You do not have access to their existing tasks/data beyond what a ' +
            "tool call returns. Never include prose outside the JSON object, never use markdown fences.",
        },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return null;
  const data: any = await r.json();
  const content: string = data?.message?.content ?? "";
  const parsed = extractJsonObject(content);

  if (parsed?.reply) {
    return { provider: "ollama", tool: null, status: "executed", message: String(parsed.reply) };
  }
  if (parsed?.tool && LLM_SAFE_TOOLS.includes(parsed.tool)) {
    return decideAndRunViaLlm(parsed.tool, parsed.args ?? {});
  }
  // Model ignored the JSON instruction but still said something useful in plain text.
  if (!parsed && content.trim()) {
    return { provider: "ollama", tool: null, status: "executed", message: content.trim() };
  }
  return null;
}

// Unlike decideAndRun (used by the deterministic parser), this ALWAYS queues for approval —
// an LLM-issued tool call is inherently less trustworthy than a regex match, regardless of
// what permission mode the user has configured for deterministic commands.
function decideAndRunViaLlm(toolName: string, args: any) {
  const isReadOnly = READ_ONLY_TOOLS.has(toolName as ToolName);
  const label = toolName.replace(/_/g, " ");
  if (isReadOnly) {
    const result = runTool(toolName, args);
    return { provider: "ollama", tool: toolName, args, status: "executed" as const, result, message: `Done — ${label}.` };
  }
  const id = randomUUID();
  db.prepare("INSERT INTO ai_actions (id, tool_name, args_json, status, created_at) VALUES (?,?,?,?,?)").run(
    id, toolName, JSON.stringify(args ?? {}), "pending", new Date().toISOString()
  );
  return {
    provider: "ollama",
    tool: toolName,
    args,
    status: "pending" as const,
    actionId: id,
    message: `Suggested: ${label}${args.title ? ` "${args.title}"` : ""}. Approve to confirm.`,
  };
}

// Deterministic fallback: simple pattern matching, no model dependency (§18 "deterministic operations").
function runDeterministic(text: string) {
  const lower = text.toLowerCase().trim();

  if (/^(add|create|new) task/.test(lower) || /^capture/.test(lower)) {
    const dueDate = extractDate(lower);
    const title =
      text
        .replace(/^(add|create|new) task\s*/i, "")
        .replace(/^capture\s*/i, "")
        .replace(/\b(today|tomorrow)\b/gi, "")
        .trim() || text;
    const outcome = decideAndRun("create_task", { title, dueDate });
    return {
      provider: "deterministic",
      tool: "create_task",
      ...outcome,
      message: outcome.status === "pending" ? `Suggested: create task "${title}". Approve to confirm.` : `Created task "${title}".`,
    };
  }

  if (/^complete /.test(lower) || /^done /.test(lower)) {
    const title = text.replace(/^(complete|done)\s*/i, "").trim();
    const match = db.prepare("SELECT id FROM tasks WHERE title LIKE ? AND status = 'open' LIMIT 1").get(`%${title}%`) as any;
    if (!match) return { provider: "deterministic", tool: "complete_task", status: "executed", message: `No open task matching "${title}".` };
    const outcome = decideAndRun("complete_task", { taskId: match.id });
    return {
      provider: "deterministic",
      tool: "complete_task",
      ...outcome,
      message: outcome.status === "pending" ? `Suggested: complete "${title}". Approve to confirm.` : `Completed "${title}".`,
    };
  }

  if (/^start (a )?(\d+)?\s*(minute)?\s*(pomodoro|focus)/.test(lower)) {
    const minutesMatch = lower.match(/(\d+)\s*minute/);
    const outcome = decideAndRun("start_focus_session", { plannedMinutes: minutesMatch ? Number(minutesMatch[1]) : 25 });
    return {
      provider: "deterministic",
      tool: "start_focus_session",
      ...outcome,
      message: outcome.status === "pending" ? "Suggested: start a focus session. Approve to confirm." : "Focus session started.",
    };
  }

  if (/what should i work on|plan my day|next action/.test(lower)) {
    const today = tools.get_today() as any[];
    const sorted = [...today].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
    const top = sorted[0];
    return {
      provider: "deterministic",
      tool: "get_today",
      status: "executed",
      result: sorted,
      message: top ? `Highest priority right now: "${top.title}".` : "Nothing scheduled — inbox or plan something.",
    };
  }

  if (/how much time|available time|free time/.test(lower)) {
    const result = tools.get_available_time();
    return { provider: "deterministic", tool: "get_available_time", status: "executed", result, message: `${result.freeMinutes} minutes free today.` };
  }

  return {
    provider: "deterministic",
    tool: null,
    status: "executed",
    message:
      "I didn't recognize that command. Try: \"add task ...\", \"complete ...\", \"start a 25 minute focus\", \"plan my day\", \"how much time do I have\".",
  };
}

function priorityRank(p: string) {
  return { none: 0, low: 1, medium: 2, high: 3, urgent: 4 }[p] ?? 0;
}

function extractDate(lower: string): string | undefined {
  const today = new Date();
  if (lower.includes("today")) return today.toISOString().slice(0, 10);
  if (lower.includes("tomorrow")) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}
