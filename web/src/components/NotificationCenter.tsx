import { useEffect, useRef, useState } from "react";
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

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unread = notifications.filter((n: any) => !n.is_read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-neutral-600 dark:text-neutral-400 hover:bg-white/60 dark:hover:bg-neutral-900/60 w-full"
      >
        <BellIcon />
        Notifications
        {unread > 0 && <span className="ml-auto h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{unread}</span>}
      </button>
      {open && (
        <div className="absolute z-40 bottom-full mb-1 left-0 w-72 max-h-80 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl animate-pop-in">
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
        </div>
      )}
    </div>
  );
}
