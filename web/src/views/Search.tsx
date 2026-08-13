import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";

export default function Search() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const { data: tasks = [], isFetching } = useQuery({
    queryKey: ["tasks", "search", q],
    queryFn: () => api.tasks.list({ q }),
    enabled: q.trim().length > 0,
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

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Search</h1>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search tasks by title or notes..."
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none"
      />
      {isFetching && <p className="text-sm text-neutral-400">Searching...</p>}
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
        ))}
        {q && tasks.length === 0 && !isFetching && <p className="text-sm text-neutral-400">No matches.</p>}
      </div>
    </div>
  );
}
