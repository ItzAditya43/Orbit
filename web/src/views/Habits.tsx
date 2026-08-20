import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

export default function Habits() {
  const qc = useQueryClient();
  const { data: habits = [], isLoading } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const [title, setTitle] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("");
  const [targetCount, setTargetCount] = useState("");
  const [unit, setUnit] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [targetPerPeriod, setTargetPerPeriod] = useState("1");
  const [goalId, setGoalId] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["habits"] });

  const create = async () => {
    if (!title.trim()) return;
    await api.habits.create({
      title: title.trim(),
      frequency,
      targetPerPeriod: frequency !== "daily" ? Number(targetPerPeriod) || 1 : undefined,
      deadlineTime: deadlineTime || undefined,
      targetCount: targetCount ? Number(targetCount) : undefined,
      unit: unit.trim() || undefined,
      goalId: goalId || undefined,
    });
    setTitle("");
    setDeadlineTime("");
    setTargetCount("");
    setUnit("");
    setFrequency("daily");
    setTargetPerPeriod("1");
    setGoalId("");
    setShowOptions(false);
    invalidate();
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
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
            {showOptions ? "Hide options" : "Deadline / target..."}
          </button>
          <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Add</button>
        </div>
        {showOptions && (
          <div className="space-y-2 text-xs">
            <div className="flex gap-2">
              <label className="flex-1 flex flex-col gap-1">
                <span className="text-neutral-400">Frequency</span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly (X times this week)</option>
                  <option value="monthly">Monthly (X times this month)</option>
                </select>
              </label>
              {frequency !== "daily" && (
                <label className="flex-1 flex flex-col gap-1">
                  <span className="text-neutral-400">Times per {frequency === "weekly" ? "week" : "month"}</span>
                  <input
                    type="number"
                    min={1}
                    value={targetPerPeriod}
                    onChange={(e) => setTargetPerPeriod(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
                  />
                </label>
              )}
              <label className="flex-1 flex flex-col gap-1">
                <span className="text-neutral-400">Linked goal (optional)</span>
                <select
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
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
            {frequency === "daily" && (
              <div className="flex gap-2">
                <label className="flex-1 flex flex-col gap-1">
                  <span className="text-neutral-400">Deadline (optional) — e.g. finish by 11:59 PM</span>
                  <input
                    type="time"
                    value={deadlineTime}
                    onChange={(e) => setDeadlineTime(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
                  />
                </label>
                <label className="flex-1 flex flex-col gap-1">
                  <span className="text-neutral-400">Target count (optional) — e.g. 8</span>
                  <input
                    type="number"
                    min={1}
                    value={targetCount}
                    onChange={(e) => setTargetCount(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
                  />
                </label>
                <label className="flex-1 flex flex-col gap-1">
                  <span className="text-neutral-400">Unit — e.g. glasses</span>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5"
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {habits.map((h: any) => {
          const isQuantity = !!h.target_count;
          const urgent = h.deadlineStatus === "due-soon" || h.deadlineStatus === "missed";
          return (
            <div
              key={h.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                h.deadlineStatus === "missed"
                  ? "border-red-300 dark:border-red-900"
                  : h.deadlineStatus === "due-soon"
                    ? "border-amber-300 dark:border-amber-900"
                    : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div>
                <p className="text-sm font-medium">{h.title}</p>
                <p className="text-xs text-neutral-400">
                  {h.periodProgress ? (
                    <span className={h.doneToday ? "text-emerald-600" : ""}>
                      {h.periodProgress.completed}/{h.periodProgress.target} {h.periodProgress.label}
                    </span>
                  ) : (
                    <>{h.streak > 0 ? `${h.streak} day streak` : "No current streak"} · {h.totalCompletions} total</>
                  )}
                  {h.deadline_time && (
                    <span className={urgent ? "text-amber-500 font-medium" : ""}> · by {h.deadline_time}</span>
                  )}
                  {isQuantity && (
                    <span>
                      {" "}
                      · {h.todayAmount}/{h.target_count} {h.unit ?? ""} today
                    </span>
                  )}
                </p>
              </div>
              {isQuantity ? (
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
              )}
              <button
                onClick={async () => {
                  await api.habits.remove(h.id);
                  invalidate();
                }}
                className="ml-2 text-neutral-400 hover:text-red-500 text-xs shrink-0"
              >
                delete
              </button>
            </div>
          );
        })}
        {habits.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No habits yet.</p>}
      </div>
    </div>
  );
}
