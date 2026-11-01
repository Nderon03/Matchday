import { balanceTeams, randomTeams, suggestTeams, playerStrength, hasEnoughHistory, type BalancePlayer } from '../balancing';

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const make = (ratings: number[], extra: Partial<BalancePlayer> = {}): BalancePlayer[] =>
  ratings.map((r, i) => ({ user_id: `p${i}`, position: 'ANY', group_rating: r, games: 20, ...extra }));

describe('playerStrength', () => {
  it('shrinks new players toward the neutral prior', () => {
    expect(playerStrength({ user_id: 'a', position: 'ANY', group_rating: 9, games: 1 })).toBeCloseTo(6.75);
    expect(playerStrength({ user_id: 'a', position: 'ANY', group_rating: 9, games: 100 })).toBeGreaterThan(8.9);
  });
  it('unknown players get the prior', () => expect(playerStrength({ user_id: 'a', position: 'ANY' })).toBe(6));
  it('prefers group rating and blends form', () => {
    expect(playerStrength({ user_id: 'a', position: 'ANY', group_rating: 8, career_rating: 5, form: 6, games: 1e9 })).toBeCloseTo(7.4);
  });
});

describe('balanceTeams', () => {
  it('does not stack the best players on one side', () => {
    const players = make([9, 8.5, 8, 7.5, 7, 6, 5.5, 5, 4.5, 4]);
    const r = balanceTeams(players, { random: seeded(1) });
    expect(r.A).toHaveLength(5);
    expect(r.B).toHaveLength(5);
    const top5 = new Set(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(r.A.every((id) => top5.has(id)) || r.B.every((id) => top5.has(id))).toBe(false);
    expect(r.difference).toBeLessThan(0.5);
  });

  it('finds the optimal split for small groups', () => {
    const r = balanceTeams(make([10, 1, 1, 10]), { random: seeded(2) });
    expect(r.difference).toBeCloseTo(0, 5);
  });

  it('places one goalkeeper on each side when available', () => {
    const players = make([7, 7, 7, 7, 7, 7, 7, 7, 7, 7]);
    players[0].position = 'GK';
    players[1].gk_games = 5;
    const r = balanceTeams(players, { random: seeded(3), goalkeepers: 'fixed' });
    expect([r.goalkeepers.A, r.goalkeepers.B].sort()).toEqual(['p0', 'p1']);
    expect(r.A.includes('p0') !== r.A.includes('p1')).toBe(true);
    expect(r.explanation).toMatch(/goalkeeper/);
  });

  it('handles odd numbers and every format up to 11-a-side', () => {
    for (const n of [5, 7, 11, 14, 22]) {
      const r = balanceTeams(make(Array.from({ length: n }, (_, i) => 5 + (i % 5))), { random: seeded(n) });
      expect(r.A.length + r.B.length).toBe(n);
      expect(Math.abs(r.A.length - r.B.length)).toBeLessThanOrEqual(1);
      expect(new Set([...r.A, ...r.B]).size).toBe(n);
    }
  });

  it('large groups use heuristic search and stay close', () => {
    const ratings = Array.from({ length: 22 }, (_, i) => 4 + ((i * 37) % 60) / 10);
    const r = balanceTeams(make(ratings), { random: seeded(9) });
    expect(r.difference).toBeLessThan(1);
  });

  it('avoids repeating recent pairings when strength is equal', () => {
    const players = make([7, 7, 7, 7]);
    const r = balanceTeams(players, { random: seeded(4), recentPairings: [{ user_a: 'p0', user_b: 'p1', times: 3 }] });
    expect(r.A.includes('p0') && r.A.includes('p1')).toBe(false);
    expect(r.B.includes('p0') && r.B.includes('p1')).toBe(false);
  });
});

describe('goalkeeper modes', () => {
  const players = make([7, 7, 7, 7, 7, 7]);
  players[0].gk_games = 6; // has kept goal before, but prefers outfield
  players[1].gk_games = 4;
  it('auto ignores goal-keeping history and only uses preferred positions', () => {
    expect(balanceTeams(players, { random: seeded(5) }).goalkeepers).toEqual({ A: undefined, B: undefined });
    const withGk = players.map((p, i) => (i < 2 ? { ...p, position: 'GK' as const } : p));
    const r = balanceTeams(withGk, { random: seeded(5) });
    expect([r.goalkeepers.A, r.goalkeepers.B].sort()).toEqual(['p0', 'p1']);
  });
  it('rotating never fixes a goalkeeper, even if players prefer GK', () => {
    const withGk = players.map((p, i) => (i < 2 ? { ...p, position: 'GK' as const } : p));
    const r = balanceTeams(withGk, { random: seeded(5), goalkeepers: 'rotating' });
    expect(r.goalkeepers).toEqual({ A: undefined, B: undefined });
    expect(r.explanation).toMatch(/rotate/);
    expect(randomTeams(withGk, 3, 'rotating').goalkeepers).toEqual({ A: undefined, B: undefined });
  });
  it('a single keeper is not forced onto one side', () => {
    const one = players.map((p, i) => (i === 0 ? { ...p, position: 'GK' as const } : p));
    expect(balanceTeams(one, { random: seeded(5) }).goalkeepers).toEqual({ A: undefined, B: undefined });
  });
});

describe('randomTeams / suggestTeams', () => {
  it('random is deterministic with a seed and splits evenly', () => {
    const p = make([1, 2, 3, 4, 5, 6]);
    expect(randomTeams(p, 42)).toEqual(randomTeams(p, 42));
    expect(randomTeams(p, 42).A).toHaveLength(3);
  });
  it('falls back to random without history', () => {
    const p: BalancePlayer[] = Array.from({ length: 10 }, (_, i) => ({ user_id: `n${i}`, position: 'ANY' }));
    expect(hasEnoughHistory(p)).toBe(false);
    expect(suggestTeams(p).method).toBe('random');
  });
  it('balances with history', () => {
    expect(suggestTeams(make([5, 6, 7, 8])).method).toBe('balanced');
  });
});
