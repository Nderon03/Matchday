import { monthGrid, sameDay, nextDays } from '../sessionDates';

describe('monthGrid', () => {
  it('starts weeks on Monday and pads to whole weeks', () => {
    const nov = monthGrid(2026, 10); // 1 November 2026 is a Sunday
    expect(nov.length % 7).toBe(0);
    expect(nov.slice(0, 6).every((d) => d === null)).toBe(true);
    expect(nov[6]?.getDate()).toBe(1);
    expect(nov.filter(Boolean)).toHaveLength(30);
  });
  it('handles a month starting on Monday and leap years', () => {
    expect(monthGrid(2026, 5)[0]?.getDate()).toBe(1); // 1 June 2026 is a Monday
    expect(monthGrid(2028, 1).filter(Boolean)).toHaveLength(29);
  });
  it('compares calendar days', () => {
    expect(sameDay(new Date(2026, 0, 5, 9), new Date(2026, 0, 5, 21))).toBe(true);
    expect(sameDay(new Date(2026, 0, 5), new Date(2026, 0, 6))).toBe(false);
    expect(nextDays(3, new Date(2026, 0, 31)).map((d) => d.getDate())).toEqual([31, 1, 2]);
  });
});
