import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

// Inline tag filter for task-list views (Today/Inbox/Upcoming/Board) — previously the only
// way to filter by tag was the separate Filters page, which meant leaving the view you were
// actually working in just to narrow it down by tag.
export function TagFilterDropdown({ value, onChange }: { value: string | null; onChange: (tagId: string | null) => void }) {
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.tags.list });
  if (tags.length === 0) return null;
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs"
    >
      <option value="">All tags</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export function matchesTag(item: { tags?: { id: string }[] }, tagId: string | null): boolean {
  if (!tagId) return true;
  return (item.tags ?? []).some((t) => t.id === tagId);
}
