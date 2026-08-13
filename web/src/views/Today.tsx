import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";
import { QuickAdd } from "../components/QuickAdd";

export default function Today() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "today"],
    queryFn: () => api.tasks.list({ view: "today" }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const onAdd = async (title: string) => {
    const today = new Date().toISOString().slice(0, 10);
    await api.tasks.create({ title, dueDate: today });
    invalidate();
  };

  const onToggle = async (task: Task) => {
    task.status === "done" ? await api.tasks.reopen(task.id) : await api.tasks.complete(task.id);
    invalidate();
  };

  const onDelete = async (task: Task) => {
    await api.tasks.remove(task.id);
    invalidate();
  };

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Today</h1>
      <QuickAdd onAdd={onAdd} placeholder="Add a task for today..." />
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {open.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
        ))}
        {open.length === 0 && !isLoading && (
          <p className="text-sm text-neutral-400">Nothing due today. Nice.</p>
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
