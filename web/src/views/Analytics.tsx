import { useQuery } from "@tanstack/react-query";
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

export default function Analytics() {
  const { data, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: api.analytics.summary });

  if (isLoading || !data) return <div className="p-8 text-sm text-neutral-400">Loading...</div>;

  const maxCompleted = Math.max(1, ...data.completedByDay.map((d: any) => d.count));
  const maxFocus = Math.max(1, ...data.focusMinutesByDay.map((d: any) => Math.round(d.minutes ?? 0)));
  const maxVelocity = Math.max(1, ...data.projectVelocity.map((p: any) => p.completed_count));

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-xl font-semibold">Analytics</h1>

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

      <div className="space-y-2">
        <p className="text-sm font-medium">Completed per day (last 14)</p>
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
