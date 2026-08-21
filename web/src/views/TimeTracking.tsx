import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { DateField } from "../components/DateField";
import { TimeField } from "../components/TimeField";

function splitLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
function combineLocal(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function EntryRow({ entry, invalidate }: { entry: any; invalidate: () => void }) {
  const [editing, setEditing] = useState(false);
  const startSplit = splitLocal(entry.started_at);
  const endSplit = entry.ended_at ? splitLocal(entry.ended_at) : null;
  const [startDate, setStartDate] = useState(startSplit.date);
  const [startTime, setStartTime] = useState(startSplit.time);
  const [endDate, setEndDate] = useState(endSplit?.date ?? startSplit.date);
  const [endTime, setEndTime] = useState(endSplit?.time ?? "");

  const save = async () => {
    await api.timeEntries.update(entry.id, {
      startedAt: combineLocal(startDate, startTime).toISOString(),
      endedAt: endTime ? combineLocal(endDate, endTime).toISOString() : undefined,
    });
    setEditing(false);
    invalidate();
  };

  const remove = async () => {
    await api.timeEntries.remove(entry.id);
    invalidate();
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm px-3 py-2 rounded-lg border border-neutral-900 dark:border-white">
        <DateField value={startDate} onChange={(v) => setStartDate(v ?? startDate)} className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-1 text-xs" />
        <TimeField value={startTime} onChange={setStartTime} className="w-14 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-1 text-xs" />
        <span className="text-neutral-400">to</span>
        <DateField value={endDate} onChange={(v) => setEndDate(v ?? endDate)} className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-1 text-xs" />
        <TimeField value={endTime} onChange={setEndTime} className="w-14 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-1 text-xs" />
        <button onClick={save} className="ml-auto text-xs px-2 py-1 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
          Save
        </button>
        <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 rounded-md text-neutral-400">
          Cancel
        </button>
        <button onClick={remove} className="text-xs px-2 py-1 rounded-md text-red-500 hover:text-red-600">
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700">
      <button onClick={() => setEditing(true)} className="flex-1 flex justify-between text-left">
        <span>{new Date(entry.started_at).toLocaleString()}</span>
        <span className="text-neutral-400">{entry.duration_seconds ? `${Math.round(entry.duration_seconds / 60)}m` : "running"}</span>
      </button>
      <button onClick={remove} className="text-neutral-400 hover:text-red-500 text-xs shrink-0">
        remove
      </button>
    </div>
  );
}

export default function TimeTracking() {
  const qc = useQueryClient();
  const [taskId, setTaskId] = useState("");
  const [range, setRange] = useState<"week" | "month">("week");
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", "today"], queryFn: () => api.tasks.list({ view: "today" }) });
  const { data: entries = [], isLoading } = useQuery({ queryKey: ["time-entries"], queryFn: () => api.timeEntries.list() });
  const { data: summary } = useQuery({ queryKey: ["time-entries", "summary", range], queryFn: () => api.timeEntries.summary(range) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["time-entries"] });
  const running = entries.find((e: any) => !e.ended_at);

  const start = async () => {
    await api.timeEntries.start({ taskId: taskId || undefined });
    invalidate();
  };
  const stop = async (id: string) => {
    await api.timeEntries.stop(id);
    invalidate();
  };

  const totalToday = entries
    .filter((e: any) => (e.started_at ?? "").slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum: number, e: any) => sum + (e.duration_seconds ?? 0), 0);

  const maxDaySeconds = Math.max(1, ...(summary?.days ?? []).map((d: any) => d.seconds));

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-6">
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Totals</p>
          <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs">
            {(["week", "month"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 capitalize ${range === r ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {summary && <p className="text-xs text-neutral-400">{Math.round(summary.totalSeconds / 60)} minutes total this {range}</p>}
        <div className="space-y-1">
          {(summary?.days ?? []).map((d: any) => (
            <div key={d.day} className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 text-neutral-400">{d.day.slice(5)}</span>
              <div className="flex-1 h-2.5 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div className="h-full bg-neutral-900 dark:bg-neutral-100" style={{ width: `${Math.max(3, (d.seconds / maxDaySeconds) * 100)}%` }} />
              </div>
              <span className="w-10 text-right">{Math.round(d.seconds / 60)}m</span>
            </div>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-1">
        <p className="text-sm font-medium">Recent entries</p>
        {entries.slice(0, 20).map((e: any) => (
          <EntryRow key={e.id} entry={e} invalidate={invalidate} />
        ))}
      </div>
    </div>
  );
}
