import { parseSeasonBadge, seasonNumber } from '../seasonBadges';

describe('season badges', () => {
  it('numbers seasons from Winter 2027', () => {
    expect(seasonNumber('2026-11-12')).toBe(0);
    expect(seasonNumber('2027-01-01')).toBe(1);
    expect(seasonNumber('2027-04-01')).toBe(2);
    expect(seasonNumber('2027-12-31')).toBe(4);
    expect(seasonNumber('2028-01-15')).toBe(5);
  });
  it('reads badge codes', () => {
    expect(parseSeasonBadge('s1_elite')).toMatchObject({ tier: 'elite', number: 1, short: 'S1', label: 'S1 Elite' });
    expect(parseSeasonBadge('s12_champion')?.label).toBe('S12 Champion');
    expect(parseSeasonBadge('pre')).toMatchObject({ tier: 'preseason', short: 'PRE', label: 'Pre-season' });
    expect(parseSeasonBadge('s1_legend')).toBeNull();
    expect(parseSeasonBadge(null)).toBeNull();
  });
});
