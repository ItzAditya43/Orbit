import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";
import { EmptyState } from "../components/EmptyState";
import { CalendarDaysIcon } from "../icons";

export default function Upcoming() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "upcoming"],
    queryFn: () => api.tasks.list({ view: "upcoming" }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  const onToggle = async (task: Task) => {
    task.status === "done" ? await api.tasks.reopen(task.id) : await api.tasks.complete(task.id);
    invalidate();
  };
  const onDelete = async (task: Task) => {
    await api.tasks.remove(task.id);
    invalidate();
  };

  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.due_date ?? "No date";
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(t);
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Upcoming</h1>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      {[...byDate.entries()].map(([date, items]) => (
        <div key={date} className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">{date}</p>
          {items.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      ))}
      {tasks.length === 0 && !isLoading && (
        <EmptyState icon={CalendarDaysIcon} title="Nothing scheduled ahead" subtitle="Tasks with a future due date will show up here, grouped by day." />
      )}
    </div>
  );
}
