import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";

// Classification is derived from real fields (priority + due date), not a separate flag —
// dragging a task into a quadrant writes back the priority/due-date combination that
// quadrant represents, so the matrix stays a live view of the same task data everywhere
// else in the app, not a parallel system that can drift out of sync.
function isUrgent(t: Task) {
  if (!t.due_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return t.due_date <= today;
}
function isImportant(t: Task) {
  return t.priority === "high" || t.priority === "urgent";
}

const QUADRANTS = [
  { key: "do", title: "Do first", subtitle: "Urgent & important", urgent: true, important: true, accent: "border-red-300 dark:border-red-900" },
  { key: "schedule", title: "Schedule", subtitle: "Important, not urgent", urgent: false, important: true, accent: "border-amber-300 dark:border-amber-900" },
  { key: "delegate", title: "Quick / delegate", subtitle: "Urgent, not important", urgent: true, important: false, accent: "border-sky-300 dark:border-sky-900" },
  { key: "later", title: "Later", subtitle: "Neither urgent nor important", urgent: false, important: false, accent: "border-neutral-200 dark:border-neutral-800" },
] as const;

export default function Matrix() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["tasks", "open"], queryFn: () => api.tasks.list({ status: "open" }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const bucket = (urgent: boolean, important: boolean) =>
    tasks.filter((t) => isUrgent(t) === urgent && isImportant(t) === important);

  const applyQuadrant = async (taskId: string, urgent: boolean, important: boolean) => {
    const today = new Date().toISOString().slice(0, 10);
    await api.tasks.update(taskId, {
      priority: important ? "high" : "none",
      dueDate: urgent ? today : null,
    });
    invalidate();
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Priority Matrix</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Drag a task into the quadrant it belongs in — it updates the task's priority and due date to match.
        </p>
      </div>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUADRANTS.map((q) => {
          const items = bucket(q.urgent, q.important);
          return (
            <div
              key={q.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData("text/task-id");
                if (taskId) applyQuadrant(taskId, q.urgent, q.important);
              }}
              className={`rounded-xl border-2 ${q.accent} p-3 min-h-[160px] space-y-2`}
            >
              <div>
                <p className="text-sm font-semibold">{q.title}</p>
                <p className="text-[11px] text-neutral-400">{q.subtitle}</p>
              </div>
              <div className="space-y-1.5">
                {items.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                    className="text-sm px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 cursor-grab active:cursor-grabbing truncate"
                    title={t.title}
                  >
                    {t.title}
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-neutral-300 dark:text-neutral-700">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
