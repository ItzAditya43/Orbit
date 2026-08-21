import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

const CATEGORIES = ["main", "hobby", "game", "restricted"];

export default function Boundaries() {
  const qc = useQueryClient();
  const { data: boundaries = [], isLoading } = useQuery({ queryKey: ["boundaries"], queryFn: api.boundaries.list });
  const { data: reviewItems = [] } = useQuery({ queryKey: ["scope-review"], queryFn: api.scopeReview.list });
  const [name, setName] = useState("");
  const [category, setCategory] = useState("main");
  const [checkLabel, setCheckLabel] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["boundaries"] });

  const add = async () => {
    if (!name.trim()) return;
    await api.boundaries.create({ category, name: name.trim() });
    setName("");
    invalidate();
  };

  const check = async () => {
    if (!checkLabel.trim()) return;
    const result = await api.boundaries.check(checkLabel.trim());
    setCheckResult(result);
  };

  const parkForLater = async () => {
    await api.scopeReview.create({ label: checkLabel.trim(), kind: "idea" });
    setCheckLabel("");
    setCheckResult(null);
    qc.invalidateQueries({ queryKey: ["scope-review"] });
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Priority</h1>
        <p className="text-sm text-neutral-400">
          Define the areas you're actually committed to right now (below). When a new idea shows up, check it here —
          if it doesn't match one of those areas, you can park it for later instead of chasing it immediately.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Got a new idea? Check if it's actually a priority right now</p>
        <div className="flex gap-2">
          <input
            value={checkLabel}
            onChange={(e) => setCheckLabel(e.target.value)}
            placeholder="e.g. Learn a new instrument"
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
          <button onClick={check} className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
            Check
          </button>
        </div>
        {checkResult && (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-sm space-y-2">
            {checkResult.inScope ? (
              <p className="text-emerald-600">In scope — matches: {checkResult.matchedBoundaries.map((b: any) => b.name).join(", ")}</p>
            ) : (
              <>
                <p className="text-amber-600">Outside your current active boundaries.</p>
                <div className="flex gap-2">
                  <button onClick={parkForLater} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
                    Park for later
                  </button>
                  <button onClick={() => setCheckResult(null)} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
                    Continue anyway
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Your priority areas</p>
          <p className="text-xs text-neutral-400">
            e.g. "main" for your job/studies, "hobby" for stuff you're actively doing for fun, "restricted" for
            things you're deliberately avoiding right now. New ideas get checked against these.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Studies, Drawing, FGO"
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
          <button onClick={add} className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">
            Add
          </button>
        </div>
        {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
              <p className="text-[10px] uppercase text-neutral-400 mb-1">{cat}</p>
              {boundaries
                .filter((b: any) => b.category === cat)
                .map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between text-sm py-0.5">
                    <span>{b.name}</span>
                    <button
                      onClick={async () => {
                        await api.boundaries.remove(b.id);
                        invalidate();
                      }}
                      className="text-neutral-400 hover:text-red-500 text-xs"
                    >
                      remove
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      {reviewItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Ideas parked for scope review</p>
          {reviewItems.map((r: any) => (
            <div key={r.id} className="flex justify-between text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
              <span>{r.label}</span>
              <span className="text-xs text-neutral-400">{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
