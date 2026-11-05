// iCalendar feed of a player's games (RFC 5545). Pure so it can be unit tested.
export interface FeedEvent {
  session_id: string;
  name: string;
  starts_at: string;
  duration_minutes: number;
  venue: string | null;
  area: string | null;
  postcode: string | null;
  status: string;
  my_status: string; // host | confirmed | waitlisted | invited
  updated_at: string;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 characters are folded (continuation lines start with a space). */
function fold(line: string) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

const LABEL: Record<string, string> = { waitlisted: ' (waiting list)', invited: ' (invited)' };

export function calendarFeed(events: FeedEvent[], appUrl: string, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MATCHDAY//My games//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:MATCHDAY', 'X-WR-TIMEZONE:Europe/London', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    const start = new Date(e.starts_at);
    const end = new Date(start.getTime() + (e.duration_minutes || 60) * 60_000);
    const where = [e.venue, e.area, e.postcode].filter(Boolean).join(', ');
    const link = `${appUrl.replace(/\/$/, '')}/session/${e.session_id}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.session_id}@matchdayapp.org`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(new Date(e.updated_at))}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${icsEscape(`⚽ ${e.name}${LABEL[e.my_status] ?? ''}`)}`,
      ...(where ? [`LOCATION:${icsEscape(where)}`] : []),
      `DESCRIPTION:${icsEscape(`Open in MATCHDAY: ${link}`)}`,
      `URL:${link}`,
      `STATUS:${e.my_status === 'confirmed' || e.my_status === 'host' ? 'CONFIRMED' : 'TENTATIVE'}`,
      ...(e.my_status === 'confirmed' || e.my_status === 'host'
        ? ['BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`${e.name} in 2 hours`)}`, 'END:VALARM'] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
