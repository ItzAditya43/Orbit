import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

const TRIGGERS = ["task_completed", "task_overdue", "focus_ended"];
const ACTIONS = ["create_task", "notify", "webhook", "reschedule", "start_timer"];

export default function Automations() {
  const qc = useQueryClient();
  const { data: automations = [], isLoading } = useQuery({ queryKey: ["automations"], queryFn: api.automations.list });
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications.list });
  const { data: runs = [] } = useQuery({ queryKey: ["automations", "runs"], queryFn: api.automations.runs });
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState(TRIGGERS[0]);
  const [actionType, setActionType] = useState(ACTIONS[0]);
  const [message, setMessage] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["automations"] });

  const create = async () => {
    if (!name.trim()) return;
    const config =
      actionType === "notify"
        ? { message }
        : actionType === "create_task"
          ? { title: message }
          : actionType === "webhook"
            ? { url: message }
            : actionType === "reschedule"
              ? { offsetDays: Number(message) || 1 }
              : {};
    await api.automations.create({ name: name.trim(), triggerType, actionType, config });
    setName("");
    setMessage("");
    invalidate();
  };

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-8">
      <h1 className="text-xl font-semibold">Automations</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Automation name"
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-2 text-sm">
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>
                when {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-2 text-sm">
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                then {a.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        {actionType !== "start_timer" && (
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              actionType === "webhook"
                ? "Webhook URL"
                : actionType === "create_task"
                  ? "New task title (use {taskTitle})"
                  : actionType === "reschedule"
                    ? "Push due date forward by N days (e.g. 1)"
                    : "Notification message (use {taskTitle})"
            }
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
        )}
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Create automation</button>
      </form>

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {automations.map((a: any) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-sm">
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-neutral-400">
                when {a.trigger_type.replace(/_/g, " ")} → {a.action_type.replace(/_/g, " ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await api.automations.setEnabled(a.id, !a.is_enabled);
                  invalidate();
                }}
                className={`text-xs px-2 py-1 rounded-md ${a.is_enabled ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600" : "border border-neutral-200 dark:border-neutral-800 text-neutral-400"}`}
              >
                {a.is_enabled ? "enabled" : "disabled"}
              </button>
              <button
                onClick={async () => {
                  await api.automations.remove(a.id);
                  invalidate();
                }}
                className="text-xs text-neutral-400 hover:text-red-500"
              >
                delete
              </button>
            </div>
          </div>
        ))}
        {automations.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No automations yet.</p>}
      </div>

      {runs.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Run history</p>
          {runs.slice(0, 15).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
              <span>
                <span className="font-medium">{r.automation_name}</span>{" "}
                <span className={r.result === "ok" ? "text-emerald-500" : "text-red-500"}>{r.result}</span>
              </span>
              <span className="text-neutral-400">{new Date(r.ran_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recent notifications</p>
          {notifications.slice(0, 10).map((n: any) => (
            <div key={n.id} className="text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
              {n.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
