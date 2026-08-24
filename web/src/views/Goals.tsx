import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { CheckIcon, XIcon } from "../icons";

const HORIZONS = ["life", "annual", "semester", "monthly", "weekly", "daily"];

function GoalCard({ goal, invalidate }: { goal: any; invalidate: () => void }) {
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const milestones = goal.milestones ?? [];

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{goal.title}</span>
          {(goal.tags ?? []).map((t: any) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0">
              {t.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase text-neutral-400">{goal.horizon}</span>
          <button
            onClick={async () => {
              await api.goals.remove(goal.id);
              invalidate();
            }}
            className="text-neutral-400 hover:text-red-500 text-xs"
          >
            delete
          </button>
        </div>
      </div>

      {milestones.length === 0 ? (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(goal.progress * 100)}
            onChange={async (e) => {
              await api.goals.update(goal.id, { progress: Number(e.target.value) / 100 });
              invalidate();
            }}
            className="flex-1"
          />
          <span className="text-xs text-neutral-400 w-10 text-right">{Math.round(goal.progress * 100)}%</span>
        </div>
      ) : (
        <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(goal.progress * 100)}%` }} />
        </div>
      )}

      <div className="space-y-1 pt-1">
        {milestones.map((m: any) => (
          <div key={m.id} className="flex items-center gap-2 group">
            <button
              onClick={async () => {
                await api.goals.updateMilestone(goal.id, m.id, { isDone: !m.is_done });
                invalidate();
              }}
              className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                m.is_done ? "bg-emerald-500 border-emerald-500" : "border-neutral-300 dark:border-neutral-600"
              }`}
            >
              {m.is_done && <CheckIcon size={9} className="text-white" strokeWidth={2.5} />}
            </button>
            <span className={`flex-1 text-sm ${m.is_done ? "line-through text-neutral-400" : ""}`}>{m.title}</span>
            <button
              onClick={async () => {
                await api.goals.removeMilestone(goal.id, m.id);
                invalidate();
              }}
              className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500"
            >
              <XIcon size={12} />
            </button>
          </div>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!milestoneTitle.trim()) return;
            await api.goals.addMilestone(goal.id, milestoneTitle.trim());
            setMilestoneTitle("");
            invalidate();
          }}
        >
          <input
            value={milestoneTitle}
            onChange={(e) => setMilestoneTitle(e.target.value)}
            placeholder="+ Add milestone"
            className="w-full text-sm bg-transparent outline-none text-neutral-500 placeholder:text-neutral-400 py-0.5"
          />
        </form>
      </div>

      {(goal.habits ?? []).length > 0 && (
        <div className="pt-1 flex flex-wrap gap-1.5">
          {goal.habits.map((h: any) => (
            <span key={h.id} className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
              {h.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Goals() {
  const qc = useQueryClient();
  const { data: goals = [], isLoading } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState("monthly");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["goals"] });

  const create = async () => {
    if (!title.trim()) return;
    await api.goals.create({ title: title.trim(), horizon });
    setTitle("");
    invalidate();
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Goals</h1>
      <p className="text-sm text-neutral-400">Goal → Project → Task → Session.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New goal..."
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <select
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-2 text-sm"
        >
          {HORIZONS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Add</button>
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {goals.map((g: any) => (
          <GoalCard key={g.id} goal={g} invalidate={invalidate} />
        ))}
        {goals.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No goals yet.</p>}
      </div>
    </div>
  );
}
