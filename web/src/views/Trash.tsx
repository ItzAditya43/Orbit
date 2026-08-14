import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { EmptyState } from "../components/EmptyState";
import { TrashIcon } from "../icons";
import { useToastStore } from "../toastStore";

type Kind = "tasks" | "notes" | "projects";

export default function Trash() {
  const [kind, setKind] = useState<Kind>("tasks");
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["trash", kind],
    queryFn: () => (kind === "tasks" ? api.tasks.trash() : kind === "notes" ? api.notes.trash() : api.projects.trash()),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["trash", kind] });

  const restore = async (id: string) => {
    if (kind === "tasks") await api.tasks.restore(id);
    else if (kind === "notes") await api.notes.restore(id);
    else await api.projects.restore(id);
    invalidate();
    toast("Restored");
  };

  const removeForever = async (id: string) => {
    if (kind === "tasks") await api.tasks.removePermanent(id);
    else if (kind === "notes") await api.notes.removePermanent(id);
    else await api.projects.removePermanent(id);
    invalidate();
  };

  const emptyTrash = async () => {
    if (kind === "tasks") await api.tasks.emptyTrash();
    else {
      for (const item of items) await removeForever((item as any).id);
    }
    invalidate();
    toast("Trash emptied");
  };

  const label = (item: any) => item.title ?? item.name;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Trash</h1>
        {items.length > 0 && (
          <button onClick={emptyTrash} className="text-xs text-red-500 hover:underline">
            Empty trash
          </button>
        )}
      </div>
      <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs w-fit">
        {(["tasks", "notes", "projects"] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`px-3 py-1.5 capitalize ${kind === k ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
          >
            {k}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      {items.length === 0 && !isLoading ? (
        <EmptyState icon={TrashIcon} title="Trash is empty" subtitle={`Deleted ${kind} show up here before being gone for good.`} />
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
              <span className="truncate">{label(item)}</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => restore(item.id)} className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
                  Restore
                </button>
                <button onClick={() => removeForever(item.id)} className="text-xs text-red-500 hover:underline">
                  Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
