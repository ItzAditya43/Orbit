import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { TimeField } from "../components/TimeField";
import { Heatmap } from "../components/Heatmap";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface HabitFormState {
  deadlineTime: string;
  targetCount: string;
  unit: string;
  frequency: string;
  targetPerPeriod: string;
  goalId: string;
  customDays: number[];
  intervalDays: string;
}

function emptyFormState(): HabitFormState {
  return { deadlineTime: "", targetCount: "", unit: "", frequency: "daily", targetPerPeriod: "1", goalId: "", customDays: [], intervalDays: "2" };
}
function formStateFromHabit(h: any): HabitFormState {
  return {
    deadlineTime: h.deadline_time ?? "",
    targetCount: h.target_count ? String(h.target_count) : "",
    unit: h.unit ?? "",
    frequency: h.frequency ?? "daily",
    targetPerPeriod: h.target_per_period ? String(h.target_per_period) : "1",
    goalId: h.goal_id ?? "",
    customDays: h.customDays ?? [],
    intervalDays: h.interval_days ? String(h.interval_days) : "2",
  };
}
function formStateToPayload(s: HabitFormState) {
  return {
    frequency: s.frequency,
    targetPerPeriod: s.frequency === "weekly" || s.frequency === "biweekly" || s.frequency === "monthly" ? Number(s.targetPerPeriod) || 1 : undefined,
    deadlineTime: s.frequency === "daily" ? s.deadlineTime || undefined : undefined,
    targetCount: s.frequency === "daily" && s.targetCount ? Number(s.targetCount) : undefined,
    unit: s.frequency === "daily" ? s.unit.trim() || undefined : undefined,
    goalId: s.goalId || undefined,
    customDays: s.frequency === "custom_days" ? s.customDays : undefined,
    intervalDays: s.frequency === "interval" ? Number(s.intervalDays) || 2 : undefined,
  };
}

