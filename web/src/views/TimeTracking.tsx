import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

export default function TimeTracking() {
  const qc = useQueryClient();
  const [taskId, setTaskId] = useState("");
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", "today"], queryFn: () => api.tasks.list({ view: "today" }) });
  const { data: entries = [], isLoading } = useQuery({ queryKey: ["time-entries"], queryFn: () => api.timeEntries.list() });

  const running = entries.find((e: any) => !e.ended_at);

  const start = async () => {
    await api.timeEntries.start({ taskId: taskId || undefined });
    qc.invalidateQueries({ queryKey: ["time-entries"] });
  };
  const stop = async (id: string) => {
    await api.timeEntries.stop(id);
    qc.invalidateQueries({ queryKey: ["time-entries"] });
  };

  const totalToday = entries
    .filter((e: any) => (e.started_at ?? "").slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum: number, e: any) => sum + (e.duration_seconds ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Time Tracking</h1>
      <p className="text-sm text-neutral-400">Today: {Math.round(totalToday / 60)} minutes tracked</p>

      {!running ? (
        <div className="flex gap-2">
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          >
            <option value="">No linked task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button onClick={start} className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">
            Start timer
          </button>
        </div>
      ) : (
        <button onClick={() => stop(running.id)} className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
          Stop timer (running since {new Date(running.started_at).toLocaleTimeString()})
        </button>
      )}

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-1">
        {entries.slice(0, 20).map((e: any) => (
          <div key={e.id} className="flex justify-between text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <span>{new Date(e.started_at).toLocaleString()}</span>
            <span className="text-neutral-400">{e.duration_seconds ? `${Math.round(e.duration_seconds / 60)}m` : "running"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
