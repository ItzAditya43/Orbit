import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { CalendarEventModal } from "../components/CalendarEventModal";
import { EmptyState } from "../components/EmptyState";
import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "../icons";

type ViewMode = "month" | "week" | "timeline" | "agenda";

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
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<any | null>(null);
  const [showHabits, setShowHabits] = useState(true);
  const [dayPopup, setDayPopup] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const rangeStart = view === "month" ? addDays(startOfWeek(startOfMonth(anchor)), 0) : startOfWeek(anchor);
  const daysToShow = view === "month" ? 42 : view === "week" || view === "timeline" ? 7 : 60;
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
      if (!showHabits && e.source === "habit") continue;
      const d = (e.starts_at ?? "").slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return map;
  }, [events, showHabits]);

  const days = useMemo(() => Array.from({ length: view === "agenda" ? 0 : daysToShow }, (_, i) => addDays(rangeStart, i)), [rangeStart, daysToShow, view]);

  const nav = (delta: number) => {
    if (view === "month") setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
    else setAnchor(addDays(anchor, delta * (view === "week" || view === "timeline" ? 7 : 30)));
  };

  const eventColor = (e: any) => e.color ?? (e.priority ? PRIORITY_COLOR[e.priority] : null) ?? "#a3a3a3";

  // Only real, single-day-owned items can be dragged to a new day: events (their own
  // startsAt/endsAt), tasks (dueDate), and goals (targetDate). Habits are recurring by rule
  // (daily/custom days/every N days) — there's no single "the day" to drag them to, so they're
  // excluded, same reasoning as why period-based habits don't show on the calendar at all.
  const canDrag = (e: any) => e.source === "event" || e.source === "task" || e.source === "goal";

  // Holding Ctrl while dropping duplicates instead of moving — the original stays where it
  // was, a new item lands on the drop day. Only meaningful for events and tasks; dragging a
  // goal always moves it (duplicating a goal isn't a real use case the way a recurring-ish
  // task or a template event is).
  const rescheduleTo = async (e: any, newDay: string, duplicate = false) => {
    if (e.source === "task") {
      if (duplicate) await api.tasks.create({ title: e.title, dueDate: newDay, priority: e.priority ?? undefined, projectId: e.project_id ?? undefined });
      // isInbox: false too — otherwise a task scheduled from the Unscheduled panel keeps
      // matching the inbox filter (due date and inbox status are independent flags) and just
      // sits there showing as still-unscheduled even though it now has a real due date.
      else await api.tasks.update(e.task_id, { dueDate: newDay, isInbox: false });
    } else if (e.source === "goal") {
      await api.goals.update(e.goal_id, { targetDate: newDay });
    } else if (e.source === "event") {
      const startTime = e.starts_at?.slice(11, 16) ?? "00:00";
      const endTime = e.ends_at?.slice(11, 16) ?? startTime;
      const body = {
        startsAt: new Date(`${newDay}T${startTime}:00`).toISOString(),
        endsAt: new Date(`${newDay}T${endTime}:00`).toISOString(),
      };
      if (duplicate) {
        await api.calendar.create({ title: e.title, allDay: !!e.all_day, color: e.color ?? undefined, ...body });
      } else {
        await api.calendar.update(e.id, body);
      }
    }
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["goals"] });
  };

  // Time-blocking: dropping onto a specific hour slot in the Timeline view, not just a day.
  // Events move their startsAt/endsAt (preserving duration); tasks get scheduledAt set to an
  // exact time instead of just a due date — the distinction between "due sometime that day"
  // and "I've actually blocked this hour for it" that a plain day-cell drag can't express.
  const rescheduleToDateTime = async (e: any, newDay: string, hour: number, minute: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const newStart = `${pad(hour)}:${pad(minute)}`;
    if (e.source === "task") {
      const scheduledAt = new Date(`${newDay}T${newStart}:00`).toISOString();
      await api.tasks.update(e.task_id, { scheduledAt, isInbox: false });
    } else if (e.source === "event") {
      const oldStart = new Date(e.starts_at);
      const oldEnd = new Date(e.ends_at ?? e.starts_at);
      const durationMs = Math.max(0, oldEnd.getTime() - oldStart.getTime());
      const newStartDate = new Date(`${newDay}T${newStart}:00`);
      const newEndDate = new Date(newStartDate.getTime() + durationMs);
      await api.calendar.update(e.id, { startsAt: newStartDate.toISOString(), endsAt: newEndDate.toISOString(), allDay: false });
    }
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const [contextMenu, setContextMenu] = useState<{ e: any; x: number; y: number } | null>(null);
  const { data: unscheduled = [] } = useQuery({
    queryKey: ["tasks", "inbox-unscheduled"],
    queryFn: () => api.tasks.list({ view: "inbox" }),
  });

  const label =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week" || view === "timeline"
        ? `${rangeStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(rangeStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : "Next 30 days";

  return (
    <div className="w-full p-8 space-y-5">
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
            {(["month", "week", "timeline", "agenda"] as ViewMode[]).map((v) => (
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
            onClick={() => setShowHabits((v) => !v)}
            title="Toggle habits on the calendar"
            className={`h-8 px-3 rounded-lg border text-xs ${
              showHabits
                ? "border-neutral-900 dark:border-white bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-200 dark:border-neutral-800 text-neutral-400"
            }`}
          >
            Habits
          </button>
          <button
            onClick={() => setModalDate(key(new Date()))}
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-medium"
          >
            <PlusIcon size={13} /> Event
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}

      {unscheduled.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-400">Unscheduled — drag onto a day to set its due date</p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t: any) => (
              <div
                key={t.id}
                draggable
                onDragStart={(ev) =>
                  ev.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({ source: "task", task_id: t.id, title: t.title, priority: t.priority, project_id: t.project_id })
                  )
                }
                className="text-xs px-2.5 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 cursor-grab active:cursor-grabbing bg-neutral-50 dark:bg-neutral-900"
                title={t.title}
              >
                {t.title}
              </div>
            ))}
          </div>
        </div>
      )}

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
                  onClick={() => {
                    if (longPressed.current) {
                      longPressed.current = false;
                      return;
                    }
                    setModalDate(key(d));
                  }}
                  onMouseDown={() => {
                    longPressed.current = false;
                    pressTimer.current = setTimeout(() => {
                      longPressed.current = true;
                      setDayPopup(key(d));
                    }, 450);
                  }}
                  onMouseUp={() => {
                    if (pressTimer.current) clearTimeout(pressTimer.current);
                  }}
                  onMouseLeave={() => {
                    if (pressTimer.current) clearTimeout(pressTimer.current);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    const raw = ev.dataTransfer.getData("application/json");
                    if (raw) rescheduleTo(JSON.parse(raw), key(d), ev.ctrlKey || ev.metaKey);
                  }}
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
                        draggable={canDrag(e)}
                        onDragStart={(ev) => {
                          ev.stopPropagation();
                          ev.dataTransfer.setData("application/json", JSON.stringify(e));
                        }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (e.source === "event") setEditEvent(e);
                        }}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setContextMenu({ e, x: ev.clientX, y: ev.clientY });
                        }}
                        className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate text-white ${canDrag(e) ? "cursor-grab active:cursor-grabbing" : ""}`}
                        style={{ background: eventColor(e) }}
                        title={`${e.title}${canDrag(e) ? " — Ctrl+drag to duplicate, right-click for options" : ""}`}
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
                onDragOver={(e) => e.preventDefault()}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const raw = ev.dataTransfer.getData("application/json");
                  if (raw) rescheduleTo(JSON.parse(raw), key(d), ev.ctrlKey || ev.metaKey);
                }}
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
                      draggable={canDrag(e)}
                      onDragStart={(ev) => ev.dataTransfer.setData("application/json", JSON.stringify(e))}
                      onClick={() => e.source === "event" && setEditEvent(e)}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        setContextMenu({ e, x: ev.clientX, y: ev.clientY });
                      }}
                      className={`w-full text-left text-[11px] px-1.5 py-1 rounded text-white truncate ${canDrag(e) ? "cursor-grab active:cursor-grabbing" : ""}`}
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

      {view === "timeline" && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <p className="text-[10px] text-neutral-400 px-3 pt-2">
            All-day items don't appear here — switch to Month/Week for those. Drag an item onto an hour to time-block it.
          </p>
          <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
            <div />
            {days.map((d) => (
              <div key={key(d)} className="text-center text-[11px] font-medium text-neutral-400 py-1.5 border-b border-neutral-100 dark:border-neutral-900">
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </div>
            ))}
            <div>
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="h-12 text-right pr-1.5 text-[10px] text-neutral-400 -translate-y-2">
                  {hour === 0 ? "" : `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "a" : "p"}`}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const dayItems = (byDay.get(key(d)) ?? []).filter((e: any) => !e.all_day && e.starts_at);
              return (
                <div
                  key={key(d)}
                  className="relative border-l border-neutral-100 dark:border-neutral-900"
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    const raw = ev.dataTransfer.getData("application/json");
                    if (!raw) return;
                    const rect = ev.currentTarget.getBoundingClientRect();
                    const offsetY = ev.clientY - rect.top;
                    const totalMinutes = Math.max(0, Math.min(23 * 60 + 45, Math.round(offsetY / 48 / 0.25) * 15));
                    rescheduleToDateTime(JSON.parse(raw), key(d), Math.floor(totalMinutes / 60), totalMinutes % 60);
                  }}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour} className="h-12 border-b border-neutral-100 dark:border-neutral-900" />
                  ))}
                  {dayItems.map((e: any) => {
                    const start = new Date(e.starts_at);
                    const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 30 * 60000);
                    const top = (start.getHours() + start.getMinutes() / 60) * 48;
                    const height = Math.max(16, ((end.getTime() - start.getTime()) / 3600000) * 48);
                    return (
                      <button
                        key={e.id}
                        draggable={canDrag(e)}
                        onDragStart={(ev) => ev.dataTransfer.setData("application/json", JSON.stringify(e))}
                        onClick={() => e.source === "event" && setEditEvent(e)}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          setContextMenu({ e, x: ev.clientX, y: ev.clientY });
                        }}
                        style={{ top, height, background: eventColor(e) }}
                        className={`absolute left-0.5 right-0.5 rounded-md px-1 py-0.5 text-left text-[10px] text-white overflow-hidden ${canDrag(e) ? "cursor-grab active:cursor-grabbing" : ""}`}
                        title={`${e.title} — ${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                      >
                        {e.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
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
            <EmptyState icon={CalendarOffIcon} title="Nothing on the calendar" subtitle="Events, scheduled tasks, due habits, and goal deadlines in the next 30 days will show up here." />
          )}
        </div>
      )}

      {modalDate && <CalendarEventModal date={modalDate} onClose={() => setModalDate(null)} />}
      {editEvent && <CalendarEventModal event={editEvent} onClose={() => setEditEvent(null)} />}

      {dayPopup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setDayPopup(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl p-4 space-y-2 max-h-[70vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{new Date(dayPopup).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
              <button onClick={() => setDayPopup(null)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs">
                Close
              </button>
            </div>
            {(byDay.get(dayPopup) ?? []).length === 0 ? (
              <p className="text-xs text-neutral-400">Nothing this day.</p>
            ) : (
              ["task", "goal", "habit", "event"].map((src) => {
                const items = (byDay.get(dayPopup) ?? []).filter((e: any) => e.source === src);
                if (items.length === 0) return null;
                return (
                  <div key={src} className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-400">{src}s</p>
                    {items.map((e: any) => (
                      <div key={e.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: eventColor(e) }} />
                        <span className="flex-1 truncate">{e.title}</span>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
            <button
              onClick={() => {
                setModalDate(dayPopup);
                setDayPopup(null);
              }}
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-500"
            >
              + Add event
            </button>
          </div>
        </div>
      )}

      {contextMenu && (
        <div className="fixed inset-0 z-[60]" onClick={() => setContextMenu(null)} onContextMenu={(ev) => ev.preventDefault()}>
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-[61] w-44 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg py-1 text-xs"
          >
            {contextMenu.e.source === "event" && (
              <>
                <button
                  onClick={() => {
                    setEditEvent(contextMenu.e);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Edit
                </button>
                <button
                  onClick={async () => {
                    await rescheduleTo(contextMenu.e, key(new Date()), true);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Duplicate to today
                </button>
                <button
                  onClick={async () => {
                    await api.calendar.remove(contextMenu.e.id);
                    qc.invalidateQueries({ queryKey: ["calendar"] });
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-red-500"
                >
                  Delete
                </button>
              </>
            )}
            {contextMenu.e.source === "task" && (
              <>
                <button
                  onClick={async () => {
                    await api.tasks.complete(contextMenu.e.task_id);
                    qc.invalidateQueries({ queryKey: ["calendar"] });
                    qc.invalidateQueries({ queryKey: ["tasks"] });
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Mark complete
                </button>
                <button
                  onClick={async () => {
                    await rescheduleTo(contextMenu.e, key(new Date()), true);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Duplicate to today
                </button>
                <button
                  onClick={async () => {
                    await rescheduleTo(contextMenu.e, key(new Date()));
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Move to today
                </button>
                <button
                  onClick={async () => {
                    await api.tasks.remove(contextMenu.e.task_id);
                    qc.invalidateQueries({ queryKey: ["calendar"] });
                    qc.invalidateQueries({ queryKey: ["tasks"] });
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-red-500"
                >
                  Delete
                </button>
              </>
            )}
            {contextMenu.e.source === "goal" && (
              <Link to="/goals" onClick={() => setContextMenu(null)} className="block px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                Edit in Goals
              </Link>
            )}
            {contextMenu.e.source === "habit" && (
              <Link to="/habits" onClick={() => setContextMenu(null)} className="block px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                Edit in Habits
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
