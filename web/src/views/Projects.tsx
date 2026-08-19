import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { FolderIcon } from "../icons";

const COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22d3ee", "#818cf8", "#c084fc", "#f472b6"];

export default function Projects() {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const { data: archived = [] } = useQuery({ queryKey: ["projects", "archived"], queryFn: api.projects.archived });
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    await api.projects.create({ name: name.trim(), color });
    setName("");
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        {archived.length > 0 && (
          <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
            {showArchived ? "Hide archived" : `Archived (${archived.length})`}
          </button>
        )}
      </div>

      {showArchived && (
        <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Archived projects</p>
          {archived.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between text-sm py-1">
              <span>{p.name}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    await api.projects.update(p.id, { is_archived: 0 });
                    qc.invalidateQueries({ queryKey: ["projects"] });
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  Unarchive
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${p.name}"? This can be undone from Trash.`)) return;
                    await api.projects.remove(p.id);
                    qc.invalidateQueries({ queryKey: ["projects"] });
                  }}
                  className="text-xs text-neutral-400 hover:text-red-500"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex gap-2 max-w-md"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name..."
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
        />
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium hover:opacity-90">
          Add
        </button>
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      {projects.length === 0 && !isLoading ? (
        <EmptyState icon={FolderIcon} title="No projects yet" subtitle="Group related tasks into a project to track progress and see it on the kanban board." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const total = (p.open_task_count ?? 0) + (p.done_task_count ?? 0);
            const pct = total > 0 ? Math.round(((p.done_task_count ?? 0) / total) * 100) : 0;
            return (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: p.color ?? "#999" }} />
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold shrink-0"
                    style={{ background: p.color ?? "#999" }}
                  >
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-medium text-sm truncate">{p.name}</span>
                </div>
                <p className="text-xs text-neutral-400 mt-3">
                  {p.open_task_count ?? 0} open · {p.done_task_count ?? 0} done
                </p>
                <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden mt-2">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: p.color ?? "#999" }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
