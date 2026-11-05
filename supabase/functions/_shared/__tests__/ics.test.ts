import { calendarFeed, icsEscape } from '../ics';

const ev = {
  session_id: 's1', name: 'Wednesday Football', starts_at: '2026-11-11T19:00:00Z', duration_minutes: 60, venue: 'Riverside, Pitch 2',
  area: 'London', postcode: 'NW7 2EU', status: 'scheduled', my_status: 'confirmed', updated_at: '2026-11-05T10:00:00Z',
};

describe('calendar feed', () => {
  it('lists games with stable ids, times, place and a link back', () => {
    const ics = calendarFeed([ev, { ...ev, session_id: 's2', my_status: 'waitlisted' }], 'https://matchdayapp.org/', new Date('2026-11-05T12:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:s1@matchdayapp.org');
    expect(ics).toContain('DTSTART:20261111T190000Z');
    expect(ics).toContain('DTEND:20261111T200000Z');
    expect(ics).toContain('LOCATION:Riverside\\, Pitch 2\\, London\\, NW7 2EU');
    expect(ics).toContain('URL:https://matchdayapp.org/session/s1');
    expect(ics).toContain('SUMMARY:⚽ Wednesday Football (waiting list)');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1); // only for games you're playing in
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
  it('escapes and folds long lines', () => {
    expect(icsEscape('a;b,c\nd')).toBe('a\;b\\,c\\nd');
    const ics = calendarFeed([{ ...ev, venue: 'x'.repeat(200) }], 'https://matchdayapp.org');
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  });
});
