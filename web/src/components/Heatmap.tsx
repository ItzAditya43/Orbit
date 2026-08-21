// GitHub-contribution-style heatmap. Takes any {date, count} series — used for both the
// overall completion heatmap on Analytics and per-habit streak heatmaps on the Habits page,
// so the visual pattern of "when did this actually happen" reads the same everywhere.
export function Heatmap({ data, weeks: weekCount = 16 }: { data: { date: string; count: number }[]; weeks?: number }) {
  const countByDay = new Map(data.map((d) => [d.date, d.count]));
  const days: string[] = [];
  const today = new Date();
  for (let i = weekCount * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  const shade = (count: number) => {
    if (count === 0) return "bg-neutral-100 dark:bg-neutral-800";
    const intensity = count / max;
    if (intensity > 0.75) return "bg-emerald-600";
    if (intensity > 0.5) return "bg-emerald-500";
    if (intensity > 0.25) return "bg-emerald-400";
    return "bg-emerald-300 dark:bg-emerald-700";
  };
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((day) => (
            <div key={day} title={`${day}: ${countByDay.get(day) ?? 0}`} className={`h-2.5 w-2.5 rounded-sm ${shade(countByDay.get(day) ?? 0)}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