function HabitOptionsForm({
  state,
  setState,
  goals,
}: {
  state: HabitFormState;
  setState: (updater: (s: HabitFormState) => HabitFormState) => void;
  goals: any[];
}) {
  const set = <K extends keyof HabitFormState>(key: K, value: HabitFormState[K]) => setState((s) => ({ ...s, [key]: value }));
  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-2">
        <label className="flex-1 flex flex-col gap-1">
          <span className="text-neutral-400">Frequency</span>
          <select
            value={state.frequency}
            onChange={(e) => set("frequency", e.target.value)}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (X times this week)</option>
            <option value="biweekly">Biweekly (X times this fortnight)</option>
            <option value="monthly">Monthly (X times this month)</option>
            <option value="custom_days">Custom days (specific weekdays)</option>
            <option value="interval">Every N days (e.g. alternate days)</option>
          </select>
        </label>
        {(state.frequency === "weekly" || state.frequency === "biweekly" || state.frequency === "monthly") && (
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-neutral-400">
              Times per {state.frequency === "weekly" ? "week" : state.frequency === "biweekly" ? "fortnight" : "month"}
            </span>
            <input
              type="number"
              min={1}
              value={state.targetPerPeriod}
              onChange={(e) => set("targetPerPeriod", e.target.value)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
        )}
        {state.frequency === "interval" && (
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-neutral-400">Every N days (2 = alternate days)</span>
            <input
              type="number"
              min={2}
              value={state.intervalDays}
              onChange={(e) => set("intervalDays", e.target.value)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
        )}
        <label className="flex-1 flex flex-col gap-1">
          <span className="text-neutral-400">Linked goal (optional)</span>
          <select
            value={state.goalId}
            onChange={(e) => set("goalId", e.target.value)}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
          >
            <option value="">None</option>
            {goals.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.frequency === "custom_days" && (
        <div className="flex flex-col gap-1">
          <span className="text-neutral-400">Which days</span>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                type="button"
                key={i}
                onClick={() =>
                  set("customDays", state.customDays.includes(i) ? state.customDays.filter((d) => d !== i) : [...state.customDays, i].sort())
                }
                className={`px-2 py-1 rounded-md border ${
                  state.customDays.includes(i)
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.frequency === "daily" && (
        <div className="flex gap-2">
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-neutral-400">Deadline (optional) — e.g. finish by 23:59</span>
            <TimeField
              value={state.deadlineTime}
              onChange={(v) => set("deadlineTime", v)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-neutral-400">Target count (optional) — e.g. 8</span>
            <input
              type="number"
              min={1}
              value={state.targetCount}
              onChange={(e) => set("targetCount", e.target.value)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
          <label className="flex-1 flex flex-col gap-1">
            <span className="text-neutral-400">Unit — e.g. glasses</span>
            <input
              value={state.unit}
              onChange={(e) => set("unit", e.target.value)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function scheduleLabel(h: any): string | null {
  if (h.frequency === "custom_days" && h.customDays?.length) {
    return h.customDays.map((d: number) => WEEKDAY_LABELS[d]).join(", ");
  }
  if (h.frequency === "interval" && h.interval_days) {
    return h.interval_days === 2 ? "Every other day" : `Every ${h.interval_days} days`;
  }
  return null;
}

function HabitCard({ habit: h, goals, invalidate }: { habit: any; goals: any[]; invalidate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [form, setForm] = useState<HabitFormState>(() => formStateFromHabit(h));

  const isQuantity = !!h.target_count;
  const urgent = h.deadlineStatus === "due-soon" || h.deadlineStatus === "missed";
  const schedule = scheduleLabel(h);

  const saveEdit = async () => {
    await api.habits.update(h.id, formStateToPayload(form));
    setEditing(false);
    invalidate();
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-neutral-900 dark:border-white p-3 space-y-2">
        <p className="text-sm font-medium">{h.title}</p>
        <HabitOptionsForm state={form} setState={setForm} goals={goals} />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="text-xs px-2.5 py-1 rounded-lg text-neutral-400">
            Cancel
          </button>
          <button onClick={saveEdit} className="text-xs px-2.5 py-1 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        h.deadlineStatus === "missed"
          ? "border-red-300 dark:border-red-900"
          : h.deadlineStatus === "due-soon"
            ? "border-amber-300 dark:border-amber-900"
            : "border-neutral-200 dark:border-neutral-800"
      } ${!h.dueToday ? "opacity-60" : ""}`}
    >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{h.title}</p>
        <p className="text-xs text-neutral-400">
          {!h.dueToday ? (
            <span>Not scheduled today{schedule ? ` · ${schedule}` : ""}</span>
          ) : h.periodProgress ? (
            <span className={h.doneToday ? "text-emerald-600" : ""}>
              {h.periodProgress.completed}/{h.periodProgress.target} {h.periodProgress.label}
            </span>
          ) : (
            <>
              {h.streak > 0 ? `${h.streak} day streak` : "No current streak"} · {h.totalCompletions} total
              {schedule && ` · ${schedule}`}
            </>
          )}
          {h.deadline_time && <span className={urgent ? "text-amber-500 font-medium" : ""}> · by {h.deadline_time}</span>}
          {isQuantity && (
            <span>
              {" "}
              · {h.todayAmount}/{h.target_count} {h.unit ?? ""} today
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {h.dueToday &&
          (isQuantity ? (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await api.habits.log(h.id, 1);
                  invalidate();
                }}
                className={`text-xs px-3 py-1.5 rounded-lg ${
                  h.doneToday ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600" : "border border-neutral-200 dark:border-neutral-800"
                }`}
              >
                +1{h.unit ? ` ${h.unit}` : ""}
              </button>
              {h.todayAmount > 0 && (
                <button
                  onClick={async () => {
                    await api.habits.unlog(h.id);
                    invalidate();
                  }}
                  className="text-xs text-neutral-400 hover:text-red-500"
                >
                  reset today
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={async () => {
                if (h.loggedToday) await api.habits.unlog(h.id);
                else await api.habits.log(h.id);
                invalidate();
              }}
              className={`text-xs px-3 py-1.5 rounded-lg ${
                h.loggedToday ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600" : "border border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {h.loggedToday ? "Logged today" : "Log today"}
            </button>
          ))}
        <button onClick={() => setShowHeatmap((v) => !v)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs">
          streak
        </button>
        <button
          onClick={() => {
            setForm(formStateFromHabit(h));
            setEditing(true);
          }}
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs"
        >
          edit
        </button>
        <button
          onClick={async () => {
            await api.habits.remove(h.id);
            invalidate();
          }}
          className="text-neutral-400 hover:text-red-500 text-xs"
        >
          delete
        </button>
      </div>
    </div>
    {showHeatmap && (
      <Heatmap data={(h.logs ?? []).map((l: any) => ({ date: l.date, count: l.amount }))} weeks={13} />
    )}
    </div>
  );
}

export default function Habits() {
  const qc = useQueryClient();
  const { data: habits = [], isLoading } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const [title, setTitle] = useState("");
  const [form, setForm] = useState<HabitFormState>(emptyFormState());
  const [showOptions, setShowOptions] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["habits"] });

  const create = async () => {
    if (!title.trim()) return;
    await api.habits.create({ title: title.trim(), ...formStateToPayload(form) });
    setTitle("");
    setForm(emptyFormState());
    setShowOptions(false);
    invalidate();
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Habits</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="space-y-2"
      >
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New habit... (e.g. Finish water bottle)"
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-400"
          >
            {showOptions ? "Hide options" : "Deadline / frequency..."}
          </button>
          <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Add</button>
        </div>
        {showOptions && <HabitOptionsForm state={form} setState={setForm} goals={goals} />}
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {habits.map((h: any) => (
          <HabitCard key={h.id} habit={h} goals={goals} invalidate={invalidate} />
        ))}
        {habits.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No habits yet.</p>}
      </div>
    </div>
  );
}
