import { useState, useEffect } from "react";

// Deliberately NOT <input type="time"> — WebKitGTK's native time/date popups have shown up
// twice now as an app "hang" (they're outside React's control, and can fail to close or
// block interaction). A plain validated text field can't hang because there's no popup at
// all to get stuck in.
export function TimeField({
  value,
  onChange,
  className,
}: {
  value: string; // "HH:MM" or ""
  onChange: (value: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      onChange("");
      return;
    }
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
    if (match) {
      const formatted = `${match[1].padStart(2, "0")}:${match[2]}`;
      setText(formatted);
      onChange(formatted);
    } else {
      setText(value); // invalid — revert rather than save garbage
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
