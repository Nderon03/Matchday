import { clock, dateShort, dayLong, dayLongMonthShort, dayMonth, dayShort, monthYear, ukHour, weekday } from '../dates';

// the old formatter's text, minus its one quirk: newer phones write September as "Sept"
const old = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o).replace('Sept', 'Sep').replace(/,/g, '');

describe('fast date text', () => {
  const days = Array.from({ length: 400 }, (_, i) => new Date(2026, 0, 1, (i * 7) % 24, (i * 13) % 60 + 0));
  it('matches the en-GB formatter for every day of the year', () => {
    for (const d of days) {
      expect(clock(d)).toBe(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      expect(weekday(d)).toBe(old(d, { weekday: 'long' }));
      expect(dayShort(d)).toBe(old(d, { weekday: 'short', day: 'numeric', month: 'short' }));
      expect(dayLongMonthShort(d)).toBe(old(d, { weekday: 'long', day: 'numeric', month: 'short' }));
      expect(dayLong(d)).toBe(old(d, { weekday: 'long', day: 'numeric', month: 'long' }));
      expect(dateShort(d)).toBe(old(d, { day: 'numeric', month: 'short', year: 'numeric' }));
      expect(dayMonth(d)).toBe(old(d, { day: 'numeric', month: 'short' }));
      expect(monthYear(d)).toBe(old(d, { month: 'long', year: 'numeric' }));
    }
  });
  it('midnight is 00:00 and September is Sep', () => {
    expect(clock(new Date(2026, 8, 3, 0, 5))).toBe('00:05');
    expect(dayShort(new Date(2026, 8, 3))).toBe('Thu 3 Sep');
  });
  it('knows the UK hour whatever the phone’s time zone', () => {
    expect(ukHour(new Date('2026-07-01T18:30:00Z'))).toBe(19); // summer time
    expect(ukHour(new Date('2026-12-01T18:30:00Z'))).toBe(18);
    expect(ukHour(new Date('2026-12-01T23:30:00Z'))).toBe(23);
  });
});
