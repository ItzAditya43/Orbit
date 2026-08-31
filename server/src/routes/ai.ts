import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { runTool, TOOL_NAMES, tools, READ_ONLY_TOOLS, type ToolName } from "../aiTools.js";

export const aiRouter = Router();

function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function getPermissionMode(): "suggest" | "assist" | "autopilot" {
  return getSetting("aiPermissionMode", "assist" as const);
}

// Ollama Cloud (ollama.com) uses the same native /api/chat shape as a local Ollama install —
// it's just a hosted endpoint behind an API key, not an OpenAI-compatible API. Free tier: sign
// up at ollama.com, create a key, pick any model from ollama.com/search tagged "cloud".
function getAiConfig(): { host: string; model: string; apiKey: string | null } {
  const provider = getSetting<"local" | "cloud">("aiProvider", "local");
  const configuredModel = getSetting("ollamaModel", "");
  if (provider === "cloud") {
    return {
      host: "https://ollama.com",
      model: configuredModel || "gpt-oss:20b-cloud",
      apiKey: getSetting("ollamaCloudApiKey", "") || null,
    };
  }
  return {
    host: process.env.OLLAMA_HOST ?? "http://localhost:11434",
    model: configuredModel || process.env.OLLAMA_MODEL || "llama3.2:1b",
    apiKey: null,
  };
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
  const provider = getSetting<"local" | "cloud">("aiProvider", "local");
  const { host, model, apiKey } = getAiConfig();
  let ollamaAvailable = false;
  // Cloud's /api/tags is a public model listing that responds even with no/invalid key, so it
  // can't be used alone to confirm the configured key actually works — require a key present
  // before even attempting the reachability check, otherwise "connected" would be a lie.
  if (provider === "cloud" && !apiKey) {
    ollamaAvailable = false;
  } else {
    try {
      const r = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: "hi" }] }),
        // A local model can take several seconds to load into memory on its first request after
        // an idle period (measured ~7s cold-start for a 1.2B model) — a short timeout here would
        // report a perfectly working local Ollama as "unreachable" just for being cold.
        signal: AbortSignal.timeout(20000),
      });
      ollamaAvailable = r.ok;
    } catch {
      ollamaAvailable = false;
    }
  }
  res.json({
    ollamaAvailable,
    ollamaHost: host,
    ollamaModel: model,
    provider,
    tools: TOOL_NAMES,
    fallback: "deterministic",
    permissionMode: getPermissionMode(),
  });
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
  "get_habits",
  "get_goals",
  "get_projects",
  "get_analytics_summary",
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
  const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(req.body?.history) ? req.body.history : [];
  res.json(await handleAiText(text, history));
});

