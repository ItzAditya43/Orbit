import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";
import { useToastStore } from "../toastStore";
import { ClockIcon, TrashIcon } from "../icons";

const SNOOZE_OPTIONS: { preset: "tomorrow" | "in3days" | "nextWeek" | "nextMonth"; label: string }[] = [
  { preset: "tomorrow", label: "Tomorrow" },
  { preset: "in3days", label: "In 3 days" },
  { preset: "nextWeek", label: "Next week" },
  { preset: "nextMonth", label: "Next month" },
];

export function TaskContextMenu({ task, children }: { task: Task; children: React.ReactNode }) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(null);
        setSnoozeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setOpen({ x: e.clientX, y: e.clientY });
      }}
    >
      {children}
      {open && (
        <div
          ref={ref}
          style={{ position: "fixed", left: open.x, top: open.y }}
          className="z-50 w-48 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl p-1 animate-pop-in text-sm"
        >
          <div className="relative">
            <button
              onClick={() => setSnoozeOpen((s) => !s)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left"
            >
              <ClockIcon size={14} /> Snooze
            </button>
            {snoozeOpen && (
              <div className="absolute left-full top-0 ml-1 w-32 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl p-1">
                {SNOOZE_OPTIONS.map((o) => (
                  <button
                    key={o.preset}
                    onClick={async () => {
                      await api.tasks.snooze(task.id, o.preset);
                      invalidate();
                      toast(`Snoozed to ${o.label.toLowerCase()}`);
                      setOpen(null);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              await api.tasks.duplicate(task.id);
              invalidate();
              toast("Task duplicated");
              setOpen(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Duplicate
          </button>
          <button
            onClick={async () => {
              await api.tasks.convertToProject(task.id);
              invalidate();
              qc.invalidateQueries({ queryKey: ["projects"] });
              toast(`"${task.title}" converted to a project`);
              setOpen(null);
            }}
            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Convert to project
          </button>
          <button
            onClick={async () => {
              await api.tasks.remove(task.id);
              invalidate();
              toast(`"${task.title}" moved to trash`);
              setOpen(null);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 text-left"
          >
            <TrashIcon size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
