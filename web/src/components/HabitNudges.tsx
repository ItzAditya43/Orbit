import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const NOTIFIED_KEY = "orbit-habit-notified";

function loadNotified(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveNotified(map: Record<string, string>) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

// Habits already show urgency color on-screen as a deadline approaches, but that's only
// useful if the app window is actually open and visible. This fires a real OS notification
// once per habit per state (due-soon, then separately missed) per day — only when running
// inside the Tauri desktop shell, no-op on plain web where there's no OS notification API
// wired up the same way.
export function HabitNudges() {
  const { data: habits = [] } = useQuery({
    queryKey: ["habits"],
    queryFn: api.habits.list,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    (async () => {
      const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) return;

      const today = new Date().toISOString().slice(0, 10);
      const notified = loadNotified();
      let changed = false;

      for (const h of habits as any[]) {
        if (!h.deadlineStatus || h.deadlineStatus === "ok") continue;
        const key = `${h.id}:${today}:${h.deadlineStatus}`;
        if (notified[key]) continue;

        sendNotification({
          title: h.deadlineStatus === "missed" ? `Missed: ${h.title}` : `${h.title} — due soon`,
          body:
            h.deadlineStatus === "missed"
              ? `You didn't get to it by ${h.deadline_time}.`
              : `Due by ${h.deadline_time} — still time to knock it out.`,
        });
        notified[key] = today;
        changed = true;
      }

      // Trim entries older than today so this doesn't grow forever.
      for (const key of Object.keys(notified)) {
        if (notified[key] !== today) {
          delete notified[key];
          changed = true;
        }
      }
      if (changed) saveNotified(notified);
    })();
  }, [habits]);

  return null;
}
