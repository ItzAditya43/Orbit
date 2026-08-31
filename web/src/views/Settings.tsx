import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "../api";
import { useToastStore } from "../toastStore";
import { TimeField } from "../components/TimeField";

function DevicesSection() {
  const qc = useQueryClient();
  const { data: device } = useQuery({ queryKey: ["device"], queryFn: api.device.info });
  const { data: paired = [] } = useQuery({ queryKey: ["device", "paired"], queryFn: api.device.paired });
  const [pairing, setPairing] = useState<{ token: string; expiresAt: number } | null>(null);

  const startPairing = async () => {
    const res = await api.device.startPairing();
    setPairing({ token: res.token, expiresAt: res.expiresAt });
    setTimeout(() => setPairing((p) => (p?.token === res.token ? null : p)), res.expiresAt - Date.now());
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Devices</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Foundation for future device pairing — this device now has a stable identity, but there's no mobile app yet to
          actually pair with, so nothing syncs beyond this machine.
        </p>
      </div>
      {device && (
        <div className="text-xs px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1">
          <p>
            <span className="text-neutral-400">This device: </span>
            {device.deviceName}
          </p>
          <p className="text-neutral-400 truncate">Public key: {device.publicKey.replace(/\n/g, "").slice(0, 60)}...</p>
        </div>
      )}
      <button onClick={startPairing} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
        Generate pairing code
      </button>
      {pairing && (
        <div className="text-xs px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1">
          <p className="text-neutral-400">Pairing token (expires in 60s) — nothing can scan this yet:</p>
          <p className="font-mono break-all">{pairing.token}</p>
        </div>
      )}
      {paired.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Paired devices</p>
          {paired.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
              <span>{d.device_name}</span>
              <button
                onClick={async () => {
                  await api.device.removePaired(d.id);
                  qc.invalidateQueries({ queryKey: ["device", "paired"] });
                }}
                className="text-neutral-400 hover:text-red-500"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AiProviderSection({ local, save }: { local: any; save: (patch: Record<string, unknown>) => void }) {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; model?: string } | null>(null);
  const provider = local.aiProvider ?? "local";

  const check = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const s = await api.ai.status();
      setStatus({ ok: s.ollamaAvailable, model: s.ollamaModel });
    } catch {
      setStatus({ ok: false });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">AI model</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Powers the chat command bar (⌘J), subtask suggestions, and AI review summaries. Both options are Ollama —
          local runs a model on this machine, cloud uses ollama.com's free hosted tier (sign up, no credit card,
          create an API key).
        </p>
      </div>
      <div className="flex gap-2">
        {(["local", "cloud"] as const).map((p) => (
          <button
            key={p}
            onClick={() => save({ aiProvider: p })}
            className={`flex-1 text-sm px-3 py-2 rounded-lg border ${
              provider === p ? "border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900" : "border-neutral-200 dark:border-neutral-800"
            }`}
          >
            {p === "local" ? "Local Ollama" : "Ollama Cloud (free)"}
          </button>
        ))}
      </div>
      {provider === "cloud" && (
        <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <label className="block text-xs text-neutral-400">
            API key (from ollama.com → Settings → Keys)
            <input
              type="password"
              value={local.ollamaCloudApiKey ?? ""}
              onChange={(e) => save({ ollamaCloudApiKey: e.target.value })}
              placeholder="Paste your Ollama Cloud API key"
              className="mt-1 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}
      <label className="block text-xs text-neutral-400">
        Model name{provider === "cloud" ? " (see ollama.com/search, filter by \"cloud\")" : ""}
        <input
          value={local.ollamaModel ?? ""}
          onChange={(e) => save({ ollamaModel: e.target.value })}
          placeholder={provider === "cloud" ? "gpt-oss:20b-cloud" : "llama3.2:1b"}
          className="mt-1 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button onClick={check} disabled={checking} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
          {checking ? "Checking..." : "Test connection"}
        </button>
        {status && (
          <span className={`text-xs ${status.ok ? "text-emerald-500" : "text-red-500"}`}>
            {status.ok ? `Connected — using ${status.model}` : "Couldn't reach it — check the key/model/that Ollama is running"}
          </span>
        )}
      </div>
    </section>
  );
}

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
  const { data: backups = [] } = useQuery({ queryKey: ["sync", "backups"], queryFn: api.sync.backups });
  const [local, setLocal] = useState<any>(null);
  const [tplName, setTplName] = useState("");
  const [tplTitle, setTplTitle] = useState("");
  const [tplSubtasks, setTplSubtasks] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);

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
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-8">
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
            <TimeField
              value={local.workingHoursStart}
              onChange={(v) => save({ workingHoursStart: v })}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1"
            />
            <span className="text-neutral-400">to</span>
            <TimeField
              value={local.workingHoursEnd}
              onChange={(v) => save({ workingHoursEnd: v })}
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
        <h2 className="text-sm font-medium">Periodic reminders</h2>
        <p className="text-xs text-neutral-400 -mt-1">
          A recurring nudge to check your Board/to-dos, sent as a real desktop notification (not just the bell here) —
          fires on this interval while the app is running, on top of anything else you get notified about.
        </p>
        <label className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 cursor-pointer">
          <span className="text-sm">Enable periodic reminder</span>
          <input
            type="checkbox"
            checked={!!local.periodicReminderEnabled}
            onChange={(e) => save({ periodicReminderEnabled: e.target.checked })}
          />
        </label>
        {local.periodicReminderEnabled && (
          <div className="space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <label className="flex items-center justify-between">
              <span className="text-sm">Every</span>
              <span className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  value={local.periodicReminderIntervalMinutes}
                  onChange={(e) => save({ periodicReminderIntervalMinutes: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-20 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1"
                />
                minutes
              </span>
            </label>
            <label className="block text-xs text-neutral-400">
              Message
              <input
                value={local.periodicReminderMessage ?? ""}
                onChange={(e) => save({ periodicReminderMessage: e.target.value })}
                placeholder="Check your Board and to-dos"
                className="mt-1 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}
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

      <AiProviderSection local={local} save={save} />

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

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Backup & restore</h2>
        <p className="text-xs text-neutral-400">
          A full local backup is written automatically once a day (the last 14 are kept) at{" "}
          <code>server/data/backups/</code>. You can also export/import an encrypted copy manually.
        </p>
        {backups.length > 0 && (
          <div className="space-y-1">
            {backups.slice(0, 5).map((b) => (
              <div key={b.name} className="flex justify-between text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span>{b.name}</span>
                <span className="text-neutral-400">{Math.round(b.sizeBytes / 1024)} KB</span>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <p className="text-xs font-medium">Export encrypted backup</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={exportPassphrase}
              onChange={(e) => setExportPassphrase(e.target.value)}
              placeholder="Passphrase"
              className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm outline-none"
            />
            <button
              onClick={async () => {
                if (exportPassphrase.length < 4) return toast("Passphrase must be at least 4 characters");
                const data = await api.sync.exportEncrypted(exportPassphrase);
                const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.encrypted.json`;
                a.click();
                URL.revokeObjectURL(url);
                setExportPassphrase("");
                toast("Encrypted backup downloaded");
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-medium"
            >
              Export
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <p className="text-xs font-medium">Import encrypted backup</p>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="text-xs text-neutral-400"
          />
          <div className="flex gap-2">
            <input
              type="password"
              value={importPassphrase}
              onChange={(e) => setImportPassphrase(e.target.value)}
              placeholder="Passphrase"
              className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-transparent px-2.5 py-1.5 text-sm outline-none"
            />
            <button
              onClick={async () => {
                if (!importFile || !importPassphrase) return;
                const text = await importFile.text();
                const parsed = JSON.parse(text);
                try {
                  await api.sync.importEncrypted({ passphrase: importPassphrase, salt: parsed.salt, iv: parsed.iv, authTag: parsed.authTag, ciphertext: parsed.ciphertext });
                  qc.invalidateQueries();
                  toast("Backup restored");
                  setImportPassphrase("");
                  setImportFile(null);
                } catch {
                  toast("Wrong passphrase or corrupted file");
                }
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 font-medium"
            >
              Import
            </button>
          </div>
        </div>
      </section>

      <DevicesSection />
    </div>
  );
}
