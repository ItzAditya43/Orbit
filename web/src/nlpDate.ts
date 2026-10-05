const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Small local date parser for quick-add — no external NLP service, just pattern matching
// over a fixed set of phrases. Returns { date, cleanedText } or null if nothing matched.
export function extractDate(text: string): { date: string; cleanedText: string } | null {
  const lower = text.toLowerCase();
  // Anchored on the UTC calendar date and stepped with UTC setters, matching fmt() below and
  // the "today" the rest of the app uses. Starting from *local* midnight and then formatting
  // via toISOString() landed a day early in any timezone ahead of UTC — in IST "tomorrow"
  // saved as today and "today" as yesterday.
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  const strip = (re: RegExp) => text.replace(re, "").replace(/\s+/g, " ").trim();

  if (/\btoday\b/.test(lower)) return { date: fmt(today), cleanedText: strip(/\btoday\b/i) };

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 1);
    return { date: fmt(d), cleanedText: strip(/\btomorrow\b/i) };
  }

  const inMatch = lower.match(/\bin (\d+) (day|days|week|weeks|month|months)\b/);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2];
    const d = new Date(today);
    if (unit.startsWith("day")) d.setUTCDate(d.getUTCDate() + n);
    else if (unit.startsWith("week")) d.setUTCDate(d.getUTCDate() + n * 7);
    else d.setUTCMonth(d.getUTCMonth() + n);
    return { date: fmt(d), cleanedText: strip(/\bin \d+ (day|days|week|weeks|month|months)\b/i) };
  }

  if (/\bnext week\b/.test(lower)) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 7);
    return { date: fmt(d), cleanedText: strip(/\bnext week\b/i) };
  }

  if (/\bnext month\b/.test(lower)) {
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return { date: fmt(d), cleanedText: strip(/\bnext month\b/i) };
  }

  const nextWeekdayMatch = lower.match(new RegExp(`\\bnext (${WEEKDAYS.join("|")})\\b`));
  if (nextWeekdayMatch) {
    const targetDay = WEEKDAYS.indexOf(nextWeekdayMatch[1]);
    const d = new Date(today);
    const diff = ((targetDay - d.getUTCDay() + 7) % 7) || 7;
    d.setUTCDate(d.getUTCDate() + diff + 7);
    return { date: fmt(d), cleanedText: strip(new RegExp(`\\bnext (${WEEKDAYS.join("|")})\\b`, "i")) };
  }

  const weekdayMatch = lower.match(new RegExp(`\\b(this )?(${WEEKDAYS.join("|")})\\b`));
  if (weekdayMatch) {
    const targetDay = WEEKDAYS.indexOf(weekdayMatch[2]);
    const d = new Date(today);
    const diff = ((targetDay - d.getUTCDay() + 7) % 7) || 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return { date: fmt(d), cleanedText: strip(new RegExp(`\\b(this )?(${WEEKDAYS.join("|")})\\b`, "i")) };
  }

  return null;
}
