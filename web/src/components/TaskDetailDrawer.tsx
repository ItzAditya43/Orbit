import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Priority, type Task } from "../api";
import { useTaskDetailStore } from "../taskDetailStore";
import { PriorityPicker } from "./PriorityPicker";
import { useToastStore } from "../toastStore";
import { CheckIcon, XIcon } from "../icons";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { DateField } from "./DateField";

const COLORS = ["", "#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22d3ee", "#818cf8", "#c084fc"];

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
  const { data: dependencies } = useQuery({
    queryKey: ["tasks", "dependencies", openTaskId],
    queryFn: () => api.tasks.dependencies(openTaskId!),
    enabled: !!openTaskId,
  });
  const { data: allTasks = [] } = useQuery({ queryKey: ["tasks", "status", "open"], queryFn: () => api.tasks.list({ status: "open" }) });

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
                {task.status === "done" && <CheckIcon size={11} className="text-white animate-check-pop" strokeWidth={2.5} />}
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
                <XIcon size={16} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pl-8 text-xs">
              <label className="flex items-center gap-1.5 text-neutral-500">
                Priority
                <PriorityPicker value={task.priority} onChange={(p: Priority) => patch({ priority: p })} />
              </label>
              <label className="flex items-center gap-1.5 text-neutral-500">
                Due
                <DateField
                  value={task.due_date}
                  onChange={(v) => patch({ dueDate: v })}
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
              <label className="flex items-center gap-1.5 text-neutral-500">
                Repeats
                <select
                  value={task.recurrence ?? "none"}
                  onChange={(e) => {
                    const recurrence = e.target.value === "none" ? null : e.target.value;
                    patch(
                      recurrence === "interval"
                        ? { recurrence, recurrenceIntervalDays: task.recurrence_interval_days ?? 2 }
                        : recurrence === "custom_days"
                          ? { recurrence, recurrenceDays: task.recurrence_days ?? [] }
                          : { recurrence }
                    );
                  }}
                  className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
                >
                  <option value="none">Never</option>
                  <option value="daily">Daily</option>
                  <option value="interval">Every N days</option>
                  <option value="custom_days">Custom days</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              {task.recurrence === "interval" && (
                <label className="flex items-center gap-1.5 text-neutral-500">
                  Every
                  <input
                    type="number"
                    min={2}
                    value={task.recurrence_interval_days ?? 2}
                    onChange={(e) => patch({ recurrenceIntervalDays: Math.max(2, Number(e.target.value) || 2) })}
                    className="w-12 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
                  />
                  days
                </label>
              )}
              {task.recurrence === "custom_days" && (
                <div className="flex items-center gap-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, i) => {
                    const days: number[] = task.recurrence_days ?? [];
                    const active = days.includes(i);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => patch({ recurrenceDays: active ? days.filter((d) => d !== i) : [...days, i].sort() })}
                        className={`h-6 w-6 rounded-full text-[10px] ${
                          active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-200 dark:border-neutral-800"
                        }`}
                      >
                        {label[0]}
                      </button>
                    );
                  })}
                </div>
              )}
              {task.recurrence && task.recurrence !== "none" && (
                <label className="flex items-center gap-1.5 text-neutral-500">
                  Ends
                  <DateField
                    value={task.recurrence_end_date ?? null}
                    onChange={(v) => patch({ recurrenceEndDate: v })}
                    className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
                  />
                </label>
              )}
              <label className="flex items-center gap-1.5 text-neutral-500">
                Energy
                <select
                  value={task.energy ?? ""}
                  onChange={(e) => patch({ energy: e.target.value || null })}
                  className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
                >
                  <option value="">—</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c || "none"}
                    onClick={() => patch({ color: c || null })}
                    title={c || "No color"}
                    className={`h-4 w-4 rounded-full border ${task.color === c || (!task.color && !c) ? "ring-2 ring-offset-1 ring-neutral-400 dark:ring-offset-neutral-900" : ""}`}
                    style={{ background: c || "transparent", borderColor: c ? c : "#a3a3a3" }}
                  />
                ))}
              </div>
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
                      className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500"
                    >
                      <XIcon size={13} />
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

            <div className="pl-8 space-y-1.5">
              <p className="text-xs font-medium text-neutral-500">Blocked by</p>
              {(dependencies?.blockedBy ?? []).map((d: any) => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{d.title}</span>
                  <button
                    onClick={async () => {
                      await api.tasks.removeDependency(openTaskId, d.id);
                      qc.invalidateQueries({ queryKey: ["tasks", "dependencies", openTaskId] });
                    }}
                    className="text-neutral-400 hover:text-red-500"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
              <select
                value=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  await api.tasks.addDependency(openTaskId, e.target.value);
                  qc.invalidateQueries({ queryKey: ["tasks", "dependencies", openTaskId] });
                }}
                className="text-xs text-neutral-400 bg-transparent outline-none flex items-center gap-1"
              >
                <option value="">+ Blocked by another task...</option>
                {allTasks.filter((t) => t.id !== openTaskId).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="pl-8 space-y-1.5">
              <p className="text-xs font-medium text-neutral-500">Images</p>
              <AttachmentsPanel entityType="task" entityId={openTaskId} />
            </div>

            <div className="pl-8 pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-3">
              <button
                onClick={async () => {
                  await api.tasks.duplicate(task.id);
                  invalidate();
                  toast("Task duplicated");
                }}
                className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                Duplicate
              </button>
              <button
                onClick={async () => {
                  await api.tasks.convertToProject(task.id);
                  close();
                  invalidate();
                  toast(`"${task.title}" converted to a project`);
                }}
                className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                Convert to project
              </button>
              <button onClick={deleteTask} className="text-xs text-neutral-400 hover:text-red-500 ml-auto">
                Delete task
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
