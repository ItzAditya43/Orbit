import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Priority } from "../api";
import { useQuickAddStore } from "../quickAddStore";
import { useToastStore } from "../toastStore";
import { PRIORITIES, PRIORITY_META } from "../priority";

export function QuickAddModal() {
  const { isOpen, close } = useQuickAddStore();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [due, setDue] = useState<"" | "today" | "tomorrow">("");
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 0);
    else {
      setTitle("");
      setPriority("none");
      setDue("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  if (!isOpen) return null;

  const dueDate =
    due === "today"
      ? new Date().toISOString().slice(0, 10)
      : due === "tomorrow"
        ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        : undefined;

  const submit = async () => {
    if (!title.trim()) return;
    await api.tasks.create({ title: title.trim(), priority, dueDate, isInbox: !dueDate });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    toast(`Added "${title.trim()}"`);
    close();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-32 z-50" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-pop-in"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="p-4 space-y-3"
        >
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you need to do?"
            className="w-full text-base bg-transparent outline-none placeholder:text-neutral-400"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {(["", "today", "tomorrow"] as const).map((d) => (
                <button
                  type="button"
                  key={d || "none"}
                  onClick={() => setDue(d)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    due === d
                      ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                      : "border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400"
                  }`}
                >
                  {d === "" ? "No date" : d === "today" ? "Today" : "Tomorrow"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {PRIORITIES.filter((p) => p !== "none").map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(priority === p ? "none" : p)}
                  title={PRIORITY_META[p].label}
                  className={`h-5 w-5 rounded-full ${PRIORITY_META[p].dot} ${
                    priority === p ? "ring-2 ring-offset-2 ring-neutral-400 dark:ring-offset-neutral-900" : "opacity-40 hover:opacity-80"
                  } transition-all`}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} className="text-xs px-3 py-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium"
            >
              Add task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
