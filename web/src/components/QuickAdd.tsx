import { useState } from "react";

export function QuickAdd({
  placeholder = "Add a task and press Enter...",
  onAdd,
}: {
  placeholder?: string;
  onAdd: (title: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value.trim());
        setValue("");
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
      />
    </form>
  );
}
