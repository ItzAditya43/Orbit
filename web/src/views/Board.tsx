import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";

function localISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const QUADRANT_LABELS: Record<string, string> = { do: "Do first", schedule: "Schedule", delegate: "Quick / delegate", later: "Later" };

export default function BoardDashboard() {
  const qc = useQueryClient();
  const today = localISODate(new Date());
  const tomorrow = localISODate(new Date(Date.now() + 86400000));

  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", "status", "open"], queryFn: () => api.tasks.list({ status: "open" }) });
  const { data: notes = [] } = useQuery({ queryKey: ["notes"], queryFn: () => api.notes.list() });
  const { data: habits = [] } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });
  const { data: boards = [] } = useQuery({ queryKey: ["boards", "all"], queryFn: () => api.boards.list() });
  const { data: analytics } = useQuery({
    queryKey: ["analytics", "board-snapshot"],
    queryFn: () => api.analytics.summary({ from: localISODate(new Date(Date.now() - 13 * 86400000)), to: today }),
  });
  // A task's stored due_date only advances when you complete it, so "due today/tomorrow" for a
  // recurring task (e.g. created via "Starts" with no due_date at all) can't be read off that
  // column directly — the Calendar API already does the correct recurrence expansion (same
  // logic used to render the Calendar view itself), so pull "due today/tomorrow" from there.
  // Overdue stays a plain due_date comparison — a stale due_date on an open recurring task
  // genuinely means it hasn't been completed since then, which is real overdue signal, not noise.
  const { data: calendarEntries = [] } = useQuery({
    queryKey: ["calendar", "board-dashboard", today, tomorrow],
    queryFn: () => api.calendar.list({ from: today, to: tomorrow }),
  });
  const taskIdsDueOn = (day: string) =>
    new Set(calendarEntries.filter((e: any) => e.source === "task" && (e.starts_at ?? "").slice(0, 10) === day).map((e: any) => e.task_id));
  const dueTodayIds = taskIdsDueOn(today);
  const dueTomorrowIds = taskIdsDueOn(tomorrow);

  const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
  const dueToday = tasks.filter((t) => dueTodayIds.has(t.id) || t.due_date === today);
  const dueTomorrow = tasks.filter((t) => dueTomorrowIds.has(t.id) || t.due_date === tomorrow);
  const recentNotes = [...notes].sort((a: any, b: any) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).slice(0, 5);
  const habitsDue = habits.filter((h: any) => h.dueToday !== false && !h.doneToday);

  const isTaskUrgent = (t: any) => dueTodayIds.has(t.id) || (!!t.due_date && t.due_date <= today);
  const isTaskImportant = (t: any) => t.priority === "high" || t.priority === "urgent";
  const quadrantCounts: Record<string, number> = { do: 0, schedule: 0, delegate: 0, later: 0 };
  for (const t of tasks) {
    const u = isTaskUrgent(t);
    const i = isTaskImportant(t);
    quadrantCounts[u && i ? "do" : !u && i ? "schedule" : u && !i ? "delegate" : "later"]++;
  }

  const complete = async (id: string) => {
    await api.tasks.complete(id);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  const logHabit = async (id: string) => {
    await api.habits.log(id);
    qc.invalidateQueries({ queryKey: ["habits"] });
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Board</h1>
      <p className="text-sm text-neutral-400 -mt-4">Everything you need to keep in check, in one place.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Overdue" count={overdue.length} to="/upcoming" accent={overdue.length > 0 ? "border-red-300 dark:border-red-900" : undefined}>
          {overdue.length === 0 && <Empty>Nothing overdue.</Empty>}
          {overdue.map((t) => (
            <TaskLine key={t.id} title={t.title} onComplete={() => complete(t.id)} />
          ))}
        </Panel>

        <Panel title="Due today" count={dueToday.length} to="/">
          {dueToday.length === 0 && <Empty>Nothing due today.</Empty>}
          {dueToday.map((t) => (
            <TaskLine key={t.id} title={t.title} onComplete={() => complete(t.id)} />
          ))}
        </Panel>

        <Panel title="Due tomorrow" count={dueTomorrow.length} to="/upcoming">
          {dueTomorrow.length === 0 && <Empty>Nothing due tomorrow.</Empty>}
          {dueTomorrow.map((t) => (
            <TaskLine key={t.id} title={t.title} onComplete={() => complete(t.id)} />
          ))}
        </Panel>

        <Panel title="Habits due today" count={habitsDue.length} to="/habits">
          {habitsDue.length === 0 && <Empty>All caught up.</Empty>}
          {habitsDue.map((h: any) => (
            <div key={h.id} className="flex items-center justify-between text-sm py-1">
              <span className="truncate">{h.title}</span>
              <button onClick={() => logHabit(h.id)} className="text-xs text-neutral-400 hover:text-emerald-500 shrink-0">
                log
              </button>
            </div>
          ))}
        </Panel>

        <Panel title="Recent notes" count={recentNotes.length} to="/notes">
          {recentNotes.length === 0 && <Empty>No notes yet.</Empty>}
          {recentNotes.map((n: any) => (
            <p key={n.id} className="text-sm truncate py-1">
              {n.title || "Untitled"}
            </p>
          ))}
        </Panel>

        <Panel title="Workflow" count={boards.length} to="/boards">
          {boards.length === 0 && <Empty>No workflows yet.</Empty>}
          {boards.slice(0, 5).map((b: any) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="block text-sm truncate py-1 hover:underline">
              {b.title}
            </Link>
          ))}
        </Panel>

        <Panel title="Matrix" to="/matrix">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(quadrantCounts).map(([key, count]) => (
              <div key={key} className="flex justify-between px-2 py-1 rounded-md bg-neutral-50 dark:bg-neutral-900">
                <span className="text-neutral-400">{QUADRANT_LABELS[key]}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Analytics (last 14 days)" to="/analytics">
          {analytics ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Completed" value={analytics.totalDone} />
              <Stat label="Overdue" value={analytics.overdue} />
              <Stat label="Habits today" value={`${analytics.habits.completedToday}/${analytics.habits.total}`} />
              <Stat label="Focus min" value={Math.round(analytics.timeTrackedMinutes)} />
            </div>
          ) : (
            <Empty>Loading...</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  count,
  to,
  accent,
  children,
}: {
  title: string;
  count?: number;
  to: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-1 ${accent ?? "border-neutral-200 dark:border-neutral-800"}`}>
      <div className="flex items-center justify-between mb-1">
        <Link to={to} className="text-sm font-medium hover:underline">
          {title}
        </Link>
        {count !== undefined && <span className="text-xs text-neutral-400">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function TaskLine({ title, onComplete }: { title: string; onComplete: () => void }) {
  return (
    <div className="flex items-center justify-between text-sm py-1 gap-2">
      <span className="truncate">{title}</span>
      <button onClick={onComplete} className="text-xs text-neutral-400 hover:text-emerald-500 shrink-0">
        complete
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between px-2 py-1 rounded-md bg-neutral-50 dark:bg-neutral-900">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-400">{children}</p>;
}
