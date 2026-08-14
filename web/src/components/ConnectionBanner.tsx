import { useEffect, useRef, useState } from "react";
import { useConnectionStore } from "../connectionStore";
import { useQueryClient } from "@tanstack/react-query";

const HEALTH_URL = "http://localhost:4310/api/health";

export function ConnectionBanner() {
  const { isConnected, setConnected } = useConnectionStore();
  const [checking, setChecking] = useState(false);
  const qc = useQueryClient();
  const wasDisconnected = useRef(false);

  const check = async () => {
    setChecking(true);
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
      setConnected(res.ok);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    check();
    const interval = setInterval(check, isConnected ? 20000 : 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) wasDisconnected.current = true;
    else if (wasDisconnected.current) {
      // Connection just came back — refresh everything rather than leaving stale data
      // (or missing writes the user tried while disconnected) on screen.
      wasDisconnected.current = false;
      qc.invalidateQueries();
    }
  }, [isConnected, qc]);

  if (isConnected) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[70] bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-center gap-3">
      <span>Can't reach the local server — nothing will save until it's back. Is it running?</span>
      <button
        onClick={check}
        disabled={checking}
        className="px-2.5 py-0.5 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-60 text-xs font-medium"
      >
        {checking ? "Checking..." : "Retry"}
      </button>
    </div>
  );
}
