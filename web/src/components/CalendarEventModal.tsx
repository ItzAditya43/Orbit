import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useToastStore } from "../toastStore";
import { DateField } from "./DateField";
import { TimeField } from "./TimeField";

const EVENT_COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22d3ee", "#818cf8", "#c084fc", "#f472b6"];

function splitLocal(iso: string | null) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
function combineLocal(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function CalendarEventModal({
  date,
  event,
  onClose,
}: {
  date?: string;
  event?: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  const isEdit = !!event;
  const startSplit = event ? splitLocal(event.starts_at) : { date: date ?? "", time: "09:00" };
  const endSplit = event ? splitLocal(event.ends_at) : { date: date ?? "", time: "10:00" };

  const [title, setTitle] = useState(event?.title ?? "");
  const [startDate, setStartDate] = useState(startSplit.date);
  const [startTime, setStartTime] = useState(startSplit.time);
  const [endDate, setEndDate] = useState(endSplit.date);
  const [endTime, setEndTime] = useState(endSplit.time);
  const [allDay, setAllDay] = useState(!!event?.all_day);
  const [color, setColor] = useState(event?.color ?? EVENT_COLORS[0]);
  const [location, setLocation] = useState(event?.location ?? "");
  const [projectId, setProjectId] = useState(event?.project_id ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["calendar"] });

  const save = async () => {
    if (!title.trim()) return;
    const body = {
      title: title.trim(),
      startsAt: combineLocal(startDate, allDay ? "00:00" : startTime).toISOString(),
      endsAt: combineLocal(endDate || startDate, allDay ? "23:59" : endTime).toISOString(),
      allDay,
      color,
      location: location || undefined,
      projectId: projectId || undefined,
      notes: notes || undefined,
    };
    if (isEdit) {
      await api.calendar.update(event.id, body);
      toast("Event updated");
    } else {
      await api.calendar.create(body);
      toast("Event added");
    }
    invalidate();
    onClose();
  };

  const remove = async () => {
    await api.calendar.remove(event.id);
    invalidate();
    toast("Event deleted");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl animate-pop-in overflow-hidden"
      >
        <div className="h-1.5" style={{ background: color }} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="p-4 space-y-3"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            autoFocus
            className="w-full text-base font-medium bg-transparent outline-none placeholder:text-neutral-400"
          />

          <label className="flex items-center gap-2 text-xs text-neutral-500">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-neutral-500 space-y-1">
              <span>Starts</span>
              <div className="flex gap-1">
                <DateField
                  value={startDate || null}
                  onChange={(v) => setStartDate(v ?? "")}
                  className="flex-1 text-left rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5 text-sm"
                />
                {!allDay && (
                  <TimeField value={startTime} onChange={setStartTime} className="w-16 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5 text-sm" />
                )}
              </div>
            </label>
            <label className="text-xs text-neutral-500 space-y-1">
              <span>Ends</span>
              <div className="flex gap-1">
                <DateField
                  value={endDate || null}
                  onChange={(v) => setEndDate(v ?? "")}
                  className="flex-1 text-left rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5 text-sm"
                />
                {!allDay && (
                  <TimeField value={endTime} onChange={setEndTime} className="w-16 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5 text-sm" />
                )}
              </div>
            </label>
          </div>

          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm outline-none"
          />

          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes..."
            rows={2}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm outline-none resize-none"
          />

          <div className="flex items-center gap-1.5">
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-neutral-400 dark:ring-offset-neutral-900 scale-105" : "opacity-70 hover:opacity-100"}`}
                style={{ background: c }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            {isEdit ? (
              <button type="button" onClick={remove} className="text-xs text-red-500 hover:underline">
                Delete event
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                Cancel
              </button>
              <button type="submit" className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium">
                {isEdit ? "Save" : "Add event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
