import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "../api";
import { useToastStore } from "../toastStore";

const PERMISSION_MODES = [
  { value: "suggest", label: "Suggest", desc: "Every AI action needs your approval before it runs." },
  { value: "assist", label: "Assist", desc: "AI acts immediately on everyday actions (default)." },
  { value: "autopilot", label: "Autopilot", desc: "AI acts immediately on everything, including bigger workflows." },
];

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const { data: templates = [] } = useQuery({ queryKey: ["task-templates"], queryFn: api.taskTemplates.list });
  const [local, setLocal] = useState<any>(null);
  const [tplName, setTplName] = useState("");
  const [tplTitle, setTplTitle] = useState("");
  const [tplSubtasks, setTplSubtasks] = useState("");

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const save = async (patch: Record<string, unknown>) => {
    setLocal((l: any) => ({ ...l, ...patch }));
    await api.settings.update(patch);
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast("Settings saved");
  };

  if (!local) return <div className="p-8 text-sm text-neutral-400">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">General</h2>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <span className="text-sm">Default view on launch</span>
          <select
            value={local.defaultView}
            onChange={(e) => save({ defaultView: e.target.value })}
            className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1 text-sm"
          >
            <option value="today">Today</option>
            <option value="inbox">Inbox</option>
            <option value="upcoming">Upcoming</option>
            <option value="calendar">Calendar</option>
          </select>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <span className="text-sm">Working hours</span>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="time"
              value={local.workingHoursStart}
              onChange={(e) => save({ workingHoursStart: e.target.value })}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1"
            />
            <span className="text-neutral-400">to</span>
            <input
              type="time"
              value={local.workingHoursEnd}
              onChange={(e) => save({ workingHoursEnd: e.target.value })}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1"
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <span className="text-sm">Long break every N pomodoros</span>
          <input
            type="number"
            min={2}
            max={8}
            value={local.pomodoroLongBreakEvery}
            onChange={(e) => save({ pomodoroLongBreakEvery: Number(e.target.value) })}
            className="w-16 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1 text-sm"
          />
        </div>
        <label className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 cursor-pointer">
          <span className="text-sm">Notify me about due/overdue tasks</span>
          <input
            type="checkbox"
            checked={local.notifyDueTasks}
            onChange={(e) => save({ notifyDueTasks: e.target.checked })}
          />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">AI operator permission mode</h2>
        <div className="space-y-2">
          {PERMISSION_MODES.map((m) => (
            <label
              key={m.value}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                local.aiPermissionMode === m.value ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <input
                type="radio"
                name="aiPermissionMode"
                checked={local.aiPermissionMode === m.value}
                onChange={() => save({ aiPermissionMode: m.value })}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-neutral-400">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Task templates</h2>
        <p className="text-xs text-neutral-400">
          Reusable task shapes — pick one from the quick-add modal instead of retyping the same task and subtasks.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!tplName.trim() || !tplTitle.trim()) return;
            await api.taskTemplates.create({
              name: tplName.trim(),
              title: tplTitle.trim(),
              subtasks: tplSubtasks.split(",").map((s) => s.trim()).filter(Boolean),
            });
            setTplName("");
            setTplTitle("");
            setTplSubtasks("");
            qc.invalidateQueries({ queryKey: ["task-templates"] });
            toast("Template saved");
          }}
          className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
        >
          <input
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="Template name (e.g. Weekly report)"
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm outline-none"
          />
          <input
            value={tplTitle}
            onChange={(e) => setTplTitle(e.target.value)}
            placeholder="Task title"
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm outline-none"
          />
          <input
            value={tplSubtasks}
            onChange={(e) => setTplSubtasks(e.target.value)}
            placeholder="Subtasks, comma separated (optional)"
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm outline-none"
          />
          <button className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium">
            Save template
          </button>
        </form>
        <div className="space-y-1.5">
          {templates.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
              <span>
                {t.name} <span className="text-neutral-400">— {t.title}</span>
              </span>
              <button
                onClick={async () => {
                  await api.taskTemplates.remove(t.id);
                  qc.invalidateQueries({ queryKey: ["task-templates"] });
                }}
                className="text-xs text-neutral-400 hover:text-red-500"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
