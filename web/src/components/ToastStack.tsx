import { useToastStore } from "../toastStore";
import { XIcon } from "../icons";

export function ToastStack() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 pl-4 pr-2 py-2 text-sm shadow-xl animate-[toast-in_0.18s_ease-out]"
        >
          <span>{t.message}</span>
          {t.actionLabel && (
            <button
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
              className="font-medium px-2 py-1 rounded-full hover:bg-white/20 dark:hover:bg-black/10"
            >
              {t.actionLabel}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} className="text-neutral-400 hover:text-white dark:hover:text-neutral-900 px-1">
            <XIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
