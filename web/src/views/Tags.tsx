import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22d3ee", "#818cf8", "#c084fc"];

export default function Tags() {
  const qc = useQueryClient();
  const { data: tags = [], isLoading } = useQuery({ queryKey: ["tags"], queryFn: api.tags.list });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");

  const { data: items } = useQuery({
    queryKey: ["tags", "items", selectedId],
    queryFn: () => api.tags.items(selectedId!),
    enabled: !!selectedId,
  });

  const { data: allTasks = [] } = useQuery({ queryKey: ["tasks", "status", "open"], queryFn: () => api.tasks.list({ status: "open" }) });
  const { data: allGoals = [] } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const { data: allHabits = [] } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });

  const invalidateTags = () => {
    qc.invalidateQueries({ queryKey: ["tags"] });
  };
  const invalidateItems = () => {
    qc.invalidateQueries({ queryKey: ["tags", "items", selectedId] });
    invalidateTags();
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    const color = COLORS[tags.length % COLORS.length];
    const tag = await api.tags.create({ name: newTagName.trim(), color });
    setNewTagName("");
    invalidateTags();
    setSelectedId(tag.id);
  };

  const deleteTag = async (id: string) => {
    await api.tags.remove(id);
    if (selectedId === id) setSelectedId(null);
    invalidateTags();
  };

  const selectedTag = tags.find((t) => t.id === selectedId);
  const taggedTaskIds = new Set((items?.tasks ?? []).map((t: any) => t.id));
  const taggedGoalIds = new Set((items?.goals ?? []).map((g: any) => g.id));
  const taggedHabitIds = new Set((items?.habits ?? []).map((h: any) => h.id));

  const addItem = async (kind: "task" | "goal" | "habit", itemId: string) => {
    if (!selectedId) return;
    await api.tags.addItem(selectedId, kind, itemId);
    invalidateItems();
  };
  const removeItem = async (kind: "task" | "goal" | "habit", itemId: string) => {
    if (!selectedId) return;
    await api.tags.removeItem(selectedId, kind, itemId);
    invalidateItems();
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Tags</h1>
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTag();
            }}
            className="flex gap-1.5"
          >
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New tag..."
              className="flex-1 min-w-0 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-sm"
            />
            <button className="px-2.5 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm shrink-0">Add</button>
          </form>
          {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
          <div className="space-y-1">
            {tags.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-lg text-sm ${
                  selectedId === t.id ? "bg-neutral-100 dark:bg-neutral-800" : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: t.color ?? "#a3a3a3" }} />
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="text-[10px] text-neutral-400 shrink-0">{t.task_count + t.goal_count + t.habit_count}</span>
              </button>
            ))}
            {tags.length === 0 && !isLoading && <p className="text-xs text-neutral-400">No tags yet.</p>}
          </div>
        </div>

        <div>
          {!selectedTag && <p className="text-sm text-neutral-400">Select a tag to see what's under it.</p>}
          {selectedTag && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: selectedTag.color ?? "#a3a3a3" }} />
                  {selectedTag.name}
                </h2>
                <button onClick={() => deleteTag(selectedTag.id)} className="text-xs text-neutral-400 hover:text-red-500">
                  delete tag
                </button>
              </div>

              <TagSection
                title="Tasks"
                taggedItems={items?.tasks ?? []}
                allItems={allTasks.filter((t: any) => !taggedTaskIds.has(t.id))}
                onAdd={(id) => addItem("task", id)}
                onRemove={(id) => removeItem("task", id)}
              />
              <TagSection
                title="Goals"
                taggedItems={items?.goals ?? []}
                allItems={allGoals.filter((g: any) => !taggedGoalIds.has(g.id))}
                onAdd={(id) => addItem("goal", id)}
                onRemove={(id) => removeItem("goal", id)}
              />
              <TagSection
                title="Habits"
                taggedItems={items?.habits ?? []}
                allItems={allHabits.filter((h: any) => !taggedHabitIds.has(h.id))}
                onAdd={(id) => addItem("habit", id)}
                onRemove={(id) => removeItem("habit", id)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TagSection({
  title,
  taggedItems,
  allItems,
  onAdd,
  onRemove,
}: {
  title: string;
  taggedItems: any[];
  allItems: any[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-neutral-400">{title}</p>
        {allItems.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAdd(e.target.value);
            }}
            className="text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
          >
            <option value="">+ Add {title.toLowerCase()}...</option>
            {allItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="space-y-1">
        {taggedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between text-sm px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800"
          >
            <span className="truncate">{item.title}</span>
            <button onClick={() => onRemove(item.id)} className="text-neutral-400 hover:text-red-500 text-xs shrink-0">
              remove
            </button>
          </div>
        ))}
        {taggedItems.length === 0 && <p className="text-xs text-neutral-300 dark:text-neutral-700">Nothing tagged.</p>}
      </div>
    </div>
  );
}
