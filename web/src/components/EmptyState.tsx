export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 animate-pop-in">
      <div className="text-4xl mb-3 select-none">{icon}</div>
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">{title}</p>
      {subtitle && <p className="text-xs text-neutral-400 mt-1 max-w-xs">{subtitle}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
