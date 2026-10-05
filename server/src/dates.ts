// Calendar-date helpers. "Today" throughout the server is the date on the wall clock of the
// machine it runs on (the system timezone) — Orbit's server always runs on the user's own
// computer, so that is the user's day. It used to be the UTC date, which for anyone ahead of
// UTC meant the app still thought it was yesterday for the first hours after midnight.
//
// Dates are plain YYYY-MM-DD strings. Arithmetic on them goes through UTC-midnight instants
// purely as a calculator (no timezone is involved in "the day after 2026-03-08").

const pad = (n: number) => String(n).padStart(2, "0");

// The local calendar date of an instant (defaults to now).
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localToday(): string {
  return localDate();
}

// The local calendar date a stored UTC timestamp ("2026-10-05T19:30:00.000Z") fell on.
export function localDay(timestamp: string): string {
  return localDate(new Date(timestamp));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Same day-of-month N months on, clamped to that month's last day (Jan 31 + 1 -> Feb 28/29).
export function addMonths(iso: string, months: number): string {
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

// SQL expression for the local calendar day of a column that may hold either a UTC timestamp
// ("...Z", converted to local) or a zone-less local date/datetime (taken as written) — event
// and scheduled-task times are stored in both shapes depending on what created them.
export function localDaySql(column: string): string {
  return `(CASE WHEN ${column} LIKE '%Z' THEN date(${column}, 'localtime') ELSE substr(${column}, 1, 10) END)`;
}

// 0 = Sunday ... 6 = Saturday.
export function weekday(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / 86400000);
}
