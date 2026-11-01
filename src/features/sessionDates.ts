/** Helpers for the cross-platform date/time chips used in session forms. */
export function nextDays(n = 21, from = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return d;
  });
}

export function sameWeekdayNextWeek(iso: string) {
  const d = new Date(iso);
  const next = new Date(d.getTime());
  const now = new Date();
  while (next <= now) next.setDate(next.getDate() + 7);
  return next;
}

export function combine(date: Date, time: string) {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0);
}

export function isValidTime(t: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function dayLabel(d: Date, today = new Date()) {
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
