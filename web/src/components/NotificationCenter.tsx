import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

function BellIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15s1.5-1.5 1.5-6Z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

const OS_NOTIFIED_KEY = "orbit-os-notified-ids";

function loadOsNotified(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OS_NOTIFIED_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveOsNotified(ids: string[]) {
  // Keep the most recent 300 — this only needs to dedupe against notifications that could
  // plausibly still be unread/visible, not grow into an unbounded log.
  localStorage.setItem(OS_NOTIFIED_KEY, JSON.stringify(ids.slice(-300)));
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ left: 0, bottom: 0 });
  const qc = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications.list,
    refetchInterval: 60000,
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });

  // Poll for due/overdue tasks periodically and turn them into notifications — there's no
  // background scheduler on the server, so the client drives this check.
  useEffect(() => {
    if (settings && settings.notifyDueTasks === false) return;
    const check = () =>
      api.notifications.checkDue().then((r) => {
        if (r.created > 0) qc.invalidateQueries({ queryKey: ["notifications"] });
      });
    check();
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings, qc]);

  // The in-app bell only surfaces a notification if you happen to open the dropdown — nothing
  // reaches you while the window is unfocused or minimized. Mirror any new unread notification
  // out to a real OS/desktop notification (Tauri desktop shell only; no-op on plain web).
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unreadNotifs = notifications.filter((n: any) => !n.is_read);
    if (unreadNotifs.length === 0) return;
    (async () => {
      const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) return;

      const seen = new Set(loadOsNotified());
      let changed = false;
      for (const n of unreadNotifs as any[]) {
        if (seen.has(n.id)) continue;
        sendNotification({ title: "Orbit", body: n.message });
        seen.add(n.id);
        changed = true;
      }
      if (changed) saveOsNotified(Array.from(seen));
    })();
  }, [notifications]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-notification-panel]")
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // The sidebar itself scrolls (overflow-y-auto) and this button sits near its bottom, so an
  // absolutely-positioned dropdown anchored inside it gets visually clipped by that scroll
  // container's bounds — its header (e.g. "Mark all read") was cut off above the visible area.
  // Rendering the panel into a portal at a fixed screen position, computed from the button's
  // real bounding rect, escapes that clipping entirely.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPanelPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
  }, [open]);

  const unread = notifications.filter((n: any) => !n.is_read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-neutral-600 dark:text-neutral-400 hover:bg-white/60 dark:hover:bg-neutral-900/60 w-full"
      >
        <BellIcon />
        Notifications
        {unread > 0 && <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{unread}</span>}
      </button>
      {open &&
        createPortal(
          <div
            data-notification-panel
            style={{ position: "fixed", left: panelPos.left, bottom: panelPos.bottom }}
            className="z-50 w-72 max-h-80 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl animate-pop-in"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-xs font-medium">Notifications</span>
            {unread > 0 && (
              <button
                onClick={async () => {
                  await api.notifications.markAllRead();
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }}
                className="text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 && <p className="text-xs text-neutral-400 px-3 py-6 text-center">Nothing yet.</p>}
          {notifications.slice(0, 20).map((n: any) => (
            <button
              key={n.id}
              onClick={async () => {
                if (!n.is_read) {
                  await api.notifications.markRead(n.id);
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }
              }}
              className={`w-full text-left px-3 py-2 text-xs border-b border-neutral-50 dark:border-neutral-800/50 last:border-0 ${
                n.is_read ? "text-neutral-400" : "text-neutral-700 dark:text-neutral-200"
              }`}
            >
              {n.message}
            </button>
          ))}
          </div>,
          document.body
        )}
    </div>
  );
}
