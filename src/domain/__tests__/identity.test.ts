import { CLUBS, CLUB_ROWS, searchClubs } from '@/data/clubs';
import { COUNTRIES, COUNTRY_BY_CODE } from '@/data/countries';

describe('countries', () => {
  it('has every country, including the home nations and Kosovo', () => {
    for (const code of ['GB', 'GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR', 'XK', 'SO', 'MA', 'AL', 'PS', 'IE', 'NG']) expect(COUNTRY_BY_CODE[code]).toBeDefined();
    expect(COUNTRIES.length).toBeGreaterThan(240);
    for (const c of COUNTRIES) expect(c.svg.startsWith('<svg')).toBe(true);
  });
});

describe('clubs', () => {
  it('are well formed with unique ids and known countries', () => {
    expect(new Set(CLUB_ROWS.map((r) => r[0])).size).toBe(CLUB_ROWS.length);
    for (const c of CLUBS) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.short.length).toBeLessThanOrEqual(4);
      expect(c.primary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.secondary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(COUNTRY_BY_CODE[c.country]).toBeDefined();
    }
  });
  it('search finds clubs by name, words and nicknames', () => {
    expect(searchClubs('arsenal')[0].id).toBe('arsenal');
    expect(searchClubs('spurs')[0].id).toBe('tottenham');
    expect(searchClubs('man u').map((c) => c.id)).toContain('man-united');
    expect(searchClubs('atletico')[0].id).toBe('atletico');
    expect(searchClubs('prishtina')[0].id).toBe('prishtina');
    expect(searchClubs('zzzz')).toEqual([]);
  });
});
