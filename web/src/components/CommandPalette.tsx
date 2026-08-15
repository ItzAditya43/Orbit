import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../store";
import { useQuickAddStore } from "../quickAddStore";
import {
  SunIcon,
  InboxIcon,
  CalendarDaysIcon,
  FolderIcon,
  TargetIcon,
  ClockIcon,
  RocketIcon,
  RepeatIcon,
  NoteIcon,
  CompassIcon,
  ZapIcon,
  BarChartIcon,
  SearchIcon,
  MoonIcon,
  PlusIcon,
  FilterIcon,
  TrashIcon,
} from "../icons";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: typeof SunIcon;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toggleTheme } = useUIStore();
  const openQuickAdd = useQuickAddStore((s) => s.open);

  const commands = useMemo<CommandItem[]>(
    () => [
      { id: "nav-today", label: "Go to Today", icon: SunIcon, run: () => navigate("/") },
      { id: "nav-inbox", label: "Go to Inbox", icon: InboxIcon, run: () => navigate("/inbox") },
      { id: "nav-upcoming", label: "Go to Upcoming", icon: CalendarDaysIcon, run: () => navigate("/upcoming") },
      { id: "nav-calendar", label: "Go to Calendar", icon: CalendarDaysIcon, run: () => navigate("/calendar") },
      { id: "nav-projects", label: "Go to Projects", icon: FolderIcon, run: () => navigate("/projects") },
      { id: "nav-focus", label: "Go to Focus", icon: TargetIcon, run: () => navigate("/focus") },
      { id: "nav-time", label: "Go to Time Tracking", icon: ClockIcon, run: () => navigate("/time") },
      { id: "nav-goals", label: "Go to Goals", icon: RocketIcon, run: () => navigate("/goals") },
      { id: "nav-habits", label: "Go to Habits", icon: RepeatIcon, run: () => navigate("/habits") },
      { id: "nav-notes", label: "Go to Notes", icon: NoteIcon, run: () => navigate("/notes") },
      { id: "nav-boundaries", label: "Go to Priority", icon: CompassIcon, run: () => navigate("/boundaries") },
      { id: "nav-automations", label: "Go to Automations", icon: ZapIcon, run: () => navigate("/automations") },
      { id: "nav-analytics", label: "Go to Analytics", icon: BarChartIcon, run: () => navigate("/analytics") },
      { id: "nav-review", label: "Go to Review", icon: BarChartIcon, run: () => navigate("/review") },
      { id: "nav-settings", label: "Go to Settings", icon: CompassIcon, run: () => navigate("/settings") },
      { id: "nav-filters", label: "Go to Filters", icon: FilterIcon, run: () => navigate("/filters") },
      { id: "nav-search", label: "Go to Search", icon: SearchIcon, run: () => navigate("/search") },
      { id: "nav-trash", label: "Go to Trash", icon: TrashIcon, run: () => navigate("/trash") },
      { id: "action-add-task", label: "Add a task", hint: "N", icon: PlusIcon, run: () => openQuickAdd() },
      { id: "action-theme", label: "Toggle dark / light mode", icon: MoonIcon, run: () => toggleTheme() },
    ],
    [navigate, openQuickAdd, toggleTheme]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const runActive = () => {
    const item = filtered[activeIndex];
    if (item) {
      item.run();
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-24 z-50" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-pop-in"
      >
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 px-3">
          <SearchIcon size={15} className="text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runActive();
              }
            }}
            placeholder="Jump to a view or run a command..."
            className="w-full py-2.5 text-sm bg-transparent outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="text-xs text-neutral-400 px-3 py-4 text-center">No matches.</p>}
          {filtered.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  item.run();
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left ${
                  i === activeIndex ? "bg-neutral-100 dark:bg-neutral-800" : ""
                }`}
              >
                <Icon size={15} className="text-neutral-400" />
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[10px] text-neutral-400">{item.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
