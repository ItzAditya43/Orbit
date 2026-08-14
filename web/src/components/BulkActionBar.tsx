import { useQuery } from "@tanstack/react-query";
import { api, type Priority } from "../api";
import { PRIORITIES, PRIORITY_META } from "../priority";
import { TrashIcon, CheckIcon } from "../icons";

export function BulkActionBar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  if (selectedIds.length === 0) return null;

  const run = async (body: Parameters<typeof api.tasks.bulk>[0]) => {
    await api.tasks.bulk(body);
    onDone();
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 pl-4 pr-2 py-2 text-sm shadow-2xl animate-pop-in">
      <span className="font-medium">{selectedIds.length} selected</span>
      <button
        onClick={() => run({ taskIds: selectedIds, action: "complete" })}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-white/20 dark:hover:bg-black/10"
      >
        <CheckIcon size={13} /> Complete
      </button>
      <select
        onChange={(e) => e.target.value && run({ taskIds: selectedIds, action: "move", projectId: e.target.value })}
        defaultValue=""
        className="bg-transparent px-2 py-1 rounded-full hover:bg-white/20 dark:hover:bg-black/10 text-xs outline-none"
      >
        <option value="" disabled>
          Move to...
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id} className="text-neutral-900">
            {p.name}
          </option>
        ))}
      </select>
      <select
        onChange={(e) => e.target.value && run({ taskIds: selectedIds, action: "priority", priority: e.target.value as Priority })}
        defaultValue=""
        className="bg-transparent px-2 py-1 rounded-full hover:bg-white/20 dark:hover:bg-black/10 text-xs outline-none"
      >
        <option value="" disabled>
          Priority...
        </option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p} className="text-neutral-900">
            {PRIORITY_META[p].label}
          </option>
        ))}
      </select>
      <button
        onClick={() => run({ taskIds: selectedIds, action: "delete" })}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-white/20 dark:hover:bg-black/10"
      >
        <TrashIcon size={13} /> Delete
      </button>
      <button onClick={onDone} className="px-2 py-1 rounded-full hover:bg-white/20 dark:hover:bg-black/10 text-xs">
        Cancel
      </button>
    </div>
  );
}
