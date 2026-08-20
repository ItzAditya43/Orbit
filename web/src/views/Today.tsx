import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";
import { QuickAdd } from "../components/QuickAdd";
import { EmptyState } from "../components/EmptyState";
import { BulkActionBar } from "../components/BulkActionBar";
import { SunIcon, CircleCheckIcon, TargetIcon, RepeatIcon, ZapIcon } from "../icons";
import { useQuickAddStore } from "../quickAddStore";
import { useToastStore } from "../toastStore";
import { Link } from "react-router-dom";

const PRIORITY_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

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
  const { data: habits = [] } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });
  const { data: staleTasks = [] } = useQuery({ queryKey: ["tasks", "stale"], queryFn: () => api.tasks.list({ view: "stale" }) });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const toggleSelect = (task: Task) => {
    setSelectedIds((ids) => (ids.includes(task.id) ? ids.filter((i) => i !== task.id) : [...ids, task.id]));
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
    invalidate();
  };

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

  const frog = [...open].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])[0];
  // Quantity habits (e.g. "8 glasses") stay visible while under target even after a partial
  // log today — everything else (plain daily, or weekly/monthly period habits) drops off
  // once logged today since there's nothing more to do on it until tomorrow.
  const habitsDueToday = habits.filter((h: any) => !h.doneToday && (h.target_count ? true : !h.loggedToday));
  const { data: checkin } = useQuery({ queryKey: ["checkins", "today"], queryFn: api.checkins.today });

  const autoSchedule = async () => {
    const res = await api.tasks.autoSchedule(todayStr);
    invalidate();
    toast(`Scheduled ${res.scheduled.length} tasks into today's free time`);
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <button onClick={() => window.print()} className="no-print text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          Print agenda
        </button>
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

      {frog && (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-900 dark:border-white p-3">
          <TargetIcon size={16} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-neutral-400">Eat the frog first</p>
            <p className="text-sm font-medium truncate">{frog.title}</p>
          </div>
          <button
            onClick={autoSchedule}
            className="text-xs px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 shrink-0 flex items-center gap-1"
          >
            <ZapIcon size={12} /> Auto-schedule day
          </button>
        </div>
      )}

      {staleTasks.length > 0 && (
        <Link
          to="/filters"
          className="block text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:underline"
        >
          {staleTasks.length} task{staleTasks.length === 1 ? "" : "s"} have sat with no due date for 30+ days — review
        </Link>
      )}

      {habitsDueToday.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-400 flex items-center gap-1">
            <RepeatIcon size={11} /> Habits today
          </p>
          {habitsDueToday.map((h: any) => {
            const isQuantity = !!h.target_count;
            const urgent = h.deadlineStatus === "due-soon" || h.deadlineStatus === "missed";
            return (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <span className={h.deadlineStatus === "missed" ? "text-red-500" : urgent ? "text-amber-500" : ""}>
                  {h.title}
                  {h.deadline_time && <span className="text-neutral-400"> · by {h.deadline_time}</span>}
                  {isQuantity && (
                    <span className="text-neutral-400">
                      {" "}
                      · {h.todayAmount}/{h.target_count} {h.unit ?? ""}
                    </span>
                  )}
                  {h.periodProgress && (
                    <span className="text-neutral-400">
                      {" "}
                      · {h.periodProgress.completed}/{h.periodProgress.target} {h.periodProgress.label}
                    </span>
                  )}
                </span>
                <button
                  onClick={async () => {
                    await api.habits.log(h.id, isQuantity ? 1 : undefined);
                    qc.invalidateQueries({ queryKey: ["habits"] });
                  }}
                  className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800"
                >
                  {isQuantity ? `+1${h.unit ? ` ${h.unit}` : ""}` : "Log"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-neutral-400">How are you feeling today?</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-400 w-12">Mood</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={async () => {
                  await api.checkins.save(todayStr, { mood: n });
                  qc.invalidateQueries({ queryKey: ["checkins"] });
                }}
                className={`h-6 w-6 rounded-full text-xs ${
                  checkin?.mood === n ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-200 dark:border-neutral-800"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-400 w-12">Energy</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={async () => {
                  await api.checkins.save(todayStr, { energy: n });
                  qc.invalidateQueries({ queryKey: ["checkins"] });
                }}
                className={`h-6 w-6 rounded-full text-xs ${
                  checkin?.energy === n ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-200 dark:border-neutral-800"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            Slept
            <input
              type="time"
              defaultValue={checkin?.sleep_time ?? ""}
              onBlur={async (e) => {
                if (!e.target.value) return;
                await api.checkins.save(todayStr, { sleepTime: e.target.value });
                qc.invalidateQueries({ queryKey: ["checkins"] });
              }}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-1"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            Woke
            <input
              type="time"
              defaultValue={checkin?.wake_time ?? ""}
              onBlur={async (e) => {
                if (!e.target.value) return;
                await api.checkins.save(todayStr, { wakeTime: e.target.value });
                qc.invalidateQueries({ queryKey: ["checkins"] });
              }}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-1"
            />
          </label>
        </div>
      </div>

      <QuickAdd onAdd={onAdd} placeholder="Add a task for today..." />
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}

      {open.length > 0 && (
        <div className="flex justify-end">
          <button onClick={() => setSelectMode((s) => !s)} className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
            {selectMode ? "Done selecting" : "Select"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {open.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onToggle={onToggle}
            onDelete={onDelete}
            selectMode={selectMode}
            selected={selectedIds.includes(t.id)}
            onToggleSelect={toggleSelect}
          />
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

      <BulkActionBar selectedIds={selectedIds} onDone={exitSelectMode} />
    </div>
  );
}