// Shared by the /command route and the run_ai_workflow automation action — same
// deterministic-first, Ollama-fallback pipeline either way.
export async function handleAiText(
  text: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<any> {
  const deterministic = runDeterministic(text);
  if (deterministic.tool !== null) return deterministic;

  try {
    const result = await askOllama(text, history);
    if (result) return result;
  } catch {
    // fall through to the deterministic "didn't recognize that" message
  }

  return deterministic;
}

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

function dayName(d: Date): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
}
function tomorrowIso(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

async function askOllama(text: string, history: { role: "user" | "assistant"; content: string }[] = []): Promise<any | null> {
  const { host, model, apiKey } = getAiConfig();
  const r = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            // Pre-computed rather than left for the model to derive — live-tested a 31B cloud
            // model that got "today" right but still miscalculated "tomorrow" as today's date
            // instead of +1 day. Handing over the two most common reference points directly
            // removes the arithmetic step (and its failure mode) for the cases that matter most.
            `Today is ${dayName(new Date())} ${new Date().toISOString().slice(0, 10)}, tomorrow is ${tomorrowIso()} ` +
            "(YYYY-MM-DD). Use these directly for \"today\"/\"tomorrow\"; compute other relative dates " +
            '("next monday", "in 3 days") from today\'s date above, in this year, never a placeholder or ' +
            "training-data year.\n" +
            "You are Orbit's assistant, a local-first productivity app. Only use a tool call when the user is " +
            "directly asking you to create, add, start, or do something concrete right now, OR is asking a " +
            "question about their actual current data (tasks, habits, goals, projects, overall status) that " +
            "one of the read tools below can answer. General questions, advice, or conversation with no real " +
            'data behind it are always a reply, never a tool call — e.g. "why is sleep important" is a reply. ' +
            "If in doubt, reply.\n" +
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
            "capture_idea args: {text} — a raw idea/thought with no immediate action, dumped into the inbox " +
            '("jot down...", "capture this...", "remind me to think about..."). The field is called "text", ' +
            'not "title" or "message".\n' +
            'create_project args: {name, color?, description?} — the field is called "name", not "title".\n' +
            "create_calendar_event args: {title, startsAt, endsAt, allDay?} — startsAt/endsAt are full ISO " +
            'timestamps "YYYY-MM-DDTHH:MM:SS" built from today\'s real date above plus the time mentioned, e.g. ' +
            '"tomorrow 2pm to 3pm" -> startsAt "2026-01-02T14:00:00", endsAt "2026-01-02T15:00:00" (using ' +
            "tomorrow's actual date, not this example's). Never use \"startTime\"/\"endTime\" or a bare time with " +
            "no date.\n" +
            "To edit/change/update ANYTHING that already exists (a habit, task, goal, project, or note), you " +
            "MUST respond with a tool call, never a reply — you cannot actually change anything by just saying " +
            'you did in a reply, that would be a lie. Use update_task_by_title / update_habit_by_title / ' +
            'update_goal_by_title / update_project_by_title / update_note_by_title with args {title: ' +
            '"<enough of its existing name/title to identify it>", changes: {...only the fields to change...}} ' +
            '— e.g. "change my shower habit to 8pm" -> {"tool": "update_habit_by_title", "args": {"title": ' +
            '"shower", "changes": {"deadlineTime": "20:00"}}}. Never invent an id. There is no delete tool ' +
            "available to you — if the user asks to delete/remove something, tell them to do it from the " +
            "relevant page themselves.\n" +
            "get_habits/get_goals/get_projects take no args and return the user's real current list — use one " +
            'of these when asked something like "what are my habits" or "how are my goals going", then answer ' +
            "in your own words from the result, don't just dump raw JSON at the user. get_analytics_summary " +
            'takes no args and returns {totalOpen, overdue, habitsTotal, goalsActive} for "how am I doing" / ' +
            '"am I on track" style questions.\n' +
            "Otherwise, or if you're unsure, just answer directly and briefly (2-3 sentences max) as JSON: " +
            '{"reply": "<your answer>"}. Never include prose outside the JSON object, never use markdown fences.',
        },
        ...history.slice(-12),
        { role: "user", content: text },
      ],
    }),
    // Local CPU inference speed varies a lot by machine and prompt size — measured a plain
    // llama3.2:1b call taking ~10s with a modest-size prompt live on this machine, well past
    // what felt like a safe margin at 15s. Same generous window for local as cloud.
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) return null;
  const data: any = await r.json();
  const content: string = data?.message?.content ?? "";
  const parsed = extractJsonObject(content);

  if (parsed?.reply) {
    return { provider: "ollama", tool: null, status: "executed", message: String(parsed.reply) };
  }
  if (parsed?.tool && LLM_SAFE_TOOLS.includes(parsed.tool)) {
    return decideAndRunViaLlm(parsed.tool, parsed.args ?? {}, text);
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
async function decideAndRunViaLlm(toolName: string, args: any, originalText: string) {
  const isReadOnly = READ_ONLY_TOOLS.has(toolName as ToolName);
  const label = toolName.replace(/_/g, " ");
  if (isReadOnly) {
    const result = runTool(toolName, args);
    // A raw "Done — get habits." with a JSON blob attached isn't a conversational answer to
    // "what are my habits" — feed the tool's real result back to the model for one more short
    // completion so it can actually answer in words, the whole point of read access existing.
    const message = await summarizeToolResult(originalText, toolName, result);
    return { provider: "ollama", tool: toolName, args, status: "executed" as const, result, message: message ?? `Done — ${label}.` };
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

// Plain single-turn completion, no tool-calling — used for one-shot generation (subtask
// suggestions, review summaries) where the caller already built the exact prompt it wants
// answered, as opposed to askOllama's intent-classification-into-a-tool-call flow.
async function callModel(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const { host, model, apiKey } = getAiConfig();
  try {
    const r = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    const content: string = (data?.message?.content ?? "").trim();
    return content || null;
  } catch {
    return null;
  }
}

async function summarizeToolResult(originalText: string, toolName: string, result: unknown): Promise<string | null> {
  return callModel(
    "Answer the user's question in 1-3 short sentences using ONLY the JSON data given, as plain text " +
      "(no JSON, no markdown). If the data is empty, say so plainly.",
    `Question: ${originalText}\n\n${toolName} result:\n${JSON.stringify(result).slice(0, 4000)}`
  );
}

// POST /api/ai/generate  { prompt, system? }
// Generic one-shot text generation for frontend features that craft their own exact prompt
// (subtask suggestions, review narrative summaries) rather than going through intent
// classification. Read-only by construction — it can only ever return text, never call a tool.
aiRouter.post("/generate", async (req, res) => {
  const prompt: string = req.body?.prompt ?? "";
  if (!prompt.trim()) return res.status(400).json({ error: "prompt required" });
  const system: string = req.body?.system ?? "Answer briefly and plainly. No markdown, no JSON.";
  const text = await callModel(system, prompt);
  if (text === null) return res.status(503).json({ error: "AI is not configured or unreachable — check Settings." });
  res.json({ text });
});

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
