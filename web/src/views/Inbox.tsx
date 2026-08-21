import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";
import { QuickAdd } from "../components/QuickAdd";
import { EmptyState } from "../components/EmptyState";
import { InboxIcon } from "../icons";
import { useToastStore } from "../toastStore";

export default function Inbox() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "inbox"],
    queryFn: () => api.tasks.list({ view: "inbox" }),
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const onAdd = async (title: string) => {
    await api.tasks.create({ title, isInbox: true });
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

  const process = async (task: Task, projectId: string) => {
    await api.tasks.update(task.id, { isInbox: false, projectId });
    invalidate();
    toast(`Moved "${task.title}" to project`);
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <p className="text-sm text-neutral-400">Capture first, organize later.</p>
      <QuickAdd onAdd={onAdd} placeholder="Capture an idea or task..." />
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <div className="flex-1">
              <TaskRow task={t} onToggle={onToggle} onDelete={onDelete} />
            </div>
            {projects.length > 0 && (
              <select
                className="text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-1 py-1"
                defaultValue=""
                onChange={(e) => e.target.value && process(t, e.target.value)}
              >
                <option value="" disabled>
                  Move to...
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        {tasks.length === 0 && !isLoading && (
          <EmptyState icon={InboxIcon} title="Inbox zero" subtitle="Anything you capture without a date lands here — sort it into a project when you're ready." />
        )}
      </div>
    </div>
  );
}
