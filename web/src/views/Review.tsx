import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

export default function Review() {
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const { data: daily, isLoading: loadingDaily } = useQuery({ queryKey: ["review", "daily"], queryFn: api.review.daily, enabled: tab === "daily" });
  const { data: weekly, isLoading: loadingWeekly } = useQuery({ queryKey: ["review", "weekly"], queryFn: api.review.weekly, enabled: tab === "weekly" });

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Review</h1>
      <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs w-fit">
        {(["daily", "weekly"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 capitalize ${tab === t ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "daily" && (
        <>
          {loadingDaily && <p className="text-sm text-neutral-400">Loading...</p>}
          {daily && (
            <div className="space-y-5">
              <p className="text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950">
                {daily.summary}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Completed" value={daily.completed.length} />
                <Stat label="Carried over" value={daily.carriedOver.length} />
                <Stat label="Focus minutes" value={daily.focusMinutes} />
              </div>
              <List title="Completed today" items={daily.completed} />
              <List title="Carried over (overdue)" items={daily.carriedOver} />
              <List title="Due today" items={daily.dueToday} />
            </div>
          )}
        </>
      )}

      {tab === "weekly" && (
        <>
          {loadingWeekly && <p className="text-sm text-neutral-400">Loading...</p>}
          {weekly && (
            <div className="space-y-5">
              <p className="text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950">
                {weekly.summary}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Completed" value={weekly.completed.length} />
                <Stat label="Overdue" value={weekly.stillOpen.length} />
                <Stat label="Focus minutes" value={weekly.focusMinutes} />
              </div>
              {weekly.stalledProjects.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Stalled projects</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {weekly.stalledProjects.map((p: any) => p.name).join(", ")} had no completions this week.
                  </p>
                </div>
              )}
              <List title="Completed this week" items={weekly.completed} />
              <List title="Still overdue" items={weekly.stillOpen} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-[11px] text-neutral-400">{label}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: any[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{title}</p>
      {items.map((t) => (
        <div key={t.id} className="text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
          {t.title}
        </div>
      ))}
    </div>
  );
}
