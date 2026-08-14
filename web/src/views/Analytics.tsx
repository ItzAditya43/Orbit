import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-20 shrink-0 text-neutral-400">{label}</span>
      <div className="flex-1 h-3 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div className="h-full bg-neutral-900 dark:bg-neutral-100" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right">{value}</span>
    </div>
  );
}

const RANGES = [
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function Heatmap({ completedByDay }: { completedByDay: { day: string; count: number }[] }) {
  const countByDay = new Map(completedByDay.map((d) => [d.day, d.count]));
  const days: string[] = [];
  const today = new Date();
  for (let i = 111; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const max = Math.max(1, ...completedByDay.map((d) => d.count));
  const shade = (count: number) => {
    if (count === 0) return "bg-neutral-100 dark:bg-neutral-800";
    const intensity = count / max;
    if (intensity > 0.75) return "bg-emerald-600";
    if (intensity > 0.5) return "bg-emerald-500";
    if (intensity > 0.25) return "bg-emerald-400";
    return "bg-emerald-300 dark:bg-emerald-700";
  };
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((day) => (
            <div key={day} title={`${day}: ${countByDay.get(day) ?? 0} completed`} className={`h-2.5 w-2.5 rounded-sm ${shade(countByDay.get(day) ?? 0)}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [rangeDays, setRangeDays] = useState(14);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({ queryKey: ["analytics", from, to], queryFn: () => api.analytics.summary({ from, to }) });
  const heatmapFrom = new Date(Date.now() - 112 * 86400000).toISOString().slice(0, 10);
  const { data: heatmapData } = useQuery({ queryKey: ["analytics", "heatmap"], queryFn: () => api.analytics.summary({ from: heatmapFrom, to }) });

  if (isLoading || !data) return <div className="p-8 text-sm text-neutral-400">Loading...</div>;

  const maxCompleted = Math.max(1, ...data.completedByDay.map((d: any) => d.count));
  const maxFocus = Math.max(1, ...data.focusMinutesByDay.map((d: any) => Math.round(d.minutes ?? 0)));
  const maxVelocity = Math.max(1, ...data.projectVelocity.map((p: any) => p.completed_count));

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1.5 ${rangeDays === r.days ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-2xl font-semibold">{data.totalOpen}</p>
          <p className="text-xs text-neutral-400">Open tasks</p>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-2xl font-semibold">{data.totalDone}</p>
          <p className="text-xs text-neutral-400">Completed</p>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-2xl font-semibold">{data.overdue}</p>
          <p className="text-xs text-neutral-400">Overdue</p>
        </div>
      </div>

      {heatmapData && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Completion activity (16 weeks)</p>
          <Heatmap completedByDay={heatmapData.completedByDay} />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Completed per day (last {rangeDays})</p>
        {data.completedByDay.map((d: any) => (
          <Bar key={d.day} label={d.day.slice(5)} value={d.count} max={maxCompleted} />
        ))}
        {data.completedByDay.length === 0 && <p className="text-xs text-neutral-400">No completions yet.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Focus minutes per day</p>
        {data.focusMinutesByDay.map((d: any) => (
          <Bar key={d.day} label={d.day.slice(5)} value={Math.round(d.minutes ?? 0)} max={maxFocus} />
        ))}
        {data.focusMinutesByDay.length === 0 && <p className="text-xs text-neutral-400">No focus sessions yet.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Project velocity</p>
        {data.projectVelocity.map((p: any) => (
          <Bar key={p.name} label={p.name} value={p.completed_count} max={maxVelocity} />
        ))}
        {data.projectVelocity.length === 0 && <p className="text-xs text-neutral-400">No completed project tasks yet.</p>}
      </div>
    </div>
  );
}
