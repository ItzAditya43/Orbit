import { Router } from "express";
import { db } from "../db.js";
import { runTool, TOOL_NAMES, tools } from "../aiTools.js";

export const aiRouter = Router();

aiRouter.get("/status", async (_req, res) => {
  const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  let ollamaAvailable = false;
  try {
    const r = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(800) });
    ollamaAvailable = r.ok;
  } catch {
    ollamaAvailable = false;
  }
  res.json({ ollamaAvailable, ollamaHost, tools: TOOL_NAMES, fallback: "deterministic" });
});

// POST /api/ai/command  { text: "add task buy milk tomorrow" }
// Provider priority per spec §18: Ollama -> configured free API (not wired) -> deterministic fallback.
aiRouter.post("/command", async (req, res) => {
  const text: string = req.body?.text ?? "";
  if (!text.trim()) return res.status(400).json({ error: "text required" });

  const ollamaHost = process.env.OLLAMA_HOST;
  if (ollamaHost) {
    try {
      const result = await runViaOllama(ollamaHost, text);
      if (result) return res.json(result);
    } catch {
      // fall through to deterministic parser
    }
  }

  res.json(runDeterministic(text));
});

async function runViaOllama(host: string, text: string) {
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";
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
            "You are a productivity assistant. Respond ONLY with strict JSON: {\"tool\": <one of " +
            TOOL_NAMES.join(", ") +
            ">, \"args\": {...}}. No prose.",
        },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const data: any = await r.json();
  const content = data?.message?.content;
  if (!content) return null;
  const parsed = JSON.parse(content);
  const result = runTool(parsed.tool, parsed.args ?? {});
  return { provider: "ollama", tool: parsed.tool, args: parsed.args, result };
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
    const result = tools.create_task({ title, dueDate });
    return { provider: "deterministic", tool: "create_task", result, message: `Created task "${title}".` };
  }

  if (/^complete /.test(lower) || /^done /.test(lower)) {
    const title = text.replace(/^(complete|done)\s*/i, "").trim();
    const match = db.prepare("SELECT id FROM tasks WHERE title LIKE ? AND status = 'open' LIMIT 1").get(`%${title}%`) as any;
    if (!match) return { provider: "deterministic", tool: "complete_task", message: `No open task matching "${title}".` };
    const result = tools.complete_task({ taskId: match.id });
    return { provider: "deterministic", tool: "complete_task", result, message: `Completed "${title}".` };
  }

  if (/^start (a )?(\d+)?\s*(minute)?\s*(pomodoro|focus)/.test(lower)) {
    const minutesMatch = lower.match(/(\d+)\s*minute/);
    const result = tools.start_focus_session({ plannedMinutes: minutesMatch ? Number(minutesMatch[1]) : 25 });
    return { provider: "deterministic", tool: "start_focus_session", result, message: "Focus session started." };
  }

  if (/what should i work on|plan my day|next action/.test(lower)) {
    const today = tools.get_today() as any[];
    const sorted = [...today].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
    const top = sorted[0];
    return {
      provider: "deterministic",
      tool: "get_today",
      result: sorted,
      message: top ? `Highest priority right now: "${top.title}".` : "Nothing scheduled — inbox or plan something.",
    };
  }

  if (/how much time|available time|free time/.test(lower)) {
    const result = tools.get_available_time();
    return { provider: "deterministic", tool: "get_available_time", result, message: `${result.freeMinutes} minutes free today.` };
  }

  return {
    provider: "deterministic",
    tool: null,
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
