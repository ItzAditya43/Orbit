import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, type Priority } from "../api";
import { useQuickAddStore } from "../quickAddStore";
import { useToastStore } from "../toastStore";
import { PRIORITIES, PRIORITY_META } from "../priority";
import { extractDate } from "../nlpDate";
import { parseTaskLine } from "../taskLineParser";

export function QuickAddModal() {
  const { isOpen, close } = useQuickAddStore();
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [manualDue, setManualDue] = useState<"" | "today" | "tomorrow">("");
  const [duplicates, setDuplicates] = useState<{ id: string; title: string }[]>([]);
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: templates = [] } = useQuery({ queryKey: ["task-templates"], queryFn: api.taskTemplates.list, enabled: isOpen });
  const { data: boundaries = [] } = useQuery({ queryKey: ["boundaries"], queryFn: api.boundaries.list, enabled: isOpen });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list, enabled: isOpen });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.tags.list, enabled: isOpen });

  const lines = text.split("\n").filter((l) => l.trim());
  const isBulk = lines.length > 1;

  const useTemplate = async (templateId: string) => {
    if (!templateId) return;
    await api.taskTemplates.instantiate(templateId);
    qc.invalidateQueries({ queryKey: ["tasks"] });
    toast("Task created from template");
    close();
  };

  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 0);
    else {
      setText("");
      setPriority("none");
      setManualDue("");
      setDuplicates([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  // Debounced duplicate check for single-line entries.
  useEffect(() => {
    if (isBulk || !text.trim()) {
      setDuplicates([]);
      return;
    }
    const t = setTimeout(async () => {
      const matches = await api.tasks.checkDuplicate(text.trim());
      setDuplicates(matches);
    }, 400);
    return () => clearTimeout(t);
  }, [text, isBulk]);

  const nlpPreview = useMemo(() => {
    if (isBulk || !text.trim()) return null;
    return extractDate(text);
  }, [text, isBulk]);

  if (!isOpen) return null;

  const manualDueDate =
    manualDue === "today"
      ? new Date().toISOString().slice(0, 10)
      : manualDue === "tomorrow"
        ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        : undefined;

  const checkBoundary = async (t: string) => {
    if (boundaries.length === 0) return;
    const scope = await api.boundaries.check(t);
    if (!scope.inScope) {
      toast(`"${t}" is outside your active Priority boundaries`, {
        actionLabel: "Review",
        onAction: () => navigate("/boundaries"),
      });
    }
  };

  const submit = async () => {
    if (!text.trim()) return;

    if (isBulk) {
      for (const line of lines) {
        const parsed = parseTaskLine(line, projects, tags);
        if (!parsed.title) continue;
        await api.tasks.create({
          title: parsed.title,
          projectId: parsed.projectId,
          tagIds: parsed.tagIds.length ? parsed.tagIds : undefined,
          dueDate: parsed.dueDate,
          isInbox: !parsed.projectId && !parsed.dueDate,
        });
      }
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast(`Added ${lines.length} tasks`);
      close();
      return;
    }

    const parsed = parseTaskLine(text.trim(), projects, tags);
    const dueDate = parsed.dueDate ?? manualDueDate;
    const title = parsed.title || text.trim();
    await api.tasks.create({
      title,
      priority,
      dueDate,
      projectId: parsed.projectId,
      tagIds: parsed.tagIds.length ? parsed.tagIds : undefined,
      isInbox: !dueDate && !parsed.projectId,
    });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    close();
    await checkBoundary(title);
    toast(`Added "${title}"`);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-32 z-50" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden animate-pop-in"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="p-4 space-y-3"
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="What do you need to do? Try #Project @tag next tuesday — or paste multiple lines to add them all."
            rows={isBulk ? Math.min(lines.length + 1, 8) : 1}
            className="w-full text-base bg-transparent outline-none placeholder:text-neutral-400 resize-none"
          />

          {isBulk && <p className="text-xs text-neutral-400">{lines.length} tasks will be created, one per line.</p>}

          {!isBulk && nlpPreview && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Detected date: {nlpPreview.date}</p>
          )}

          {!isBulk && duplicates.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Similar to existing task: "{duplicates[0].title}"
            </p>
          )}

          {templates.length > 0 && (
            <select
              onChange={(e) => useTemplate(e.target.value)}
              defaultValue=""
              className="text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1 text-neutral-500 outline-none"
            >
              <option value="" disabled>
                Or use a template...
              </option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {!isBulk && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {(["", "today", "tomorrow"] as const).map((d) => (
                  <button
                    type="button"
                    key={d || "none"}
                    onClick={() => setManualDue(d)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      manualDue === d
                        ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                        : "border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400"
                    }`}
                  >
                    {d === "" ? "No date" : d === "today" ? "Today" : "Tomorrow"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {PRIORITIES.filter((p) => p !== "none").map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPriority(priority === p ? "none" : p)}
                    title={PRIORITY_META[p].label}
                    className={`h-5 w-5 rounded-full ${PRIORITY_META[p].dot} ${
                      priority === p ? "ring-2 ring-offset-2 ring-neutral-400 dark:ring-offset-neutral-900" : "opacity-40 hover:opacity-80"
                    } transition-all`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} className="text-xs px-3 py-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium"
            >
              {isBulk ? `Add ${lines.length} tasks` : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
