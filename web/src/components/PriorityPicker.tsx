import { useEffect, useRef, useState } from "react";
import type { Priority } from "../api";
import { PRIORITIES, PRIORITY_META } from "../priority";

export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const meta = PRIORITY_META[value];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={meta.label}
        className={`h-2.5 w-2.5 rounded-full shrink-0 ${meta.dot} ring-2 ring-transparent hover:ring-neutral-300 dark:hover:ring-neutral-600 transition-shadow`}
      />
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-30 top-5 left-0 w-36 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg p-1 animate-pop-in"
        >
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                p === value ? "font-medium" : ""
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${PRIORITY_META[p].dot}`} />
              {PRIORITY_META[p].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
