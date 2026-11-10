/** "Add to calendar" for a session: a Google Calendar link (all platforms) and an .ics file (web). Phones: see phoneCalendar.ts. */
export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string; // ISO
  durationMinutes: number;
  location?: string | null;
  details?: string;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261105T190000Z

export function eventTimes(e: CalendarEvent) {
  const start = new Date(e.startsAt);
  const end = new Date(start.getTime() + e.durationMinutes * 60_000);
  return { start: stamp(start), end: stamp(end) };
}

export function googleCalendarUrl(e: CalendarEvent) {
  const { start, end } = eventTimes(e);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${start}/${end}` });
  if (e.location) q.set('location', e.location);
  if (e.details) q.set('details', e.details);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function icsText(e: CalendarEvent, now = new Date()) {
  const { start, end } = eventTimes(e);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MATCHDAY//Sessions//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@matchdayapp.org`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.details ? [`DESCRIPTION:${esc(e.details)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)} in 2 hours`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

/** Web only: download the .ics file (opens in Apple Calendar / Outlook). */
export function downloadIcs(e: CalendarEvent) {
  const blob = new Blob([icsText(e)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\w\- ]+/g, '').trim() || 'matchday'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

