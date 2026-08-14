import { useEffect } from "react";
import { useToastStore } from "../toastStore";
import { ApiError } from "../api";

// Safety net for API calls that throw without a local catch — most action handlers in this
// app are "fire and forget" (await api.x(); invalidate(); toast(...)) with no try/catch, so
// a failed request would otherwise become a silent unhandled rejection: the button visibly
// does nothing and nothing tells you why. Connection failures already surface via the
// persistent banner; this covers everything else (validation errors, 500s, etc).
export function GlobalErrorHandler() {
  const toast = useToastStore((s) => s.push);

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof ApiError) {
        if (reason.isConnectionError) return; // the connection banner already covers this
        event.preventDefault();
        toast(reason.message || "Something went wrong");
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, [toast]);

  return null;
}
