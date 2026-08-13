import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function AICommandBar() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
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

  const send = async () => {
    if (!text.trim() || busy) return;
    const userText = text.trim();
    setLog((l) => [...l, { role: "user", text: userText }]);
    setText("");
    setBusy(true);
    try {
      const res = await api.ai.command(userText);
      setLog((l) => [...l, { role: "assistant", text: res.message ?? JSON.stringify(res.result) }]);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["focus-sessions"] });
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
        Ask / Command (⌘K)
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-24 z-50" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden"
      >
        <div className="max-h-72 overflow-y-auto p-4 space-y-2">
          {log.length === 0 && (
            <p className="text-xs text-neutral-400">
              Try: "add task write report tomorrow", "start a 25 minute focus", "plan my day", "how much time do I have".
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
