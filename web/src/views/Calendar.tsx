import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function Calendar() {
  const start = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const from = days[0].toISOString().slice(0, 10);
  const to = days[6].toISOString().slice(0, 10) + "T23:59:59";

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () => api.calendar.list({ from, to }),
  });

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Calendar — This Week</h1>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const dayEvents = events.filter((e: any) => (e.starts_at ?? "").slice(0, 10) === key);
          return (
            <div key={key} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-2 min-h-40">
              <p className="text-xs text-neutral-400 mb-2">
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </p>
              <div className="space-y-1">
                {dayEvents.map((e: any) => (
                  <div
                    key={e.id}
                    className={`text-xs px-1.5 py-1 rounded ${
                      e.source === "task" ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300" : "bg-neutral-100 dark:bg-neutral-800"
                    }`}
                  >
                    {e.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-neutral-400">
        Blue chips are tasks with a scheduled time. Plain chips are calendar events. External calendar sync (Google/CalDAV) isn't wired up yet.
      </p>
    </div>
  );
}
