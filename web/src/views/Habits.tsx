import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

export default function Habits() {
  const qc = useQueryClient();
  const { data: habits = [], isLoading } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });
  const [title, setTitle] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["habits"] });
  const today = new Date().toISOString().slice(0, 10);

  const create = async () => {
    if (!title.trim()) return;
    await api.habits.create({ title: title.trim() });
    setTitle("");
    invalidate();
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Habits</h1>
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
          placeholder="New habit..."
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Add</button>
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {habits.map((h: any) => {
          const doneToday = h.logs?.some((l: any) => l.date === today);
          return (
            <div key={h.id} className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
              <div>
                <p className="text-sm font-medium">{h.title}</p>
                <p className="text-xs text-neutral-400">
                  {h.streak > 0 ? `${h.streak} day streak` : "No current streak"} · {h.totalCompletions} total
                </p>
              </div>
              <button
                onClick={async () => {
                  if (doneToday) await api.habits.unlog(h.id);
                  else await api.habits.log(h.id);
                  invalidate();
                }}
                className={`text-xs px-3 py-1.5 rounded-lg ${
                  doneToday ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600" : "border border-neutral-200 dark:border-neutral-800"
                }`}
              >
                {doneToday ? "Done today" : "Mark done"}
              </button>
            </div>
          );
        })}
        {habits.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No habits yet.</p>}
      </div>
    </div>
  );
}
