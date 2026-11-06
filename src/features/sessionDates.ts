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

/** Days for a month calendar (Monday first), always 6 weeks (42 cells) so the calendar never changes size. */
export function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) cells.push(null);
  return cells;
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Typing a kick-off time: digits only, the colon goes in by itself ("1930" → "19:30"). */
export function typeTime(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  // three digits: "193" is on its way to 19:30, "730" is 7:30
  if (d.length === 3) return Number(d.slice(0, 2)) <= 23 ? `${d.slice(0, 2)}:${d[2]}` : `${d[0]}:${d.slice(1)}`;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Tidies a typed time when the box is left ("7:30" → "07:30", "19" → "19:00"). */
export function tidyTime(t: string) {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return t;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export const DURATIONS: { value: number; label: string }[] = [
  { value: 30, label: '30 min' }, { value: 45, label: '45 min' }, { value: 60, label: '1 hour' }, { value: 75, label: '1h 15' },
  { value: 90, label: '1h 30' }, { value: 105, label: '1h 45' }, { value: 120, label: '2 hours' }, { value: 150, label: '2h 30' }, { value: 180, label: '3 hours' },
];
