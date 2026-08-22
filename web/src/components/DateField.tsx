import { useEffect, useRef, useState } from "react";

function toISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatLabel(s: string): string {
  if (!s) return "No date";
  return fromISODate(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Deliberately NOT <input type="date"> — see TimeField.tsx for why. This is a fully
// React-controlled dropdown: it can only ever be open or closed by state we set, so it
// can't get stuck in a native-widget limbo the way the WebKitGTK date popup did.
export function DateField({
  value,
  onChange,
  className,
}: {
  value: string | null; // "YYYY-MM-DD" or null
  onChange: (value: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (value ? fromISODate(value) : new Date()));
  const [align, setAlign] = useState<"left" | "right">("left");
  const ref = useRef<HTMLDivElement>(null);
  const PANEL_WIDTH = 224; // w-56

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setViewMonth(value ? fromISODate(value) : new Date());
          // Anchoring the panel to the button's left edge overflows off-screen for fields
          // near the right side of a packed row (e.g. "Ends" in the recurrence row) — flip
          // to right-aligned when there isn't enough viewport room to the right.
          const rect = ref.current?.getBoundingClientRect();
          if (rect && rect.left + PANEL_WIDTH > window.innerWidth) setAlign("right");
          else setAlign("left");
          setOpen((o) => !o);
        }}
        className={className}
      >
        {formatLabel(value ?? "")}
      </button>
      {open && (
        <div
          className={`absolute z-50 top-full ${align === "left" ? "left-0" : "right-0"} mt-1 w-56 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg p-2 text-xs`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} className="px-1.5 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
              ‹
            </button>
            <span className="font-medium">{viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} className="px-1.5 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-neutral-400 mb-0.5">
            {WEEKDAYS.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <span key={i} />;
              const iso = toISODate(new Date(year, month, day));
              const selected = iso === value;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`h-6 w-6 rounded-md ${
                    selected ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="mt-1.5 w-full text-center text-neutral-400 hover:text-red-500 py-0.5"
            >
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  );
}
