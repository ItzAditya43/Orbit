import { useEffect, useState } from "react";
import { useToastStore } from "../toastStore";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function UpdateChecker() {
  const toast = useToastStore((s) => s.push);
  const [installing, setInstalling] = useState(false);

  const runCheck = async (opts: { silent: boolean }) => {
    if (!isTauri()) return;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        toast(`Orbit ${update.version} is available`, {
          actionLabel: "Install & restart",
          onAction: async () => {
            setInstalling(true);
            try {
              await update.downloadAndInstall();
              const { relaunch } = await import("@tauri-apps/plugin-process");
              await relaunch();
            } catch {
              toast("Update failed — try again later");
              setInstalling(false);
            }
          },
        });
      } else if (!opts.silent) {
        toast("Orbit is up to date");
      }
    } catch {
      if (!opts.silent) toast("Couldn't check for updates right now");
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    // Quiet check shortly after launch — don't nag if there's nothing new.
    const t = setTimeout(() => runCheck({ silent: true }), 3000);

    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("check-for-updates-requested", () => runCheck({ silent: false })).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      clearTimeout(t);
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (installing) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] text-xs px-3 py-1.5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-lg animate-pop-in">
        Downloading update...
      </div>
    );
  }

  return null;
}
