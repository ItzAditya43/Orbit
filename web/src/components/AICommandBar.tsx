import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useToastStore } from "../toastStore";

export function AICommandBar() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.push);

  const { data: pendingActions = [] } = useQuery({
    queryKey: ["ai-actions", "pending"],
    queryFn: api.ai.pendingActions,
    refetchInterval: open ? 4000 : false,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Fired by the Tauri Linux tray icon / global hotkey (Ctrl+Shift+Space) — see
  // src-tauri/src/lib.rs. No-op when running as a plain web app (no __TAURI__ present).
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("quick-capture-requested", () => setOpen(true)).then((fn) => {
        unlisten = fn;
      });
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const invalidateAfterAction = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["focus-sessions"] });
    qc.invalidateQueries({ queryKey: ["ai-actions"] });
  };

  const send = async () => {
    if (!text.trim() || busy) return;
    const userText = text.trim();
    setLog((l) => [...l, { role: "user", text: userText }]);
    setText("");
    setBusy(true);
    try {
      const history = log.map((m) => ({ role: m.role, content: m.text }));
      const res = await api.ai.command(userText, history);
      setLog((l) => [...l, { role: "assistant", text: res.message ?? JSON.stringify(res.result) }]);
      invalidateAfterAction();
    } catch {
      setLog((l) => [...l, { role: "assistant", text: "Something went wrong reaching the AI gateway." }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2.5 text-sm shadow-lg"
      >
        Ask / Command (⌘J)
        {pendingActions.length > 0 && (
          <span className="ml-2 inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-400 text-neutral-900 text-[10px] font-medium">
            {pendingActions.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-24 z-50" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden"
      >
        {pendingActions.length > 0 && (
          <div className="border-b border-neutral-200 dark:border-neutral-800 p-3 space-y-2 bg-amber-50/60 dark:bg-amber-950/20">
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              Waiting for approval — AI is set to "Suggest" mode in Settings
            </p>
            {pendingActions.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {a.tool_name.replace(/_/g, " ")}: {JSON.stringify(JSON.parse(a.args_json || "{}"))}
                </span>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        await api.ai.approveAction(a.id);
                      } catch (e) {
                        toast(e instanceof ApiError ? e.message : "Couldn't complete that action");
                      }
                      invalidateAfterAction();
                    }}
                    className="px-2 py-0.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  >
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      await api.ai.rejectAction(a.id);
                      invalidateAfterAction();
                    }}
                    className="px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="max-h-72 overflow-y-auto p-4 space-y-2">
          {log.length === 0 && (
            <p className="text-xs text-neutral-400">
              Try a command — "add task write report tomorrow", "start a 25 minute focus", "plan my day" — or just ask
              anything else and it'll answer directly.
            </p>
          )}
          {log.map((m, i) => (
            <p key={i} className={`text-sm ${m.role === "user" ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500"}`}>
              {m.role === "user" ? "> " : "  "}
              {m.text}
            </p>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-neutral-200 dark:border-neutral-800 p-2"
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={busy ? "Thinking..." : "Ask or command..."}
            disabled={busy}
            className="w-full px-2 py-2 text-sm bg-transparent outline-none"
          />
        </form>
      </div>
    </div>
  );
}
