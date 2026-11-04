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

  it('places one goalkeeper on each side when two players choose GK', () => {
    const players = make([7, 7, 7, 7, 7, 7, 7, 7, 7, 7]);
    players[0].position = 'GK';
    players[1].position = 'GK';
    const r = balanceTeams(players, { random: seeded(3) });
    expect([r.goalkeepers.A, r.goalkeepers.B].sort()).toEqual(['p0', 'p1']);
    expect(r.A.includes('p0') !== r.A.includes('p1')).toBe(true);
    expect(r.keeperCase).toBe(2);
    expect(r.explanation).toMatch(/goalkeeper on each side/);
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

describe('goalkeepers: 0, 1, 2 or more', () => {
  const pos = (list: string[]) => list.map((position, i) => ({ user_id: `p${i}`, position: position as BalancePlayer['position'], group_rating: 7, games: 20 }));

  it('0 keepers: nobody is fixed in goal and positions are spread', () => {
    const r = balanceTeams(pos(['DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'ANY', 'ANY', 'DEF', 'DEF']), { random: seeded(5) });
    expect(r.goalkeepers).toEqual({ A: undefined, B: undefined });
    expect(r.keeperCase).toBe(0);
    expect(r.explanation).toMatch(/both teams rotate/i);
    const defs = (team: string[]) => team.filter((id) => ['p0', 'p1', 'p8', 'p9'].includes(id)).length;
    expect(defs(r.A)).toBe(2);
    expect(defs(r.B)).toBe(2);
  });

  it('1 keeper: other side rotates and gets an extra defender and a slightly stronger squad', () => {
    const players = pos(['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'ANY', 'ANY']);
    players.forEach((p, i) => { p.group_rating = 5 + (i % 4); });
    const r = balanceTeams(players, { random: seeded(7) });
    expect(r.keeperCase).toBe(1);
    expect(r.goalkeepers).toEqual({ A: 'p0', B: undefined });
    const defs = (team: string[]) => team.filter((id) => ['p1', 'p2', 'p3'].includes(id)).length;
    expect(defs(r.B)).toBeGreaterThan(defs(r.A));
    expect(r.strengthB).toBeGreaterThanOrEqual(r.strengthA);
    expect(r.explanation).toMatch(/other team rotates/);
  });

  it('1 keeper with an odd squad: the rotating side gets the extra player', () => {
    const r = balanceTeams(pos(['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'ANY', 'ANY']), { random: seeded(2) });
    expect(r.A).toHaveLength(4);
    expect(r.B).toHaveLength(5);
    expect(r.A).toContain('p0');
  });

  it('3+ keepers: the best two go in goal, one each, the rest play outfield', () => {
    const players = pos(['GK', 'GK', 'GK', 'DEF', 'MID', 'FWD', 'ANY', 'ANY']);
    players[0].group_rating = 8; players[1].group_rating = 7.5; players[2].group_rating = 6;
    const r = balanceTeams(players, { random: seeded(1) });
    expect([r.goalkeepers.A, r.goalkeepers.B].sort()).toEqual(['p0', 'p1']);
    expect([...r.A, ...r.B]).toContain('p2');
  });

  it('keepers playing outfield: nobody is fixed, even with GK players', () => {
    const withGk = pos(['GK', 'GK', 'DEF', 'MID', 'FWD', 'ANY']);
    const r = balanceTeams(withGk, { random: seeded(5), goalkeepers: 'rotating' });
    expect(r.goalkeepers).toEqual({ A: undefined, B: undefined });
    expect(r.explanation).toMatch(/playing outfield/);
    expect(randomTeams(withGk, 3, 'rotating').goalkeepers).toEqual({ A: undefined, B: undefined });
  });

  it('goal-keeping history alone does not make someone the keeper', () => {
    const players = make([7, 7, 7, 7, 7, 7]);
    players[0].gk_games = 6;
    expect(balanceTeams(players, { random: seeded(5) }).keeperCase).toBe(0);
  });

  it('random teams follow the same goalkeeper rules', () => {
    const one = pos(['GK', 'DEF', 'MID', 'FWD', 'ANY', 'ANY', 'ANY']);
    const r = randomTeams(one, 9);
    expect(r.goalkeepers.A).toBe('p0');
    expect(r.B).toHaveLength(4);
    expect(r.explanation).toMatch(/other team rotates/);
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
