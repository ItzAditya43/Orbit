import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useState } from "react";

const COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22d3ee", "#818cf8", "#c084fc", "#f472b6"];

export default function Projects() {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const [name, setName] = useState("");

  const create = async () => {
    if (!name.trim()) return;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    await api.projects.create({ name: name.trim(), color });
    setName("");
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Projects</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name..."
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none"
        />
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">
          Add
        </button>
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/projects/${p.id}`}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 hover:border-neutral-300 dark:hover:border-neutral-700"
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color ?? "#999" }} />
              <span className="font-medium text-sm">{p.name}</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              {p.open_task_count ?? 0} open · {p.done_task_count ?? 0} done
            </p>
          </Link>
        ))}
        {projects.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No projects yet.</p>}
      </div>
    </div>
  );
}
