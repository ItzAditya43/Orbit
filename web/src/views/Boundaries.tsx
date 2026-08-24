import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

// Just the starting point shown before you've added anything of your own — categories are
// otherwise free text now (type any name in the field below), not locked to this set.
const DEFAULT_CATEGORIES = ["main", "hobby", "game", "restricted"];

export default function Boundaries() {
  const qc = useQueryClient();
  const { data: boundaries = [], isLoading } = useQuery({ queryKey: ["boundaries"], queryFn: () => api.boundaries.list() });
  const { data: allBoundaries = [] } = useQuery({ queryKey: ["boundaries", "all"], queryFn: () => api.boundaries.list(true) });
  const { data: reviewItems = [] } = useQuery({ queryKey: ["scope-review"], queryFn: api.scopeReview.list });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [projectId, setProjectId] = useState("");
  const [checkLabel, setCheckLabel] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  const invalidateBoundaries = () => {
    qc.invalidateQueries({ queryKey: ["boundaries"] });
  };
  const invalidateReview = () => qc.invalidateQueries({ queryKey: ["scope-review"] });

  const add = async () => {
    if (!name.trim() || !category.trim()) return;
    await api.boundaries.create({ category: category.trim().toLowerCase(), name: name.trim(), projectId: projectId || undefined });
    setName("");
    setProjectId("");
    invalidateBoundaries();
  };

  const existingCategories = Array.from(new Set(allBoundaries.map((b: any) => b.category)));
  const displayCategories = existingCategories.length > 0 ? existingCategories : DEFAULT_CATEGORIES;

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState("");

  const renameCategory = async (oldCat: string, newCat: string) => {
    if (!newCat.trim() || newCat.trim().toLowerCase() === oldCat) {
      setEditingCategory(null);
      return;
    }
    const items = allBoundaries.filter((b: any) => b.category === oldCat);
    await Promise.all(items.map((b: any) => api.boundaries.update(b.id, { category: newCat.trim().toLowerCase() })));
    setEditingCategory(null);
    invalidateBoundaries();
  };

  const deleteCategory = async (cat: string) => {
    const items = allBoundaries.filter((b: any) => b.category === cat && b.is_active);
    if (items.length > 0 && !confirm(`Remove all ${items.length} item${items.length === 1 ? "" : "s"} in "${cat}"? They'll move to Removed, not be lost.`)) {
      return;
    }
    await Promise.all(items.map((b: any) => api.boundaries.remove(b.id)));
    invalidateBoundaries();
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
    invalidateReview();
  };

  const inactiveBoundaries = allBoundaries.filter((b: any) => !b.is_active);
  const pendingCount = reviewItems.filter((r: any) => r.status === "pending" || r.status === "parked").length;

  const setStatus = async (id: string, status: string) => {
    await api.scopeReview.update(id, { status, reason: reasonDraft[id] });
    invalidateReview();
  };
  const removeReviewItem = async (id: string) => {
    await api.scopeReview.remove(id);
    invalidateReview();
  };
  const allowAndCreateTask = async (r: any) => {
    await api.tasks.create({ title: r.label, isInbox: true });
    await api.scopeReview.update(r.id, { status: "allowed", reason: reasonDraft[r.id] });
    invalidateReview();
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Priority</h1>
        <p className="text-sm text-neutral-400">
          Define the areas you're actually committed to right now (below). When a new idea shows up, check it here —
          if it doesn't match one of those areas, you can park it for later instead of chasing it immediately.
        </p>
        {pendingCount > 0 && (
          <p className="text-xs text-amber-600 mt-1">
            {pendingCount} idea{pendingCount === 1 ? "" : "s"} waiting for review below.
          </p>
        )}
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Your priority areas</p>
            <p className="text-xs text-neutral-400">
              e.g. "main" for your job/studies, "hobby" for stuff you're actively doing for fun, "restricted" for
              things you're deliberately avoiding right now. New ideas get checked against these.
            </p>
          </div>
          {inactiveBoundaries.length > 0 && (
            <button onClick={() => setShowInactive((v) => !v)} className="text-xs text-neutral-400 hover:underline shrink-0">
              {showInactive ? "hide" : "show"} removed ({inactiveBoundaries.length})
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="boundary-categories"
            placeholder="section (e.g. main)"
            className="w-32 shrink-0 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-2 text-sm"
          />
          <datalist id="boundary-categories">
            {displayCategories.map((c: string) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Studies, Drawing, FGO"
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
          {projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-2 text-sm"
              title="Optionally link to a project — its name also counts as a match when checking scope"
            >
              <option value="">No linked project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={add} className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">
            Add
          </button>
        </div>
        {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
        <div className="grid grid-cols-2 gap-2">
          {displayCategories.map((cat: string) => (
            <div key={cat} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
              {editingCategory === cat ? (
                <input
                  autoFocus
                  value={categoryNameDraft}
                  onChange={(e) => setCategoryNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameCategory(cat, categoryNameDraft);
                    else if (e.key === "Escape") setEditingCategory(null);
                  }}
                  onBlur={() => renameCategory(cat, categoryNameDraft)}
                  className="w-full mb-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-1 py-0.5 text-[10px] uppercase"
                />
              ) : (
                <div className="flex items-center justify-between mb-1 group">
                  <button
                    onClick={() => {
                      setEditingCategory(cat);
                      setCategoryNameDraft(cat);
                    }}
                    className="text-[10px] uppercase text-neutral-400 hover:underline"
                  >
                    {cat}
                  </button>
                  <button
                    onClick={() => deleteCategory(cat)}
                    className="text-[9px] text-neutral-300 dark:text-neutral-700 hover:text-red-500 opacity-0 group-hover:opacity-100"
                  >
                    delete section
                  </button>
                </div>
              )}
              {boundaries
                .filter((b: any) => b.category === cat)
                .map((b: any) =>
                  editingId === b.id ? (
                    <div key={b.id} className="flex items-center gap-1 py-0.5">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && editName.trim()) {
                            await api.boundaries.update(b.id, { name: editName.trim() });
                            setEditingId(null);
                            invalidateBoundaries();
                          } else if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 min-w-0 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm"
                      />
                      <button
                        onClick={async () => {
                          if (editName.trim()) await api.boundaries.update(b.id, { name: editName.trim() });
                          setEditingId(null);
                          invalidateBoundaries();
                        }}
                        className="text-xs text-emerald-500 shrink-0"
                      >
                        save
                      </button>
                    </div>
                  ) : (
                    <div key={b.id} className="flex items-center justify-between text-sm py-0.5 group">
                      <button
                        onClick={() => {
                          setEditingId(b.id);
                          setEditName(b.name);
                        }}
                        className="text-left truncate hover:underline flex items-center gap-1"
                      >
                        {b.name}
                        {b.project_id && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-400 shrink-0">
                            {projects.find((p) => p.id === b.project_id)?.name ?? "project"}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={async () => {
                          await api.boundaries.remove(b.id);
                          invalidateBoundaries();
                        }}
                        className="text-neutral-400 hover:text-red-500 text-xs shrink-0"
                      >
                        remove
                      </button>
                    </div>
                  )
                )}
            </div>
          ))}
        </div>

        {showInactive && inactiveBoundaries.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <p className="text-xs uppercase tracking-wide text-neutral-400">Removed</p>
            {inactiveBoundaries.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 opacity-60">
                <span>
                  {b.name} <span className="text-xs text-neutral-400">({b.category})</span>
                </span>
                <button
                  onClick={async () => {
                    await api.boundaries.update(b.id, { isActive: true });
                    invalidateBoundaries();
                  }}
                  className="text-xs text-neutral-400 hover:text-emerald-500"
                >
                  restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Ideas parked for scope review</p>
          {reviewItems.map((r: any) => (
            <div key={r.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span>{r.label}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-md ${
                    r.status === "allowed"
                      ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40"
                      : r.status === "rejected"
                        ? "text-red-500 bg-red-100 dark:bg-red-900/40"
                        : "text-neutral-400"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              {r.reason && <p className="text-xs text-neutral-400">Reason: {r.reason}</p>}
              {(r.status === "pending" || r.status === "parked") && (
                <div className="flex items-center gap-2">
                  <input
                    value={reasonDraft[r.id] ?? ""}
                    onChange={(e) => setReasonDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    placeholder="reason (optional)"
                    className="flex-1 min-w-0 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1 text-xs"
                  />
                  <button
                    onClick={() => allowAndCreateTask(r)}
                    className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-emerald-600 shrink-0"
                    title="Marks it allowed and creates a task for it in your Inbox"
                  >
                    allow → task
                  </button>
                  <button onClick={() => setStatus(r.id, "rejected")} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-red-500 shrink-0">
                    reject
                  </button>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={() => removeReviewItem(r.id)} className="text-xs text-neutral-400 hover:text-red-500">
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
