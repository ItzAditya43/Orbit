// Calendar-date helpers. A "day" in Orbit is the day on this machine's clock (the system
// timezone), as a plain YYYY-MM-DD string. Never derive one with toISOString() — that
// converts to UTC first, which is a different day for part of every day in any timezone
// that isn't UTC.

const pad = (n: number) => String(n).padStart(2, "0");

export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return localISODate();
}

// Today plus/minus a number of days.
export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

// The local day a stored value falls on. Accepts both shapes the API returns: a bare date
// ("2026-10-05", returned as-is) or a full timestamp ("2026-10-05T19:30:00.000Z").
export function dayOf(value: string | null | undefined): string {
  if (!value) return "";
  return value.length <= 10 ? value : localISODate(new Date(value));
}
