import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { TaskRow } from "../components/TaskRow";
import { EmptyState } from "../components/EmptyState";
import { SearchIcon } from "../icons";
import { useToastStore } from "../toastStore";

export default function Filters() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const [priority, setPriority] = useState("");
  const [tagId, setTagId] = useState("");
  const [hasDueDate, setHasDueDate] = useState("");
  const [name, setName] = useState("");
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.tags.list });
  const { data: savedFilters = [] } = useQuery({ queryKey: ["filters"], queryFn: api.filters.list });

  const query: Record<string, string> = { status: "open" };
  if (priority) query.priority = priority;
  if (tagId) query.tagId = tagId;
  if (hasDueDate) query.hasDueDate = hasDueDate;

  const { data: tasks = [], isLoading } = useQuery({ queryKey: ["tasks", "filter", query], queryFn: () => api.tasks.list(query) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  const onToggle = async (task: any) => {
    task.status === "done" ? await api.tasks.reopen(task.id) : await api.tasks.complete(task.id);
    invalidate();
  };
  const onDelete = async (task: any) => {
    await api.tasks.remove(task.id);
    invalidate();
    toast(`"${task.title}" moved to trash`);
  };

  const applySaved = (f: any) => {
    setActiveSavedId(f.id);
    setPriority(f.query.priority ?? "");
    setTagId(f.query.tagId ?? "");
    setHasDueDate(f.query.hasDueDate ?? "");
  };

  const save = async () => {
    if (!name.trim()) return;
    await api.filters.create({ name: name.trim(), query });
    setName("");
    qc.invalidateQueries({ queryKey: ["filters"] });
    toast("Filter saved");
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Filters</h1>

      {savedFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {savedFilters.map((f: any) => (
            <button
              key={f.id}
              onClick={() => applySaved(f)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                activeSavedId === f.id ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900" : "border-neutral-200 dark:border-neutral-700 text-neutral-500"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5">
          <option value="">Any priority</option>
          {["low", "medium", "high", "urgent"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5">
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={hasDueDate} onChange={(e) => setHasDueDate(e.target.value)} className="text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5">
          <option value="">Any date</option>
          <option value="true">Has due date</option>
          <option value="false">No due date</option>
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save this filter as..."
          className="flex-1 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-1.5 outline-none"
        />
        <button onClick={save} className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium">
          Save
        </button>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {tasks.map((t: any) => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
        ))}
        {tasks.length === 0 && !isLoading && (
          <EmptyState icon={SearchIcon} title="No matching tasks" subtitle="Adjust the filters above." />
        )}
      </div>
    </div>
  );
}
