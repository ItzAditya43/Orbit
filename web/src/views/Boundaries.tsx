import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type AreaStats, type BoundarySection, type ScopeCheck } from "../api";
import { todayISO } from "../dates";
import { useToastStore } from "../toastStore";

const SECTION_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
// An area linked to a project that's had no activity for this long gets flagged as quiet.
const QUIET_AFTER_DAYS = 21;

function formatMinutes(total: number) {
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// What to redo once the user has picked which item makes way in a full section.
type FullSectionPrompt = {
  section: string;
  limit: number;
  items: { id: string; name: string }[];
  incoming: string;
  retry: (replaceId: string) => Promise<void>;
};

export default function Boundaries() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const { data: sections = [], isLoading } = useQuery({ queryKey: ["boundaries", "sections"], queryFn: api.boundaries.sections.list });
  const { data: boundaries = [] } = useQuery({ queryKey: ["boundaries"], queryFn: () => api.boundaries.list() });
  const { data: allBoundaries = [] } = useQuery({ queryKey: ["boundaries", "all"], queryFn: () => api.boundaries.list(true) });
  const { data: stats = [] } = useQuery({ queryKey: ["boundaries", "stats"], queryFn: api.boundaries.stats });
  const { data: reviewItems = [] } = useQuery({ queryKey: ["scope-review"], queryFn: api.scopeReview.list });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newSection, setNewSection] = useState("");
  const [checkLabel, setCheckLabel] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<ScopeCheck | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState({ name: "", maxActive: "" });
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const [fullPrompt, setFullPrompt] = useState<FullSectionPrompt | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  const invalidateBoundaries = () => qc.invalidateQueries({ queryKey: ["boundaries"] });
  const invalidateReview = () => {
    qc.invalidateQueries({ queryKey: ["scope-review"] });
    qc.invalidateQueries({ queryKey: ["review"] });
  };

  const statsById = new Map<string, AreaStats>(stats.map((s) => [s.id, s]));
  const targetSection = category || sections[0]?.name || "";

  // Runs an add/move/restore. If the server answers that the section is at its limit, asks
  // which existing item should make way and then repeats the same action with that choice.
  const withCapacity = async (incoming: string, action: (replaceId?: string) => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.data?.code === "section_full") {
        setFullPrompt({
          section: e.data.section,
          limit: e.data.limit,
          items: e.data.items,
          incoming,
          retry: async (replaceId) => {
            await action(replaceId);
            setFullPrompt(null);
            invalidateBoundaries();
          },
        });
        return false;
      }
      throw e;
    }
    invalidateBoundaries();
    return true;
  };

  const add = async () => {
    if (!name.trim() || !targetSection) return;
    const itemName = name.trim();
    const done = await withCapacity(itemName, (replaceId) =>
      api.boundaries.create({ category: targetSection, name: itemName, projectId: projectId || undefined, replaceId })
    );
    // Cleared either way: if the section was full the pending add is carried by the prompt.
    setName("");
    setProjectId("");
    return done;
  };

  const addSection = async () => {
    if (!newSection.trim()) return;
    try {
      const created = await api.boundaries.sections.create({ name: newSection.trim() });
      setCategory(created.name);
      setNewSection("");
      invalidateBoundaries();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that section");
    }
  };

  const moveItem = (id: string, toSection: string) => {
    const item = boundaries.find((b: any) => b.id === id);
    if (!item || item.category === toSection) return;
    withCapacity(item.name, (replaceId) => api.boundaries.update(id, { category: toSection, replaceId }));
  };

  const restore = (b: any) => {
    withCapacity(b.name, (replaceId) => api.boundaries.update(b.id, { isActive: true, replaceId }));
  };

  const saveItem = async (id: string) => {
    if (editName.trim()) await api.boundaries.update(id, { name: editName.trim(), projectId: editProjectId || null });
    setEditingId(null);
    invalidateBoundaries();
  };

  const updateSection = async (id: string, body: Parameters<typeof api.boundaries.sections.update>[1]) => {
    try {
      await api.boundaries.sections.update(id, body);
      invalidateBoundaries();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update that section");
    }
  };

  const saveSectionDraft = async (section: BoundarySection) => {
    const limit = sectionDraft.maxActive.trim() === "" ? null : Math.max(1, Math.floor(Number(sectionDraft.maxActive)) || 1);
    const body: Parameters<typeof api.boundaries.sections.update>[1] = {};
    if (sectionDraft.name.trim() && sectionDraft.name.trim().toLowerCase() !== section.name) body.name = sectionDraft.name.trim();
    if (limit !== section.max_active) body.maxActive = limit;
    if (Object.keys(body).length) await updateSection(section.id, body);
  };

  const shiftSection = async (index: number, delta: number) => {
    const ids = sections.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await api.boundaries.sections.reorder(ids);
    invalidateBoundaries();
  };

  const deleteSection = async (section: BoundarySection) => {
    if (
      section.active_count > 0 &&
      !confirm(`Delete "${section.name}" and remove its ${section.active_count} item${section.active_count === 1 ? "" : "s"}? They'll move to Removed, not be lost.`)
    ) {
      return;
    }
    await api.boundaries.sections.remove(section.id);
    setEditingSectionId(null);
    if (category === section.name) setCategory("");
    invalidateBoundaries();
  };

  const purge = async (ids: string[], what: string) => {
    if (!confirm(`Permanently delete ${what}? This can't be undone.`)) return;
    await Promise.all(ids.map((id) => api.boundaries.purge(id)));
    invalidateBoundaries();
  };

  const check = async () => {
    if (!checkLabel.trim() || checking) return;
    setChecking(true);
    try {
      setCheckResult(await api.boundaries.check(checkLabel.trim()));
    } finally {
      setChecking(false);
    }
  };

  const parkForLater = async () => {
    await api.scopeReview.create({ label: checkLabel.trim(), kind: "idea" });
    setCheckLabel("");
    setCheckResult(null);
    invalidateReview();
  };

  const inactiveBoundaries = allBoundaries.filter((b: any) => !b.is_active);
  const pendingCount = reviewItems.filter((r: any) => r.status === "pending" || r.status === "parked").length;
  const today = todayISO();

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

  const inputClass = "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm";

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
          className="flex gap-2"
        >
          <input
            value={checkLabel}
            onChange={(e) => {
              setCheckLabel(e.target.value);
              setCheckResult(null);
            }}
            placeholder="e.g. Learn a new instrument"
            className={`flex-1 px-3 py-2 ${inputClass}`}
          />
          <button disabled={checking} className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm disabled:opacity-50">
            {checking ? "Checking..." : "Check"}
          </button>
        </form>
        {checkResult && (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-sm space-y-2">
            {checkResult.restricted ? (
              <p className="text-red-500">
                Careful — this looks like {checkResult.restrictedBoundaries.map((b: any) => b.name).join(", ")}, which is something you're
                deliberately avoiding right now.
              </p>
            ) : checkResult.inScope ? (
              <p className="text-emerald-600">In scope — matches: {checkResult.matchedBoundaries.map((b: any) => b.name).join(", ")}</p>
            ) : (
              <p className="text-amber-600">Outside your current active boundaries.</p>
            )}
            {checkResult.via === "ai" && checkResult.reason && <p className="text-xs text-neutral-400">AI: {checkResult.reason}</p>}
            {!checkResult.inScope && (
              <div className="flex gap-2">
                <button onClick={parkForLater} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
                  Park for later
                </button>
                <button onClick={() => setCheckResult(null)} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800">
                  {checkResult.restricted ? "Dismiss" : "Continue anyway"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Your priority areas</p>
            <p className="text-xs text-neutral-400">
              Group them into sections — e.g. "main" for your job/studies, "hobby" for what you're doing for fun. Give a section a
              limit to cap how many things you take on at once, or mark it as avoiding. Drag an item to move it between sections.
            </p>
          </div>
          {inactiveBoundaries.length > 0 && (
            <button onClick={() => setShowInactive((v) => !v)} className="text-xs text-neutral-400 hover:underline shrink-0">
              {showInactive ? "hide" : "show"} removed ({inactiveBoundaries.length})
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex gap-2"
        >
          <select
            value={targetSection}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Section"
            className={`w-32 shrink-0 px-2 py-2 ${inputClass}`}
          >
            {sections.length === 0 && <option value="">no sections yet</option>}
            {sections.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Studies, Drawing, FGO"
            className={`flex-1 min-w-0 px-3 py-2 ${inputClass}`}
          />
          {projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={`px-2 py-2 ${inputClass}`}
              title="Optionally link to a project — its name also counts as a match when checking scope, and its tasks and time show up here"
            >
              <option value="">No linked project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button disabled={!targetSection} className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm disabled:opacity-40">
            Add
          </button>
        </form>

        {fullPrompt && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm space-y-2">
            <p>
              <span className="font-medium">"{fullPrompt.section}" is full</span> ({fullPrompt.items.length}/{fullPrompt.limit}). To make room for{" "}
              <span className="font-medium">{fullPrompt.incoming}</span>, which one are you dropping?
            </p>
            <div className="flex flex-wrap gap-2">
              {fullPrompt.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => fullPrompt.retry(item.id)}
                  className="text-xs px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-red-400 hover:text-red-500"
                >
                  drop {item.name}
                </button>
              ))}
              <button onClick={() => setFullPrompt(null)} className="text-xs px-2 py-1 text-neutral-500 hover:underline">
                never mind
              </button>
            </div>
          </div>
        )}

        {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
        <div className="grid grid-cols-2 gap-2">
          {sections.map((section, index) => {
            const items = boundaries.filter((b: any) => b.category === section.name);
            const editing = editingSectionId === section.id;
            return (
              <div
                key={section.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverSection(section.name);
                }}
                onDragLeave={() => setDragOverSection((s) => (s === section.name ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSection(null);
                  const id = e.dataTransfer.getData("text/orbit-boundary");
                  if (id) moveItem(id, section.name);
                }}
                className={`rounded-lg border p-3 transition-colors ${
                  dragOverSection === section.name ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"
                }`}
                style={section.color ? { borderLeftColor: section.color, borderLeftWidth: 3 } : undefined}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] uppercase text-neutral-400 truncate">{section.name}</span>
                    {section.max_active != null && (
                      <span
                        className={`text-[9px] px-1 rounded ${
                          items.length >= section.max_active ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                        }`}
                        title={`Limit of ${section.max_active} active at a time`}
                      >
                        {items.length}/{section.max_active}
                      </span>
                    )}
                    {!!section.is_restricted && (
                      <span className="text-[9px] px-1 rounded bg-red-100 dark:bg-red-900/40 text-red-500" title="Matching something here is a warning, not a priority">
                        avoiding
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditingSectionId(editing ? null : section.id);
                      setSectionDraft({ name: section.name, maxActive: section.max_active != null ? String(section.max_active) : "" });
                    }}
                    className="text-[10px] text-neutral-400 hover:underline shrink-0"
                  >
                    {editing ? "done" : "edit"}
                  </button>
                </div>

                {editing && (
                  <div className="mb-2 space-y-2 rounded-md bg-neutral-50 dark:bg-neutral-900/60 p-2 text-xs">
                    <div className="flex gap-2">
                      <input
                        value={sectionDraft.name}
                        onChange={(e) => setSectionDraft((d) => ({ ...d, name: e.target.value }))}
                        onBlur={() => saveSectionDraft(section)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        aria-label="Section name"
                        className={`flex-1 min-w-0 px-1.5 py-1 text-xs ${inputClass}`}
                      />
                      <input
                        value={sectionDraft.maxActive}
                        onChange={(e) => setSectionDraft((d) => ({ ...d, maxActive: e.target.value.replace(/\D/g, "") }))}
                        onBlur={() => saveSectionDraft(section)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        inputMode="numeric"
                        placeholder="no limit"
                        aria-label="Limit"
                        title="Most items allowed here at once — leave empty for no limit"
                        className={`w-20 px-1.5 py-1 text-xs ${inputClass}`}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {SECTION_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateSection(section.id, { color: section.color === c ? null : c })}
                          aria-label={`Colour ${c}`}
                          className={`h-4 w-4 rounded-full ${section.color === c ? "ring-2 ring-offset-1 ring-neutral-400 dark:ring-offset-neutral-900" : ""}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 text-neutral-500">
                      <input
                        type="checkbox"
                        checked={!!section.is_restricted}
                        onChange={(e) => updateSection(section.id, { isRestricted: e.target.checked })}
                      />
                      Things I'm avoiding (a match here is a warning)
                    </label>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-neutral-400">
                        <button onClick={() => shiftSection(index, -1)} disabled={index === 0} className="hover:underline disabled:opacity-30">
                          ← move earlier
                        </button>
                        <button onClick={() => shiftSection(index, 1)} disabled={index === sections.length - 1} className="hover:underline disabled:opacity-30">
                          move later →
                        </button>
                      </div>
                      <button onClick={() => deleteSection(section)} className="text-neutral-400 hover:text-red-500">
                        delete section
                      </button>
                    </div>
                  </div>
                )}

                {items.length === 0 && <p className="text-xs text-neutral-300 dark:text-neutral-700 py-0.5">empty — add or drag something here</p>}
                {items.map((b: any) => {
                  const s = statsById.get(b.id);
                  return editingId === b.id ? (
                    <form
                      key={b.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveItem(b.id);
                      }}
                      className="flex items-center gap-1 py-0.5"
                    >
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                        className={`flex-1 min-w-0 px-1.5 py-0.5 ${inputClass}`}
                      />
                      {projects.length > 0 && (
                        <select
                          value={editProjectId}
                          onChange={(e) => setEditProjectId(e.target.value)}
                          aria-label="Linked project"
                          className={`max-w-[7rem] px-1 py-0.5 text-xs ${inputClass}`}
                        >
                          <option value="">no project</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="text-xs text-emerald-500 shrink-0">save</button>
                    </form>
                  ) : (
                    <div
                      key={b.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/orbit-boundary", b.id)}
                      className="py-0.5 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <button
                          onClick={() => {
                            setEditingId(b.id);
                            setEditName(b.name);
                            setEditProjectId(b.project_id ?? "");
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
                      {s && (
                        <p className="text-[11px] text-neutral-400">
                          {s.openTasks} open · {s.completedThisWeek} done · {formatMinutes(s.minutesThisWeek)} this week
                          {s.idleDays >= QUIET_AFTER_DAYS && !section.is_restricted && <span className="text-amber-600"> · quiet for {s.idleDays}d</span>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addSection();
          }}
          className="flex gap-2"
        >
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="New section name..."
            className={`w-48 px-2 py-1.5 text-xs ${inputClass}`}
          />
          <button className="px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs">Add section</button>
        </form>

        {showInactive && inactiveBoundaries.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-neutral-400">Removed</p>
              <button
                onClick={() =>
                  purge(
                    inactiveBoundaries.map((b: any) => b.id),
                    `all ${inactiveBoundaries.length} removed item${inactiveBoundaries.length === 1 ? "" : "s"}`
                  )
                }
                className="text-xs text-neutral-400 hover:text-red-500"
              >
                delete all forever
              </button>
            </div>
            {inactiveBoundaries.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 opacity-60">
                <span>
                  {b.name} <span className="text-xs text-neutral-400">({b.category})</span>
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => restore(b)} className="text-xs text-neutral-400 hover:text-emerald-500">
                    restore
                  </button>
                  <button onClick={() => purge([b.id], `"${b.name}"`)} className="text-xs text-neutral-400 hover:text-red-500">
                    delete forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Ideas parked for scope review</p>
          {reviewItems.map((r: any) => {
            const open = r.status === "pending" || r.status === "parked";
            const due = open && r.revisit_at && r.revisit_at <= today;
            return (
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
                {open && (
                  <>
                    <label className={`flex items-center gap-2 text-xs ${due ? "text-amber-600" : "text-neutral-400"}`}>
                      {due ? "Time to decide — revisit date was" : "Revisit on"}
                      <input
                        type="date"
                        value={r.revisit_at ?? ""}
                        onChange={async (e) => {
                          await api.scopeReview.update(r.id, { revisitAt: e.target.value || null });
                          invalidateReview();
                        }}
                        className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-1.5 py-0.5"
                      />
                    </label>
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
                  </>
                )}
                <div className="flex justify-end">
                  <button onClick={() => removeReviewItem(r.id)} className="text-xs text-neutral-400 hover:text-red-500">
                    delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
