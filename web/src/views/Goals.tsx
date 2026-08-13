import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

const HORIZONS = ["life", "annual", "semester", "monthly", "weekly", "daily"];

export default function Goals() {
  const qc = useQueryClient();
  const { data: goals = [], isLoading } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState("monthly");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["goals"] });

  const create = async () => {
    if (!title.trim()) return;
    await api.goals.create({ title: title.trim(), horizon });
    setTitle("");
    invalidate();
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Goals</h1>
      <p className="text-sm text-neutral-400">Goal → Project → Task → Session.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New goal..."
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <select
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-2 text-sm"
        >
          {HORIZONS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Add</button>
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {goals.map((g: any) => (
          <div key={g.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">{g.title}</span>
              <span className="text-[10px] uppercase text-neutral-400">{g.horizon}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(g.progress * 100)}
                onChange={async (e) => {
                  await api.goals.update(g.id, { progress: Number(e.target.value) / 100 });
                  invalidate();
                }}
                className="flex-1"
              />
              <span className="text-xs text-neutral-400 w-10 text-right">{Math.round(g.progress * 100)}%</span>
            </div>
          </div>
        ))}
        {goals.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No goals yet.</p>}
      </div>
    </div>
  );
}
