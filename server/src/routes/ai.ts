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
  const result = runTool(action.tool_name, args);
  db.prepare("UPDATE ai_actions SET status = 'executed', result_json = ? WHERE id = ?").run(JSON.stringify(result), action.id);
  res.json({ ok: true, result });
});

aiRouter.post("/actions/:id/reject", (req, res) => {
  db.prepare("UPDATE ai_actions SET status = 'rejected' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// POST /api/ai/command  { text: "add task buy milk tomorrow" }
//
// The deterministic parser runs FIRST, not Ollama — it's fast and exactly-reliable for the
// command shapes it recognizes. Small local models (what's actually feasible to run without
// a GPU/heavy RAM) are unreliable at strict tool-arg JSON: tested live against llama3.2:1b,
// it invented its own args schema and dropped "tomorrow" from a date entirely. Trusting that
// with real data mutations isn't worth it. Instead Ollama is used ONLY as a conversational
// fallback for whatever the deterministic parser doesn't recognize — the actual gap the user
// was hitting ("it's just command-like"), without risking bad writes from a weak model.
aiRouter.post("/command", async (req, res) => {
  const text: string = req.body?.text ?? "";
  if (!text.trim()) return res.status(400).json({ error: "text required" });

  const deterministic = runDeterministic(text);
  if (deterministic.tool !== null) return res.json(deterministic);

  const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  try {
    const reply = await getConversationalReply(ollamaHost, text);
    if (reply) return res.json({ provider: "ollama", tool: null, status: "executed", message: reply });
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

async function getConversationalReply(host: string, text: string): Promise<string | null> {
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
            "You are Orbit's assistant, a local productivity app. Answer the user's question or message " +
            "directly and briefly (2-3 sentences max). You do not have access to their tasks or data right " +
            'now — if they ask about those, tell them to try a command like "add task ..." or "plan my day" ' +
            'instead. Respond ONLY with strict JSON: {"reply": "<your answer>"}. No prose outside the JSON, no markdown fences.',
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
  if (parsed?.reply) return String(parsed.reply);
  // Model ignored the JSON instruction but still said something useful in plain text.
  return content.trim() || null;
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
