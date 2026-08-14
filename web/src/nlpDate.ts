const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Small local date parser for quick-add — no external NLP service, just pattern matching
// over a fixed set of phrases. Returns { date, cleanedText } or null if nothing matched.
export function extractDate(text: string): { date: string; cleanedText: string } | null {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const strip = (re: RegExp) => text.replace(re, "").replace(/\s+/g, " ").trim();

  if (/\btoday\b/.test(lower)) return { date: fmt(today), cleanedText: strip(/\btoday\b/i) };

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { date: fmt(d), cleanedText: strip(/\btomorrow\b/i) };
  }

  const inMatch = lower.match(/\bin (\d+) (day|days|week|weeks|month|months)\b/);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2];
    const d = new Date(today);
    if (unit.startsWith("day")) d.setDate(d.getDate() + n);
    else if (unit.startsWith("week")) d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return { date: fmt(d), cleanedText: strip(/\bin \d+ (day|days|week|weeks|month|months)\b/i) };
  }

  if (/\bnext week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return { date: fmt(d), cleanedText: strip(/\bnext week\b/i) };
  }

  if (/\bnext month\b/.test(lower)) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return { date: fmt(d), cleanedText: strip(/\bnext month\b/i) };
  }

  const nextWeekdayMatch = lower.match(new RegExp(`\\bnext (${WEEKDAYS.join("|")})\\b`));
  if (nextWeekdayMatch) {
    const targetDay = WEEKDAYS.indexOf(nextWeekdayMatch[1]);
    const d = new Date(today);
    const diff = ((targetDay - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + diff + 7);
    return { date: fmt(d), cleanedText: strip(new RegExp(`\\bnext (${WEEKDAYS.join("|")})\\b`, "i")) };
  }

  const weekdayMatch = lower.match(new RegExp(`\\b(this )?(${WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch) {
    const targetDay = WEEKDAYS.indexOf(weekdayMatch[2]);
    const d = new Date(today);
    const diff = ((targetDay - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + diff);
    return { date: fmt(d), cleanedText: strip(new RegExp(`\\b(this )?(${WEEKDAYS.join("|")})\\b`, "i")) };
  }

  return null;
}
