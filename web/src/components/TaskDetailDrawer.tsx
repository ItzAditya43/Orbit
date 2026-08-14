import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Priority, type Task } from "../api";
import { useTaskDetailStore } from "../taskDetailStore";
import { PriorityPicker } from "./PriorityPicker";
import { useToastStore } from "../toastStore";

export function TaskDetailDrawer() {
  const { openTaskId, close } = useTaskDetailStore();
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const { data: task } = useQuery({
    queryKey: ["tasks", "detail", openTaskId],
    queryFn: () => api.tasks.get(openTaskId!),
    enabled: !!openTaskId,
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
    }
  }, [task?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  if (!openTaskId) return null;

  const patch = async (body: Record<string, unknown>) => {
    await api.tasks.update(openTaskId, body);
    invalidate();
  };

  const addSubtask = async () => {
    if (!subtaskTitle.trim()) return;
    await api.tasks.create({ title: subtaskTitle.trim(), parentId: openTaskId });
    setSubtaskTitle("");
    invalidate();
  };

  const toggleSubtask = async (sub: Task) => {
    sub.status === "done" ? await api.tasks.reopen(sub.id) : await api.tasks.complete(sub.id);
    invalidate();
  };

  const deleteTask = async () => {
    await api.tasks.remove(openTaskId);
    close();
    invalidate();
    toast("Task deleted");
  };

  const subtasks = task?.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.status === "done").length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={close} />
      <div className="relative w-full max-w-md h-full bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-y-auto animate-drawer-in">
        {!task ? (
          <div className="p-6 text-sm text-neutral-400">Loading...</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => (task.status === "done" ? api.tasks.reopen(task.id) : api.tasks.complete(task.id)).then(() => {
                  invalidate();
                  qc.invalidateQueries({ queryKey: ["tasks", "detail", openTaskId] });
                })}
                className={`h-5 w-5 mt-1 shrink-0 rounded-full border-2 flex items-center justify-center ${
                  task.status === "done" ? "bg-emerald-500 border-emerald-500" : "border-neutral-400 dark:border-neutral-600"
                }`}
              >
                {task.status === "done" && <span className="text-white text-[10px] animate-check-pop">✓</span>}
              </button>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
                rows={1}
                className={`flex-1 resize-none bg-transparent text-base font-medium outline-none leading-snug ${
                  task.status === "done" ? "line-through text-neutral-400" : ""
                }`}
              />
              <button onClick={close} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 shrink-0">
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pl-8 text-xs">
              <label className="flex items-center gap-1.5 text-neutral-500">
                Priority
                <PriorityPicker value={task.priority} onChange={(p: Priority) => patch({ priority: p })} />
              </label>
              <label className="flex items-center gap-1.5 text-neutral-500">
                Due
                <input
                  type="date"
                  value={task.due_date ?? ""}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                  className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
                />
              </label>
              <label className="flex items-center gap-1.5 text-neutral-500">
                Project
                <select
                  value={task.project_id ?? ""}
                  onChange={(e) => patch({ projectId: e.target.value || null })}
                  className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="pl-8">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (task.notes ?? "") && patch({ notes })}
                placeholder="Add notes..."
                rows={3}
                className="w-full resize-none rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
              />
            </div>

            <div className="pl-8 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-neutral-500">
                  Subtasks {subtasks.length > 0 && `(${doneCount}/${subtasks.length})`}
                </p>
              </div>
              {subtasks.length > 0 && (
                <div className="h-1 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${subtasks.length ? (doneCount / subtasks.length) * 100 : 0}%` }}
                  />
                </div>
              )}
              <div className="space-y-1">
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => toggleSubtask(s)}
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                        s.status === "done" ? "bg-emerald-500 border-emerald-500" : "border-neutral-400 dark:border-neutral-600"
                      }`}
                    />
                    <span className={`flex-1 text-sm ${s.status === "done" ? "line-through text-neutral-400" : ""}`}>{s.title}</span>
                    <button
                      onClick={async () => {
                        await api.tasks.remove(s.id);
                        invalidate();
                      }}
                      className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addSubtask();
                }}
              >
                <input
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder="+ Add subtask"
                  className="w-full text-sm bg-transparent outline-none text-neutral-500 placeholder:text-neutral-400 py-1"
                />
              </form>
            </div>

            <div className="pl-8 pt-4 border-t border-neutral-100 dark:border-neutral-800">
              <button onClick={deleteTask} className="text-xs text-neutral-400 hover:text-red-500">
                Delete task
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
