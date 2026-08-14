import type { Task } from "../api";
import { PriorityPicker } from "./PriorityPicker";
import { useTaskDetailStore } from "../taskDetailStore";
import { api } from "../api";
import { useQueryClient } from "@tanstack/react-query";

function dueBadge(due: string | null) {
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
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const qc = useQueryClient();
  const openDetail = useTaskDetailStore((s) => s.open);
  const done = task.status === "done";
  const badge = dueBadge(task.due_date);
  const subtaskCount = task.subtasks?.length ?? 0;

  const setPriority = async (p: Task["priority"]) => {
    await api.tasks.update(task.id, { priority: p });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div
      onClick={() => openDetail(task.id)}
      style={task.project_color ? { borderLeftColor: task.project_color, borderLeftWidth: 3 } : undefined}
      className="group flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2.5 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm transition-all cursor-pointer"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task);
        }}
        className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
          done ? "bg-emerald-500 border-emerald-500" : "border-neutral-300 dark:border-neutral-600 hover:border-emerald-400"
        }`}
      >
        {done && <span className="text-white text-[10px] animate-check-pop">✓</span>}
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
        {badge && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 text-xs px-1 transition-opacity"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
