import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Review() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const { data: daily, isLoading: loadingDaily } = useQuery({ queryKey: ["review", "daily"], queryFn: api.review.daily, enabled: tab === "daily" });
  const { data: weekly, isLoading: loadingWeekly } = useQuery({ queryKey: ["review", "weekly"], queryFn: api.review.weekly, enabled: tab === "weekly" });
  const { data: reviewItems = [] } = useQuery({ queryKey: ["scope-review"], queryFn: api.scopeReview.list, enabled: tab === "weekly" });
  const pendingIdeas = reviewItems.filter((r: any) => r.status === "pending" || r.status === "parked").length;
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const generateSummary = async () => {
    const data = tab === "daily" ? daily : weekly;
    if (!data) return;
    setSummarizing(true);
    setAiSummary(null);
    try {
      const { text } = await api.ai.generate(
        `Here's my ${tab} review data as JSON:\n${JSON.stringify(data).slice(0, 4000)}`,
        `Write a short (3-5 sentence), encouraging but honest ${tab} recap for a productivity app user, based only ` +
          "on the JSON given. Mention what went well and what's slipping, in plain prose, no markdown, no lists."
      );
      setAiSummary(text);
    } catch {
      setAiSummary("Couldn't reach AI — check it's configured in Settings.");
    } finally {
      setSummarizing(false);
    }
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["review"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["habits"] });
  };
  const completeTask = async (id: string) => {
    await api.tasks.complete(id);
    invalidate();
  };
  const snoozeTask = async (id: string) => {
    await api.tasks.snooze(id, "tomorrow");
    invalidate();
  };
  const logHabit = async (id: string) => {
    await api.habits.log(id);
    invalidate();
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Review</h1>
      <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs w-fit">
        {(["daily", "weekly"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 capitalize ${tab === t ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <button
          onClick={generateSummary}
          disabled={summarizing || (tab === "daily" ? !daily : !weekly)}
          className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800"
        >
          {summarizing ? "Thinking..." : "✨ AI summary"}
        </button>
        {aiSummary && (
          <p className="text-sm rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-4 text-violet-800 dark:text-violet-300">
            {aiSummary}
          </p>
        )}
      </div>

      {tab === "daily" && (
        <>
          {loadingDaily && <p className="text-sm text-neutral-400">Loading...</p>}
          {daily && (
            <div className="space-y-5">
              <p className="text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950">
                {daily.summary}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Completed" value={daily.completed.length} />
                <Stat label="Carried over" value={daily.carriedOver.length} />
                <Stat label="Focus minutes" value={daily.focusMinutes} />
              </div>
              <List title="Completed today" items={daily.completed} />
              <TaskList title="Carried over (overdue)" items={daily.carriedOver} onComplete={completeTask} onSnooze={snoozeTask} />
              <TaskList title="Due today" items={daily.dueToday} onComplete={completeTask} onSnooze={snoozeTask} />
              <HabitList title="Habits not yet done today" items={daily.habitsMissed} onLog={logHabit} />
              <GoalList title="Goals overdue on target date" items={daily.goalsStalled} />
            </div>
          )}
        </>
      )}

      {tab === "weekly" && (
        <>
          {loadingWeekly && <p className="text-sm text-neutral-400">Loading...</p>}
          {weekly && (
            <div className="space-y-5">
              <p className="text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950">
                {weekly.summary}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Completed" value={weekly.completed.length} />
                <Stat label="Overdue" value={weekly.stillOpen.length} />
                <Stat label="Focus minutes" value={weekly.focusMinutes} />
              </div>
              {weekly.stalledProjects.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Stalled projects</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {weekly.stalledProjects.map((p: any) => p.name).join(", ")} had no completions this week.
                  </p>
                </div>
              )}
              {pendingIdeas > 0 && (
                <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-4 flex items-center justify-between">
                  <p className="text-sm text-violet-700 dark:text-violet-400">
                    You parked {pendingIdeas} idea{pendingIdeas === 1 ? "" : "s"} this period — want to review them?
                  </p>
                  <Link to="/boundaries" className="text-xs font-medium text-violet-700 dark:text-violet-400 hover:underline shrink-0 ml-3">
                    Review →
                  </Link>
                </div>
              )}
              <List title="Completed this week" items={weekly.completed} />
              <TaskList title="Still overdue" items={weekly.stillOpen} onComplete={completeTask} onSnooze={snoozeTask} />
              <HabitList title="Habits untouched all week" items={weekly.habitsNeglected} onLog={logHabit} />
              <GoalList title="Goals overdue on target date" items={weekly.goalsStalled} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-[11px] text-neutral-400">{label}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: any[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{title}</p>
      {items.map((t) => (
        <div key={t.id} className="text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
          {t.title}
        </div>
      ))}
    </div>
  );
}

function TaskList({
  title,
  items,
  onComplete,
  onSnooze,
}: {
  title: string;
  items: any[];
  onComplete: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{title}</p>
      {items.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <span className="truncate">{t.title}</span>
          <div className="flex items-center gap-2 shrink-0 text-xs">
            <button onClick={() => onComplete(t.id)} className="text-neutral-400 hover:text-emerald-500">
              complete
            </button>
            <button onClick={() => onSnooze(t.id)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
              snooze to tomorrow
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function HabitList({ title, items, onLog }: { title: string; items: any[]; onLog: (id: string) => void }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{title}</p>
      {items.map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
          <span className="truncate">{h.title}</span>
          <button onClick={() => onLog(h.id)} className="text-xs text-neutral-400 hover:text-emerald-500 shrink-0">
            log now
          </button>
        </div>
      ))}
    </div>
  );
}

function GoalList({ title, items }: { title: string; items: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{title}</p>
      {items.map((g) => (
        <div key={g.id} className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-900">
          <span className="truncate">{g.title}</span>
          <span className="text-xs text-neutral-400 shrink-0">{Math.round((g.progress ?? 0) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
