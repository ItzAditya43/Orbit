import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";

// Habits don't carry a priority/due-date pair the way tasks do, so "urgent" and "important"
// mean something different here — urgent is "at risk right now" (missed/due-soon deadline, or
// behind on this period's target), important is "tied to a goal you're actually working
// toward." Read-only classification, not drag-to-edit like the task matrix: there's no single
// field to write back for "make this important" the way priority/due-date works for a task —
// forcing a fake one would be more confusing than useful.
function isHabitUrgent(h: any) {
  if (h.deadlineStatus === "due-soon" || h.deadlineStatus === "missed") return true;
  if (h.periodProgress) {
    const { completed, target } = h.periodProgress;
    return completed < target;
  }
  return false;
}
function isHabitImportant(h: any) {
  return !!h.goal_id;
}

const QUADRANTS = [
  { key: "do", title: "At risk & important", subtitle: "Tied to a goal, falling behind", urgent: true, important: true, accent: "border-red-300 dark:border-red-900" },
  { key: "schedule", title: "Important, on track", subtitle: "Tied to a goal, going fine", urgent: false, important: true, accent: "border-amber-300 dark:border-amber-900" },
  { key: "delegate", title: "At risk, no goal", subtitle: "Falling behind, not tied to anything bigger", urgent: true, important: false, accent: "border-sky-300 dark:border-sky-900" },
  { key: "later", title: "On track, no goal", subtitle: "Ticking along fine", urgent: false, important: false, accent: "border-neutral-200 dark:border-neutral-800" },
] as const;

export default function HabitMatrix() {
  const { data: habits = [], isLoading } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });
  const active = habits.filter((h: any) => h.dueToday !== false);

  const bucket = (urgent: boolean, important: boolean) => active.filter((h: any) => isHabitUrgent(h) === urgent && isHabitImportant(h) === important);

  return (
    <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Habit Matrix</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            A read-only triage view — urgent means at risk right now, important means tied to a goal.
          </p>
        </div>
        <Link to="/matrix" className="text-xs text-neutral-400 hover:underline shrink-0">
          Task & goal matrix →
        </Link>
      </div>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUADRANTS.map((q) => {
          const items = bucket(q.urgent, q.important);
          return (
            <div key={q.key} className={`rounded-xl border-2 ${q.accent} p-3 min-h-[160px] space-y-2`}>
              <div>
                <p className="text-sm font-semibold">{q.title}</p>
                <p className="text-[11px] text-neutral-400">{q.subtitle}</p>
              </div>
              <div className="space-y-1.5">
                {items.map((h: any) => (
                  <div
                    key={h.id}
                    className="text-sm px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 truncate"
                    title={h.title}
                  >
                    {h.title}
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-neutral-300 dark:text-neutral-700">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
