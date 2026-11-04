import { monthStart, pickTeamOfMonth, type MonthCandidate } from '../teamOfMonth';

let n = 0;
const c = (position: string, rating: number, extra: Partial<MonthCandidate> = {}): MonthCandidate => ({
  user_id: `u${++n}`, display_name: `P${n}`, username: `p${n}`, avatar_url: null, position, rated: 3, rating, goals: 0, assists: 0, motm: 0, apps: 3, ...extra,
});

describe('team of the month', () => {
  it('fills a 1-2-2 by preferred position, best rating first', () => {
    const gk = c('GK', 6.9), d1 = c('DEF', 7.6), d2 = c('DEF', 7.1), d3 = c('DEF', 6.0), f1 = c('FWD', 8.2), m1 = c('MID', 7.9), f2 = c('FWD', 7.0);
    const t = pickTeamOfMonth([gk, d1, d2, d3, f1, m1, f2])!;
    expect(t.players.map((p) => [p.slot, p.player.user_id])).toEqual([['GK', gk.user_id], ['DEF', d1.user_id], ['DEF', d2.user_id], ['ATT', f1.user_id], ['ATT', m1.user_id]]);
    expect(t.captain.user_id).toBe(f1.user_id);
  });
  it('uses the best remaining players when nobody plays a position', () => {
    const a = c('ANY', 8), b = c('FWD', 7.8), d = c('MID', 7.5), e = c('ANY', 7.2), f = c('FWD', 6.5);
    const t = pickTeamOfMonth([a, b, d, e, f])!;
    expect(t.players.find((p) => p.slot === 'GK')!.player.user_id).toBe(a.user_id);
    expect(new Set(t.players.map((p) => p.player.user_id)).size).toBe(5);
  });
  it('needs five players with at least two rated games', () => {
    expect(pickTeamOfMonth([c('GK', 9, { rated: 1 }), c('DEF', 8), c('DEF', 8), c('FWD', 8), c('MID', 8)])).toBeNull();
  });
  it('breaks rating ties with MOTM awards', () => {
    const x = c('FWD', 7.5), y = c('FWD', 7.5, { motm: 2 });
    const t = pickTeamOfMonth([c('GK', 6), c('DEF', 6), c('DEF', 6), x, y])!;
    expect(t.captain.user_id).toBe(y.user_id);
  });
  it('month starts', () => {
    expect(monthStart(0, new Date(2026, 10, 18))).toBe('2026-11-01');
    expect(monthStart(-1, new Date(2026, 0, 5))).toBe('2025-12-01');
  });
});
