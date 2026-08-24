import type { Task } from "../api";
import { PriorityPicker } from "./PriorityPicker";
import { useTaskDetailStore } from "../taskDetailStore";
import { api } from "../api";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, TrashIcon } from "../icons";
import { TaskContextMenu } from "./TaskContextMenu";

const RECURRING_TYPES = ["daily", "weekly", "interval", "custom_days"];

// A recurring task's due_date is just the anchor it was created with — it never advances until
// the task is completed (which rolls a fresh row forward with a new due_date), so an open daily
// task sits with a due_date from whenever it started forever. Comparing that raw column against
// "today" wrongly called it "Overdue" every day; recurring tasks are always "current" until
// you complete today's occurrence, so they get a Repeats badge instead of an Overdue one.
function dueBadge(due: string | null, recurrence?: string | null) {
  if (recurrence && RECURRING_TYPES.includes(recurrence)) {
    return { label: "Repeats", cls: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400" };
  }
  if (!due) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return { label: "Overdue", cls: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" };
  if (due === today) return { label: "Today", cls: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" };
  return { label: due.slice(5), cls: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500" };
}

export function TaskRow({
  task,
  onToggle,
  onDelete,
  selectMode,
  selected,
  onToggleSelect,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (task: Task) => void;
}) {
  const qc = useQueryClient();
  const openDetail = useTaskDetailStore((s) => s.open);
  const done = task.status === "done";
  const badge = dueBadge(task.due_date, task.recurrence);
  const subtaskCount = task.subtasks?.length ?? 0;

  const setPriority = async (p: Task["priority"]) => {
    await api.tasks.update(task.id, { priority: p });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const accentColor = task.color ?? task.project_color;

  return (
    <TaskContextMenu task={task}>
    <div
      onClick={() => (selectMode ? onToggleSelect?.(task) : openDetail(task.id))}
      style={accentColor ? { borderLeftColor: accentColor, borderLeftWidth: 3 } : undefined}
      className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 bg-white dark:bg-neutral-900 hover:shadow-sm transition-all cursor-pointer ${
        selected ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
      }`}
    >
      {selectMode && (
        <span
          className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
            selected ? "bg-neutral-900 border-neutral-900 dark:bg-white dark:border-white" : "border-neutral-300 dark:border-neutral-600"
          }`}
        >
          {selected && <CheckIcon size={10} className="text-white dark:text-neutral-900" strokeWidth={3} />}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task);
        }}
        className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
          done ? "bg-emerald-500 border-emerald-500" : "border-neutral-300 dark:border-neutral-600 hover:border-emerald-400"
        }`}
      >
        {done && <CheckIcon size={11} className="text-white animate-check-pop" strokeWidth={2.5} />}
      </button>

      <PriorityPicker value={task.priority} onChange={setPriority} />

      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${done ? "line-through text-neutral-400" : ""}`}>{task.title}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {subtaskCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
            {task.subtasks!.filter((s) => s.status === "done").length}/{subtaskCount}
          </span>
        )}
        {task.tags.length > 0 && (
          <div className="hidden sm:flex gap-1">
            {task.tags.map((t) => (
              <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                {t.name}
              </span>
            ))}
          </div>
        )}
        {task.energy && (
          <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 capitalize">
            {task.energy}
          </span>
        )}
        {badge && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 px-1 transition-opacity"
        >
          <TrashIcon size={13} />
        </button>
      </div>
    </div>
    </TaskContextMenu>
  );
}
