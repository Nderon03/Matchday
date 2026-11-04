import { googleCalendarUrl, icsText, eventTimes } from '../calendar';

const e = { id: 's1', title: 'Wednesday Football', startsAt: '2026-11-05T19:00:00.000Z', durationMinutes: 60, location: 'Powerleague, Mill Hill', details: 'MATCHDAY session' };

describe('calendar', () => {
  it('formats UTC start and end', () => {
    expect(eventTimes(e)).toEqual({ start: '20261105T190000Z', end: '20261105T200000Z' });
  });
  it('builds a Google Calendar link', () => {
    const u = new URL(googleCalendarUrl(e));
    expect(u.hostname).toBe('calendar.google.com');
    expect(u.searchParams.get('dates')).toBe('20261105T190000Z/20261105T200000Z');
    expect(u.searchParams.get('text')).toBe('Wednesday Football');
    expect(u.searchParams.get('location')).toBe('Powerleague, Mill Hill');
  });
  it('builds a valid .ics with escaped text and a 2-hour reminder', () => {
    const ics = icsText(e, new Date('2026-11-01T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261105T190000Z');
    expect(ics).toContain('LOCATION:Powerleague\\, Mill Hill');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.split('\r\n').at(-1)).toBe('END:VCALENDAR');
  });
});
