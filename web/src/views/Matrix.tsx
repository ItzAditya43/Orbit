import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Task } from "../api";

// Classification is derived from real fields (priority/due-date for tasks, horizon/target-date
// for goals), not a separate flag — dragging an item into a quadrant writes back the field
// combination that quadrant represents, so the matrix stays a live view of the same data
// everywhere else in the app, not a parallel system that can drift out of sync.
function isTaskUrgent(t: Task) {
  if (!t.due_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return t.due_date <= today;
}
function isTaskImportant(t: Task) {
  return t.priority === "high" || t.priority === "urgent";
}
const LONG_HORIZONS = new Set(["life", "annual", "semester"]);
function isGoalUrgent(g: any) {
  if (!g.target_date) return false;
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return g.target_date <= in7Days;
}
function isGoalImportant(g: any) {
  return LONG_HORIZONS.has(g.horizon);
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
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["goals"] });
  };

  const bucketTasks = (urgent: boolean, important: boolean) => tasks.filter((t) => isTaskUrgent(t) === urgent && isTaskImportant(t) === important);
  const bucketGoals = (urgent: boolean, important: boolean) => goals.filter((g: any) => isGoalUrgent(g) === urgent && isGoalImportant(g) === important);

  const applyTaskQuadrant = async (taskId: string, urgent: boolean, important: boolean) => {
    const today = new Date().toISOString().slice(0, 10);
    await api.tasks.update(taskId, { priority: important ? "high" : "none", dueDate: urgent ? today : null });
    invalidate();
  };
  const applyGoalQuadrant = async (goalId: string, urgent: boolean, important: boolean) => {
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await api.goals.update(goalId, { horizon: important ? "annual" : "monthly", targetDate: urgent ? in3Days : null });
    invalidate();
  };

  return (
    <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Task & Goal Matrix</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Drag a task or goal into the quadrant it belongs in — updates its priority/due date (tasks) or horizon/target date (goals).
          </p>
        </div>
        <Link to="/habit-matrix" className="text-xs text-neutral-400 hover:underline shrink-0">
          Habit matrix →
        </Link>
      </div>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUADRANTS.map((q) => {
          const taskItems = bucketTasks(q.urgent, q.important);
          const goalItems = bucketGoals(q.urgent, q.important);
          return (
            <div
              key={q.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData("text/task-id");
                const goalId = e.dataTransfer.getData("text/goal-id");
                if (taskId) applyTaskQuadrant(taskId, q.urgent, q.important);
                if (goalId) applyGoalQuadrant(goalId, q.urgent, q.important);
              }}
              className={`rounded-xl border-2 ${q.accent} p-3 min-h-[160px] space-y-2`}
            >
              <div>
                <p className="text-sm font-semibold">{q.title}</p>
                <p className="text-[11px] text-neutral-400">{q.subtitle}</p>
              </div>
              <div className="space-y-1.5">
                {taskItems.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                    className="text-sm px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 cursor-grab active:cursor-grabbing flex items-center gap-1.5 min-w-0"
                    title={t.title}
                  >
                    <span className="truncate">{t.title}</span>
                    {(t.tags ?? []).map((tag: any) => (
                      <span key={tag.id} className="text-[9px] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ))}
                {goalItems.map((g: any) => (
                  <div
                    key={g.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/goal-id", g.id)}
                    className="text-sm px-2.5 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900 cursor-grab active:cursor-grabbing flex items-center gap-1.5 min-w-0"
                    title={g.title}
                  >
                    <span className="text-[9px] uppercase tracking-wide text-violet-500 shrink-0">Goal</span>
                    <span className="truncate">{g.title}</span>
                    {(g.tags ?? []).map((tag: any) => (
                      <span key={tag.id} className="text-[9px] px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-500 shrink-0">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ))}
                {taskItems.length === 0 && goalItems.length === 0 && <p className="text-xs text-neutral-300 dark:text-neutral-700">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
