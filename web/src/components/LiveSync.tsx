import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BASE, CLIENT_ID } from "../api";

const POLL_MS = 4000;

// Keeps this window current when Orbit is open on more than one device. Asks the server every
// few seconds whether anyone *else* has changed something since last time, and if so reloads
// whatever is on screen. This window's own changes don't trigger it — those already refresh
// what they touch, and reloading everything mid-edit would reset half-typed input.
export function LiveSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let since: number | undefined;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const query = since === undefined ? "" : `?since=${since}&client=${CLIENT_ID}`;
        const res = await fetch(`${BASE}/revision${query}`, { credentials: "same-origin", signal: AbortSignal.timeout(3500) });
        if (!res.ok || stopped) return;
        const data: { revision: number; changedByOthers: boolean } = await res.json();
        since = data.revision;
        if (data.changedByOthers) qc.invalidateQueries();
      } catch {
        // offline or server down — ConnectionBanner reports that; just try again next tick
      }
    };
    const interval = setInterval(tick, POLL_MS);
    // Coming back to a tab that was in the background: catch up straight away.
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [qc]);
  return null;
}
