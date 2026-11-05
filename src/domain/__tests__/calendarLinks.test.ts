import { calendarLinks } from '../calendarLinks';

describe('calendar subscription links', () => {
  it('gives https, webcal and Google subscribe links for the feed', () => {
    const l = calendarLinks('a'.repeat(64), 'https://abc.supabase.co/');
    expect(l.https).toBe(`https://abc.supabase.co/functions/v1/calendar-feed?token=${'a'.repeat(64)}`);
    expect(l.webcal).toBe(`webcal://abc.supabase.co/functions/v1/calendar-feed?token=${'a'.repeat(64)}`);
    expect(l.google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(l.webcal)}`);
  });
});
