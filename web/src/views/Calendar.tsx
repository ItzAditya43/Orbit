import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { CalendarEventModal } from "../components/CalendarEventModal";
import { EmptyState } from "../components/EmptyState";
import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "../icons";

type ViewMode = "month" | "week" | "agenda";

function startOfWeek(d: Date) {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function key(d: Date) {
  return d.toISOString().slice(0, 10);
}
function isSameMonth(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function isToday(d: Date) {
  return key(d) === key(new Date());
}

const PRIORITY_COLOR: Record<string, string> = { urgent: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#38bdf8" };

export default function Calendar() {
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<any | null>(null);

  const rangeStart = view === "month" ? addDays(startOfWeek(startOfMonth(anchor)), 0) : startOfWeek(anchor);
  const daysToShow = view === "month" ? 42 : view === "week" ? 7 : 60;
  const rangeEnd = addDays(rangeStart, daysToShow - 1);

  const from = key(view === "agenda" ? new Date() : rangeStart);
  const to = key(view === "agenda" ? addDays(new Date(), 30) : rangeEnd) + "T23:59:59";

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () => api.calendar.list({ from, to }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of events) {
      const d = (e.starts_at ?? "").slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return map;
  }, [events]);

  const days = useMemo(() => Array.from({ length: view === "agenda" ? 0 : daysToShow }, (_, i) => addDays(rangeStart, i)), [rangeStart, daysToShow, view]);

  const nav = (delta: number) => {
    if (view === "month") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
    else setAnchor(addDays(anchor, delta * (view === "week" ? 7 : 30)));
  };

  const eventColor = (e: any) => e.color ?? (e.priority ? PRIORITY_COLOR[e.priority] : null) ?? "#a3a3a3";

  const label =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `${rangeStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(rangeStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : "Next 30 days";

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="text-sm text-neutral-400">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          {view !== "agenda" && (
            <div className="flex items-center gap-1">
              <button onClick={() => nav(-1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">
                <ChevronLeftIcon size={15} />
              </button>
              <button
                onClick={() => setAnchor(new Date())}
                className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Today
              </button>
              <button onClick={() => nav(1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">
                <ChevronRightIcon size={15} />
              </button>
            </div>
          )}
          <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden text-xs">
            {(["month", "week", "agenda"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 capitalize ${view === v ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModalDate(key(new Date()))}
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-medium"
          >
            <PlusIcon size={13} /> Event
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}

      {view === "month" && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-1.5 text-[11px] font-medium text-neutral-400 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const dayEvents = byDay.get(key(d)) ?? [];
              const inMonth = isSameMonth(d, anchor);
              return (
                <div
                  key={key(d)}
                  onClick={() => setModalDate(key(d))}
                  className={`min-h-24 border-b border-r border-neutral-100 dark:border-neutral-900 p-1.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors ${
                    !inMonth ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className={`text-xs inline-flex h-5 w-5 items-center justify-center rounded-full ${
                      isToday(d) ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium" : "text-neutral-500"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (e.source === "event") setEditEvent(e);
                        }}
                        className="w-full text-left text-[10px] px-1 py-0.5 rounded truncate text-white"
                        style={{ background: eventColor(e) }}
                        title={e.title}
                      >
                        {e.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && <p className="text-[10px] text-neutral-400 pl-1">+{dayEvents.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const dayEvents = byDay.get(key(d)) ?? [];
            return (
              <div
                key={key(d)}
                className={`rounded-xl border p-2 min-h-48 ${
                  isToday(d) ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-neutral-400">{d.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className={`text-sm ${isToday(d) ? "font-semibold" : ""}`}>{d.getDate()}</p>
                </div>
                <div className="space-y-1">
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => e.source === "event" && setEditEvent(e)}
                      className="w-full text-left text-[11px] px-1.5 py-1 rounded text-white truncate"
                      style={{ background: eventColor(e) }}
                    >
                      {!e.all_day && e.starts_at && (
                        <span className="opacity-80 mr-1">{new Date(e.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                      )}
                      {e.title}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setModalDate(key(d))}
                  className="mt-2 w-full flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <PlusIcon size={11} /> Add
                </button>
              </div>
            );
          })}
        </div>
      )}

      {view === "agenda" && (
        <div className="space-y-3">
          {[...byDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, items]) => (
              <div key={day} className="flex gap-4">
                <div className="w-20 shrink-0 pt-1">
                  <p className="text-sm font-medium">{new Date(day).toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className="text-xs text-neutral-400">{new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {items.map((e: any) => (
                    <button
                      key={e.id}
                      onClick={() => e.source === "event" && setEditEvent(e)}
                      className="w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:shadow-sm transition-shadow"
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: eventColor(e) }} />
                      <span className="flex-1 truncate">{e.title}</span>
                      {!e.all_day && (
                        <span className="text-xs text-neutral-400">{new Date(e.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          {byDay.size === 0 && !isLoading && (
            <EmptyState icon={CalendarOffIcon} title="Nothing on the calendar" subtitle="Events and scheduled tasks in the next 30 days will show up here." />
          )}
        </div>
      )}

      {modalDate && <CalendarEventModal date={modalDate} onClose={() => setModalDate(null)} />}
      {editEvent && <CalendarEventModal event={editEvent} onClose={() => setEditEvent(null)} />}
    </div>
  );
}
