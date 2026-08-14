import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";
import { QuickAdd } from "../components/QuickAdd";
import { EmptyState } from "../components/EmptyState";
import { SunIcon, CircleCheckIcon } from "../icons";
import { useQuickAddStore } from "../quickAddStore";
import { useToastStore } from "../toastStore";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const qc = useQueryClient();
  const openQuickAdd = useQuickAddStore((s) => s.open);
  const toast = useToastStore((s) => s.push);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "today"],
    queryFn: () => api.tasks.list({ view: "today" }),
  });
  const { data: focusSessions = [] } = useQuery({ queryKey: ["focus-sessions"], queryFn: api.focusSessions.list });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const onAdd = async (title: string) => {
    const today = new Date().toISOString().slice(0, 10);
    await api.tasks.create({ title, dueDate: today });
    invalidate();
  };

  const onToggle = async (task: Task) => {
    const wasOpen = task.status !== "done";
    task.status === "done" ? await api.tasks.reopen(task.id) : await api.tasks.complete(task.id);
    invalidate();
    if (wasOpen) {
      toast(`"${task.title}" completed`, { actionLabel: "Undo", onAction: () => api.tasks.reopen(task.id).then(invalidate) });
    }
  };

  const onDelete = async (task: Task) => {
    await api.tasks.remove(task.id);
    invalidate();
    toast(`"${task.title}" deleted`);
  };

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const focusToday = focusSessions.filter((s: any) => s.was_completed && (s.started_at ?? "").slice(0, 10) === todayStr);
  const focusMinutes = focusToday.reduce((sum: number, s: any) => sum + (s.planned_minutes ?? 25), 0);

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900">
          <p className="text-xl font-semibold">{open.length}</p>
          <p className="text-[11px] text-neutral-400">Left today</p>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900">
          <p className="text-xl font-semibold">{done.length}</p>
          <p className="text-[11px] text-neutral-400">Completed</p>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900">
          <p className="text-xl font-semibold">{focusMinutes}m</p>
          <p className="text-[11px] text-neutral-400">Focused today</p>
        </div>
      </div>

      {total > 0 && (
        <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      <QuickAdd onAdd={onAdd} placeholder="Add a task for today..." />
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}

      <div className="space-y-2">
        {open.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
        ))}
        {open.length === 0 && !isLoading && done.length === 0 && (
          <EmptyState
            icon={SunIcon}
            title="Nothing planned for today"
            subtitle="Add a task above, or capture something in your Inbox to sort out later."
            actionLabel="Quick add a task"
            onAction={openQuickAdd}
          />
        )}
        {open.length === 0 && !isLoading && done.length > 0 && (
          <EmptyState icon={CircleCheckIcon} title="All done for today" subtitle="Nice work — everything on today's list is complete." />
        )}
      </div>

      {done.length > 0 && (
        <div className="pt-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Completed</p>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
