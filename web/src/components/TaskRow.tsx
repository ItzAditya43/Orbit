import type { Task } from "../api";

const PRIORITY_COLORS: Record<string, string> = {
  none: "bg-neutral-300 dark:bg-neutral-700",
  low: "bg-sky-400",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

export function TaskRow({
  task,
  onToggle,
  onDelete,
  onOpen,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpen?: (task: Task) => void;
}) {
  const done = task.status === "done";
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors">
      <button
        onClick={() => onToggle(task)}
        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
          done ? "bg-emerald-500 border-emerald-500" : "border-neutral-400 dark:border-neutral-600"
        }`}
        aria-label="toggle complete"
      />
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
      <button
        className={`flex-1 text-left text-sm truncate ${done ? "line-through text-neutral-400" : ""}`}
        onClick={() => onOpen?.(task)}
      >
        {task.title}
      </button>
      {task.due_date && (
        <span className="text-xs text-neutral-400 shrink-0">{task.due_date}</span>
      )}
      {task.tags.length > 0 && (
        <div className="hidden sm:flex gap-1 shrink-0">
          {task.tags.map((t) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
              {t.name}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={() => onDelete(task)}
        className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 text-xs shrink-0"
      >
        delete
      </button>
    </div>
  );
}
